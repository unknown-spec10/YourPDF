'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  FileCode, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  Copy, 
  Check, 
  Search, 
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Settings,
  Eye,
  Edit3
} from 'lucide-react'
import axios from 'axios'
import DropZone from '@/components/DropZone'
import FilePreview from '@/components/FilePreview'
import ProgressBar from '@/components/ProgressBar'
import { useJobPolling } from '@/hooks/useJobPolling'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// Supported mime types for React Dropzone
const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/html': ['.html', '.htm'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'text/xml': ['.xml'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
}

export default function MarkItDownPage() {
  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [markdownContent, setMarkdownContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Job Polling Hook
  const { data: jobStatus, error: pollError } = useJobPolling(jobId, (data) => {
    if (data.result?.markdown_content) {
      setMarkdownContent(data.result.markdown_content)
    }
  })

  // Cleanup on page exit
  useEffect(() => {
    return () => {
      setJobId(null)
      setMarkdownContent('')
    }
  }, [])

  const handleSubmit = async () => {
    if (!file) return
    setIsSubmitting(true)
    setMarkdownContent('')
    
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(`${API_URL}/api/convert-to-markdown`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(response.data.job_id)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.detail || 'Failed to initialize Markdown conversion. Please check server connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setJobId(null)
    setMarkdownContent('')
    setSearchQuery('')
    setIsEditing(false)
  }

  const handleCopy = () => {
    if (!markdownContent) return
    navigator.clipboard.writeText(markdownContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isQueued = jobStatus?.status === 'queued'
  const isProcessing = jobStatus?.status === 'processing'
  const isDone = jobStatus?.status === 'done'
  const isError = jobStatus?.status === 'error' || !!pollError

  // Word/char/element counts
  const wordCount = markdownContent ? markdownContent.split(/\s+/).filter(Boolean).length : 0
  const charCount = markdownContent ? markdownContent.length : 0
  const headingCount = markdownContent ? (markdownContent.match(/^#{1,6}\s/gm) || []).length : 0
  const linkCount = markdownContent ? (markdownContent.match(/\[.*?\]\(.*?\)/g) || []).length : 0

  // Quick info format badges
  const supportedBadges = [
    { label: 'PDF', icon: FileText, color: 'text-rose-500 bg-rose-500/10' },
    { label: 'Word', icon: FileText, color: 'text-blue-500 bg-blue-500/10' },
    { label: 'PowerPoint', icon: FileText, color: 'text-orange-500 bg-orange-500/10' },
    { label: 'Excel', icon: FileSpreadsheet, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'HTML', icon: FileCode, color: 'text-amber-500 bg-amber-500/10' },
    { label: 'Images', icon: ImageIcon, color: 'text-purple-500 bg-purple-500/10' },
    { label: 'Text/JSON/XML/CSV', icon: FileCode, color: 'text-indigo-500 bg-indigo-500/10' }
  ]

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 flex-1 flex flex-col justify-center">
      {/* Header */}
      <div className="mb-8">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
            <FileCode className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Convert to Markdown</h1>
            <p className="text-muted mt-1">Convert PDFs, Office documents, Images, HTML, and data files into clean Markdown.</p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="rounded-2xl border border-card-border bg-surface p-6 md:p-8 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {!file && !jobId && (
            <motion.div
              key="dropzone-area"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              {/* Badges list */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Supported file formats</h3>
                <div className="flex flex-wrap gap-2">
                  {supportedBadges.map((badge) => {
                    const Icon = badge.icon
                    return (
                      <div 
                        key={badge.label} 
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${badge.color}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{badge.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <DropZone 
                onFileAccepted={setFile} 
                accept={ACCEPTED_TYPES} 
                placeholderText="Drop any document or image here"
              />
            </motion.div>
          )}

          {file && !jobId && (
            <motion.div
              key="file-ready"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              <FilePreview fileName={file.name} fileSize={file.size} onRemove={handleReset} />

              <div className="border-t border-border pt-4">
                <div className="p-4 rounded-xl bg-background border border-border flex items-start gap-3">
                  <FileCode className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-muted leading-relaxed">
                    <p className="font-bold text-foreground mb-1">Microsoft MarkItDown Engine</p>
                    <p>We will automatically parse the layout, extract text contents, table columns, and structural blocks to format them into high-fidelity, readable Markdown (.md) syntax.</p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
              >
                {isSubmitting ? 'Initializing...' : 'Convert to Markdown'}
              </button>
            </motion.div>
          )}

          {jobId && (
            <motion.div
              key="progress-and-results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center py-2 text-center"
            >
              {/* Queued / Processing States */}
              {(isQueued || isProcessing) && (
                <div className="w-full max-w-md py-6">
                  <ProgressBar
                    progress={jobStatus?.progress || 0}
                    message={jobStatus?.message || 'Converting your file to Markdown...'}
                  />
                </div>
              )}

              {/* Success Result view */}
              {isDone && markdownContent !== undefined && (
                <div className="w-full text-left flex flex-col gap-4">
                  {/* Action Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <span>Markdown Content</span>
                        <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/10 px-2 py-0.5 rounded-full">
                          Converted Successfully
                        </span>
                      </h3>
                      <p className="text-xs text-muted mt-1">
                        {wordCount.toLocaleString()} words &bull; {charCount.toLocaleString()} chars &bull; {headingCount} headings &bull; {linkCount} links
                      </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Edit/View Toggle */}
                      <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer ${
                          isEditing
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'border-border hover:bg-background text-foreground'
                        }`}
                      >
                        {isEditing ? (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>Preview</span>
                          </>
                        ) : (
                          <>
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit Markdown</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleCopy}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-background transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-emerald-500 font-bold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-muted" />
                            <span>Copy Raw</span>
                          </>
                        )}
                      </button>

                      {jobStatus.result?.download_url && (
                        <a
                          href={
                            jobStatus.result.download_url.startsWith('http')
                              ? jobStatus.result.download_url
                              : `${API_URL}${jobStatus.result.download_url}`
                          }
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download .md</span>
                        </a>
                      )}

                      <button
                        onClick={handleReset}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-background transition-colors cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-muted" />
                        <span>Convert Another</span>
                      </button>
                    </div>
                  </div>

                  {/* Search bar inside output */}
                  {!isEditing && (
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search converted content..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                      />
                    </div>
                  )}

                  {/* Markdown Preview Area / Live Editor */}
                  <div className="relative rounded-xl border border-border bg-background overflow-hidden">
                    {isEditing ? (
                      <textarea
                        value={markdownContent}
                        onChange={(e) => setMarkdownContent(e.target.value)}
                        className="w-full h-96 p-5 font-mono text-sm leading-relaxed bg-transparent text-foreground resize-none border-none outline-none focus:ring-0 focus:outline-none selection:bg-accent/30"
                        placeholder="Edit Markdown contents here..."
                      />
                    ) : (
                      <pre className="w-full h-96 p-5 overflow-y-auto font-mono text-sm leading-relaxed text-foreground select-text whitespace-pre-wrap selection:bg-accent/30">
                        {searchQuery ? (
                          // Simple visual highlighting for searched text queries
                          (() => {
                            const parts = markdownContent.split(new RegExp(`(${searchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'))
                            return parts.map((part, i) => 
                              part.toLowerCase() === searchQuery.toLowerCase() ? (
                                <mark key={i} className="bg-yellow-500/30 text-yellow-200 border-b border-yellow-500 px-0.5 rounded-sm">{part}</mark>
                              ) : part
                            )
                          })()
                        ) : (
                          markdownContent || <span className="text-muted/50 italic">Empty file contents.</span>
                        )}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {/* Error view */}
              {isError && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Conversion Failed</h3>
                    <p className="text-sm text-muted mt-1">
                      {jobStatus?.message || 'An unexpected error occurred during MarkItDown conversion.'}
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
    </div>
  )
}
