'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Scissors,
  Layers,
  Lock,
  Unlock,
  RotateCw,
  Grid,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Server,
  Sparkles,
  Zap,
  ShieldAlert
} from 'lucide-react'

export default function Home() {
  const categories = [
    {
      title: 'Organize & Edit',
      desc: 'Modify pages, order, and merge layout structures instantly.',
      features: ['Merge PDFs', 'Split Ranges', 'Organize Layout', 'Rotate Pages'],
      icon: Grid,
      color: 'text-indigo-500 bg-indigo-500/10'
    },
    {
      title: 'Convert & OCR',
      desc: 'Fast, high-fidelity conversions and scanned doc digitization.',
      features: ['PDF to Images', 'Images to PDF', 'PDF to Word (Docx)', 'Scanned OCR PDF'],
      icon: Sparkles,
      color: 'text-emerald-500 bg-emerald-500/10'
    },
    {
      title: 'Secure & Optimize',
      desc: 'Encrypt contents, strip passwords, or compress file weights.',
      features: ['AES-256 Encrypt', 'Unlock PDFs', 'Quality Compress', 'Watermark & Labels'],
      icon: Lock,
      color: 'text-purple-500 bg-purple-500/10'
    }
  ]

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
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100 } },
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12 md:py-20 transition-all duration-200">
      {/* 1. Hero Section */}
      <section className="text-center mb-16 md:mb-24 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-accent mb-6"
        >
          <Lock className="h-4 w-4" />
          <span>Privacy-First Open Source Platform</span>
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-3xl mb-6 leading-tight"
        >
          Your PDF tools. <br className="sm:hidden" />
          <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-accent bg-clip-text text-transparent">
            Private by default.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg md:text-xl text-muted max-w-xl mb-10 leading-relaxed"
        >
          No accounts. No trackers. Simple operations run locally in your browser. Heavy files delete from our servers in 60 seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Link
            href="/tools"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-8 font-semibold text-accent-foreground shadow-lg shadow-indigo-500/20 hover:bg-accent-hover hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
          >
            <span>Get Started — All Tools</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-surface/30 px-8 font-semibold text-foreground hover:bg-surface transition-all duration-200"
          >
            How it works
          </Link>
        </motion.div>
      </section>

      {/* 2. Categorized Features Showcase */}
      <section className="mb-24 md:mb-36">
        <div className="text-center mb-12 flex flex-col items-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Complete Toolkit for All Workflows
          </h2>
          <p className="text-muted mt-2 max-w-lg">
            We provide powerful, professional utilities categorized into highly optimized workflows.
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {categories.map((cat, idx) => {
            const Icon = cat.icon
            return (
              <motion.div
                key={cat.title}
                variants={itemVariants}
                className="flex flex-col p-6 rounded-2xl border border-card-border/60 bg-surface/35 backdrop-blur-md relative overflow-hidden group hover:border-accent/30 hover:shadow-xl hover:shadow-accent/5 hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${cat.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{cat.title}</h3>
                <p className="text-xs text-muted leading-relaxed mb-6">{cat.desc}</p>
                
                <ul className="flex flex-col gap-2.5 mt-auto border-t border-border/40 pt-5">
                  {cat.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                      <Zap className="h-3.5 w-3.5 text-accent/80 shrink-0" />
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
      <section className="mb-20 md:mb-32 rounded-3xl border border-card-border/60 bg-surface/20 backdrop-blur-xl p-8 md:p-12 relative overflow-hidden shadow-xl shadow-black/5">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        
        <div className="max-w-3xl mb-12">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            How Privacy Works
          </h2>
          <p className="text-muted mt-2 leading-relaxed">
            Unlike commercial platforms that capture your documents, YourPDF handles processing in two secure, transparent modes depending on task weight.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 relative z-10">
          {/* Client-Side Flow */}
          <div className="flex flex-col justify-between p-6 rounded-2xl border border-card-border/60 bg-surface/25 backdrop-blur-md shadow-sm">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500 mb-4 border border-emerald-500/10">
                <Cpu className="h-3.5 w-3.5" />
                <span>100% Client-Side Processing</span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">No Upload Required</h3>
              <p className="text-sm text-muted leading-relaxed mb-6">
                Merging, splitting, and text extraction run locally inside your browser tab using WebAssembly. Your files never touch a server.
              </p>
            </div>
            
            {/* Diagram */}
            <div className="flex items-center justify-between gap-2 border border-border/40 rounded-xl p-4 bg-surface/20 text-xs text-center font-medium">
              <div className="flex flex-col items-center gap-1 bg-surface/40 border border-border/30 p-2 rounded-lg w-[76px] sm:w-[90px] shadow-sm">
                <span>📄 Your File</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted shrink-0" />
              <div className="flex flex-col items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-2 rounded-lg w-[88px] sm:w-[110px] shadow-sm">
                <Cpu className="h-4 w-4" />
                <span>Your Browser</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted shrink-0" />
              <div className="flex flex-col items-center gap-1 bg-surface/40 border border-border/30 p-2 rounded-lg w-[76px] sm:w-[90px] shadow-sm">
                <span>⬇️ Download</span>
              </div>
            </div>
          </div>

          {/* Server-Side Flow */}
          <div className="flex flex-col justify-between p-6 rounded-2xl border border-card-border/60 bg-surface/25 backdrop-blur-md shadow-sm">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-accent mb-4 border border-accent/10">
                <Server className="h-3.5 w-3.5" />
                <span>Secure Server-Side Processing</span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">Isolated Executions</h3>
              <p className="text-sm text-muted leading-relaxed mb-6">
                Complex compression and rasterization run on sandboxed cloud workers. Uploaded files are deleted from the disk instantly, and download links expire in 15 minutes.
              </p>
            </div>
            
            {/* Diagram */}
            <div className="flex items-center justify-between gap-1 border border-border/40 rounded-xl p-4 bg-surface/20 text-[10px] sm:text-xs text-center font-medium">
              <div className="flex flex-col items-center gap-1 bg-surface/40 border border-border/30 p-2 rounded-lg w-[60px] sm:w-[80px] shadow-sm">
                <span>📄 File</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted shrink-0" />
              <div className="flex flex-col items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 text-accent p-2 rounded-lg w-[70px] sm:w-[95px] shadow-sm">
                <Server className="h-4 w-4" />
                <span>Worker App</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted shrink-0" />
              <div className="flex flex-col items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-500 p-2 rounded-lg w-[70px] sm:w-[95px] shadow-sm">
                <span>🗑️ Auto-delete</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted shrink-0" />
              <div className="flex flex-col items-center gap-1 bg-surface/40 border border-border/30 p-2 rounded-lg w-[60px] sm:w-[80px] shadow-sm">
                <span>⬇️ Result</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Trust Signals Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left border-t border-border pt-16">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Open Source</h3>
            <p className="text-muted text-sm mt-1 leading-relaxed">
              Every line of code is open-source on GitHub. You can review, contribute, or run it locally yourself.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 shrink-0">
            <EyeOff className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">No Account Needed</h3>
            <p className="text-muted text-sm mt-1 leading-relaxed">
              No subscription or signups. Immediate, anonymous processing with zero cookies or tracking IDs.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 text-accent shrink-0">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Zero Data Persistence</h3>
            <p className="text-muted text-sm mt-1 leading-relaxed">
              We collect nothing. Files processed server-side are permanently wiped from disks as soon as tasks exit.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
