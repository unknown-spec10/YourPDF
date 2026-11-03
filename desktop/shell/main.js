// YourPDF Desktop — Electron main process.
// Owns: window, sidecar lifecycle (spawn → port handshake → tree kill), the save channel,
// logs, and the menu. Nothing here touches the web deployment.
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, session, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const IS_DEV = !app.isPackaged;
const APP_NAME = "YourPDF Desktop";
const RES_ROOT = IS_DEV ? path.join(__dirname, "..", "..") : process.resourcesPath;
// Dev resources (bin/, licenses/) live in desktop/; packaged ones sit next to resources/.
const DEV_ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(app.getPath("userData"), "logs");
const TMP_DIR = path.join(app.getPath("userData"), "tmp");
const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");
const HISTORY_FILE = path.join(app.getPath("userData"), "downloads.json");

// ---------------------------------------------------------------- config + download history
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    log(`config write failed: ${e.message}`);
  }
}

function downloadDir() {
  const configured = readJson(CONFIG_FILE, {}).downloadDir;
  return configured || app.getPath("downloads");
}

function readHistory() {
  const items = readJson(HISTORY_FILE, []);
  return Array.isArray(items) ? items : [];
}

function addHistory(entry) {
  const items = [entry, ...readHistory().filter((i) => i.path !== entry.path)].slice(0, 200);
  writeJson(HISTORY_FILE, items);
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("yourpdf:saved", entry);
  }
  return items;
}

let win = null;
let sidecar = null;
let sidecarPort = null;
const TOKEN = crypto.randomBytes(24).toString("base64url");

