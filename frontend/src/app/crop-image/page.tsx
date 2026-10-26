'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Crop as CropIcon, Download, RefreshCw, AlertTriangle, FileText, X, Repeat } from 'lucide-react'
import ReactCrop, { type Crop } from 'react-image-crop'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

import 'react-image-crop/dist/ReactCrop.css'

type CropImageArgs = { file: File; x: number; y: number; width: number; height: number }

const cropImageSubmitter = ({ file, x, y, width, height }: CropImageArgs) =>
  submitJob('/api/image/crop', buildSingleFileFormData(file, { x, y, width, height }))

export default function CropImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [imgSrc, setImgSrc] = useState<string>('')
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 10,
    y: 10,
    width: 80,
    height: 80
  })

  const imgRef = useRef<HTMLImageElement | null>(null)
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 })


  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<CropImageArgs>(cropImageSubmitter)

  // Create local Object URL when file is selected
  useEffect(() => {
    if (!file) {
      setImgSrc('')
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    setNaturalDimensions({ width: naturalWidth, height: naturalHeight })
    imgRef.current = e.currentTarget

    // Reset initial crop
    setCrop({
      unit: '%',
      x: 10,
      y: 10,
      width: 80,
      height: 80
    })
  }

  const handleSubmit = async () => {
    if (!file || !imgRef.current || !crop.width || !crop.height) return
    if (!naturalDimensions.width || !naturalDimensions.height) return

    // Crop state uses '%' units, so convert percentages to natural pixels
    const scaledX = Math.round((crop.x / 100) * naturalDimensions.width)
    const scaledY = Math.round((crop.y / 100) * naturalDimensions.height)
    const scaledW = Math.round((crop.width / 100) * naturalDimensions.width)
    const scaledH = Math.round((crop.height / 100) * naturalDimensions.height)

    const ok = await submit({ file, x: scaledX, y: scaledY, width: scaledW, height: scaledH })
    if (!ok) {
      alert('Failed to initialize image cropping task. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
    imgRef.current = null
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
            <CropIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Crop Image</h1>
            <p className="text-sm text-muted mt-0.5">Drag on the image to select the area to keep.</p>
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
              placeholderText="Drop your image here to crop"
            />
            <p className="text-center text-xs text-muted">
              Drag a box on the full-size preview. The crop is applied at original resolution.
            </p>
          </motion.div>
        )}

        {isWorkspace && file && (
          <motion.div
            key="crop-preview"
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
                  {naturalDimensions.width ? ` · ${naturalDimensions.width} × ${naturalDimensions.height} px` : ' · reading…'}
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

            {/* Workspace: compact settings + generous crop preview */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">Selection</span>
                  <p className="font-mono text-xs tabular-nums text-muted">
                    {naturalDimensions.width
                      ? `${naturalDimensions.width} × ${naturalDimensions.height} px source`
                      : 'Reading dimensions…'}
                  </p>
                  <p className="text-xs text-muted leading-relaxed">
                    Drag the corners to resize. The output keeps full-resolution detail.
                  </p>
                </div>

                <div className="sticky bottom-3 lg:static z-10">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !crop.width || !crop.height}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm"
                  >
                    Crop and save image
                  </button>
                </div>
              </div>

              {/* Preview — the one card, interactive cropper */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">Crop preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {naturalDimensions.width && crop.width && crop.height
                      ? `${Math.round((crop.width / 100) * naturalDimensions.width)} × ${Math.round((crop.height / 100) * naturalDimensions.height)} px`
                      : '—'}
                  </span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto flex justify-center items-start bg-background rounded-lg border border-border p-3">
                    {imgSrc ? (
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      className="max-w-full"
                    >
                      <img
                        src={imgSrc}
                        onLoad={handleImageLoad}
                        alt="Source image to crop"
                        className="max-h-[48vh] lg:max-h-[62vh] object-contain select-none"
                      />
                    </ReactCrop>
                    ) : (
                      <div className="flex flex-col items-center self-center text-xs text-muted p-6">
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
                  message="Cropping image on server..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0 w-full max-w-lg">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Cropping complete</h3>
                  <p className="text-sm text-muted mt-1">
                    Your cropped image is ready. Preview it below, then download.
                  </p>
                </div>
                <div className="w-full min-w-0 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                  <img
                    src={downloadUrl}
                    alt="Cropped image result"
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
                    <span>Crop another</span>
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
