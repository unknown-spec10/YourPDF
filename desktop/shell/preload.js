// Preload: turn blob-URL downloads into real files.
// Chromium/Electron's own download path reports "completed" and writes nothing for these
// blob anchors (no `download` attribute), so we read the bytes and hand them to main.
const { ipcRenderer } = require("electron");

window.addEventListener(
  "click",
  async (ev) => {
    const anchor = ev.target && ev.target.closest ? ev.target.closest('a[href^="blob:"]') : null;
    if (!anchor) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
      const res = await fetch(anchor.getAttribute("href"));
      const bytes = new Uint8Array(await res.arrayBuffer());
      const hint =
        anchor.getAttribute("download") ||
        anchor.getAttribute("data-filename") ||
        (anchor.textContent || "").trim();
      await ipcRenderer.invoke("save-blob", { bytes: Array.from(bytes), hint });
    } catch (err) {
      console.error("yourpdf: save failed", err);
    }
  },
  true
);
