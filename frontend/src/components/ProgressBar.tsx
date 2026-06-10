'use client'

import { motion } from 'framer-motion'

interface ProgressBarProps {
  progress: number // 0 to 100
  message: string
}

export default function ProgressBar({ progress, message }: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress))

  return (
    <div className="w-full flex flex-col gap-3 py-4">
      {/* Progress Track */}
      <div className="h-2.5 w-full bg-border/40 backdrop-blur-md rounded-full overflow-hidden relative shadow-inner">
        <motion.div
          className="h-full bg-gradient-to-r from-accent via-purple-500 to-accent rounded-full animate-sweep"
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ boxShadow: '0 0 10px 1px rgba(var(--accent-rgb), 0.35)' }}
        />
      </div>

      {/* Progress Metadata */}
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted font-medium animate-pulse-subtle">
          {message}
        </span>
        <span className="text-foreground font-bold font-mono">
          {clampedProgress}%
        </span>
      </div>
    </div>
  )
}
