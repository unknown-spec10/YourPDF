# Tool corpus report

- Server: `http://127.0.0.1:8080`
- Cases: **81** · pass **78** · fail **0**

| File | Tool | Result | ms | bytes | Detail |
| --- | --- | --- | ---: | ---: | --- |
| locked-2p.pdf | pdf-info | INFO | 0 | 2373 | HTTP 400 (encrypted? supply locked-2p.pdf.password) |
| locked-2p.pdf | compress | PASS | 196 | 2852 | application/pdf |
| locked-2p.pdf | watermark | INFO | 8 | 80 | HTTP 400 (not applicable): {"detail":"This PDF is password-protected. Unlock it first, then watermark it."} |
| locked-2p.pdf | protect | INFO | 4 | 68 | HTTP 400 (not applicable): {"detail":"Failed to protect PDF: the file could not be encrypted."} |
| locked-2p.pdf | unlock (supplied pw) | PASS | 8 | 2033 | application/pdf |
| long-12p.pdf | compress | PASS | 212 | 8155 | application/pdf |
| long-12p.pdf | rotate 90 | PASS | 13 | 5887 | application/pdf |
| long-12p.pdf | add-page-numbers | PASS | 179 | 9330 | application/pdf |
| long-12p.pdf | watermark | PASS | 47 | 9480 | application/pdf |
| long-12p.pdf | organize | PASS | 15 | 5875 | application/pdf |
| long-12p.pdf | split p1 | PASS | 11 | 934 | application/pdf |
| long-12p.pdf | split all | PASS | 66 | 12390 | 12 single-page PDFs |
| long-12p.pdf | pdf-to-images p1 | PASS | 125 | 6851 | image/png |
| long-12p.pdf | pdf-to-docx | PASS | 139 | 36870 | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| long-12p.pdf | extract-text json | PASS | 15 | 341 | application/json |
| long-12p.pdf | extract-text txt | PASS | 15 | 294 | text/plain |
| long-12p.pdf | merge x2 | PASS | 35 | 11518 | application/pdf |
| long-12p.pdf | ocr | PASS | 2040 | 9073 | application/pdf |
| long-12p.pdf | split (bogus mode) | PASS | 0 | 50 | rejected with 400 |
| long-12p.pdf | protect | PASS | 9 | 6333 | application/pdf |
| long-12p.pdf | unlock (round trip) | PASS | 8 | 5934 | application/pdf |
| long-12p.pdf | unlock (not encrypted) | PASS | 2 | 48 | HTTP 400 as expected |
| long-12p.pdf | sign | PASS | 468 | 75028 | application/pdf |
| scan-1p.pdf | compress | PASS | 284 | 45417 | application/pdf |
| scan-1p.pdf | rotate 90 | PASS | 22 | 34457 | application/pdf |
| scan-1p.pdf | add-page-numbers | PASS | 32 | 34680 | application/pdf |
| scan-1p.pdf | watermark | PASS | 32 | 34812 | application/pdf |
| scan-1p.pdf | organize | PASS | 25 | 34456 | application/pdf |
| scan-1p.pdf | split p1 | PASS | 23 | 34456 | application/pdf |
| scan-1p.pdf | split all | PASS | 21 | 34456 | single-page PDF (1 page) |
| scan-1p.pdf | pdf-to-images p1 | PASS | 138 | 27636 | image/png |
| scan-1p.pdf | pdf-to-images all | PASS | 243 | 27636 | image/png |
| scan-1p.pdf | pdf-to-docx | PASS | 2897 | 36885 | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| scan-1p.pdf | extract-text json | PASS | 12 | 57 | application/json |
| scan-1p.pdf | extract-text txt | PASS | 18 | 46 | text/plain |
| scan-1p.pdf | merge x2 | PASS | 32 | 68668 | application/pdf |
| scan-1p.pdf | ocr | PASS | 2909 | 50788 | application/pdf |
| scan-1p.pdf | split (bogus mode) | PASS | 0 | 50 | rejected with 400 |
| scan-1p.pdf | protect | PASS | 4 | 34914 | application/pdf |
| scan-1p.pdf | unlock (round trip) | PASS | 4 | 34515 | application/pdf |
| scan-1p.pdf | unlock (not encrypted) | PASS | 2 | 48 | HTTP 400 as expected |
| scan-1p.pdf | sign | PASS | 71 | 40141 | application/pdf |
| text-8p.pdf | compress | PASS | 217 | 7620 | application/pdf |
| text-8p.pdf | rotate 90 | PASS | 10 | 6026 | application/pdf |
| text-8p.pdf | add-page-numbers | PASS | 115 | 18670 | application/pdf |
| text-8p.pdf | watermark | PASS | 30 | 18823 | application/pdf |
| text-8p.pdf | organize | PASS | 17 | 6018 | application/pdf |
| text-8p.pdf | split p1 | PASS | 9 | 1302 | application/pdf |
| text-8p.pdf | split all | PASS | 47 | 11204 | 8 single-page PDFs |
| text-8p.pdf | pdf-to-images p1 | PASS | 131 | 89691 | image/png |
| text-8p.pdf | pdf-to-images all | PASS | 494 | 738937 | application/zip |
| text-8p.pdf | pdf-to-docx | PASS | 351 | 37655 | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| text-8p.pdf | extract-text json | PASS | 24 | 7963 | application/json |
| text-8p.pdf | extract-text txt | PASS | 21 | 7632 | text/plain |
| text-8p.pdf | merge x2 | PASS | 22 | 11802 | application/pdf |
| text-8p.pdf | ocr | PASS | 2001 | 13037 | application/pdf |
| text-8p.pdf | split (bogus mode) | PASS | 0 | 50 | rejected with 400 |
| text-8p.pdf | protect | PASS | 7 | 6476 | application/pdf |
| text-8p.pdf | unlock (round trip) | PASS | 7 | 6077 | application/pdf |
| text-8p.pdf | unlock (not encrypted) | PASS | 3 | 48 | HTTP 400 as expected |
| text-8p.pdf | sign | PASS | 298 | 62485 | application/pdf |
| sample.docx | docx-to-pdf | PASS | 1066 | 32906 | application/pdf |
| sample.docx | docx-to-images | PASS | 1100 | 12991 | image/png |
| sample.docx | merge-docx x2 | PASS | 61 | 36653 | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| sample.pptx | pptx-to-pdf | PASS | 898 | 22037 | application/pdf |
| sample.pptx | pptx-to-images | PASS | 1105 | 15205 | image/png |
| sample.pptx | merge-pptx x2 | PASS | 50 | 29099 | application/vnd.openxmlformats-officedocument.presentationml.presentation |
| sample.jpg | compress-image | PASS | 25 | 10799 | image/jpeg |
| sample.jpg | resize-image | PASS | 33 | 6887 | image/jpeg |
| sample.jpg | rotate-image | PASS | 29 | 22460 | image/jpeg |
| sample.jpg | watermark-image | PASS | 32 | 23804 | image/jpeg |
| sample.jpg | convert-image | PASS | 85 | 2744 | image/webp |
| sample.jpg | crop-image | PASS | 14 | 663 | image/jpeg |
| sample.jpg | images-to-pdf | PASS | 12 | 23916 | application/pdf |
| sample.png | compress-image | PASS | 72 | 6620 | image/png |
| sample.png | resize-image | PASS | 21 | 3005 | image/png |
| sample.png | rotate-image | PASS | 17 | 7122 | image/png |
| sample.png | watermark-image | PASS | 30 | 10237 | image/png |
| sample.png | convert-image | PASS | 81 | 2596 | image/webp |
| sample.png | crop-image | PASS | 9 | 133 | image/png |
| sample.png | images-to-pdf | PASS | 8 | 7389 | application/pdf |
