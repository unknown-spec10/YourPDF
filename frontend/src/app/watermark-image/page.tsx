'use client'

import { useState, useEffect } from 'react'
import { Type, Image as ImageIcon } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type WatermarkImageArgs = { file: File; text: string; color: string; opacity: number; position: WatermarkPosition }

const watermarkImageSubmitter = ({ file, text, color, opacity, position }: WatermarkImageArgs) =>
  submitJob('/api/image/watermark', buildSingleFileFormData(file, { text, color, opacity, position }))

type WatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile'

export default function WatermarkImagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState<string>('Your Watermark')
  const [color, setColor] = useState<string>('gray')
  const [opacity, setOpacity] = useState<number>(0.3)
  const [position, setPosition] = useState<WatermarkPosition>('center')
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  const job = useFileJob<WatermarkImageArgs>(watermarkImageSubmitter)

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
    if (!file || !text) return
    await job.submit({ file, text, color, opacity, position })
  }

  const handleReset = () => {
    setFile(null)
    job.reset()
    setText('Your Watermark')
    setColor('gray')
    setOpacity(0.3)
    setPosition('center')
  }

  const positionLabels: { value: WatermarkPosition; label: string }[] = [
    { value: 'top-left', label: 'Top Left' },
    { value: 'top-right', label: 'Top Right' },
    { value: 'center', label: 'Center' },
    { value: 'tile', label: 'Tiled' },
    { value: 'bottom-left', label: 'Bottom Left' },
    { value: 'bottom-right', label: 'Bottom Right' },
  ]

  const colorLabels = [
    { value: 'red', label: 'Red', hex: '#FF0000' },
    { value: 'green', label: 'Green', hex: '#00FF00' },
    { value: 'blue', label: 'Blue', hex: '#0000FF' },
    { value: 'gray', label: 'Gray', hex: '#808080' },
    { value: 'black', label: 'Black', hex: '#000000' },
    { value: 'white', label: 'White', hex: '#FFFFFF' },
  ]

  const overlayPositionClass =
    position === 'center' ? 'items-center justify-center text-center' :
    position === 'top-left' ? 'items-start justify-start text-left' :
    position === 'top-right' ? 'items-start justify-end text-right' :
    position === 'bottom-left' ? 'items-end justify-start text-left' :
    position === 'bottom-right' ? 'items-end justify-end text-right' :
    'items-center justify-center text-center'

  const positionLabel = positionLabels.find((p) => p.value === position)?.label ?? position

  return (
    <ToolShell
      icon={<Type className="h-5 w-5" />}
      title="Watermark Image"
      subtitle="Stamp custom text watermarks onto your image files."
      accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
      dropzoneText="Drop your image file here to watermark"
      dropzoneHint="Type your text, pick a color and position, then preview it live."
      replaceAccept=".jpg,.jpeg,.png,.webp"
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`${positionLabel} · ${Math.round(opacity * 100)}%`}
      job={job}
      onSubmit={handleSubmit}
      submitLabel="Apply watermark"
      submitDisabled={!text}
      busyMessage="Stamping watermark on image..."
      doneTitle="Watermarking complete"
      doneBody="Your watermarked image is ready. Preview it below, then download."
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
          <div className="flex flex-col gap-1.5 min-w-0">
            <label htmlFor="wm-text" className="text-[13px] font-semibold">Watermark text</label>
            <input
              id="wm-text"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter watermark text"
              className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Text color</span>
            <div className="flex flex-wrap gap-2">
              {colorLabels.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  aria-pressed={color === c.value}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    color === c.value
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded border border-border/40 shrink-0"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label htmlFor="wm-opacity" className="text-[13px] font-semibold">Opacity</label>
              <span className="text-[13px] font-bold text-accent tabular-nums">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              id="wm-opacity"
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full accent-accent bg-border h-2 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Position</span>
            <div className="grid grid-cols-3 gap-2">
              {positionLabels.map((pos) => (
                <button
                  key={pos.value}
                  type="button"
                  onClick={() => setPosition(pos.value)}
                  aria-pressed={position === pos.value}
                  className={`py-2 text-center text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    position === pos.value
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        </>
      }
      preview={{
        title: 'Live preview',
        aside: positionLabel,
        children: (
          <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-auto overscroll-contain flex items-center justify-center bg-background rounded-lg border border-border p-3">
            {imgSrc ? (
              <div className="relative inline-block max-w-full min-w-0">
                <img
                  src={imgSrc}
                  alt="Watermark preview"
                  className="max-h-[48vh] lg:max-h-[62vh] w-auto max-w-full object-contain select-none rounded-md"
                />
                {position === 'tile' ? (
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 place-items-center gap-1 overflow-hidden p-4">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <span
                        key={i}
                        className="text-xs sm:text-sm font-bold break-words text-center max-w-full"
                        style={{ color: color === 'gray' ? '#808080' : color, opacity }}
                      >
                        {text || 'Your Watermark'}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={`pointer-events-none absolute inset-0 flex p-4 ${overlayPositionClass}`}>
                    <span
                      className="text-lg sm:text-xl font-bold break-words max-w-full"
                      style={{ color: color === 'gray' ? '#808080' : color, opacity }}
                    >
                      {text || 'Your Watermark'}
                    </span>
                  </div>
                )}
              </div>
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
