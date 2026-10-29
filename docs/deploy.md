# YourPDF: Deployment

All processing runs server-side and synchronously (FastAPI, no queue). This document covers the two real deployment paths plus local dev. Service names below match `docker-compose.prod.yml` exactly — use them verbatim in `docker compose` commands.

## 1. Topology

```
Browser ── port 80 ──→ Nginx ─┬─ / ───────→ frontend:3000 (Next.js standalone)
                               ├─ /api/* ──→ backend:8000 (uvicorn --workers 2)
                               └─ /static/ → backend:8000 (fallback)
```

Prod services (`docker-compose.prod.yml`): `backend`, `frontend`, `nginx` (+ `tmp_data` / `static_data` volumes). No Redis, no worker, no Flower.

The app is stateless (no database, no broker) — uploads live only for the duration of a request and are deleted best-effort via `cleanup_paths`.

## 2. Host requirements

- Any x86_64 host with 2 vCPU and 4 GB RAM recommended for Ghostscript/LibreOffice work.
- Firewall: open `22` (SSH) and `80` (HTTP).
- Docker + Docker Compose plugin installed.

## 3. Environment

Create a root-level `.env` next to `docker-compose.prod.yml` (names only — never commit real secrets):

```env
DOCKERHUB_USERNAME=deepdocker2023
API_KEY=change-me-in-production
CORS_ORIGINS=https://your-domain
```

What each does:

| Variable | Consumed by | Effect |
|---|---|---|
| `DOCKERHUB_USERNAME` | compose image fields | Registry namespace; defaults to `deepdocker2023` (`.../yourpdf-backend:latest`, `.../yourpdf-frontend:latest`, single `latest` tag) |
| `API_KEY` | `backend` | When non-empty, all `/api/*` routes require matching `X-API-Key`; unset = auth off. Must equal the frontend `NEXT_PUBLIC_API_KEY` baked into the frontend image at build |
| `CORS_ORIGINS` | `backend` | Allowed browser origins (default `http://localhost:3000`) |

Backend image installs Python deps from pinned `backend/requirements.lock` and runs as non-root (`appuser`). Healthcheck: backend `GET /health`.

## 4. Launch (self-host)

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Expected: 3 services `Up` — `yourpdf-prod-backend` (healthy), `yourpdf-prod-frontend`, `yourpdf-prod-nginx`.

Nginx binds host port `80`: `/` → frontend, `/api/*` → backend (10r/s rate limit, burst 20), `/static/*` → backend.

## 5. Operations

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f nginx

# Status / health
docker compose -f docker-compose.prod.yml ps
curl http://localhost:8000/health   # from inside the backend container/network

# Update after pushing new images
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Rebuild locally instead (Windows host)
docker build -t <user>/yourpdf-backend:latest ./backend
docker build -t <user>/yourpdf-frontend:latest ./frontend
docker build -t <user>/yourpdf-nginx:latest ./nginx

# Disk cleanup
docker image prune
docker image prune -a
docker system prune -a
```

To stop: `docker compose -f docker-compose.prod.yml down`.

## 6. Verify

1. `docker compose -f docker-compose.prod.yml ps` — all 3 services `Up` (backend `healthy`).
2. Open `http://<host>/compress`, process a file, download the result directly.
3. Response carries `Content-Disposition: attachment`; nothing is stored server-side after the request.

## 7. Local dev (host only, no compose)

No dev compose file exists — the dev flow runs entirely on the host.

```bash
# Backend (from backend/; venv lives at repo-root ../myenv)
cd backend
../myenv/Scripts/activate        # Windows (use `source ../myenv/bin/activate` on Linux/macOS)
pip install -r requirements.lock
uvicorn app.main:app --port 8000
```

```bash
# Frontend (new terminal)
cd frontend
npm install
npm run dev -- --webpack
```

Open `http://localhost:3000` (backend CORS defaults to `http://localhost:3000`, localhost-only).

## 8. Cloud Run production

Live services (`us-central1`): `yourpdf-frontend` and `yourpdf-backend`, images `deepdocker2023/yourpdf-frontend:latest` and `deepdocker2023/yourpdf-backend:latest` (single `latest` tag, no versioning).

```bash
# Re-tag local builds with the registry prefix (index.docker.io explicit)
docker tag yourpdf-backend:latest index.docker.io/deepdocker2023/yourpdf-backend:latest
docker tag yourpdf-frontend:latest index.docker.io/deepdocker2023/yourpdf-frontend:latest
docker push index.docker.io/deepdocker2023/yourpdf-backend:latest
docker push index.docker.io/deepdocker2023/yourpdf-frontend:latest

# Roll the Cloud Run services to the new images
gcloud run services update yourpdf-backend --region us-central1 \
  --image index.docker.io/deepdocker2023/yourpdf-backend:latest
gcloud run services update yourpdf-frontend --region us-central1 \
  --image index.docker.io/deepdocker2023/yourpdf-frontend:latest
```

Set `API_KEY` / `CORS_ORIGINS` (backend) and `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_KEY` (frontend, baked at build) via the Cloud Run console or `--set-env-vars` so the frontend origin is allow-listed and keys match.
