'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, FileText, X } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildMultiFileFormData, submitJob } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { MAX_TOTAL_UPLOAD_MB } from '@/lib/limits'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const mergeDocxSubmitter = (files: File[]) =>
  submitJob('/api/office/merge-docx', buildMultiFileFormData(files))

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
      <div className="rounded-md border border-border bg-surface p-3" aria-live="polite">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
          <span>Rendering preview…</span>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-surface-2" />
          <div className="h-2.5 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-2.5 w-2/3 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    )
  }

  if (hasError || !html) {
    return (
      <p className="text-[11px] text-muted leading-relaxed">
        Live preview unavailable for this file.
      </p>
    )
  }

  return (
    <div className="max-h-[240px] overflow-y-auto rounded-md border border-border bg-surface p-3">
      <div
        className="min-w-0 text-[13px] leading-relaxed text-foreground [&_h1]:mb-1.5 [&_h1]:text-sm [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:text-[13px] [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:text-[13px] [&_h3]:font-semibold [&_p]:mb-1.5 [&_p]:break-words [&_ul]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_table]:mb-1.5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_th]:font-semibold [&_img]:max-w-full [&_img]:rounded"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

export default function MergeDocxPage() {
  const [files, setFiles] = useState<File[]>([])

  const job = useFileJob<File[]>(mergeDocxSubmitter)
  const canMerge = files.length >= 2

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
    if (!canMerge) {
      setFormError('Please select at least 2 Word documents to merge.')
      return
    }
    await job.submit(files)
  }

  const handleReset = () => {
    setFiles([])
    job.reset()
  }

  return (
    <ToolShell
      icon={<FileText className="h-5 w-5" />}
      title="Merge Word Documents"
      subtitle="Combine multiple Word documents (.docx) into one file in seconds."
      accept={{ [DOCX_MIME]: ['.docx'] }}
      replaceAccept={`.docx,${DOCX_MIME}`}
      files={files}
      onFilesAccepted={(next) => setFiles((prev) => [...prev, ...next])}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`top merges first · ${MAX_TOTAL_UPLOAD_MB} MB total`}
      job={job}
      validationError={formError}
      onSubmit={handleSubmit}
      submitLabel={`Merge ${files.length} Word Documents`}
      submitDisabled={!canMerge}
      submitHint={canMerge ? undefined : 'Add at least one more file to enable merging.'}
      dropzoneText="Drop your Word files here (DOCX)"
      dropzoneHint="Add two or more .docx files. Arrange the order, then merge."
      busyMessage="Merging documents..."
      doneTitle="Word Documents Merged!"
      doneBody="Your combined DOCX file is ready. Click below to download."
      downloadLabel="Download DOCX"
      errorTitle="Merge Failed"
      settings={
        <p className="text-xs text-muted leading-relaxed">
          Top entry merges first. Use the arrows to reorder before merging.
        </p>
      }
      preview={{
        title: 'Merge order',
        aside: `${files.length} files`,
        children: (
          <div className="flex flex-col gap-2 min-w-0">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex flex-col gap-2.5 min-w-0 rounded-lg border border-border bg-background p-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent text-xs font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight">{file.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">{formatBytes(file.size)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Move Up"
                      aria-label={`Move ${file.name} up`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === files.length - 1}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Move Down"
                      aria-label={`Move ${file.name} down`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleRemove(index)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
                      title="Delete"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <DocxHtmlPreview file={file} />
              </div>
            ))}
          </div>
        ),
      }}
    />
  )
}
