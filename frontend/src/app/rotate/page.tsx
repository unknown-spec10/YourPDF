'use client'

import { useEffect, useState } from 'react'
import { RotateCw, ZoomIn } from 'lucide-react'
import PdfPreviewModal from '@/components/PdfPreviewModal'
import ToolShell, { PreviewAction } from '@/components/tool/ToolShell'
import ZoomDialog from '@/components/tool/ZoomDialog'
import { useFileJob } from '@/hooks/useFileJob'
import { buildSingleFileFormData, submitJob } from '@/lib/api'

type RotateArgs = { file: File; rotation: number }

const rotateSubmitter = ({ file, rotation }: RotateArgs) =>
  submitJob('/api/rotate', buildSingleFileFormData(file, { rotation }))

export default function RotatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [rotation, setRotation] = useState<number | ''>(90)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isZoomOpen, setIsZoomOpen] = useState(false)

  // Local object URL for the live preview; revoked when the file changes or the page unmounts.
  useEffect(() => {
    if (!file) {
      setFileUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const job = useFileJob<RotateArgs>(rotateSubmitter)
  const angle = rotation === '' ? 0 : rotation
  const invalidAngle = rotation === '' || rotation === 0

  const handleSubmit = async () => {
    if (!file || invalidAngle) return
    await job.submit({ file, rotation })
  }

  const handleReset = () => {
    setFile(null)
    setRotation(90)
    setIsZoomOpen(false)
    setIsPreviewOpen(false)
    job.reset()
  }

  return (
    <>
      <ToolShell
        icon={<RotateCw className="h-5 w-5" />}
        title="Rotate PDF"
        subtitle="Rotate every page to fix orientation."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={`${angle}° rotation`}
        job={job}
        onSubmit={handleSubmit}
        submitLabel="Rotate PDF"
        submitDisabled={invalidAngle}
        submitHint={invalidAngle ? 'Enter a non-zero angle to enable rotation.' : undefined}
        dropzoneHint="Rotation applies to every page. Preview updates live before you submit."
        busyMessage="Rotating PDF pages..."
        doneTitle="PDF Rotated!"
        doneBody="Your pages have been rotated. Click below to download."
        downloadLabel="Download Rotated PDF"
        doneActions={<PreviewAction onClick={() => setIsPreviewOpen(true)} />}
        errorTitle="Rotation Failed"
        settings={
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[13px] font-semibold">01 — Rotation Angle</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                {rotation === '' ? '—' : `${rotation}°`}
              </span>
            </div>
            <div className="flex flex-col gap-3 min-w-0 rounded-xl border border-border bg-background px-3 py-3">
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={angle}
                onChange={(event) => setRotation(Number(event.target.value))}
                aria-label="Rotation angle slider (clockwise degrees)"
                className="w-full min-w-0 accent-[var(--accent)] cursor-pointer"
              />
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="number"
                  min={0}
                  max={360}
                  step={0.5}
                  value={rotation}
                  placeholder="90"
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === '') {
                      setRotation('')
                      return
                    }
                    const parsed = parseFloat(value)
                    if (Number.isNaN(parsed)) {
                      setRotation('')
                      return
                    }
                    setRotation(Math.min(360, Math.max(0, parsed)))
                  }}
                  aria-label="Rotation angle in degrees (clockwise)"
                  className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm font-mono tabular-nums text-foreground focus:outline-none focus:border-accent"
                />
                <span className="shrink-0 text-sm text-muted">° clockwise</span>
              </div>
              <p className="text-[11px] leading-snug text-muted">
                Any angle 0–360°. Positive values rotate clockwise. Use decimals (e.g. 37.5°) to
                straighten scans.
              </p>
            </div>
          </div>
        }
        preview={{
          title: '02 — Rotation preview',
          aside: `${angle}°`,
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden overscroll-contain flex flex-col items-center">
              <div
                onClick={() => fileUrl && setIsZoomOpen(true)}
                className={`relative w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden group transition-colors ${
                  fileUrl ? 'cursor-pointer hover:border-accent' : ''
                }`}
              >
                {fileUrl ? (
                  <>
                    <div
                      className="absolute inset-4 transition-transform duration-500 ease-out"
                      style={{ transform: `rotate(${angle}deg)` }}
                    >
                      <iframe
                        loading="lazy"
                        src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                        className="h-full w-full border-0 rounded pointer-events-none"
                        title="Rotate Preview Viewport"
                      />
                    </div>
                    <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                      <div className="p-2 rounded-full bg-accent text-accent-foreground">
                        <ZoomIn className="h-4 w-4" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">
                    No document loaded
                  </div>
                )}
              </div>
              <p className="mt-2.5 text-center text-xs text-muted max-w-[40ch]">
                Showing visual layout preview. Output PDF pages will be permanently rotated.
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
            file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_rotated.pdf` : 'rotated.pdf'
          }
        />
      )}

      <ZoomDialog
        open={isZoomOpen && Boolean(fileUrl)}
        onClose={() => setIsZoomOpen(false)}
        title="Rotation Live Zoom"
        subtitle="Inspect page layout and rotated reading orientation."
      >
        {fileUrl && (
          <div
            className="h-full w-full transition-transform duration-500 ease-out"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <iframe
              src={`${fileUrl}#page=1&toolbar=0&navpanes=0`}
              className="h-full w-full border-0"
              title="Rotate Zoom Preview Frame"
            />
          </div>
        )}
      </ZoomDialog>
    </>
  )
}
