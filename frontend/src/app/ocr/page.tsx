'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type OcrArgs = { file: File; language: string }

const ocrSubmitter = ({ file, language }: OcrArgs) =>
  submitJob('/api/ocr', buildSingleFileFormData(file, { language }))

// The server image ships only the English language pack, so offering other languages here
// would advertise OCR that fails. Add a language to the image and this list together.
const LANGUAGE_LABELS: Record<string, string> = {
  eng: 'English',
}

export default function OcrPage() {
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('eng')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
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

  const job = useFileJob<OcrArgs>(ocrSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    await job.submit({ file, language })
  }

  const handleReset = () => {
    setFile(null)
    setLanguage('eng')
    setIsPreviewOpen(false)
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<Eye className="h-5 w-5" />}
        title='OCR PDF'
        subtitle='Convert scanned PDFs into fully searchable, copy-pasteable documents.'
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={LANGUAGE_LABELS[language] ?? language}
        job={job}
        onSubmit={handleSubmit}
        submitLabel='Make Searchable'
        dropzoneHint='OCR adds a searchable text layer to scanned pages.'
        busyMessage='Processing scanned layout... (this can take a few minutes for larger files)'
        doneTitle='OCR Finished!'
        doneBody='Your document now has a copy-pasteable searchable text layer. Click below to download.'
        downloadLabel='Download Searchable PDF'
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle='OCR Failed'
        settings={
          <div className='flex flex-col gap-1.5 min-w-0'>
            <span className='text-[13px] font-semibold'>01 — Document Language</span>
            <div className='w-full h-11 px-3.5 flex items-center rounded-lg border border-border bg-surface text-sm text-foreground'>
              English (eng)
            </div>
            <p className='text-xs text-muted leading-relaxed'>
              Scanned pages are re-rendered with a searchable layer. Larger files take a few minutes.
            </p>
          </div>
        }
        preview={{
          title: '02 — Scanned page preview',
          aside: LANGUAGE_LABELS[language] ?? language,
          children: (
            <div className='min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden overscroll-contain'>
              <div className='relative mx-auto w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden'>
                {fileUrl ? (
                  <iframe
                    loading='lazy'
                    src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                    className='absolute inset-0 h-full w-full border-0 pointer-events-none'
                    title='Scanned PDF first page'
                  />
                ) : (
                  <div className='flex h-full items-center justify-center text-xs text-muted'>Reading document…</div>
                )}
              </div>
              <p className='mt-2.5 text-center text-xs text-muted'>
                Output keeps the same layout with selectable, copy-pasteable text.
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
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_ocr.pdf` : 'ocr.pdf'}
        />
      )}
    </>
  )
}
