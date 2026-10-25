'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
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
  Cpu,
  Server,
  Crop,
  Maximize,
  RefreshCw,
  Presentation,
  Search
} from 'lucide-react'

interface Tool {
  name: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  type: 'client' | 'server'
}

type Category = 'pdf' | 'image' | 'office'

export default function ToolsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('pdf')
  const [query, setQuery] = useState('')

  const pdfTools: Tool[] = [
    {
      name: 'Merge PDF',
      description: 'Combine multiple PDF files into one document in seconds.',
      href: '/merge',
      icon: Layers,
      type: 'client',
    },
    {
      name: 'Split PDF',
      description: 'Extract specific page ranges or split every page into separate PDFs.',
      href: '/split',
      icon: Scissors,
      type: 'client',
    },
    {
      name: 'Compress PDF',
      description: 'Reduce PDF file size while maintaining maximum quality.',
      href: '/compress',
      icon: FileSpreadsheet,
      type: 'server',
    },
    {
      name: 'PDF to Images',
      description: 'Convert PDF pages into clean, high-quality PNG or JPG files.',
      href: '/pdf-to-images',
      icon: ImageIcon,
      type: 'server',
    },
    {
      name: 'Images to PDF',
      description: 'Convert JPG, PNG, and other images into a single PDF document.',
      href: '/images-to-pdf',
      icon: FileImage,
      type: 'server',
    },
    {
      name: 'Extract Text',
      description: 'Extract raw text content from your PDF documents instantly.',
      href: '/extract-text',
      icon: FileText,
      type: 'client',
    },
    {
      name: 'PDF to Word',
      description: 'Convert PDF pages to clean, editable DOCX files.',
      href: '/pdf-to-docx',
      icon: FileText,
      type: 'server',
    },
    {
      name: 'Word to PDF',
      description: 'Convert DOCX documents to high-quality PDF files.',
      href: '/docx-to-pdf',
      icon: File,
      type: 'server',
    },
    {
      name: 'Protect PDF',
      description: 'Add a password to encrypt and secure your PDF document.',
      href: '/protect',
      icon: Lock,
      type: 'server',
    },
    {
      name: 'Unlock PDF',
      description: 'Remove password protection and security restrictions from your PDF.',
      href: '/unlock',
      icon: Unlock,
      type: 'server',
    },
    {
      name: 'Rotate PDF',
      description: 'Rotate individual or all pages inside your PDF document.',
      href: '/rotate',
      icon: RotateCw,
      type: 'server',
    },
    {
      name: 'Organize PDF',
      description: 'Rearrange, delete, or reorder pages in your PDF document.',
      href: '/organize',
      icon: Grid,
      type: 'server',
    },
    {
      name: 'Watermark PDF',
      description: 'Add a text watermark overlay to every page in your PDF.',
      href: '/watermark',
      icon: Type,
      type: 'server',
    },
    {
      name: 'Add Page Numbers',
      description: 'Stamp dynamic page numbers onto your PDF headers or footers.',
      href: '/add-page-numbers',
      icon: Hash,
      type: 'server',
    },
    {
      name: 'OCR PDF',
      description: 'Convert scanned PDF documents into searchable text PDFs.',
      href: '/ocr',
      icon: Eye,
      type: 'server',
    },
  ]

  const imageTools: Tool[] = [
    {
      name: 'Compress Image',
      description: 'Reduce image file sizes for JPG, PNG, and WEBP with customizable quality levels.',
      href: '/compress-image',
      icon: FileSpreadsheet,
      type: 'server',
    },
    {
      name: 'Resize Image',
      description: 'Resize image dimensions by percentage or specific pixel dimensions.',
      href: '/resize-image',
      icon: Maximize,
      type: 'server',
    },
    {
      name: 'Crop Image',
      description: 'Crop and trim specific areas of your images interactively.',
      href: '/crop-image',
      icon: Crop,
      type: 'server',
    },
    {
      name: 'Convert Image',
      description: 'Convert images to PNG, JPG, WEBP, BMP, or TIFF formats.',
      href: '/convert-image',
      icon: RefreshCw,
      type: 'server',
    },
    {
      name: 'Rotate Image',
      description: 'Rotate images by 90, 180, or 270 degrees.',
      href: '/rotate-image',
      icon: RotateCw,
      type: 'server',
    },
    {
      name: 'Watermark Image',
      description: 'Add a custom text watermark overlay to your images.',
      href: '/watermark-image',
      icon: Type,
      type: 'server',
    },
  ]

  const officeTools: Tool[] = [
    {
      name: 'Merge Word',
      description: 'Combine multiple Word documents (.docx) into a single document.',
      href: '/merge-docx',
      icon: FileText,
      type: 'server',
    },
    {
      name: 'Word to Images',
      description: 'Convert your Word document pages into PNG or JPG image files.',
      href: '/docx-to-images',
      icon: ImageIcon,
      type: 'server',
    },
    {
      name: 'PPT to PDF',
      description: 'Convert PowerPoint presentations (.pptx) into high-quality PDF files.',
      href: '/pptx-to-pdf',
      icon: File,
      type: 'server',
    },
    {
      name: 'PPT to Images',
      description: 'Convert PowerPoint slides into clean PNG or JPG images.',
      href: '/pptx-to-images',
      icon: FileImage,
      type: 'server',
    },
    {
      name: 'Merge PPT',
      description: 'Combine multiple PowerPoint slide decks (.pptx) into a single presentation.',
      href: '/merge-pptx',
      icon: Layers,
      type: 'server',
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
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 md:py-16">
      {/* Title */}
      <section className="mb-8 md:mb-10">
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
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
        {displayedTools.length} {displayedTools.length === 1 ? 'tool' : 'tools'}
        {query.trim() ? (
          <>
            {' '}matching <span className="text-foreground">“{query.trim()}”</span>
          </>
        ) : (
          <> in {activeCategory}</>
        )}
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
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              {displayedTools.map((tool) => {
                const Icon = tool.icon
                return (
                  <motion.div key={tool.name} variants={itemVariants}>
                    <Link
                      href={tool.href}
                      className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg"
                    >
                      {/* Badge */}
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-foreground transition-colors duration-150 group-hover:border-accent/30 group-hover:text-accent">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            tool.type === 'client'
                              ? 'bg-success-subtle text-success'
                              : 'bg-surface-2 text-muted ring-1 ring-border'
                          }`}
                        >
                          {tool.type === 'client' ? (
                            <>
                              <Cpu className="h-3 w-3" />
                              <span>Local</span>
                            </>
                          ) : (
                            <>
                              <Server className="h-3 w-3" />
                              <span>Cloud secure</span>
                            </>
                          )}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="mt-auto">
                        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-foreground">
                          <span>{tool.name}</span>
                          <ArrowRight className="h-4 w-4 -translate-x-1 text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted">
                          {tool.description}
                        </p>
                      </div>
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
