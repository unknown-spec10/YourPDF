'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileSpreadsheet, Settings, Download, RefreshCw, AlertTriangle, Eye, FileText, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

type CompressArgs = { file: File; quality: string }

const compressSubmitter = ({ file, quality }: CompressArgs) =>
  submitJob('/api/compress', buildSingleFileFormData(file, { quality }))

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const dm = 2
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(dm)) + ' ' + sizes[i]
}

export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setFileUrl(null)
    }
  }, [file])

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<CompressArgs>(compressSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    const ok = await submit({ file, quality })
    if (!ok) {
      alert('Failed to initialize compression task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    setIsPreviewOpen(false)
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
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Compress PDF</h1>
            <p className="text-sm text-muted mt-0.5">Reduce file size with balanced quality for sharing and storage.</p>
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
            <DropZone onFileAccepted={setFile} />
            <p className="text-center text-xs text-muted">
              Quality defaults to Medium. Open advanced options to fine-tune output size.
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
                  {(file.size / 1024 / 1024).toFixed(2)} MB · first page preview
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Repeat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Replace</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
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
                <span className="text-[13px] font-semibold">01 — Compression</span>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Advanced options</span>
                  </button>

                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2.5 flex flex-col gap-2.5 rounded-xl bg-background border border-border p-3"
                    >
                      <span className="text-[13px] font-semibold">Compression Level</span>
                      <div className="grid grid-cols-3 gap-2">
                        {(['low', 'medium', 'high'] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setQuality(lvl)}
                            className={`py-2 px-2 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                              quality === lvl
                                ? 'bg-accent/10 border-accent text-accent'
                                : 'border-border hover:border-accent/50'
                            }`}
                          >
                            {lvl === 'low' && 'Low'}
                            {lvl === 'medium' && 'Medium'}
                            {lvl === 'high' && 'High'}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-muted leading-relaxed flex flex-col gap-1.5">
                        {quality === 'low' && (
                          <>
                            <span><strong>Low Compression (300 DPI)</strong>: Minimal compression, highest print quality. Recommended for printing.</span>
                            {file && (
                              <span className="text-accent font-semibold">Estimated size: ~{formatBytes(file.size * 0.8)} (~20% reduction)</span>
                            )}
                          </>
                        )}
                        {quality === 'medium' && (
                          <>
                            <span><strong>Medium Compression (150 DPI)</strong>: Balanced compression and quality. Recommended for e-books and general use.</span>
                            {file && (
                              <span className="text-accent font-semibold">Estimated size: ~{formatBytes(file.size * 0.4)} (~60% reduction)</span>
                            )}
                          </>
                        )}
                        {quality === 'high' && (
                          <>
                            <span><strong>High/Maximum Compression (72 DPI)</strong>: Maximum file size reduction. Recommended for web and screens.</span>
                            {file && (
                              <span className="text-accent font-semibold">Estimated size: ~{formatBytes(file.size * 0.2)} (~80% reduction)</span>
                            )}
                          </>
                        )}
                      </span>
                    </motion.div>
                  )}
                  {!showAdvanced && (
                    <p className="mt-1.5 text-xs text-muted leading-relaxed">
                      {quality === 'low'
                        ? `Low (300 DPI) · ~${formatBytes(file.size * 0.8)} estimated.`
                        : quality === 'high'
                          ? `High (72 DPI) · ~${formatBytes(file.size * 0.2)} estimated.`
                          : `Medium (150 DPI) · ~${formatBytes(file.size * 0.4)} estimated.`}
                    </p>
                  )}
                </div>

                <div className="sticky bottom-3 lg:static">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {isSubmitting ? 'Initializing...' : 'Compress PDF'}
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">02 — First page preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{quality === 'low' ? 'Low · 300 DPI' : quality === 'high' ? 'High · 72 DPI' : 'Medium · 150 DPI'}</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
                    <div className="relative mx-auto w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden">
                      {fileUrl ? (
                        <iframe
                          loading="lazy"
                          src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                          className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                          title="First page preview"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">Reading document…</div>
                      )}
                    </div>
                    <p className="mt-2.5 text-center text-xs text-muted">
                      Compression preserves layout. Download the result to verify final size and quality.
                    </p>
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
                  message="Compressing PDF..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Compression Done!</h3>
                  <p className="text-sm text-muted mt-1">
                    Your compressed PDF is ready. Click the button below to download.
                  </p>
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
                    <span>Compress Another</span>
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
                  <h3 className="text-2xl font-bold">Processing Failed</h3>
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

      {isDone && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl ?? ''}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_compressed.pdf` : "compressed.pdf"}
        />
      )}
    </div>
  )
}
