'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Image as ImageIcon } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type ConvertImageArgs = { file: File; target_format: ImageFormat; render_width?: string }

const convertImageSubmitter = ({ file, target_format, render_width }: ConvertImageArgs) =>
  submitJob(
    '/api/image/convert',
    buildSingleFileFormData(
      file,
      render_width ? { target_format, render_width } : { target_format },
    ),
  )

type ImageFormat = 'png' | 'jpg' | 'webp' | 'bmp' | 'tiff' | 'svg'

export default function ConvertImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [targetFormat, setTargetFormat] = useState<ImageFormat>('png')
  const [renderWidth, setRenderWidth] = useState<string>('')
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  const job = useFileJob<ConvertImageArgs>(convertImageSubmitter)

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

  const isSvg = file?.name.toLowerCase().endsWith('.svg') ?? false

  const handleSubmit = async () => {
    if (!file) return
    const trimmedWidth = renderWidth.trim()
    await job.submit(
      isSvg && trimmedWidth !== ''
        ? { file, target_format: targetFormat, render_width: trimmedWidth }
        : { file, target_format: targetFormat },
    )
  }

  const handleReset = () => {
    setFile(null)
    setRenderWidth('')
    job.reset()
  }

  const formats: { value: ImageFormat; label: string; desc: string }[] = [
    { value: 'png', label: 'PNG', desc: 'Lossless compression, preserves transparency. Best for graphics.' },
    { value: 'jpg', label: 'JPG/JPEG', desc: 'Lossy compression. Best for photos and web pages.' },
    { value: 'webp', label: 'WEBP', desc: 'Modern web format. Exceptional compression and quality.' },
    { value: 'bmp', label: 'BMP', desc: 'Bitmap image format. Uncompressed raw graphic file.' },
    { value: 'tiff', label: 'TIFF', desc: 'Tagged Image File. High-quality format used in printing/graphics.' },
    { value: 'svg', label: 'SVG', desc: 'Image embedded losslessly inside an SVG wrapper. Editable in vector design tools.' },
  ]

  return (
    <ToolShell
      icon={<RefreshCw className="h-5 w-5" />}
      title="Convert Image"
      subtitle="Convert JPG, PNG, WEBP, BMP, TIFF, GIF, or SVG to PNG, JPG, WEBP, BMP, TIFF, or SVG in one click."
      accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.svg'] }}
      dropzoneText="Drop your image file here to convert"
      dropzoneHint="Pick the output format on the next step. Transparency is preserved for PNG and WEBP."
      replaceAccept=".jpg,.jpeg,.png,.webp,.bmp,.tiff,.gif,.svg"
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`to ${targetFormat.toUpperCase()}`}
      job={job}
      onSubmit={handleSubmit}
      submitLabel={`Convert to ${targetFormat.toUpperCase()}`}
      busyMessage="Converting image format..."
      doneTitle="Conversion complete"
      doneBody={`Your image is ready in ${targetFormat.toUpperCase()}. Preview it below, then download.`}
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
      errorTitle="Conversion failed"
      settings={
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Output format</span>
            <div className="flex flex-col gap-2">
              {formats.map((fmt) => (
                <button
                  key={fmt.value}
                  type="button"
                  onClick={() => setTargetFormat(fmt.value)}
                  aria-pressed={targetFormat === fmt.value}
                  className={`flex flex-col p-3 rounded-lg text-left border transition-colors cursor-pointer ${
                    targetFormat === fmt.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{fmt.label}</span>
                    {targetFormat === fmt.value && (
                      <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                    )}
                  </span>
                  <span className="text-xs text-muted mt-0.5 leading-relaxed">{fmt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {isSvg && (
            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor="svg-render-width" className="text-[13px] font-semibold">Render width (px)</label>
              <input
                id="svg-render-width"
                type="number"
                placeholder="natural size"
                min={64}
                max={8000}
                step={1}
                value={renderWidth}
                onChange={(e) => setRenderWidth(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
              />
              <p className="text-xs text-muted leading-relaxed">
                SVG is vector — it renders at this width with aspect preserved. Leave empty for the original size.
              </p>
            </div>
          )}
        </>
      }
      preview={{
        title: 'Source preview',
        aside: `to ${targetFormat.toUpperCase()}`,
        children: (
          <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto overscroll-contain flex items-center justify-center bg-background rounded-lg border border-border">
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
