'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseFilenameFromDisposition } from '@/lib/api'
import { MAX_TOTAL_UPLOAD_MB } from '@/lib/limits'

/**
 * Submits tool args and resolves the raw fetch Response.
 * Pages adapt their endpoint + FormData into this shape, e.g.:
 *   (file) => submitJob('/api/compress', buildSingleFileFormData(file, { quality }))
 */
export type JobSubmitter<TArgs> = (args: TArgs) => Promise<Response>

/** Parsed JSON body for endpoints that answer JSON (extract-text without export). */
export interface DirectResult {
  text?: string
  extracted_text?: string
  [key: string]: unknown
}

export interface UseFileJobOptions {
  onDone?: (data: DirectResult & { downloadUrl: string | null; fileName: string | null }) => void
}

export interface UseFileJobReturn<TArgs> {
  /** POSTs via the submitter, creates a blob object URL for file bytes or
   * parses JSON for extract-text style results. Resolves true on success,
   * false on failure (error also stored in submitError). */
  submit: (args: TArgs) => Promise<boolean>
  reset: () => void
  /** Blob object URL for the finished file, or null when unavailable. */
  downloadUrl: string | null
  /** The finished file itself, for Web Share and tool chaining. */
  resultBlob: Blob | null
  /** Filename from the response Content-Disposition header, if present. */
  fileName: string | null
  /** Parsed JSON result for JSON endpoints, else null. */
  data: DirectResult | null
  isSubmitting: boolean
  /** Always a sentence the user can act on — never a raw object. */
  submitError: string | null
  /** Server-provided note about how the job was handled, if any. */
  notice: string | null
  isDone: boolean
  isError: boolean
}

/**
 * FastAPI sends `detail` as a string for application errors and as an **array** of objects for
 * 422 validation failures. Assigning that array straight into string state made React throw
 * "objects are not valid as a React child" on 22 pages, so every shape is flattened here.
 */
export function detailToMessage(detail: unknown): string | null {
  if (typeof detail === 'string') return detail.trim() || null

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        const entry = item as { msg?: string; loc?: unknown[] } | null
        if (!entry?.msg) return null
        const field = Array.isArray(entry.loc) ? entry.loc[entry.loc.length - 1] : null
        return field ? `${String(field)}: ${entry.msg}` : entry.msg
      })
      .filter(Boolean)
    return messages.length ? messages.join('; ') : null
  }

  if (detail && typeof detail === 'object') {
    const nested = (detail as { detail?: unknown }).detail
    return nested ? detailToMessage(nested) : null
  }

  return null
}

/** Turn a status code into something a user can act on, when the server didn't say. */
export function messageForStatus(status: number, serverDetail: string | null): string {
  if (serverDetail) return serverDetail
  if (status === 413) {
    return `That upload is over the ${MAX_TOTAL_UPLOAD_MB} MB limit for one request. Remove a file or split the work.`
  }
  if (status === 422) return 'Some required options are missing. Check the fields and try again.'
  if (status === 400) return 'That request could not be processed. Check the options and try again.'
  if (status === 429) return 'Too many requests right now. Wait a moment and try again.'
  if (status >= 500) return 'The server could not finish this job. Please try again in a moment.'
  return `Request failed (${status}).`
}

/**
 * Direct-download job hook shared by all tool pages.
 * Follows the protect/unlock page pattern: POST, await the response,
 * branch on content-type (JSON vs file bytes), expose a blob object URL.
 */
export function useFileJob<TArgs>(
  submitter: JobSubmitter<TArgs>,
  options?: UseFileJobOptions,
): UseFileJobReturn<TArgs> {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [data, setData] = useState<DirectResult | null>(null)
  const [isDone, setIsDone] = useState(false)
  const [isError, setIsError] = useState(false)
  const urlRef = useRef<string | null>(null)
  const onDoneRef = useRef(options?.onDone)
  // Updated in an effect, not during render: React forbids writing refs while rendering, and
  // the callback is only read after an async job resolves, so effect timing is fine.
  useEffect(() => {
    onDoneRef.current = options?.onDone
  }, [options?.onDone])

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  useEffect(() => revokeUrl, [revokeUrl])

  const submit = useCallback(
    async (args: TArgs): Promise<boolean> => {
      setIsSubmitting(true)
      setSubmitError(null)
      setNotice(null)
      setIsError(false)
      setIsDone(false)
      setData(null)
      revokeUrl()
      setDownloadUrl(null)
      setResultBlob(null)
      setFileName(null)
      try {
        const res = await submitter(args)
        if (!res.ok) {
          let serverDetail: string | null = null
          try {
            serverDetail = detailToMessage(await res.json())
          } catch {
            // Non-JSON error body (an HTML 502 from a proxy, for instance): fall through to
            // the status-based message.
          }
          setSubmitError(messageForStatus(res.status, serverDetail))
          setIsError(true)
          return false
        }
        setNotice(res.headers.get('x-job-notice'))
        const contentType = res.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const json = (await res.json()) as DirectResult
          setData(json)
          setIsDone(true)
          onDoneRef.current?.({ ...json, downloadUrl: null, fileName: null })
          return true
        }
        const blob = await res.blob()
        const name = parseFilenameFromDisposition(res.headers.get('content-disposition'))
        setResultBlob(blob)
      const url = URL.createObjectURL(blob)
        urlRef.current = url
        setDownloadUrl(url)
        setFileName(name)
        setIsDone(true)
        onDoneRef.current?.({ downloadUrl: url, fileName: name })
        return true
      } catch (err) {
        // Cancel is not a failure: drop back to the tool workspace with the
        // input still loaded, and say nothing (pages alert on `false`).
        if ((err as { name?: string } | null)?.name === 'AbortError') {
          revokeUrl()
          setDownloadUrl(null)
      setResultBlob(null)
          setFileName(null)
          setData(null)
          setSubmitError(null)
          setIsDone(false)
          setIsError(false)
          return true
        }
        setSubmitError('Could not reach the server. Check your connection and try again.')
        setIsError(true)
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [submitter, revokeUrl],
  )

  const reset = useCallback(() => {
    revokeUrl()
    setDownloadUrl(null)
    setFileName(null)
    setData(null)
    setSubmitError(null)
    setNotice(null)
    setIsDone(false)
    setIsError(false)
  }, [revokeUrl])

  return {
    submit,
    reset,
    downloadUrl,
    resultBlob,
    fileName,
    data,
    isSubmitting,
    submitError,
    notice,
    isDone,
    isError,
  }
}
