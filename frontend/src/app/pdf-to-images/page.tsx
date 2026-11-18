'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Image as ImageIcon, Settings } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'
import { MAX_RENDER_PAGES } from '@/lib/limits'

type PdfToImagesArgs = { file: File; format: string; dpi: number; pages: string }

const pdfToImagesSubmitter = ({ file, format, dpi, pages }: PdfToImagesArgs) =>
  submitJob('/api/pdf-to-images', buildSingleFileFormData(file, { format, dpi, pages }))

export default function PdfToImagesPage() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'png' | 'jpg' | 'jpeg'>('png')
  const [dpi, setDpi] = useState<number>(150)
  // Sent to the API as the page spec ("all", "1-3, 5"). The endpoint already parsed this; the
  // UI simply never offered it, so a 250-page PDF was rejected with advice the user could not
  // follow.
  const [pages, setPages] = useState<string>('all')
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [countingPages, setCountingPages] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setFileUrl(null)
    }
  }, [file])

  const job = useFileJob<PdfToImagesArgs>(pdfToImagesSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    await job.submit({ file, format, dpi, pages: pages.trim() || 'all' })
  }

  /**
   * Page count is fetched only when the user actually touches the range control: calling
   * /api/pdf-info re-uploads the file, so the common "all pages" path pays nothing.
   */
  const loadPageCount = async () => {
    if (!file || pageCount !== null || countingPages) return
    setCountingPages(true)
    try {
      const body = buildSingleFileFormData(file)
      const res = await submitJob('/api/pdf-info', body)
      if (res.ok) {
        const data = (await res.json()) as { num_pages?: number }
        if (typeof data.num_pages === 'number') setPageCount(data.num_pages)
      }
    } catch {
      // A count is a convenience; the server still validates the real selection.
    } finally {
      setCountingPages(false)
    }
  }

  const overBudget = pages.trim().toLowerCase() === 'all' && pageCount !== null && pageCount > MAX_RENDER_PAGES

  const handleReset = () => {
    setFile(null)
    setPages('all')
    setPageCount(null)
    job.reset()
  }

  const isZip = (job.fileName ?? '').toLowerCase().endsWith('.zip')

  return (
    <ToolShell
      icon={<ImageIcon className="h-5 w-5" />}
      title='PDF to Images'
      subtitle='Convert your PDF pages into high-quality images (PNG, JPG).'
      file={file}
      onFileAccepted={setFile}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`${format.toUpperCase()} · ${dpi} DPI`}
      job={job}
      onSubmit={handleSubmit}
      submitLabel='Convert to Images'
      dropzoneHint='Output is a ZIP of page images — no image preview. Source first page shown for confirmation.'
      busyMessage='Rasterizing PDF pages...'
      doneTitle='Conversion Completed!'
      doneBody={isZip ? 'Your ZIP archive is ready for download.' : 'Your image file is ready for download.'}
      downloadLabel={isZip ? 'Download ZIP' : `Download ${format.toUpperCase()}`}
      errorTitle='Conversion Failed'
      settings={
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <Settings className="h-4 w-4" />
            <span>01 — Image conversion settings</span>
          </button>

          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2.5 rounded-xl bg-background border border-border p-3 flex flex-col gap-3.5"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">Output Format</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['png', 'jpg', 'jpeg'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      className={`py-2 px-2 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                        format === fmt
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold flex justify-between gap-2">
                  <span>Pages</span>
                  <span className="text-muted font-mono tabular-nums text-xs">
                    {countingPages
                      ? 'counting…'
                      : pageCount !== null
                        ? `${pageCount} pages`
                        : `up to ${MAX_RENDER_PAGES} per job`}
                  </span>
                </span>
                <input
                  type="text"
                  value={pages}
                  onChange={(event) => setPages(event.target.value)}
                  onFocus={() => void loadPageCount()}
                  placeholder="all"
                  aria-label="Pages to render"
                  className="h-10 w-full rounded-lg border border-border bg-transparent px-3 font-mono text-[13px] outline-none transition-colors focus:border-accent"
                />
                <span className="text-xs text-muted leading-relaxed">
                  <code>all</code>, or a range like <code>1-3, 5</code>. Renders up to{' '}
                  {MAX_RENDER_PAGES} pages per job.
                </span>
                {overBudget && (
                  <span className="text-xs font-semibold text-danger">
                    This PDF has {pageCount} pages. Pick a range of {MAX_RENDER_PAGES} or fewer.
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold flex justify-between gap-2">
                  <span>Resolution (DPI)</span>
                  <span className="text-accent font-mono tabular-nums">{dpi} DPI</span>
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {([100, 150, 200, 300] as const).map((resolution) => (
                    <button
                      key={resolution}
                      type="button"
                      onClick={() => setDpi(resolution)}
                      className={`py-2 px-2 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                        dpi === resolution
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      {resolution}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted leading-relaxed">
                  {dpi <= 100 && 'Low: Smallest ZIP size, lower image quality.'}
                  {dpi === 150 && 'Medium: Balanced size and quality. Recommended for documents.'}
                  {dpi === 200 && 'High: Detailed image rendering. Larger file size.'}
                  {dpi === 300 && 'Super High: High resolution print standard. Large file size.'}
                </span>
              </div>
            </motion.div>
          )}
        </div>
      }
      preview={{
        title: '02 — Source preview',
        aside: `${format.toUpperCase()} · ${dpi} DPI`,
        children: (
          <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
            <div className="relative mx-auto w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden">
              {fileUrl ? (
                <iframe
                  loading="lazy"
                  src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                  className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                  title="Source PDF first page"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted">Reading document…</div>
              )}
            </div>
            <p className="mt-2.5 text-center text-xs text-muted">
              Result is a ZIP archive of page images — download only, no in-browser preview.
            </p>
          </div>
        ),
      }}
    />
  )
}
