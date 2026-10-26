'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Type, Download, RefreshCw, AlertTriangle, FileText, X, Repeat, Image as ImageIcon } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type WatermarkImageArgs = { file: File; text: string; color: string; opacity: number; position: WatermarkPosition }

const watermarkImageSubmitter = ({ file, text, color, opacity, position }: WatermarkImageArgs) =>
  submitJob('/api/image/watermark', buildSingleFileFormData(file, { text, color, opacity, position }))

type WatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile'

export default function WatermarkImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState<string>('Your Watermark')
  const [color, setColor] = useState<string>('gray')
  const [opacity, setOpacity] = useState<number>(0.3)
  const [position, setPosition] = useState<WatermarkPosition>('center')
  const [imgSrc, setImgSrc] = useState<string | null>(null)


  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<WatermarkImageArgs>(watermarkImageSubmitter)

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
    if (!file || !text) return
    const ok = await submit({ file, text, color, opacity, position })
    if (!ok) {
      alert('Failed to initialize image watermarking task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
    setText('Your Watermark')
    setColor('gray')
    setOpacity(0.3)
    setPosition('center')
  }

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

  const overlayPositionClass =
    position === 'center' ? 'items-center justify-center text-center' :
    position === 'top-left' ? 'items-start justify-start text-left' :
    position === 'top-right' ? 'items-start justify-end text-right' :
    position === 'bottom-left' ? 'items-end justify-start text-left' :
    position === 'bottom-right' ? 'items-end justify-end text-right' :
    'items-center justify-center text-center'

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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Watermark Image</h1>
            <p className="text-sm text-muted mt-0.5">Stamp custom text watermarks onto your image files.</p>
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
              placeholderText="Drop your image file here to watermark"
            />
            <p className="text-center text-xs text-muted">
              Type your text, pick a color and position, then preview it live.
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
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {positionLabels.find((p) => p.value === position)?.label ?? position} · {Math.round(opacity * 100)}%
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
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor="wm-text" className="text-[13px] font-semibold">Watermark text</label>
                  <input
                    id="wm-text"
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter watermark text"
                    className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">Text color</span>
                  <div className="flex flex-wrap gap-2">
                    {colorLabels.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        aria-pressed={color === c.value}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                          color === c.value
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'border-border hover:border-accent/50'
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

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label htmlFor="wm-opacity" className="text-[13px] font-semibold">Opacity</label>
                    <span className="text-[13px] font-bold text-accent tabular-nums">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    id="wm-opacity"
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full accent-accent bg-border h-2 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">Position</span>
                  <div className="grid grid-cols-3 gap-2">
                    {positionLabels.map((pos) => (
                      <button
                        key={pos.value}
                        type="button"
                        onClick={() => setPosition(pos.value)}
                        aria-pressed={position === pos.value}
                        className={`py-2 text-center text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          position === pos.value
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'border-border hover:border-accent/50'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sticky bottom-3 lg:static z-10">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !text}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm"
                  >
                    Apply watermark
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">Live preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{positionLabels.find((p) => p.value === position)?.label ?? position}</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto flex items-center justify-center bg-background rounded-lg border border-border p-3">
                    {imgSrc ? (
                      <div className="relative inline-block max-w-full min-w-0">
                        <img
                          src={imgSrc}
                          alt="Watermark preview"
                          className="max-h-[48vh] lg:max-h-[62vh] w-auto max-w-full object-contain select-none rounded-md"
                        />
                        {position === 'tile' ? (
                          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 place-items-center gap-1 overflow-hidden p-4">
                            {Array.from({ length: 9 }).map((_, i) => (
                              <span
                                key={i}
                                className="text-xs sm:text-sm font-bold break-words text-center max-w-full"
                                style={{ color: color === 'gray' ? '#808080' : color, opacity }}
                              >
                                {text || 'Your Watermark'}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className={`pointer-events-none absolute inset-0 flex p-4 ${overlayPositionClass}`}>
                            <span
                              className="text-lg sm:text-xl font-bold break-words max-w-full"
                              style={{ color: color === 'gray' ? '#808080' : color, opacity }}
                            >
                              {text || 'Your Watermark'}
                            </span>
                          </div>
                        )}
                      </div>
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
                  message="Stamping watermark on image..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0 w-full max-w-lg">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Watermarking complete</h3>
                  <p className="text-sm text-muted mt-1">
                    Your watermarked image is ready. Preview it below, then download.
                  </p>
                </div>
                <div className="w-full min-w-0 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                  <img
                    src={downloadUrl}
                    alt="Watermarked image result"
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
                    <span>Watermark another</span>
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
