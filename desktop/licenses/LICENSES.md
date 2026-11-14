# Third-party licenses — YourPDF Desktop

YourPDF itself is MIT (see the repository `LICENSE`). The desktop build redistributes the
following binaries. Each is used as an independent program invoked by the local backend, and
each keeps its own license.

| Component | Version | License | Where |
|---|---|---|---|
| Ghostscript | 10.05.1 | AGPL-3.0 | `bin/gs/` |
| Tesseract OCR | 5.x | Apache-2.0 | `bin/tesseract/` |
| Tesseract tessdata (eng) | — | Apache-2.0 | `bin/tesseract/tessdata/` |
| Poppler (pdftoppm, pdfinfo) | 26.02.0 | GPL-2.0 | `bin/poppler/` |
| Tauri | 2.x | MIT / Apache-2.0 | `YourPDF Desktop.exe` shell |
| PyInstaller bootloader | 6.x | GPL-2.0 with bootloader exception | frozen backend |

## Written offers for source

Ghostscript (AGPL-3.0) and Poppler (GPL-2.0) are distributed here as binaries. In accordance with
their licenses, the corresponding source is available at:

- Ghostscript: https://github.com/ArtifexSoftware/ghostscript
- Poppler: https://gitlab.freedesktop.org/poppler/poppler

If you received this build without access to those URLs, write to the address in the About
dialog and source will be provided on request.

## Notes

- Ghostscript and Poppler are separate executables spawned by the backend; they are not linked
  into YourPDF's code. Their licenses do not relicense YourPDF itself.
- The webview is Microsoft Edge WebView2, shipped and serviced by Windows. It is not
  redistributed in this installer: the bootstrapper downloads it only when it is absent.
- `ocrmypdf` (MPL-2.0) requires Ghostscript; it is bundled inside the frozen backend.
