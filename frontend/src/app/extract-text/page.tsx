'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileText, Settings, Download, RefreshCw, AlertTriangle, Copy, Check, Search, X, Repeat } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { submitJob, buildSingleFileFormData } from '@/lib/api'

type ExtractTextArgs = { file: File; export_txt: boolean }

const extractTextSubmitter = ({ file, export_txt }: ExtractTextArgs) =>
  submitJob('/api/extract-text', buildSingleFileFormData(file, { export_txt }))

export default function ExtractTextPage() {
  const [file, setFile] = useState<File | null>(null)
  const [exportTxt, setExportTxt] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  // Text display states
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [extractedText, setExtractedText] = useState('')

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

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<ExtractTextArgs>(extractTextSubmitter, {
    onDone: (result) => {
      const text = result.text ?? result.extracted_text
      if (typeof text === 'string' && text) {
        setExtractedText(text)
      }
    },
  })

  const handleSubmit = async () => {
    if (!file) return
    setExtractedText('')
    const ok = await submit({ file, export_txt: exportTxt })
    if (!ok) {
      alert('Failed to initialize text extraction. Please check server connection.')
    }
  }

  const handleReset = () => {
    setFile(null)
    reset()
    setExtractedText('')
    setSearchQuery('')
  }

  const handleCopy = () => {
    if (!extractedText) return
    navigator.clipboard.writeText(extractedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Highlight matches in the extracted text (simple search display)
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const searchLower = searchQuery.toLowerCase()
  const matchCount =
    searchQuery && extractedText
      ? extractedText.toLowerCase().split(searchLower).length - 1
      : 0

  const renderHighlightedText = () => {
    if (!searchQuery || !extractedText) return extractedText
    const parts = extractedText.split(new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === searchLower ? (
        <mark key={i} className="bg-accent/30 text-foreground rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    )
  }

  const wordCount = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0
  const charCount = extractedText ? extractedText.length : 0
  const isWorkspace = file && !isDone && !isError && !isSubmitting

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
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Extract Text</h1>
            <p className="text-sm text-muted mt-0.5">Extract text content from PDF files and download as txt or view instantly.</p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!file && !isDone && !isError && !isSubmitting && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 min-w-0"
          >
            <DropZone onFileAccepted={setFile} />
            <p className="text-center text-xs text-muted">
              View text in the browser with word counts, or download it directly as a .txt file.
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
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {exportTxt ? 'download as TXT' : 'view in browser'}
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
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    <span>01 — Extraction settings</span>
                  </button>

                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2.5 flex flex-col gap-2.5"
                    >
                      <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                        <button
                          type="button"
                          onClick={() => setExportTxt(false)}
                          className={`px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                            !exportTxt
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          <span className="block text-[13px] font-semibold">View in Browser</span>
                          <span className="block text-xs text-muted font-normal mt-0.5">Read & copy text directly</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportTxt(true)}
                          className={`px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                            exportTxt
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          <span className="block text-[13px] font-semibold">Download as TXT</span>
                          <span className="block text-xs text-muted font-normal mt-0.5">Save text as a .txt file</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="sticky bottom-3 lg:static">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {isSubmitting ? 'Initializing...' : 'Extract Text'}
                  </button>
                </div>
              </div>

              {/* Preview — the one card */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">02 — Source preview</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">page 1</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden">
                    <div className="relative mx-auto w-full max-w-[560px] aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden">
                      {fileUrl ? (
                        <iframe
                          loading="lazy"
                          src={`${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                          className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                          title="Source PDF first page"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">Reading document…</div>
                      )}
                    </div>
                    <p className="mt-2.5 text-center text-xs text-muted">
                      {exportTxt ? 'Output downloads as a .txt file.' : 'Output renders as searchable text after extraction.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {(isSubmitting || isDone || isError) && (
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
                  message="Extracting PDF text content..."
                />
              </div>
            )}

            {isDone && exportTxt && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Text Extracted!</h3>
                  <p className="text-sm text-muted mt-1">
                    Your extracted text file (.txt) is ready. Click below to download.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download TXT File</span>
                  </a>
                  <button
                    onClick={handleReset}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Extract More</span>
                  </button>
                </div>
              </div>
            )}

            {isDone && !exportTxt && extractedText && (
              <div className="w-full max-w-[1400px] min-w-0 text-left flex flex-col gap-3">
                <div className="min-w-0 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-semibold truncate">Extracted Content</h3>
                      <p className="text-[11px] font-mono tabular-nums text-muted mt-0.5">
                        {wordCount.toLocaleString()} words &bull; {charCount.toLocaleString()} characters
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-success" />
                            <span className="text-success">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-muted" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleReset}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-muted" />
                        <span className="hidden sm:inline">Extract Another</span>
                        <span className="sm:hidden">New</span>
                      </button>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 flex flex-col gap-3">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search within extracted text..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                      />
                    </div>
                    {searchQuery && (
                      <p className="text-xs text-muted" aria-live="polite">
                        {matchCount > 0
                          ? `${matchCount.toLocaleString()} ${matchCount === 1 ? 'match' : 'matches'} for “${searchQuery}”`
                          : `No matches for “${searchQuery}”`}
                      </p>
                    )}
                    <div className="rounded-lg border border-border bg-background p-4 h-96 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap break-words select-text selection:bg-accent/30">
                      {renderHighlightedText()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isDone && !exportTxt && !extractedText && (
              <div className="w-full max-w-xl min-w-0 text-center flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-6">
                <p className="text-sm font-semibold">No text found</p>
                <p className="text-xs text-muted leading-relaxed max-w-[40ch]">
                  This PDF has no selectable text (it may be scanned images). Try OCR to make it searchable, or try another file.
                </p>
                <button
                  onClick={handleReset}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4 text-muted" />
                  <span>Try Another File</span>
                </button>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-1">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Extraction Failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {submitError || 'An unexpected error occurred during processing.'}
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
    </div>
  )
}
