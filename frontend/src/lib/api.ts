import axios from 'axios'

export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

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

/** Headers carrying the API key for raw fetch() call sites. Empty when unset. */
export function apiKeyHeaders(): Record<string, string> {
  return API_KEY ? { 'X-API-Key': API_KEY } : {}
}

export interface DirectDownload {
  blobUrl: string
  fileName: string | null
}

/**
 * POST a FormData payload to a tool endpoint and resolve the raw Response.
 * Backend contract (synchronous): POST returns file bytes directly with
 * `Content-Disposition: attachment`, or JSON (extract-text without export).
 * Callers branch on the response content-type. Throws on network failure;
 * HTTP error statuses resolve normally so callers can surface `detail`.
 */
export async function submitJob(endpoint: string, formData: FormData): Promise<Response> {
  return fetch(`${API_URL}${resolveApiPath(endpoint)}`, {
    method: 'POST',
    body: formData,
    headers: apiKeyHeaders(),
  })
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
