'use client'

import { useCallback } from 'react'
import { useDropzone, Accept } from 'react-dropzone'
import { motion } from 'framer-motion'
import { UploadCloud, AlertCircle } from 'lucide-react'

interface DropZoneProps {
  onFileAccepted: (file: File) => void
  accept?: Accept
  maxSize?: number // In bytes
  disabled?: boolean
  placeholderText?: string
  error?: string | null
}

export default function DropZone({
  onFileAccepted,
  accept = { 'application/pdf': ['.pdf'] },
  maxSize = 52428800, // 50MB default
  disabled = false,
  placeholderText = 'Drop your PDF here',
  error = null,
}: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      if (disabled) return

      if (acceptedFiles.length > 0) {
        onFileAccepted(acceptedFiles[0])
      } else if (rejectedFiles.length > 0) {
        const error = rejectedFiles[0].errors[0]
        if (error.code === 'file-too-large') {
          alert(`File is too large. Max size is ${maxSize / 1024 / 1024}MB.`)
        } else if (error.code === 'file-invalid-type') {
          const extensions = Object.values(accept).flat().join(', ').toUpperCase()
          alert(`Invalid file type. Only ${extensions} files are supported.`)
        } else {
          alert(error.message || 'Error uploading file.')
        }
      }
    },
    [onFileAccepted, disabled, maxSize, accept]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
    disabled,
  })

  const hasError = Boolean(error) || isDragReject

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
              ? 'var(--accent)'
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
        aria-invalid={hasError}
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-shadow duration-200 sm:p-10 ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        } ${!hasError && !isDragActive ? 'hover:border-accent/60' : ''} focus-visible:outline-2 focus-visible:outline-ring`}
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

        <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
          {hasError && error
            ? error
            : isDragActive
              ? 'Release to upload your file'
              : placeholderText}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {hasError && !error
            ? 'This file type is not supported — try another file'
            : 'or click to browse from your device'}
        </p>
        <p className="mt-3 font-mono text-xs tabular-nums text-muted/80">
          Maximum file size: {maxSize / 1024 / 1024}MB
        </p>
      </motion.div>
    </div>
  )
}