// ---------------------------------------------------------------- logging
fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, "desktop.log");
const log = (...parts) => {
  const line = `${new Date().toISOString()} ${parts.join(" ")}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    /* logging must never break the app */
  }
  process.stdout.write(line);
};

// ---------------------------------------------------------------- save channel
ipcMain.handle("save-blob", async (_ev, { bytes, hint, ext }) => {
  const dir = downloadDir();

  // The link text is a label ("Download Word File"), not a filename: drop the leading verb and
  // any extension it guessed, then append the extension implied by the response MIME type.
  let base = String(hint || "")
    .replace(/^download\s+/i, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();
  base = base
    .replace(/\.(pdf|docx|pptx|xlsx|zip|png|jpe?g|webp|svg|gif|bmp|tiff|txt|csv|json)$/i, "")
    .trim();
  if (!base) base = "yourpdf-output";

  const extension = ext && /^\.[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : ".pdf";
  let target = path.join(dir, `${base}${extension}`);
  for (let n = 2; fs.existsSync(target) && n < 100; n += 1) {
    target = path.join(dir, `${base} (${n})${extension}`);
  }

  fs.writeFileSync(target, Buffer.from(bytes));
  const size = fs.statSync(target).size;
  log(`saved ${target} (${size} bytes)`);

  const entry = {
    name: path.basename(target),
    path: target,
    dir,
    size,
    at: new Date().toISOString(),
  };
  // History + broadcast: the page renders a toast with Open / Show in folder / All downloads,
  // and the Downloads window refreshes from the same event.
  addHistory(entry);

  if (Notification.isSupported()) {
    const note = new Notification({ title: "Saved to Downloads", body: entry.name });
    note.on("click", () => shell.showItemInFolder(target));
    note.show();
  }
  return { path: target, size, name: entry.name, dir };
});

// ---------------------------------------------------------------- downloads window
let downloadsWin = null;

function showDownloads() {
  if (downloadsWin && !downloadsWin.isDestroyed()) {
    downloadsWin.show();
    downloadsWin.focus();
    return downloadsWin;
  }
  downloadsWin = new BrowserWindow({
    width: 800,
    height: 580,
    minWidth: 620,
    minHeight: 420,
    title: `Downloads — ${APP_NAME}`,
    backgroundColor: "#0b0b0f",
    parent: win || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  downloadsWin.loadFile(path.join(__dirname, "downloads.html"));
  downloadsWin.on("closed", () => {
    downloadsWin = null;
  });
  return downloadsWin;
}

ipcMain.handle("downloads:showWindow", () => {
  showDownloads();
  return true;
});

ipcMain.handle("downloads:list", () =>
  readHistory().map((entry) => ({ ...entry, exists: fs.existsSync(entry.path) }))
);

ipcMain.handle("downloads:open", async (_ev, target) => {
  if (!target || !fs.existsSync(target)) return { ok: false, error: "This file has been moved or deleted." };
  const problem = await shell.openPath(target);
  if (problem) log(`open failed for ${target}: ${problem}`);
  return { ok: !problem, error: problem || null };
});

ipcMain.handle("downloads:reveal", (_ev, target) => {
  if (target && fs.existsSync(target)) {
    shell.showItemInFolder(target);
    return { ok: true };
  }
  shell.openPath(downloadDir());
  return { ok: false, error: "File is gone; opened the downloads folder instead." };
});

ipcMain.handle("downloads:remove", (_ev, target) => {
  writeJson(HISTORY_FILE, readHistory().filter((entry) => entry.path !== target));
  return { ok: true };
});

ipcMain.handle("downloads:clear", () => {
  writeJson(HISTORY_FILE, []);
  return { ok: true };
});

ipcMain.handle("downloads:dir", () => downloadDir());

ipcMain.handle("downloads:chooseDir", async () => {
  const result = await dialog.showOpenDialog(win || undefined, {
    title: "Where should downloads be saved?",
    defaultPath: downloadDir(),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths?.length) return { ok: false, dir: downloadDir() };
  const config = readJson(CONFIG_FILE, {});
  config.downloadDir = result.filePaths[0];
  writeJson(CONFIG_FILE, config);
  log(`download dir → ${config.downloadDir}`);
  return { ok: true, dir: config.downloadDir };
});

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:licenses", () => {
  const dir = IS_DEV ? path.join(DEV_ROOT, "licenses") : path.join(RES_ROOT, "licenses");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(txt|md)$/i.test(f))
      .map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), "utf8").slice(0, 20000) }));
  } catch {
    return [];
  }
});

// ---------------------------------------------------------------- sidecar
function sidecarCommand() {
  const candidates = [
    path.join(RES_ROOT, "sidecar", "yourpdf-backend.exe"), // packaged: extraResources → resources/sidecar
    path.join(RES_ROOT, "sidecar", "yourpdf-backend", "yourpdf-backend.exe"),
    path.join(RES_ROOT, "desktop", "build", "sidecar", "yourpdf-backend", "yourpdf-backend.exe"), // dev build
  ];
  for (const exe of candidates) {
    if (fs.existsSync(exe)) return { cmd: exe, args: [] };
  }

  const py = process.env.YOURPDF_PYTHON || path.join(RES_ROOT, "myenv", "Scripts", "python.exe");
  const script = path.join(RES_ROOT, "desktop", "sidecar", "serve.py");
  return { cmd: py, args: [script] };
}

function bundledBinDirs() {
  const bin = IS_DEV ? path.join(DEV_ROOT, "bin") : path.join(RES_ROOT, "bin");
  // The executables sit below each vendor tree: gs/bin, poppler/Library/bin,
  // tesseract at its root. Putting the *parents* on PATH leaves gs and poppler
  // invisible, so the app silently falls back to whatever the user installed.
  const candidates = [
    path.join(bin, "gs", "bin"),
    path.join(bin, "tesseract"),
    path.join(bin, "poppler", "Library", "bin"),
    path.join(bin, "poppler", "bin"),
  ];
  return candidates.filter((p) => fs.existsSync(p));
}

function startSidecar() {
  const { cmd, args } = sidecarCommand();
  const bins = bundledBinDirs();
  const env = {
    ...process.env,
    YOURPDF_TOKEN: TOKEN,
    YOURPDF_TMP: TMP_DIR,
    YOURPDF_OUT: IS_DEV ? path.join(RES_ROOT, "frontend", "out") : path.join(RES_ROOT, "frontend"),
    PATH: [...bins, process.env.PATH || ""].join(path.delimiter),
    TESSDATA_PREFIX: path.join(IS_DEV ? DEV_ROOT : RES_ROOT, "bin", "tesseract", "tessdata"),
  };

  log(`sidecar: ${cmd} ${args.join(" ")}`);
  sidecar = spawn(cmd, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sidecar did not report a port in 60s")), 60000);

    sidecar.stdout.setEncoding("utf8");
    sidecar.stdout.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        log(`[sidecar] ${line}`);
        const m = line.match(/YOURPDF_PORT (\d+)/);
        if (m && !sidecarPort) {
          sidecarPort = Number(m[1]);
          clearTimeout(timer);
          resolve(sidecarPort);
        }
      }
    });
    sidecar.stderr.setEncoding("utf8");
    sidecar.stderr.on("data", (c) => log(`[sidecar:err] ${c.trimEnd()}`));
    sidecar.on("exit", (code) => {
      log(`sidecar exited ${code}`);
      sidecar = null;
      if (!sidecarPort) {
        clearTimeout(timer);
        reject(new Error(`sidecar exited early (${code})`));
      }
    });
  });
}

function stopSidecar() {
  if (!sidecar || !sidecar.pid) return;
  // child.kill() leaves gs/tesseract/soffice grandchildren holding tmp locks.
  try {
    spawnSync("taskkill", ["/PID", String(sidecar.pid), "/T", "/F"], { windowsHide: true });
    log(`sidecar tree killed (pid ${sidecar.pid})`);
  } catch (e) {
    log(`sidecar kill failed: ${e.message}`);
  }
  sidecar = null;
}

// ---------------------------------------------------------------- auto-update
// electron-updater reads latest.yml from the GitHub release named by `build.publish` in
// package.json. Unsigned builds still update (the installer is re-run silently); signing only
// affects the SmartScreen prompt, not the update mechanism.
const UPDATES_ENABLED = app.isPackaged && process.env.YOURPDF_NO_UPDATE !== "1";

function setupAutoUpdater() {
  if (!UPDATES_ENABLED) {
    log("updates: disabled (dev build or YOURPDF_NO_UPDATE=1)");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => log(`[update] ${m}`),
    warn: (m) => log(`[update:warn] ${m}`),
    error: (m) => log(`[update:error] ${m}`),
    debug: (m) => log(`[update:debug] ${m}`),
  };

  autoUpdater.on("checking-for-update", () => log("update: checking"));
  autoUpdater.on("update-not-available", (i) => log(`update: up to date (${i?.version})`));
  autoUpdater.on("update-available", (i) => {
    log(`update: ${i?.version} available, downloading`);
    if (win && !win.isDestroyed()) {
      dialog
        .showMessageBox(win, {
          type: "info",
          title: "Update available",
          message: `YourPDF Desktop ${i?.version} is downloading in the background.`,
          detail: "You can keep working. You'll be asked to restart when it's ready.",
          buttons: ["OK"],
        })
        .catch(() => {});
    }
  });
  autoUpdater.on("error", (e) => log(`update: failed — ${e?.message || e}`));
  autoUpdater.on("update-downloaded", async (i) => {
    log(`update: ${i?.version} downloaded`);
    if (!win || win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "Update ready",
      message: `YourPDF Desktop ${i?.version} is ready to install.`,
      detail: "Restart now to apply it. Your files are untouched.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      stopSidecar();
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // Check a few seconds after launch so startup never waits on the network.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => log(`update: check failed — ${e?.message || e}`));
  }, 8000);
}

async function checkForUpdatesManually() {
  if (!UPDATES_ENABLED) {
    await dialog.showMessageBox({
      type: "info",
      title: "Updates",
      message: "Updates are only checked in the installed app.",
      detail: `This build runs from ${process.execPath}.`,
    });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) throw new Error("no update metadata");
    const latest = result.updateInfo.version;
    if (latest === app.getVersion()) {
      await dialog.showMessageBox({ type: "info", title: "Updates", message: `You're up to date (${latest}).` });
    }
  } catch (e) {
    log(`update: manual check failed — ${e?.message || e}`);
    await dialog.showMessageBox({
      type: "warning",
      title: "Updates",
      message: "Couldn't check for updates.",
      detail: `${e?.message || e}\n\nCheck your connection, then try again. Logs: ${LOG_DIR}`,
    });
  }
}

