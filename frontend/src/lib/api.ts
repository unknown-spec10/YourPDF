import axios from 'axios'

// Same-origin by default: the service serves this export and the API from one container, so an
// empty base URL means "this origin" and no CORS applies. NEXT_PUBLIC_API_URL exists only for a
// split deployment (static export on a CDN, API elsewhere).
export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? ''

// Canonical versioned API prefix. Legacy /api/* paths keep serving for backward
// compatibility; new calls should use /api/v1/*.
export const API_PREFIX: string = process.env.NEXT_PUBLIC_API_PREFIX ?? '/api/v1'

/**
 * Normalize a legacy endpoint string to the versioned prefix.
 * '/api/merge' -> '/api/v1/merge'; already-versioned or relative
 * paths pass through unchanged so existing pages need zero edits.
 */
export function resolveApiPath(endpoint: string): string {
  if (endpoint.startsWith(`${API_PREFIX}/`) || endpoint === API_PREFIX) return endpoint
  if (endpoint.startsWith('/api/')) return `${API_PREFIX}${endpoint.slice(4)}`
  return endpoint
}

// Optional shared key for a locked-down deployment. Set NEXT_PUBLIC_API_KEY to match the
// backend API_KEY; unset means the backend has auth disabled.
export const API_KEY: string = process.env.NEXT_PUBLIC_API_KEY ?? ''

export const apiClient = axios.create({
  baseURL: API_URL,
})

if (API_KEY) {
  apiClient.defaults.headers.common['X-API-Key'] = API_KEY
}

/** Headers carrying the API key for raw fetch() call sites. Empty when unset. */
export function apiKeyHeaders(): Record<string, string> {
  return API_KEY ? { 'X-API-Key': API_KEY } : {}
}

export interface DirectDownload {
  blobUrl: string
  fileName: string | null
}

// Only one tool job runs at a time (the backend is a single synchronous
// process), so a module-level controller is enough to make Cancel work from
// the shared progress UI without threading a signal through every page.
let activeController: AbortController | null = null

/**
 * POST a FormData payload to a tool endpoint and resolve the raw Response.
 * Backend contract (synchronous): POST returns file bytes directly with
 * `Content-Disposition: attachment`, or JSON (extract-text without export).
 * Callers branch on the response content-type. Throws on network failure;
 * HTTP error statuses resolve normally so callers can surface `detail`.
 */
export async function submitJob(endpoint: string, formData: FormData): Promise<Response> {
  const controller = new AbortController()
  activeController = controller
  try {
    return await fetch(`${API_URL}${resolveApiPath(endpoint)}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: apiKeyHeaders(),
    })
  } finally {
    if (activeController === controller) activeController = null
  }
}

/**
 * Cancel the in-flight tool job by aborting its fetch.
 *
 * This only stops the browser waiting. The server keeps working until the job finishes and
 * the instance is busy for that long, because processing is synchronous and there is no
 * cross-instance cancellation channel. Keeping the button is still worthwhile (the user gets
 * their UI back immediately), but it is not a server-side cancel.
 */
export async function cancelActiveJob(): Promise<void> {
  activeController?.abort()
  activeController = null
}

/** Extract the filename from a Content-Disposition header, if present. */
export function parseFilenameFromDisposition(header: string | null): string | null {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header ?? '')
  if (!match) return null
  try {
    return decodeURIComponent(match[1].trim())
  } catch {
    return match[1].trim()
  }
}

type ParamValue = string | number | boolean

function appendParams(formData: FormData, params?: Record<string, ParamValue>): void {
  if (!params) return
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, String(value))
  }
}

/** Single-file variant: one file plus optional scalar params. */
export function buildSingleFileFormData(
  file: File,
  params?: Record<string, ParamValue>,
  fileField = 'file',
): FormData {
  const formData = new FormData()
  formData.append(fileField, file)
  appendParams(formData, params)
  return formData
}

/** Multi-file variant: many files under one field plus optional scalar params. */
export function buildMultiFileFormData(
  files: File[],
  params?: Record<string, ParamValue>,
  fileField = 'files',
): FormData {
  const formData = new FormData()
  for (const file of files) {
    formData.append(fileField, file)
  }
  appendParams(formData, params)
  return formData
}
