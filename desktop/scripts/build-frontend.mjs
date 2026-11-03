// Builds frontend/out with the desktop API base. The empty NEXT_PUBLIC_API_URL is
// required: the sidecar serves the export from the same loopback origin, so a baked
// absolute URL would point the installed app at a dead host.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "..", "..", "frontend");

const res = spawnSync("npm", ["run", "build"], {
  cwd: frontend,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_API_URL: "" },
});

if (res.status !== 0) {
  console.error(`[build-frontend] FAILED (exit ${res.status})`);
  process.exit(res.status ?? 1);
}
console.log("[build-frontend] done → frontend/out");
