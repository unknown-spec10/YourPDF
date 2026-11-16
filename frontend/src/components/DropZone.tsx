'use client'

import { useCallback, useId, useState } from 'react'
import { useDropzone, Accept } from 'react-dropzone'
import { motion } from 'framer-motion'
import { UploadCloud, AlertCircle } from 'lucide-react'
import { MAX_TOTAL_UPLOAD_BYTES, MAX_TOTAL_UPLOAD_MB } from '@/lib/limits'

interface DropZoneProps {
  onFileAccepted: (file: File) => void
  /** Multi-file tools add every accepted file instead of only the first. */
  onFilesAccepted?: (files: File[]) => void
  multiple?: boolean
  accept?: Accept
  maxSize?: number // In bytes
  disabled?: boolean
  placeholderText?: string
  error?: string | null
}

export default function DropZone({
  onFileAccepted,
  onFilesAccepted,
  multiple = false,
  accept = { 'application/pdf': ['.pdf'] },
  // Defaults to the service budget rather than a rounder number: the old 50 MB default let a
  // user pick a file the service refuses, and the refusal came from the hosting layer before
  // the app could explain it.
  maxSize = MAX_TOTAL_UPLOAD_BYTES,
  disabled = false,
  placeholderText = 'Drop your PDF here',
  error = null,
}: DropZoneProps) {
  const messageId = useId()
  const [localError, setLocalError] = useState<string | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      if (disabled) return

      if (acceptedFiles.length > 0) {
        setLocalError(null)
        if (multiple && onFilesAccepted) onFilesAccepted(acceptedFiles)
        else onFileAccepted(acceptedFiles[0])
      } else if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0].errors[0]
        if (rejection.code === 'file-too-large') {
          setLocalError(
            `File is too large. The limit is ${MAX_TOTAL_UPLOAD_MB} MB per request, all files together.`,
          )
        } else if (rejection.code === 'file-invalid-type') {
          const extensions = Object.values(accept).flat().join(', ').toUpperCase()
          setLocalError(`Invalid file type. Only ${extensions} files are supported.`)
        } else {
          setLocalError(rejection.message || 'Error uploading file.')
        }
      } else {
        setLocalError(null)
      }
    },
    [onFileAccepted, onFilesAccepted, multiple, disabled, accept]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple,
    disabled,
  })

  const shownError = localError ?? error
  const hasError = Boolean(shownError) || isDragReject

  return (
    <div {...getRootProps()} className="w-full cursor-pointer outline-none">
      <input {...getInputProps()} />
      <motion.div
        whileHover={{ scale: disabled ? 1 : 1.005, y: disabled ? 0 : -1 }}
        whileTap={{ scale: disabled ? 1 : 0.998 }}
        animate={{
          borderColor: hasError
            ? 'var(--danger)'
            : isDragActive
              ? 'var(--accent-signal)'
              : 'var(--border)',
          backgroundColor: hasError
            ? 'var(--danger-subtle)'
            : isDragActive
              ? 'var(--accent-subtle)'
              : 'var(--surface)',
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="button"
        aria-disabled={disabled}
        aria-describedby={hasError ? messageId : undefined}
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-6 text-center transition-shadow duration-200 sm:p-10 ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        } ${!hasError && !isDragActive ? 'hover:border-[var(--accent-signal)]' : ''} focus-visible:outline-2 focus-visible:outline-ring`}
        style={{ boxShadow: isDragActive ? 'var(--shadow-lg)' : 'var(--shadow-sm)' }}
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-200 ${
            hasError
              ? 'bg-danger-subtle text-danger'
              : isDragActive
                ? 'bg-accent text-accent-foreground'
                : 'bg-surface-2 text-muted'
          }`}
        >
          {hasError ? (
            <AlertCircle className="h-6 w-6" />
          ) : (
            <UploadCloud
              className={`h-6 w-6 transition-transform duration-300 ${
                isDragActive ? '-translate-y-0.5 scale-110' : 'animate-float-soft'
              }`}
            />
          )}
        </div>

        <h3
          id={messageId}
          className="mt-4 text-[15px] font-semibold tracking-tight text-foreground"
          // A rejected file used to open a blocking alert. The same sentence is now announced
          // from here, where it also stays on screen after the user dismisses nothing.
          role={hasError ? 'alert' : undefined}
          aria-live={hasError ? 'polite' : undefined}
        >
          {hasError && shownError
            ? shownError
            : isDragActive
              ? 'Release to upload your file'
              : placeholderText}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {hasError && !shownError
            ? 'This file type is not supported — try another file'
            : 'or click to browse from your device'}
        </p>
        <p className="mt-3 font-mono text-xs tabular-nums text-muted/80">
          Maximum {maxSize / 1024 / 1024} MB per request
        </p>
      </motion.div>
    </div>
  )
}
