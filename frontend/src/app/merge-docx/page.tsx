'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileText, ArrowUp, ArrowDown, X, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function MergeDocxPage() {
  const [files, setFiles] = useState<File[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, () => {})

  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleFileAccepted = (file: File) => {
    setFiles((prev) => [...prev, file])
  }

  const handleRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setFiles((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index - 1]
      copy[index - 1] = temp
      return copy
    })
  }

  const handleMoveDown = (index: number) => {
    if (index === files.length - 1) return
    setFiles((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index + 1]
      copy[index + 1] = temp
      return copy
    })
  }

  const handleSubmit = async () => {
    if (files.length < 2) {
      alert('Please select at least 2 Word documents to merge.')
      return
    }
    setIsSubmitting(true)
    
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    try {
      const response = await axios.post(`${API_URL}/api/office/merge-docx`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err) {
      console.error(err)
      alert('Failed to initialize Word merge task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFiles([])
    setJobId(null)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const dm = 2
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  const isQueued = jobStatus?.status === 'queued'
  const isProcessing = jobStatus?.status === 'processing'
  const isDone = jobStatus?.status === 'done'
  const isError = jobStatus?.status === 'error' || !!pollError

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 flex-1 flex flex-col justify-center">
      {/* Header */}
      <div className="mb-8">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Merge Word Documents</h1>
            <p className="text-muted mt-1">Combine multiple Word documents (.docx) into one file in seconds.</p>
          </div>
        </div>
      </div>

      {/* Main Box */}
      <div className="rounded-2xl border border-card-border bg-surface p-6 md:p-8 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {files.length === 0 && !jobId && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DropZone
                onFileAccepted={handleFileAccepted}
                accept={{ 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }}
                placeholderText="Drop your Word files here (DOCX)"
              />
            </motion.div>
          )}

          {files.length > 0 && !jobId && (
            <motion.div
              key="file-list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              {/* Files Map */}
              <div className="flex flex-col gap-3">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-background p-4"
                  >
                    <div className="min-w-0 pr-4">
                      <p className="text-sm font-semibold text-foreground truncate max-w-[200px] sm:max-w-md">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted mt-0.5">{formatBytes(file.size)}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-surface hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === files.length - 1}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-surface hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemove(index)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Delete"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add More File Trigger */}
              <DropZone
                onFileAccepted={handleFileAccepted}
                accept={{ 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }}
                disabled={isSubmitting}
                placeholderText="Click or drop to add more Word documents"
              />

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={files.length < 2 || isSubmitting}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
              >
                {isSubmitting ? 'Merging documents...' : `Merge ${files.length} Word Documents`}
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
              {(isQueued || isProcessing) && (
                <div className="w-full max-w-md">
                  <ProgressBar
                    progress={jobStatus?.progress || 0}
                    message={jobStatus?.message || 'Merging documents...'}
                  />
                </div>
              )}

              {isDone && jobStatus?.result && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Word Documents Merged!</h3>
                    <p className="text-sm text-muted mt-1">Your combined DOCX file is ready. Click below to download.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4 w-full justify-center items-stretch sm:items-center">
                    <a
                      href={
                        jobStatus.result.download_url.startsWith('http')
                          ? jobStatus.result.download_url
                          : `${API_URL}${jobStatus.result.download_url}`
                      }
                      download
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download DOCX</span>
                    </a>
                    <button
                      onClick={handleReset}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Merge More Files</span>
                    </button>
                  </div>
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Merge Failed</h3>
                    <p className="text-sm text-muted mt-1">{jobStatus?.message || 'An unexpected error occurred during processing.'}</p>
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
    </div>
  )
}
