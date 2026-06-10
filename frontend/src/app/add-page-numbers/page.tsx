'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Hash, Download, RefreshCw, AlertTriangle, Eye, ZoomIn } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function AddPageNumbersPage() {
  const [file, setFile] = useState<File | null>(null)
  const [position, setPosition] = useState('bottom-center')
  const [jobId, setJobId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
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

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId)

  // Cleanup job ID state on page exit
  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleSubmit = async () => {
    if (!file) return
    setIsSubmitting(true)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('position', position)

    try {
      const response = await axios.post(`${API_URL}/api/add-page-numbers`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Failed to initialize page numbering task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPosition('bottom-center')
    setJobId(null)
  }

  const isQueued = jobStatus?.status === 'queued'
  const isProcessing = jobStatus?.status === 'processing'
  const isDone = jobStatus?.status === 'done'
  const isError = jobStatus?.status === 'error' || !!pollError

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 flex-1 flex flex-col justify-center">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Hash className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Add Page Numbers</h1>
            <p className="text-muted mt-1">Stamp dynamic page numbers onto headers or footers in your PDF document.</p>
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
              className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start"
            >
              {/* Left Column: Settings */}
              <div className="flex flex-col gap-6">
                <FilePreview fileName={file.name} fileSize={file.size} onRemove={handleReset} />

                {/* Position Selection */}
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <label className="text-sm font-bold">Number Location / Position</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="bottom-left">Footer Left</option>
                    <option value="bottom-center">Footer Center</option>
                    <option value="bottom-right">Footer Right</option>
                    <option value="top-left">Header Left</option>
                    <option value="top-center">Header Center</option>
                    <option value="top-right">Header Right</option>
                  </select>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {isSubmitting ? 'Numbering...' : 'Add Page Numbers'}
                </button>
              </div>

              {/* Right Column: Numbers Position Live Preview */}
              <div className="flex flex-col gap-4 w-full items-center">
                <div className="text-sm font-bold text-muted flex items-center gap-2 self-start md:self-center">
                  <Hash className="h-4 w-4 text-accent" />
                  <span>Real-time Placement Preview</span>
                </div>
                
                <div 
                  onClick={() => fileUrl && setIsZoomOpen(true)}
                  className={`relative w-full aspect-square max-w-[320px] rounded-2xl border border-card-border bg-background overflow-hidden shadow-inner flex items-center justify-center p-4 transition-all group ${
                    fileUrl ? 'cursor-pointer hover:border-accent hover:shadow-[0_0_16px_rgba(var(--accent-rgb),0.25)]' : ''
                  }`}
                >
                  {fileUrl ? (
                    <div className="relative w-full h-full">
                      <iframe
                        src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full border-0 rounded-lg pointer-events-none"
                        title="Page Numbering Preview Viewport"
                      />
                      {/* Page Number Placement Visual Badge */}
                      <div className="absolute inset-0 pointer-events-none p-8">
                        <span
                          className={`absolute text-[10px] font-mono font-bold bg-accent/90 text-accent-foreground px-2 py-0.5 rounded shadow-md border border-accent/20 transition-all duration-300 ease-in-out whitespace-nowrap`}
                          style={{
                            top: position.startsWith('top') ? '24px' : 'auto',
                            bottom: position.startsWith('bottom') ? '24px' : 'auto',
                            left: position.endsWith('left') ? '24px' :
                                  position.endsWith('center') ? '50%' : 'auto',
                            right: position.endsWith('right') ? '24px' : 'auto',
                            transform: position.endsWith('center') ? 'translateX(-50%)' : 'none',
                          }}
                        >
                          Page 1 of 5
                        </span>
                      </div>

                      {/* Hover overlay mask */}
                      <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg pointer-events-none">
                        <div className="p-2.5 rounded-full bg-accent/90 text-accent-foreground shadow-lg">
                          <ZoomIn className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted">No document loaded</div>
                  )}
                </div>
                <div className="text-center text-xs text-muted max-w-[280px]">
                  Showing visual layout preview. Numbers will dynamically scale across all pages.
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
                    message={jobStatus?.message || 'Numbering PDF pages...'}
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
                    <h3 className="text-2xl font-bold">Page Numbers Added!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your numbered PDF is ready. Click below to download.
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
                      <span>Download PDF</span>
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
                      <span>Number Another</span>
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
                    <h3 className="text-2xl font-bold">Numbering Failed</h3>
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

      {isDone && jobStatus?.result && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={
            jobStatus.result.download_url.startsWith('http')
              ? jobStatus.result.download_url
              : `${API_URL}${jobStatus.result.download_url}`
          }
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_numbered.pdf` : "numbered.pdf"}
        />
      )}

      {/* Page Number Zoom Preview Modal */}
      {isZoomOpen && fileUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl h-[85vh] rounded-2xl border border-card-border bg-surface flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-foreground">Placement Live Zoom</h3>
                <p className="text-xs text-muted">Inspect page numbering position and scaling layout.</p>
              </div>
              <button
                onClick={() => setIsZoomOpen(false)}
                className="text-muted hover:text-foreground cursor-pointer transition-colors px-4 py-2 rounded-xl border border-border bg-background hover:bg-surface-hover font-semibold"
              >
                Close
              </button>
            </div>
            <div className="relative flex-1 w-full rounded-xl border border-card-border overflow-hidden bg-background">
              <iframe
                src={`${fileUrl}#toolbar=0&navpanes=0`}
                className="w-full h-full border-0"
                title="Page Numbering Zoom Preview Frame"
              />
              
              {/* Scaled Page Number Visual Badge */}
              <div className="absolute inset-0 pointer-events-none p-12">
                <span
                  className={`absolute text-xs sm:text-sm font-mono font-bold bg-accent/90 text-accent-foreground px-3 py-1 rounded shadow-lg border border-accent/30 transition-all duration-300 ease-in-out whitespace-nowrap`}
                  style={{
                    top: position.startsWith('top') ? '32px' : 'auto',
                    bottom: position.startsWith('bottom') ? '32px' : 'auto',
                    left: position.endsWith('left') ? '32px' :
                          position.endsWith('center') ? '50%' : 'auto',
                    right: position.endsWith('right') ? '32px' : 'auto',
                    transform: position.endsWith('center') ? 'translateX(-50%)' : 'none',
                  }}
                >
                  Page 1 of 5
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
