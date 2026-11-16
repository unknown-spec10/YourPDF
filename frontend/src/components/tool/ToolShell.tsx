'use client'

import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Accept } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Download, Eye, FileText, RefreshCw, Repeat, Share2, X } from 'lucide-react'

import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import ToolHeader from '@/components/tool/ToolHeader'
import { formatBytes } from '@/lib/format'
import { stashFile, takeFile } from '@/lib/handoff'
import {
  MAX_TOTAL_UPLOAD_BYTES,
  MAX_TOTAL_UPLOAD_MB,
  UPLOAD_LIMIT_MESSAGE,
  fitToBudget,
} from '@/lib/limits'

/**
 * Everything a tool page renders except its own controls.
 *
 * The drop zone, the selected-file bar, the settings/preview grid, the submit button and the
 * progress / success / error states were copied into all 27 pages — which is why a single fix
 * (a 50% progress bar, an alert that blamed the network, a missing retry) had to be applied 27
 * times. This owns all of it; a page supplies its header copy, its settings panel, its preview
 * and the copy for the three states.
 *
 * Deliberately *presentational*: the job state comes from `useFileJob` in the page, so pages that
 * need something unusual (multi-file planners, canvas editors) can still reach for the hook
 * directly without adopting this shell.
 */

interface JobState {
  isSubmitting: boolean
  isDone: boolean
  isError: boolean
  submitError: string | null
  downloadUrl: string | null
  resultBlob?: Blob | null
  /** Advisory note from a response header (e.g. a signature was invalidated). */
  notice?: string | null
  fileName: string | null
}

export interface ToolShellProps {
  // Header
  icon: ReactNode
  title: string
  subtitle: string

  // Drop zone
  accept?: Accept
  dropzoneText?: string
  dropzoneHint?: ReactNode
  maxSize?: number

  // Selected file(s): pass `file` for a single-file tool, `files` for a multi-file one.
  file?: File | null
  files?: File[]
  onFileAccepted?: (file: File) => void
  onFilesAccepted?: (files: File[]) => void
  onReset: () => void
  /** Shown under the filename in the file bar, e.g. "12.4 MB · 90°". */
  fileMeta?: ReactNode
  /** MIME used by the "Replace" file input; must match the drop zone's accept list. */
  replaceAccept?: string

  // Job
  job: JobState
  onSubmit?: () => void
  submitLabel?: string
  submitDisabled?: boolean
  submitHint?: ReactNode
  /**
   * A validation refusal raised by the page's own submit handler, shown inline next to the
   * button, announced once. Replaces the `alert()` calls a blocking dialog used to open for
   * "add at least two files" — feedback that belongs beside the control, not over the page.
   */
  validationError?: string | null

  // Workspace
  settings?: ReactNode
  preview?: { title: string; aside?: ReactNode; children: ReactNode }
  /**
   * Full-width workspace that replaces the settings/preview grid, for a tool whose interaction
   * is not a settings column (the merge planner). The page then keeps its own submit button, so
   * this mode renders no submit button of its own.
   */
  workspace?: ReactNode

  // State copy
  busyMessage: string
  doneTitle: string
  doneBody: ReactNode
  downloadLabel: string
  doneActions?: ReactNode
  /** Media to show in the success card — a result image, for the image tools. */
  doneMedia?: ReactNode
  /**
   * Replaces the whole success card. For a tool that answers with something other than a file
   * (extract-text returns JSON), there is no download CTA to render and the page owns the result.
   */
  doneContent?: ReactNode
  errorTitle: string
  /** Clears the job but keeps the file, so "Try again" does not cost another upload. */
  onRetry?: () => void
}

