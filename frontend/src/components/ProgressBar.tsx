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
      <div className="h-2 w-full bg-border rounded-full overflow-hidden relative">
        <motion.div
          className="h-full bg-accent rounded-full shadow-lg shadow-indigo-500/20"
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
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
