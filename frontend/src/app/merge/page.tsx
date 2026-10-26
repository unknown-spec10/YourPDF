'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Layers, ArrowUp, ArrowDown, X, Download, RefreshCw, AlertTriangle, Plus, Eye, ZoomIn, FileText, ArrowLeftRight, ListOrdered, ArrowUpDown } from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { apiClient, submitJob, buildMultiFileFormData } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

type MergeArgs = { files: File[]; plan?: string }

const mergeSubmitter = ({ files, plan }: MergeArgs) =>
  submitJob('/api/merge', buildMultiFileFormData(files, plan ? { plan } : undefined))

type MergeMode = 'simple' | 'custom'

interface SequenceBlock {
  id: string
  fileKey: string
  pages: string
}

interface BlockValidation {
  valid: boolean
  count: number
  error: string | null
}

const FILE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

const fileColor = (index: number): string => FILE_COLORS[((index % FILE_COLORS.length) + FILE_COLORS.length) % FILE_COLORS.length]

/**
 * Mirror of backend `_parse_merge_pages_spec`: supports `all`,
 * comma-separated numbers, closed ranges (`1-3`) and open-ended
 * ranges (`3-` / `-3`). Returns resolved page count (duplicates
 * included, matching backend append semantics).
 */
function validateBlockPages(pages: string, total: number | undefined): BlockValidation {
  if (total === undefined) {
    return { valid: false, count: 0, error: 'Loading page count…' }
  }
  const s = pages.trim()
  if (!s) {
    return { valid: false, count: 0, error: 'Pages must not be empty.' }
  }
  if (s.toLowerCase() === 'all') {
    return { valid: true, count: total, error: null }
  }
  let count = 0
  let anyPart = false
  for (const rawPart of s.split(',')) {
    const part = rawPart.trim()
    if (!part) continue
    anyPart = true
    if (part.includes('-')) {
      if (part.split('-').length !== 2) {
        return { valid: false, count: 0, error: `Could not parse range '${part}'. Use 1-3, 5, 3- or all.` }
      }
      const dash = part.indexOf('-')
      const startStr = part.slice(0, dash).trim()
      const endStr = part.slice(dash + 1).trim()
      if (!startStr && !endStr) {
        return { valid: false, count: 0, error: `Could not parse range '${part}'. Use 1-3, 5, 3- or all.` }
      }
      const start = startStr === '' ? 1 : Number(startStr)
      const end = endStr === '' ? total : Number(endStr)
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        return { valid: false, count: 0, error: `Could not parse range '${part}'. Use numbers like 1-3.` }
      }
      if (start < 1 || end < 1) {
        return { valid: false, count: 0, error: `Page numbers in '${part}' must be >= 1.` }
      }
      if (start > end) {
        return { valid: false, count: 0, error: `Start page exceeds end page in '${part}'.` }
      }
      if (start > total || end > total) {
        return { valid: false, count: 0, error: `Range '${part}' is out of range (file has ${total} pages).` }
      }
      count += end - start + 1
    } else {
      const n = Number(part)
      if (!Number.isInteger(n)) {
        return { valid: false, count: 0, error: `Could not parse '${part}'. Use numbers like 1-3, 5.` }
      }
      if (n < 1) {
        return { valid: false, count: 0, error: `Page numbers must be >= 1 (got '${part}').` }
      }
      if (n > total) {
        return { valid: false, count: 0, error: `Page ${n} is out of range (file has ${total} pages).` }
      }
      count += 1
    }
  }
  if (!anyPart || count === 0) {
    return { valid: false, count: 0, error: 'No pages selected.' }
  }
  return { valid: true, count, error: null }
}

