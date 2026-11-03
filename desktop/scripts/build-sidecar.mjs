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
  // ocrmypdf pulls in cv2/numpy as transitive deps, but pdf2docx (imported at startup by
  // app/tasks/pdf_tasks.py) imports cv2, numpy and fitz at module load — those must stay.
  // Only Tcl/Tk (pdf2docx's optional GUI, never imported) is dead weight here.
  "--exclude-module", "tkinter",
  "--exclude-module", "_tkinter",
  "--exclude-module", "Tkinter",
  "--exclude-module", "tcl",
  "--exclude-module", "tk",
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

const mb = (dir) => {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? mb(p) : fs.statSync(p).size;
  }
  return total;
};

console.log(`[build-sidecar] done → ${exe} (${(mb(path.join(out, "yourpdf-backend")) / 1e6).toFixed(1)} MB)`);
