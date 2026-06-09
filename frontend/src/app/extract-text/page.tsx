'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileText, Settings, Download, RefreshCw, AlertTriangle, Copy, Check, FileDown, Search } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ExtractTextPage() {
  const [file, setFile] = useState<File | null>(null)
  const [exportTxt, setExportTxt] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Text display states
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [extractedText, setExtractedText] = useState('')

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, (data) => {
    // Auto trigger disabled - file downloads only when user clicks download button
    if (data.result?.extracted_text) {
      setExtractedText(data.result.extracted_text)
    }
  })

  // Cleanup job ID state on page exit
  useEffect(() => {
    return () => {
      setJobId(null)
      setExtractedText('')
    }
  }, [])

  const handleSubmit = async () => {
    if (!file) return
    setIsSubmitting(true)
    setExtractedText('')
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('export_txt', exportTxt.toString())

    try {
      const response = await axios.post(`${API_URL}/api/extract-text`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Failed to initialize text extraction. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setJobId(null)
    setExtractedText('')
    setSearchQuery('')
  }

  const handleCopy = () => {
    if (!extractedText) return
    navigator.clipboard.writeText(extractedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isQueued = jobStatus?.status === 'queued'
  const isProcessing = jobStatus?.status === 'processing'
  const isDone = jobStatus?.status === 'done'
  const isError = jobStatus?.status === 'error' || !!pollError

  // Highlight matches in the extracted text (simple search display)
  const getFilteredText = () => {
    if (!searchQuery) return extractedText
    // Simple filter
    return extractedText
  }

  const wordCount = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0
  const charCount = extractedText ? extractedText.length : 0

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
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Extract Text</h1>
            <p className="text-muted mt-1">Extract text content from PDF files and download as txt or view instantly.</p>
          </div>
        </div>
      </div>

      {/* Main Box */}
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

              {/* Extraction Options */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  <span>Extraction settings</span>
                </button>

                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 p-4 rounded-xl bg-background border border-border flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-bold">Extraction Mode</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setExportTxt(false)}
                          className={`py-3 px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer text-center flex flex-col gap-1 ${
                            !exportTxt
                              ? 'bg-accent/10 border-accent text-accent'
                              : 'border-border bg-surface hover:bg-background'
                          }`}
                        >
                          <span className="font-bold">View in Browser</span>
                          <span className="text-xs text-muted font-normal">Read & copy text directly</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportTxt(true)}
                          className={`py-3 px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer text-center flex flex-col gap-1 ${
                            exportTxt
                              ? 'bg-accent/10 border-accent text-accent'
                              : 'border-border bg-surface hover:bg-background'
                          }`}
                        >
                          <span className="font-bold">Download as TXT</span>
                          <span className="text-xs text-muted font-normal">Save text as a .txt file</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Initializing...' : 'Extract Text'}
              </button>
            </motion.div>
          )}

          {jobId && (
            <motion.div
              key="processing-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center py-2 text-center"
            >
              {/* Queued / Processing States */}
              {(isQueued || isProcessing) && (
                <div className="w-full max-w-md py-6">
                  <ProgressBar
                    progress={jobStatus?.progress || 0}
                    message={jobStatus?.message || 'Extracting PDF text content...'}
                  />
                </div>
              )}

              {/* Success State - Export TXT */}
              {isDone && exportTxt && jobStatus?.result && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Text Extracted!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your extracted text file (.txt) is ready. Click below to download.
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
                      <span>Download TXT File</span>
                    </a>
                    <button
                      onClick={handleReset}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Extract More</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Success State - View in Browser */}
              {isDone && !exportTxt && extractedText && (
                <div className="w-full text-left flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <h3 className="text-lg font-bold">Extracted Content</h3>
                      <p className="text-xs text-muted mt-0.5">
                        {wordCount.toLocaleString()} words &bull; {charCount.toLocaleString()} characters
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-background transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-emerald-500">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-muted" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleReset}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-background transition-colors cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-muted" />
                        <span>Extract Another</span>
                      </button>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search within extracted text..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>

                  {/* Text Reader Viewport */}
                  <div className="rounded-xl border border-border bg-background p-4 h-96 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap select-text selection:bg-accent/30">
                    {extractedText}
                  </div>
                </div>
              )}

              {/* Error State */}
              {isError && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Extraction Failed</h3>
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
    </div>
  )
}
