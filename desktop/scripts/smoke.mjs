// Packaged-build smoke test: every tool endpoint + the cancel path, driven from inside the
// running app so Electron's session-level token applies exactly as it does for the UI.
//
//   npm run smoke            (app must already be running with --remote-debugging-port=9225)
//   CDP_PORT=9226 npm run smoke
//
// Fixtures come from desktop/fixtures (png, jpg, docx, pptx). The PDF fixture is built by the
// app itself (images-to-pdf), so the suite needs no binary fixtures beyond images/office docs.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");

let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  console.error("[smoke] playwright-core not installed. Run: npm i -D playwright-core");
  process.exit(1);
}

const CDP_PORT = process.env.CDP_PORT || "9225";
const FIX = path.join(desktop, "fixtures");
const b64 = (name) => fs.readFileSync(path.join(FIX, name)).toString("base64");

const CASES = [
  { path: "/api/v1/pdf-info", file: "pdf" },
  { path: "/api/v1/merge", files: ["pdf", "pdf"] },
  { path: "/api/v1/split", file: "pdf", fields: { mode: "custom", pages_spec: "1" } },
  { path: "/api/v1/compress", file: "pdf", fields: { quality: "medium" } },
  { path: "/api/v1/pdf-to-images", file: "pdf", fields: { format: "png", dpi: "100", pages: "1" } },
  { path: "/api/v1/images-to-pdf", files: ["png", "jpg"] },
  { path: "/api/v1/extract-text", file: "pdf" },
  { path: "/api/v1/pdf-to-docx", file: "pdf" },
  { path: "/api/v1/docx-to-pdf", file: "docx" },
  { path: "/api/v1/organize", file: "pdf", fields: { page_order: "2,1" } },
  { path: "/api/v1/protect", file: "pdf", fields: { password: "test1234" } },
  { path: "/api/v1/rotate", file: "pdf", fields: { rotation: "37" } },
  { path: "/api/v1/watermark", file: "pdf", fields: { text: "TEST", opacity: "0.3", rotation: "45", font_size: "48", pages: "all" } },
  { path: "/api/v1/add-page-numbers", file: "pdf", fields: { position: "bottom-center" } },
  { path: "/api/v1/sign", file: "pdf", extra: { signature: "png" } },
  { path: "/api/v1/ocr", file: "pdf" },
  { path: "/api/v1/image/compress", file: "png", fields: { quality: "70" } },
  { path: "/api/v1/image/resize", file: "png", fields: { percentage: "50" } },
  { path: "/api/v1/image/crop", file: "png", fields: { x: "10", y: "10", width: "200", height: "200" } },
  { path: "/api/v1/image/convert", file: "png", fields: { target_format: "jpg" } },
  { path: "/api/v1/image/rotate", file: "png", fields: { angle: "90" } },
  { path: "/api/v1/image/watermark", file: "png", fields: { text: "WM" } },
  { path: "/api/v1/office/merge-docx", files: ["docx", "docx2"] },
  { path: "/api/v1/office/docx-to-images", file: "docx" },
  { path: "/api/v1/office/pptx-to-pdf", file: "pptx" },
  { path: "/api/v1/office/pptx-to-images", file: "pptx" },
  { path: "/api/v1/office/merge-pptx", files: ["pptx", "pptx2"] },
];

const MATERIALS = {
  pdf: null, // built at runtime via images-to-pdf
  png: b64("sample.png"),
  jpg: b64("sample.jpg"),
  docx: b64("sample.docx"),
  docx2: b64("sample2.docx"),
  pptx: b64("sample.pptx"),
  pptx2: b64("sample2.pptx"),
};

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
const page = browser.contexts()[0].pages()[0];

