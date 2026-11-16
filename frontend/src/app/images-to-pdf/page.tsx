'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, FileImage, X } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildMultiFileFormData, submitJob } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { MAX_TOTAL_UPLOAD_MB } from '@/lib/limits'

const imagesToPdfSubmitter = (files: File[]) =>
  submitJob('/api/images-to-pdf', buildMultiFileFormData(files))

export default function ImagesToPdfPage() {
  const [files, setFiles] = useState<File[]>([])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})

  const job = useFileJob<File[]>(imagesToPdfSubmitter)

  // Real image thumbnails from object URLs (preview only, submit path unchanged)
  useEffect(() => {
    const urls: Record<string, string> = {}
    files.forEach((file, index) => {
      const key = `${file.name}-${index}`
      urls[key] = URL.createObjectURL(file)
    })
    setPreviewUrls(urls)
    return () => {
      Object.values(urls).forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* noop */
        }
      })
    }
  }, [files])

  const handleRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setFiles((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index - 1]
      copy[index - 1] = temp
      return copy
    })
  }

  const handleMoveDown = (index: number) => {
    if (index === files.length - 1) return
    setFiles((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index + 1]
      copy[index + 1] = temp
      return copy
    })
  }

  const [formError, setFormError] = useState<string | null>(null)


  const handleSubmit = async () => {
    setFormError(null)
    if (files.length === 0) {
      setFormError('Please select at least 1 image file.')
      return
    }
    await job.submit(files)
  }

  const handleReset = () => {
    setFiles([])
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<FileImage className="h-5 w-5" />}
        title="Images to PDF"
        subtitle="Convert PNG and JPG images into a single PDF document."
        accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }}
        replaceAccept=".png,.jpg,.jpeg,image/png,image/jpeg"
        dropzoneText="Drop your PNG or JPG images here"
        files={files}
        onFilesAccepted={(next) => setFiles((prev) => [...prev, ...next])}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={`top is page one · ${MAX_TOTAL_UPLOAD_MB} MB total`}
        job={job}
        validationError={formError}
        onSubmit={handleSubmit}
        submitLabel={`Compile ${files.length} Image${files.length > 1 ? 's' : ''} to PDF`}
        dropzoneHint="Add one or more images. Top image becomes page one — reorder freely."
        busyMessage="Compiling images into PDF..."
        doneTitle="PDF Created!"
        doneBody="Your compiled PDF file is ready. Click below to download."
        downloadLabel="Download PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Compilation Failed"
        settings={
          <p className="text-xs text-muted leading-relaxed">
            Page order follows the list. First thumbnail becomes page one of the PDF.
          </p>
        }
        preview={{
          title: 'Page order',
          aside: `${files.length} pages`,
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[420px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden overscroll-contain">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {files.map((file, index) => {
                  const key = `${file.name}-${index}`
                  const url = previewUrls[key]
                  return (
                    <div
                      key={key}
                      className="relative aspect-[3/4] min-w-0 p-2 rounded-lg border border-border bg-background flex flex-col transition-colors"
                    >
                      <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1 truncate">
                        Page {index + 1}
                      </div>
                      <div className="relative w-full flex-1 min-h-0 rounded border border-card-border bg-surface overflow-hidden mb-1.5">
                        {url ? (
                          <img
                            src={url}
                            alt={`Page ${index + 1} — ${file.name}`}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">
                            Loading…
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 px-0.5">
                        <p className="truncate text-[10px] font-semibold text-muted">{file.name}</p>
                        <p className="font-mono text-[10px] tabular-nums text-muted">{formatBytes(file.size)}</p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-surface hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="Move Up"
                          aria-label={`Move ${file.name} up`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveDown(index)}
                          disabled={index === files.length - 1}
                          className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-surface hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="Move Down"
                          aria-label={`Move ${file.name} down`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemove(index)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-danger hover:bg-danger-subtle transition-all cursor-pointer"
                          title="Delete"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={job.downloadUrl}
          fileName={files[0]?.name ? `${files[0].name.replace(/\.[^/.]+$/, '')}_compiled.pdf` : 'compiled.pdf'}
        />
      )}
    </>
  )
}
