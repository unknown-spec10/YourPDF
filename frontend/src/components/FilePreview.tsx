'use client'

import { FileText, X } from 'lucide-react'

interface FilePreviewProps {
  fileName: string
  fileSize: number // In bytes
  onRemove: () => void
  disabled?: boolean
}

export default function FilePreview({
  fileName,
  fileSize,
  onRemove,
  disabled = false,
}: FilePreviewProps) {
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-colors duration-150 hover:border-accent/40">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium tracking-tight text-foreground max-w-[200px] sm:max-w-md">
            {fileName}
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-muted">
            {formatBytes(fileSize)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        aria-label="Remove file"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
