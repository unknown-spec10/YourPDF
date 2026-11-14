// Vendors the native toolchain into desktop/bin so the installer is self-contained.
// Copies the upstream installs, then drops payloads nothing can read at runtime: docs,
// examples, C headers and import libraries. Declared as data below so a new upstream layout
// shows up as "PRUNED ... (absent)" instead of silently re-adding 40MB.
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

// Runtime-dead payloads, relative to each vendor root. Measured on the 2026-11 vendor set:
// gs doc+examples ≈ 23.7MB, poppler Library/lib ≈ 15.5MB (MSVC import stubs, never loaded),
// Library/include ≈ 1.9MB (C headers). tesseract has none — its 29MB libicudt75.dll is real.
// poppler share/poppler is deliberately KEPT: it carries the CJK CMaps/cidToUnicode tables
// that rendering and text extraction of CJK PDFs need.
const PRUNE = {
  gs: ["doc", "examples"],
  tesseract: [],
  poppler: [path.join("Library", "doc"), path.join("Library", "include"), path.join("Library", "lib")],
};

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

  let pruned = 0;
  for (const rel of PRUNE[src.name] ?? []) {
    const target = path.join(dest, rel);
    if (!fs.existsSync(target)) {
      console.log(`[vendor] ${src.name}: prune target absent, skipped: ${rel}`);
      continue;
    }
    const freed = du(target);
    fs.rmSync(target, { recursive: true, force: true });
    pruned += freed;
    console.log(`[vendor] ${src.name}: pruned ${rel} (${(freed / 1e6).toFixed(1)} MB)`);
  }

  const size = du(dest);
  total += size;
  console.log(
    `[vendor] ${src.name}: ${src.from} → ${dest} (${(size / 1e6).toFixed(1)} MB` +
      `${pruned ? `, -${(pruned / 1e6).toFixed(1)} MB pruned` : ""})`
  );
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
