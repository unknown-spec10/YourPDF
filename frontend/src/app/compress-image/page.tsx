'use client'

import { useState, useEffect } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'
import { formatBytes } from '@/lib/format'

type CompressImageArgs = { file: File; quality: number }

const compressImageSubmitter = ({ file, quality }: CompressImageArgs) =>
  submitJob('/api/image/compress', buildSingleFileFormData(file, { quality }))

export default function CompressImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('medium')
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  const job = useFileJob<CompressImageArgs>(compressImageSubmitter)

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
    if (!file) return

    // Map quality presets to integer values
    const qualityMap = {
      low: 40,
      medium: 70,
      high: 90,
    }
    const qualityVal = qualityMap[qualityPreset]

    await job.submit({ file, quality: qualityVal })
  }

  const handleReset = () => {
    setFile(null)
    job.reset()
  }

  return (
    <ToolShell
      icon={<ImageIcon className="h-5 w-5" />}
      title="Compress Image"
      subtitle="Reduce image file size for JPG, PNG, and WEBP while preserving quality."
      accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
      dropzoneText="Drop your image here (JPG, PNG, or WEBP)"
      dropzoneHint="Balanced mode keeps visual quality while shrinking the file. Max compression is best for sharing."
      replaceAccept=".jpg,.jpeg,.png,.webp"
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      job={job}
      onSubmit={handleSubmit}
      submitLabel="Compress image"
      busyMessage="Compressing image..."
      doneTitle="Compression complete"
      doneBody="Your compressed image is ready. Preview it below, then download."
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
          <span className="text-[13px] font-semibold">Compression level</span>
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
            {(['low', 'medium', 'high'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setQualityPreset(lvl)}
                aria-pressed={qualityPreset === lvl}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  qualityPreset === lvl
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <span className="block text-[13px] font-semibold">
                  {lvl === 'low' && 'Max compression'}
                  {lvl === 'medium' && 'Balanced'}
                  {lvl === 'high' && 'Max quality'}
                </span>
                <span className="block text-xs text-muted font-normal mt-0.5">
                  {lvl === 'low' && 'Smallest file'}
                  {lvl === 'medium' && 'Recommended'}
                  {lvl === 'high' && 'Best fidelity'}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {qualityPreset === 'low' &&
              'Reduces file size aggressively. Ideal for email sharing or low-bandwidth pages.'}
            {qualityPreset === 'medium' &&
              'Optimizes file size with virtually no visible loss. Recommended.'}
            {qualityPreset === 'high' &&
              'Minimal compression. Best for high-res photography or archives.'}
          </p>
        </div>
      }
      preview={{
        title: 'Source preview',
        aside: file ? `${formatBytes(file.size)}` : undefined,
        children: (
          <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto flex items-center justify-center bg-background rounded-lg border border-border">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt="Source image preview"
                className="max-h-[50vh] lg:max-h-[66vh] w-auto max-w-full object-contain select-none"
              />
            ) : (
              <div className="flex flex-col items-center text-xs text-muted p-6">
                <ImageIcon className="h-7 w-7 text-muted/40 mb-2" />
                <span>Loading preview…</span>
              </div>
            )}
          </div>
        ),
      }}
    />
  )
}
