'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RefreshCw, Download, Settings, AlertTriangle } from 'lucide-react'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type ConvertImageArgs = { file: File; target_format: ImageFormat }

const convertImageSubmitter = ({ file, target_format }: ConvertImageArgs) =>
  submitJob('/api/image/convert', buildSingleFileFormData(file, { target_format }))

type ImageFormat = 'png' | 'jpg' | 'webp' | 'bmp' | 'tiff'

export default function ConvertImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [targetFormat, setTargetFormat] = useState<ImageFormat>('png')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<ConvertImageArgs>(convertImageSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    const ok = await submit({ file, target_format: targetFormat })
    if (!ok) {
      alert('Failed to initialize image conversion task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
  }

  const formats: { value: ImageFormat; label: string; desc: string }[] = [
    { value: 'png', label: 'PNG', desc: 'Lossless compression, preserves transparency. Best for graphics.' },
    { value: 'jpg', label: 'JPG/JPEG', desc: 'Lossy compression. Best for photos and web pages.' },
    { value: 'webp', label: 'WEBP', desc: 'Modern web format. Exceptional compression and quality.' },
    { value: 'bmp', label: 'BMP', desc: 'Bitmap image format. Uncompressed raw graphic file.' },
    { value: 'tiff', label: 'TIFF', desc: 'Tagged Image File. High-quality format used in printing/graphics.' },
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
            <RefreshCw className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Convert Image</h1>
            <p className="text-muted mt-1">Convert image formats to PNG, JPG, WEBP, BMP, or TIFF in one click.</p>
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
                accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif'] }}
                placeholderText="Drop your image file here to convert"
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

              {/* Target Format Selector */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer mb-4"
                >
                  <Settings className="h-4 w-4" />
                  <span>Select output format</span>
                </button>

                <div className="flex flex-col gap-3">
                  {formats.map((fmt) => (
                    <button
                      key={fmt.value}
                      type="button"
                      onClick={() => setTargetFormat(fmt.value)}
                      className={`flex flex-col p-4 rounded-xl text-left border transition-all cursor-pointer ${
                        targetFormat === fmt.value
                          ? 'bg-accent/5 border-accent'
                          : 'border-border bg-background hover:bg-surface'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-base font-bold ${targetFormat === fmt.value ? 'text-accent' : 'text-foreground'}`}>
                          Convert to {fmt.label}
                        </span>
                        {targetFormat === fmt.value && (
                          <span className="h-2 w-2 rounded-full bg-accent" />
                        )}
                      </div>
                      <span className="text-xs text-muted mt-1 leading-relaxed">
                        {fmt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Converting...' : `Convert to ${targetFormat.toUpperCase()}`}
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
                    message="Converting image format..."
                  />
                </div>
              )}

              {isDone && downloadUrl && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Conversion Complete!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your image is ready in the new format. Click download to retrieve it.
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
                      <span>Convert Another</span>
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
                    <h3 className="text-2xl font-bold">Conversion Failed</h3>
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
