'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Presentation, ArrowUp, ArrowDown, X, Download, RefreshCw, AlertTriangle, Plus } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildMultiFileFormData } from '@/lib/api'

const mergePptxSubmitter = (files: File[]) =>
  submitJob('/api/office/merge-pptx', buildMultiFileFormData(files))

export default function MergePptxPage() {
  const [files, setFiles] = useState<File[]>([])

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<File[]>(mergePptxSubmitter)

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
      alert('Please select at least 2 PowerPoint presentations to merge.')
      return
    }
    const ok = await submit(files)
    if (!ok) {
      alert('Failed to initialize PowerPoint merge task. Please check server connection.')
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
            <Presentation className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Merge PPT Presentations</h1>
            <p className="text-sm text-muted mt-0.5">Combine multiple PowerPoint presentations (.pptx) into one presentation.</p>
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
              accept={{ 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] }}
              placeholderText="Drop your PowerPoint files here (PPTX)"
            />
            <p className="text-center text-xs text-muted">
              Add two or more .pptx decks. Arrange the order, then merge.
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
                <Presentation className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">{files.length} presentations queued</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {(totalSize / 1024 / 1024).toFixed(2)} MB total · top merges first
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add more</span>
                <input
                  type="file"
                  accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
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

            {/* Workspace: compact settings + ordered identity cards */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <p className="text-xs text-muted leading-relaxed">
                  Top deck merges first. Use the arrows to reorder before merging.
                </p>
                <div className="sticky bottom-3 z-10 lg:static lg:z-auto">
                  <button
                    onClick={handleSubmit}
                    disabled={files.length < 2 || isSubmitting}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {`Merge ${files.length} PowerPoint presentations`}
                  </button>
                  {files.length < 2 && (
                    <p className="mt-2 text-xs text-muted text-center leading-relaxed">Add at least one more deck to enable merging.</p>
                  )}
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">Merge order</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{files.length} files</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="flex flex-col gap-2 min-w-0">
                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2.5 min-w-0 rounded-lg border border-border bg-background p-2.5"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent text-xs font-bold tabular-nums">
                          {index + 1}
                        </span>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                          <Presentation className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-semibold tracking-tight">{file.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">{formatBytes(file.size)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            title="Move Up"
                            aria-label={`Move ${file.name} up`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleMoveDown(index)}
                            disabled={index === files.length - 1}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            title="Move Down"
                            aria-label={`Move ${file.name} down`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRemove(index)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
                            title="Delete"
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <DropZone
                      onFileAccepted={handleFileAccepted}
                      accept={{ 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] }}
                      disabled={isSubmitting}
                      placeholderText="Click or drop to add more PowerPoint slide decks"
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
                  message="Merging presentation files..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">PowerPoint Presentations Merged!</h3>
                  <p className="text-sm text-muted mt-1">Your combined PPTX presentation is ready. Click below to download.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    download
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PPTX</span>
                  </a>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Merge More Presentations</span>
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
                  <h3 className="text-2xl font-bold">Merge Failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">{submitError || 'An unexpected error occurred during processing.'}</p>
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
