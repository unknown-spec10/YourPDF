'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Hash, Download, RefreshCw, AlertTriangle, Eye, ZoomIn, FileText, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

type AddPageNumbersArgs = { file: File; position: string }

const addPageNumbersSubmitter = ({ file, position }: AddPageNumbersArgs) =>
  submitJob('/api/add-page-numbers', buildSingleFileFormData(file, { position }))

const POSITION_LABELS: Record<string, string> = {
  'bottom-left': 'Footer Left',
  'bottom-center': 'Footer Center',
  'bottom-right': 'Footer Right',
  'top-left': 'Header Left',
  'top-center': 'Header Center',
  'top-right': 'Header Right',
}

export default function AddPageNumbersPage() {
  const [file, setFile] = useState<File | null>(null)
  const [position, setPosition] = useState('bottom-center')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isZoomOpen, setIsZoomOpen] = useState(false)

  // Manage local file URL for preview
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
  } = useFileJob<AddPageNumbersArgs>(addPageNumbersSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    const ok = await submit({ file, position })
    if (!ok) {
      alert('Failed to initialize page numbering task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    setPosition('bottom-center')
    setIsZoomOpen(false)
    setIsPreviewOpen(false)
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
            <Hash className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Add Page Numbers</h1>
            <p className="text-sm text-muted mt-0.5">Stamp dynamic page numbers onto headers or footers in your PDF document.</p>
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
              Choose header or footer placement. Badge preview updates live before you submit.
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
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {POSITION_LABELS[position] ?? position}
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
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold">01 — Number Location / Position</span>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="bottom-left">Footer Left</option>
                    <option value="bottom-center">Footer Center</option>
                    <option value="bottom-right">Footer Right</option>
                    <option value="top-left">Header Left</option>
                    <option value="top-center">Header Center</option>
                    <option value="top-right">Header Right</option>
                  </select>
                  <p className="text-xs text-muted leading-relaxed">
                    Numbers scale dynamically across all pages.
                  </p>
                </div>

                <div className="sticky bottom-3 lg:static">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {isSubmitting ? 'Numbering...' : 'Add Page Numbers'}
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">02 — Placement preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{POSITION_LABELS[position] ?? position}</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden flex flex-col items-center">
                    <div
                      onClick={() => fileUrl && setIsZoomOpen(true)}
                      className={`relative w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden group transition-colors ${fileUrl ? 'cursor-pointer hover:border-accent' : ''}`}
                    >
                      {fileUrl ? (
                        <>
                          <iframe
                            loading="lazy"
                            src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                            className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                            title="Page Numbering Preview Viewport"
                          />
                          <div className="absolute inset-0 pointer-events-none p-8">
                            <span
                              className="absolute text-[10px] font-mono font-bold bg-accent/90 text-accent-foreground px-2 py-0.5 rounded shadow-md border border-accent/20 transition-all duration-300 ease-in-out whitespace-nowrap"
                              style={{
                                top: position.startsWith('top') ? '24px' : 'auto',
                                bottom: position.startsWith('bottom') ? '24px' : 'auto',
                                left: position.endsWith('left') ? '24px' :
                                      position.endsWith('center') ? '50%' : 'auto',
                                right: position.endsWith('right') ? '24px' : 'auto',
                                transform: position.endsWith('center') ? 'translateX(-50%)' : 'none',
                              }}
                            >
                              Page 1
                            </span>
                          </div>
                          <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                            <div className="p-2 rounded-full bg-accent text-accent-foreground">
                              <ZoomIn className="h-4 w-4" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">No document loaded</div>
                      )}
                    </div>
                    <p className="mt-2.5 text-center text-xs text-muted max-w-[40ch]">
                      Showing visual layout preview. Numbers will dynamically scale across all pages.
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
                  message="Numbering PDF pages..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Page Numbers Added!</h3>
                  <p className="text-sm text-muted mt-1">
                    Your numbered PDF is ready. Click below to download.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PDF</span>
                  </a>
                  <button
                    onClick={() => setIsPreviewOpen(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Preview PDF</span>
                  </button>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Number Another</span>
                  </button>
                </div>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-1">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Numbering Failed</h3>
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

      {isDone && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl ?? ''}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_numbered.pdf` : "numbered.pdf"}
        />
      )}

      {/* Page Number Zoom Preview Modal */}
      {isZoomOpen && fileUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
          <div className="relative w-full max-w-4xl min-w-0 h-[85vh] max-h-[85vh] rounded-2xl border border-card-border bg-surface flex flex-col p-4 sm:p-6 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 mb-4 min-w-0">
              <div className="flex flex-col min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">Placement Live Zoom</h3>
                <p className="text-xs text-muted">Inspect page numbering position and scaling layout.</p>
              </div>
              <button
                onClick={() => setIsZoomOpen(false)}
                className="shrink-0 text-muted hover:text-foreground cursor-pointer transition-colors px-4 py-2 rounded-xl border border-border bg-background hover:bg-surface-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="relative flex-1 min-h-0 w-full rounded-xl border border-card-border overflow-hidden bg-background">
              <iframe
                src={`${fileUrl}#page=1&toolbar=0&navpanes=0`}
                className="w-full h-full border-0"
                title="Page Numbering Zoom Preview Frame"
              />
              <div className="absolute inset-0 pointer-events-none p-12">
                <span
                  className="absolute text-xs sm:text-sm font-mono font-bold bg-accent/90 text-accent-foreground px-3 py-1 rounded shadow-lg border border-accent/30 transition-all duration-300 ease-in-out whitespace-nowrap"
                  style={{
                    top: position.startsWith('top') ? '32px' : 'auto',
                    bottom: position.startsWith('bottom') ? '32px' : 'auto',
                    left: position.endsWith('left') ? '32px' :
                          position.endsWith('center') ? '50%' : 'auto',
                    right: position.endsWith('right') ? '32px' : 'auto',
                    transform: position.endsWith('center') ? 'translateX(-50%)' : 'none',
                  }}
                >
                  Page 1
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
