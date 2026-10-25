# YourPDF: Production Deployment

All processing runs server-side (FastAPI + Celery + Redis). This document covers deploying the actual compose stack. Service names below match `docker-compose.prod.yml` exactly — use them verbatim in `docker compose` commands.

## 1. Topology

```
Browser ── port 80 ──→ Nginx ─┬─ / ─────→ frontend:3000 (Next.js standalone)
                               └─ /api/* ─→ backend:8000 (uvicorn --workers 2)
backend ⇄ redis:6379 ─ celery_worker ─→ backend/static/outputs
flower :5555 (Celery monitoring, basic auth)
```

Prod services (`docker-compose.prod.yml`): `redis`, `backend`, `celery_worker`, `flower`, `frontend`, `nginx`.
Dev services (`docker-compose.yml`): `redis`, `celery_worker` only — the backend runs on the host for hot-reload.

All state is in Redis (broker + result backend, `result_expires=86400`) and short-lived output files (15-min auto-expiry via `delete_local_file_task`). No database to back up.

The architecture is stateless and serverless-friendly, so anyone can deploy it anywhere. Serverless platforms like Cloud Run are a good fit.

## 2. Host Requirements

- Any x86_64 host with 2 vCPU and 4 GB RAM recommended for Ghostscript/LibreOffice work.
- Firewall: open `22` (SSH) and `80` (HTTP).
- Docker + Docker Compose plugin installed.

## 3. Environment

Create a root-level `.env` next to `docker-compose.prod.yml` (values are names only — never commit real secrets):

```env
REDIS_PASSWORD=change-me-in-production
API_KEY=change-me-in-production
FLOWER_USER=admin
FLOWER_PASSWORD=change-me-in-production
# CORS_ORIGINS=https://your-domain
# DOCKERHUB_USERNAME=           # defaults to unknowndockerishere
```

What each does:

| Variable | Consumed by | Effect |
|---|---|---|
| `REDIS_PASSWORD` | `redis`, `backend`, `celery_worker`, `flower` | Redis `--requirepass`; threaded into every `REDIS_URL=redis://:<pw>@redis:6379/0` |
| `API_KEY` | `backend` | When non-empty, all `/api/*` routes require matching `X-API-Key`; unset = auth off. Must equal frontend `NEXT_PUBLIC_API_KEY` (baked into the frontend image at build) |
| `FLOWER_USER` / `FLOWER_PASSWORD` | `flower` | Basic auth for `celery flower` on port 5555 |
| `CORS_ORIGINS` | `backend` | Allowed browser origins (default `http://localhost:3000`) |

Backend image installs Python deps from pinned `backend/requirements.lock` and runs as non-root (`appuser`). Healthchecks: Redis `redis-cli ping`, backend `GET /health`, worker `celery inspect ping`.

## 4. Launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Expected: 6 services `Up` — `yourpdf-prod-redis`, `yourpdf-prod-backend`, `yourpdf-prod-celery-worker`, `yourpdf-prod-flower`, `yourpdf-prod-frontend`, `yourpdf-prod-nginx`.

Nginx binds host port `80`: `/` → frontend, `/api/*` → backend (10r/s rate limit, burst 20), `/static/*` served by the backend. Flower listens on host port `5555`.

## 5. Operations

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f celery_worker
docker compose -f docker-compose.prod.yml logs -f flower
docker compose -f docker-compose.prod.yml logs -f redis

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

1. `docker compose -f docker-compose.prod.yml ps` — all 6 services `Up` (backend/worker `healthy`).
2. Open `http://<host>/compress`, process a file, download the result.
3. File served from `static_data` volume, deleted by the Celery cleaner 15 minutes after creation.
4. Flower: `http://<host>:5555` with `FLOWER_USER`/`FLOWER_PASSWORD`.

## 7. Local Dev (for reference)

```bash
docker compose up -d                                   # redis + celery_worker
docker compose ps                                      # yourpdf-redis, yourpdf-celery-worker
docker compose logs -f celery_worker
cd backend && pip install -r requirements.lock && uvicorn app.main:app --reload --port 8000
cd ../frontend && npm install && npm run dev
```
