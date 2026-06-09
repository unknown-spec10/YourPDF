'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Grid, Download, RefreshCw, AlertTriangle, HelpCircle, Eye, ZoomIn } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function OrganizePage() {
  const [file, setFile] = useState<File | null>(null)
  const [pageOrder, setPageOrder] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
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

  // Get parsed sequence of page numbers
  const getParsedSequence = (): Array<{ id: string; pageNum: number; isDuplicate: boolean; isValid: boolean }> => {
    if (!pageOrder.trim()) return []
    const sequence: Array<{ id: string; pageNum: number; isDuplicate: boolean; isValid: boolean }> = []
    const parts = pageOrder.split(',')
    const seenCount: Record<number, number> = {}

    parts.forEach((part, index) => {
      const trimmed = part.trim()
      if (!trimmed) return
      const pageNum = parseInt(trimmed, 10)
      if (!isNaN(pageNum)) {
        const isValid = pageNum >= 1 && (numPages !== null ? pageNum <= numPages : true)
        seenCount[pageNum] = (seenCount[pageNum] || 0) + 1
        sequence.push({
          id: `${pageNum}-${index}`,
          pageNum,
          isDuplicate: seenCount[pageNum] > 1,
          isValid,
        })
      }
    })
    return sequence
  }

  const parsedSequence = getParsedSequence()

  // Get list of omitted original pages
  const getOmittedPages = (): number[] => {
    if (numPages === null) return []
    const activePages = new Set(parsedSequence.map(p => p.pageNum))
    const omitted: number[] = []
    for (let i = 1; i <= numPages; i++) {
      if (!activePages.has(i)) {
        omitted.push(i)
      }
    }
    return omitted
  }

  const omittedPages = getOmittedPages()

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId)

  // Cleanup job ID state on page exit
  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleSubmit = async () => {
    if (!file || !pageOrder) return
    setIsSubmitting(true)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('page_order', pageOrder)

    try {
      const response = await axios.post(`${API_URL}/api/organize`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Failed to initialize organize task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPageOrder('')
    setJobId(null)
    setNumPages(null)
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
            <Grid className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Organize PDF</h1>
            <p className="text-muted mt-1">Reorder, repeat, or delete pages inside a PDF document.</p>
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

                {/* Page Order Selection */}
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <label className="text-sm font-bold flex items-center justify-between">
                    <span>Page Order Sequence</span>
                    <span className="text-xs text-muted font-normal flex items-center gap-1">
                      <HelpCircle className="h-3.5 w-3.5" />
                      <span>e.g., 2,1,4 to reorder / delete</span>
                    </span>
                  </label>
                  <input
                    type="text"
                    value={pageOrder}
                    onChange={(e) => setPageOrder(e.target.value)}
                    placeholder="Enter comma-separated page numbers (e.g. 1, 3, 2, 4)"
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                  />
                  <p className="text-xs text-muted leading-relaxed mt-1">
                    Specify the sequence of page numbers you want in your final PDF. Missing pages will be omitted (deleted), and repeating numbers will duplicate pages.
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !pageOrder}
                  className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {isSubmitting ? 'Organizing...' : 'Organize PDF'}
                </button>
              </div>

              {/* Right Column: Comparative Workspace */}
              <div className="flex flex-col gap-4 w-full lg:col-span-8">
                <div className="text-sm font-bold text-muted flex items-center gap-2 self-start">
                  <Grid className="h-4 w-4 text-accent" />
                  <span>Interactive Organize Workspace</span>
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

                  {/* Right sub-panel: Organize Flow */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-card-border bg-background/30 h-full">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider flex justify-between items-center">
                      <span>Reorganized Flow</span>
                      {numPages !== null && (
                        <span className="text-accent normal-case font-semibold">
                          {parsedSequence.length} Pages Output
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-h-[300px] max-h-[420px] overflow-y-auto p-3 rounded-lg bg-surface border border-card-border custom-scrollbar flex flex-col gap-4">
                      {parsedSequence.length > 0 ? (
                        <>
                          <div className="grid grid-cols-2 gap-3.5">
                            {parsedSequence.map((item, idx) => (
                              <motion.div
                                key={item.id}
                                layout
                                onClick={() => item.isValid && setZoomPage(item.pageNum)}
                                className={`relative aspect-[3/4] p-2 rounded-lg border flex flex-col justify-between items-center transition-all group cursor-pointer ${
                                  !item.isValid
                                    ? 'border-rose-500 bg-rose-500/10 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                                    : item.isDuplicate
                                    ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:border-amber-400 hover:shadow-[0_0_16px_rgba(245,158,11,0.25)]'
                                    : 'border-accent bg-accent/5 hover:border-accent hover:shadow-[0_0_16px_rgba(var(--accent-rgb),0.25)]'
                                }`}
                              >
                                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                                  Pos {idx + 1}
                                </div>

                                {/* Visual Page Thumbnail with scrollbars cropped out */}
                                <div className="relative w-full flex-1 rounded border border-card-border bg-background overflow-hidden mb-1.5 shadow-inner">
                                  {item.isValid && fileUrl ? (
                                    <>
                                      <iframe
                                        src={`${fileUrl}#page=${item.pageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                        className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                        title={`Page ${item.pageNum}`}
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
                                  <span>Src: {item.pageNum}</span>
                                  <span className={!item.isValid ? 'text-rose-400' : item.isDuplicate ? 'text-amber-400' : 'text-accent'}>
                                    {!item.isValid ? 'Invalid' : item.isDuplicate ? 'Copy' : 'Original'}
                                  </span>
                                </div>
                              </motion.div>
                            ))}
                          </div>

                          {/* Omitted Pages Section */}
                          {omittedPages.length > 0 && (
                            <div className="border-t border-border/50 pt-3 mt-1">
                              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Omitted / Deleted Pages</div>
                              <div className="flex flex-wrap gap-1.5">
                                {omittedPages.map(page => (
                                  <span
                                    key={page}
                                    className="text-xs bg-background/50 border border-border px-2 py-0.5 rounded line-through text-muted/65"
                                  >
                                    Page {page}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted p-4">
                          <Grid className="h-8 w-8 text-muted/30 mb-2" />
                          <span>Enter a page sequence (e.g. 2,1,3) in the input field to preview layout.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-center text-xs text-muted max-w-lg mx-auto mt-2">
                  Verify the target page positioning (Pos) and duplicate copies (Copy) or omitted pages in the flow above.
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
                    message={jobStatus?.message || 'Organizing PDF pages...'}
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
                    <h3 className="text-2xl font-bold">PDF Reorganized!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your reorganized PDF file is ready. Click below to download.
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
                      <span>Download Organized PDF</span>
                    </a>
                    <button
                      onClick={() => setIsPreviewOpen(true)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <Eye className="h-4 w-4" />
                      <span>Preview PDF</span>
                    </button>
                    <button
                      onClick={handleReset}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Organize Another</span>
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
                    <h3 className="text-2xl font-bold">Organization Failed</h3>
                    <p className="text-sm text-muted mt-1">
                      {jobStatus?.message || 'Verify your page order input. Reorganization failed.'}
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

      {isDone && jobStatus?.result && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={
            jobStatus.result.download_url.startsWith('http')
              ? jobStatus.result.download_url
              : `${API_URL}${jobStatus.result.download_url}`
          }
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_organized.pdf` : "organized.pdf"}
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
