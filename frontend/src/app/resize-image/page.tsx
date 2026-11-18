'use client'

import { useState, useEffect } from 'react'
import { Maximize, Image as ImageIcon } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type ResizeImageArgs = { file: File; mode: 'pixels' | 'percentage'; width: string; height: string; maintain_aspect: boolean; percentage: number }

const resizeImageSubmitter = ({ file, mode, width, height, maintain_aspect, percentage }: ResizeImageArgs) => {
  const params: Record<string, string | number | boolean> = { maintain_aspect }
  if (mode === 'percentage') {
    params.percentage = percentage
  } else {
    if (width) params.width = width
    if (height) params.height = height
  }
  return submitJob('/api/image/resize', buildSingleFileFormData(file, params))
}

export default function ResizeImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'pixels' | 'percentage'>('pixels')

  // Pixels parameters
  const [width, setWidth] = useState<string>('')
  const [height, setHeight] = useState<string>('')
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true)

  // Percentage parameters
  const [percentage, setPercentage] = useState<number>(50)
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  const job = useFileJob<ResizeImageArgs>(resizeImageSubmitter)

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
    await job.submit({ file, mode, width, height, maintain_aspect: maintainAspect, percentage })
  }

  const handleReset = () => {
    setFile(null)
    job.reset()
    setWidth('')
    setHeight('')
    setPercentage(50)
  }

  const missingDimensions = mode === 'pixels' && !width && !height

  return (
    <ToolShell
      icon={<Maximize className="h-5 w-5" />}
      title="Resize Image"
      subtitle="Scale width and height dimensions by pixels or percentage."
      accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
      dropzoneText="Drop your image here to resize"
      dropzoneHint="Enter at least one dimension in pixels, or pick a scale percentage."
      replaceAccept=".jpg,.jpeg,.png,.webp"
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={mode === 'percentage' ? `${percentage}%` : undefined}
      job={job}
      onSubmit={handleSubmit}
      submitLabel="Resize image"
      submitDisabled={missingDimensions}
      busyMessage="Resizing image..."
      doneTitle="Resizing complete"
      doneBody="Your resized image is ready. Preview it below, then download."
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
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Resize mode</span>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setMode('pixels')}
                aria-pressed={mode === 'pixels'}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  mode === 'pixels'
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <span className="block text-[13px] font-semibold">By pixels</span>
                <span className="block text-xs text-muted font-normal mt-0.5">Exact dimensions</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('percentage')}
                aria-pressed={mode === 'percentage'}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  mode === 'percentage'
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <span className="block text-[13px] font-semibold">By percentage</span>
                <span className="block text-xs text-muted font-normal mt-0.5">Quick scaling</span>
              </button>
            </div>
          </div>

          {mode === 'pixels' ? (
            <div className="flex flex-col gap-2 min-w-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor="resize-width" className="text-[13px] font-semibold">Width (px)</label>
                  <input
                    id="resize-width"
                    type="number"
                    placeholder="Auto"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor="resize-height" className="text-[13px] font-semibold">Height (px)</label>
                  <input
                    id="resize-height"
                    type="number"
                    placeholder="Auto"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                  />
                </div>
              </div>
              <label htmlFor="maintainAspect" className="flex items-center gap-2 text-[13px] text-muted select-none cursor-pointer">
                <input
                  type="checkbox"
                  id="maintainAspect"
                  checked={maintainAspect}
                  onChange={(e) => setMaintainAspect(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                <span>Lock aspect ratio</span>
              </label>
            </div>
          ) : (
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex justify-between items-center">
                <label htmlFor="resize-pct" className="text-[13px] font-semibold">Scale</label>
                <span className="text-[13px] font-bold text-accent tabular-nums">{percentage}%</span>
              </div>
              <input
                id="resize-pct"
                type="range"
                min="10"
                max="100"
                step="5"
                value={percentage}
                onChange={(e) => setPercentage(Number(e.target.value))}
                className="w-full accent-accent bg-border h-2 rounded-lg cursor-pointer"
              />
              <div className="grid grid-cols-4 gap-2">
                {[25, 50, 75, 90].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPercentage(val)}
                    aria-pressed={percentage === val}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      percentage === val
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'border-border hover:border-accent/50'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      }
      preview={{
        title: 'Source preview',
        aside: mode === 'percentage' ? `${percentage}%` : `${width || 'auto'} × ${height || 'auto'}`,
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