// ---------------------------------------------------------------- window
function createWindow(port) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0b0b0f",
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Attach the loopback token to every request at the session level, so the page never has to
  // carry it (no ?t= in the URL, no risk of a tool page loading before its JS captures it).
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`http://127.0.0.1:${port}/*`] },
    (details, callback) => {
      details.requestHeaders["X-YourPDF-Token"] = TOKEN;
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  win.loadURL(`http://127.0.0.1:${port}/`);
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("blob:")) e.preventDefault(); // never let a blob replace the app
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open File…",
          accelerator: "CmdOrCtrl+O",
          click: () => dialog.showOpenDialog({ properties: ["openFile"] }),
        },
        { label: "Downloads…", accelerator: "CmdOrCtrl+J", click: () => showDownloads() },
        { label: "Open Downloads Folder", click: () => shell.openPath(downloadDir()) },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "toggleDevTools" }],
    },
    {
      label: "Help",
      submenu: [
        { label: "Check for Updates…", click: () => checkForUpdatesManually() },
        { type: "separator" },
        {
          label: `About ${APP_NAME}`,
          click: () =>
            dialog.showMessageBox({
              type: "info",
              title: `About ${APP_NAME}`,
              message: `${APP_NAME} ${app.getVersion()}`,
              detail:
                "Files are processed on this machine only. Nothing is uploaded.\n\n" +
                "Bundled third-party: Ghostscript (AGPL-3.0), Tesseract (Apache-2.0), Poppler (GPL-2.0).\n" +
                "Source offers: see licenses/ in the install directory.",
            }),
        },
        { label: "Open Log Folder", click: () => shell.openPath(LOG_DIR) },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------- lifecycle
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.yourpdf.desktop");
    fs.mkdirSync(TMP_DIR, { recursive: true });

    // Crash debris makes the next launch slow and can hold file locks.
    for (const f of fs.readdirSync(TMP_DIR)) {
      try {
        fs.rmSync(path.join(TMP_DIR, f), { force: true, recursive: true });
      } catch {
        /* best effort */
      }
    }

    session.defaultSession.on("will-download", (_e, item) => {
      item.setSavePath(path.join(app.getPath("downloads"), item.getFilename()));
    });

    try {
      const port = await startSidecar();
      log(`sidecar ready on ${port}`);
      createWindow(port);
      setupAutoUpdater();
    } catch (e) {
      log(`startup failed: ${e.message}`);
      dialog.showErrorBox("YourPDF could not start", `${e.message}\n\nLogs: ${LOG_DIR}`);
      app.quit();
    }
  });

  app.on("before-quit", stopSidecar);
  app.on("window-all-closed", () => app.quit());
  process.on("exit", stopSidecar);
}
