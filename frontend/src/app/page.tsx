'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Grid,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Server,
  Sparkles,
  Zap,
  Lock,
  EyeOff
} from 'lucide-react'

export default function Home() {
  const categories = [
    {
      title: 'Organize & Edit',
      desc: 'Modify pages, order, and merge layout structures instantly.',
      features: ['Merge PDFs', 'Split Ranges', 'Organize Layout', 'Rotate Pages'],
      icon: Grid,
    },
    {
      title: 'Convert & OCR',
      desc: 'Fast, high-fidelity conversions and scanned doc digitization.',
      features: ['PDF to Images', 'Images to PDF', 'PDF to Word (Docx)', 'Scanned OCR PDF'],
      icon: Sparkles,
    },
    {
      title: 'Secure & Optimize',
      desc: 'Encrypt contents, strip passwords, or compress file weights.',
      features: ['AES-256 Encrypt', 'Unlock PDFs', 'Quality Compress', 'Watermark & Labels'],
      icon: Lock,
    }
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 md:py-24">
      {/* 1. Hero Section */}
      <section className="mb-20 flex flex-col items-center text-center md:mb-28">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-medium text-muted"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span>Privacy-first · Open source</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06 }}
          className="max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl"
        >
          Your PDF tools.
          <br />
          <span className="text-muted">Private by default.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.14 }}
          className="mt-5 max-w-xl text-base leading-relaxed text-muted md:text-lg"
        >
          No accounts. No trackers. Simple operations run locally in your browser. Heavy files delete from our servers in 60 seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
        >
          <Link
            href="/tools"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-6 text-sm font-semibold text-background shadow-md transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
          >
            <span>Get started — all tools</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-surface-2"
          >
            How it works
          </Link>
        </motion.div>
      </section>

      {/* 2. Categorized Features Showcase */}
      <section className="mb-20 md:mb-28">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-[28px]">
            Complete toolkit for every workflow
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
            Professional utilities grouped into focused, high-signal workflows.
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5"
        >
          {categories.map((cat) => {
            const Icon = cat.icon
            return (
              <motion.div
                key={cat.title}
                variants={itemVariants}
                className="group relative flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-foreground">
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h3 className="text-[16px] font-semibold tracking-tight text-foreground">{cat.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{cat.desc}</p>

                <ul className="mt-5 flex flex-col gap-2.5 border-t border-border pt-5">
                  {cat.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-[13px] font-medium text-muted">
                      <Zap className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )
          })}
        </motion.div>
      </section>

      {/* 3. How Privacy Works Section */}
      <section className="mb-16 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8 md:mb-24 md:p-12">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-[28px]">
            How privacy works
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Unlike commercial platforms that capture your documents, YourPDF handles processing in two secure, transparent modes depending on task weight.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 md:gap-5">
          {/* Client-Side Flow */}
          <div className="flex flex-col rounded-xl border border-border bg-background p-6">
            <div>
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-xs font-semibold text-success">
                <Cpu className="h-3.5 w-3.5" />
                <span>100% client-side processing</span>
              </div>
              <h3 className="text-[16px] font-semibold tracking-tight text-foreground">No upload required</h3>
              <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
                Merging, splitting, and text extraction run locally inside your browser tab using WebAssembly. Your files never touch a server.
              </p>
            </div>

            {/* Diagram */}
            <div className="mt-auto flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 text-center text-xs font-medium">
              <div className="w-full rounded-lg border border-border bg-surface-2 px-2 py-2.5">
                <span>Your file</span>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
              <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-success-subtle px-2 py-2.5 text-success">
                <Cpu className="h-4 w-4" />
                <span>Browser</span>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
              <div className="w-full rounded-lg border border-border bg-surface-2 px-2 py-2.5">
                <span>Download</span>
              </div>
            </div>
          </div>

          {/* Server-Side Flow */}
          <div className="flex flex-col rounded-xl border border-border bg-background p-6">
            <div>
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold text-accent">
                <Server className="h-3.5 w-3.5" />
                <span>Secure server-side processing</span>
              </div>
              <h3 className="text-[16px] font-semibold tracking-tight text-foreground">Isolated executions</h3>
              <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
                Complex compression and rasterization run on sandboxed cloud workers. Uploaded files are deleted from the disk instantly, and download links expire in 15 minutes.
              </p>
            </div>

            {/* Diagram */}
            <div className="mt-auto flex items-center justify-between gap-1.5 rounded-xl border border-border bg-surface p-3 text-center text-xs font-medium sm:gap-2">
              <div className="w-full rounded-lg border border-border bg-surface-2 px-1 py-2.5 sm:px-2">
                <span>File</span>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
              <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-subtle px-1 py-2.5 text-accent sm:px-2">
                <Server className="h-4 w-4" />
                <span>Worker</span>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
              <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger-subtle px-1 py-2.5 text-danger sm:px-2">
                <span>Auto-delete</span>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
              <div className="w-full rounded-lg border border-border bg-surface-2 px-1 py-2.5 sm:px-2">
                <span>Result</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Trust Signals Section */}
      <section className="grid grid-cols-1 gap-8 border-t border-border pt-12 text-left md:grid-cols-3 md:pt-16">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-foreground">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Open source</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Every line of code is open-source on GitHub. You can review, contribute, or run it locally yourself.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-foreground">
            <EyeOff className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">No account needed</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              No subscription or signups. Immediate, anonymous processing with zero cookies or tracking IDs.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-foreground">
            <Lock className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Zero data persistence</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              We collect nothing. Files processed server-side are permanently wiped from disks as soon as tasks exit.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
