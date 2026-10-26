'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Type, Settings, Download, RefreshCw, AlertTriangle, Eye, ZoomIn, FileText, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

type WatermarkArgs = { file: File; text: string; color: string; opacity: number; rotation: number }

const watermarkSubmitter = ({ file, text, color, opacity, rotation }: WatermarkArgs) =>
  submitJob('/api/watermark', buildSingleFileFormData(file, { text, color, opacity, rotation }))

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [color, setColor] = useState('gray')
  const [opacity, setOpacity] = useState(0.3)
  const [rotation, setRotation] = useState(45)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isZoomOpen, setIsZoomOpen] = useState(false)

  // Manage local file URL for preview
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
  } = useFileJob<WatermarkArgs>(watermarkSubmitter)

  const handleSubmit = async () => {
    if (!file || !text) return
    const ok = await submit({ file, text, color, opacity, rotation })
    if (!ok) {
      alert('Failed to initialize watermark task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    setText('')
    setColor('gray')
    setOpacity(0.3)
    setRotation(45)
    setIsZoomOpen(false)
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
            <Type className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Watermark PDF</h1>
            <p className="text-sm text-muted mt-0.5">Stamp a custom semi-transparent text watermark over PDF pages.</p>
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
              Type watermark text to see a live overlay. Tune color, opacity, and rotation under advanced.
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
                  {(file.size / 1024 / 1024).toFixed(2)} MB{text ? ` · “${text.slice(0, 24)}”` : ' · no watermark text'}
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
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold">01 — Watermark Text</span>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="e.g. CONFIDENTIAL / DO NOT COPY"
                    className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                  />
                </div>

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
                      className="mt-2.5 rounded-xl bg-background border border-border p-3 flex flex-col gap-3.5"
                    >
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-wide">Text Color</label>
                        <select
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                        >
                          <option value="gray">Gray</option>
                          <option value="red">Red</option>
                          <option value="green">Green</option>
                          <option value="blue">Blue</option>
                          <option value="black">Black</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-wide">Opacity ({Math.round(opacity * 100)}%)</label>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.1"
                          value={opacity}
                          onChange={(e) => setOpacity(parseFloat(e.target.value))}
                          className="h-10 cursor-pointer accent-accent"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-wide">Rotation</label>
                        <select
                          value={rotation}
                          onChange={(e) => setRotation(parseInt(e.target.value))}
                          className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                        >
                          <option value="0">0° Horizontal</option>
                          <option value="30">30° Diagonal</option>
                          <option value="45">45° Diagonal</option>
                          <option value="90">90° Vertical</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="sticky bottom-3 lg:static">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !text}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {isSubmitting ? 'Watermarking...' : 'Add Watermark'}
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">02 — Watermark preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{color} · {Math.round(opacity * 100)}% · {rotation}°</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden flex flex-col items-center">
                    <div
                      onClick={() => fileUrl && setIsZoomOpen(true)}
                      className={`relative w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden group transition-colors ${fileUrl ? 'cursor-pointer hover:border-accent' : ''}`}
                    >
                      {fileUrl ? (
                        <>
                          <iframe
                            loading="lazy"
                            src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                            className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                            title="Watermark Preview Viewport"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden p-6">
                            {text && (
                              <span
                                className="text-2xl font-extrabold select-none text-center break-words max-w-full transition-all duration-300"
                                style={{
                                  color: color.toLowerCase() === 'black' ? '#111111' :
                                         color.toLowerCase() === 'red' ? '#DC2626' :
                                         color.toLowerCase() === 'green' ? '#16A34A' :
                                         color.toLowerCase() === 'blue' ? '#2563EB' : '#808080',
                                  opacity: opacity,
                                  transform: `rotate(-${rotation}deg)`,
                                  transformOrigin: 'center center',
                                }}
                              >
                                {text}
                              </span>
                            )}
                          </div>
                          <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                            <div className="p-2 rounded-full bg-accent text-accent-foreground">
                              <ZoomIn className="h-4 w-4" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">No document loaded</div>
                      )}
                    </div>
                    <p className="mt-2.5 text-center text-xs text-muted max-w-[40ch]">
                      {text ? 'Showing live overlay. Output PDF will be stamped on all pages.' : 'Type watermark text to preview the overlay here.'}
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
                  message="Adding watermark to PDF..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Watermark Added!</h3>
                  <p className="text-sm text-muted mt-1">
                    Your watermarked PDF is ready. Click below to download.
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
                    <span>Watermark Another</span>
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
                  <h3 className="text-2xl font-bold">Watermarking Failed</h3>
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
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_watermarked.pdf` : "watermarked.pdf"}
        />
      )}

      {/* Watermark Zoom Preview Modal */}
      {isZoomOpen && fileUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
          <div className="relative w-full max-w-4xl min-w-0 h-[85vh] max-h-[85vh] rounded-2xl border border-card-border bg-surface flex flex-col p-4 sm:p-6 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 mb-4 min-w-0">
              <div className="flex flex-col min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">Watermark Live Zoom</h3>
                <p className="text-xs text-muted">Inspect watermark placement and transparency details.</p>
              </div>
              <button
                onClick={() => setIsZoomOpen(false)}
                className="shrink-0 text-muted hover:text-foreground cursor-pointer transition-colors px-4 py-2 rounded-xl border border-border bg-background hover:bg-surface-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="relative flex-1 min-h-0 w-full rounded-xl border border-card-border overflow-hidden bg-background">
              <iframe
                src={`${fileUrl}#page=1&toolbar=0&navpanes=0`}
                className="w-full h-full border-0"
                title="Watermark Zoom Preview Frame"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden p-12">
                {text && (
                  <span
                    className="text-4xl md:text-6xl font-extrabold select-none text-center break-words max-w-full transition-all duration-300"
                    style={{
                      color: color.toLowerCase() === 'black' ? '#111111' :
                             color.toLowerCase() === 'red' ? '#DC2626' :
                             color.toLowerCase() === 'green' ? '#16A34A' :
                             color.toLowerCase() === 'blue' ? '#2563EB' : '#808080',
                      opacity: opacity,
                      transform: `rotate(-${rotation}deg)`,
                      transformOrigin: 'center center',
                    }}
                  >
                    {text}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
