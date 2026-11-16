'use client'

import { useState } from 'react'
import { Presentation } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'
import { formatBytes } from '@/lib/format'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const pptxToPdfSubmitter = (file: File) =>
  submitJob('/api/office/pptx-to-pdf', buildSingleFileFormData(file))

export default function PptxToPdfPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const job = useFileJob<File>(pptxToPdfSubmitter)

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
        icon={<Presentation className="h-5 w-5" />}
        title='PPT to PDF'
        subtitle='Convert PowerPoint presentations (.pptx) into high-quality PDF files.'
        accept={{ [PPTX_MIME]: ['.pptx'] }}
        replaceAccept={`.pptx,${PPTX_MIME}`}
        dropzoneText='Drop your PowerPoint presentation (.pptx) here'
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta='.pptx'
        job={job}
        onSubmit={handleSubmit}
        submitLabel='Convert to PDF'
        dropzoneHint='Single .pptx file converts to a print-ready PDF.'
        busyMessage='Converting slides to PDF...'
        doneTitle='Conversion Done!'
        doneBody='Your presentation PDF is ready. Click the button below to download.'
        downloadLabel='Download PDF'
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle='Conversion Failed'
        settings={
          <p className="text-xs text-muted leading-relaxed">
            No options to tune. Convert the deck as-is into a high-quality PDF.
          </p>
        }
        preview={{
          title: 'Selected presentation',
          aside: '1 file',
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
              <p className="mt-3 text-xs text-muted leading-relaxed">
                Slide decks cannot be previewed in the browser. Verify the name and size above, then convert.
              </p>
            </>
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={job.downloadUrl}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}.pdf` : 'presentation.pdf'}
        />
      )}
    </>
  )
}
