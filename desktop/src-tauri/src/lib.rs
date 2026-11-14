// YourPDF Desktop — Tauri core.
//
// Runtime contract:
//   1. pick a random per-launch token
//   2. spawn the FastAPI sidecar and wait for `YOURPDF_PORT <port>` on stdout
//   3. create the window, injecting the loopback origin + token as globals BEFORE any
//      page script runs (the UI is served from the Tauri origin, so the API is
//      cross-origin here — hence CORS_ORIGINS + the injected base URL)
//   4. on exit, tree-kill the sidecar: a plain kill orphans the gs/tesseract/soffice
//      grandchildren that hold tmp file locks
use std::error::Error;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

const APP_TITLE: &str = "YourPDF Desktop";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PORT_TIMEOUT: Duration = Duration::from_secs(60);
const HISTORY_LIMIT: usize = 200;

/// Exposes `window.yourpdf` to the webview from the injected bridge script.
const BRIDGE_JS: &str = include_str!("bridge.js");

struct AppState {
    pid: Mutex<u32>,
    startup_toggle: Mutex<Option<CheckMenuItem<Wry>>>,
    zoom: Mutex<f64>,
}

fn random_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

// ---------------------------------------------------------------- persisted state

#[derive(Serialize, Deserialize, Clone, Default)]
struct HistoryEntry {
    name: String,
    path: String,
    dir: String,
    size: u64,
    at: String,
    #[serde(default)]
    exists: bool,
}

#[derive(Serialize)]
struct License {
    name: String,
    text: String,
}

fn data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn config_file(app: &AppHandle) -> PathBuf {
    data_dir(app).join("config.json")
}

fn config_bool(app: &AppHandle, key: &str, fallback: bool) -> bool {
    let cfg: serde_json::Value = read_json(&config_file(app));
    cfg.get(key).and_then(|v| v.as_bool()).unwrap_or(fallback)
}

fn set_config_bool(app: &AppHandle, key: &str, value: bool) {
    let mut cfg: serde_json::Value = read_json(&config_file(app));
    if !cfg.is_object() {
        cfg = serde_json::json!({});
    }
    cfg[key] = serde_json::Value::Bool(value);
    write_json(&config_file(app), &cfg);
}

fn history_file(app: &AppHandle) -> PathBuf {
    data_dir(app).join("downloads.json")
}

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_json<T: Serialize>(path: &Path, value: &T) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(value) {
        let _ = std::fs::write(path, text);
    }
}

