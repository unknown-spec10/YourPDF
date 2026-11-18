'use client'

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

const pdfToDocxSubmitter = (file: File) =>
  submitJob('/api/pdf-to-docx', buildSingleFileFormData(file))

function DocxResultPreview({ downloadUrl }: { downloadUrl: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    setHtml(null)
    fetch(downloadUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch result')
        const buffer = await res.arrayBuffer()
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
  }, [downloadUrl])

  if (isLoading) {
    return (
      <div className="w-full rounded-lg border border-border bg-background p-4" aria-live="polite">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
          <span>Rendering Word preview…</span>
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
      <p className="text-xs text-muted leading-relaxed">
        Word preview unavailable for this file. Your download above is still ready.
      </p>
    )
  }

  return (
    <div className="w-full min-w-0">
      <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-background p-4 text-left">
        <div
          className="min-w-0 text-sm leading-relaxed text-foreground [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:mb-2 [&_p]:break-words [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_table]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_img]:max-w-full [&_img]:rounded-md"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted leading-relaxed">
        Preview rendered from the converted Word text. Formatting may differ slightly from the downloaded file.
      </p>
    </div>
  )
}

export default function PdfToDocxPage() {
  const [file, setFile] = useState<File | null>(null)
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

  const job = useFileJob<File>(pdfToDocxSubmitter)

  const handleSubmit = async () => {
    if (!file) return
    await job.submit(file)
  }

  const handleReset = () => {
    setFile(null)
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<FileText className="h-5 w-5" />}
        title='PDF to Word'
        subtitle='Convert PDF pages into editable Microsoft Word (.docx) files.'
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta='converts to .docx'
        job={job}
        onSubmit={handleSubmit}
        submitLabel='Convert to Word'
        dropzoneHint='Source first page shown for confirmation. Text preview appears after conversion.'
        busyMessage='Converting PDF to Word...'
        doneTitle='Conversion Done!'
        doneBody={
          <>
            Your Word document is ready. Click the button below to download.
            {job.notice && (
              <span className="mx-auto mt-3 block max-w-md rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-relaxed text-warning">
                {job.notice}
              </span>
            )}
          </>
        }
        downloadLabel='Download Word File'
        errorTitle='Conversion Failed'
        settings={
          <>
            <span className="text-[13px] font-semibold">01 — Convert</span>
            <p className="text-xs text-muted leading-relaxed">
              One click, no options. Layout and text flow are preserved as editable Word content.
            </p>
          </>
        }
        preview={{
          title: '02 — Source preview',
          aside: 'page 1 → .docx',
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
                Result is a Word file — download only, no in-browser preview.
              </p>
            </div>
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <div className="mx-auto w-full max-w-2xl min-w-0 px-4 pb-8">
          <p className="mb-2 truncate text-center font-mono text-[11px] tabular-nums text-muted">
            {file?.name ?? ''} → .docx
          </p>
          <DocxResultPreview downloadUrl={job.downloadUrl} />
        </div>
      )}
    </>
  )
}
