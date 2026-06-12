'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RotateCw, Download, RefreshCw, AlertTriangle, Eye, ZoomIn } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function RotatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [rotation, setRotation] = useState<90 | 180 | 270>(90)
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
    formData.append('rotation', rotation.toString())

    try {
      const response = await axios.post(`${API_URL}/api/rotate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Failed to initialize rotation task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setRotation(90)
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
            <RotateCw className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rotate PDF</h1>
            <p className="text-muted mt-1">Rotate all pages in your PDF document clockwise.</p>
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

                {/* Rotation Angle Options */}
                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <label className="text-sm font-bold">Rotation Angle</label>
                  <div className="grid grid-cols-3 gap-3">
                    {([90, 180, 270] as const).map((angle) => (
                      <button
                        key={angle}
                        type="button"
                        onClick={() => setRotation(angle)}
                        className={`py-3 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          rotation === angle
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'border-border bg-surface hover:bg-background'
                        }`}
                      >
                        {angle === 90 && '90° CW'}
                        {angle === 180 && '180° Flip'}
                        {angle === 270 && '90° CCW'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {isSubmitting ? 'Rotating...' : 'Rotate PDF'}
                </button>
              </div>

              {/* Right Column: Rotated Live Preview */}
              <div className="flex flex-col gap-4 w-full items-center">
                <div className="text-sm font-bold text-muted flex items-center gap-2 self-start md:self-center">
                  <RotateCw className="h-4 w-4 text-accent" />
                  <span>Real-time Rotation Preview</span>
                </div>
                
                <div 
                  onClick={() => fileUrl && setIsZoomOpen(true)}
                  className={`relative w-full aspect-square max-w-[320px] rounded-2xl border border-card-border bg-background overflow-hidden shadow-inner flex items-center justify-center p-4 transition-all group ${
                    fileUrl ? 'cursor-pointer hover:border-accent hover:shadow-[0_0_16px_rgba(var(--accent-rgb),0.25)]' : ''
                  }`}
                >
                  {fileUrl ? (
                    <div className="relative w-full h-full">
                      <div
                        className="w-full h-full transition-transform duration-500 ease-out"
                        style={{ transform: `rotate(${rotation}deg)` }}
                      >
                        <iframe
                          src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                          className="w-full h-full border-0 rounded-lg pointer-events-none"
                          title="Rotate Preview Viewport"
                        />
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
                  Showing visual layout preview. Output PDF pages will be permanently rotated.
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
                    message={jobStatus?.message || 'Rotating PDF pages...'}
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
                    <h3 className="text-2xl font-bold">PDF Rotated!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your pages have been rotated. Click below to download.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4 w-full justify-center items-stretch sm:items-center">
                    <a
                      href={
                        jobStatus.result.download_url.startsWith('http')
                          ? jobStatus.result.download_url
                          : `${API_URL}${jobStatus.result.download_url}`
                      }
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Rotated PDF</span>
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
                      <span>Rotate Another</span>
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
                    <h3 className="text-2xl font-bold">Rotation Failed</h3>
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
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_rotated.pdf` : "rotated.pdf"}
        />
      )}

      {/* Rotate Zoom Preview Modal */}
      {isZoomOpen && fileUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl h-[85vh] rounded-2xl border border-card-border bg-surface flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-foreground">Rotation Live Zoom</h3>
                <p className="text-xs text-muted">Inspect page layout and rotated reading orientation.</p>
              </div>
              <button
                onClick={() => setIsZoomOpen(false)}
                className="text-muted hover:text-foreground cursor-pointer transition-colors px-4 py-2 rounded-xl border border-border bg-background hover:bg-surface-hover font-semibold"
              >
                Close
              </button>
            </div>
            <div className="relative flex-1 w-full rounded-xl border border-card-border overflow-hidden bg-background">
              <div
                className="w-full h-full transition-transform duration-500 ease-out"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                <iframe
                  src={`${fileUrl}#toolbar=0&navpanes=0`}
                  className="w-full h-full border-0"
                  title="Rotate Zoom Preview Frame"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
