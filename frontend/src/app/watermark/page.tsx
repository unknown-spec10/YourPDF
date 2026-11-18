'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Type, Settings, ZoomIn } from 'lucide-react'
import ZoomDialog from '@/components/tool/ZoomDialog'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { apiClient, submitJob, buildSingleFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

type WatermarkArgs = { file: File; text: string; color: string; opacity: number; rotation: number; font_size: number; pages: string }

const watermarkSubmitter = ({ file, text, color, opacity, rotation, font_size, pages }: WatermarkArgs) =>
  submitJob('/api/watermark', buildSingleFileFormData(file, { text, color, opacity, rotation, font_size, pages }))

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [color, setColor] = useState('gray')
  const [opacity, setOpacity] = useState(0.3)
  const [rotation, setRotation] = useState(45)
  const [fontSize, setFontSize] = useState(48)
  const [pages, setPages] = useState('all')
  const [numPages, setNumPages] = useState<number | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isZoomOpen, setIsZoomOpen] = useState(false)

  // Manage local file URL for preview and fetch page count
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)

      const formData = new FormData()
      formData.append('file', file)
      apiClient.post('/api/pdf-info', formData)
        .then((res) => {
          setNumPages(res.data.num_pages)
        })
        .catch((err) => {
          console.error('Failed to get PDF info:', err)
        })

      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setFileUrl(null)
      setNumPages(null)
    }
  }, [file])

  // Parse pages to a Set of 1-based page numbers that will be stamped.
  // 'all' (case insensitive) selects every page; otherwise split-style
  // ranges like 1-3, 5 with open-ended 3- supported.
  const getSelectedPages = (): Set<number> => {
    const selected = new Set<number>()
    if (!numPages) return selected
    const trimmedAll = pages.trim()
    if (!trimmedAll) return selected
    if (trimmedAll.toLowerCase() === 'all') {
      for (let i = 1; i <= numPages; i++) selected.add(i)
      return selected
    }
    const parts = trimmedAll.split(',')
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (trimmed.includes('-')) {
        const dashIdx = trimmed.indexOf('-')
        const startRaw = trimmed.slice(0, dashIdx).trim()
        const endRaw = trimmed.slice(dashIdx + 1).trim()
        const start = startRaw === '' ? 1 : parseInt(startRaw, 10)
        const end = endRaw === '' ? numPages : parseInt(endRaw, 10)
        if (isNaN(start) || isNaN(end)) continue
        const actualStart = Math.min(start, end)
        const actualEnd = Math.max(start, end)
        for (let i = actualStart; i <= actualEnd; i++) {
          if (i >= 1 && i <= numPages) {
            selected.add(i)
          }
        }
      } else {
        const page = parseInt(trimmed, 10)
        if (!isNaN(page) && page >= 1 && page <= numPages) {
          selected.add(page)
        }
      }
    }
    return selected
  }

  const selectedPages = getSelectedPages()
  const pagesTrimmed = pages.trim()
  const isPagesAll = pagesTrimmed.toLowerCase() === 'all'
  const pagesValid = isPagesAll || (pagesTrimmed !== '' && selectedPages.size > 0)

  const job = useFileJob<WatermarkArgs>(watermarkSubmitter)
  const { submit, reset, isDone, downloadUrl } = job

  const [formError, setFormError] = useState<string | null>(null)


  const handleSubmit = async () => {
    setFormError(null)
    if (!file || !text) return
    if (!pages.trim()) {
      setFormError('Please enter pages to stamp (e.g. all or 1-3, 5).')
      return
    }
    if (numPages !== null && !pagesValid) {
      setFormError('Pages range is invalid or out of range for this file.')
      return
    }
    await submit({ file, text, color, opacity, rotation, font_size: fontSize, pages: pages.trim() || 'all' })
  }

  const handleReset = () => {
    setFile(null)
    setText('')
    setColor('gray')
    setOpacity(0.3)
    setRotation(45)
    setFontSize(48)
    setPages('all')
    setNumPages(null)
    setIsZoomOpen(false)
    setIsPreviewOpen(false)
    reset()
  }

  return (
    <>
      <ToolShell
        icon={<Type className="h-5 w-5" />}
        title="Watermark PDF"
        subtitle="Stamp a custom semi-transparent text watermark over PDF pages."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={reset}
        fileMeta={`${text ? `“${text.slice(0, 24)}”` : 'no watermark text'}${
          numPages !== null ? ` · ${numPages} pages` : ' · reading…'
        } · ${isPagesAll ? 'stamping all' : `${selectedPages.size} selected`}`}
        job={job}
        validationError={formError}
        onSubmit={handleSubmit}
        submitLabel="Add Watermark"
        submitDisabled={!text || !pagesValid}
        dropzoneHint="Type watermark text to see a live overlay. Tune color, opacity, and rotation under advanced."
        busyMessage="Adding watermark to PDF..."
        doneTitle="Watermark Added!"
        doneBody="Your watermarked PDF is ready. Click below to download."
        downloadLabel="Download PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Watermarking Failed"
        settings={
          <>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[13px] font-semibold">01 — Watermark Text</span>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. CONFIDENTIAL / DO NOT COPY"
                className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor="watermark-pages" className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                <span>Pages to stamp</span>
                <span className="text-xs text-muted font-normal">{numPages !== null ? `${numPages} pages` : 'e.g. all or 1-3, 5'}</span>
              </label>
              <input
                id="watermark-pages"
                type="text"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                placeholder="e.g. all or 1-3, 5"
                className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm font-mono"
              />
              <p className="text-xs text-muted leading-relaxed">
                <span className="font-mono text-accent">all</span> stamps every page. Use <span className="font-mono text-accent">1-3, 5</span> or open-ended <span className="font-mono text-accent">3-</span> for specific pages.
              </p>
              {numPages !== null && pagesTrimmed !== '' && !pagesValid && (
                <p className="text-xs text-danger leading-relaxed">
                  No valid pages selected. Check the range against this file&apos;s {numPages} pages.
                </p>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <Settings className="h-4 w-4" />
                <span>Advanced options</span>
              </button>

              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2.5 rounded-xl bg-background border border-border p-3 flex flex-col gap-3.5"
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wide">Text Color</label>
                    <select
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                    >
                      <option value="gray">Gray</option>
                      <option value="red">Red</option>
                      <option value="green">Green</option>
                      <option value="blue">Blue</option>
                      <option value="black">Black</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wide">Opacity ({Math.round(opacity * 100)}%)</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={opacity}
                      onChange={(e) => setOpacity(parseFloat(e.target.value))}
                      className="h-10 cursor-pointer accent-accent"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wide">Rotation ({rotation}°)</label>
                    <input
                      type="range"
                      min="0"
                      max="359"
                      step="1"
                      value={rotation}
                      onChange={(e) => setRotation(parseInt(e.target.value))}
                      className="h-10 cursor-pointer accent-accent"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wide">Font Size ({fontSize}pt)</label>
                    <input
                      type="range"
                      min="12"
                      max="200"
                      step="1"
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      className="h-10 cursor-pointer accent-accent"
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </>
        }
        preview={{
          title: `02 — Watermark preview · ${isPagesAll ? (numPages !== null ? `all ${numPages} pages` : 'all pages') : `${selectedPages.size} page${selectedPages.size === 1 ? '' : 's'}`}`,
          aside: `${color} · ${Math.round(opacity * 100)}% · ${rotation}° · ${fontSize}pt`,
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden flex flex-col items-center">
              <div
                onClick={() => fileUrl && setIsZoomOpen(true)}
                className={`relative w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden group transition-colors ${fileUrl ? 'cursor-pointer hover:border-accent' : ''}`}
              >
                {fileUrl ? (
                  <>
                    <iframe
                      loading="lazy"
                      src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                      className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                      title="Watermark Preview Viewport"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden p-6">
                      {text && (
                        <span
                          className="font-extrabold select-none text-center break-words max-w-full transition-all duration-300"
                          style={{
                            color: color.toLowerCase() === 'black' ? '#111111' :
                                   color.toLowerCase() === 'red' ? '#DC2626' :
                                   color.toLowerCase() === 'green' ? '#16A34A' :
                                   color.toLowerCase() === 'blue' ? '#2563EB' : '#808080',
                            opacity: opacity,
                            fontSize: `${Math.round(fontSize * 0.5)}px`,
                            transform: `rotate(-${rotation}deg)`,
                            transformOrigin: 'center center',
                          }}
                        >
                          {text}
                        </span>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                      <div className="p-2 rounded-full bg-accent text-accent-foreground">
                        <ZoomIn className="h-4 w-4" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">No document loaded</div>
                )}
              </div>
              <p className="mt-2.5 text-center text-xs text-muted max-w-[40ch]">
                {text
                  ? isPagesAll
                    ? `Showing live overlay. Output PDF will be stamped on all ${numPages ?? ''} pages${numPages ? '' : ''}.`.replace('  ', ' ')
                    : `Showing live overlay. Output PDF will be stamped on ${selectedPages.size} page${selectedPages.size === 1 ? '' : 's'} (${[...selectedPages].sort((a, b) => a - b).slice(0, 8).join(', ')}${selectedPages.size > 8 ? ', …' : ''}).`
                  : 'Type watermark text to preview the overlay here.'}
              </p>
            </div>
          ),
        }}
      />

      {isDone && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl ?? ''}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_watermarked.pdf` : "watermarked.pdf"}
        />
      )}

      {/* Watermark Zoom Preview Modal */}
      <ZoomDialog
        open={isZoomOpen && Boolean(fileUrl)}
        onClose={() => setIsZoomOpen(false)}
        title="Watermark Live Zoom"
        subtitle="Inspect watermark placement and transparency details."
      >
        {fileUrl && (
          <>
            <iframe
              src={`${fileUrl}#page=1&toolbar=0&navpanes=0`}
              className="w-full h-full border-0"
              title="Watermark Zoom Preview Frame"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden p-12">
                {text && (
                  <span
                    className="font-extrabold select-none text-center break-words max-w-full transition-all duration-300"
                    style={{
                      color: color.toLowerCase() === 'black' ? '#111111' :
                             color.toLowerCase() === 'red' ? '#DC2626' :
                             color.toLowerCase() === 'green' ? '#16A34A' :
                             color.toLowerCase() === 'blue' ? '#2563EB' : '#808080',
                      opacity: opacity,
                      fontSize: `${fontSize}px`,
                      transform: `rotate(-${rotation}deg)`,
                      transformOrigin: 'center center',
                    }}
                  >
                    {text}
                  </span>
                )}
            </div>
          </>
        )}
      </ZoomDialog>
    </>
  )
}
