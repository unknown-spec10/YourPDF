// Turns release/YourPDF-Desktop-<version>-setup.exe into an upload-ready bundle:
//   - YourPDF-Desktop-setup.exe   (stable asset name used by the one-line installer)
//   - SHA256SUMS.txt              (checksums for both names)
//   - install.ps1 / install.cmd / INSTALL.txt
//
// The stable name is what makes
//   .../releases/latest/download/install.ps1
// version-independent, so the installer never has to call the GitHub API.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const releaseDir = path.join(desktop, "release");
const installerDir = path.join(desktop, "installer");
const pkg = JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf8"));

const versionedName = `YourPDF-Desktop-${pkg.version}-setup.exe`;
const versioned = path.join(releaseDir, versionedName);
const stableName = "YourPDF-Desktop-setup.exe";
const stable = path.join(releaseDir, stableName);
const blockmap = `${versioned}.blockmap`;
const latestYml = path.join(releaseDir, "latest.yml");

if (!fs.existsSync(versioned)) {
  console.error(`[release] missing ${versioned}\n[release] run "npm run pack" first.`);
  process.exit(1);
}

// Hardlink so the 300 MB installer is not duplicated on disk. Fall back to a copy
// on filesystems without hardlinks.
if (fs.existsSync(stable)) fs.rmSync(stable);
try {
  fs.linkSync(versioned, stable);
} catch {
  fs.copyFileSync(versioned, stable);
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const hash = sha256(versioned);
const sums = `${hash}  ${stableName}\n${hash}  ${versionedName}\n`;
fs.writeFileSync(path.join(releaseDir, "SHA256SUMS.txt"), sums);

for (const name of ["install.ps1", "install.cmd", "INSTALL.txt"]) {
  const src = path.join(installerDir, name);
  if (!fs.existsSync(src)) {
    console.error(`[release] missing installer asset: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(releaseDir, name));
}

// electron-updater needs latest.yml (which names the VERSIONED file) plus its blockmap.
// Both must be uploaded, otherwise the in-app updater 404s.
for (const required of [latestYml, `${versioned}.blockmap`]) {
  if (!fs.existsSync(required)) {
    console.error(`[release] missing update asset: ${required}\n[release] is build.publish configured?`);
    process.exit(1);
  }
}
const latest = fs.readFileSync(latestYml, "utf8");
if (!latest.includes(versionedName)) {
  console.error(`[release] latest.yml does not reference ${versionedName}`);
  process.exit(1);
}

const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(1);
console.log(`[release] v${pkg.version}`);
console.log(`[release] ${stableName} (${mb(stable)} MB, sha256 ${hash})`);
console.log(`[release] upload: ${stableName}, ${versionedName}, ${versionedName}.blockmap, latest.yml, SHA256SUMS.txt, install.ps1, install.cmd, INSTALL.txt`);