fn download_dir(app: &AppHandle) -> PathBuf {
    let cfg: serde_json::Value = read_json(&config_file(app));
    if let Some(dir) = cfg.get("downloadDir").and_then(|v| v.as_str()) {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    app.path()
        .download_dir()
        .unwrap_or_else(|_| data_dir(app))
}

fn read_history(app: &AppHandle) -> Vec<HistoryEntry> {
    read_json(&history_file(app))
}

/// Newest first, de-duplicated by path, capped. Returns the full list.
fn push_history(app: &AppHandle, entry: HistoryEntry) -> Vec<HistoryEntry> {
    let mut items: Vec<HistoryEntry> = read_history(app)
        .into_iter()
        .filter(|i| i.path != entry.path)
        .collect();
    items.insert(0, entry);
    items.truncate(HISTORY_LIMIT);
    write_json(&history_file(app), &items);
    items
}

// ---------------------------------------------------------------- save channel

/// The download hint is a label ("Download Word File"), not a filename: drop the leading
/// verb, any extension it guessed, and characters Windows rejects.
fn sanitize_hint(hint: &str) -> String {
    let mut base = hint.trim().to_string();
    let lower = base.to_lowercase();
    if let Some(rest) = lower.strip_prefix("download ") {
        base = base[base.len() - rest.len()..].to_string();
    }
    base = base
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    for ext in [
        ".pdf", ".docx", ".pptx", ".xlsx", ".zip", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif",
        ".bmp", ".tiff", ".txt", ".csv", ".json",
    ] {
        if base.to_lowercase().ends_with(ext) {
            let cut = base.len() - ext.len();
            base.truncate(cut);
            break;
        }
    }
    let trimmed = base.trim().to_string();
    if trimmed.is_empty() {
        "yourpdf-output".to_string()
    } else {
        trimmed
    }
}

fn clean_extension(ext: &str) -> String {
    let candidate = ext.trim().to_lowercase();
    let ok = candidate.starts_with('.')
        && (2..=5).contains(&(candidate.len().saturating_sub(1)))
        && candidate[1..].chars().all(|c| c.is_ascii_alphanumeric());
    if ok {
        candidate
    } else {
        ".pdf".to_string()
    }
}

#[tauri::command]
fn save_blob(app: AppHandle, request: Request<'_>) -> Result<HistoryEntry, String> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string()
    };
    let hint = header("x-hint");
    let ext = header("x-ext");

    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("save_blob expects raw bytes as the invoke body".into()),
    };

    let dir = download_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;

    let base = sanitize_hint(&hint);
    let extension = clean_extension(&ext);
    let mut target = dir.join(format!("{base}{extension}"));
    let mut n = 2;
    while target.exists() && n < 100 {
        target = dir.join(format!("{base} ({n}){extension}"));
        n += 1;
    }

    std::fs::write(&target, &bytes).map_err(|e| format!("cannot write {}: {e}", target.display()))?;
    let size = bytes.len() as u64;

    let entry = HistoryEntry {
        name: target
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| base.clone()),
        path: target.to_string_lossy().to_string(),
        dir: dir.to_string_lossy().to_string(),
        size,
        at: chrono::Local::now().to_rfc3339(),
        exists: true,
    };

    push_history(&app, entry.clone());
    // The page renders the toast off this broadcast, so it works on any tool page.
    let _ = app.emit("yourpdf:saved", &entry);

    let _ = app
        .notification()
        .builder()
        .title("Saved to Downloads")
        .body(&entry.name)
        .show();

    Ok(entry)
}

// ---------------------------------------------------------------- downloads API

#[tauri::command]
fn downloads_list(app: AppHandle) -> Vec<HistoryEntry> {
    read_history(&app)
        .into_iter()
        .map(|mut e| {
            e.exists = Path::new(&e.path).exists();
            e
        })
        .collect()
}

#[tauri::command]
fn downloads_dir(app: AppHandle) -> String {
    download_dir(&app).to_string_lossy().to_string()
}

