'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Maximize2, Minimize2, Eye, ExternalLink } from 'lucide-react'

interface PdfPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  pdfUrl: string
  fileName?: string
}

export default function PdfPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  fileName = 'Document Preview',
}: PdfPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-0 md:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 cursor-pointer bg-overlay backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-label={fileName}
            className={`relative z-10 flex flex-col overflow-hidden border border-border bg-surface shadow-lg ${
              isFullscreen
                ? 'h-full w-full rounded-none'
                : 'h-full w-full md:h-[85vh] md:max-w-4xl md:rounded-2xl'
            }`}
          >
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                  <Eye className="h-4 w-4" />
                </div>
                <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {fileName}
                </h3>
              </div>

              {/* Window Controls */}
              <div className="flex shrink-0 items-center gap-1.5">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open PDF in native browser tab"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit full screen' : 'Full screen'}
                  className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground cursor-pointer md:inline-flex"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={onClose}
                  title="Close preview"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Frame Viewport */}
            <div className="flex-1 bg-background p-2 sm:p-3">
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
