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
    <div className="flex items-center justify-between rounded-xl border border-border/40 bg-surface/30 backdrop-blur-md p-4 shadow-sm transition-all duration-200 hover:border-accent/30 hover:shadow-md">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent shadow-inner">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate max-w-[200px] sm:max-w-md">
            {fileName}
          </p>
          <p className="text-xs text-muted mt-0.5 font-mono">
            {formatBytes(fileSize)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Remove file"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
