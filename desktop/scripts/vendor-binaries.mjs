// Vendors the native toolchain into desktop/bin so the installer is self-contained.
// Copies the full upstream installs (size accepted 2026-11-01): trimming saves ~60–80MB and
// costs a fragile build script.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const binDir = path.join(desktop, "bin");

const SOURCES = [
  {
    name: "gs",
    // Ghostscript. Only gswin64c.exe + its libs/iccprofiles matter, but the whole install is 65MB.
    from: process.env.YOURPDF_GS || "D:/gs10.05.1",
  },
  {
    name: "tesseract",
    from: process.env.YOURPDF_TESSERACT || "C:/Program Files/Tesseract-OCR",
  },
  {
    name: "poppler",
    from: process.env.YOURPDF_POPPLER || "D:/poppler-26.02.0",
  },
];

fs.mkdirSync(binDir, { recursive: true });

let total = 0;
for (const src of SOURCES) {
  if (!fs.existsSync(src.from)) {
    console.error(`[vendor] MISSING ${src.name}: ${src.from} (set YOURPDF_${src.name.toUpperCase()} to override)`);
    process.exitCode = 1;
    continue;
  }
  const dest = path.join(binDir, src.name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src.from, dest, { recursive: true });
  const size = du(dest);
  total += size;
  console.log(`[vendor] ${src.name}: ${src.from} → ${dest} (${(size / 1e6).toFixed(1)} MB)`);
}

// Tesseract needs the language data it will actually be asked for.
const tessdata = path.join(binDir, "tesseract", "tessdata");
if (fs.existsSync(tessdata)) {
  const keep = new Set(["eng.traineddata", "pdf.ttf", "configs", "tessconfigs"]);
  for (const entry of fs.readdirSync(tessdata)) {
    if (!keep.has(entry)) fs.rmSync(path.join(tessdata, entry), { recursive: true, force: true });
  }
  console.log(`[vendor] tessdata trimmed to eng (${(du(tessdata) / 1e6).toFixed(1)} MB)`);
}

console.log(`[vendor] total bundled binaries: ${(total / 1e6).toFixed(1)} MB`);

function du(p) {
  let total = 0;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    total += entry.isDirectory() ? du(full) : fs.statSync(full).size;
  }
  return total;
}
