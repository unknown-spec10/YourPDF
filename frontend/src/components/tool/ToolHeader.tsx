'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface ToolHeaderProps {
  /** The tool's lucide icon, e.g. `<FileSpreadsheet className="h-5 w-5" />`. */
  icon: ReactNode
  title: string
  subtitle: string
}

/**
 * The back link + icon + title + subtitle block that every tool page renders.
 *
 * It was copied verbatim into 24 pages; the copies drifted (different icon sizes, one page
 * without the back link). Keeping it here means a change to the page chrome is one edit.
 */
export default function ToolHeader({ icon, title, subtitle }: ToolHeaderProps) {
  return (
    <div className="mb-5 sm:mb-7 min-w-0">
      <Link
        href="/tools"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to all tools</span>
      </Link>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted mt-0.5">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}
