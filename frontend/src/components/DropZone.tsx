'use client'

import { useCallback } from 'react'
import { useDropzone, Accept } from 'react-dropzone'
import { motion } from 'framer-motion'
import { UploadCloud } from 'lucide-react'

interface DropZoneProps {
  onFileAccepted: (file: File) => void
  accept?: Accept
  maxSize?: number // In bytes
  disabled?: boolean
  placeholderText?: string
}

export default function DropZone({
  onFileAccepted,
  accept = { 'application/pdf': ['.pdf'] },
  maxSize = 52428800, // 50MB default
  disabled = false,
  placeholderText = 'Drop your PDF here',
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
    disabled,
  })

  return (
    <div {...getRootProps()} className="w-full cursor-pointer outline-none">
      <input {...getInputProps()} />
      <motion.div
        whileHover={{ scale: disabled ? 1 : 1.01 }}
        whileTap={{ scale: disabled ? 1 : 0.99 }}
        animate={{
          borderColor: isDragActive ? 'var(--accent)' : 'var(--border)',
          backgroundColor: isDragActive ? 'rgba(99, 102, 241, 0.05)' : 'rgba(0, 0, 0, 0)',
        }}
        transition={{ duration: 0.2 }}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent hover:bg-surface/30'
        }`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mb-6">
          <UploadCloud className="h-8 w-8 animate-bounce-subtle" />
        </div>
        <h3 className="text-xl font-bold text-foreground mb-2">
          {isDragActive ? 'Drop the file here' : placeholderText}
        </h3>
        <p className="text-sm text-muted">
          or click to browse from your device
        </p>
        <p className="text-xs text-muted/60 mt-4">
          Maximum file size: {maxSize / 1024 / 1024}MB
        </p>
      </motion.div>
    </div>
  )
}
