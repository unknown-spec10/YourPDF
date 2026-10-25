'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Lock, Download, RefreshCw, AlertTriangle, Key, Eye, EyeOff } from 'lucide-react'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { API_URL, apiKeyHeaders, buildSingleFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

export default function ProtectPage() {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [isError, setIsError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  // Manage local file URL for preview
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setFileUrl(null)
    }
  }, [file])

  // Revoke blob download URL on unmount
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
  }, [downloadUrl])

  const downloadFileName = file?.name ? `${file.name.replace(/\.[^/.]+$/, "")}_protected.pdf` : "protected.pdf"

  const handleSubmit = async () => {
    if (!file || !password) return
    setIsSubmitting(true)
    setIsError(false)
    setErrorMessage('')
    try {
      const formData = buildSingleFileFormData(file, { password })
      const res = await fetch(`${API_URL}/api/protect`, { method: 'POST', body: formData, headers: apiKeyHeaders() })
      if (!res.ok) {
        let detail = 'Failed to encrypt PDF.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // keep default message
        }
        throw new Error(detail)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      setDownloadUrl(url)
      setIsDone(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to encrypt PDF.'
      setErrorMessage(message)
      setIsError(true)
      alert('Failed to initialize encryption task. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPassword('')
    setShowPassword(false)
    setIsDone(false)
    setIsError(false)
    setErrorMessage('')
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setDownloadUrl(null)
  }

  const showForm = file && !isDone && !isError
  const showResult = isDone || isError

  return (
    <div className={`mx-auto w-full px-6 py-12 flex-1 flex flex-col justify-center transition-all duration-300 ${file ? 'max-w-[1400px]' : 'max-w-3xl'}`}>
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Protect PDF</h1>
            <p className="text-muted mt-1">Add a strong password to encrypt and secure your PDF document.</p>
          </div>
        </div>
      </div>

      {/* Main Form Box */}
      <div className="rounded-2xl border border-card-border bg-surface p-6 md:p-8 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {!file && !showResult && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DropZone onFileAccepted={setFile} />
            </motion.div>
          )}

          {showForm && (
            <motion.div
              key="file-selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left Column: Settings */}
              <div className="flex flex-col gap-6 lg:col-span-4">
                <FilePreview fileName={file.name} fileSize={file.size} onRemove={handleReset} />

                {/* Password Entry */}
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <label className="text-sm font-bold flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted" />
                    <span>Choose open password</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a secure password to encrypt this file"
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !password}
                  className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
                >
                  {isSubmitting ? 'Encrypting...' : 'Encrypt PDF'}
                </button>
              </div>

              {/* Right Column: Comparative Workspace */}
              <div className="flex flex-col gap-4 w-full lg:col-span-8">
                <div className="text-sm font-bold text-muted flex items-center gap-2 self-start">
                  <Lock className="h-4 w-4 text-accent" />
                  <span>Interactive Security Workspace</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  {/* Left sub-panel: Original Document */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-card-border bg-background/30">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider">Original (Unsecured)</div>
                    <div className="relative w-full aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden shadow-inner flex items-center justify-center">
                      {fileUrl ? (
                        <iframe
                          src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                          className="w-full h-full border-0 rounded-lg"
                          title="Original Unsecured PDF"
                        />
                      ) : (
                        <div className="text-xs text-muted">No document loaded</div>
                      )}
                    </div>
                  </div>

                  {/* Right sub-panel: Encrypted Output Lock Screen */}
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-card-border bg-background/30 h-full">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider">Encrypted Output</div>
                    <div className="relative w-full aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden shadow-inner flex items-center justify-center">
                      {fileUrl ? (
                        <>
                          <iframe
                            src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                            className="w-full h-full border-0 rounded-lg pointer-events-none blur-sm"
                            title="Secured PDF Preview Layer"
                          />
                          <div className="absolute inset-0 bg-overlay backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                            <AnimatePresence mode="wait">
                              {password ? (
                                <motion.div
                                  key="locked-state"
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="flex flex-col items-center gap-3 w-full"
                                >
                                  <div className="h-14 w-14 rounded-full bg-success-subtle text-success flex items-center justify-center shadow-md animate-pulse-soft">
                                    <Lock className="h-7 w-7" />
                                  </div>
                                  <span className="text-[10px] font-bold text-success uppercase tracking-widest bg-success-subtle border border-success/30 px-2 py-0.5 rounded-full">
                                    AES-256 Encrypted
                                  </span>
                                  <div className="text-sm font-semibold text-foreground mt-1">Document Secured</div>
                                  <p className="text-xs text-muted max-w-[200px]">
                                    This file is locked. Confirm your password below before processing.
                                  </p>

                                  {/* Password Viewer Component */}
                                  <div className="mt-2 w-full max-w-[240px] bg-surface border border-card-border rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-lg">
                                    <span className="text-xs font-mono text-foreground truncate select-none">
                                      {showPassword ? password : '•'.repeat(password.length)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setShowPassword(!showPassword)}
                                      className="text-muted hover:text-foreground cursor-pointer transition-colors p-1"
                                      title={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                  </div>
                                </motion.div>
                              ) : (
                                <motion.div
                                  key="unlocked-state"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="flex flex-col items-center gap-2"
                                >
                                  <div className="h-12 w-12 rounded-full bg-surface-2 text-muted flex items-center justify-center">
                                    <Lock className="h-5 w-5" />
                                  </div>
                                  <div className="text-xs font-bold text-muted">No Password Set</div>
                                  <p className="text-[11px] text-muted max-w-[200px]">
                                    Enter an open password in the form to preview the encrypted state.
                                  </p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-muted">No document loaded</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-center text-xs text-muted max-w-lg mx-auto mt-2">
                  The encrypted PDF will enforce password authorization before permitting any viewer to open it.
                </div>
              </div>
            </motion.div>
          )}

          {showResult && (
            <motion.div
              key="processing-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center py-6 text-center"
            >
              {/* Submitting State */}
              {isSubmitting && (
                <div className="w-full max-w-md">
                  <ProgressBar
                    progress={50}
                    message="Encrypting PDF..."
                  />
                </div>
              )}

              {/* Success State */}
              {isDone && downloadUrl && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">PDF Encrypted!</h3>
                    <p className="text-sm text-muted mt-1">
                      Your secured PDF file is ready. Click below to download.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4 w-full justify-center items-stretch sm:items-center">
                    <a
                      href={downloadUrl}
                      download={downloadFileName}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Encrypted PDF</span>
                    </a>
                    <button
                      onClick={() => setIsPreviewOpen(true)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <Eye className="h-4 w-4" />
                      <span>Preview PDF</span>
                    </button>
                    <button
                      onClick={handleReset}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Protect Another</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error State */}
              {isError && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Encryption Failed</h3>
                    <p className="text-sm text-muted mt-1">
                      {errorMessage || 'An unexpected error occurred during processing.'}
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 font-semibold hover:bg-background transition-colors mt-4 cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Try Again</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isDone && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl}
          fileName={downloadFileName}
        />
      )}
    </div>
  )
}
