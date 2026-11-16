'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Presentation, X } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildMultiFileFormData, submitJob } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { MAX_TOTAL_UPLOAD_MB } from '@/lib/limits'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const mergePptxSubmitter = (files: File[]) =>
  submitJob('/api/office/merge-pptx', buildMultiFileFormData(files))

export default function MergePptxPage() {
  const [files, setFiles] = useState<File[]>([])

  const job = useFileJob<File[]>(mergePptxSubmitter)
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
      setFormError('Please select at least 2 PowerPoint presentations to merge.')
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
      icon={<Presentation className="h-5 w-5" />}
      title="Merge PPT Presentations"
      subtitle="Combine multiple PowerPoint presentations (.pptx) into one presentation."
      accept={{ [PPTX_MIME]: ['.pptx'] }}
      replaceAccept={`.pptx,${PPTX_MIME}`}
      files={files}
      onFilesAccepted={(next) => setFiles((prev) => [...prev, ...next])}
      onReset={handleReset}
      onRetry={job.reset}
      fileMeta={`top merges first · ${MAX_TOTAL_UPLOAD_MB} MB total`}
      job={job}
      validationError={formError}
      onSubmit={handleSubmit}
      submitLabel={`Merge ${files.length} PowerPoint presentations`}
      submitDisabled={!canMerge}
      submitHint={canMerge ? undefined : 'Add at least one more deck to enable merging.'}
      dropzoneText="Drop your PowerPoint files here (PPTX)"
      dropzoneHint="Add two or more .pptx decks. Arrange the order, then merge."
      busyMessage="Merging presentation files..."
      doneTitle="PowerPoint Presentations Merged!"
      doneBody="Your combined PPTX presentation is ready. Click below to download."
      downloadLabel="Download PPTX"
      errorTitle="Merge Failed"
      settings={
        <p className="text-xs text-muted leading-relaxed">
          Top deck merges first. Use the arrows to reorder before merging.
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
                className="flex items-center gap-2.5 min-w-0 rounded-lg border border-border bg-background p-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent text-xs font-bold tabular-nums">
                  {index + 1}
                </span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <Presentation className="h-4 w-4" />
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
            ))}
          </div>
        ),
      }}
    />
  )
}
