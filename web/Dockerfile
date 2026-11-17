# syntax=docker/dockerfile:1.7
#
# One image = the static export + the API on one origin.
#
# Build from the repo root:  docker build -f web/Dockerfile -t yourpdf-web .

# ---------------------------------------------------------------------------
# Stage 1: build the frontend export
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS web

WORKDIR /build
# Pinned npm on purpose: the lockfile was generated with npm 11.6 and older npm resolves the
# optional platform deps differently, failing `npm ci` with "Missing: @emnapi/runtime".
RUN npm i -g npm@11.6.1

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Empty API base = same origin, which is how the service is deployed.
ENV NEXT_PUBLIC_API_URL=""
# Absolute base for og:image/twitter metadata; the export bakes it, so it must be set here rather
# than at runtime. Empty leaves Next's relative default (fine for local builds).
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
# Tells the UI it is served behind Identity-Aware Proxy, which is the only place the
# "switch account" link (IAP's cookie-clear parameter) does anything.
ARG NEXT_PUBLIC_IAP_ENABLED=""
ENV NEXT_PUBLIC_IAP_ENABLED=${NEXT_PUBLIC_IAP_ENABLED}
# Fail the build, not the deploy, if the export is missing or incomplete. `frontend/out` is
# git-ignored, so a container built without this step would serve an API with no UI.
RUN npm run build && test -f out/index.html && test -d out/_next

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/tmp \
    TMPDIR=/tmp \
    TMP=/tmp \
    YOURPDF_TMP=/tmp \
    YOURPDF_OUT=/app/frontend/out \
    PORT=8080 \
    MAX_FILE_SIZE_MB=30 \
    MAX_TOTAL_UPLOAD_MB=30 \
    MAX_RENDER_PAGES=100 \
    WEB_LOG_LEVEL=info

# Native tools. libreoffice-impress is not optional: pptx→pdf and pptx→images need the
# presentation module, and without it those endpoints fail at runtime with "output PDF was not
# found" while every Word path still works. fonts-liberation supplies the font the image
# watermark loads by name; DejaVu covers LibreOffice's own rendering.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ghostscript \
      poppler-utils \
      qpdf \
      tesseract-ocr \
      tesseract-ocr-eng \
      libreoffice-writer-nogui \
      libreoffice-impress-nogui \
      fonts-liberation \
      fonts-dejavu-core \
      fontconfig \
      procps \
      ca-certificates \
    && fc-cache -f \
    # Documentation, the clip-art gallery, the document templates and the second copy of the
    # LibreOffice registry are never read by a headless conversion. OSD data (11 MB) is only used
    # for automatic page-rotation detection, which this app never asks for — verified by running
    # the full 36-case suite after removing each of these.
    && rm -rf /usr/share/doc/* /usr/share/man/* \
              /usr/lib/libreoffice/share/gallery /usr/lib/libreoffice/share/template \
              /usr/share/libreoffice \
              /usr/share/tesseract-ocr/*/tessdata/osd.traineddata \
    && rm -rf /var/lib/apt/lists/*

# The Linux-resolved lock: the Windows-era lock pinned pikepdf 10.7.3, which ocrmypdf 17 refuses
# (it needs >=10.15). This one was generated on this base image with ocrmypdf installed.
COPY backend/requirements-image.lock /tmp/requirements.lock
#
# One RUN on purpose: deleting or rewriting files in a *later* layer does not shrink the image —
# the bytes stay in the earlier layer and the new copies are added on top. A separate "strip"
# step once made this image 300 MB bigger for exactly that reason.
#
# --no-compile skips the .pyc files (59 MB of the image); imports compile in memory instead, and
# PYTHONDONTWRITEBYTECODE stops them being written back. pip itself is not needed at runtime.
#
# Deliberately NOT stripped: `strip` breaks numpy's bundled OpenBLAS with "ELF load command
# address/offset not page-aligned", so the 27 MB it would save is not worth the failure mode.
RUN pip install --no-cache-dir --no-compile -r /tmp/requirements.lock \
    && rm /tmp/requirements.lock \
    && rm -rf /usr/local/lib/python3.12/site-packages/pip \
              /usr/local/lib/python3.12/site-packages/pip-*.dist-info

# One LibreOffice profile per invocation. A killed soffice leaves the shared profile locked, and
# at concurrency 1 that means every later Office job fails until the instance is recycled.
RUN printf '#!/bin/sh\nexec /usr/lib/libreoffice/program/soffice -env:UserInstallation=file:///tmp/lo-$$ "$@"\n' \
      > /usr/local/bin/soffice \
    && chmod +x /usr/local/bin/soffice

WORKDIR /app
COPY backend/ /app/backend/
COPY web/ /app/web/
COPY --from=web /build/out /app/frontend/out

# Cloud Run runs this as a non-root user; /tmp is the in-memory scratch for uploads and outputs,
# and it has to be world-writable because the runtime user owns nothing else.
RUN useradd -u 10001 -M app && chmod 1777 /tmp

USER 10001
EXPOSE 8080
CMD ["python", "-m", "web.serve"]
