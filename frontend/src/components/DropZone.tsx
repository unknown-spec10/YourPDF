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
        whileHover={{ scale: disabled ? 1 : 1.005, y: disabled ? 0 : -2 }}
        whileTap={{ scale: disabled ? 1 : 0.995 }}
        animate={{
          borderColor: isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 40%, transparent)',
          backgroundColor: isDragActive 
            ? 'color-mix(in srgb, var(--accent) 8%, transparent)' 
            : 'color-mix(in srgb, var(--surface) 40%, transparent)',
          boxShadow: isDragActive 
            ? '0 20px 40px -15px rgba(var(--accent-rgb), 0.15), 0 0 0 1px rgba(var(--accent-rgb), 0.2)'
            : '0 10px 30px -10px rgba(0, 0, 0, 0.15)',
        }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center backdrop-blur-lg transition-all relative overflow-hidden ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent'
        }`}
      >
        {/* Glow overlay during drag active */}
        {isDragActive && (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/5 pointer-events-none" />
        )}
        
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mb-6 shadow-inner">
          <UploadCloud className={`h-8 w-8 transition-transform duration-300 ${isDragActive ? 'scale-110 -translate-y-1' : 'animate-bounce-subtle'}`} />
        </div>
        
        <h3 className="text-xl font-bold text-foreground mb-2">
          {isDragActive ? 'Release to upload your file' : placeholderText}
        </h3>
        <p className="text-sm text-muted">
          or click to browse from your device
        </p>
        <p className="text-xs text-muted/50 mt-4 font-mono">
          Maximum file size: {maxSize / 1024 / 1024}MB
        </p>
      </motion.div>
    </div>
  )
}
