'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useEffect } from 'react'
import { useFileJob } from '@/hooks/useFileJob'
import { MAX_RENDER_PAGES } from '@/lib/limits'
import { buildSingleFileFormData, submitJob } from '@/lib/api'
import { formatBytes } from '@/lib/format'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type DocxToImagesArgs = { file: File; format: string; dpi: number; pages: string }

const docxToImagesSubmitter = ({ file, format, dpi, pages }: DocxToImagesArgs) =>
  submitJob('/api/office/docx-to-images', buildSingleFileFormData(file, { format, dpi, pages }))


function DocxHtmlPreview({ file, caption }: { file: File; caption: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    setHtml(null)
    file
      .arrayBuffer()
      .then(async (buffer) => {
        try {
          const mammothModule = await import('mammoth')
          const result = await mammothModule.default.convertToHtml({ arrayBuffer: buffer })
          if (!cancelled) {
            setHtml(result.value)
            setIsLoading(false)
          }
        } catch {
          if (!cancelled) {
            setHasError(true)
            setIsLoading(false)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true)
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [file])

  if (isLoading) {
    return (
      <div className="mt-3 rounded-lg border border-border bg-background p-4" aria-live="polite">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
          <span>Rendering document preview…</span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-3 w-11/12 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    )
  }

  if (hasError || !html) {
    return (
      <p className="mt-3 text-xs text-muted leading-relaxed">
        Live preview unavailable for this file. Verify the name and size above to continue.
      </p>
    )
  }

  return (
    <div className="mt-3 min-w-0">
      <div className="max-h-[480px] overflow-y-auto overscroll-contain rounded-lg border border-border bg-background p-4">
        <div
          className="min-w-0 text-sm leading-relaxed text-foreground [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:mb-2 [&_p]:break-words [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_table]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_img]:max-w-full [&_img]:rounded-md"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted leading-relaxed">
        {caption}
      </p>
    </div>
  )
}

export default function DocxToImagesPage() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'png' | 'jpg' | 'jpeg'>('png')
  const [dpi, setDpi] = useState<number>(150)
  const [pages, setPages] = useState('all')
  const [showAdvanced, setShowAdvanced] = useState(true)

  const job = useFileJob<DocxToImagesArgs>(docxToImagesSubmitter)
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
      icon={<FileText className="h-5 w-5" />}
      title="Word to Images"
      subtitle="Convert your Word document (.docx) pages into clean PNG or JPG files."
      accept={{ [DOCX_MIME]: ['.docx'] }}
      replaceAccept={`.docx,${DOCX_MIME}`}
      dropzoneText="Drop your Word document (.docx) here"
      dropzoneHint="Each page renders to an image and downloads as a ZIP archive."
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`${format.toUpperCase()} · ${dpi} DPI`}
      job={job}
      onSubmit={handleSubmit}
      submitLabel="Convert to Images"
      busyMessage="Rasterizing Word pages..."
      doneTitle="Conversion Completed!"
      doneBody={
        isZip
          ? 'Your ZIP archive containing page images is ready.'
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
                  {dpi === 150 && 'Medium: balanced size and quality. Recommended for documents.'}
                  {dpi === 200 && 'High: detailed image rendering. Larger file size.'}
                  {dpi === 300 && 'Super high: high resolution print standard. Large file size.'}
                </p>
              </div>
            </div>
          )}
        </>
      }
      preview={{
        title: 'Selected document',
        aside: `${format.toUpperCase()} · ${dpi} DPI`,
        children: file && (
          <>
            <div className="flex items-center gap-3 min-w-0 rounded-lg border border-border bg-background p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {formatBytes(file.size)} · Word document
                </p>
              </div>
            </div>
            <DocxHtmlPreview
              file={file}
              caption={`Live preview rendered from the document text. Output is a ZIP of ${format.toUpperCase()} images at ${dpi} DPI.`}
            />
          </>
        ),
      }}
    />
  )
}
