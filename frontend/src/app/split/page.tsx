'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Scissors, Settings, Download, RefreshCw, AlertTriangle, Eye, ZoomIn } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'custom' | 'all'>('custom')
  const [pagesSpec, setPagesSpec] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
      axios.post(`${API_URL}/api/pdf-info`, formData)
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

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, (data) => {
    // Auto trigger disabled - file downloads only when user clicks download button
  })

  // Cleanup job ID state on page exit
  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleSubmit = async () => {
    if (!file) return
    if (mode === 'custom' && !pagesSpec.trim()) {
      alert('Please enter page ranges to extract (e.g. 1-3, 5).')
      return
    }
    
    setIsSubmitting(true)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', mode)
    formData.append('pages_spec', mode === 'custom' ? pagesSpec.trim() : '')

    try {
      const response = await axios.post(`${API_URL}/api/split`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Failed to initialize split task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setJobId(null)
    setNumPages(null)
    setPagesSpec('')
  }

  const isQueued = jobStatus?.status === 'queued'
  const isProcessing = jobStatus?.status === 'processing'
  const isDone = jobStatus?.status === 'done'
  const isError = jobStatus?.status === 'error' || !!pollError

  return (
    <div className={`mx-auto w-full px-6 py-12 flex-1 flex flex-col justify-center transition-all duration-300 ${file ? 'max-w-[1400px]' : 'max-w-3xl'}`}>
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Scissors className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Split PDF</h1>
            <p className="text-muted mt-1">Extract specific page ranges or split all pages into separate files.</p>
          </div>
        </div>
      </div>

      {/* Main Form Box */}
      <div className="rounded-2xl border border-card-border bg-surface p-6 md:p-8 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {!file && !jobId && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DropZone onFileAccepted={setFile} />
            </motion.div>
          )}

          {file && !jobId && (
            <motion.div
              key="file-selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left Column: Settings */}
              <div className="flex flex-col gap-6 lg:col-span-4">
                <FilePreview fileName={file.name} fileSize={file.size} onRemove={handleReset} />

                {/* Split Settings */}
                <div className="border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Split settings</span>
                  </button>

                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 p-4 rounded-xl bg-background border border-border flex flex-col gap-4"
                    >
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold">Split Mode</label>
                        <div className="grid grid-cols-1 gap-3">
                          <button
                            type="button"
                            onClick={() => setMode('custom')}
                            className={`py-3 px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer text-center flex flex-col gap-1 ${
                              mode === 'custom'
                                ? 'bg-accent/10 border-accent text-accent'
                                : 'border-border bg-surface hover:bg-background'
                            }`}
                          >
                            <span className="font-bold">Custom Ranges</span>
                            <span className="text-xs text-muted font-normal">Extract specific pages</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode('all')}
                            className={`py-3 px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer text-center flex flex-col gap-1 ${
                              mode === 'all'
                                ? 'bg-accent/10 border-accent text-accent'
                                : 'border-border bg-surface hover:bg-background'
                            }`}
                          >
                            <span className="font-bold">Split All Pages</span>
                            <span className="text-xs text-muted font-normal">Every page as a single PDF</span>
                          </button>
                        </div>
                      </div>

                      {mode === 'custom' && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-2"
                        >
                          <label className="text-sm font-bold flex items-center justify-between">
                            <span>Page Ranges</span>
                            <span className="text-xs text-muted font-normal">e.g. 1-3, 5, 7-10</span>
                          </label>
                          <input
                            type="text"
                            value={pagesSpec}
                            onChange={(e) => setPagesSpec(e.target.value)}
                            placeholder="e.g. 1-3, 5"
                            className="w-full h-11 px-4 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                          />
                          <p className="text-xs text-muted leading-relaxed mt-0.5">
                            Use commas to separate page numbers or ranges. For example, <code className="bg-surface px-1 py-0.5 rounded text-accent font-semibold">1-3, 5</code> extracts pages 1, 2, 3, and 5 into a single combined PDF.
                          </p>
                        </motion.div>
                      )}

                      {mode === 'all' && (
                        <p className="text-xs text-muted leading-relaxed">
                          Every single page of the PDF will be extracted as its own file and zipped together. You will download a <code className="bg-surface px-1 py-0.5 rounded text-accent font-semibold">.zip</code> archive.
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {isSubmitting ? 'Initializing...' : mode === 'custom' ? 'Extract Pages' : 'Split All Pages'}
                </button>
              </div>

              {/* Right Column: Comparative Workspace */}
              <div className="flex flex-col gap-4 w-full lg:col-span-8">
                <div className="text-sm font-bold text-muted flex items-center gap-2 self-start">
                  <Scissors className="h-4 w-4 text-accent" />
                  <span>Interactive Split Workspace</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  {/* Left sub-panel: Original Document */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-card-border bg-background/30">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider">Original Document</div>
                    <div className="relative w-full aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden shadow-inner flex items-center justify-center">
                      {fileUrl ? (
                        <iframe
                          src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                          className="w-full h-full border-0 rounded-lg"
                          title="Original PDF Preview"
                        />
                      ) : (
                        <div className="text-xs text-muted">No document loaded</div>
                      )}
                    </div>
                  </div>

                  {/* Right sub-panel: Split Visualizer */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-card-border bg-background/30 h-full">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider flex justify-between items-center">
                      <span>Split Visualizer</span>
                      {numPages !== null && (
                        <span className="text-accent normal-case font-semibold">
                          {mode === 'custom' 
                            ? `${selectedPagesList.length} Pages Output`
                            : `${numPages} Separate Files`}
                        </span>
                      )}
                    </div>

                     <div className="flex-1 min-h-[300px] max-h-[420px] overflow-y-auto p-3 rounded-lg bg-surface border border-card-border custom-scrollbar">
                      {numPages !== null ? (
                        mode === 'custom' ? (
                          selectedPagesList.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3.5">
                              {selectedPagesList.map((item, idx) => (
                                <motion.div
                                  key={item.id}
                                  layout
                                  onClick={() => item.isValid && setZoomPage(item.originalPageNum)}
                                  className={`relative aspect-[3/4] p-2 rounded-lg border flex flex-col justify-between items-center transition-all group cursor-pointer ${
                                    !item.isValid
                                      ? 'border-rose-500 bg-rose-500/10 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                                      : 'border-emerald-500 bg-emerald-500/10 hover:border-emerald-400 hover:shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                                  }`}
                                >
                                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                                    Result Page {idx + 1}
                                  </div>

                                  {/* Visual Page Thumbnail with scrollbars cropped out */}
                                  <div className="relative w-full flex-1 rounded border border-card-border bg-background overflow-hidden mb-1.5 shadow-inner">
                                    {item.isValid && fileUrl ? (
                                      <>
                                        <iframe
                                          src={`${fileUrl}#page=${item.originalPageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                          className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                          title={`Page ${item.originalPageNum}`}
                                        />
                                        {/* Hover Overlay */}
                                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                          <div className="p-2 rounded-full bg-accent/90 text-accent-foreground shadow-lg">
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

                                  <div className="flex w-full items-center justify-between px-1 text-[9px] font-bold text-muted-foreground">
                                    <span>Src: {item.originalPageNum}</span>
                                    <span className={item.isValid ? 'text-emerald-400' : 'text-rose-400'}>
                                      {item.isValid ? 'Click to Zoom' : 'Invalid'}
                                    </span>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted p-4">
                              <Scissors className="h-8 w-8 text-muted/30 mb-2" />
                              <span>Enter page ranges (e.g. 1-3, 5) to preview the resulting PDF structure.</span>
                            </div>
                          )
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {Array.from({ length: numPages }).map((_, index) => {
                              const pageNum = index + 1
                              return (
                                <motion.div
                                  key={pageNum}
                                  layout
                                  className="p-3 rounded-lg border border-accent/20 bg-accent/5 flex flex-col items-center justify-center gap-1.5"
                                >
                                  <div className="text-[10px] font-bold text-accent uppercase tracking-wider">File {pageNum}</div>
                                  <div className="text-xs font-bold text-foreground">Page {pageNum}</div>
                                  <span className="text-[9px] text-muted font-normal bg-background/50 px-1.5 py-0.5 rounded">
                                    Individual PDF
                                  </span>
                                </motion.div>
                              )
                            })}
                          </div>
                        )
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted">
                          Analyzing document structure...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-center text-xs text-muted max-w-lg mx-auto mt-2">
                  {mode === 'custom'
                    ? 'Verify the resulting output PDF page layout and source pages in the visualizer above.'
                    : 'All pages of the original document will be split into individual single-page PDF files.'}
                </div>
              </div>
            </motion.div>
          )}

          {jobId && (
            <motion.div
              key="processing-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center py-6 text-center"
            >
              {/* Queued / Processing States */}
              {(isQueued || isProcessing) && (
                <div className="w-full max-w-md">
                  <ProgressBar
                    progress={jobStatus?.progress || 0}
                    message={jobStatus?.message || 'Splitting PDF...'}
                  />
                </div>
              )}

              {/* Success State */}
              {isDone && jobStatus?.result && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">PDF Split Done!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your files are ready. Click the button below to download.
                    </p>
                  </div>
                  <div className="flex gap-4 mt-4">
                    <a
                      href={
                        jobStatus.result.download_url.startsWith('http')
                          ? jobStatus.result.download_url
                          : `${API_URL}${jobStatus.result.download_url}`
                      }
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Result</span>
                    </a>
                    {mode === 'custom' && (
                      <button
                        onClick={() => setIsPreviewOpen(true)}
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                        <span>Preview PDF</span>
                      </button>
                    )}
                    <button
                      onClick={handleReset}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Split Another</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error State */}
              {isError && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Split Failed</h3>
                    <p className="text-sm text-muted mt-1">
                      {jobStatus?.message || 'An unexpected error occurred during processing.'}
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors mt-4 cursor-pointer"
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

      {isDone && mode === 'custom' && jobStatus?.result && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={
            jobStatus.result.download_url.startsWith('http')
              ? jobStatus.result.download_url
              : `${API_URL}${jobStatus.result.download_url}`
          }
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_split.pdf` : "split.pdf"}
        />
      )}

      {/* Interactive Page Zoom Modal */}
      {zoomPage !== null && fileUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl h-[85vh] rounded-2xl border border-card-border bg-surface flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-foreground">Page {zoomPage} Preview</h3>
                <p className="text-xs text-muted">Inspect page layout and content details in high resolution.</p>
              </div>
              <button
                onClick={() => setZoomPage(null)}
                className="text-muted hover:text-foreground cursor-pointer transition-colors px-4 py-2 rounded-xl border border-border bg-background hover:bg-surface-hover font-semibold"
              >
                Close
              </button>
            </div>
            <div className="flex-1 w-full rounded-xl border border-card-border overflow-hidden bg-background">
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
