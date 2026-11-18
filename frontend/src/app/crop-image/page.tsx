'use client'

import { useState, useEffect, useRef } from 'react'
import { Crop as CropIcon } from 'lucide-react'
import ReactCrop, { type Crop } from 'react-image-crop'
import ToolShell from '@/components/tool/ToolShell'
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

  const job = useFileJob<CropImageArgs>(cropImageSubmitter)

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

    await job.submit({ file, x: scaledX, y: scaledY, width: scaledW, height: scaledH })
  }

  const handleReset = () => {
    setFile(null)
    job.reset()
    imgRef.current = null
  }

  return (
    <ToolShell
      icon={<CropIcon className="h-5 w-5" />}
      title="Crop Image"
      subtitle="Drag on the image to select the area to keep."
      accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
      dropzoneText="Drop your image here to crop"
      dropzoneHint="Drag a box on the full-size preview. The crop is applied at original resolution."
      replaceAccept=".jpg,.jpeg,.png,.webp"
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={
        naturalDimensions.width
          ? `${naturalDimensions.width} × ${naturalDimensions.height} px`
          : 'reading…'
      }
      job={job}
      onSubmit={handleSubmit}
      submitLabel="Crop and save image"
      submitDisabled={!crop.width || !crop.height}
      busyMessage="Cropping image on server..."
      doneTitle="Cropping complete"
      doneBody="Your cropped image is ready. Preview it below, then download."
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
      }
      preview={{
        title: 'Crop preview',
        aside:
          naturalDimensions.width && crop.width && crop.height
            ? `${Math.round((crop.width / 100) * naturalDimensions.width)} × ${Math.round(
                (crop.height / 100) * naturalDimensions.height,
              )} px`
            : '—',
        children: (
          <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto flex justify-center items-start bg-background rounded-lg border border-border p-3">
            {imgSrc ? (
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} className="max-w-full">
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
        ),
      }}
    />
  )
}
