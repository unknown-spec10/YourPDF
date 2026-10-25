'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileSpreadsheet, Settings, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type CompressImageArgs = { file: File; quality: number }

const compressImageSubmitter = ({ file, quality }: CompressImageArgs) =>
  submitJob('/api/image/compress', buildSingleFileFormData(file, { quality }))

export default function CompressImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('medium')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<CompressImageArgs>(compressImageSubmitter)

  const handleSubmit = async () => {
    if (!file) return

    // Map quality presets to integer values
    const qualityMap = {
      low: 40,
      medium: 70,
      high: 90
    }
    const qualityVal = qualityMap[qualityPreset]

    const ok = await submit({ file, quality: qualityVal })
    if (!ok) {
      alert('Failed to initialize image compression task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
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
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Compress Image</h1>
            <p className="text-muted mt-1">Reduce image file size for JPG, PNG, and WEBP while preserving quality.</p>
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
                placeholderText="Drop your image here (JPG, PNG, or WEBP)"
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

              {/* Quality Settings */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  <span>Compression settings</span>
                </button>

                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 p-4 rounded-xl bg-background border border-border flex flex-col gap-3"
                  >
                    <label className="text-sm font-bold">Compression Quality</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['low', 'medium', 'high'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setQualityPreset(lvl)}
                          className={`py-2 px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                            qualityPreset === lvl
                              ? 'bg-accent/10 border-accent text-accent'
                              : 'border-border bg-surface hover:bg-background'
                          }`}
                        >
                          {lvl === 'low' && 'Max Compression'}
                          {lvl === 'medium' && 'Balanced'}
                          {lvl === 'high' && 'Max Quality'}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-muted leading-relaxed mt-1 flex flex-col gap-1.5">
                      {qualityPreset === 'low' && (
                        <span><strong>Max Compression</strong>: Reduces image file size aggressively. Ideal for email sharing or low-bandwidth web pages.</span>
                      )}
                      {qualityPreset === 'medium' && (
                        <span><strong>Balanced Quality</strong>: Optimizes file size with virtually no visible loss in image clarity. Recommended.</span>
                      )}
                      {qualityPreset === 'high' && (
                        <span><strong>Max Quality</strong>: Minimal compression applied. Best for high-res photography or archive backups.</span>
                      )}
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Compressing...' : 'Compress Image'}
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
                    <h3 className="text-2xl font-bold">Compression Complete!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your compressed image is ready. Click below to download.
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
                      <span>Compress Another</span>
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
