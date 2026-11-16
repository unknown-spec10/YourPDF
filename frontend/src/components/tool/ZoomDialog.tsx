'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ZoomDialogProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
}

/**
 * Full-size preview of one page or slide, as a native modal `<dialog>`.
 *
 * Six pages had their own copy of this overlay: a fixed div, a manual backdrop, an `Escape`
 * handler and no focus management. `showModal()` provides the focus trap, the inert page, Esc,
 * the platform back gesture and focus return, so the only thing left to write is the content.
 */
export default function ZoomDialog({ open, onClose, title, subtitle, children }: ZoomDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

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
      aria-labelledby="zoom-dialog-title"
      // Light dismiss declaratively; the click handler is the fallback for browsers without it.
      {...({ closedby: 'any' } as Record<string, string>)}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close()
      }}
      className="m-auto h-[85dvh] w-[min(64rem,calc(100vw-2rem))] max-w-none rounded-2xl border border-card-border bg-surface p-0 text-foreground shadow-2xl"
    >
      <div className="flex h-full flex-col p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 id="zoom-dialog-title" className="truncate text-base font-bold sm:text-lg">
              {title}
            </h2>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            autoFocus
            className="shrink-0 cursor-pointer rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-2"
          >
            <span aria-hidden="true" className="hidden sm:inline">
              Close
            </span>
            <X className="h-4 w-4 sm:hidden" />
            <span className="sr-only sm:hidden">Close</span>
          </button>
        </div>
        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-card-border bg-background">
          {children}
        </div>
      </div>
    </dialog>
  )
}
