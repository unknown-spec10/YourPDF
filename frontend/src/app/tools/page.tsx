'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { stashFile } from '@/lib/handoff'
import {
  FileSpreadsheet,
  Scissors,
  Layers,
  Image as ImageIcon,
  FileImage,
  FileText,
  File,
  Lock,
  Unlock,
  RotateCw,
  Grid,
  Type,
  Hash,
  Eye,
  ArrowRight,
  Crop,
  Maximize,
  RefreshCw,
  Presentation,
  Search,
  PenLine
} from 'lucide-react'

interface Tool {
  name: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'organize' | 'convert' | 'security'
}

type Category = 'pdf' | 'image' | 'office'

const CATEGORY_LABEL: Record<Category, string> = { pdf: 'PDF', image: 'image', office: 'Office' }

export default function ToolsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('pdf')
  const [query, setQuery] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const router = useRouter()

  const pdfTools: Tool[] = [
    {
      name: 'Merge PDF',
      description: 'Combine multiple PDF files into one document in seconds.',
      href: '/merge',
    tone: 'organize',
      icon: Layers,
        },
    {
      name: 'Split PDF',
      description: 'Extract specific page ranges or split every page into separate PDFs.',
      href: '/split',
    tone: 'organize',
      icon: Scissors,
        },
    {
      name: 'Compress PDF',
      description: 'Reduce PDF file size while maintaining maximum quality.',
      href: '/compress',
    tone: 'convert',
      icon: FileSpreadsheet,
        },
    {
      name: 'PDF to Images',
      description: 'Convert PDF pages into clean, high-quality PNG or JPG files.',
      href: '/pdf-to-images',
    tone: 'convert',
      icon: ImageIcon,
        },
    {
      name: 'Images to PDF',
      description: 'Convert JPG, PNG, and other images into a single PDF document.',
      href: '/images-to-pdf',
    tone: 'convert',
      icon: FileImage,
        },
    {
      name: 'Extract Text',
      description: 'Extract raw text content from your PDF documents instantly.',
      href: '/extract-text',
    tone: 'convert',
      icon: FileText,
        },
    {
      name: 'PDF to Word',
      description: 'Convert PDF pages to clean, editable DOCX files.',
      href: '/pdf-to-docx',
    tone: 'convert',
      icon: FileText,
        },
    {
      name: 'Word to PDF',
      description: 'Convert DOCX documents to high-quality PDF files.',
      href: '/docx-to-pdf',
    tone: 'convert',
      icon: File,
        },
    {
      name: 'Protect PDF',
      description: 'Add a password to encrypt and secure your PDF document.',
      href: '/protect',
    tone: 'security',
      icon: Lock,
        },
    {
      name: 'Unlock PDF',
      description: 'Remove password protection and security restrictions from your PDF.',
      href: '/unlock',
    tone: 'security',
      icon: Unlock,
        },
    {
      name: 'Rotate PDF',
      description: 'Rotate individual or all pages inside your PDF document.',
      href: '/rotate',
    tone: 'organize',
      icon: RotateCw,
        },
    {
      name: 'Organize PDF',
      description: 'Rearrange, delete, or reorder pages in your PDF document.',
      href: '/organize',
    tone: 'organize',
      icon: Grid,
        },
    {
      name: 'Watermark PDF',
      description: 'Add a text watermark overlay to every page in your PDF.',
      href: '/watermark',
    tone: 'security',
      icon: Type,
        },
    {
      name: 'Add Page Numbers',
      description: 'Stamp dynamic page numbers onto your PDF headers or footers.',
      href: '/add-page-numbers',
    tone: 'organize',
      icon: Hash,
        },
    {
      name: 'OCR PDF',
      description: 'Convert scanned PDF documents into searchable text PDFs.',
      href: '/ocr',
    tone: 'convert',
      icon: Eye,
        },
    {
      name: 'Sign PDF',
      description: 'Draw, type, or upload a signature and stamp it onto your PDF.',
      href: '/sign',
    tone: 'security',
      icon: PenLine,
        },
  ]

  const imageTools: Tool[] = [
    {
      name: 'Compress Image',
      description: 'Reduce image file sizes for JPG, PNG, and WEBP with customizable quality levels.',
      href: '/compress-image',
    tone: 'convert',
      icon: FileSpreadsheet,
        },
    {
      name: 'Resize Image',
      description: 'Resize image dimensions by percentage or specific pixel dimensions.',
      href: '/resize-image',
    tone: 'convert',
      icon: Maximize,
        },
    {
      name: 'Crop Image',
      description: 'Crop and trim specific areas of your images interactively.',
      href: '/crop-image',
    tone: 'convert',
      icon: Crop,
        },
    {
      name: 'Convert Image',
      description: 'Convert images to PNG, JPG, WEBP, BMP, or TIFF formats.',
      href: '/convert-image',
    tone: 'convert',
      icon: RefreshCw,
        },
    {
      name: 'Rotate Image',
      description: 'Rotate images by 90, 180, or 270 degrees.',
      href: '/rotate-image',
    tone: 'organize',
      icon: RotateCw,
        },
    {
      name: 'Watermark Image',
      description: 'Add a custom text watermark overlay to your images.',
      href: '/watermark-image',
    tone: 'security',
      icon: Type,
        },
  ]

  const officeTools: Tool[] = [
    {
      name: 'Merge Word',
      description: 'Combine multiple Word documents (.docx) into a single document.',
      href: '/merge-docx',
    tone: 'organize',
      icon: FileText,
        },
    {
      name: 'Word to Images',
      description: 'Convert your Word document pages into PNG or JPG image files.',
      href: '/docx-to-images',
    tone: 'convert',
      icon: ImageIcon,
        },
    {
      name: 'PPT to PDF',
      description: 'Convert PowerPoint presentations (.pptx) into high-quality PDF files.',
      href: '/pptx-to-pdf',
    tone: 'convert',
      icon: File,
        },
    {
      name: 'PPT to Images',
      description: 'Convert PowerPoint slides into clean PNG or JPG images.',
      href: '/pptx-to-images',
    tone: 'convert',
      icon: FileImage,
        },
    {
      name: 'Merge PPT',
      description: 'Combine multiple PowerPoint slide decks (.pptx) into a single presentation.',
      href: '/merge-pptx',
    tone: 'organize',
      icon: Layers,
        },
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  }

  const categories: { id: Category; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pdf', label: 'PDF', icon: File },
    { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'office', label: 'Office', icon: Presentation },
  ]

  const allTools = useMemo(
    () => ({ pdf: pdfTools, image: imageTools, office: officeTools }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const displayedTools = useMemo(() => {
    const base = allTools[activeCategory]
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    )
  }, [allTools, activeCategory, query])

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6 md:py-12">
      {/* Title */}
      <section className="mb-6 md:mb-7">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl"
        >
          All tools
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted"
        >
          Fast, private utilities for documents and images. Filter by suite or search by name.
        </motion.p>
      </section>

      {/* Controls: tabs + search */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1 sm:w-fit" role="tablist" aria-label="Tool categories">
          {categories.map((cat) => {
            const Icon = cat.icon
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(cat.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer sm:flex-none ${
                  isActive ? 'text-foreground' : 'text-muted hover:text-foreground'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeCategoryPill"
                    className="absolute inset-0 rounded-lg bg-surface-2 ring-1 ring-border"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {cat.label}
                </span>
              </button>
            )
          })}
        </div>

        <label className="relative block w-full md:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${activeCategory} tools…`}
            aria-label="Search tools"
            className="h-10 w-full rounded-lg border border-border bg-surface pr-3 pl-10 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </label>
      </div>

      {/* Result count */}
      <p className="mb-4 text-[13px] font-medium text-muted" aria-live="polite">
        {displayedTools.length} {CATEGORY_LABEL[activeCategory]} {displayedTools.length === 1 ? 'tool' : 'tools'}
        {query.trim() ? (
          <>
            {' '}matching <span className="text-foreground">“{query.trim()}”</span>
          </>
        ) : null}
      </p>

      {/* Grid of Tools with Animated Transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          {displayedTools.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
              <p className="text-[15px] font-semibold text-foreground">No tools found</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Nothing in {activeCategory} matches “{query.trim()}”. Try a different keyword or browse another suite.
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-5 inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {displayedTools.map((tool) => {
                const Icon = tool.icon
                return (
                  <motion.div key={tool.name} variants={itemVariants}>
                    <Link
                      href={tool.href}
                      // Drop a file straight on the card: it is stashed in IndexedDB and picked up
                      // by the destination page, so the user skips the empty upload state.
                      onDragOver={(event) => {
                        if (!event.dataTransfer.types.includes('Files')) return
                        event.preventDefault()
                        setDropTarget(tool.href)
                      }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={async (event) => {
                        const dropped = event.dataTransfer.files?.[0]
                        if (!dropped) return
                        event.preventDefault()
                        setDropTarget(null)
                        await stashFile(tool.href, dropped)
                        router.push(tool.href)
                      }}
                      className={`group flex h-full flex-col rounded-2xl border bg-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent-signal)] hover:shadow-lg ${
                        dropTarget === tool.href
                          ? 'border-[var(--accent-signal)] ring-2 ring-ring'
                          : 'border-border'
                      }`}
                    >
                      {/* Icon and name share a line: the stacked version made every card ~45px
                          taller, which pushed the fourth row below the fold at 1440x900. */}
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150 tone-${tool.tone}`}>
                          <Icon className="h-[18px] w-[18px]" />
                        </div>
                        <h3 className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold tracking-tight text-foreground">
                          <span className="truncate">{tool.name}</span>
                          <ArrowRight className="card-arrow h-3.5 w-3.5 shrink-0 -translate-x-1 text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none" />
                        </h3>
                      </div>

                      <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-muted">
                        {tool.description}
                      </p>
                    </Link>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
