'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Scissors, Download, RefreshCw, AlertTriangle, Eye, ZoomIn, FileText, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { apiClient, submitJob, buildSingleFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

type SplitArgs = { file: File; mode: string; pages_spec: string }

const splitSubmitter = ({ file, mode, pages_spec }: SplitArgs) =>
  submitJob('/api/split', buildSingleFileFormData(file, { mode, pages_spec }))

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'custom' | 'all'>('custom')
  const [pagesSpec, setPagesSpec] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [zoomPage, setZoomPage] = useState<number | null>(null)

  // Manage local file URL for preview and fetch page count
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)

      const formData = new FormData()
      formData.append('file', file)
      apiClient.post('/api/pdf-info', formData)
        .then((res) => {
          setNumPages(res.data.num_pages)
        })
        .catch((err) => {
          console.error('Failed to get PDF info:', err)
        })

      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setFileUrl(null)
      setNumPages(null)
    }
  }, [file])

  // Parse pagesSpec to a Set of numbers representing kept pages
  const getSelectedPages = (): Set<number> => {
    const selected = new Set<number>()
    if (!numPages || !pagesSpec.trim()) return selected
    const parts = pagesSpec.split(',')
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (trimmed.includes('-')) {
        const rangeParts = trimmed.split('-')
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0].trim(), 10)
          const end = parseInt(rangeParts[1].trim(), 10)
          if (!isNaN(start) && !isNaN(end)) {
            const actualStart = Math.min(start, end)
            const actualEnd = Math.max(start, end)
            for (let i = actualStart; i <= actualEnd; i++) {
              if (i >= 1 && i <= numPages) {
                selected.add(i)
              }
            }
          }
        }
      } else {
        const page = parseInt(trimmed, 10)
        if (!isNaN(page) && page >= 1 && page <= numPages) {
          selected.add(page)
        }
      }
    }
    return selected
  }

  const selectedPages = getSelectedPages()

  // Parse pagesSpec to an ordered array of selected pages representing resulting structure
  const getSelectedPagesList = (): Array<{ id: string; originalPageNum: number; isValid: boolean }> => {
    const list: Array<{ id: string; originalPageNum: number; isValid: boolean }> = []
    if (!numPages || !pagesSpec.trim()) return list
    const parts = pagesSpec.split(',')
    parts.forEach((part, index) => {
      const trimmed = part.trim()
      if (!trimmed) return
      if (trimmed.includes('-')) {
        const rangeParts = trimmed.split('-')
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0].trim(), 10)
          const end = parseInt(rangeParts[1].trim(), 10)
          if (!isNaN(start) && !isNaN(end)) {
            const actualStart = start
            const actualEnd = end
            if (actualStart <= actualEnd) {
              for (let i = actualStart; i <= actualEnd; i++) {
                const isValid = i >= 1 && i <= numPages
                list.push({
                  id: `${i}-${index}-${list.length}`,
                  originalPageNum: i,
                  isValid,
                })
              }
            } else {
              for (let i = actualStart; i >= actualEnd; i--) {
                const isValid = i >= 1 && i <= numPages
                list.push({
                  id: `${i}-${index}-${list.length}`,
                  originalPageNum: i,
                  isValid,
                })
              }
            }
          }
        }
      } else {
        const page = parseInt(trimmed, 10)
        if (!isNaN(page)) {
          const isValid = page >= 1 && page <= numPages
          list.push({
            id: `${page}-${index}-${list.length}`,
            originalPageNum: page,
            isValid,
          })
        }
      }
    })
    return list
  }

  const selectedPagesList = getSelectedPagesList()

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<SplitArgs>(splitSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    if (mode === 'custom' && !pagesSpec.trim()) {
      alert('Please enter page ranges to extract (e.g. 1-3, 5).')
      return
    }
    const ok = await submit({ file, mode, pages_spec: mode === 'custom' ? pagesSpec.trim() : '' })
    if (!ok) {
      alert('Failed to initialize split task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
    setNumPages(null)
    setPagesSpec('')
    setZoomPage(null)
    setIsPreviewOpen(false)
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
            <Scissors className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Split PDF</h1>
            <p className="text-sm text-muted mt-0.5">Extract page ranges or split every page into its own file.</p>
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
              Page count is detected automatically after upload. Ranges like 1-3, 5 are validated live.
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
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                  {numPages !== null ? ` · ${numPages} pages` : ' · reading…'}
                  {mode === 'custom' && selectedPages.size > 0 ? ` · ${selectedPages.size} selected` : ''}
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
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold">Split mode</span>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('custom')}
                      aria-pressed={mode === 'custom'}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        mode === 'custom'
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <span className="block text-[13px] font-semibold">Custom ranges</span>
                      <span className="block text-xs text-muted font-normal mt-0.5">Extract specific pages</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('all')}
                      aria-pressed={mode === 'all'}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        mode === 'all'
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <span className="block text-[13px] font-semibold">Split all pages</span>
                      <span className="block text-xs text-muted font-normal mt-0.5">One PDF per page, zipped</span>
                    </button>
                  </div>
                </div>

                {mode === 'custom' ? (
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label htmlFor="split-ranges" className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                      <span>Page ranges</span>
                      <span className="text-xs text-muted font-normal">e.g. 1-3, 5</span>
                    </label>
                    <input
                      id="split-ranges"
                      type="text"
                      value={pagesSpec}
                      onChange={(e) => setPagesSpec(e.target.value)}
                      placeholder="e.g. 1-3, 5"
                      className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                    />
                    <p className="text-xs text-muted leading-relaxed">
                      Commas separate pages or ranges. <span className="font-mono text-accent">1-3, 5</span> keeps pages 1, 2, 3 and 5 in one PDF.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted leading-relaxed">
                    Every page becomes its own file. You will download a <span className="font-mono text-accent">.zip</span> archive.
                  </p>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {mode === 'custom' ? 'Extract pages' : 'Split all pages'}
                </button>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">Result preview</span>
                  {numPages !== null && (
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {mode === 'custom'
                        ? `${selectedPagesList.length} pages`
                        : `${numPages} files`}
                    </span>
                  )}
                </div>

                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
                    {numPages !== null ? (
                      mode === 'custom' ? (
                        selectedPagesList.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                            {selectedPagesList.map((item, idx) => (
                              <motion.div
                                key={item.id}
                                layout
                                onClick={() => item.isValid && setZoomPage(item.originalPageNum)}
                                className={`relative aspect-[3/4] min-w-0 p-2 rounded-lg border flex flex-col transition-colors group cursor-pointer ${
                                  !item.isValid
                                    ? 'border-danger bg-danger-subtle'
                                    : 'border-border bg-background hover:border-success'
                                }`}
                              >
                                <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1 truncate">
                                  Output {idx + 1}
                                </div>
                                <div className="relative w-full flex-1 min-h-0 rounded border border-card-border bg-surface overflow-hidden mb-1.5">
                                  {item.isValid && fileUrl ? (
                                    <>
                                      <iframe
                                        loading="lazy"
                                        src={`${fileUrl}#page=${item.originalPageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                        className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                        title={`Page ${item.originalPageNum}`}
                                      />
                                      <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                        <div className="p-2 rounded-full bg-accent text-accent-foreground">
                                          <ZoomIn className="h-4 w-4" />
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">
                                      N/A
                                    </div>
                                  )}
                                </div>
                                <div className="flex w-full items-center justify-between gap-2 px-0.5 text-[10px] font-semibold text-muted">
                                  <span className="truncate">Source {item.originalPageNum}</span>
                                  <span className={`shrink-0 ${item.isValid ? 'text-success' : 'text-danger'}`}>
                                    {item.isValid ? 'Zoom' : 'Invalid'}
                                  </span>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center text-xs text-muted p-6">
                            <Scissors className="h-7 w-7 text-muted/40 mb-2" />
                            <span className="max-w-[26ch]">Type ranges above to see the output page order here.</span>
                          </div>
                        )
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                          {Array.from({ length: numPages }).map((_, index) => {
                            const pageNum = index + 1
                            return (
                              <motion.div
                                key={pageNum}
                                layout
                                onClick={() => setZoomPage(pageNum)}
                                className="relative aspect-[3/4] min-w-0 p-2 rounded-lg border border-border bg-background hover:border-accent flex flex-col transition-colors group cursor-pointer"
                              >
                                <div className="text-[10px] font-semibold text-accent uppercase tracking-wide mb-1 truncate">
                                  File {pageNum}
                                </div>
                                <div className="relative w-full flex-1 min-h-0 rounded border border-card-border bg-surface overflow-hidden mb-1.5">
                                  {fileUrl ? (
                                    <>
                                      <iframe
                                        loading="lazy"
                                        src={`${fileUrl}#page=${pageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                        className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                        title={`Page ${pageNum}`}
                                      />
                                      <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                        <div className="p-2 rounded-full bg-accent text-accent-foreground">
                                          <ZoomIn className="h-4 w-4" />
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">
                                      N/A
                                    </div>
                                  )}
                                </div>
                                <div className="flex w-full items-center justify-between gap-2 px-0.5 text-[10px] font-semibold text-muted">
                                  <span className="truncate">Page {pageNum}</span>
                                  <span className="shrink-0">Zoom</span>
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      )
                    ) : (
                      <div className="h-full min-h-[280px] flex items-center justify-center text-xs text-muted">
                        Reading document…
                      </div>
                    )}
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
                  message="Splitting PDF..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">PDF split done</h3>
                  <p className="text-sm text-muted mt-1">
                    Your files are ready. Download or preview them below.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download result</span>
                  </a>
                  {mode === 'custom' && (
                    <button
                      onClick={() => setIsPreviewOpen(true)}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                    >
                      <Eye className="h-4 w-4" />
                      <span>Preview PDF</span>
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Split another</span>
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
                  <h3 className="text-2xl font-bold">Split failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {submitError || 'An unexpected error occurred during processing.'}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors mt-2 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Try again</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isDone && mode === 'custom' && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl ?? ''}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_split.pdf` : "split.pdf"}
        />
      )}

      {zoomPage !== null && fileUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
          <div className="relative w-full max-w-4xl min-w-0 h-[85vh] max-h-[85vh] rounded-2xl border border-card-border bg-surface flex flex-col p-4 sm:p-6 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 mb-4 min-w-0">
              <div className="flex flex-col min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">Page {zoomPage} preview</h3>
                <p className="text-xs text-muted">Inspect layout and content in high resolution.</p>
              </div>
              <button
                onClick={() => setZoomPage(null)}
                className="shrink-0 text-muted hover:text-foreground cursor-pointer transition-colors px-4 py-2 rounded-xl border border-border bg-background hover:bg-surface-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0 w-full rounded-xl border border-card-border overflow-hidden bg-background">
              <iframe
                src={`${fileUrl}#page=${zoomPage}&toolbar=1&navpanes=0`}
                className="w-full h-full border-0"
                title={`Page ${zoomPage} Zoom Preview`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