export default function ToolShell({
  icon,
  title,
  subtitle,
  accept,
  dropzoneText,
  dropzoneHint,
  maxSize,
  file,
  files,
  onFileAccepted,
  onFilesAccepted,
  onReset,
  fileMeta,
  replaceAccept = 'application/pdf,.pdf',
  job,
  onSubmit,
  submitLabel,
  submitDisabled = false,
  submitHint,
  validationError,
  settings,
  preview,
  workspace,
  busyMessage,
  doneTitle,
  doneBody,
  downloadLabel,
  doneActions,
  doneMedia,
  doneContent,
  errorTitle,
  onRetry,
}: ToolShellProps) {
  const { isSubmitting, isDone, isError, submitError, downloadUrl, fileName, resultBlob, notice } = job
  const router = useRouter()
  const pathname = usePathname()
  const isMulti = Array.isArray(files)
  const selected = isMulti ? files! : file ? [file] : []
  const totalBytes = selected.reduce((sum, item) => sum + item.size, 0)
  const hasFiles = selected.length > 0
  const overBudget = totalBytes > MAX_TOTAL_UPLOAD_BYTES
  const isWorkspace = hasFiles && !isDone && !isError && !isSubmitting
  const retry = onRetry ?? onReset

  // The per-file cap in DropZone cannot see the other files, so a multi-file tool could
  // assemble 3×12 MB and only find out from the server. Refuse the files that would cross the
  // request budget and say so, instead of accepting them and failing later.
  const [budgetNotice, setBudgetNotice] = useState<string | null>(null)
  const addFiles = (incoming: File[]) => {
    if (!isMulti || !onFilesAccepted) {
      if (incoming[0] && onFileAccepted) onFileAccepted(incoming[0])
      return
    }
    const { accepted, skipped } = fitToBudget(selected, incoming)
    if (accepted.length) onFilesAccepted(accepted)
    setBudgetNotice(
      skipped.length
        ? `${skipped.length} file${skipped.length === 1 ? '' : 's'} not added — ${
            skipped.length === 1 ? 'it' : 'they'
          } would push this request over the ${MAX_TOTAL_UPLOAD_MB} MB limit.`
        : null,
    )
  }

  // Keep the latest `addFiles` reachable from a stable listener without re-binding on every
  // render (assigning a ref during render is what React forbids, hence the effect).
  const addFilesRef = useRef(addFiles)
  useEffect(() => {
    addFilesRef.current = addFiles
  })

  // Web Share is a mobile-first affordance: the file is already in memory, so sharing it to
  // Mail/Drive/WhatsApp skips the download-then-find-it-again dance. Feature-detected, because
  // desktop Firefox and most desktop browsers cannot share files.
  const [canShare, setCanShare] = useState(false)
  const [chainBusy, setChainBusy] = useState<string | null>(null)
  useEffect(() => {
    setCanShare(
      typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        typeof navigator.share === 'function',
    )
  }, [])

  const asFile = (): File | null => {
    if (!resultBlob) return null
    return new File([resultBlob], fileName ?? 'yourpdf-result.pdf', {
      type: resultBlob.type || 'application/pdf',
    })
  }

  const shareResult = async () => {
    const file = asFile()
    if (!file) return
    try {
      await navigator.share({ files: [file], title: fileName ?? 'YourPDF result' })
    } catch {
      // The user dismissed the share sheet; nothing to report.
    }
  }

  // Chaining re-uses the same IndexedDB handoff as drag-to-card: stash the result for the next
  // route, then navigate. The next tool opens with the file already loaded.
  const chainTo = async (target: string) => {
    const file = asFile()
    if (!file) return
    setChainBusy(target)
    try {
      await stashFile(target, file)
      router.push(target)
    } finally {
      setChainBusy(null)
    }
  }

  // A file dropped on a tool card (or chained from a previous result) was stashed for this
  // route before navigation. Pick it up once, so the tool opens already loaded.
  useEffect(() => {
    let cancelled = false
    void takeFile(window.location.pathname).then((handed) => {
      if (cancelled || !handed) return
      addFilesRef.current([handed])
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Keyboard affordances, defined once for every tool page:
  //   Esc        — clear the selection
  //   Ctrl/Cmd+S — save the finished result instead of the browser's "save page" dialog
  //   Enter      — run the tool when focus is not in a field or on a button
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        Boolean(target?.isContentEditable)
      const dialogOpen = document.querySelector('dialog[open]')

      if (event.key === 'Escape' && !typing && !dialogOpen && hasFiles && !isSubmitting) {
        onReset()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && downloadUrl) {
        event.preventDefault()
        const link = document.createElement('a')
        link.href = downloadUrl
        if (fileName) link.download = fileName
        link.click()
        return
      }

      if (
        event.key === 'Enter' &&
        !typing &&
        !dialogOpen &&
        hasFiles &&
        !isSubmitting &&
        !isDone &&
        !overBudget &&
        target?.tagName !== 'BUTTON' &&
        onSubmit
      ) {
        event.preventDefault()
        onSubmit()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasFiles, isSubmitting, isDone, downloadUrl, fileName, onReset, onSubmit, overBudget])

  // Paste a screenshot or a copied file straight into the tool.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isDone) return
      const pasted = Array.from(event.clipboardData?.files ?? [])
      if (pasted.length === 0) return
      event.preventDefault()
      addFilesRef.current(pasted)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [isDone])

  return (
    <div
      className={`mx-auto w-full min-w-0 flex-1 flex flex-col justify-center overflow-x-clip px-4 sm:px-6 py-6 sm:py-10 transition-all duration-300 ${
        hasFiles ? 'max-w-[1400px]' : 'max-w-2xl'
      }`}
    >
      <ToolHeader icon={icon} title={title} subtitle={subtitle} />

      <AnimatePresence mode="wait">
        {!hasFiles && !isDone && !isError && !isSubmitting && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 min-w-0"
          >
            <DropZone
              onFileAccepted={onFileAccepted ?? (() => undefined)}
              onFilesAccepted={addFiles}
              multiple={isMulti}
              accept={accept}
              placeholderText={dropzoneText}
              maxSize={maxSize}
            />
            {dropzoneHint && <p className="text-center text-xs text-muted">{dropzoneHint}</p>}
          </motion.div>
        )}

        {isWorkspace && (
          <motion.div
            key="file-selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4 sm:gap-5 min-w-0"
          >
            {/* Selected file(s) */}
            <div className="flex items-center gap-3 min-w-0 rounded-xl border border-card-border bg-surface px-3 py-2.5 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">
                  {isMulti
                    ? `${selected.length} file${selected.length === 1 ? '' : 's'}`
                    : selected[0]?.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {formatBytes(totalBytes)}
                  {isMulti && (
                    <span className={overBudget ? ' text-danger' : ''}>
                      {' '}
                      of {MAX_TOTAL_UPLOAD_MB} MB
                    </span>
                  )}
                  {fileMeta ? <> · {fileMeta}</> : null}
                </p>
              </div>
              {isMulti ? (
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                  <Repeat className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Add files</span>
                  <input
                    type="file"
                    accept={replaceAccept}
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const next = Array.from(event.target.files ?? [])
                      if (next.length) addFiles(next)
                      event.target.value = ''
                    }}
                  />
                </label>
              ) : (
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                  <Repeat className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Replace</span>
                  <input
                    type="file"
                    accept={replaceAccept}
                    className="hidden"
                    onChange={(event) => {
                      const next = event.target.files?.[0]
                      if (next && onFileAccepted) onFileAccepted(next)
                      event.target.value = ''
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={onReset}
                aria-label={isMulti ? 'Remove all files' : 'Remove file'}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {validationError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-xs font-semibold text-danger"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{validationError}</span>
              </p>
            )}

            {(budgetNotice || overBudget) && (
              <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-xs font-semibold text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{budgetNotice ?? UPLOAD_LIMIT_MESSAGE}</span>
              </p>
            )}

            {workspace ? (
              <div className="flex min-w-0 flex-col gap-4">
                {validationError && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-xs font-semibold text-danger"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{validationError}</span>
                  </p>
                )}
                {workspace}
              </div>
            ) : (
            /* Settings + preview */
            <div
              className={`grid grid-cols-1 gap-4 sm:gap-5 items-start min-w-0 ${
                preview ? 'lg:grid-cols-[300px_minmax(0,1fr)]' : ''
              }`}
            >
              {/* Sticky on desktop: a long preview must not scroll the controls out of reach.
                  The column gets its own scrollport so a tall settings panel (many pages do) is
                  still reachable, and `overscroll-contain` stops that inner scroll from chaining
                  to the page once it hits the end. */}
              <div className="flex flex-col gap-4 min-w-0 order-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:[scrollbar-gutter:stable]">
                {settings}
                <div className="sticky bottom-3 lg:bottom-0 lg:-mx-1 lg:px-1 lg:pb-1 lg:bg-background/90 lg:backdrop-blur-sm">
                  <button
                    onClick={onSubmit}
                    disabled={isSubmitting || submitDisabled || overBudget}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {submitLabel}
                  </button>
                  {submitHint && (
                    <p className="mt-1.5 text-center text-[11px] text-muted">{submitHint}</p>
                  )}
                </div>
              </div>

              {preview && (
                <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                    <span className="text-[13px] font-semibold truncate">{preview.title}</span>
                    {preview.aside && (
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                        {preview.aside}
                      </span>
                    )}
                  </div>
                  <div className="p-3 sm:p-4">{preview.children}</div>
                </div>
              )}
            </div>
            )}
          </motion.div>
        )}

        {(isSubmitting || isError || (isDone && (doneContent || downloadUrl))) && (
          <motion.div
            key="processing-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-6 text-center min-w-0"
          >
            {isSubmitting && (
              <div className="w-full max-w-md min-w-0">
                <ProgressBar message={busyMessage} />
              </div>
            )}

            {isDone && doneContent && <div className="min-w-0 w-full">{doneContent}</div>}

            {isDone && !doneContent && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                {doneMedia}
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">{doneTitle}</h3>
                  <p className="text-sm text-muted mt-1">{doneBody}</p>
                  {notice && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-left text-xs font-medium text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{notice}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl}
                    download={fileName ?? undefined}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>{downloadLabel}</span>
                  </a>
                  {canShare && resultBlob && (
                    <button
                      type="button"
                      onClick={() => void shareResult()}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold transition-colors hover:bg-surface-2 cursor-pointer"
                    >
                      <Share2 className="h-4 w-4" />
                      <span>Share</span>
                    </button>
                  )}
                  {doneActions}
                  <button
                    onClick={onReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Start over</span>
                  </button>
                </div>

                {/* Post-action chaining: the usual next step on the same file, without
                    re-importing it from disk. Only offered for PDF results and never for the
                    tool that just produced them. */}
                {resultBlob && (fileName ?? '').toLowerCase().endsWith('.pdf') && (
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs font-medium text-muted">Continue with this file</span>
                    {[
                      { label: 'Compress', target: '/compress' },
                      { label: 'Protect', target: '/protect' },
                      { label: 'Add page numbers', target: '/add-page-numbers' },
                    ]
                      .filter((option) => option.target !== (pathname ?? '').replace(/\/$/, ''))
                      .map((option) => (
                        <button
                          key={option.target}
                          type="button"
                          disabled={chainBusy === option.target}
                          onClick={() => void chainTo(option.target)}
                          className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-semibold transition-colors hover:border-accent/50 hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
                        >
                          {option.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-1">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">{errorTitle}</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {submitError || 'An unexpected error occurred during processing.'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2">
                  <button
                    onClick={retry}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent text-accent-foreground px-6 text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Try again</span>
                  </button>
                  <button
                    onClick={onReset}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <span>Choose another file</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Small helper pages use for the "Preview PDF" action in the success state. */
export function PreviewAction({ onClick, label = 'Preview PDF' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
    >
      <Eye className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}
