'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, ShieldCheck, Server, Cpu, Trash2, Clock, CheckCircle2, Lock, EyeOff } from 'lucide-react'

export default function HowItWorksPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100 } },
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 md:py-20 flex-1 flex flex-col justify-center">
      {/* Header */}
      <div className="mb-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to home</span>
        </Link>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
          Privacy Framework &amp; Technology
        </h1>
        <p className="text-muted mt-2 text-lg">
          YourPDF is designed from the ground up to respect your privacy and data security.
        </p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-12"
      >
        {/* Core Principles */}
        <motion.section variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-card-border bg-surface p-6 flex flex-col gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">1. Local Processing</h3>
              <p className="text-muted text-sm mt-2 leading-relaxed">
                Many tools (like merging, splitting, and text extraction) can be calculated on your own device. We implement local processing routines to perform these operations directly inside your browser. No files are uploaded to any server.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-card-border bg-surface p-6 flex flex-col gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">2. Ephemeral Server Tasks</h3>
              <p className="text-muted text-sm mt-2 leading-relaxed">
                For heavy tasks (like compression and image rasterization), we use sandbox environments to execute operations. Files are stored temporarily inside a secure, write-only directory and are hard-deleted automatically within 15 minutes.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Deep Dive Architecture */}
        <motion.section variants={itemVariants} className="rounded-2xl border border-card-border bg-surface p-6 md:p-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-accent" />
            <span>Hybrid Storage &amp; Fallback Architecture</span>
          </h2>
          
          <div className="flex flex-col gap-6 text-muted text-sm leading-relaxed">
            <p>
              YourPDF supports a hybrid storage model that adapts to deployment configurations. The system is engineered to function both in cloud environments and fully locally:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-2">
              <div className="border border-border rounded-xl p-4 bg-background flex flex-col gap-2">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-accent" />
                  <span>S3 Secure Storage</span>
                </div>
                <span>If AWS S3 is configured, output links are generated as presigned URLs expiring in 15 minutes.</span>
              </div>
              
              <div className="border border-border rounded-xl p-4 bg-background flex flex-col gap-2">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <EyeOff className="h-4 w-4 text-accent" />
                  <span>Local Host Fallback</span>
                </div>
                <span>If S3 keys are absent, processed files are stored on the local host in a dedicated output folder.</span>
              </div>

              <div className="border border-border rounded-xl p-4 bg-background flex flex-col gap-2">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Trash2 className="h-4 w-4 text-rose-500" />
                  <span>Auto-Cleanup</span>
                </div>
                <span>An active Celery task polls every minute to delete temporary files that are older than 15 minutes.</span>
              </div>
            </div>
            
            <p>
              By dividing tasks between your browser and ephemeral workers, we ensure large files are processed efficiently without sacrificing privacy. All code is open-source, allowing you to run it locally on your computer using Docker.
            </p>
          </div>
        </motion.section>

        {/* Flow Diagram */}
        <motion.section variants={itemVariants} className="flex flex-col gap-4">
          <h3 className="text-lg font-bold">Data Lifecycle Diagram</h3>
          <div className="rounded-2xl border border-card-border bg-surface/50 p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col items-center gap-2 p-4 bg-background border border-border rounded-xl w-full text-center">
              <span className="text-xl">📤</span>
              <span className="font-bold text-sm text-foreground">User Upload</span>
              <span className="text-xs text-muted">File is uploaded via SSL directly to the backend.</span>
            </div>
            <span className="text-xl rotate-90 md:rotate-0">➡️</span>
            <div className="flex flex-col items-center gap-2 p-4 bg-background border border-border rounded-xl w-full text-center">
              <span className="text-xl">⚙️</span>
              <span className="font-bold text-sm text-foreground">Celery Worker</span>
              <span className="text-xs text-muted">Process is sandboxed, converting/compressing file.</span>
            </div>
            <span className="text-xl rotate-90 md:rotate-0">➡️</span>
            <div className="flex flex-col items-center gap-2 p-4 bg-background border border-border rounded-xl w-full text-center">
              <span className="text-xl">🗑️</span>
              <span className="font-bold text-sm text-foreground">60s Disk Purge</span>
              <span className="text-xs text-muted">Original and temp files are deleted from backend disk immediately.</span>
            </div>
            <span className="text-xl rotate-90 md:rotate-0">➡️</span>
            <div className="flex flex-col items-center gap-2 p-4 bg-background border border-border rounded-xl w-full text-center">
              <span className="text-xl">⏱️</span>
              <span className="font-bold text-sm text-foreground">15m Expiry</span>
              <span className="text-xs text-muted">Download links or fallback static files expire &amp; vanish.</span>
            </div>
          </div>
        </motion.section>

        {/* Call to Action */}
        <motion.section variants={itemVariants} className="text-center pt-6">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-8 font-semibold text-accent-foreground shadow-lg shadow-indigo-500/20 hover:bg-accent-hover hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            Start processing PDFs
          </Link>
        </motion.section>
      </motion.div>
    </div>
  )
}
