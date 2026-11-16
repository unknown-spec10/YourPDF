'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Maximize2, Minimize2, Eye, ExternalLink } from 'lucide-react'

interface PdfPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  pdfUrl: string
  fileName?: string
}

/**
 * Result preview as a native modal `<dialog>`.
 *
 * The previous version rebuilt what the platform already provides — a focus trap, an inert
 * background, Esc handling, focus return to the invoker — with a fixed overlay and
 * `role="dialog" aria-modal="true"`. `showModal()` gives all of it for free, and adding our own
 * trap on top would fight the browser's.
 */
export default function PdfPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  fileName = 'Document Preview',
}: PdfPreviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen && !dialog.open) {
      dialog.showModal()
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  // `close` fires for Esc, the platform back gesture and light dismiss. Reporting it upward keeps
  // React state the single source of truth instead of the dialog drifting out of sync.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="pdf-preview-title"
      // `closedby` is the declarative light-dismiss attribute; the React types lag behind it.
      // Browsers without it fall back to the backdrop click handler below.
      {...({ closedby: 'any' } as Record<string, string>)}
      onClick={(event) => {
        // A click that lands on the <dialog> box itself (not its content) is a backdrop click.
        if (event.target === dialogRef.current) dialogRef.current?.close()
      }}
      className={`m-auto max-h-none flex-col overflow-hidden open:flex border border-border bg-surface p-0 text-foreground shadow-lg ${
        isFullscreen
          ? 'h-dvh max-h-none w-dvw max-w-none rounded-none'
          : 'h-[85vh] w-[min(64rem,calc(100vw-2rem))] rounded-2xl'
      }`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
            <Eye className="h-4 w-4" />
          </div>
          <h2 id="pdf-preview-title" className="truncate text-sm font-semibold tracking-tight">
            {fileName}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open PDF in a browser tab"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => setIsFullscreen((current) => !current)}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground md:inline-flex"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => dialogRef.current?.close()}
            autoFocus
            title="Close preview"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <span className="sr-only">Close preview</span>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-background p-2 sm:p-3">
        {pdfUrl ? (
          <iframe
            src={
              pdfUrl.startsWith('blob:')
                ? `${pdfUrl}#toolbar=1`
                : `${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}preview=true#toolbar=1`
            }
            className="h-full w-full rounded-lg border border-border bg-surface-2"
            title="PDF document preview"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="text-sm text-muted">No preview URL found.</div>
          </div>
        )}
      </div>
    </dialog>
  )
}
