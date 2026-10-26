'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileImage, ArrowUp, ArrowDown, X, Download, RefreshCw, AlertTriangle, Eye, Plus } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildMultiFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const imagesToPdfSubmitter = (files: File[]) =>
  submitJob('/api/images-to-pdf', buildMultiFileFormData(files))

export default function ImagesToPdfPage() {
  const [files, setFiles] = useState<File[]>([])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<File[]>(imagesToPdfSubmitter)

  // Real image thumbnails from object URLs (preview only, submit path unchanged)
  useEffect(() => {
    const urls: Record<string, string> = {}
    files.forEach((file, index) => {
      const key = `${file.name}-${index}`
      urls[key] = URL.createObjectURL(file)
    })
    setPreviewUrls(urls)
    return () => {
      Object.values(urls).forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* noop */
        }
      })
    }
  }, [files])

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
    if (files.length === 0) {
      alert('Please select at least 1 image file.')
      return
    }
    const ok = await submit(files)
    if (!ok) {
      alert('Failed to initialize compilation task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFiles([])
    reset()
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const dm = 2
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  const isWorkspace = files.length > 0 && !isDone && !isError && !isSubmitting
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

  return (
    <div className={`mx-auto w-full min-w-0 flex-1 flex flex-col justify-center overflow-x-clip px-4 sm:px-6 py-6 sm:py-10 transition-all duration-300 ${files.length > 0 ? 'max-w-[1400px]' : 'max-w-2xl'}`}>
      {/* Header */}
      <div className="mb-5 sm:mb-7 min-w-0">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <FileImage className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Images to PDF</h1>
            <p className="text-sm text-muted mt-0.5">Convert PNG and JPG images into a single PDF document.</p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {files.length === 0 && !isDone && !isError && !isSubmitting && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 min-w-0"
          >
            <DropZone
              onFileAccepted={handleFileAccepted}
              accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }}
            />
            <p className="text-center text-xs text-muted">
              Add one or more images. Top image becomes page one — reorder freely.
            </p>
          </motion.div>
        )}

        {isWorkspace && (
          <motion.div
            key="file-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4 sm:gap-5 min-w-0"
          >
            {/* Slim add bar */}
            <div className="flex items-center gap-3 min-w-0 rounded-xl border border-card-border bg-surface px-3 py-2.5 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileImage className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">{files.length} image{files.length > 1 ? 's' : ''} queued</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {(totalSize / 1024 / 1024).toFixed(2)} MB total · top is page one
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add more</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = e.target.files
                    if (list) Array.from(list).forEach((f) => handleFileAccepted(f))
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleReset}
                aria-label="Clear all files"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Workspace: compact settings + real image preview */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <p className="text-xs text-muted leading-relaxed">
                  Page order follows the list. First thumbnail becomes page one of the PDF.
                </p>
                <div className="sticky bottom-3 z-10 lg:static lg:z-auto">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {`Compile ${files.length} Image${files.length > 1 ? 's' : ''} to PDF`}
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">Page order</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{files.length} pages</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[420px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                      {files.map((file, index) => {
                        const key = `${file.name}-${index}`
                        const url = previewUrls[key]
                        return (
                          <div
                            key={key}
                            className="relative aspect-[3/4] min-w-0 p-2 rounded-lg border border-border bg-background flex flex-col transition-colors"
                          >
                            <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1 truncate">
                              Page {index + 1}
                            </div>
                            <div className="relative w-full flex-1 min-h-0 rounded border border-card-border bg-surface overflow-hidden mb-1.5">
                              {url ? (
                                <img
                                  src={url}
                                  alt={`Page ${index + 1} — ${file.name}`}
                                  loading="lazy"
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">
                                  Loading…
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 px-0.5">
                              <p className="truncate text-[10px] font-semibold text-muted">{file.name}</p>
                              <p className="font-mono text-[10px] tabular-nums text-muted">{formatBytes(file.size)}</p>
                            </div>
                            <div className="mt-1.5 flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleMoveUp(index)}
                                disabled={index === 0}
                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-surface hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title="Move Up"
                                aria-label={`Move ${file.name} up`}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveDown(index)}
                                disabled={index === files.length - 1}
                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-surface hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title="Move Down"
                                aria-label={`Move ${file.name} down`}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemove(index)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-danger hover:bg-danger-subtle transition-all cursor-pointer"
                                title="Delete"
                                aria-label={`Remove ${file.name}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="mt-3">
                    <DropZone
                      onFileAccepted={handleFileAccepted}
                      accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }}
                      disabled={isSubmitting}
                    />
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
                  message="Compiling images into PDF..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">PDF Created!</h3>
                  <p className="text-sm text-muted mt-1">Your compiled PDF file is ready. Click below to download.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PDF</span>
                  </a>
                  <button
                    onClick={() => setIsPreviewOpen(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Preview PDF</span>
                  </button>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Convert More Images</span>
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
                  <h3 className="text-2xl font-bold">Compilation Failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">{submitError || 'Failed to convert images to PDF.'}</p>
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

      {isDone && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl ?? ''}
          fileName={files[0]?.name ? `${files[0].name.replace(/\.[^/.]+$/, "")}_compiled.pdf` : "compiled.pdf"}
        />
      )}
    </div>
  )
}
