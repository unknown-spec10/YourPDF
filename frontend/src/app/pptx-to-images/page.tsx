'use client'

import { useState } from 'react'
import { Presentation } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { MAX_RENDER_PAGES } from '@/lib/limits'
import { buildSingleFileFormData, submitJob } from '@/lib/api'
import { formatBytes } from '@/lib/format'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

type PptxToImagesArgs = { file: File; format: string; dpi: number; pages: string }

const pptxToImagesSubmitter = ({ file, format, dpi, pages }: PptxToImagesArgs) =>
  submitJob('/api/office/pptx-to-images', buildSingleFileFormData(file, { format, dpi, pages }))

export default function PptxToImagesPage() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'png' | 'jpg' | 'jpeg'>('png')
  const [dpi, setDpi] = useState<number>(150)
  const [pages, setPages] = useState('all')
  const [showAdvanced, setShowAdvanced] = useState(true)

  const job = useFileJob<PptxToImagesArgs>(pptxToImagesSubmitter)
  const isZip = (job.fileName ?? '').toLowerCase().endsWith('.zip')

  const handleSubmit = async () => {
    if (!file) return
    await job.submit({ file, format, dpi, pages: pages.trim() || 'all' })
  }

  const handleReset = () => {
    setFile(null)
    setPages('all')
    job.reset()
  }

  return (
    <ToolShell
      icon={<Presentation className="h-5 w-5" />}
      title="PPT to Images"
      subtitle="Convert PowerPoint slides (.pptx) into individual PNG or JPG images."
      accept={{ [PPTX_MIME]: ['.pptx'] }}
      replaceAccept={`.pptx,${PPTX_MIME}`}
      dropzoneText="Drop your PowerPoint presentation (.pptx) here"
      dropzoneHint="Each slide renders to an image and downloads as a ZIP archive."
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`${format.toUpperCase()} · ${dpi} DPI`}
      job={job}
      onSubmit={handleSubmit}
      submitLabel="Convert to Images"
      busyMessage="Rasterizing PowerPoint slides..."
      doneTitle="Conversion Completed!"
      doneBody={
        isZip
          ? 'Your ZIP archive containing slide images is ready.'
          : 'Your image file is ready for download.'
      }
      downloadLabel={isZip ? 'Download ZIP' : `Download ${format.toUpperCase()}`}
      errorTitle="Conversion Failed"
      settings={
        <>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
            className="inline-flex items-center justify-between gap-2 text-[13px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <span>Image settings</span>
            <span className="text-xs font-normal">{showAdvanced ? 'Hide' : 'Show'}</span>
          </button>

          {showAdvanced && (
            <div className="flex flex-col gap-4 min-w-0">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold">Output format</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['png', 'jpg', 'jpeg'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      aria-pressed={format === fmt}
                      className={`h-10 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                        format === fmt
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                  <span>Pages</span>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    up to {MAX_RENDER_PAGES}
                  </span>
                </span>
                <input
                  type="text"
                  value={pages}
                  onChange={(event) => setPages(event.target.value)}
                  placeholder="all"
                  aria-label="Pages to render"
                  className="h-10 w-full rounded-lg border border-border bg-surface px-3 font-mono text-[13px] outline-none transition-colors focus:border-accent"
                />
                <p className="text-xs text-muted leading-relaxed">
                  <code>all</code>, or a range like <code>1-3, 5</code>. Renders up to{' '}
                  {MAX_RENDER_PAGES} pages per job.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                  <span>Resolution</span>
                  <span className="font-mono text-xs tabular-nums text-accent">{dpi} DPI</span>
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {([100, 150, 200, 300] as const).map((resolution) => (
                    <button
                      key={resolution}
                      type="button"
                      onClick={() => setDpi(resolution)}
                      aria-pressed={dpi === resolution}
                      className={`h-10 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                        dpi === resolution
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      {resolution}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  {dpi <= 100 && 'Low: smallest ZIP size, lower image quality.'}
                  {dpi === 150 && 'Medium: balanced size and quality. Recommended for slides.'}
                  {dpi === 200 && 'High: detailed image rendering. Larger file size.'}
                  {dpi === 300 && 'Super high: high resolution print standard. Large file size.'}
                </p>
              </div>
            </div>
          )}
        </>
      }
      preview={{
        title: 'Selected presentation',
        aside: `${format.toUpperCase()} · ${dpi} DPI`,
        children: file && (
          <>
            <div className="flex items-center gap-3 min-w-0 rounded-lg border border-border bg-background p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Presentation className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {formatBytes(file.size)} · Presentation
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Slide decks cannot be previewed in the browser. Output is a ZIP of{' '}
              {format.toUpperCase()} images at {dpi} DPI.
            </p>
          </>
        ),
      }}
    />
  )
}
