'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Presentation, Download, RefreshCw, AlertTriangle, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type PptxToImagesArgs = { file: File; format: string; dpi: number }

const pptxToImagesSubmitter = ({ file, format, dpi }: PptxToImagesArgs) =>
  submitJob('/api/office/pptx-to-images', buildSingleFileFormData(file, { format, dpi }))

export default function PptxToImagesPage() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'png' | 'jpg' | 'jpeg'>('png')
  const [dpi, setDpi] = useState<number>(150)
  const [showAdvanced, setShowAdvanced] = useState(true)

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
    fileName,
  } = useFileJob<PptxToImagesArgs>(pptxToImagesSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    const ok = await submit({ file, format, dpi })
    if (!ok) {
      alert('Failed to initialize PowerPoint image conversion. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
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
            <Presentation className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">PPT to Images</h1>
            <p className="text-sm text-muted mt-0.5">Convert PowerPoint slides (.pptx) into individual PNG or JPG images.</p>
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
              accept={{ 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] }}
              placeholderText="Drop your PowerPoint presentation (.pptx) here"
            />
            <p className="text-center text-xs text-muted">
              Each slide renders to an image and downloads as a ZIP archive.
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
                <Presentation className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {format.toUpperCase()} · {dpi} DPI
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Repeat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Replace</span>
                <input
                  type="file"
                  accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
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

            {/* Workspace: compact settings + identity card */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  aria-expanded={showAdvanced}
                  className="inline-flex items-center justify-between gap-2 text-[13px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <span>Image settings</span>
                  <span className="text-xs font-normal">{showAdvanced ? 'Hide' : 'Show'}</span>
                </button>

                {showAdvanced && (
                <div className="flex flex-col gap-4 min-w-0">
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-semibold">Output format</span>
                    <div className="grid grid-cols-3 gap-2">
                      {(['png', 'jpg', 'jpeg'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setFormat(fmt)}
                          aria-pressed={format === fmt}
                          className={`h-10 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                            format === fmt
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                      <span>Resolution</span>
                      <span className="font-mono text-xs tabular-nums text-accent">{dpi} DPI</span>
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {([100, 150, 200, 300] as const).map((resolution) => (
                        <button
                          key={resolution}
                          type="button"
                          onClick={() => setDpi(resolution)}
                          aria-pressed={dpi === resolution}
                          className={`h-10 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                            dpi === resolution
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          {resolution}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-muted leading-relaxed mt-0.5">
                      {dpi <= 100 && 'Low: smallest ZIP size, lower image quality.'}
                      {dpi === 150 && 'Medium: balanced size and quality. Recommended for documents.'}
                      {dpi === 200 && 'High: detailed image rendering. Larger file size.'}
                      {dpi === 300 && 'Super high: high resolution print standard. Large file size.'}
                    </span>
                  </div>
                </div>
                )}

                <div className="sticky bottom-3 z-10 lg:static lg:z-auto">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Convert to Images
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">Selected presentation</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{format.toUpperCase()} · {dpi} DPI</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="flex items-center gap-3 min-w-0 rounded-lg border border-border bg-background p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Presentation className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold tracking-tight">{file.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                        {(file.size / 1024 / 1024).toFixed(2)} MB · Presentation
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted leading-relaxed">
                    Slide decks cannot be previewed in the browser. Output is a ZIP of {format.toUpperCase()} images at {dpi} DPI.
                  </p>
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
                  message="Rasterizing PowerPoint slides..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Conversion Completed!</h3>
                  <p className="text-sm text-muted mt-1">
                    {(fileName ?? '').toLowerCase().endsWith('.zip')
                      ? 'Your ZIP archive containing slide images is ready.'
                      : 'Your image file is ready for download.'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>
                      {(fileName ?? '').toLowerCase().endsWith('.zip')
                        ? 'Download ZIP'
                        : `Download ${format.toUpperCase()}`}
                    </span>
                  </a>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Convert Another</span>
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
                  <h3 className="text-2xl font-bold">Conversion Failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {submitError || 'An unexpected error occurred during processing.'}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors mt-2 cursor-pointer"
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
  )
}
