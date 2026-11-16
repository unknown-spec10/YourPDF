'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Settings } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildSingleFileFormData, submitJob } from '@/lib/api'
import { formatBytes } from '@/lib/format'

type CompressArgs = { file: File; quality: string }

const compressSubmitter = ({ file, quality }: CompressArgs) =>
  submitJob('/api/compress', buildSingleFileFormData(file, { quality }))

const LEVELS = {
  low: { label: 'Low', dpi: '300 DPI', factor: 0.8, reduction: '~20%' },
  medium: { label: 'Medium', dpi: '150 DPI', factor: 0.4, reduction: '~60%' },
  high: { label: 'High', dpi: '72 DPI', factor: 0.2, reduction: '~80%' },
} as const

type Quality = keyof typeof LEVELS

export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState<Quality>('medium')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setFileUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const job = useFileJob<CompressArgs>(compressSubmitter)
  const level = LEVELS[quality]
  const estimated = file ? formatBytes(file.size * level.factor) : null

  const handleSubmit = async () => {
    if (!file) return
    await job.submit({ file, quality })
  }

  const handleReset = () => {
    setFile(null)
    setIsPreviewOpen(false)
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<Settings className="h-5 w-5" />}
        title="Compress PDF"
        subtitle="Reduce file size with balanced quality for sharing and storage."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={`${level.label} · ${level.dpi}`}
        job={job}
        onSubmit={handleSubmit}
        submitLabel="Compress PDF"
        dropzoneHint="Quality defaults to Medium. Open advanced options to fine-tune output size."
        busyMessage="Compressing PDF..."
        doneTitle="Compression Done!"
        doneBody="Your compressed PDF is ready. Click the button below to download."
        downloadLabel="Download PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Processing Failed"
        settings={
          <>
            <span className="text-[13px] font-semibold">01 — Compression</span>
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <Settings className="h-4 w-4" />
                <span>Advanced options</span>
              </button>

              {showAdvanced ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2.5 flex flex-col gap-2.5 rounded-xl bg-background border border-border p-3"
                >
                  <span className="text-[13px] font-semibold">Compression Level</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(LEVELS) as Quality[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setQuality(key)}
                        className={`py-2 px-2 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
                          quality === key
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'border-border hover:border-accent/50'
                        }`}
                      >
                        {LEVELS[key].label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted leading-relaxed flex flex-col gap-1.5">
                    <span>
                      <strong>
                        {level.label} Compression ({level.dpi})
                      </strong>
                      :{' '}
                      {quality === 'low'
                        ? 'Minimal compression, highest print quality. Recommended for printing.'
                        : quality === 'medium'
                          ? 'Balanced compression and quality. Recommended for e-books and general use.'
                          : 'Maximum file size reduction. Recommended for web and screens.'}
                    </span>
                    {estimated && (
                      <span className="text-accent font-semibold">
                        Estimated size: ~{estimated} ({level.reduction} reduction)
                      </span>
                    )}
                  </span>
                </motion.div>
              ) : (
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  {level.label} ({level.dpi}) · ~{estimated} estimated.
                </p>
              )}
            </div>
          </>
        }
        preview={{
          title: '02 — First page preview',
          aside: `${level.label} · ${level.dpi}`,
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden overscroll-contain">
              <div className="relative mx-auto w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden">
                {fileUrl ? (
                  <iframe
                    loading="lazy"
                    src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                    className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                    title="First page preview"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">
                    Reading document…
                  </div>
                )}
              </div>
              <p className="mt-2.5 text-center text-xs text-muted">
                Compression preserves layout. Download the result to verify final size and quality.
              </p>
            </div>
          ),
        }}
      />

      {job.isDone && job.downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={job.downloadUrl}
          fileName={
            file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_compressed.pdf` : 'compressed.pdf'
          }
        />
      )}
    </>
  )
}
