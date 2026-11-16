'use client'

import { useState } from 'react'
import { Eye, EyeOff, Key, Unlock } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildSingleFileFormData, submitJob } from '@/lib/api'

type UnlockArgs = { file: File; password: string }

const unlockSubmitter = ({ file, password }: UnlockArgs) =>
  submitJob('/api/unlock', buildSingleFileFormData(file, { password }))

export default function UnlockPage() {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const job = useFileJob<UnlockArgs>(unlockSubmitter)

  const downloadFileName = file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_unlocked.pdf` : 'unlocked.pdf'

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
        icon={<Unlock className="h-5 w-5" />}
        title="Unlock PDF"
        subtitle="Remove passwords, encryption, and security locks from your PDF document."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta="encrypted — preview locked"
        job={job}
        onSubmit={handleSubmit}
        submitLabel="Unlock PDF"
        submitDisabled={!password}
        dropzoneHint="Enter the current password to decrypt. Encrypted files cannot be previewed until unlocked."
        busyMessage="Decrypting PDF..."
        doneTitle="PDF Unlocked!"
        doneBody="Your decrypted PDF is ready and has no password locks. Click below to download."
        downloadLabel="Download Unlocked PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Decryption Failed"
        settings={
          <>
            <span className="text-[13px] font-semibold">01 — Password</span>
            <div className="flex flex-col gap-1.5 min-w-0">
              <label className="flex items-center gap-2 text-[13px] font-semibold">
                <Key className="h-4 w-4 text-muted" />
                <span>Enter current password</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter the password to decrypt this PDF"
                  className="w-full h-11 pl-3.5 pr-11 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors cursor-pointer p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        }
        preview={{
          title: '02 — File status',
          aside: 'locked',
          children: (
            <div className="min-h-[180px] sm:min-h-[240px] flex flex-col items-center justify-center text-center gap-2.5 p-6 rounded-lg border border-border bg-background">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
                <Unlock className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Encrypted file ready</p>
              <p className="text-xs text-muted max-w-[32ch] leading-relaxed">
                {password
                  ? 'Password entered. Submit to decrypt and preview the unlocked result.'
                  : 'Enter the current password, then unlock to preview and download.'}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-muted">{file?.name}</p>
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
