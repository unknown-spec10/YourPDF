# Install YourPDF Desktop

Windows 10/11 x64. Per-user install — no administrator rights, no account, no
uploads. The full toolkit (Electron shell + FastAPI sidecar + Ghostscript,
Tesseract, Poppler) is bundled.

## Download and install (one click)

1. Open **https://github.com/unknown-spec10/YourPDF/releases/latest**
2. Click **`YourPDF-Desktop-setup.exe`** (~300 MB) under *Assets*.
3. Double-click the downloaded file. It installs and launches — no wizard, no
   admin prompt, no options to click through.

Direct link, if you don't want to visit the release page:

```
https://github.com/unknown-spec10/YourPDF/releases/latest/download/YourPDF-Desktop-setup.exe
```

That is the whole install. Everything the app needs (Ghostscript, Tesseract,
Poppler, LibreOffice converters, the Python backend) is inside the installer —
nothing else to download, no Python, no Node.

It is a per-user install: it lands in
`%LOCALAPPDATA%\Programs\YourPDF Desktop`, adds Start-menu and desktop shortcuts,
and never asks for UAC. Uninstall from Settings → Apps like any other program.

## One command (same thing, scripted)

If you would rather script it — or you want the SHA-256 verified before the
installer runs — open **Windows PowerShell** (Start menu → type `PowerShell`)
and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/unknown-spec10/YourPDF/releases/latest/download/install.ps1 | iex"
```

The script:

1. downloads `YourPDF-Desktop-setup.exe` from the latest GitHub Release;
2. downloads `SHA256SUMS.txt` and verifies the installer's SHA-256;
3. runs the NSIS installer silently (per-user, no UAC);
4. starts YourPDF Desktop.

Re-run the same command to update. It replaces the app and keeps your settings.

> The v1 build is **unsigned**. Windows SmartScreen may show
> “Windows protected your PC” on first launch — choose **More info → Run anyway**.
> The checksum step is what guarantees the file matches the published release.
> Code signing can be added later without changing this command.

## Offline / manual install

Download these files from the release page into one folder, then double-click
`install.cmd` (or run `install.ps1` in PowerShell):

| File | Purpose |
|---|---|
| `YourPDF-Desktop-setup.exe` | The installer (about 300 MB) |
| `SHA256SUMS.txt` | SHA-256 of the installer |
| `install.ps1` / `install.cmd` | Verifies and installs locally |

Running the setup `.exe` directly also works; the script simply adds checksum
verification and silent install.

## Updates

The installed app checks GitHub Releases about eight seconds after launch, quietly. When a newer
version exists it downloads in the background, then asks to restart — your settings, downloads
history and chosen folder are untouched. You can also trigger a check yourself from
**Help → Check for Updates…** (it tells you either "You're up to date" or offers the download).

Downloads are incremental: only the changed blocks are fetched (the `.blockmap` asset), so an
update is much smaller than the 300 MB installer.

To update by hand instead, re-run the one-click download above — installing over an existing copy
keeps your settings.

If the log at `%APPDATA%\YourPDF Desktop\logs\desktop.log` says *"No published versions on GitHub"*,
you are running a build made locally from source rather than an installed release; published
releases update normally.

## Uninstall

Settings → Apps → Installed apps → **YourPDF Desktop** → Uninstall.
`deleteAppDataOnUninstall` removes `%APPDATA%\YourPDF Desktop` as well.

## Where downloads go

Every finished job saves to your download folder, and the app tells you so: a toast appears in
the corner with **Open**, **Show in folder** and **All downloads**.

- **File → Downloads…** (`Ctrl+J`) opens the Downloads window: every file you have produced, newest
  first, each with **Open** / **Show in folder** / **Remove**. Files moved or deleted outside the
  app are marked instead of failing silently.
- **Change folder…** in that window picks a different destination; the choice is remembered in
  `%APPDATA%\YourPDF Desktop\config.json` and used by every tool from then on.
- Name collisions never overwrite: a second `report.pdf` becomes `report (2).pdf`.
- The list is a history, not storage — **Clear list** forgets the entries but keeps the files.

## Where data lives

- Logs: `%APPDATA%\YourPDF Desktop\logs\desktop.log`
- Temp uploads/outputs: `%APPDATA%\YourPDF Desktop\tmp` (deleted after each job)
- Download history: `%APPDATA%\YourPDF Desktop\downloads.json` (last 200 entries)
- Chosen download folder: `%APPDATA%\YourPDF Desktop\config.json`
- Results: your Downloads folder, or the folder you picked

Files are processed only on this machine. The app talks to `127.0.0.1` only.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `irm` fails with a TLS error | Use PowerShell 5.1+ on Windows 10/11; the script enables TLS 1.2 |
| `install.ps1 cannot be loaded` | The documented command includes `-ExecutionPolicy Bypass`; use the full command |
| “No releases found” / 404 | The first release has not been published yet; use the release page directly |
| `Checksum mismatch` | The download was corrupted or altered — delete it and run the command again |
| SmartScreen reappears on every update | Expected for an unsigned build |
| Install succeeded but app not found | Run the setup `.exe` manually and check Settings → Apps |

---

## Maintainer: publishing a release

The release pipeline builds on `windows-latest`, so a release machine does not
need Ghostscript/Tesseract/Poppler installed locally (the local `npm run dist`
path does).

1. Bump `version` in `desktop/package.json` (semver, no leading `v`).
2. Commit, then tag and push:
   ```powershell
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. `.github/workflows/release-desktop.yml` runs on the tag, verifies the tag
   matches `desktop/package.json`, builds the installer, and publishes a GitHub
   Release with these assets:
   - `YourPDF-Desktop-setup.exe` — stable name used by the one-liner
   - `SHA256SUMS.txt` — checksums for the stable and versioned names
   - `install.ps1`, `install.cmd`, `INSTALL.txt`
4. Confirm the release is **published** (not a draft): the one-liner resolves
   `releases/latest`.

The stable asset name is deliberate. `.../releases/latest/download/install.ps1`
and `.../YourPDF-Desktop-setup.exe` never need to know the version, so the
installer needs no GitHub API call and cannot hit rate limits.

### Local release build

Prerequisites (see `docs/desktop-build.md` §1):

```powershell
cd desktop
npm ci
npm run dist
```

`dist` = frontend export → frozen sidecar → vendor native binaries → NSIS pack →
`release/` bundle (`setup.exe`, stable alias, checksums, install scripts).
Then publish manually:

```powershell
gh release create v0.1.0 `
  release/YourPDF-Desktop-setup.exe `
  release/SHA256SUMS.txt `
  release/install.ps1 `
  release/install.cmd `
  release/INSTALL.txt `
  --title "YourPDF Desktop v0.1.0" `
  --generate-notes
```
