// Freezes the FastAPI backend into desktop/build/sidecar/yourpdf-backend/ (--onedir).
// Recipes proven in Phase 0 gate B: --onedir only, and `--copy-metadata ocrmypdf` is enough
// (PyInstaller's contributed hooks handle ocrmypdf's entry-point plugins).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const repo = path.resolve(desktop, "..");
const backend = path.join(repo, "backend");

const PY =
  process.env.YOURPDF_PYTHON || path.join(repo, "myenv", "Scripts", "python.exe");

if (!fs.existsSync(PY)) {
  console.error(`[build-sidecar] python not found: ${PY}\nset YOURPDF_PYTHON to the backend venv python.`);
  process.exit(1);
}

const out = path.join(desktop, "build", "sidecar");
const work = path.join(desktop, "build", "pyi");

const args = [
  "-m",
  "PyInstaller",
  "--onedir",
  "--noconfirm",
  "--clean",
  "--name",
  "yourpdf-backend",
  "--paths",
  backend,
  "--copy-metadata",
  "ocrmypdf",
  "--copy-metadata",
  "pikepdf",
  // ocrmypdf pulls in cv2/numpy as transitive deps, and pdf2docx (imported at startup by
  // app/tasks/pdf_tasks.py) imports cv2, numpy and fitz at module load. All three MUST stay —
  // pdf2docx uses cv2 for layout/table detection, which is the "layout is preserved" promise on
  // the PDF-to-Word page. Only genuinely unreachable payloads are removed (see PRUNE below).
  "--exclude-module", "tkinter",
  "--exclude-module", "_tkinter",
  "--exclude-module", "Tkinter",
  "--exclude-module", "tcl",
  "--exclude-module", "tk",
  // AVIF is not an accepted input format anywhere (validation allows jpg/png/webp/bmp/tiff/gif/svg),
  // so Pillow's AVIF decoder and the standalone pdfium binding are unreachable at runtime.
  "--exclude-module", "PIL.AvifImagePlugin",
  "--exclude-module", "PIL._avif",
  "--exclude-module", "pypdfium2",
  "--exclude-module", "pypdfium2_raw",
  "--distpath",
  out,
  "--workpath",
  work,
  "--specpath",
  path.join(desktop, "build"),
  path.join(desktop, "sidecar", "serve.py"),
];

console.log(`[build-sidecar] ${PY} ${args.join(" ")}`);
const res = spawnSync(PY, args, { stdio: "inherit", cwd: desktop });
if (res.status !== 0) {
  console.error(`[build-sidecar] FAILED (exit ${res.status})`);
  process.exit(res.status ?? 1);
}

const exe = path.join(out, "yourpdf-backend", "yourpdf-backend.exe");
if (!fs.existsSync(exe)) {
  console.error(`[build-sidecar] no exe at ${exe}`);
  process.exit(1);
}

const root = path.join(out, "yourpdf-backend");

// Post-build payload removals. Declared as data so a PyInstaller upgrade that starts collecting
// these again shows up in the build log instead of silently re-growing the installer.
// Verified quality-neutral:
//  - cv2's videoio ffmpeg plugin: pdf2docx only processes page raster, never video. Core cv2.pyd
//    stays. Probe: a PDF with a 2x3 table still converted to 1 table / 6 cells without it.
//  - pypdfium2: not imported anywhere in backend/ or desktop/.
//  - PIL/_avif: AVIF is not an accepted input format (see validation allowlists).
const PRUNE = [
  { match: /^cv2[\\/]opencv_videoio_ffmpeg.*\.dll$/i, why: "opencv video plugin, unused by pdf2docx" },
  { match: /^pypdfium2[\\/]/i, why: "pypdfium2 not imported" },
  { match: /^PIL[\\/]_avif.*\.pyd$/i, why: "AVIF not an accepted input" },
  { match: /^PIL[\\/]_avif.*\.dll$/i, why: "AVIF not an accepted input" },
];

function prune(dir, prefix = "") {
  let freed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      freed += prune(full, rel);
      try {
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
      } catch {
        /* keep going */
      }
      continue;
    }
    const hit = PRUNE.find((p) => p.match.test(rel.replace(/^_internal\//, "")));
    if (hit) {
      const size = fs.statSync(full).size;
      fs.rmSync(full, { force: true });
      console.log(`[build-sidecar] pruned ${rel} (${(size / 1e6).toFixed(1)} MB) — ${hit.why}`);
      freed += size;
    }
  }
  return freed;
}

const mb = (dir) => {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? mb(p) : fs.statSync(p).size;
  }
  return total;
};

const before = mb(root);
const freed = prune(root);
const after = mb(root);

console.log(
  `[build-sidecar] done → ${exe} (${(after / 1e6).toFixed(1)} MB, ` +
    `${(before / 1e6).toFixed(1)} MB before pruning, -${(freed / 1e6).toFixed(1)} MB)`
);
