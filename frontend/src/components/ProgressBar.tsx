'use client'

import { motion } from 'framer-motion'
import { cancelActiveJob } from '@/lib/api'

interface ProgressBarProps {
  progress: number // 0 to 100
  message: string
}

export default function ProgressBar({ progress, message }: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress))

  return (
    <div className="flex w-full flex-col gap-3 py-4" role="progressbar" aria-valuenow={clampedProgress} aria-valuemin={0} aria-valuemax={100} aria-label={message}>
      {/* Progress Track */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="relative h-full overflow-hidden rounded-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 22 }}
        >
          <div className="animate-sweep absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </motion.div>
      </div>

      {/* Progress Metadata */}
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="animate-pulse-soft min-w-0 flex-1 font-medium text-muted">{message}</span>
        <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">
          {clampedProgress}%
        </span>
        <button
          type="button"
          onClick={() => void cancelActiveJob()}
          className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
