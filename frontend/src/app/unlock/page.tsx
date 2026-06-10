'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Unlock, Download, RefreshCw, AlertTriangle, Key, Eye } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function UnlockPage() {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId)

  // Cleanup job ID state on page exit
  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleSubmit = async () => {
    if (!file || !password) return
    setIsSubmitting(true)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('password', password)

    try {
      const response = await axios.post(`${API_URL}/api/unlock`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Failed to initialize decryption task. Please check password and server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPassword('')
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
            <Unlock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Unlock PDF</h1>
            <p className="text-muted mt-1">Remove passwords, encryption, and security locks from your PDF document.</p>
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

              {/* Password Entry */}
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <label className="text-sm font-bold flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted" />
                  <span>Enter current password</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter the password to decrypt this PDF"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !password}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Decrypting...' : 'Unlock PDF'}
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
                    message={jobStatus?.message || 'Decrypting/Unlocking PDF...'}
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
                    <h3 className="text-2xl font-bold">PDF Unlocked!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your decrypted PDF is ready and has no password locks. Click below to download.
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
                      <span>Download Unlocked PDF</span>
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
                      <span>Unlock Another</span>
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
                    <h3 className="text-2xl font-bold">Decryption Failed</h3>
                    <p className="text-sm text-muted mt-1">
                      {jobStatus?.message || 'Check your password or file. The decryption failed.'}
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
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_unlocked.pdf` : "unlocked.pdf"}
        />
      )}
    </div>
  )
}
