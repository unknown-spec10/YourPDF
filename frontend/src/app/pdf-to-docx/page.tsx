'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileText, Download, RefreshCw, AlertTriangle, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

const pdfToDocxSubmitter = (file: File) =>
  submitJob('/api/pdf-to-docx', buildSingleFileFormData(file))

function DocxResultPreview({ downloadUrl }: { downloadUrl: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    setHtml(null)
    fetch(downloadUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch result')
        const buffer = await res.arrayBuffer()
        try {
          const mammothModule = await import('mammoth')
          const result = await mammothModule.default.convertToHtml({ arrayBuffer: buffer })
          if (!cancelled) {
            setHtml(result.value)
            setIsLoading(false)
          }
        } catch {
          if (!cancelled) {
            setHasError(true)
            setIsLoading(false)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true)
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [downloadUrl])

  if (isLoading) {
    return (
      <div className="w-full rounded-lg border border-border bg-background p-4" aria-live="polite">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
          <span>Rendering Word preview…</span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-3 w-11/12 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    )
  }

  if (hasError || !html) {
    return (
      <p className="text-xs text-muted leading-relaxed">
        Word preview unavailable for this file. Your download above is still ready.
      </p>
    )
  }

  return (
    <div className="w-full min-w-0">
      <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-background p-4 text-left">
        <div
          className="min-w-0 text-sm leading-relaxed text-foreground [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:mb-2 [&_p]:break-words [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_table]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_img]:max-w-full [&_img]:rounded-md"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted leading-relaxed">
        Preview rendered from the converted Word text. Formatting may differ slightly from the downloaded file.
      </p>
    </div>
  )
}

export default function PdfToDocxPage() {
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setFileUrl(null)
    }
  }, [file])

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<File>(pdfToDocxSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    const ok = await submit(file)
    if (!ok) {
      alert('Failed to initialize conversion task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
  }

  const isWorkspace = file && !isDone && !isError && !isSubmitting

  return (
    <div className={`mx-auto w-full min-w-0 flex-1 flex flex-col justify-center overflow-x-clip px-4 sm:px-6 py-6 sm:py-10 transition-all duration-300 ${file ? 'max-w-[1400px]' : 'max-w-2xl'}`}>
      {/* Header */}
      <div className="mb-5 sm:mb-7 min-w-0">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">PDF to Word</h1>
            <p className="text-sm text-muted mt-0.5">Convert PDF pages into editable Microsoft Word (.docx) files.</p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!file && !isDone && !isError && !isSubmitting && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 min-w-0"
          >
            <DropZone onFileAccepted={setFile} />
            <p className="text-center text-xs text-muted">
              Source first page shown for confirmation. Text preview appears after conversion.
            </p>
          </motion.div>
        )}

        {isWorkspace && file && (
          <motion.div
            key="file-selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4 sm:gap-5 min-w-0"
          >
            {/* Slim add bar */}
            <div className="flex items-center gap-3 min-w-0 rounded-xl border border-card-border bg-surface px-3 py-2.5 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · converts to .docx
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Repeat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Replace</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const next = e.target.files?.[0]
                    if (next) setFile(next)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleReset}
                aria-label="Remove file"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Workspace: compact settings + generous preview */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings — no options for this tool */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <span className="text-[13px] font-semibold">01 — Convert</span>
                <p className="text-xs text-muted leading-relaxed">
                  One click, no options. Layout and text flow are preserved as editable Word content.
                </p>
                <div className="sticky bottom-3 lg:static">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {isSubmitting ? 'Initializing...' : 'Convert to Word'}
                  </button>
                </div>
              </div>

              {/* Preview — source confirmation (result is non-viewable .docx) */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">02 — Source preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">page 1 → .docx</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
                    <div className="relative mx-auto w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden">
                      {fileUrl ? (
                        <iframe
                          loading="lazy"
                          src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                          className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                          title="Source PDF first page"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">Reading document…</div>
                      )}
                    </div>
                    <p className="mt-2.5 text-center text-xs text-muted">
                      Result is a Word file — download only, no in-browser preview.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {(isSubmitting || isDone || isError) && (
          <motion.div
            key="processing-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-6 text-center min-w-0"
          >
            {isSubmitting && (
              <div className="w-full max-w-md min-w-0">
                <ProgressBar
                  progress={50}
                  message="Converting PDF to Word..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Conversion Done!</h3>
                  <p className="text-sm text-muted mt-1">
                    Your Word document is ready. Click the button below to download.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Word File</span>
                  </a>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Convert Another</span>
                  </button>
                </div>
                <p className="font-mono text-[11px] tabular-nums text-muted truncate max-w-full">{file?.name ?? ''} → .docx</p>
                <div className="w-full max-w-2xl min-w-0">
                  <DocxResultPreview downloadUrl={downloadUrl} />
                </div>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-1">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Conversion Failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {submitError || 'An unexpected error occurred during processing.'}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors mt-2 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Try Again</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
