'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Lock, Download, RefreshCw, AlertTriangle, Key, Eye, EyeOff, FileText, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
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
    setIsPreviewOpen(false)
    setIsDone(false)
    setIsError(false)
    setErrorMessage('')
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setDownloadUrl(null)
  }

  const showForm = file && !isDone && !isError
  const showResult = isDone || isError
  const isWorkspace = showForm && !isSubmitting

  return (
    <div className={`mx-auto w-full min-w-0 flex-1 flex flex-col justify-center overflow-x-clip px-4 sm:px-6 py-6 sm:py-10 transition-all duration-300 ${file ? 'max-w-[1400px]' : 'max-w-2xl'}`}>
      {/* Header */}
      <div className="mb-5 sm:mb-7 min-w-0">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Protect PDF</h1>
            <p className="text-sm text-muted mt-0.5">Add a strong password to encrypt and secure your PDF document.</p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!file && !showResult && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 min-w-0"
          >
            <DropZone onFileAccepted={setFile} />
            <p className="text-center text-xs text-muted">
              Password is required before encrypting. The encrypted file will ask for it on open.
            </p>
          </motion.div>
        )}

        {isWorkspace && file && (
          <motion.div
            key="file-selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4 sm:gap-5 min-w-0"
          >
            {/* Slim add bar */}
            <div className="flex items-center gap-3 min-w-0 rounded-xl border border-card-border bg-surface px-3 py-2.5 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                  {password ? ' · password set' : ' · no password yet'}
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Repeat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Replace</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const next = e.target.files?.[0]
                    if (next) setFile(next)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleReset}
                aria-label="Remove file"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Workspace: compact settings + generous preview */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                <span className="text-[13px] font-semibold">01 — Password</span>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="flex items-center gap-2 text-[13px] font-semibold">
                    <Key className="h-4 w-4 text-muted" />
                    <span>Choose open password</span>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a secure password to encrypt this file"
                    className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                  />
                  <p className="text-xs text-muted leading-relaxed">
                    AES-256 encryption. Viewers must enter this password to open the file.
                  </p>
                </div>

                <div className="sticky bottom-3 lg:static">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !password}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {isSubmitting ? 'Encrypting...' : 'Encrypt PDF'}
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">02 — Lock preview</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${password ? 'border-success/30 bg-success-subtle text-success' : 'border-border text-muted'}`}>
                    {password ? 'AES-256 Encrypted' : 'No password set'}
                  </span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
                    <div className="relative mx-auto w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden">
                      {fileUrl ? (
                        <>
                          <iframe
                            loading="lazy"
                            src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                            className={`absolute inset-0 h-full w-full border-0 pointer-events-none ${password ? 'blur-sm' : ''}`}
                            title="Original PDF first page"
                          />
                          <div className="absolute inset-0 bg-overlay backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                            <AnimatePresence mode="wait">
                              {password ? (
                                <motion.div
                                  key="locked-state"
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="flex flex-col items-center gap-2.5 w-full"
                                >
                                  <div className="h-12 w-12 rounded-full bg-success-subtle text-success flex items-center justify-center">
                                    <Lock className="h-6 w-6" />
                                  </div>
                                  <div className="text-sm font-semibold text-foreground">Document Secured</div>
                                  <p className="text-xs text-muted max-w-[26ch]">
                                    This file is locked. Confirm your password below before processing.
                                  </p>
                                  <div className="mt-1 w-full max-w-[240px] bg-surface border border-card-border rounded-lg p-2.5 flex items-center justify-between gap-2">
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
                                  <div className="h-11 w-11 rounded-full bg-surface-2 text-muted flex items-center justify-center">
                                    <Lock className="h-5 w-5" />
                                  </div>
                                  <div className="text-xs font-bold text-muted">No Password Set</div>
                                  <p className="text-[11px] text-muted max-w-[26ch]">
                                    Enter an open password in the form to preview the encrypted state.
                                  </p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">No document loaded</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {showResult && (
          <motion.div
            key="processing-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-6 text-center min-w-0"
          >
            {isSubmitting && (
              <div className="w-full max-w-md min-w-0">
                <ProgressBar
                  progress={50}
                  message="Encrypting PDF..."
                />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">PDF Encrypted!</h3>
                  <p className="text-sm text-muted mt-1">
                    Your secured PDF file is ready. Click below to download.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl}
                    download={downloadFileName}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Encrypted PDF</span>
                  </a>
                  <button
                    onClick={() => setIsPreviewOpen(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Preview PDF</span>
                  </button>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Protect Another</span>
                  </button>
                </div>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-1">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Encryption Failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {errorMessage || 'An unexpected error occurred during processing.'}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors mt-2 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Try Again</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