const result = await page.evaluate(
  async ({ materials, cases }) => {
    const TYPES = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const toB64 = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    };
    const mk = (key, data) => {
      const ext = key.startsWith("docx") ? "docx" : key.startsWith("pptx") ? "pptx" : key;
      const blob = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      return new File([blob], `${key}.${ext}`, { type: TYPES[ext] });
    };

    // Build the PDF fixture through the app, so no binary PDF is committed.
    const seed = new FormData();
    seed.append("files", mk("png", materials.png));
    seed.append("files", mk("jpg", materials.jpg));
    const seeded = await fetch("/api/v1/images-to-pdf", { method: "POST", body: seed });
    if (!seeded.ok) return { fatal: `images-to-pdf seed failed (${seeded.status})` };
    const pdfB64 = toB64(await seeded.arrayBuffer());

    const post = async (path, fd) => {
      const t0 = performance.now();
      const res = await fetch(path, { method: "POST", body: fd });
      const type = (res.headers.get("content-type") || "").split(";")[0];
      let bytes = 0;
      let detail = "";
      if (type.includes("json")) {
        const text = await res.text();
        bytes = text.length;
        if (res.status >= 400) detail = text.slice(0, 120);
      } else {
        bytes = (await res.blob()).size;
      }
      return { path, status: res.status, type, bytes, ms: Math.round(performance.now() - t0), detail };
    };

    const rows = [];
    for (const c of cases) {
      try {
        const fd = new FormData();
        for (const [k, v] of Object.entries(c.fields || {})) fd.append(k, v);
        if (c.files) for (const key of c.files) fd.append("files", mk(key, key === "pdf" ? pdfB64 : materials[key]));
        else fd.append("file", mk(c.file, c.file === "pdf" ? pdfB64 : materials[c.file]));
        for (const [field, key] of Object.entries(c.extra || {})) fd.append(field, mk(key, materials[key]));
        rows.push(await post(c.path, fd));
      } catch (e) {
        rows.push({ path: c.path, status: 0, type: "client-error", bytes: 0, ms: 0, detail: String(e) });
      }
    }

    // unlock: chain off a freshly protected copy
    try {
      const p1 = new FormData();
      p1.append("password", "test1234");
      p1.append("file", mk("pdf", pdfB64));
      const prot = await fetch("/api/v1/protect", { method: "POST", body: p1 });
      const blob = await prot.blob();
      const p2 = new FormData();
      p2.append("password", "test1234");
      p2.append("file", new File([blob], "protected.pdf", { type: "application/pdf" }));
      rows.push(await post("/api/v1/unlock", p2));
    } catch (e) {
      rows.push({ path: "/api/v1/unlock", status: 0, detail: String(e), type: "client-error", bytes: 0, ms: 0 });
    }

    // cancel: start OCR, cancel mid-flight, expect a fast failure and a live server
    let cancel = null;
    try {
      const cfd = new FormData();
      cfd.append("file", mk("pdf", pdfB64));
      const t0 = performance.now();
      const ocr = fetch("/api/v1/ocr", { method: "POST", body: cfd });
      await new Promise((r) => setTimeout(r, 1200));
      const c0 = performance.now();
      const res = await fetch("/api/v1/cancel", { method: "POST" });
      const body = await res.text();
      const cancelMs = Math.round(performance.now() - c0);
      let outcome = "pending";
      try {
        const r = await Promise.race([
          ocr,
          new Promise((_, rej) => setTimeout(() => rej(new Error("still running after 20s")), 20000)),
        ]);
        outcome = `http ${r.status}`;
      } catch (e) {
        outcome = String(e.message || e);
      }
      const health = await fetch("/health").then((r) => r.status).catch(() => 0);
      cancel = { status: res.status, body, cancelMs, outcome, health, totalMs: Math.round(performance.now() - t0) };
    } catch (e) {
      cancel = { error: String(e) };
    }

    return { rows, cancel };
  },
  { materials: MATERIALS, cases: CASES }
);

if (result.fatal) {
  console.error(`[smoke] ${result.fatal}`);
  await browser.close();
  process.exit(1);
}

let pass = 0;
for (const r of result.rows) {
  const good = r.status >= 200 && r.status < 300;
  if (good) pass += 1;
  console.log(
    `${good ? "PASS" : "FAIL"} ${String(r.path).padEnd(32)} ${String(r.status).padEnd(4)} ${String(r.type).padEnd(26)} ${String(r.bytes).padStart(7)}B ${r.ms}ms ${good ? "" : r.detail || ""}`
  );
}

const cancelOk = result.cancel && result.cancel.status === 200 && result.cancel.health === 200 && /killed/.test(result.cancel.body || "");
console.log(
  `${cancelOk ? "PASS" : "FAIL"} cancel                          ${result.cancel?.body || result.cancel?.error} health=${result.cancel?.health} cancelMs=${result.cancel?.cancelMs} ocrOutcome=${result.cancel?.outcome}`
);
console.log(`\nSUMMARY tools=${pass}/${result.rows.length} cancel=${cancelOk ? "ok" : "failed"}`);

await browser.close();
process.exit(pass === result.rows.length && cancelOk ? 0 : 1);
