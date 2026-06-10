'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Crop as CropIcon, Download, RefreshCw, AlertTriangle } from 'lucide-react'
import ReactCrop, { type Crop } from 'react-image-crop'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'

import 'react-image-crop/dist/ReactCrop.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

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
  
  const [jobId, setJobId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, () => {})

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

  useEffect(() => {
    return () => setJobId(null)
  }, [])

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
    setIsSubmitting(true)

    // Calculate scale factor relative to natural image dimensions
    const renderedWidth = imgRef.current.width
    const renderedHeight = imgRef.current.height
    
    const scaleX = naturalDimensions.width / renderedWidth
    const scaleY = naturalDimensions.height / renderedHeight

    const scaledX = Math.round(crop.x * scaleX)
    const scaledY = Math.round(crop.y * scaleY)
    const scaledW = Math.round(crop.width * scaleX)
    const scaledH = Math.round(crop.height * scaleY)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('x', String(scaledX))
    formData.append('y', String(scaledY))
    formData.append('width', String(scaledW))
    formData.append('height', String(scaledH))

    try {
      const response = await axios.post(`${API_URL}/api/image/crop`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err) {
      console.error(err)
      alert('Failed to initialize image cropping task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setJobId(null)
    imgRef.current = null
  }

  const isQueued = jobStatus?.status === 'queued'
  const isProcessing = jobStatus?.status === 'processing'
  const isDone = jobStatus?.status === 'done'
  const isError = jobStatus?.status === 'error' || !!pollError

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
            <CropIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Crop Image</h1>
            <p className="text-muted mt-1">Interactively select and crop specific areas of your image.</p>
          </div>
        </div>
      </div>

      {/* Main Box */}
      <div className="rounded-2xl border border-card-border bg-surface p-6 md:p-8 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {!file && !jobId && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DropZone
                onFileAccepted={setFile}
                accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
                placeholderText="Drop your image here to crop"
              />
            </motion.div>
          )}

          {file && !jobId && imgSrc && (
            <motion.div
              key="crop-preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              <div className="flex justify-between items-center bg-background border border-border p-4 rounded-xl">
                <div className="truncate pr-4">
                  <p className="text-sm font-semibold truncate text-foreground">{file.name}</p>
                  <p className="text-xs text-muted">
                    Original dimensions: {naturalDimensions.width ? `${naturalDimensions.width} × ${naturalDimensions.height} px` : 'Loading...'}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                >
                  Remove File
                </button>
              </div>

              {/* Interactive Cropper */}
              <div className="flex justify-center items-center p-4 rounded-xl border border-border bg-background overflow-auto max-h-[450px]">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  className="max-w-full"
                >
                  <img
                    src={imgSrc}
                    onLoad={handleImageLoad}
                    alt="Source image to crop"
                    className="max-h-[380px] object-contain select-none"
                  />
                </ReactCrop>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !crop.width || !crop.height}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Processing Crop...' : 'Crop and Save Image'}
              </button>
            </motion.div>
          )}

          {jobId && (
            <motion.div
              key="processing-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center py-6 text-center"
            >
              {(isQueued || isProcessing) && (
                <div className="w-full max-w-md">
                  <ProgressBar
                    progress={jobStatus?.progress || 0}
                    message={jobStatus?.message || 'Cropping image on server...'}
                  />
                </div>
              )}

              {isDone && jobStatus?.result && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Cropping Complete!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your cropped image has been processed. Download below.
                    </p>
                  </div>
                  <div className="flex gap-4 mt-4">
                    <a
                      href={
                        jobStatus.result.download_url.startsWith('http')
                          ? jobStatus.result.download_url
                          : `${API_URL}${jobStatus.result.download_url}`
                      }
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
                      <span>Crop Another</span>
                    </button>
                  </div>
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Processing Failed</h3>
                    <p className="text-sm text-muted mt-1">
                      {jobStatus?.message || 'An unexpected error occurred during processing.'}
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
