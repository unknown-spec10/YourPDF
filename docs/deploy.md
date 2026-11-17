# Deploying YourPDF to Cloud Run

This is the runbook for the service that is live today. `docs/web-cloud-run.md` is the earlier
design assessment (32 MiB envelope, h2c, IAP, sizing rationale) — read it for *why*, not for *how*.

**Live:** <https://yourpdf-web-vhkjwky42a-el.a.run.app> — behind direct Cloud Run **IAP**
(Google sign-in; `roles/iap.httpsResourceAccessor` required), `max-instances 2`.

| Fact | Value |
|---|---|
| GCP project | `gen-lang-client-0977081292` (number `803645689505`, no Organization) |
| Region | `asia-south1` |
| Cloud Run service | `yourpdf-web` |
| Runtime service account | `803645689505-compute@developer.gserviceaccount.com` (project default) |
| CI deploy service account | `yourpdf-deploy@gen-lang-client-0977081292.iam.gserviceaccount.com` |
| Image (CI) | `docker.io/deepdocker2023/yourpdf-web:latest` |
| Workflow | `.github/workflows/deploy-web.yml` |

One image serves both halves of the app: the Next.js static export at `/` and the FastAPI backend at
`/api` and `/api/v1`, from the same origin. There is no bucket, database or queue — uploads live in
`/tmp` for the duration of one request and are deleted in a `finally` block.

## Two ways to deploy

1. **CI (normal path).** Push to `main` touching `web/**`, `backend/**`, `frontend/**` or the workflow
   itself, or run the workflow by hand (`gh workflow run "Deploy Web"`). It builds, smokes, deploys.
2. **Manual (break-glass).** Below. Use it when CI is broken or you need a one-off flag change.

### What a push does — and does not create

| Change pushed to `main` | Result |
|---|---|
| `web/**`, `backend/**`, `frontend/**`, `.github/workflows/deploy-web.yml` | one image build, smoke gate, one deploy |
| anything else (`docs/**`, `AGENTS.md`, `README.md`, `site/**` unless a path above matches) | nothing — no build, no revision |

A deploy produces **one** image tag and **one** Cloud Run revision, never a new version per push:

- The build pushes only `$IMAGE_REPO:latest` (no `:<sha>`, no date suffix). The tag is overwritten in
  place, so the registry holds exactly one tag — verify with
  `curl -s https://hub.docker.com/v2/repositories/deepdocker2023/yourpdf-web/tags | jq .count` → `1`.
  The previous manifest becomes unreferenced and Docker Hub garbage-collects its layers on its own
  schedule.
- Cloud Run keeps a **revision object** per deploy (`00012-dt5`, `00013-…`). That is small platform
  metadata pointing at a digest, not another image copy, and it is what makes rollback a traffic
  shift. Old revisions can be pruned with `gcloud run revisions delete <name>`, but there is no need.

## Manual deploy

From the repo root, with `gcloud` authenticated against the project:

```bash
# 1. build a plain linux/amd64 image and push it — ONE mutable tag, overwritten
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -f web/Dockerfile -t "yourpdf-web:local" --load .
docker tag yourpdf-web:local "<dockerhub-user>/yourpdf-web:latest"
docker push "<dockerhub-user>/yourpdf-web:latest"

# 2. prove the image before it can reach users
docker run -d --name smoke -p 8090:8080 yourpdf-web:local
until curl -fsS http://127.0.0.1:8090/health >/dev/null; do sleep 1; done
docker exec smoke python -m web.tests.smoke_endpoints --base http://127.0.0.1:8080 --fail-on-skip
docker rm -f smoke

# 3. deploy
gcloud run deploy yourpdf-web \
  --image "docker.io/<dockerhub-user>/yourpdf-web:latest" \
  --project gen-lang-client-0977081292 --region asia-south1 --platform managed \
  --port 8080 --cpu 2 --memory 4Gi --concurrency 1 --timeout 900 \
  --min-instances 0 --max-instances 2 --cpu-boost --execution-environment gen2 \
  --set-env-vars "YOURPDF_TMP=/tmp,HOME=/tmp,TMPDIR=/tmp,MAX_FILE_SIZE_MB=30,MAX_TOTAL_UPLOAD_MB=30,MAX_RENDER_PAGES=100,YOURPDF_OUT=/app/frontend/out,WEB_LOG_LEVEL=info" \
  --labels "commit=<sha>,managed-by=manual" --quiet

# 4. access: the service is IAP-protected — do NOT grant public access
# Granting allUsers roles/run.invoker makes the IAP gate cosmetic.
gcloud run services remove-iam-policy-binding yourpdf-web \
  --project gen-lang-client-0977081292 --region asia-south1 \
  --member=allUsers --role=roles/run.invoker --quiet
```

