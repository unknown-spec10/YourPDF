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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 overflow-hidden">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: 'spring', duration: 0.45 }}
            className={`relative flex flex-col border bg-surface/75 backdrop-blur-xl shadow-2xl transition-all duration-300 z-10 ${
              isFullscreen 
                ? 'w-full h-full max-w-none max-h-none rounded-none border-0' 
                : 'w-full h-full md:h-[85vh] md:max-w-5xl rounded-none md:rounded-2xl border-0 md:border border-card-border/60'
            }`}
          >
            {/* Header / Title Bar */}
            <div className="flex h-14 items-center justify-between border-b border-border/40 bg-surface/50 px-4 sm:px-6">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent shadow-inner">
                  <Eye className="h-4 w-4" />
                </div>
                <h3 className="truncate text-sm font-bold text-foreground">
                  {fileName}
                </h3>
              </div>

              {/* Window Controls */}
              <div className="flex items-center gap-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open PDF in native browser tab"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 text-muted hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
                  className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 text-muted hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={onClose}
                  title="Close Preview"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 text-muted hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Frame Viewport Container */}
            <div className="flex-1 bg-background p-2 md:p-4">
              {pdfUrl ? (
                <iframe
                  src={`${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}preview=true#toolbar=1`}
                  className="w-full h-full border-0 rounded-none md:rounded-xl bg-zinc-900 shadow-inner"
                  title="PDF Document Preview"
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
