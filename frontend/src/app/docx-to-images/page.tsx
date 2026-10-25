'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Image as ImageIcon, Settings, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type DocxToImagesArgs = { file: File; format: string; dpi: number }

const docxToImagesSubmitter = ({ file, format, dpi }: DocxToImagesArgs) =>
  submitJob('/api/office/docx-to-images', buildSingleFileFormData(file, { format, dpi }))

export default function DocxToImagesPage() {
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
  } = useFileJob<DocxToImagesArgs>(docxToImagesSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    const ok = await submit({ file, format, dpi })
    if (!ok) {
      alert('Failed to initialize Word conversion. Please check server connection.')
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
            <ImageIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Word to Images</h1>
            <p className="text-muted mt-1">Convert your Word document (.docx) pages into clean PNG or JPG files.</p>
          </div>
        </div>
      </div>

      {/* Main Form Box */}
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
                accept={{ 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }}
                placeholderText="Drop your Word document (.docx) here"
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

              {/* Advanced Settings */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  <span>Image conversion settings</span>
                </button>

                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 p-4 rounded-xl bg-background border border-border flex flex-col gap-4"
                  >
                    {/* Format selector */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-bold">Output Format</label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['png', 'jpg', 'jpeg'] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setFormat(fmt)}
                            className={`py-2 px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                              format === fmt
                                ? 'bg-accent/10 border-accent text-accent'
                                : 'border-border bg-surface hover:bg-background'
                            }`}
                          >
                            {fmt.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DPI settings */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-bold flex justify-between">
                        <span>Resolution (DPI)</span>
                        <span className="text-accent font-semibold">{dpi} DPI</span>
                      </label>
                      <div className="grid grid-cols-4 gap-3">
                        {([100, 150, 200, 300] as const).map((resolution) => (
                          <button
                            key={resolution}
                            type="button"
                            onClick={() => setDpi(resolution)}
                            className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                              dpi === resolution
                                ? 'bg-accent/10 border-accent text-accent'
                                : 'border-border bg-surface hover:bg-background'
                            }`}
                          >
                            {resolution}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-muted leading-relaxed mt-1">
                        {dpi <= 100 && 'Low: Smallest ZIP size, lower image quality.'}
                        {dpi === 150 && 'Medium: Balanced size and quality. Recommended for documents.'}
                        {dpi === 200 && 'High: Detailed image rendering. Larger file size.'}
                        {dpi === 300 && 'Super High: High resolution print standard. Large file size.'}
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Converting...' : 'Convert to Images'}
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
              {/* Queued / Processing States */}
              {isSubmitting && (
                <div className="w-full max-w-md">
                  <ProgressBar
                    progress={50}
                    message="Rasterizing Word pages..."
                  />
                </div>
              )}

              {/* Success State */}
              {isDone && downloadUrl && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Conversion Completed!</h3>
                    <p className="text-sm text-muted mt-1">
                      {(fileName ?? '').toLowerCase().endsWith('.zip')
                        ? 'Your ZIP archive containing page images is ready.'
                        : 'Your image file is ready for download.'}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4 w-full justify-center items-stretch sm:items-center">
                    <a
                      href={downloadUrl ?? ''}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
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
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Convert Another</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error State */}
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
