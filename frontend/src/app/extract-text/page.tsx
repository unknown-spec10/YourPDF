'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Settings, RefreshCw, Copy, Check, Search } from 'lucide-react'
import ToolShell from '@/components/tool/ToolShell'
import { useFileJob } from '@/hooks/useFileJob'
import { buildSingleFileFormData, submitJob } from '@/lib/api'

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

  const job = useFileJob<ExtractTextArgs>(extractTextSubmitter, {
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
    await job.submit({ file, export_txt: exportTxt })
  }

  const handleReset = () => {
    setFile(null)
    job.reset()
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

  return (
    <>
      <ToolShell
        icon={<FileText className="h-5 w-5" />}
        title="Extract Text"
        subtitle="Extract text content from PDF files and download as txt or view instantly."
        file={file}
        onFileAccepted={setFile}
        onReset={handleReset}
        onRetry={job.reset}
        fileMeta={exportTxt ? 'download as TXT' : 'view in browser'}
        job={job}
        onSubmit={handleSubmit}
        submitLabel="Extract Text"
        dropzoneHint="View text in the browser with word counts, or download it directly as a .txt file."
        busyMessage="Extracting PDF text content..."
        doneTitle="Text Extracted!"
        doneBody="Your extracted text file (.txt) is ready. Click below to download."
        downloadLabel="Download TXT File"
        errorTitle="Extraction Failed"
        settings={
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
        }
        preview={{
          title: '02 — Source preview',
          aside: 'page 1',
          children: (
            <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[52vh] lg:max-h-[68vh] overflow-y-auto overflow-x-hidden overscroll-contain">
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
          ),
        }}
      />

      {/* The shell's success card only covers the .txt download; extracted text is rendered here. */}
      {job.isDone && !exportTxt && extractedText && (
        <div className="mx-auto w-full max-w-[1400px] min-w-0 px-4 sm:px-6 pb-6 text-left">
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

      {job.isDone && !exportTxt && !extractedText && (
        <div className="mx-auto w-full max-w-xl min-w-0 px-4 sm:px-6 pb-6">
          <div className="w-full min-w-0 text-center flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-6">
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
        </div>
      )}
    </>
  )
}
