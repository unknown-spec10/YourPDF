'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RotateCw, Download, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function RotateImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [imgSrc, setImgSrc] = useState<string>('')
  const [angle, setAngle] = useState<0 | 90 | 180 | 270>(0)
  
  const [jobId, setJobId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, () => {})

  // Object URL preview
  useEffect(() => {
    if (!file) {
      setImgSrc('')
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleRotateLeft = () => {
    setAngle((prev) => {
      if (prev === 0) return 270
      if (prev === 90) return 0
      if (prev === 180) return 90
      return 180
    })
  }

  const handleRotateRight = () => {
    setAngle((prev) => {
      if (prev === 0) return 90
      if (prev === 90) return 180
      if (prev === 180) return 270
      return 0
    })
  }

  const handleSubmit = async () => {
    if (!file || angle === 0) return
    setIsSubmitting(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('angle', String(angle))

    try {
      const response = await axios.post(`${API_URL}/api/image/rotate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err) {
      console.error(err)
      alert('Failed to initialize image rotation task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setJobId(null)
    setAngle(0)
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
            <RotateCw className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rotate Image</h1>
            <p className="text-muted mt-1">Rotate images by 90, 180, or 270 degrees with live visual preview.</p>
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
                placeholderText="Drop your image file here to rotate"
              />
            </motion.div>
          )}

          {file && !jobId && imgSrc && (
            <motion.div
              key="file-selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              <div className="flex justify-between items-center bg-background border border-border p-4 rounded-xl">
                <div className="truncate pr-4">
                  <p className="text-sm font-semibold truncate text-foreground">{file.name}</p>
                  <p className="text-xs text-muted">Rotation: {angle}°</p>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                >
                  Remove File
                </button>
              </div>

              {/* Live Image Preview with CSS Rotation */}
              <div className="flex justify-center items-center p-8 rounded-xl border border-border bg-background min-h-[300px] overflow-hidden">
                <div className="relative flex items-center justify-center max-w-xs max-h-xs">
                  <img
                    src={imgSrc}
                    style={{ transform: `rotate(${angle}deg)` }}
                    alt="Rotation preview"
                    className="max-w-[240px] max-h-[240px] object-contain transition-transform duration-300 ease-out select-none shadow-lg rounded-md"
                  />
                </div>
              </div>

              {/* Rotation Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handleRotateLeft}
                  className="h-11 flex items-center justify-center gap-2 rounded-xl border border-border hover:bg-background transition-colors font-semibold cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Rotate Left</span>
                </button>
                <button
                  type="button"
                  onClick={handleRotateRight}
                  className="h-11 flex items-center justify-center gap-2 rounded-xl border border-border hover:bg-background transition-colors font-semibold cursor-pointer"
                >
                  <RotateCw className="h-4 w-4" />
                  <span>Rotate Right</span>
                </button>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || angle === 0}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Rotating...' : angle === 0 ? 'Select a rotation angle' : `Apply ${angle}° Rotation`}
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
                    message={jobStatus?.message || 'Rotating image...'}
                  />
                </div>
              )}

              {isDone && jobStatus?.result && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Rotation Complete!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your rotated image is ready. Download below.
                    </p>
                  </div>
                  <div className="flex gap-4 mt-4">
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
                      <span>Rotate Another</span>
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