#[tauri::command]
fn downloads_open(target: String) -> Result<(), String> {
    if !Path::new(&target).exists() {
        return Err("This file has been moved or deleted.".into());
    }
    Command::new("explorer")
        .arg(&target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn downloads_reveal(app: AppHandle, target: String) -> Result<(), String> {
    if Path::new(&target).exists() {
        Command::new("explorer")
            .arg(format!("/select,{target}"))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    } else {
        Command::new("explorer")
            .arg(download_dir(&app))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn downloads_remove(app: AppHandle, target: String) -> Result<(), String> {
    let items: Vec<HistoryEntry> = read_history(&app)
        .into_iter()
        .filter(|e| e.path != target)
        .collect();
    write_json(&history_file(&app), &items);
    Ok(())
}

#[tauri::command]
fn downloads_clear(app: AppHandle) {
    write_json(&history_file(&app), &Vec::<HistoryEntry>::new());
}

#[tauri::command]
async fn downloads_choose_dir(app: AppHandle) -> Result<Option<String>, String> {
    let current = download_dir(&app);
    let picked = app
        .dialog()
        .file()
        .set_title("Where should downloads be saved?")
        .set_directory(&current)
        .blocking_pick_folder();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let dir = file_path.into_path().map_err(|e| e.to_string())?;
    let mut cfg: serde_json::Value = read_json(&config_file(&app));
    if !cfg.is_object() {
        cfg = serde_json::json!({});
    }
    cfg["downloadDir"] = serde_json::Value::String(dir.to_string_lossy().to_string());
    write_json(&config_file(&app), &cfg);
    Ok(Some(dir.to_string_lossy().to_string()))
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn app_licenses(app: AppHandle) -> Vec<License> {
    let dir = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../licenses")
    } else {
        app.path()
            .resource_dir()
            .map(|r| r.join("licenses"))
            .unwrap_or_default()
    };

    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        if !(lower.ends_with(".txt") || lower.ends_with(".md")) {
            continue;
        }
        if let Ok(text) = std::fs::read_to_string(entry.path()) {
            out.push(License {
                name,
                text: text.chars().take(20_000).collect(),
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

// ---------------------------------------------------------------- windows

fn downloads_window(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    if let Some(win) = app.get_webview_window("downloads") {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "downloads", WebviewUrl::App("downloads.html".into()))
        .title(format!("Downloads — {APP_TITLE}"))
        .inner_size(800.0, 580.0)
        .min_inner_size(620.0, 420.0)
        .initialization_script(BRIDGE_JS)
        .build()?;
    Ok(())
}

// Async on purpose: sync commands run on the main thread, and building a webview window
// from there deadlocks the pending IPC response — after which every later invoke hangs.
#[tauri::command]
async fn show_downloads(app: AppHandle) -> Result<(), String> {
    downloads_window(&app).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- updates

#[derive(Serialize)]
struct UpdateStatus {
    current: String,
    available: bool,
    version: Option<String>,
    notes: Option<String>,
}

async fn find_update(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let mut builder = app.updater_builder();

    // Test hook: point the updater at a local manifest to exercise the real flow.
    // Safe to keep — the Ed25519 public key is compiled in, so a redirected manifest
    // still cannot install anything we did not sign.
    if let Ok(endpoint) = std::env::var("YOURPDF_UPDATE_ENDPOINT") {
        let url: tauri::Url = endpoint
            .parse()
            .map_err(|e| format!("invalid YOURPDF_UPDATE_ENDPOINT: {e}"))?;
        builder = builder
            .endpoints(vec![url])
            .map_err(|e| format!("invalid YOURPDF_UPDATE_ENDPOINT: {e}"))?;
    }

    let updater = builder.build().map_err(|e| e.to_string())?;
    updater.check().await.map_err(|e| e.to_string())
}

async fn download_and_install(
    app: &AppHandle,
    update: tauri_plugin_updater::Update,
) -> Result<(), String> {
    log_line(app, &format!("update: downloading {}", update.version));
    // Download FIRST: if it fails the app stays fully usable (sidecar still running).
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    // The updater hands off by calling std::process::exit(), which BYPASSES RunEvent::Exit —
    // so the normal shutdown hook never runs and the sidecar keeps its exe/DLLs locked.
    // NSIS then fails partway through: the main binary is replaced but the uninstaller and
    // registry entries are not, and the app never comes back. Stop the tree here instead.
    let pid = { *app.state::<AppState>().pid.lock().unwrap() };
    if pid != 0 {
        kill_tree(pid);
        *app.state::<AppState>().pid.lock().unwrap() = 0;
        log_line(app, "update: sidecar stopped before install");
        // Give Windows a moment to release the handles before NSIS overwrites them.
        std::thread::sleep(Duration::from_millis(800));
    }

    // Verifies the signature, launches the installer (/P /UPDATE /R) and exits this process;
    // the installer relaunches the new version. Never returns on success.
    update.install(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<UpdateStatus, String> {
    let current = app.package_info().version.to_string();
    Ok(match find_update(&app).await? {
        Some(update) => UpdateStatus {
            current,
            available: true,
            version: Some(update.version.clone()),
            notes: update.body.clone(),
        },
        None => UpdateStatus {
            current,
            available: false,
            version: None,
            notes: None,
        },
    })
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let Some(update) = find_update(&app).await? else {
        return Ok(());
    };
    download_and_install(&app, update).await?;
    // Install finished; the new binary replaces the old on restart.
    app.restart();
}

/// Blocking variant for menu items and the startup check (both run off the main thread).
fn manual_update_check(app: AppHandle) {
    match tauri::async_runtime::block_on(find_update(&app)) {
        Ok(Some(update)) => {
            let current = app.package_info().version.to_string();
            let notes = update.body.clone().unwrap_or_default();
            let prompt = if notes.trim().is_empty() {
                format!(
                    "Version {} is available (you have {}).\n\nInstall it now? The app will restart.",
                    update.version, current
                )
            } else {
                format!(
                    "Version {} is available (you have {}).\n\n{}\n\nInstall it now? The app will restart.",
                    update.version, current, notes
                )
            };
            if confirm(&prompt) {
                match tauri::async_runtime::block_on(download_and_install(&app, update)) {
                    Ok(()) => app.restart(),
                    Err(e) => show_error(&format!("The update could not be installed.\n\n{e}")),
                }
            }
        }
        Ok(None) => info(&format!("You're up to date ({}).", app.package_info().version)),
        Err(e) => show_error(&format!("Couldn't check for updates.\n\n{e}")),
    }
}

/// Opt-out: the check only fetches `latest.json`; no telemetry and no file data is sent.
fn startup_update_check(app: AppHandle) {
    if !config_bool(&app, "checkUpdatesOnStartup", true) {
        log_line(&app, "update: startup check disabled");
        return;
    }
    std::thread::spawn(move || {
        // Don't compete with the sidecar handshake or first paint.
        std::thread::sleep(Duration::from_secs(8));
        match tauri::async_runtime::block_on(find_update(&app)) {
            Ok(Some(update)) => {
                log_line(&app, &format!("update: {} available", update.version));
                let _ = app
                    .notification()
                    .builder()
                    .title("Update available")
                    .body(format!("YourPDF Desktop {} is ready to install", update.version))
                    .show();
                manual_update_check(app);
            }
            Ok(None) => log_line(&app, "update: up to date"),
            Err(e) => log_line(&app, &format!("update: check failed — {e}")),
        }
    });
}

// ---------------------------------------------------------------- menu

fn build_menu(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let startup_on = config_bool(app, "checkUpdatesOnStartup", true);

    let downloads = MenuItem::with_id(app, "downloads", "Downloads…", true, Some("CmdOrCtrl+J"))?;
    let open_dl = MenuItem::with_id(
        app,
        "open_downloads_folder",
        "Open Downloads Folder",
        true,
        None::<&str>,
    )?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[&downloads, &open_dl, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let zoom_in = MenuItem::with_id(app, "zoom_in", "Zoom In", true, Some("CmdOrCtrl+Plus"))?;
    let zoom_out = MenuItem::with_id(app, "zoom_out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset = MenuItem::with_id(app, "zoom_reset", "Actual Size", true, Some("CmdOrCtrl+0"))?;
    let view = Submenu::with_items(app, "View", true, &[&reload, &zoom_in, &zoom_out, &zoom_reset])?;

    let check = MenuItem::with_id(app, "check_updates", "Check for Updates…", true, None::<&str>)?;
    let startup = CheckMenuItem::with_id(
        app,
        "updates_on_startup",
        "Check for updates on startup",
        true,
        startup_on,
        None::<&str>,
    )?;
    let logs = MenuItem::with_id(app, "open_logs", "Open Log Folder", true, None::<&str>)?;
    let about = MenuItem::with_id(
        app,
        "about",
        "About YourPDF Desktop",
        true,
        None::<&str>,
    )?;
    let help = Submenu::with_items(
        app,
        "Help",
        true,
        &[&check, &startup, &PredefinedMenuItem::separator(app)?, &logs, &about],
    )?;

    let menu = Menu::with_items(app, &[&file, &view, &help])?;
    app.set_menu(menu)?;
    *app.state::<AppState>().startup_toggle.lock().unwrap() = Some(startup);
    Ok(())
}

// ---------------------------------------------------------------- sidecar

/// Path layout differs between `tauri dev` and a bundled app.
struct Layout {
    program: PathBuf,
    args: Vec<String>,
    bin: PathBuf,
    tmp: PathBuf,
}

fn layout(app: &AppHandle) -> Result<Layout, Box<dyn Error>> {
    // env!("CARGO_MANIFEST_DIR") is desktop/src-tauri at compile time, which only holds for
    // a dev build; a packaged app must resolve everything from the resource dir.
    let dev = cfg!(debug_assertions);
    let desktop = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let tmp = data_dir(app).join("tmp");
    std::fs::create_dir_all(&tmp)?;

    let (program, args, bin) = if dev {
        let frozen = desktop.join("build/sidecar/yourpdf-backend/yourpdf-backend.exe");
        if frozen.exists() {
            (frozen, Vec::new(), desktop.join("bin"))
        } else {
            // Dev fallback: run the source sidecar in the venv.
            let python = desktop.join("../myenv/Scripts/python.exe");
            let serve = desktop.join("sidecar/serve.py");
            if !python.exists() {
                return Err(format!("no frozen sidecar and no python at {}", python.display()).into());
            }
            (python, vec![serve.to_string_lossy().to_string()], desktop.join("bin"))
        }
    } else {
        let resource = app.path().resource_dir()?;
        let frozen = resource.join("sidecar/yourpdf-backend/yourpdf-backend.exe");
        if !frozen.exists() {
            return Err(format!("sidecar missing at {}", frozen.display()).into());
        }
        (frozen, Vec::new(), resource.join("bin"))
    };

    Ok(Layout { program, args, bin, tmp })
}

/// Spawns the sidecar and returns (port, pid).
fn start_sidecar(app: &AppHandle, layout: &Layout, token: &str) -> Result<(u16, u32), Box<dyn Error>> {
    // The executables live below each vendor tree (gs/bin, poppler/Library/bin,
    // tesseract at its root); adding only bin/ leaves gs and poppler invisible and the
    // backend silently falls back to whatever the user happened to install.
    let candidates = [
        layout.bin.join("gs/bin"),
        layout.bin.join("tesseract"),
        layout.bin.join("poppler/Library/bin"),
        layout.bin.join("poppler/bin"),
    ];
    let mut path_parts: Vec<String> = candidates
        .iter()
        .filter(|p| p.exists())
        .map(|p| plain(p))
        .collect();
    if let Ok(existing) = std::env::var("PATH") {
        path_parts.push(existing);
    }

    let mut cmd = Command::new(plain(&layout.program));
    cmd.args(layout.args.iter().map(|a| plain(Path::new(a))))
        .env("YOURPDF_TOKEN", token)
        .env("YOURPDF_TMP", plain(&layout.tmp))
        // Tauri serves the export itself, so the sidecar stays API-only.
        .env("YOURPDF_SERVE_STATIC", "0")
        // The UI origin is tauri.localhost, not the loopback port.
        .env("CORS_ORIGINS", "http://tauri.localhost")
        .env("PATH", path_parts.join(";"))
        .env("TESSDATA_PREFIX", plain(&layout.bin.join("tesseract/tessdata")))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("cannot spawn {}: {e}", layout.program.display()))?;
    let pid = child.id();

    let stdout = child.stdout.take().ok_or("sidecar has no stdout")?;
    if let Some(stderr) = child.stderr.take() {
        let log_app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                log_line(&log_app, &format!("[sidecar:err] {line}"));
            }
        });
    }

    // Read the port on a thread so the main thread can time out instead of hanging, and so
    // a sidecar that dies before the handshake fails fast instead of waiting out 60s.
    // CRITICAL: keep reading after the handshake. Returning here drops the read end of the
    // pipe, and the sidecar's next print(flush=True) fails with OSError EINVAL — which
    // aborts the HTTP response in flight (Cancel died mid-request this way).
    let (tx, rx) = mpsc::channel::<Result<u16, String>>();
    let log_app = app.clone();
    std::thread::spawn(move || {
        let mut announced = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            log_line(&log_app, &format!("[sidecar] {line}"));
            if announced {
                continue;
            }
            if let Some(rest) = line.strip_prefix("YOURPDF_PORT ") {
                if let Ok(port) = rest.trim().parse::<u16>() {
                    announced = true;
                    let _ = tx.send(Ok(port));
                }
            }
        }
        if !announced {
            let _ = tx.send(Err(String::from(
                "the sidecar exited before reporting a port (see the log above)",
            )));
        }
    });

    let port = rx
        .recv_timeout(PORT_TIMEOUT)
        .map_err(|_| String::from("the sidecar did not report a port within 60s"))??;

    Ok((port, pid))
}

/// `child.kill()` leaves gs/tesseract/soffice grandchildren holding tmp locks.
fn kill_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).status();
    }
}

// ---------------------------------------------------------------- logging + dialogs

fn log_dir(app: &AppHandle) -> PathBuf {
    data_dir(app).join("logs")
}

/// Windows path canonicalization (and Tauri's resource lookup) can return a verbatim path
/// such as `\\?\C:\...`. Never hand those to the sidecar: extended-length paths skip the
/// slash normalization Win32 normally does, so any tool that appends `/` breaks. Tesseract
/// appends `tessdata/` to its data dir and then fails with
/// "recursive directory iterator cannot open directory".
fn plain(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        text.to_string()
    }
}

/// Logs to both stderr and `logs/desktop.log` (Help → Open Log Folder reveals it).
fn log_line(app: &AppHandle, message: &str) {
    let line = format!("{} {message}\n", chrono::Local::now().to_rfc3339());
    eprint!("{line}");
    let dir = log_dir(app);
    let _ = std::fs::create_dir_all(&dir);
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("desktop.log"))
    {
        let _ = file.write_all(line.as_bytes());
    }
}

const MB_TOPMOST: u32 = 0x0004_0000;

#[cfg(windows)]
fn message_box(message: &str, flags: u32) -> i32 {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let wide = |s: &str| -> Vec<u16> { OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect() };

    unsafe extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, utype: u32) -> i32;
    }

    let text = wide(message);
    let caption = wide(APP_TITLE);
    unsafe { MessageBoxW(0, text.as_ptr(), caption.as_ptr(), flags | MB_TOPMOST) }
}

/// A release build runs with no console, so a bare panic would look like "the app just
/// doesn't open". Show a native error dialog.
#[cfg(windows)]
fn show_error(message: &str) {
    message_box(message, 0x10 /* MB_ICONERROR */);
}

#[cfg(windows)]
fn info(message: &str) {
    message_box(message, 0x40 /* MB_ICONINFORMATION */);
}

/// MB_YESNO + warning icon; MessageBoxW returns IDYES (6).
#[cfg(windows)]
fn confirm(message: &str) -> bool {
    message_box(message, 0x04 /* MB_YESNO */ | 0x30 /* MB_ICONWARNING */) == 6
}

#[cfg(not(windows))]
fn show_error(message: &str) {
    eprintln!("{APP_TITLE}: {message}");
}

#[cfg(not(windows))]
fn info(message: &str) {
    eprintln!("{APP_TITLE}: {message}");
}

#[cfg(not(windows))]
fn confirm(message: &str) -> bool {
    eprintln!("{APP_TITLE}: {message}");
    false
}

fn setup_window(app: &AppHandle, token: &str) -> Result<(), Box<dyn Error>> {
    let layout = layout(app)?;
    log_line(app, &format!("sidecar: {} {:?}", plain(&layout.program), layout.args));
    let (port, pid) = start_sidecar(app, &layout, token)?;
    log_line(app, &format!("sidecar ready on {port} (pid {pid})"));

    // Record the pid before the window exists, so a failure below still gets cleaned up.
    *app.state::<AppState>().pid.lock().unwrap() = pid;

    let globals = format!(
        "window.__YOURPDF_API__ = {}; window.__YOURPDF_TOKEN__ = {};",
        serde_json::to_string(&format!("http://127.0.0.1:{port}"))?,
        serde_json::to_string(token)?
    );

    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title(APP_TITLE)
        .inner_size(1280.0, 800.0)
        .min_inner_size(1024.0, 700.0)
        // Order matters: the globals must exist before the bridge reads them.
        .initialization_script(&globals)
        .initialization_script(BRIDGE_JS)
        .build()?;

    build_menu(app)?;
    startup_update_check(app.clone());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = random_token();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            pid: Mutex::new(0),
            startup_toggle: Mutex::new(None),
            zoom: Mutex::new(1.0),
        })
        .invoke_handler(tauri::generate_handler![
            save_blob,
            downloads_list,
            downloads_dir,
            downloads_open,
            downloads_reveal,
            downloads_remove,
            downloads_clear,
            downloads_choose_dir,
            show_downloads,
            app_version,
            app_licenses,
            check_update,
            install_update,
        ])
        .setup({
            let token = token.clone();
            move |app| {
                let handle = app.handle().clone();
                if let Err(err) = setup_window(&handle, &token) {
                    eprintln!("startup failed: {err}");
                    show_error(&format!(
                        "YourPDF could not start.\n\n{err}\n\n\
                         Nothing was uploaded — this is a local startup problem."
                    ));
                    handle.exit(1);
                }
                Ok(())
            }
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            match id.as_str() {
                "downloads" => {
                    // Off the main thread: building a webview window must not block the
                    // event loop (the same reason show_downloads is an async command).
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        if let Err(e) = downloads_window(&handle) {
                            log_line(&handle, &format!("downloads window failed: {e}"));
                        }
                    });
                }
                "open_downloads_folder" => {
                    let _ = Command::new("explorer").arg(download_dir(app)).spawn();
                }
                "open_logs" => {
                    let dir = log_dir(app);
                    let _ = std::fs::create_dir_all(&dir);
                    let _ = Command::new("explorer").arg(dir).spawn();
                }
                "reload" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.eval("location.reload()");
                    }
                }
                "zoom_in" | "zoom_out" | "zoom_reset" => {
                    let state = app.state::<AppState>();
                    let mut zoom = state.zoom.lock().unwrap();
                    *zoom = match id.as_str() {
                        "zoom_in" => (*zoom + 0.1).min(3.0),
                        "zoom_out" => (*zoom - 0.1).max(0.5),
                        _ => 1.0,
                    };
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.set_zoom(*zoom);
                    }
                }
                "check_updates" => {
                    let handle = app.clone();
                    std::thread::spawn(move || manual_update_check(handle));
                }
                "updates_on_startup" => {
                    let enabled = !config_bool(app, "checkUpdatesOnStartup", true);
                    set_config_bool(app, "checkUpdatesOnStartup", enabled);
                    log_line(app, &format!("update: startup check → {enabled}"));
                    if let Some(item) = app.state::<AppState>().startup_toggle.lock().unwrap().as_ref() {
                        let _ = item.set_checked(enabled);
                    }
                }
                "about" => {
                    info(&format!(
                        "{APP_TITLE} {}\n\nFiles are processed on this machine only. Nothing is uploaded.\n\n\
                         Bundled third-party: Ghostscript (AGPL-3.0), Tesseract (Apache-2.0), Poppler (GPL-2.0).\n\
                         Source offers: see licenses/ in the install directory.",
                        app.package_info().version
                    ));
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build YourPDF Desktop");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            let pid = *handle.state::<AppState>().pid.lock().unwrap();
            kill_tree(pid);
        }
    });
}
