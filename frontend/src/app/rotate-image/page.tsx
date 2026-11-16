'use client'

import { useState, useEffect } from 'react'
import { RotateCw, RotateCcw } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type RotateImageArgs = { file: File; angle: number }

const rotateImageSubmitter = ({ file, angle }: RotateImageArgs) =>
  submitJob('/api/image/rotate', buildSingleFileFormData(file, { angle }))

export default function RotateImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [imgSrc, setImgSrc] = useState<string>('')
  const [angle, setAngle] = useState<0 | 90 | 180 | 270>(0)

  const job = useFileJob<RotateImageArgs>(rotateImageSubmitter)

  // Object URL preview
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

  const handleRotateLeft = () => {
    setAngle((prev) => {
      if (prev === 0) return 270
      if (prev === 90) return 0
      if (prev === 180) return 90
      return 180
    })
  }

  const handleRotateRight = () => {
    setAngle((prev) => {
      if (prev === 0) return 90
      if (prev === 90) return 180
      if (prev === 180) return 270
      return 0
    })
  }

  const handleSubmit = async () => {
    if (!file || angle === 0) return
    await job.submit({ file, angle })
  }

  const handleReset = () => {
    setFile(null)
    job.reset()
    setAngle(0)
  }

  return (
    <ToolShell
      icon={<RotateCw className="h-5 w-5" />}
      title="Rotate Image"
      subtitle="Rotate images by 90, 180, or 270 degrees with live visual preview."
      accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
      dropzoneText="Drop your image file here to rotate"
      dropzoneHint="Use the rotate buttons to preview the result before applying."
      replaceAccept=".jpg,.jpeg,.png,.webp"
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`rotation ${angle}°`}
      job={job}
      onSubmit={handleSubmit}
      submitLabel={angle === 0 ? 'Select a rotation angle' : `Apply ${angle}° rotation`}
      submitDisabled={angle === 0}
      busyMessage="Rotating image..."
      doneTitle="Rotation complete"
      doneBody="Your rotated image is ready. Preview it below, then download."
      downloadLabel="Download image"
      doneMedia={
        job.downloadUrl ? (
          <img
            src={job.downloadUrl}
            alt="Processed image"
            className="max-h-[40vh] w-auto max-w-full rounded-lg border border-border object-contain"
          />
        ) : null
      }
      errorTitle="Processing failed"
      settings={
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Rotation</span>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            <button
              type="button"
              onClick={handleRotateLeft}
              className="rounded-lg border border-border px-3 py-2.5 text-left transition-colors cursor-pointer hover:border-accent/50"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <RotateCcw className="h-4 w-4" />
                Rotate left
              </span>
              <span className="block text-xs text-muted font-normal mt-0.5">−90 degrees</span>
            </button>
            <button
              type="button"
              onClick={handleRotateRight}
              className="rounded-lg border border-border px-3 py-2.5 text-left transition-colors cursor-pointer hover:border-accent/50"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <RotateCw className="h-4 w-4" />
                Rotate right
              </span>
              <span className="block text-xs text-muted font-normal mt-0.5">+90 degrees</span>
            </button>
          </div>
          <p className="font-mono text-xs tabular-nums text-muted">Current: {angle}°</p>
        </div>
      }
      preview={{
        title: 'Live preview',
        aside: `${angle}°`,
        children: (
          <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto overscroll-contain flex items-center justify-center bg-background rounded-lg border border-border p-4">
            {imgSrc ? (
              <img
                src={imgSrc}
                style={{ transform: `rotate(${angle}deg)` }}
                alt="Rotation preview"
                className="max-h-[44vh] lg:max-h-[58vh] max-w-full object-contain transition-transform duration-300 ease-out select-none rounded-md shadow-sm"
              />
            ) : null}
          </div>
        ),
      }}
    />
  )
}