Why each flag: `--concurrency 1` because every tool shells out to single-threaded CPU work
(Ghostscript, Tesseract, ocrmypdf, LibreOffice) and the platform default of 80 would thrash one
vCPU and OOM `soffice`; `--timeout 900` must exceed the app's own `SUBPROCESS_TIMEOUT` (600 s);
`--memory 4Gi` because `/tmp` is in-memory and counts against the limit; `--cpu-boost` and
`--execution-environment gen2` cut cold start.

**Never put `PORT` in `--set-env-vars`.** Cloud Run reserves it and the deploy fails with
`The following reserved env names were provided: PORT`.

**`--no-traffic` is rejected when the service does not exist yet** (`--no-traffic not supported when
creating a new service`). It is only usable on updates, e.g. to stage a canary:

```bash
gcloud run deploy yourpdf-web ... --no-traffic --tag canary      # staging only
curl -fsS https://canary---yourpdf-web-vhkjwky42a-el.a.run.app/health
gcloud run services update-traffic yourpdf-web --region asia-south1 --to-latest
gcloud run services update-traffic yourpdf-web --region asia-south1 --remove-tags canary
```

## What CI does

`.github/workflows/deploy-web.yml`, two jobs:

**build-and-push** — logs into Docker Hub (`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets), runs
`docker buildx build --platform linux/amd64 --provenance=false --sbom=false` and pushes a **single
mutable tag, `:latest`**, overwriting the previous build. There are no per-commit or date-stamped
tags: the registry holds exactly one tag per repo, and the exact bytes of every deploy live in the
Cloud Run revision, not in a pile of tags. `--provenance=false --sbom=false` are load-bearing: a
default buildx push produces an OCI index with an attestation entry, and Cloud Run's `mirror.gcr.io`
rejects that layout with a misleading `Image '...' not found`. Then it pulls the tag back, runs the 36-case smoke suite inside
the container with `--fail-on-skip` (a missing LibreOffice Impress or tessdata pack must fail here,
not on a user's `.pptx`), and asserts the static export is in the image.

**deploy** — skipped while `vars.GCP_PROJECT_ID` is empty. Otherwise: WIF auth, resolve `:latest` to
a digest with `docker buildx imagetools inspect`, deploy `repo@sha256:...` (no `--iap` flag: the
service-level IAP setting persists across revisions), then verify the revision is Ready **and** that
an unauthenticated request is answered with a `302` to `accounts.google.com` — with IAP on, `/health`
can never return 200 to CI, so that redirect is the success condition. It never grants `allUsers`.
URL, revision, digest and gate status go to the run summary.

The deploy retries up to 4 times, 90 s apart, re-resolving the digest on each attempt. That loop
exists because the Docker Hub mirror lags a fresh push: the first 1–3 attempts answer
`Image 'mirror.gcr.io/<user>/<repo>:<tag>' not found` even though the tag is live on Docker Hub and
`hub.docker.com/v2/.../tags/<tag>` returns it. The 2026-11-17 CI run failed attempts 1 and 2 and
succeeded on attempt 3, with the identical digest each time — that is the signature of lag, not a bad
push. **Do not rebuild to "fix" it.**

## GitHub setup for CI (already done — recreate only if lost)

```bash
PROJECT=gen-lang-client-0977081292; PN=803645689505

gcloud services enable sts.googleapis.com --project $PROJECT

gcloud iam workload-identity-pools create github --location=global \
  --display-name="GitHub Actions" --project $PROJECT

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='unknown-spec10/YourPDF' && assertion.ref=='refs/heads/main'" \
  --project $PROJECT

gcloud iam service-accounts create yourpdf-deploy --display-name="YourPDF CI deploy" --project $PROJECT
SA=yourpdf-deploy@$PROJECT.iam.gserviceaccount.com

# run.admin, not run.developer: the workflow also sets an IAM policy on the service
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/run.admin"
gcloud iam service-accounts add-iam-policy-binding \
  803645689505-compute@developer.gserviceaccount.com \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountUser" --project $PROJECT
gcloud iam service-accounts add-iam-policy-binding $SA \
  --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/unknown-spec10/YourPDF" \
  --role="roles/iam.workloadIdentityUser" --project $PROJECT
```

Repository **variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `gen-lang-client-0977081292` |
| `GCP_REGION` | `asia-south1` |
| `GCP_SERVICE_NAME` | `yourpdf-web` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/803645689505/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `yourpdf-deploy@gen-lang-client-0977081292.iam.gserviceaccount.com` |
| `PUBLIC_SITE_URL` | `https://yourpdf-web-vhkjwky42a-el.a.run.app` |

Secrets already present: `DOCKERHUB_USERNAME` = `deepdocker2023`, `DOCKERHUB_TOKEN` = a Docker Hub PAT
for that account (Read/Write/Delete). Rotate the token by writing a new secret — the image path is
built from `DOCKERHUB_USERNAME`, so no workflow edit is needed when the account changes.

## Verifying a deploy

```bash
URL=https://yourpdf-web-vhkjwky42a-el.a.run.app
curl -fsS "$URL/health"            # {"status":"ok","service":"yourpdf-backend"}
curl -sI "$URL/" | head -3         # 200 text/html — the Next export, not an API error
```

A `200 /health` proves almost nothing on its own (it is a static JSON with no dependency checks), so
check one real tool as well:

```bash
curl -sS -o out.jpg -w '%{http_code} %{size_download}\n' \
  -F "file=@web/fixtures/sample.png" -F "target_format=jpg" "$URL/api/image/convert"
```

Route paths have **no `/pdf` segment**: merge is `/api/merge`, info is `/api/pdf-info`, splitting
takes `mode` + `pages_spec` (not `pages`). Streaming is expected — a ZIP-producing call returns
`Transfer-Encoding: chunked` and no `content-length`, which is how outputs larger than the 32 MiB
HTTP/1.1 response cap get through.

Limits to spot-check: two 16 MB files → the app's own JSON **413** with a friendly message; two 20 MB
files → Cloud Run's HTML 413 (the host rejects above 32 MiB before Python runs); `pages=1-999` on a
small PDF → **400** from the render budget.

## Switching accounts (IAP)

There is **no app session**. IAP owns the session in an `HttpOnly` `GCP_IAP_UID` cookie scoped to
the `*.run.app` host, so clearing React state, deleting a local token or posting to a "logout"
endpoint would change nothing: the next request is authenticated again by the same cookie.

IAP exposes one control, and the app uses it as a plain link in the header (and in the mobile
menu):

```
/current-page?gcp-iap-mode=CLEAR_LOGIN_COOKIE
```

That request clears the cookie (`GCP_IAP_UID=none`, expired 1970) and bounces through
`accounts.google.com/o/oauth2/v2/auth?...&prompt=select_account` -- Google's account chooser.
Picking a different account signs in as that identity. The link carries the current page, so the
user lands back where they were.

- **It is built only where IAP exists.** `NEXT_PUBLIC_IAP_ENABLED=1` is passed as a build arg by
  the deploy workflow; a local `web.serve` omits the link because the parameter does nothing
  without IAP in front of it.
- **It is "switch account", not "logout".** The Google session itself is untouched, so choosing
  the same account signs straight back in. Naming it logout would promise a private browser that
  this does not provide.
- **No backend, no cookie handling, nothing to keep in sync.** One anchor; deleting the feature
  is deleting that anchor.

### Testing the gate

`curl` only proves the gate exists: an unauthenticated request gets a `302` to
`accounts.google.com`, which says nothing about *who* is allowed in. To prove it discriminates:

1. Open the service in a **private window** (or click "Switch account") and sign in with a Google
   account that does **not** hold `roles/iap.httpsResourceAccessor`.
2. Expect Google's `403` -- "You don't have access to this resource."

That 403 is the proof. A successful sign-in from an account that *does* have the role proves the
happy path; only the refusal proves the gate.

## Rollback

```bash
gcloud run revisions list --service yourpdf-web --region asia-south1 --format='table(name,active)'
gcloud run services update-traffic yourpdf-web --region asia-south1 --to-revisions <previous-revision>=100
```

A revision that cannot pull its image never receives traffic, so a failed deploy leaves the previous
one serving. Prefer rolling traffic back over deleting revisions.

## Traps

- **Docker Hub mirror lag** — see above; retry, never rebuild.
- **One Docker Hub account, one tag.** `DOCKERHUB_USERNAME` is `deepdocker2023`, and CI publishes only
  a mutable `:latest` that each build overwrites. There are deliberately no per-commit or date-stamped
  tags: the exact bytes of a deploy live in the Cloud Run revision (`spec.containers[0].image` shows
  `repo@sha256:...`), so rollback is a traffic shift, not a hunt through tags. The account
  `unknowndockerishere` was emptied and retired on 2026-11-17 (all 8 of its images deleted); do not
  push there again.
- **IAP works here, but only through a Console-created OAuth client.** Direct Cloud Run IAP needs no
  load balancer and costs nothing beyond normal request usage, but on a project without an
  Organization the API path is closed (`GET .../projects/803645689505/brands` answers `Project must
  belong to an organization`; `clientauthconfig.googleapis.com` refuses to enable). The working route:
  create a **Web application** OAuth client in the Console, add the redirect
  `https://iap.googleapis.com/v1/oauth/clientIds/<CLIENT_ID>:handleRedirect`, then attach it with
  `gcloud alpha iap settings set iap.yaml --resource-type=cloud-run --service=yourpdf-web`
  (`accessSettings.oauthSettings.clientId` / `clientSecret`), and only then enable IAP. Toggling IAP
  *before* the client is attached makes every request return **502 `Empty Google Account OAuth client
  ID(s)/secret(s)`** while the revision still reports Ready.
  Verify the secret without a browser: POST to `https://oauth2.googleapis.com/token` with a bogus
  code — `invalid_grant` means the client id, secret and redirect are all valid, `invalid_client`
  means the secret is wrong, `redirect_uri_mismatch` means the redirect was never registered.
- **`allUsers` defeats IAP.** With `allUsers` → `roles/run.invoker` the sign-in page still appears but
  the gate is bypassable. Never re-add it.
- **`/tmp` is RAM.** Uploads, intermediate files and the finished output all count against the 4 GiB.
- **Cold starts are 5–10 s** with `--min-instances 0`; that is the accepted trade for cost.
- **`gcloud run services update` has no `--allow-unauthenticated`** — it prints help and exits 1. With
  IAP on, public access is never granted; the service policy carries only the IAP service agent.
- **`--no-traffic` is not accepted at service creation**, only on updates.
- **The build is ~1.34 GB and takes 4–6 min**; a push over a slow uplink takes several more. Run long
  builds in the background and watch the log file's mtime — a log that has not grown for ~10 minutes
  while a package install runs is hung, not slow.
- **Budget alerting is not configured.** The project bills to a billing account
  (`billingAccounts/014BB7-734838-D1BD80`) that the current login cannot see, so
  `gcloud billing budgets create` fails with `INVALID_ARGUMENT` rather than a permission error.
