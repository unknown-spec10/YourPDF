'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Maximize, Download, RefreshCw, AlertTriangle, FileText, X, Repeat, Image as ImageIcon } from 'lucide-react'
import DropZone from '@/components/DropZone'
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
  const [imgSrc, setImgSrc] = useState<string | null>(null)


  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<ResizeImageArgs>(resizeImageSubmitter)

  useEffect(() => {
    if (!file) {
      setImgSrc(null)
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

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

  const isWorkspace = file && !isDone && !isError && !isSubmitting

  return (
    <div className={`mx-auto w-full min-w-0 flex-1 flex flex-col justify-center overflow-x-clip px-4 sm:px-6 py-6 sm:py-10 transition-all duration-300 ${file ? 'max-w-[1400px]' : 'max-w-2xl'}`}>
      {/* Header */}
      <div className="mb-5 sm:mb-7 min-w-0">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Maximize className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Resize Image</h1>
            <p className="text-sm text-muted mt-0.5">Scale width and height dimensions by pixels or percentage.</p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!file && !isDone && !isError && !isSubmitting && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 min-w-0"
          >
            <DropZone
              onFileAccepted={setFile}
              accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
              placeholderText="Drop your image here to resize"
            />
            <p className="text-center text-xs text-muted">
              Enter at least one dimension in pixels, or pick a scale percentage.
            </p>
          </motion.div>
        )}

        {isWorkspace && file && (
          <motion.div
            key="file-selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4 sm:gap-5 min-w-0"
          >
            {/* Slim add bar */}
            <div className="flex items-center gap-3 min-w-0 rounded-xl border border-card-border bg-surface px-3 py-2.5 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                  {mode === 'percentage' ? ` · ${percentage}%` : ''}
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Repeat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Replace</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const next = e.target.files?.[0]
                    if (next) setFile(next)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleReset}
                aria-label="Remove file"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Workspace: compact settings + generous preview */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold">Resize mode</span>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('pixels')}
                      aria-pressed={mode === 'pixels'}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        mode === 'pixels'
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <span className="block text-[13px] font-semibold">By pixels</span>
                      <span className="block text-xs text-muted font-normal mt-0.5">Exact dimensions</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('percentage')}
                      aria-pressed={mode === 'percentage'}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        mode === 'percentage'
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <span className="block text-[13px] font-semibold">By percentage</span>
                      <span className="block text-xs text-muted font-normal mt-0.5">Quick scaling</span>
                    </button>
                  </div>
                </div>

                {mode === 'pixels' ? (
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label htmlFor="resize-width" className="text-[13px] font-semibold">Width (px)</label>
                        <input
                          id="resize-width"
                          type="number"
                          placeholder="Auto"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label htmlFor="resize-height" className="text-[13px] font-semibold">Height (px)</label>
                        <input
                          id="resize-height"
                          type="number"
                          placeholder="Auto"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                        />
                      </div>
                    </div>
                    <label htmlFor="maintainAspect" className="flex items-center gap-2 text-[13px] text-muted select-none cursor-pointer">
                      <input
                        type="checkbox"
                        id="maintainAspect"
                        checked={maintainAspect}
                        onChange={(e) => setMaintainAspect(e.target.checked)}
                        className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                      />
                      <span>Lock aspect ratio</span>
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex justify-between items-center">
                      <label htmlFor="resize-pct" className="text-[13px] font-semibold">Scale</label>
                      <span className="text-[13px] font-bold text-accent tabular-nums">{percentage}%</span>
                    </div>
                    <input
                      id="resize-pct"
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
                          aria-pressed={percentage === val}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            percentage === val
                              ? 'bg-accent/10 border-accent text-accent'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="sticky bottom-3 lg:static z-10">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || (mode === 'pixels' && !width && !height)}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm"
                  >
                    Resize image
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">Source preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {mode === 'percentage' ? `${percentage}%` : `${width || 'auto'} × ${height || 'auto'}`}
                  </span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto flex items-center justify-center bg-background rounded-lg border border-border">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt="Source image preview"
                        className="max-h-[50vh] lg:max-h-[66vh] w-auto max-w-full object-contain select-none"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-xs text-muted p-6">
                        <ImageIcon className="h-7 w-7 text-muted/40 mb-2" />
                        <span>Loading preview…</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {(isSubmitting || isDone || isError) && (
          <motion.div
            key="processing-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-6 text-center min-w-0"
          >
            {isSubmitting && (
              <div className="w-full max-w-md min-w-0">
                <ProgressBar
                  progress={50}
                  message="Resizing image..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0 w-full max-w-lg">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Resizing complete</h3>
                  <p className="text-sm text-muted mt-1">
                    Your resized image is ready. Preview it below, then download.
                  </p>
                </div>
                <div className="w-full min-w-0 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                  <img
                    src={downloadUrl}
                    alt="Resized image result"
                    className="max-h-[320px] w-full object-contain bg-background"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    download
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download image</span>
                  </a>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Resize another</span>
                  </button>
                </div>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-1">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Processing failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {submitError || 'An unexpected error occurred during processing.'}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors mt-2 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Try again</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
