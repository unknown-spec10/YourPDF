// Injected into every desktop window BEFORE any page script runs.
//
// It deliberately keeps the `window.yourpdf` contract the 27 tool pages already use, so the
// UI needs no changes. Two jobs:
//   1. Turn blob-URL result links into real files. The webview's own download path reports
//      success and writes nothing for those anchors, so we fetch the bytes and hand them to
//      the Rust save command.
//   2. Give the page `window.yourpdf` plus a save toast, so a download is visibly confirmed
//      and the user can open/reveal it without leaving the tool page.
(() => {
  const core = window.__TAURI__.core;
  const events = window.__TAURI__.event;
  if (!core) {
    console.error("yourpdf: Tauri core unavailable; bridge disabled");
    return;
  }

  const EXT_BY_TYPE = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/zip": ".zip",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/json": ".json",
  };

  const extensionFor = (type) =>
    EXT_BY_TYPE[String(type || "").split(";")[0].trim().toLowerCase()] || "";

  window.yourpdf = {
    listDownloads: () => core.invoke("downloads_list"),
    open: (path) => core.invoke("downloads_open", { target: path }),
    reveal: (path) => core.invoke("downloads_reveal", { target: path }),
    remove: (path) => core.invoke("downloads_remove", { target: path }),
    clear: () => core.invoke("downloads_clear"),
    folder: () => core.invoke("downloads_dir"),
    chooseFolder: () => core.invoke("downloads_choose_dir"),
    showDownloads: () => core.invoke("show_downloads"),
    version: () => core.invoke("app_version"),
    licenses: () => core.invoke("app_licenses"),
  };

  function humanSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
  }

  function showToast(entry) {
    if (!document.body) return;
    document.getElementById("yourpdf-toast")?.remove();

    const wrap = document.createElement("div");
    wrap.id = "yourpdf-toast";
    wrap.setAttribute(
      "style",
      [
        "position:fixed",
        "right:20px",
        "bottom:20px",
        "z-index:2147483647",
        "max-width:380px",
        "padding:14px 16px",
        "border-radius:14px",
        "background:rgba(17,17,22,0.97)",
        "color:#f4f4f7",
        "font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif",
        "box-shadow:0 12px 32px rgba(0,0,0,0.45)",
        "border:1px solid rgba(255,255,255,0.12)",
        "display:flex",
        "flex-direction:column",
        "gap:8px",
        "opacity:0",
        "transform:translateY(8px)",
        "transition:opacity .18s ease, transform .18s ease",
      ].join(";")
    );

    const title = document.createElement("div");
    title.textContent = "Saved to Downloads";
    title.setAttribute("style", "font-weight:650;letter-spacing:.01em");

    const name = document.createElement("div");
    name.textContent = `${entry.name}${entry.size ? ` · ${humanSize(entry.size)}` : ""}`;
    name.setAttribute("style", "color:#c8c8d4;word-break:break-all");

    const where = document.createElement("div");
    where.textContent = entry.dir || "";
    where.setAttribute("style", "color:#8b8b9c;font-size:11.5px;word-break:break-all");

    const row = document.createElement("div");
    row.setAttribute("style", "display:flex;gap:8px;margin-top:2px;flex-wrap:wrap");

    const mkButton = (label, onClick, primary) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute(
        "style",
        [
          "cursor:pointer",
          "border-radius:9px",
          "padding:7px 12px",
          "font:inherit",
          "font-weight:600",
          primary
            ? "background:#6d6dff;color:#fff;border:1px solid #6d6dff"
            : "background:transparent;color:#d8d8e2;border:1px solid rgba(255,255,255,0.18)",
        ].join(";")
      );
      b.addEventListener("click", onClick);
      return b;
    };

    row.appendChild(mkButton("Open", () => window.yourpdf.open(entry.path), true));
    row.appendChild(mkButton("Show in folder", () => window.yourpdf.reveal(entry.path), false));
    row.appendChild(mkButton("All downloads", () => window.yourpdf.showDownloads(), false));

    wrap.append(title, name, where, row);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.style.opacity = "1";
      wrap.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      wrap.style.opacity = "0";
      wrap.style.transform = "translateY(8px)";
      setTimeout(() => wrap.remove(), 220);
    }, 9000);
  }

  window.addEventListener(
    "click",
    async (ev) => {
      const anchor = ev.target && ev.target.closest ? ev.target.closest('a[href^="blob:"]') : null;
      if (!anchor) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        const res = await fetch(anchor.getAttribute("href"));
        const blob = await res.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const hint =
          anchor.getAttribute("download") ||
          anchor.getAttribute("data-filename") ||
          (anchor.textContent || "").trim();
        const ext = extensionFor(res.headers.get("content-type")) || extensionFor(blob.type);
        // Raw bytes as the invoke body (Tauri sends an ArrayBuffer as InvokeBody::Raw);
        // metadata rides in headers. Sending the bytes as a JSON array would balloon a
        // 30 MB file into ~100 MB of text.
        const saved = await core.invoke("save_blob", bytes, {
          headers: { "x-hint": hint, "x-ext": ext },
        });
        if (!saved || !saved.path) console.warn("yourpdf: save returned no path");
      } catch (err) {
        console.error("yourpdf: save failed", err);
      }
    },
    true
  );

  // The Rust side broadcasts every successful save; the toast renders here so it works on any
  // tool page without touching the 27 page components.
  events
    .listen("yourpdf:saved", (event) => {
      try {
        showToast(event.payload);
      } catch (err) {
        console.error("yourpdf: toast failed", err);
      }
    })
    .catch((err) => console.error("yourpdf: listen failed", err));
})();
