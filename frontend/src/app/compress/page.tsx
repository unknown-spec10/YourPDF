'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileSpreadsheet, Settings, Download, RefreshCw, AlertTriangle, Eye } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const dm = 2
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(dm)) + ' ' + sizes[i]
}

export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [jobId, setJobId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

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
    setIsSubmitting(true)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('quality', quality)

    try {
      const response = await axios.post(`${API_URL}/api/compress`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err) {
      console.error(err)
      alert('Failed to initialize compression task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
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
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Compress PDF</h1>
            <p className="text-muted mt-1">Reduce PDF file size while maintaining maximum quality.</p>
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
              className="flex flex-col gap-6"
            >
              <FilePreview fileName={file.name} fileSize={file.size} onRemove={handleReset} />

              {/* Advanced Options */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  <span>Advanced options</span>
                </button>

                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 p-4 rounded-xl bg-background border border-border flex flex-col gap-3"
                  >
                    <label className="text-sm font-bold">Compression Level</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['low', 'medium', 'high'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setQuality(lvl)}
                          className={`py-2 px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                            quality === lvl
                              ? 'bg-accent/10 border-accent text-accent'
                              : 'border-border bg-surface hover:bg-background'
                          }`}
                        >
                          {lvl === 'low' && 'Low'}
                          {lvl === 'medium' && 'Medium'}
                          {lvl === 'high' && 'High'}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-muted leading-relaxed mt-1 flex flex-col gap-1.5">
                      {quality === 'low' && (
                        <>
                          <span><strong>Low Compression (300 DPI)</strong>: Minimal compression, highest print quality. Recommended for printing.</span>
                          {file && (
                            <span className="text-accent font-semibold">Estimated size: ~{formatBytes(file.size * 0.8)} (~20% reduction)</span>
                          )}
                        </>
                      )}
                      {quality === 'medium' && (
                        <>
                          <span><strong>Medium Compression (150 DPI)</strong>: Balanced compression and quality. Recommended for e-books and general use.</span>
                          {file && (
                            <span className="text-accent font-semibold">Estimated size: ~{formatBytes(file.size * 0.4)} (~60% reduction)</span>
                          )}
                        </>
                      )}
                      {quality === 'high' && (
                        <>
                          <span><strong>High/Maximum Compression (72 DPI)</strong>: Maximum file size reduction. Recommended for web and screens.</span>
                          {file && (
                            <span className="text-accent font-semibold">Estimated size: ~{formatBytes(file.size * 0.2)} (~80% reduction)</span>
                          )}
                        </>
                      )}
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Initializing...' : 'Compress PDF'}
              </button>
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
                    message={jobStatus?.message || 'Processing task...'}
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
                    <h3 className="text-2xl font-bold">Compression Done!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your compressed PDF is ready. Click the button below to download.
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
                      <span>Compress Another</span>
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
                    <h3 className="text-2xl font-bold">Processing Failed</h3>
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
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_compressed.pdf` : "compressed.pdf"}
        />
      )}
    </div>
  )
}
