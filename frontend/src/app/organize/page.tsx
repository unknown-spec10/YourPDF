'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, ZoomIn } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ZoomDialog from '@/components/tool/ZoomDialog'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { apiClient, buildSingleFileFormData, submitJob } from '@/lib/api'
import { useFileJob } from '@/hooks/useFileJob'

type OrganizeArgs = { file: File; page_order: string }

const organizeSubmitter = ({ file, page_order }: OrganizeArgs) =>
  submitJob('/api/organize', buildSingleFileFormData(file, { page_order }))

export default function OrganizePage() {
  const [file, setFile] = useState<File | null>(null)
  const [pageOrder, setPageOrder] = useState('')
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

  // Get parsed sequence of page numbers
  const getParsedSequence = (): Array<{ id: string; pageNum: number; isDuplicate: boolean; isValid: boolean }> => {
    if (!pageOrder.trim()) return []
    const sequence: Array<{ id: string; pageNum: number; isDuplicate: boolean; isValid: boolean }> = []
    const parts = pageOrder.split(',')
    const seenCount: Record<number, number> = {}

    parts.forEach((part, index) => {
      const trimmed = part.trim()
      if (!trimmed) return
      const pageNum = parseInt(trimmed, 10)
      if (!isNaN(pageNum)) {
        const isValid = pageNum >= 1 && (numPages !== null ? pageNum <= numPages : true)
        seenCount[pageNum] = (seenCount[pageNum] || 0) + 1
        sequence.push({
          id: `${pageNum}-${index}`,
          pageNum,
          isDuplicate: seenCount[pageNum] > 1,
          isValid,
        })
      }
    })
    return sequence
  }

  const parsedSequence = getParsedSequence()

  // Get list of omitted original pages
  const getOmittedPages = (): number[] => {
    if (numPages === null) return []
    const activePages = new Set(parsedSequence.map(p => p.pageNum))
    const omitted: number[] = []
    for (let i = 1; i <= numPages; i++) {
      if (!activePages.has(i)) {
        omitted.push(i)
      }
    }
    return omitted
  }

  const omittedPages = getOmittedPages()

  const job = useFileJob<OrganizeArgs>(organizeSubmitter)

  const handleSubmit = async () => {
    if (!file || !pageOrder.trim()) return
    await job.submit({ file, page_order: pageOrder })
  }

  const handleReset = () => {
    setFile(null)
    setPageOrder('')
    setZoomPage(null)
    setIsPreviewOpen(false)
    job.reset()
    setNumPages(null)
  }

  return (
    <>
      <ToolShell
        icon={<LayoutGrid className="h-5 w-5" />}
        title="Organize PDF"
        subtitle="Reorder, repeat, or delete pages inside a PDF document."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={`${numPages !== null ? `${numPages} pages` : 'reading…'}${
          parsedSequence.length > 0 ? ` · ${parsedSequence.length} in output` : ''
        }`}
        job={job}
        onSubmit={handleSubmit}
        submitLabel="Organize PDF"
        submitDisabled={!pageOrder.trim()}
        dropzoneHint="Page count is detected automatically. Comma-separated order like 2, 1, 4 is validated live."
        busyMessage="Organizing PDF pages..."
        doneTitle="PDF Reorganized!"
        doneBody="Your reorganized PDF file is ready. Click below to download."
        downloadLabel="Download Organized PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Organization Failed"
        settings={
          <div className="flex flex-col gap-1.5 min-w-0">
            <label htmlFor="organize-order" className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
              <span>Page order</span>
              <span className="text-xs text-muted font-normal">e.g. 2, 1, 4</span>
            </label>
            <input
              id="organize-order"
              type="text"
              value={pageOrder}
              onChange={(e) => setPageOrder(e.target.value)}
              placeholder="Enter comma-separated page numbers (e.g. 1, 3, 2, 4)"
              className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
            />
            <p className="text-xs text-muted leading-relaxed">
              Missing pages are omitted. Repeating a number duplicates that page.
            </p>
          </div>
        }
        preview={{
          title: 'Reorganized flow',
          aside: numPages !== null ? `${parsedSequence.length} pages` : undefined,
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
              {parsedSequence.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    {parsedSequence.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        layout
                        onClick={() => item.isValid && setZoomPage(item.pageNum)}
                        className={`relative aspect-[3/4] min-w-0 p-2 rounded-lg border flex flex-col transition-colors group cursor-pointer ${
                          !item.isValid
                            ? 'border-danger bg-danger-subtle'
                            : item.isDuplicate
                            ? 'border-warning bg-warning-subtle hover:border-warning'
                            : 'border-border bg-background hover:border-accent'
                        }`}
                      >
                        <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1 truncate">
                          Pos {idx + 1}
                        </div>
                        <div className="relative w-full flex-1 min-h-0 rounded border border-card-border bg-surface overflow-hidden mb-1.5">
                          {item.isValid && fileUrl ? (
                            <>
                              <iframe
                                loading="lazy"
                                src={`${fileUrl}#page=${item.pageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                title={`Page ${item.pageNum}`}
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
                          <span className="truncate">Src {item.pageNum}</span>
                          <span className={!item.isValid ? 'text-danger shrink-0' : item.isDuplicate ? 'text-warning shrink-0' : 'text-accent shrink-0'}>
                            {!item.isValid ? 'Invalid' : item.isDuplicate ? 'Copy' : 'Zoom'}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {omittedPages.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">Omitted pages</div>
                      <div className="flex flex-wrap gap-1.5">
                        {omittedPages.map(page => (
                          <span
                            key={page}
                            className="text-xs bg-background border border-border px-2 py-0.5 rounded line-through text-muted"
                          >
                            Page {page}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center text-xs text-muted p-6">
                  <LayoutGrid className="h-7 w-7 text-muted/40 mb-2" />
                  <span className="max-w-[26ch]">Enter a page sequence (e.g. 2, 1, 3) to preview the new order here.</span>
                </div>
              )}
            </div>
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={job.downloadUrl}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_organized.pdf` : 'organized.pdf'}
        />
      )}

      {/* Interactive Page Zoom Modal */}
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
