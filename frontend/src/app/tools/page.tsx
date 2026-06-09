'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
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
  Server
} from 'lucide-react'

interface Tool {
  name: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  type: 'client' | 'server'
}

export default function ToolsPage() {
  const tools: Tool[] = [
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

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12 md:py-20 transition-all duration-200">
      <section className="mb-12">
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl md:text-5xl">
          All PDF Tools
        </h1>
        <p className="text-muted mt-2 text-base md:text-lg">
          Simple, fast, and privacy-first utilities for all your document operations.
        </p>
      </section>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <motion.div key={tool.name} variants={itemVariants}>
              <Link
                href={tool.href}
                className="flex flex-col h-full rounded-2xl border border-card-border bg-surface p-6 hover:border-accent hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 transition-all duration-200 group relative overflow-hidden"
              >
                {/* Processing Badge */}
                <div className="absolute top-6 right-6">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      tool.type === 'client'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-indigo-500/10 text-accent'
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
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors duration-200 group-hover:bg-accent group-hover:text-accent-foreground">
                  <Icon className="h-6 w-6" />
                </div>

                {/* Content */}
                <div className="mt-auto">
                  <h3 className="text-xl font-bold text-foreground group-hover:text-accent transition-colors duration-200 flex items-center gap-1">
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
    </div>
  )
}
