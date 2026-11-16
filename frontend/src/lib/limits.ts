/**
 * Service limits, mirrored from `backend/app/config.py`.
 *
 * They are duplicated here on purpose: the browser has to refuse an oversize upload *before*
 * sending it, because the hosting layer rejects a request above 32 MiB before the app runs — so
 * the server-side 413 never gets a chance to explain itself. `backend` stays the source of truth;
 * if you change a default there, change it here too.
 */
export const MAX_TOTAL_UPLOAD_MB = 30
export const MAX_TOTAL_UPLOAD_BYTES = MAX_TOTAL_UPLOAD_MB * 1024 * 1024
export const MAX_RENDER_PAGES = 100

/** "12.4 MB" — one formatter so the numbers in the UI agree. */
export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function totalBytes(files: Array<{ size: number }>): number {
  return files.reduce((sum, file) => sum + file.size, 0)
}

/** True when the files together exceed the per-request budget (not per file). */
export function exceedsUploadBudget(files: Array<{ size: number }>): boolean {
  return totalBytes(files) > MAX_TOTAL_UPLOAD_BYTES
}

export const UPLOAD_LIMIT_SHORT = `Up to ${MAX_TOTAL_UPLOAD_MB} MB per request, all files together.`

export const UPLOAD_LIMIT_MESSAGE =
  `These files are over the ${MAX_TOTAL_UPLOAD_MB} MB limit for one request. ` +
  'Remove a file or split the work into smaller batches.'

/**
 * Split an incoming batch into "fits the remaining budget" and "does not".
 *
 * The per-file cap in DropZone cannot see the other files, so a multi-file tool could assemble
 * 3×12 MB and only find out from the server — after uploading all of it. This is the check that
 * turns that into an immediate, explainable refusal.
 */
export function fitToBudget<T extends { size: number }>(
  existing: T[],
  incoming: T[],
): { accepted: T[]; skipped: T[] } {
  const accepted: T[] = []
  const skipped: T[] = []
  let running = totalBytes(existing)

  for (const candidate of incoming) {
    if (running + candidate.size > MAX_TOTAL_UPLOAD_BYTES) {
      skipped.push(candidate)
      continue
    }
    running += candidate.size
    accepted.push(candidate)
  }
  return { accepted, skipped }
}
