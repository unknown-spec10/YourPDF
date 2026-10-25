'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Maximize, Settings, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type ResizeImageArgs = { file: File; mode: 'pixels' | 'percentage'; width: string; height: string; maintain_aspect: boolean; percentage: number }

const resizeImageSubmitter = ({ file, mode, width, height, maintain_aspect, percentage }: ResizeImageArgs) => {
  const params: Record<string, string | number | boolean> = { maintain_aspect }
  if (mode === 'percentage') {
    params.percentage = percentage
  } else {
    if (width) params.width = width
    if (height) params.height = height
  }
  return submitJob('/api/image/resize', buildSingleFileFormData(file, params))
}

export default function ResizeImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'pixels' | 'percentage'>('pixels')
  
  // Pixels parameters
  const [width, setWidth] = useState<string>('')
  const [height, setHeight] = useState<string>('')
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true)
  
  // Percentage parameters
  const [percentage, setPercentage] = useState<number>(50)
  

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<ResizeImageArgs>(resizeImageSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    const ok = await submit({ file, mode, width, height, maintain_aspect: maintainAspect, percentage })
    if (!ok) {
      alert('Failed to initialize image resizing task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
    setWidth('')
    setHeight('')
    setPercentage(50)
  }

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
          {!file && !isDone && !isError && !isSubmitting && (
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

          {file && !isDone && !isError && !isSubmitting && (
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

          {(isSubmitting || isDone || isError) && (
            <motion.div
              key="processing-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center py-6 text-center"
            >
              {isSubmitting && (
                <div className="w-full max-w-md">
                  <ProgressBar
                    progress={50}
                    message="Processing image..."
                  />
                </div>
              )}

              {isDone && downloadUrl && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Resizing Complete!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your resized image is ready. Click below to download.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4 w-full justify-center items-stretch sm:items-center">
                    <a
                      href={downloadUrl ?? ''}
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
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Processing Failed</h3>
                    <p className="text-sm text-muted mt-1">
                      {submitError || 'An unexpected error occurred during processing.'}
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
