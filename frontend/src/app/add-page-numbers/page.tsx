'use client'

import { useEffect, useState } from 'react'
import { Hash, ZoomIn } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ZoomDialog from '@/components/tool/ZoomDialog'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildSingleFileFormData, submitJob } from '@/lib/api'

type AddPageNumbersArgs = { file: File; position: string }

const addPageNumbersSubmitter = ({ file, position }: AddPageNumbersArgs) =>
  submitJob('/api/add-page-numbers', buildSingleFileFormData(file, { position }))

const POSITION_LABELS: Record<string, string> = {
  'bottom-left': 'Footer Left',
  'bottom-center': 'Footer Center',
  'bottom-right': 'Footer Right',
  'top-left': 'Header Left',
  'top-center': 'Header Center',
  'top-right': 'Header Right',
}

export default function AddPageNumbersPage() {
  const [file, setFile] = useState<File | null>(null)
  const [position, setPosition] = useState('bottom-center')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isZoomOpen, setIsZoomOpen] = useState(false)

  // Manage local file URL for preview
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

  const job = useFileJob<AddPageNumbersArgs>(addPageNumbersSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    await job.submit({ file, position })
  }

  const handleReset = () => {
    setFile(null)
    setPosition('bottom-center')
    setIsZoomOpen(false)
    setIsPreviewOpen(false)
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<Hash className="h-5 w-5" />}
        title="Add Page Numbers"
        subtitle="Stamp dynamic page numbers onto headers or footers in your PDF document."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={POSITION_LABELS[position] ?? position}
        job={job}
        onSubmit={handleSubmit}
        submitLabel="Add Page Numbers"
        dropzoneHint="Choose header or footer placement. Badge preview updates live before you submit."
        busyMessage="Numbering PDF pages..."
        doneTitle="Page Numbers Added!"
        doneBody="Your numbered PDF is ready. Click below to download."
        downloadLabel="Download PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Numbering Failed"
        settings={
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-[13px] font-semibold">01 — Number Location / Position</span>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
            >
              <option value="bottom-left">Footer Left</option>
              <option value="bottom-center">Footer Center</option>
              <option value="bottom-right">Footer Right</option>
              <option value="top-left">Header Left</option>
              <option value="top-center">Header Center</option>
              <option value="top-right">Header Right</option>
            </select>
            <p className="text-xs text-muted leading-relaxed">
              Numbers scale dynamically across all pages.
            </p>
          </div>
        }
        preview={{
          title: '02 — Placement preview',
          aside: POSITION_LABELS[position] ?? position,
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden flex flex-col items-center">
              <div
                onClick={() => fileUrl && setIsZoomOpen(true)}
                className={`relative w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden group transition-colors ${
                  fileUrl ? 'cursor-pointer hover:border-accent' : ''
                }`}
              >
                {fileUrl ? (
                  <>
                    <iframe
                      loading="lazy"
                      src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                      className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                      title="Page Numbering Preview Viewport"
                    />
                    <div className="absolute inset-0 pointer-events-none p-8">
                      <span
                        className="absolute text-[10px] font-mono font-bold bg-accent/90 text-accent-foreground px-2 py-0.5 rounded shadow-md border border-accent/20 transition-all duration-300 ease-in-out whitespace-nowrap"
                        style={{
                          top: position.startsWith('top') ? '24px' : 'auto',
                          bottom: position.startsWith('bottom') ? '24px' : 'auto',
                          left: position.endsWith('left')
                            ? '24px'
                            : position.endsWith('center')
                              ? '50%'
                              : 'auto',
                          right: position.endsWith('right') ? '24px' : 'auto',
                          transform: position.endsWith('center') ? 'translateX(-50%)' : 'none',
                        }}
                      >
                        Page 1
                      </span>
                    </div>
                    <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                      <div className="p-2 rounded-full bg-accent text-accent-foreground">
                        <ZoomIn className="h-4 w-4" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">
                    No document loaded
                  </div>
                )}
              </div>
              <p className="mt-2.5 text-center text-xs text-muted max-w-[40ch]">
                Showing visual layout preview. Numbers will dynamically scale across all pages.
              </p>
            </div>
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={job.downloadUrl}
          fileName={
            file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_numbered.pdf` : 'numbered.pdf'
          }
        />
      )}

      {/* Page Number Zoom Preview Modal */}
      <ZoomDialog
        open={isZoomOpen && Boolean(fileUrl)}
        onClose={() => setIsZoomOpen(false)}
        title="Placement Live Zoom"
        subtitle="Inspect page numbering position and scaling layout."
      >
        {fileUrl && (
          <>
            <iframe
              src={`${fileUrl}#page=1&toolbar=0&navpanes=0`}
              className="w-full h-full border-0"
              title="Page Numbering Zoom Preview Frame"
            />
            <div className="absolute inset-0 pointer-events-none p-12">
                <span
                  className="absolute text-xs sm:text-sm font-mono font-bold bg-accent/90 text-accent-foreground px-3 py-1 rounded shadow-lg border border-accent/30 transition-all duration-300 ease-in-out whitespace-nowrap"
                  style={{
                    top: position.startsWith('top') ? '32px' : 'auto',
                    bottom: position.startsWith('bottom') ? '32px' : 'auto',
                    left: position.endsWith('left')
                      ? '32px'
                      : position.endsWith('center')
                        ? '50%'
                        : 'auto',
                    right: position.endsWith('right') ? '32px' : 'auto',
                    transform: position.endsWith('center') ? 'translateX(-50%)' : 'none',
                  }}
                >
                  Page 1
                </span>
            </div>
          </>
        )}
      </ZoomDialog>
    </>
  )
}
