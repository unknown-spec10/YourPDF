// YourPDF Desktop — Electron main process.
// Owns: window, sidecar lifecycle (spawn → port handshake → tree kill), the save channel,
// logs, and the menu. Nothing here touches the web deployment.
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron");
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
ipcMain.handle("save-blob", async (_ev, { bytes, hint }) => {
  const dirty = String(hint || "yourpdf-output.pdf").replace(/[\\/:*?"<>|]+/g, "_").trim();
  const name = /\.[a-z0-9]{2,5}$/i.test(dirty) ? dirty : `${dirty || "yourpdf-output"}.pdf`;
  const target = path.join(app.getPath("downloads"), name);
  fs.writeFileSync(target, Buffer.from(bytes));
  const size = fs.statSync(target).size;
  log(`saved ${target} (${size} bytes)`);
  return { path: target, size };
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
        { label: "Open Output Folder", click: () => shell.openPath(app.getPath("downloads")) },
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
