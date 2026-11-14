import axios from 'axios'

// The desktop app serves this export from the Tauri origin (http://tauri.localhost on
// Windows) and injects the loopback API origin at window creation, before any page script
// runs. NEXT_PUBLIC_API_URL stays "" for the desktop build. The injected global must be read
// at module load: it is present by then.
declare global {
  interface Window {
    __YOURPDF_API__?: string
    __YOURPDF_TOKEN__?: string
  }
}

const injectedApiUrl = (): string =>
  typeof window === 'undefined' ? '' : (window.__YOURPDF_API__ ?? '')

export const API_URL: string = injectedApiUrl() || (process.env.NEXT_PUBLIC_API_URL ?? '')

// Canonical versioned API prefix. Legacy /api/* paths keep serving
// for backward compatibility; new calls should use /api/v1/*.
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

// Optional shared key for self-hosted auth. Set NEXT_PUBLIC_API_KEY to match
// the backend API_KEY; unset means the backend has auth disabled.
export const API_KEY: string = process.env.NEXT_PUBLIC_API_KEY ?? ''

export const apiClient = axios.create({
  baseURL: API_URL,
})

if (API_KEY) {
  apiClient.defaults.headers.common['X-API-Key'] = API_KEY
}

// Per-launch desktop token, normally injected as `window.__YOURPDF_TOKEN__`. Every API
// request must carry it as `X-YourPDF-Token` because a loopback port is reachable by any
// local process or any web page in the user's browser. A `?t=<token>` query parameter is
// still accepted for a plain-browser session: it is persisted to sessionStorage under
// `yourpdf_token`, then stripped from the visible URL so it does not leak into a copied URL
// or a Referer header. Absent in plain web usage.
const DESKTOP_TOKEN_KEY = 'yourpdf_token'

function initDesktopToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    // Injected as a window global; ?t= (below) covers a plain-browser session.
    if (window.__YOURPDF_TOKEN__) return window.__YOURPDF_TOKEN__
    const params = new URLSearchParams(window.location.search)
    const queryToken = params.get('t')
    if (queryToken) {
      try {
        window.sessionStorage.setItem(DESKTOP_TOKEN_KEY, queryToken)
      } catch {
        // Storage may throw (e.g. private mode); still use the in-memory copy.
      }
      params.delete('t')
      const rest = params.toString()
      const cleanUrl = `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', cleanUrl)
      return queryToken
    }
    return window.sessionStorage.getItem(DESKTOP_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

const DESKTOP_TOKEN: string = initDesktopToken()

/** The stored per-launch desktop token, or '' when absent (plain web usage). */
export function desktopToken(): string {
  if (typeof window === 'undefined') return DESKTOP_TOKEN
  try {
    return window.sessionStorage.getItem(DESKTOP_TOKEN_KEY) ?? DESKTOP_TOKEN
  } catch {
    return DESKTOP_TOKEN
  }
}

if (DESKTOP_TOKEN) {
  apiClient.defaults.headers.common['X-YourPDF-Token'] = DESKTOP_TOKEN
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
  const token = desktopToken()
  const controller = new AbortController()
  activeController = controller
  try {
    return await fetch(`${API_URL}${resolveApiPath(endpoint)}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: {
        ...apiKeyHeaders(),
        ...(token ? { 'X-YourPDF-Token': token } : {}),
      },
    })
  } finally {
    if (activeController === controller) activeController = null
  }
}

/**
 * Cancel the in-flight tool job. Aborting the fetch alone only drops the HTTP
 * response — on desktop the work runs in child processes (gs/tesseract/soffice)
 * that keep burning CPU — so also tell the sidecar to kill its child tree.
 * The web backend has no /cancel route; the failed POST is ignored there.
 */
export async function cancelActiveJob(): Promise<void> {
  activeController?.abort()
  activeController = null
  const token = desktopToken()
  try {
    await fetch(`${API_URL}${resolveApiPath('/api/cancel')}`, {
      method: 'POST',
      headers: {
        ...apiKeyHeaders(),
        ...(token ? { 'X-YourPDF-Token': token } : {}),
      },
    })
  } catch {
    // Sidecar already gone, or a web build without the desktop cancel route.
  }
}

/** Extract the filename from a Content-Disposition header, if present. */
export function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)
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
