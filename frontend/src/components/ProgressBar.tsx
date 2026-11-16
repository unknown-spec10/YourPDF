'use client'

import { useEffect, useState } from 'react'
import { cancelActiveJob } from '@/lib/api'

interface ProgressBarProps {
  /**
   * Omit (or pass null) for an indeterminate job. A tool request is one synchronous POST with no
   * progress channel, so every page used to hardcode 50% — a bar that never moved.
   */
  progress?: number | null
  message: string
}

/**
 * Busy state built on a native `<progress>` element.
 *
 * The element is the semantic source of truth: without a `value` attribute it is indeterminate,
 * which assistive technology announces as such, and the styled ring is only paint on top. The
 * previous version was three animated divs with a hand-maintained `aria-valuenow`, which was
 * simultaneously wrong (it claimed 50%) and invisible to the accessibility tree when it changed.
 */
export default function ProgressBar({ progress, message }: ProgressBarProps) {
  const determinate = typeof progress === 'number'
  const clamped = determinate ? Math.max(0, Math.min(100, progress)) : undefined
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex w-full items-center gap-3 py-4">
      {determinate ? (
        // Determinate path stays deliberately plain: accent-color only, no custom bar styling,
        // so the UA keeps drawing it (custom pseudo-element styling would replace it entirely).
        <progress
          className="h-1.5 w-full"
          style={{ accentColor: 'var(--accent)' }}
          value={clamped}
          max={100}
          aria-label={message}
        />
      ) : (
        <progress className="spinner shrink-0" aria-label={message} />
      )}

      <span className="min-w-0 flex-1 text-[13px] font-medium text-muted">{message}</span>

      {!determinate && elapsed >= 5 && (
        // aria-hidden: a per-second counter inside a live region would chatter.
        <span aria-hidden="true" className="shrink-0 font-mono text-xs tabular-nums text-foreground">
          {elapsed}s
        </span>
      )}

      <button
        type="button"
        onClick={() => void cancelActiveJob()}
        title="Stops waiting in this tab. The server may still finish the job."
        className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        Stop waiting
      </button>
    </div>
  )
}