/** Expand a block spec into an ordered page list. Returns null when invalid. */
function expandBlockPages(pages: string, total: number | undefined): number[] | null {
  if (total === undefined) return null
  const s = pages.trim()
  if (!s) return null
  if (s.toLowerCase() === 'all') {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const out: number[] = []
  for (const rawPart of s.split(',')) {
    const part = rawPart.trim()
    if (!part) continue
    if (part.includes('-')) {
      if (part.split('-').length !== 2) return null
      const dash = part.indexOf('-')
      const startStr = part.slice(0, dash).trim()
      const endStr = part.slice(dash + 1).trim()
      if (!startStr && !endStr) return null
      const start = startStr === '' ? 1 : Number(startStr)
      const end = endStr === '' ? total : Number(endStr)
      if (!Number.isInteger(start) || !Number.isInteger(end)) return null
      if (start < 1 || end < 1 || start > end || start > total || end > total) return null
      for (let p = start; p <= end; p++) out.push(p)
    } else {
      const n = Number(part)
      if (!Number.isInteger(n) || n < 1 || n > total) return null
      out.push(n)
    }
  }
  return out.length > 0 ? out : null
}

interface ZoomTarget {
  fileUrl: string
  page: number
  title: string
  subtitle: string
}

export default function MergePage() {
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<MergeMode>('simple')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [fileKeys, setFileKeys] = useState<string[]>([])
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({})
  const [blocks, setBlocks] = useState<SequenceBlock[]>([])
  const [addFileKey, setAddFileKey] = useState<string>('')
  const [zoom, setZoom] = useState<ZoomTarget | null>(null)
  const keyCounter = useRef(0)
  const blockCounter = useRef(0)
  const urlsRef = useRef<Record<string, string>>({})
  urlsRef.current = fileUrls

  useEffect(() => {
    const snapshot = urlsRef.current
    return () => {
      Object.values(snapshot).forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* noop */
        }
      })
    }
  }, [])

  const {
    isSubmitting,
    isDone,
    isError,
    submitError,
    submit,
    reset,
    downloadUrl,
  } = useFileJob<MergeArgs>(mergeSubmitter)

  const fetchPageCount = (file: File, key: string) => {
    const formData = new FormData()
    formData.append('file', file)
    apiClient
      .post<{ num_pages: number }>('/api/pdf-info', formData)
      .then((res) => {
        const n = res.data?.num_pages
        if (typeof n === 'number' && n > 0) {
          setPageCounts((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: n }))
        }
      })
      .catch((err) => {
        console.error('Failed to get PDF info:', err)
      })
  }

  // Keep the "add block" selector pointed at a live file.
  useEffect(() => {
    if (fileKeys.length === 0) {
      setAddFileKey('')
    } else if (!fileKeys.includes(addFileKey)) {
      setAddFileKey(fileKeys[0])
    }
  }, [fileKeys, addFileKey])

  const handleFileAccepted = (file: File) => {
    const key = `file-${Date.now()}-${keyCounter.current++}`
    const url = URL.createObjectURL(file)
    setFiles((prev) => [...prev, file])
    setFileKeys((prev) => [...prev, key])
    setFileUrls((prev) => ({ ...prev, [key]: url }))
    setBlocks((prev) => [...prev, { id: `block-${Date.now()}-${blockCounter.current++}`, fileKey: key, pages: 'all' }])
    fetchPageCount(file, key)
  }

  const handleRemove = (index: number) => {
    const key = fileKeys[index]
    const url = key !== undefined ? fileUrls[key] : undefined
    if (url) {
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* noop */
      }
    }
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setFileKeys((prev) => prev.filter((_, i) => i !== index))
    if (key !== undefined) {
      setBlocks((prev) => prev.filter((b) => b.fileKey !== key))
      setFileUrls((prev) => {
        if (!(key in prev)) return prev
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
      setPageCounts((prev) => {
        if (!(key in prev)) return prev
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
    }
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setFiles((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index - 1]
      copy[index - 1] = temp
      return copy
    })
    setFileKeys((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index - 1]
      copy[index - 1] = temp
      return copy
    })
  }

  const handleMoveDown = (index: number) => {
    if (index === files.length - 1) return
    setFiles((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index + 1]
      copy[index + 1] = temp
      return copy
    })
    setFileKeys((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index + 1]
      copy[index + 1] = temp
      return copy
    })
  }

  const handleAddBlock = () => {
    const key = addFileKey || fileKeys[0]
    if (!key) return
    setBlocks((prev) => [...prev, { id: `block-${Date.now()}-${blockCounter.current++}`, fileKey: key, pages: 'all' }])
  }

  const handleBlockPagesChange = (id: string, pages: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, pages } : b)))
  }

  const handleBlockMoveUp = (index: number) => {
    if (index === 0) return
    setBlocks((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index - 1]
      copy[index - 1] = temp
      return copy
    })
  }

  const handleBlockMoveDown = (index: number) => {
    if (index === blocks.length - 1) return
    setBlocks((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index + 1]
      copy[index + 1] = temp
      return copy
    })
  }

  const handleBlockRemove = (id: string) => {
    const target = blocks.find((b) => b.id === id)
    if (!target) {
      setBlocks((prev) => prev.filter((b) => b.id !== id))
      return
    }
    const nextBlocks = blocks.filter((b) => b.id !== id)
    setBlocks(nextBlocks)
    // Dropping the last block of a file drops the file itself,
    // revoking its object URL just like removing the source file.
    const stillUsed = nextBlocks.some((b) => b.fileKey === target.fileKey)
    if (!stillUsed) {
      const fileIndex = fileKeys.indexOf(target.fileKey)
      if (fileIndex >= 0) {
        const key = fileKeys[fileIndex]
        const url = key !== undefined ? fileUrls[key] : undefined
        if (url) {
          try {
            URL.revokeObjectURL(url)
          } catch {
            /* noop */
          }
        }
        setFiles((prev) => prev.filter((_, i) => i !== fileIndex))
        setFileKeys((prev) => prev.filter((_, i) => i !== fileIndex))
        if (key !== undefined) {
          setFileUrls((prev) => {
            if (!(key in prev)) return prev
            const copy = { ...prev }
            delete copy[key]
            return copy
          })
          setPageCounts((prev) => {
            if (!(key in prev)) return prev
            const copy = { ...prev }
            delete copy[key]
            return copy
          })
        }
      }
    }
  }

  const makeBlock = (fileKey: string, pages: string): SequenceBlock => ({
    id: `block-${Date.now()}-${blockCounter.current++}`,
    fileKey,
    pages,
  })

  const handlePresetAppend = () => {
    setBlocks(fileKeys.map((key) => makeBlock(key, 'all')))
  }

  const handlePresetReverse = () => {
    setBlocks([...fileKeys].reverse().map((key) => makeBlock(key, 'all')))
  }

  const handlePresetInterleave = () => {
    if (fileKeys.length === 0) return
    const totals = fileKeys.map((key) => pageCounts[key] ?? 1)
    const maxPages = Math.max(...totals, 0)
    if (maxPages <= 0) {
      setBlocks(fileKeys.map((key) => makeBlock(key, 'all')))
      return
    }
    const next: SequenceBlock[] = []
    for (let p = 1; p <= maxPages; p++) {
      fileKeys.forEach((key, fi) => {
        const total = totals[fi] ?? 1
        if (p <= total) next.push(makeBlock(key, String(p)))
      })
    }
    setBlocks(next)
  }

  const fileIndexByKey = (key: string): number => fileKeys.indexOf(key)

  const blockDetails = blocks.map((block) => {
    const fileIndex = fileIndexByKey(block.fileKey)
    const file = fileIndex >= 0 ? files[fileIndex] : undefined
    const total = pageCounts[block.fileKey]
    const validation = validateBlockPages(block.pages, total)
    return { block, fileIndex, file, total, validation }
  })

  const countsLoading = blockDetails.some((d) => d.total === undefined)
  const hasInvalidBlock = blockDetails.some((d) => !d.validation.valid)
  const totalOutputPages = blockDetails.reduce((sum, d) => sum + (d.validation.valid ? d.validation.count : 0), 0)

  const outputTiles: Array<{ key: string; fileKey: string; fileIndex: number; page: number; resultIndex: number }> = []
  blockDetails.forEach((d) => {
    if (!d.validation.valid) return
    const pages = expandBlockPages(d.block.pages, d.total)
    if (!pages) return
    pages.forEach((page) => {
      outputTiles.push({
        key: `${d.block.id}-${page}-${outputTiles.length}`,
        fileKey: d.block.fileKey,
        fileIndex: d.fileIndex,
        page,
        resultIndex: outputTiles.length + 1,
      })
    })
  })
  const TILE_CAP = 24
  const visibleTiles = outputTiles.slice(0, TILE_CAP)
  const hiddenCount = Math.max(0, outputTiles.length - visibleTiles.length)

  const handleSubmit = async () => {
    if (files.length < 2) {
      alert('Please select at least 2 PDF files to merge.')
      return
    }
    if (mode === 'custom') {
      if (blocks.length === 0) {
        alert('Add at least one sequence block to merge.')
        return
      }
      if (countsLoading) {
        alert('Still reading page counts. Please wait a moment and try again.')
        return
      }
      const badIndex = blockDetails.findIndex((d) => !d.validation.valid || d.fileIndex < 0)
      if (badIndex >= 0) {
        alert(blockDetails[badIndex].validation.error ?? 'One or more page ranges are invalid.')
        return
      }
      const plan = blockDetails.map((d) => ({ file: d.fileIndex, pages: d.block.pages.trim() }))
      const ok = await submit({ files, plan: JSON.stringify(plan) })
      if (!ok) {
        alert('Failed to initialize merge task. Please check server connection.')
      }
      return
    }
    const ok = await submit({ files })
    if (!ok) {
      alert('Failed to initialize merge task. Please check server connection.')
    }
  }

  const handleReset = () => {
    Object.values(fileUrls).forEach((url) => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* noop */
      }
    })
    setFiles([])
    setFileKeys([])
    setFileUrls({})
    setPageCounts({})
    setBlocks([])
    setAddFileKey('')
    setZoom(null)
    reset()
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const dm = 2
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  const inProgress = isSubmitting || isDone || isError

  const modeToggle = (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <button
        type="button"
        onClick={() => setMode('simple')}
        className={`py-2 sm:py-3 px-3 sm:px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer text-center flex flex-col gap-0.5 sm:gap-1 ${
          mode === 'simple'
            ? 'bg-accent/10 border-accent text-accent'
            : 'border-border bg-surface hover:bg-background'
        }`}
      >
        <span className="font-bold">Simple Merge</span>
        <span className="text-xs text-muted font-normal">Append each file whole, in order</span>
      </button>
      <button
        type="button"
        onClick={() => setMode('custom')}
        className={`py-2 sm:py-3 px-3 sm:px-4 rounded-lg text-sm font-semibold border transition-all cursor-pointer text-center flex flex-col gap-0.5 sm:gap-1 ${
          mode === 'custom'
            ? 'bg-accent/10 border-accent text-accent'
            : 'border-border bg-surface hover:bg-background'
        }`}
      >
        <span className="font-bold">Custom Sequence</span>
        <span className="text-xs text-muted font-normal">Pick pages per file, in any order</span>
      </button>
    </div>
  )

  const openFileZoom = (index: number) => {
    const key = fileKeys[index]
    const url = key !== undefined ? fileUrls[key] : undefined
    if (!key || !url) return
    const total = pageCounts[key]
    setZoom({
      fileUrl: url,
      page: 1,
      title: files[index]?.name ?? `File ${index + 1}`,
      subtitle: total !== undefined ? `First page · ${total} pages total` : 'First page preview',
    })
  }

  const openTileZoom = (tile: { fileKey: string; fileIndex: number; page: number; resultIndex: number }) => {
    const url = fileUrls[tile.fileKey]
    if (!url) return
    const name = tile.fileIndex >= 0 ? files[tile.fileIndex]?.name : undefined
    setZoom({
      fileUrl: url,
      page: tile.page,
      title: `Output page ${tile.resultIndex} · source page ${tile.page}`,
      subtitle: name ?? 'Merged source file',
    })
  }

  const stepHeading = (step: string, title: string, hint: string) => (
    <div className="flex items-start justify-between gap-2 sm:gap-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-muted">{step}</span>
        <h2 className="text-[13px] sm:text-sm font-bold text-foreground">{title}</h2>
      </div>
      <p className="hidden sm:block text-xs text-muted text-right max-w-[240px] leading-relaxed">{hint}</p>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 sm:py-12 flex-1 flex flex-col justify-center">
      {/* Header */}
      <div className="mb-4 sm:mb-8">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3 sm:mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Layers className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Merge PDF</h1>
            <p className="text-muted mt-0.5 sm:mt-1 text-sm">Combine multiple PDF files into one document in seconds.</p>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-muted lg:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold">
            <span className="text-muted">01</span> Add files
          </span>
          <span className="text-muted">→</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold">
            <span className="text-muted">02</span> Arrange sequence
          </span>
          <span className="text-muted">→</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold">
            <span className="text-muted">03</span> Merge and download
          </span>
        </div>
      </div>

      {/* Main Box */}
      <div className="rounded-2xl border border-card-border bg-surface p-3 sm:p-6 md:p-8 relative overflow-visible sm:overflow-hidden lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:overflow-visible">
        <AnimatePresence mode="wait">
          {files.length === 0 && !isDone && !isError && !isSubmitting && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4 sm:gap-6 lg:items-center lg:py-12"
            >
              <div className="w-full lg:hidden">{modeToggle}</div>
              <div className="hidden lg:flex flex-col items-center text-center gap-2 max-w-xl">
                <h2 className="text-3xl font-bold tracking-tight">Merge PDFs into one file</h2>
                <p className="text-sm text-muted leading-relaxed">Mix and match whole files or individual pages. Drop your PDFs below, arrange the order visually, then merge and download.</p>
              </div>
              <div className="flex flex-col gap-2 sm:gap-3 w-full lg:max-w-xl">
                <div className="flex items-center gap-2 sm:gap-3 lg:hidden">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted">01</span>
                  <h2 className="text-sm font-bold text-foreground">Add files</h2>
                </div>
                <DropZone onFileAccepted={handleFileAccepted} />
                <p className="text-xs text-muted leading-relaxed text-center">
                  Add two or more PDFs to begin. You will arrange the order visually, then merge and download.
                </p>
              </div>
            </motion.div>
          )}

          {files.length > 0 && !isDone && !isError && !isSubmitting && (
            <motion.div
              key="file-list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4 sm:gap-6"
            >
              {/* Slim add bar — the picker collapses into a thin strip once files exist */}
              <div className="relative">
                <div className="lg:[&>div>div]:min-h-12 lg:[&>div>div]:flex-row lg:[&>div>div]:items-center lg:[&>div>div]:justify-center lg:[&>div>div]:gap-2 lg:[&>div>div]:p-3 lg:[&>div>div>div]:hidden lg:[&>div>div>h3]:hidden lg:[&>div>div>p]:hidden">
                  <DropZone
                    onFileAccepted={handleFileAccepted}
                    accept={{ 'application/pdf': ['.pdf'] }}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="pointer-events-none absolute inset-0 hidden items-center justify-center gap-2 lg:flex" aria-hidden="true">
                  <Plus className="h-4 w-4 text-muted" />
                  <span className="text-sm font-semibold text-muted">Add more PDFs</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-4 sm:gap-6 lg:items-start">
                {/* Stage 01 — Plan: mode toggle plus the sequence editor (single arrangement place) */}
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="flex min-w-0 flex-col gap-3 sm:gap-4"
              >
                {stepHeading(
                  '01',
                  'Plan',
                  mode === 'custom'
                    ? 'Arrange blocks below, then fine-tune page ranges.'
                    : 'Top entry merges first. Use the arrows to reorder.',
                )}
                {modeToggle}

                {mode === 'custom' && (
                <div className="flex flex-col gap-2.5 sm:gap-4 rounded-xl border border-border bg-background p-2.5 sm:p-4 lg:border-0 lg:bg-transparent lg:p-0">
                  <p className="text-xs text-muted leading-relaxed">
                    Each block pulls pages from one file, in order. Use <code className="bg-surface px-1 py-0.5 rounded text-accent font-semibold">all</code>, ranges like <code className="bg-surface px-1 py-0.5 rounded text-accent font-semibold">1-3, 5</code>, or open-ended <code className="bg-surface px-1 py-0.5 rounded text-accent font-semibold">3-</code>.
                  </p>

                  <div className="flex flex-col gap-2 sm:gap-3">
                    {blockDetails.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-center">
                        <p className="text-xs text-muted leading-relaxed">No blocks yet. Use a preset above or add a section below to build your sequence.</p>
                      </div>
                    )}
                    {blockDetails.map(({ block, file, fileIndex, total, validation }, blockIndex) => {
                      const invalid = !validation.valid
                      const url = fileUrls[block.fileKey]
                      const color = fileColor(fileIndex)
                      return (
                        <div
                          key={block.id}
                          className={`flex flex-col gap-2 rounded-xl border p-2.5 sm:p-3 bg-surface ${invalid ? 'border-danger' : 'border-border'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => fileIndex >= 0 && openFileZoom(fileIndex)}
                              title="Click to zoom first page"
                              className="group relative w-11 sm:w-12 shrink-0 aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden cursor-pointer"
                            >
                              {url ? (
                                <>
                                  <iframe
                                    loading="lazy"
                                    src={`${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                    className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                    title={`${file?.name ?? 'block'} first page`}
                                  />
                                  <span className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                    <span className="p-1.5 rounded-full bg-accent/90 text-accent-foreground shadow-lg">
                                      <ZoomIn className="h-3.5 w-3.5" />
                                    </span>
                                  </span>
                                </>
                              ) : (
                                <span className="w-full h-full flex items-center justify-center text-muted">
                                  <FileText className="h-5 w-5" />
                                </span>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <p className="text-sm font-semibold text-foreground truncate">
                                  <span className="text-muted font-normal mr-1">#{blockIndex + 1} ·</span>
                                  {file?.name ?? 'Removed file'}
                                </p>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">
                                  {total !== undefined ? `${total} pages` : 'Reading pages…'}
                                </span>
                                {file && <span className="text-xs text-muted">{formatBytes(file.size)}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-row items-center gap-1.5 sm:gap-2">
                            <input
                              type="text"
                              value={block.pages}
                              onChange={(e) => handleBlockPagesChange(block.id, e.target.value)}
                              placeholder="all, 1-3, 5"
                              aria-invalid={invalid}
                              className={`min-w-0 flex-1 h-9 px-2.5 rounded-lg border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm ${invalid ? 'border-danger' : 'border-border'}`}
                            />
                            <p className={`text-xs font-semibold shrink-0 ${invalid ? 'text-danger' : 'text-muted'}`}>
                              {validation.valid ? `${validation.count} pages` : 'Invalid'}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleBlockMoveUp(blockIndex)}
                                disabled={blockIndex === 0}
                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-background hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title="Move block up"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleBlockMoveDown(blockIndex)}
                                disabled={blockIndex === blocks.length - 1}
                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-background hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title="Move block down"
                              >
                                <ArrowDown className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleBlockRemove(block.id)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-danger hover:border-danger/40 hover:bg-danger-subtle transition-all cursor-pointer"
                                title="Remove block"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {invalid && (
                            <p className="text-xs text-danger leading-relaxed">{validation.error}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {files.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={addFileKey || fileKeys[0] || ''}
                        onChange={(e) => setAddFileKey(e.target.value)}
                        className="w-full sm:flex-1 h-10 px-3 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:border-accent transition-colors text-sm cursor-pointer"
                      >
                        {files.map((file, index) => (
                          <option key={fileKeys[index]} value={fileKeys[index]}>
                            {file.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleAddBlock}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add section</span>
                      </button>
                    </div>
                  )}

                  {!inProgress && mode === 'custom' && (hasInvalidBlock || countsLoading || blocks.length === 0) && (
                    <p className="text-xs text-muted leading-relaxed">
                      {countsLoading
                        ? 'Reading page counts before merge…'
                        : blocks.length === 0
                          ? 'Add at least one sequence block to merge.'
                          : 'Fix the highlighted page ranges before merging.'}
                    </p>
                  )}
                  </div>
                  )}
                  {mode === 'simple' && (
                    <div className="flex flex-col gap-2 sm:gap-3">
                      <p className="text-xs text-muted leading-relaxed">
                        Each file merges whole, in listed order. Use the arrows to reorder.
                      </p>
                      {files.map((file, index) => {
                        const key = fileKeys[index]
                        const url = key !== undefined ? fileUrls[key] : undefined
                        const total = key !== undefined ? pageCounts[key] : undefined
                        const color = fileColor(index)
                        return (
                          <div
                            key={`${key ?? index}-${file.name}-${index}`}
                            className="flex flex-col gap-2 rounded-xl border border-border p-2.5 sm:p-3 bg-surface"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => openFileZoom(index)}
                                title="Click to zoom first page"
                                className="group relative w-11 sm:w-12 shrink-0 aspect-[3/4] rounded-lg border border-card-border bg-background overflow-hidden cursor-pointer"
                              >
                                {url ? (
                                  <>
                                    <iframe
                                      loading="lazy"
                                      src={`${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                      className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                      title={`${file.name} first page`}
                                    />
                                    <span className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                      <span className="p-1.5 rounded-full bg-accent/90 text-accent-foreground shadow-lg">
                                        <ZoomIn className="h-3.5 w-3.5" />
                                      </span>
                                    </span>
                                  </>
                                ) : (
                                  <span className="w-full h-full flex items-center justify-center text-muted">
                                    <FileText className="h-5 w-5" />
                                  </span>
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    <span className="text-muted font-normal mr-1">#{index + 1} ·</span>
                                    {file.name}
                                  </p>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">
                                    {total !== undefined ? `${total} pages` : 'Reading pages…'}
                                  </span>
                                  <span className="text-xs text-muted">{formatBytes(file.size)}</span>
                                  <span className="text-xs font-semibold text-muted">Whole file · all pages</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleMoveUp(index)}
                                  disabled={index === 0}
                                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-background hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title="Move up"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleMoveDown(index)}
                                  disabled={index === files.length - 1}
                                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:bg-background hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title="Move down"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleRemove(index)}
                                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-danger hover:border-danger/40 hover:bg-danger-subtle transition-all cursor-pointer"
                                  title="Remove file"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {files.length < 2 && (
                        <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-center">
                          <p className="text-xs text-muted leading-relaxed">Add at least one more PDF to enable merging. Two or more files are required.</p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.section>

                {/* Stage 02 — Result: sticky rail with live output plus merge */}
                <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-6">
                  {stepHeading(
                    '02',
                    'Result',
                    mode === 'custom' && !countsLoading
                      ? `${totalOutputPages} pages planned`
                      : 'Output is a single combined PDF.',
                  )}
                  <div className="flex flex-col gap-3 sm:gap-4 rounded-xl border border-border bg-background p-3 sm:p-4 lg:bg-surface">
                    {mode === 'custom' && (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted mr-1">Presets</span>
                          <button
                            type="button"
                            onClick={handlePresetAppend}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            <ListOrdered className="h-3.5 w-3.5 text-accent" />
                            <span>Append files in order</span>
                          </button>
                          <button
                            type="button"
                            onClick={handlePresetInterleave}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5 text-accent" />
                            <span>Interleave pages</span>
                          </button>
                          <button
                            type="button"
                            onClick={handlePresetReverse}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            <ArrowUpDown className="h-3.5 w-3.5 text-accent" />
                            <span>Reverse file order</span>
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted">Live output</p>
                          <p className="text-xs font-semibold text-accent">
                            {countsLoading ? 'Reading…' : outputTiles.length > 0 ? `${outputTiles.length} pages` : 'No pages yet'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:gap-3 rounded-xl border border-card-border bg-surface p-3 sm:p-4 lg:border-0 lg:bg-transparent lg:p-0">
                    {outputTiles.length > 0 ? (
                      <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:grid-cols-2">
                        {visibleTiles.map((tile) => {
                          const url = fileUrls[tile.fileKey]
                          const color = fileColor(tile.fileIndex)
                          return (
                            <motion.div
                              key={tile.key}
                              layout
                              onClick={() => openTileZoom(tile)}
                              className="relative aspect-[3/4] w-24 sm:w-auto shrink-0 p-2 rounded-lg border border-border bg-background hover:border-accent hover:shadow-md flex flex-col justify-between items-center transition-all group cursor-pointer"
                            >
                              <div className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
                                Output {tile.resultIndex}
                              </div>
                              <div className="relative w-full flex-1 rounded border border-card-border bg-surface overflow-hidden mb-1.5 shadow-inner">
                                {url ? (
                                  <>
                                    <iframe
                                      loading="lazy"
                                      src={`${url}#page=${tile.page}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                      className="absolute -top-1 -right-[24px] w-[calc(100%+24px)] h-[calc(100%+4px)] border-0 pointer-events-none"
                                      title={`Output page ${tile.resultIndex}`}
                                    />
                                    <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                      <div className="p-2 rounded-full bg-accent/90 text-accent-foreground shadow-lg">
                                        <ZoomIn className="h-4 w-4" />
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">N/A</div>
                                )}
                              </div>
                              <div className="flex w-full items-center justify-between px-1 text-[9px] font-bold text-muted gap-1">
                                <span className="inline-flex items-center gap-1 min-w-0">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                  <span className="truncate">File {(tile.fileIndex ?? 0) + 1} · p{tile.page}</span>
                                </span>
                                <span className="shrink-0">Zoom</span>
                              </div>
                            </motion.div>
                          )
                        })}
                        {hiddenCount > 0 && (
                          <div className="relative aspect-[3/4] w-24 sm:w-auto shrink-0 p-2 rounded-lg border border-dashed border-border bg-background flex flex-col items-center justify-center text-center gap-1">
                            <p className="text-lg font-bold text-foreground">+{hiddenCount}</p>
                            <p className="text-[10px] font-semibold text-muted leading-snug px-2">more pages in the planned output</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center text-xs text-muted p-4 sm:p-6 gap-2">
                        <Layers className="h-8 w-8 text-muted/30" />
                        <span>{countsLoading ? 'Reading page counts to render the planned output…' : 'Fix block ranges above to preview the planned output here.'}</span>
                      </div>
                    )}
                        </div>
                      </>
                    )}

              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="flex flex-col gap-2 sm:gap-3 border-t border-border pt-3 sm:pt-4 pb-2 sticky bottom-2 z-10 bg-surface/95 backdrop-blur-sm rounded-xl px-3 lg:static lg:bg-transparent lg:backdrop-blur-none lg:rounded-none lg:px-0 lg:pb-0"
              >
                <button
                  onClick={handleSubmit}
                  disabled={
                    files.length < 2 ||
                    isSubmitting ||
                    (mode === 'custom' && (hasInvalidBlock || countsLoading || blocks.length === 0))
                  }
                  className="w-full h-11 sm:h-12 flex items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
                >
                  {isSubmitting
                    ? 'Initializing...'
                    : mode === 'custom'
                      ? `Merge sequence (${totalOutputPages} pages)`
                      : `Merge ${files.length} PDFs`}
                </button>
                {files.length < 2 && (
                  <p className="text-xs text-muted text-center leading-relaxed">Add at least 2 PDFs to enable the merge button.</p>
                )}
                </motion.section>
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
              className="flex flex-col items-center py-6 text-center"
            >
              {isSubmitting && (
                <div className="w-full max-w-md">
                  <ProgressBar
                    progress={50}
                    message="Merging PDF files..."
                  />
                </div>
              )}

              {isDone && downloadUrl && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-2">
                    <Download className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Merge Completed!</h3>
                    <p className="text-sm text-muted mt-1">Your combined PDF file is ready. Click below to download.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4 w-full justify-center items-stretch sm:items-center">
                    <a
                      href={downloadUrl ?? ''}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download PDF</span>
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
                      <span>Merge More Files</span>
                    </button>
                  </div>
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-2">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">Merge Failed</h3>
                    <p className="text-sm text-muted mt-1">{submitError || 'Failed to merge PDF files.'}</p>
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
          pdfUrl={downloadUrl ?? ''}
          fileName={files[0]?.name ? `${files[0].name.replace(/\.[^/.]+$/, "")}_merged.pdf` : "merged.pdf"}
        />
      )}

      {/* Click-to-zoom source page modal */}
      {zoom !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
          <div className="relative w-full max-w-4xl min-w-0 h-[85vh] max-h-[85vh] rounded-2xl border border-card-border bg-surface flex flex-col p-4 sm:p-6 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-4 gap-3 min-w-0">
              <div className="flex flex-col min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">{zoom.title}</h3>
                <p className="text-xs text-muted truncate">{zoom.subtitle}</p>
              </div>
              <button
                onClick={() => setZoom(null)}
                className="text-muted hover:text-foreground cursor-pointer transition-colors px-4 py-2 rounded-xl border border-border bg-background hover:bg-surface-2 text-sm font-semibold shrink-0"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0 w-full rounded-xl border border-card-border overflow-hidden bg-background">
              <iframe
                src={`${zoom.fileUrl}#page=${zoom.page}&toolbar=1&navpanes=0`}
                className="w-full h-full border-0"
                title={zoom.title}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
