'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Key, Eye, EyeOff } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildSingleFileFormData, submitJob } from '@/lib/api'

type ProtectArgs = { file: File; password: string }

const protectSubmitter = ({ file, password }: ProtectArgs) =>
  submitJob('/api/protect', buildSingleFileFormData(file, { password }))

export default function ProtectPage() {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

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

  const job = useFileJob<ProtectArgs>(protectSubmitter)

  const downloadFileName = file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_protected.pdf` : 'protected.pdf'

  const handleSubmit = async () => {
    if (!file || !password) return
    await job.submit({ file, password })
  }

  const handleReset = () => {
    setFile(null)
    setPassword('')
    setShowPassword(false)
    setIsPreviewOpen(false)
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<Lock className="h-5 w-5" />}
        title="Protect PDF"
        subtitle="Add a strong password to encrypt and secure your PDF document."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={password ? 'password set' : 'no password yet'}
        job={job}
        onSubmit={handleSubmit}
        submitLabel="Encrypt PDF"
        submitDisabled={!password}
        dropzoneHint="Password is required before encrypting. The encrypted file will ask for it on open."
        busyMessage="Encrypting PDF..."
        doneTitle="PDF Encrypted!"
        doneBody="Your secured PDF file is ready. Click below to download."
        downloadLabel="Download Encrypted PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Encryption Failed"
        settings={
          <>
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
          </>
        }
        preview={{
          title: '02 — Lock preview',
          aside: (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest ${password ? 'border-success/30 bg-success-subtle text-success' : 'border-border text-muted'}`}>
              {password ? 'AES-256 Encrypted' : 'No password set'}
            </span>
          ),
          children: (
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
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={job.downloadUrl}
          fileName={downloadFileName}
        />
      )}
    </>
  )
}
