'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Maximize, Settings, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function ResizeImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'pixels' | 'percentage'>('pixels')
  
  // Pixels parameters
  const [width, setWidth] = useState<string>('')
  const [height, setHeight] = useState<string>('')
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true)
  
  // Percentage parameters
  const [percentage, setPercentage] = useState<number>(50)
  
  const [jobId, setJobId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, () => {})

  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleSubmit = async () => {
    if (!file) return
    setIsSubmitting(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('maintain_aspect', String(maintainAspect))

    if (mode === 'percentage') {
      formData.append('percentage', String(percentage))
    } else {
      if (width) formData.append('width', width)
      if (height) formData.append('height', height)
    }

    try {
      const response = await axios.post(`${API_URL}/api/image/resize`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err) {
      console.error(err)
      alert('Failed to initialize image resizing task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setJobId(null)
    setWidth('')
    setHeight('')
    setPercentage(50)
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
            <Maximize className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Resize Image</h1>
            <p className="text-muted mt-1">Scale width and height dimensions by pixels or percentage.</p>
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
              <DropZone
                onFileAccepted={setFile}
                accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
                placeholderText="Drop your image here to resize"
              />
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

              {/* Mode Select */}
              <div className="flex border-b border-border">
                <button
                  type="button"
                  onClick={() => setMode('pixels')}
                  className={`flex-1 py-2 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${
                    mode === 'pixels' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground'
                  }`}
                >
                  By Pixels
                </button>
                <button
                  type="button"
                  onClick={() => setMode('percentage')}
                  className={`flex-1 py-2 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${
                    mode === 'percentage' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground'
                  }`}
                >
                  By Percentage
                </button>
              </div>

              {/* Pixel Parameters */}
              {mode === 'pixels' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold">Width (px)</label>
                    <input
                      type="number"
                      placeholder="Auto"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold">Height (px)</label>
                    <input
                      type="number"
                      placeholder="Auto"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="maintainAspect"
                      checked={maintainAspect}
                      onChange={(e) => setMaintainAspect(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <label htmlFor="maintainAspect" className="text-sm font-semibold text-muted select-none cursor-pointer">
                      Lock aspect ratio (highly recommended to prevent stretching)
                    </label>
                  </div>
                </div>
              )}

              {/* Percentage Parameters */}
              {mode === 'percentage' && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold">Percentage</label>
                    <span className="text-sm font-bold text-accent">{percentage}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={percentage}
                    onChange={(e) => setPercentage(Number(e.target.value))}
                    className="w-full accent-accent bg-border h-2 rounded-lg cursor-pointer"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75, 90].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPercentage(val)}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          percentage === val
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'border-border bg-surface hover:bg-background'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || (mode === 'pixels' && !width && !height)}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Resizing...' : 'Resize Image'}
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
                    message={jobStatus?.message || 'Processing image...'}
                  />
                </div>
              )}

              {isDone && jobStatus?.result && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Resizing Complete!</h3>
                    {jobStatus.result.width && jobStatus.result.height && (
                      <p className="text-sm text-accent font-semibold mt-1">
                        New dimensions: {jobStatus.result.width} × {jobStatus.result.height} px
                      </p>
                    )}
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
                      <span>Download Image</span>
                    </a>
                    <button
                      onClick={handleReset}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Resize Another</span>
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
    </div>
  )
}
