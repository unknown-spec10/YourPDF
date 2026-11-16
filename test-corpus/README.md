# Tool corpus

Drop the documents you want tested in this folder, then run (with the app running):

```powershell
.\myenv\Scripts\python.exe -m web.tests.corpus_check --dir test-corpus --base http://127.0.0.1:8080
```

It writes `report.md` here with one row per file × tool.

## What each file type exercises

| You drop | Tools exercised |
| --- | --- |
| `*.pdf` | compress, rotate, add-page-numbers, watermark, organize, split (one page + every page), pdf-to-images (one page + all), pdf-to-docx, extract-text (JSON + TXT), merge (file with itself), ocr, protect, unlock, sign, pdf-info |
| `*.docx` | docx-to-pdf, docx-to-images, merge-docx |
| `*.pptx` | pptx-to-pdf, pptx-to-images, merge-pptx |
| `*.jpg` `*.png` `*.webp` | compress-image, resize-image, rotate-image, watermark-image, convert-image, crop-image, images-to-pdf |

## Conventions

- **Encrypted PDF**: also add `<name>.pdf.password` containing the password. The runner will use
  it for `unlock` and for reading outputs. Without it, the file is reported as unreadable and the
  page-count checks are skipped rather than failed.
- **Signature**: a file whose name contains `sign` (e.g. `signature.png`) is used for `sign`.
  Otherwise the bundled `web/fixtures/sample.png` is used.
- Anything else in the folder is ignored.

## What counts as a failure

Not "did it return 200", but whether the output is still a valid document:

- page counts survive compress / rotate / watermark / add-page-numbers / ocr
- `merge` of a file with itself doubles the page count
- `split` returns exactly the pages requested
- `protect` output can be unlocked again with the same password
- `pdf-to-images` returns an image for one page and a ZIP for several
- `extract-text` returns parseable JSON (and plain text when asked)

The runner exits non-zero if anything fails, so it can gate a release.
