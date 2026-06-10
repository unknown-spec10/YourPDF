'use client'

import { useState } from 'react'
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
  Presentation
} from 'lucide-react'

interface Tool {
  name: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  type: 'client' | 'server'
}

export default function ToolsPage() {
  const [activeCategory, setActiveCategory] = useState<'pdf' | 'image' | 'office'>('pdf')

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
        staggerChildren: 0.05,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100 } },
  }

  const themeMap = {
    pdf: {
      accent: 'text-indigo-500 bg-indigo-500/10 group-hover:bg-indigo-500 group-hover:text-white shadow-sm',
      border: 'hover:border-indigo-500/40 hover:shadow-[0_0_25px_-5px_rgba(99,102,241,0.22)]',
      badge: 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/10',
      activeText: 'text-indigo-500',
      activeBar: 'bg-indigo-500'
    },
    image: {
      accent: 'text-emerald-500 bg-emerald-500/10 group-hover:bg-emerald-500 group-hover:text-white shadow-sm',
      border: 'hover:border-emerald-500/40 hover:shadow-[0_0_25px_-5px_rgba(16,185,129,0.22)]',
      badge: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/10',
      activeText: 'text-emerald-500',
      activeBar: 'bg-emerald-500'
    },
    office: {
      accent: 'text-amber-500 bg-amber-500/10 group-hover:bg-amber-500 group-hover:text-white shadow-sm',
      border: 'hover:border-amber-500/40 hover:shadow-[0_0_25px_-5px_rgba(245,158,11,0.22)]',
      badge: 'bg-amber-500/10 text-amber-500 border border-amber-500/10',
      activeText: 'text-amber-500',
      activeBar: 'bg-amber-500'
    }
  }

  const currentTheme = themeMap[activeCategory]
  const displayedTools = 
    activeCategory === 'pdf' 
      ? pdfTools 
      : activeCategory === 'image' 
      ? imageTools 
      : officeTools

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12 md:py-20 transition-all duration-200">
      {/* Title */}
      <section className="mb-12">
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl md:text-5xl">
          All Workspace Utilities
        </h1>
        <p className="text-muted mt-2 text-base md:text-lg">
          Simple, fast, and privacy-first utilities for all your document and image operations.
        </p>
      </section>

      {/* Tabs Selector */}
      <div className="flex border-b border-border/40 gap-8 mb-12 relative overflow-x-auto whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveCategory('pdf')}
          className={`pb-4 text-lg font-bold transition-all relative cursor-pointer select-none outline-none ${
            activeCategory === 'pdf' ? 'text-indigo-500' : 'text-muted hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-2">
            <File className="h-5 w-5" />
            PDF Utilities
          </span>
          {activeCategory === 'pdf' && (
            <motion.div
              layoutId="activeCategoryTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('image')}
          className={`pb-4 text-lg font-bold transition-all relative cursor-pointer select-none outline-none ${
            activeCategory === 'image' ? 'text-emerald-500' : 'text-muted hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Image Utilities
          </span>
          {activeCategory === 'image' && (
            <motion.div
              layoutId="activeCategoryTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('office')}
          className={`pb-4 text-lg font-bold transition-all relative cursor-pointer select-none outline-none ${
            activeCategory === 'office' ? 'text-amber-500' : 'text-muted hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-2">
            <Presentation className="h-5 w-5" />
            Office Utilities
          </span>
          {activeCategory === 'office' && (
            <motion.div
              layoutId="activeCategoryTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
        </button>
      </div>

      {/* Grid of Tools with Animated Transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, x: activeCategory === 'pdf' ? -15 : activeCategory === 'image' ? 0 : 15 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: activeCategory === 'pdf' ? 15 : activeCategory === 'image' ? 0 : -15 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
        >
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {displayedTools.map((tool) => {
              const Icon = tool.icon
              return (
                <motion.div key={tool.name} variants={itemVariants}>
                  <Link
                    href={tool.href}
                    className={`flex flex-col h-full rounded-2xl border border-card-border/60 bg-surface/35 backdrop-blur-md p-6 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden ${currentTheme.border}`}
                  >
                    {/* Processing Badge */}
                    <div className="absolute top-6 right-6">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          tool.type === 'client'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : currentTheme.badge
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
                            <span>Cloud Secure</span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Icon */}
                    <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-200 ${currentTheme.accent}`}>
                      <Icon className="h-6 w-6" />
                    </div>

                    {/* Content */}
                    <div className="mt-auto">
                      <h3 className={`text-xl font-bold text-foreground transition-colors duration-200 flex items-center gap-1 group-hover:${currentTheme.activeText}`}>
                        <span>{tool.name}</span>
                        <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
                      </h3>
                      <p className="text-muted mt-2 text-sm leading-relaxed">
                        {tool.description}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
