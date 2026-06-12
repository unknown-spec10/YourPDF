'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Type, Settings, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type WatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile'

export default function WatermarkImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState<string>('Your Watermark')
  const [color, setColor] = useState<string>('gray')
  const [opacity, setOpacity] = useState<number>(0.3)
  const [position, setPosition] = useState<WatermarkPosition>('center')
  
  const [jobId, setJobId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, () => {})

  useEffect(() => {
    return () => setJobId(null)
  }, [])

  const handleSubmit = async () => {
    if (!file || !text) return
    setIsSubmitting(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('text', text)
    formData.append('color', color)
    formData.append('opacity', String(opacity))
    formData.append('position', position)

    try {
      const response = await axios.post(`${API_URL}/api/image/watermark`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err) {
      console.error(err)
      alert('Failed to initialize image watermarking task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setJobId(null)
    setText('Your Watermark')
    setColor('gray')
    setOpacity(0.3)
    setPosition('center')
  }

  const isQueued = jobStatus?.status === 'queued'
  const isProcessing = jobStatus?.status === 'processing'
  const isDone = jobStatus?.status === 'done'
  const isError = jobStatus?.status === 'error' || !!pollError

  const positionLabels: { value: WatermarkPosition; label: string }[] = [
    { value: 'top-left', label: 'Top Left' },
    { value: 'top-right', label: 'Top Right' },
    { value: 'center', label: 'Center' },
    { value: 'tile', label: 'Tiled' },
    { value: 'bottom-left', label: 'Bottom Left' },
    { value: 'bottom-right', label: 'Bottom Right' },
  ]

  const colorLabels = [
    { value: 'red', label: 'Red', hex: '#FF0000' },
    { value: 'green', label: 'Green', hex: '#00FF00' },
    { value: 'blue', label: 'Blue', hex: '#0000FF' },
    { value: 'gray', label: 'Gray', hex: '#808080' },
    { value: 'black', label: 'Black', hex: '#000000' },
    { value: 'white', label: 'White', hex: '#FFFFFF' },
  ]

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
            <Type className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Watermark Image</h1>
            <p className="text-muted mt-1">Stamp custom text watermarks onto your image files.</p>
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
                placeholderText="Drop your image file here to watermark"
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

              {/* Settings */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer mb-4"
                >
                  <Settings className="h-4 w-4" />
                  <span>Watermark settings</span>
                </button>

                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex flex-col gap-4 bg-background border border-border p-4 rounded-xl"
                  >
                    {/* Text input */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-bold text-foreground">Watermark Text</label>
                      <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Enter watermark text"
                        className="h-10 px-3 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:border-accent"
                      />
                    </div>

                    {/* Color selection */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-bold text-foreground">Text Color</label>
                      <div className="flex flex-wrap gap-2">
                        {colorLabels.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setColor(c.value)}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                              color === c.value
                                ? 'bg-accent/10 border-accent text-accent'
                                : 'border-border bg-surface hover:bg-background'
                            }`}
                          >
                            <span
                              className="h-3.5 w-3.5 rounded border border-border/40 shrink-0"
                              style={{ backgroundColor: c.hex }}
                            />
                            <span>{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Opacity slider */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <label className="font-bold text-foreground">Opacity</label>
                        <span className="font-semibold text-accent">{Math.round(opacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1.0"
                        step="0.05"
                        value={opacity}
                        onChange={(e) => setOpacity(Number(e.target.value))}
                        className="w-full accent-accent bg-border h-2 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Position grid selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-bold text-foreground">Position</label>
                      <div className="grid grid-cols-3 gap-2">
                        {positionLabels.map((pos) => (
                          <button
                            key={pos.value}
                            type="button"
                            onClick={() => setPosition(pos.value)}
                            className={`py-2 text-center text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                              position === pos.value
                                ? 'bg-accent/10 border-accent text-accent'
                                : 'border-border bg-surface hover:bg-background'
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !text}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Stamping Watermark...' : 'Apply Watermark'}
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
                    message={jobStatus?.message || 'Stamping watermark on image...'}
                  />
                </div>
              )}

              {isDone && jobStatus?.result && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Watermarking Complete!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your watermarked image is ready. Download below.
                    </p>
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
                      <span>Watermark Another</span>
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
