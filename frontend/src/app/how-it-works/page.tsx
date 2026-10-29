'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ShieldCheck, Server, Cpu, Trash2, Clock, Lock, EyeOff } from 'lucide-react'

export default function HowItWorksPage() {
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
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-6 md:py-16">
      {/* Header */}
      <div className="mb-10">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to home</span>
        </Link>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl"
        >
          Privacy framework &amp; technology
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted md:text-base"
        >
          YourPDF is designed from the ground up to respect your privacy and data security.
        </motion.p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4 md:gap-5"
      >
        {/* Core Principles */}
        <motion.section variants={itemVariants} className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-subtle text-success">
              <Cpu className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="mt-4">
              <h3 className="text-[16px] font-semibold tracking-tight text-foreground">1. Server-side processing</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Every tool — from merging and splitting to text extraction — runs on our servers. Your browser simply uploads the file and downloads the finished result; no PDF work happens on your device.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-subtle text-accent">
              <Server className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="mt-4">
              <h3 className="text-[16px] font-semibold tracking-tight text-foreground">2. Ephemeral server tasks</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                For heavy tasks (like compression and image rasterization), we use sandbox environments to execute operations. Files are processed in an ephemeral temp space and hard-deleted immediately after the task completes (best-effort, on every request).
              </p>
            </div>
          </div>
        </motion.section>

        {/* Deep Dive Architecture */}
        <motion.section variants={itemVariants} className="rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground md:text-xl">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <span>Server-side ephemeral processing</span>
          </h2>

          <div className="mt-5 flex flex-col gap-5 text-sm leading-relaxed text-muted">
            <p>
              All processing runs server-side. Each upload is handled synchronously in an ephemeral temp space, and the processed file bytes are returned directly in the response:
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  <Lock className="h-4 w-4 text-accent" />
                  <span>Direct file responses</span>
                </div>
                <span className="mt-2 block text-[13px] leading-relaxed">The processed file bytes come back directly in the response and are saved as a download — no queue, no polling, no expiring link.</span>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  <EyeOff className="h-4 w-4 text-accent" />
                  <span>Ephemeral outputs</span>
                </div>
                <span className="mt-2 block text-[13px] leading-relaxed">Uploads and outputs live only in an ephemeral temp directory for the duration of the request.</span>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  <Trash2 className="h-4 w-4 text-danger" />
                  <span>Auto-cleanup</span>
                </div>
                <span className="mt-2 block text-[13px] leading-relaxed">Temporary files are hard-deleted the moment the task finishes — not on a timer, with no background cleaner.</span>
              </div>
            </div>

            <p>
              Because everything runs server-side in short-lived tasks that clean up after themselves, large files are processed efficiently without sacrificing privacy. All code is open-source, allowing you to run it locally on your computer using Docker.
            </p>
          </div>
        </motion.section>

        {/* Flow Diagram */}
        <motion.section variants={itemVariants} className="flex flex-col gap-4">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Data lifecycle</h3>
          <div className="flex flex-col items-stretch gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm md:flex-row md:items-center md:p-5">
            <div className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-border bg-background p-4 text-center">
              <Clock className="h-4 w-4 text-muted" />
              <span className="text-[13px] font-semibold text-foreground">User upload</span>
              <span className="text-xs leading-relaxed text-muted">File is uploaded via SSL directly to the backend.</span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 rotate-90 self-center text-muted md:rotate-0" />
            <div className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-border bg-background p-4 text-center">
              <Server className="h-4 w-4 text-muted" />
              <span className="text-[13px] font-semibold text-foreground">Server task</span>
              <span className="text-xs leading-relaxed text-muted">Request is handled synchronously, converting/compressing the file.</span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 rotate-90 self-center text-muted md:rotate-0" />
            <div className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-border bg-background p-4 text-center">
              <Trash2 className="h-4 w-4 text-muted" />
              <span className="text-[13px] font-semibold text-foreground">Immediate cleanup</span>
              <span className="text-xs leading-relaxed text-muted">Original and temp files are deleted from backend disk immediately.</span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 rotate-90 self-center text-muted md:rotate-0" />
            <div className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-border bg-background p-4 text-center">
              <Clock className="h-4 w-4 text-muted" />
              <span className="text-[13px] font-semibold text-foreground">Direct download</span>
              <span className="text-xs leading-relaxed text-muted">File bytes return in the response; the browser builds the download.</span>
            </div>
          </div>
        </motion.section>

        {/* Call to Action */}
        <motion.section variants={itemVariants} className="pt-6 text-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-6 text-sm font-semibold text-background shadow-md transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
          >
            Start processing PDFs
          </Link>
        </motion.section>
      </motion.div>
    </div>
  )
}
