'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Scissors, ZoomIn } from 'lucide-react'
import ZoomDialog from '@/components/tool/ZoomDialog'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { apiClient, submitJob, buildSingleFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

type SplitArgs = { file: File; mode: string; pages_spec: string }

const splitSubmitter = ({ file, mode, pages_spec }: SplitArgs) =>
  submitJob('/api/split', buildSingleFileFormData(file, { mode, pages_spec }))

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'custom' | 'all'>('custom')
  const [pagesSpec, setPagesSpec] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [zoomPage, setZoomPage] = useState<number | null>(null)

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

  // Parse pagesSpec to a Set of numbers representing kept pages
  const getSelectedPages = (): Set<number> => {
    const selected = new Set<number>()
    if (!numPages || !pagesSpec.trim()) return selected
    const parts = pagesSpec.split(',')
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (trimmed.includes('-')) {
        const rangeParts = trimmed.split('-')
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0].trim(), 10)
          const end = parseInt(rangeParts[1].trim(), 10)
          if (!isNaN(start) && !isNaN(end)) {
            const actualStart = Math.min(start, end)
            const actualEnd = Math.max(start, end)
            for (let i = actualStart; i <= actualEnd; i++) {
              if (i >= 1 && i <= numPages) {
                selected.add(i)
              }
            }
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

  // Parse pagesSpec to an ordered array of selected pages representing resulting structure
  const getSelectedPagesList = (): Array<{ id: string; originalPageNum: number; isValid: boolean }> => {
    const list: Array<{ id: string; originalPageNum: number; isValid: boolean }> = []
    if (!numPages || !pagesSpec.trim()) return list
    const parts = pagesSpec.split(',')
    parts.forEach((part, index) => {
      const trimmed = part.trim()
      if (!trimmed) return
      if (trimmed.includes('-')) {
        const rangeParts = trimmed.split('-')
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0].trim(), 10)
          const end = parseInt(rangeParts[1].trim(), 10)
          if (!isNaN(start) && !isNaN(end)) {
            const actualStart = start
            const actualEnd = end
            if (actualStart <= actualEnd) {
              for (let i = actualStart; i <= actualEnd; i++) {
                const isValid = i >= 1 && i <= numPages
                list.push({
                  id: `${i}-${index}-${list.length}`,
                  originalPageNum: i,
                  isValid,
                })
              }
            } else {
              for (let i = actualStart; i >= actualEnd; i--) {
                const isValid = i >= 1 && i <= numPages
                list.push({
                  id: `${i}-${index}-${list.length}`,
                  originalPageNum: i,
                  isValid,
                })
              }
            }
          }
        }
      } else {
        const page = parseInt(trimmed, 10)
        if (!isNaN(page)) {
          const isValid = page >= 1 && page <= numPages
          list.push({
            id: `${page}-${index}-${list.length}`,
            originalPageNum: page,
            isValid,
          })
        }
      }
    })
    return list
  }

  const selectedPagesList = getSelectedPagesList()

  const job = useFileJob<SplitArgs>(splitSubmitter)
  const { isDone, submit, reset, downloadUrl } = job

  const [formError, setFormError] = useState<string | null>(null)


  const handleSubmit = async () => {
    setFormError(null)
    if (!file) return
    if (mode === 'custom' && !pagesSpec.trim()) {
      setFormError('Please enter page ranges to extract (e.g. 1-3, 5).')
      return
    }
    await submit({ file, mode, pages_spec: mode === 'custom' ? pagesSpec.trim() : '' })
  }

  const handleReset = () => {
    setFile(null)
    reset()
    setNumPages(null)
    setPagesSpec('')
    setZoomPage(null)
    setIsPreviewOpen(false)
  }

  return (
    <>
      <ToolShell
        icon={<Scissors className="h-5 w-5" />}
        title="Split PDF"
        subtitle="Extract page ranges or split every page into its own file."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={reset}
        fileMeta={`${numPages !== null ? `${numPages} pages` : 'reading…'}${
          mode === 'custom' && selectedPages.size > 0 ? ` · ${selectedPages.size} selected` : ''
        }`}
        job={job}
        validationError={formError}
        onSubmit={handleSubmit}
        submitLabel={mode === 'custom' ? 'Extract pages' : 'Split all pages'}
        dropzoneHint="Page count is detected automatically after upload. Ranges like 1-3, 5 are validated live."
        busyMessage="Splitting PDF..."
        doneTitle="PDF split done"
        doneBody="Your files are ready. Download or preview them below."
        downloadLabel="Download result"
        doneActions={
          mode === 'custom' ? <PreviewAction onClick={() => setIsPreviewOpen(true)} /> : undefined
        }
        errorTitle="Split failed"
        settings={
          <>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Split mode</span>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('custom')}
                  aria-pressed={mode === 'custom'}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                    mode === 'custom'
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <span className="block text-[13px] font-semibold">Custom ranges</span>
                  <span className="block text-xs text-muted font-normal mt-0.5">Extract specific pages</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('all')}
                  aria-pressed={mode === 'all'}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                    mode === 'all'
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <span className="block text-[13px] font-semibold">Split all pages</span>
                  <span className="block text-xs text-muted font-normal mt-0.5">One PDF per page, zipped</span>
                </button>
              </div>
            </div>

            {mode === 'custom' ? (
              <div className="flex flex-col gap-1.5 min-w-0">
                <label htmlFor="split-ranges" className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                  <span>Page ranges</span>
                  <span className="text-xs text-muted font-normal">e.g. 1-3, 5</span>
                </label>
                <input
                  id="split-ranges"
                  type="text"
                  value={pagesSpec}
                  onChange={(e) => setPagesSpec(e.target.value)}
                  placeholder="e.g. 1-3, 5"
                  className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                />
                <p className="text-xs text-muted leading-relaxed">
                  Commas separate pages or ranges. <span className="font-mono text-accent">1-3, 5</span> keeps pages 1, 2, 3 and 5 in one PDF.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Every page becomes its own file. You will download a <span className="font-mono text-accent">.zip</span> archive.
              </p>
            )}
          </>
        }
        preview={{
          title: 'Result preview',
          aside:
            numPages !== null
              ? mode === 'custom'
                ? `${selectedPagesList.length} pages`
                : `${numPages} files`
              : undefined,
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden overscroll-contain">
              {numPages !== null ? (
                mode === 'custom' ? (
                  selectedPagesList.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                      {selectedPagesList.map((item, idx) => (
                        <motion.div
                          key={item.id}
                          layout
                          onClick={() => item.isValid && setZoomPage(item.originalPageNum)}
                          className={`relative aspect-[3/4] min-w-0 p-2 rounded-lg border flex flex-col transition-colors group cursor-pointer ${
                            !item.isValid
                              ? 'border-danger bg-danger-subtle'
                              : 'border-border bg-background hover:border-success'
                          }`}
                        >
                          <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1 truncate">
                            Output {idx + 1}
                          </div>
                          <div className="relative w-full flex-1 min-h-0 rounded border border-card-border bg-surface overflow-hidden mb-1.5">
                            {item.isValid && fileUrl ? (
                              <>
                                <iframe
                                  loading="lazy"
                                  src={`${fileUrl}#page=${item.originalPageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                  className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                  title={`Page ${item.originalPageNum}`}
                                />
                                <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                  <div className="p-2 rounded-full bg-accent text-accent-foreground">
                                    <ZoomIn className="h-4 w-4" />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">
                                N/A
                              </div>
                            )}
                          </div>
                          <div className="flex w-full items-center justify-between gap-2 px-0.5 text-[10px] font-semibold text-muted">
                            <span className="truncate">Source {item.originalPageNum}</span>
                            <span className={`shrink-0 ${item.isValid ? 'text-success' : 'text-danger'}`}>
                              {item.isValid ? 'Zoom' : 'Invalid'}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center text-xs text-muted p-6">
                      <Scissors className="h-7 w-7 text-muted/40 mb-2" />
                      <span className="max-w-[26ch]">Type ranges above to see the output page order here.</span>
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    {Array.from({ length: numPages }).map((_, index) => {
                      const pageNum = index + 1
                      return (
                        <motion.div
                          key={pageNum}
                          layout
                          onClick={() => setZoomPage(pageNum)}
                          className="relative aspect-[3/4] min-w-0 p-2 rounded-lg border border-border bg-background hover:border-accent flex flex-col transition-colors group cursor-pointer"
                        >
                          <div className="text-[10px] font-semibold text-accent uppercase tracking-wide mb-1 truncate">
                            File {pageNum}
                          </div>
                          <div className="relative w-full flex-1 min-h-0 rounded border border-card-border bg-surface overflow-hidden mb-1.5">
                            {fileUrl ? (
                              <>
                                <iframe
                                  loading="lazy"
                                  src={`${fileUrl}#page=${pageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                  className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                  title={`Page ${pageNum}`}
                                />
                                <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                  <div className="p-2 rounded-full bg-accent text-accent-foreground">
                                    <ZoomIn className="h-4 w-4" />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">
                                N/A
                              </div>
                            )}
                          </div>
                          <div className="flex w-full items-center justify-between gap-2 px-0.5 text-[10px] font-semibold text-muted">
                            <span className="truncate">Page {pageNum}</span>
                            <span className="shrink-0">Zoom</span>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="h-full min-h-[280px] flex items-center justify-center text-xs text-muted">
                  Reading document…
                </div>
              )}
            </div>
          ),
        }}
      />

      {isDone && mode === 'custom' && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl ?? ''}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_split.pdf` : "split.pdf"}
        />
      )}

      <ZoomDialog
        open={zoomPage !== null && Boolean(fileUrl)}
        onClose={() => setZoomPage(null)}
        title={`Page ${zoomPage} preview`}
        subtitle="Inspect layout and content in high resolution."
      >
        {fileUrl && (
          <iframe
            src={`${fileUrl}#page=${zoomPage}&toolbar=1&navpanes=0`}
            className="w-full h-full border-0"
            title={`Page ${zoomPage} Zoom Preview`}
          />
        )}
      </ZoomDialog>
    </>
  )
}
