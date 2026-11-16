'use client'

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'
import { formatBytes } from '@/lib/format'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const docxToPdfSubmitter = (file: File) =>
  submitJob('/api/docx-to-pdf', buildSingleFileFormData(file))

function DocxHtmlPreview({ file }: { file: File }) {
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
        Live preview unavailable for this file. Verify the name and size above, then convert.
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
        Live preview rendered from the document text. Formatting may differ slightly from the converted PDF.
      </p>
    </div>
  )
}

export default function DocxToPdfPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const job = useFileJob<File>(docxToPdfSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    await job.submit(file)
  }

  const handleReset = () => {
    setFile(null)
    setIsPreviewOpen(false)
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<FileText className="h-5 w-5" />}
        title='Word to PDF'
        subtitle='Convert Microsoft Word (.docx) documents into high-quality PDFs.'
        accept={{ [DOCX_MIME]: ['.docx'] }}
        replaceAccept={`.docx,${DOCX_MIME}`}
        dropzoneText='Drop your Word document (.docx) here'
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta='.docx'
        job={job}
        onSubmit={handleSubmit}
        submitLabel='Convert to PDF'
        dropzoneHint='Single .docx file converts to a print-ready PDF.'
        busyMessage='Converting document to PDF...'
        doneTitle='Conversion Done!'
        doneBody='Your PDF file is ready. Click the button below to download.'
        downloadLabel='Download PDF'
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle='Conversion Failed'
        settings={
          <p className="text-xs text-muted leading-relaxed">
            No options to tune. Convert the document as-is into a high-quality PDF.
          </p>
        }
        preview={{
          title: 'Selected document',
          aside: '1 file',
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
              <DocxHtmlPreview file={file} />
            </>
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={job.downloadUrl}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}.pdf` : 'document.pdf'}
        />
      )}
    </>
  )
}
