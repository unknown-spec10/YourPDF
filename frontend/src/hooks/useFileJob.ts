'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseFilenameFromDisposition } from '@/lib/api'

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
  /** Filename from the response Content-Disposition header, if present. */
  fileName: string | null
  /** Parsed JSON result for JSON endpoints, else null. */
  data: DirectResult | null
  isSubmitting: boolean
  submitError: string | null
  isDone: boolean
  isError: boolean
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
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [data, setData] = useState<DirectResult | null>(null)
  const [isDone, setIsDone] = useState(false)
  const [isError, setIsError] = useState(false)
  const urlRef = useRef<string | null>(null)
  const onDoneRef = useRef(options?.onDone)
  onDoneRef.current = options?.onDone

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
      setIsError(false)
      setIsDone(false)
      setData(null)
      revokeUrl()
      setDownloadUrl(null)
      setFileName(null)
      try {
        const res = await submitter(args)
        if (!res.ok) {
          let detail = `Request failed (${res.status}).`
          try {
            const errData = await res.json()
            if (errData?.detail) detail = errData.detail
          } catch {
            // keep default message
          }
          setSubmitError(detail)
          setIsError(true)
          return false
        }
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
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setDownloadUrl(url)
        setFileName(name)
        setIsDone(true)
        onDoneRef.current?.({ downloadUrl: url, fileName: name })
        return true
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Request failed.')
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
    setIsDone(false)
    setIsError(false)
  }, [revokeUrl])

  return {
    submit,
    reset,
    downloadUrl,
    fileName,
    data,
    isSubmitting,
    submitError,
    isDone,
    isError,
  }
}
