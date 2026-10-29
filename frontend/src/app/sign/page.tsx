'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  PenLine,
  Download,
  RefreshCw,
  AlertTriangle,
  Eye,
  FileText,
  X,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Eraser,
  Pencil,
  Type,
  Upload,
  Check,
  CalendarDays,
} from 'lucide-react'
import DropZone from '@/components/DropZone'
import ProgressBar from '@/components/ProgressBar'
import { useFileJob } from '@/hooks/useFileJob'
import { apiClient, submitJob, API_URL, resolveApiPath, apiKeyHeaders } from '@/lib/api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

const STORAGE_KEY = 'yourpdf.signature'
const SCALE = 3 // studio canvases render at 3x CSS resolution
const TRIM_PAD = 8 * SCALE // 8 CSS px of breathing room around trimmed ink
const DRAW_W = 480
const DRAW_H = 220
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(#d4d4d8 0% 25%, #fafafa 0% 50%)',
  backgroundSize: '16px 16px',
}

const TYPE_FONTS = [
  { id: 'caveat', label: 'Casual', sample: 'Casual', family: "'Caveat-Sign', 'Segoe Script', cursive" },
  { id: 'greatvibes', label: 'Elegant', sample: 'Elegant', family: "'GreatVibes-Sign', 'Snell Roundhand', cursive" },
  { id: 'homemadeapple', label: 'Handwritten', sample: 'Notes', family: "'HomemadeApple-Sign', 'Segoe Print', cursive" },
] as const

const TYPE_SIZES = [44, 60, 80] // CSS px at 1x, 3 steps

const DATE_SIZE_MAP = { S: 9, M: 12, L: 16 } as const
type DateSize = keyof typeof DATE_SIZE_MAP
type DatePosition = 'below' | 'above'

type StudioTab = 'draw' | 'type' | 'upload'

interface PlacedSignature {
  dataUrl: string
  aspect: number // width / height
}

/* ---------------------------------- utils --------------------------------- */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Crop a canvas to its non-transparent bounds + padding. Returns null when blank. */
function trimmedDataURL(src: HTMLCanvasElement, pad = TRIM_PAD): string | null {
  const ctx = src.getContext('2d')
  if (!ctx) return null
  const { width, height } = src
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, width, height)
  } catch {
    return null
  }
  const px = data.data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  const octx = out.getContext('2d')
  if (!octx) return null
  octx.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

function dataURLToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(head)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function decodeImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not decode signature image.'))
    img.src = dataUrl
  })
}

/* ------------------------------- Draw studio ------------------------------ */

interface Stroke {
  pts: { x: number; y: number }[]
  w: number // internal px
}

function paintStrokes(canvas: HTMLCanvasElement, strokes: Stroke[], active: Stroke | null) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  const all = active ? [...strokes, active] : strokes
  for (const s of all) {
    const p = s.pts
    if (p.length === 0) continue
    ctx.lineWidth = s.w
    ctx.beginPath()
    if (p.length === 1) {
      ctx.arc(p[0].x, p[0].y, s.w / 2, 0, Math.PI * 2)
      ctx.fillStyle = '#000000'
      ctx.fill()
      continue
    }
    ctx.moveTo(p[0].x, p[0].y)
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2
      const my = (p[i].y + p[i + 1].y) / 2
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my)
    }
    const last = p[p.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }
}

function DrawStudio({ onUse }: { onUse: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeRef = useRef<Stroke | null>(null)
  const drawingRef = useRef(false)
  const [brush, setBrush] = useState(3.5)
  const [strokeCount, setStrokeCount] = useState(0)

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    }
  }

  const redraw = () => {
    const c = canvasRef.current
    if (c) paintStrokes(c, strokesRef.current, activeRef.current)
  }

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    activeRef.current = { pts: [pos(e)], w: brush * SCALE }
    redraw()
  }

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !activeRef.current) return
    e.preventDefault()
    activeRef.current.pts.push(pos(e))
    redraw()
  }

  const endStroke = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (activeRef.current && activeRef.current.pts.length > 0) {
      strokesRef.current.push(activeRef.current)
      setStrokeCount(strokesRef.current.length)
    }
    activeRef.current = null
    redraw()
  }

  const handleUndo = () => {
    strokesRef.current.pop()
    setStrokeCount(strokesRef.current.length)
    redraw()
  }

  const handleClear = () => {
    strokesRef.current = []
    activeRef.current = null
    setStrokeCount(0)
    redraw()
  }

  const handleUse = () => {
    const c = canvasRef.current
    if (!c) return
    const url = trimmedDataURL(c)
    if (url) onUse(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border overflow-hidden" style={CHECKERBOARD}>
        <canvas
          ref={canvasRef}
          width={DRAW_W * SCALE}
          height={DRAW_H * SCALE}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          className="block h-auto w-full cursor-crosshair touch-none select-none"
          style={{ aspectRatio: `${DRAW_W} / ${DRAW_H}` }}
          aria-label="Draw your signature"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Pen</span>
        {[2, 3.5, 5].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setBrush(w)}
            aria-pressed={brush === w}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
              brush === w ? 'border-accent bg-accent-subtle' : 'border-border bg-surface hover:bg-surface-2'
            }`}
            title={`${w} px pen`}
          >
            <span className="rounded-full bg-foreground" style={{ width: w * 2, height: w * 2 }} />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokeCount === 0}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-40 cursor-pointer transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={strokeCount === 0}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-40 cursor-pointer transition-colors"
          >
            <Eraser className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleUse}
        disabled={strokeCount === 0}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        <Check className="h-4 w-4" />
        <span>Use signature</span>
      </button>
    </div>
  )
}

/* ------------------------------- Type studio ------------------------------ */

function TypeStudio({ onUse }: { onUse: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [name, setName] = useState('')
  const [fontId, setFontId] = useState<string>(TYPE_FONTS[0].id)
  const [sizeIdx, setSizeIdx] = useState(1)

  const font = TYPE_FONTS.find((f) => f.id === fontId) ?? TYPE_FONTS[0]

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      const c = canvasRef.current
      if (!c) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      try {
        await document.fonts.load(`${TYPE_SIZES[sizeIdx] * SCALE}px ${font.family}`)
        await document.fonts.ready
      } catch {
        // fall back to the CSS cursive stack on failure
      }
      if (cancelled) return
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#000000'
      ctx.font = `${TYPE_SIZES[sizeIdx] * SCALE}px ${font.family}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const label = name.trim() || 'Your Name'
      ctx.fillText(label, c.width / 2, c.height / 2 + 4 * SCALE, c.width - 32 * SCALE)
    }
    render()
    return () => {
      cancelled = true
    }
  }, [name, font, sizeIdx])

  const handleUse = () => {
    if (!name.trim()) return
    const c = canvasRef.current
    if (!c) return
    const url = trimmedDataURL(c)
    if (url) onUse(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Type your full name"
        maxLength={60}
        className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none transition-colors"
      />
      <div className="grid grid-cols-3 gap-2">
        {TYPE_FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFontId(f.id)}
            aria-pressed={fontId === f.id}
            className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition-colors cursor-pointer ${
              fontId === f.id ? 'border-accent bg-accent-subtle' : 'border-border bg-surface hover:bg-surface-2'
            }`}
          >
            <span className="text-xl leading-tight text-foreground" style={{ fontFamily: f.family }}>
              {f.sample}
            </span>
            <span className="text-[11px] font-semibold text-muted">{f.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted">Size</span>
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={sizeIdx}
          onChange={(e) => setSizeIdx(Number(e.target.value))}
          aria-label="Signature text size"
          className="w-full min-w-0 accent-[var(--accent)] cursor-pointer"
        />
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {sizeIdx === 0 ? 'Small' : sizeIdx === 1 ? 'Medium' : 'Large'}
        </span>
      </div>
      <div className="rounded-xl border border-border overflow-hidden" style={CHECKERBOARD}>
        <canvas
          ref={canvasRef}
          width={DRAW_W * SCALE}
          height={DRAW_H * SCALE}
          className="block h-auto w-full select-none"
          style={{ aspectRatio: `${DRAW_W} / ${DRAW_H}` }}
          aria-label="Typed signature preview"
        />
      </div>
      <button
        type="button"
        onClick={handleUse}
        disabled={!name.trim()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        <Check className="h-4 w-4" />
        <span>Use signature</span>
      </button>
    </div>
  )
}

/* ------------------------------ Upload studio ----------------------------- */

function UploadStudio({ onUse }: { onUse: (dataUrl: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [removeWhite, setRemoveWhite] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef<HTMLImageElement | null>(null)

  const process = (img: HTMLImageElement, stripWhite: boolean) => {
    const maxDim = 1200
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, w, h)
    if (stripWhite) {
      const data = ctx.getImageData(0, 0, w, h)
      const px = data.data
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] >= 240 && px[i + 1] >= 240 && px[i + 2] >= 240) px[i + 3] = 0
      }
      ctx.putImageData(data, 0, 0)
    }
    const url = trimmedDataURL(c)
    setPreview(url)
  }

  const handleFile = (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!/^image\/(png|jpe?g)$/i.test(f.type) && !/\.(png|jpe?g)$/i.test(f.name)) {
      setError('Only PNG or JPG images are supported.')
      return
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError('Signature image must be 5 MB or smaller.')
      return
    }
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      sourceRef.current = img
      process(img, removeWhite)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setError('Could not read that image. Try a different file.')
    }
    img.src = url
  }

  const toggleWhite = (next: boolean) => {
    setRemoveWhite(next)
    if (sourceRef.current) process(sourceRef.current, next)
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface text-sm font-semibold text-muted hover:text-foreground hover:border-accent/60 transition-colors">
        <Upload className="h-4 w-4" />
        <span>{preview ? 'Choose a different image' : 'Choose PNG or JPG (max 5 MB)'}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {error && <p className="text-xs text-danger leading-relaxed">{error}</p>}
      {preview && (
        <div className="rounded-xl border border-border p-4 overflow-hidden" style={CHECKERBOARD}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Signature preview" className="mx-auto block max-h-40 w-auto" />
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
        <span className="text-[13px] font-medium">Remove white background</span>
        <button
          type="button"
          role="switch"
          aria-checked={removeWhite}
          onClick={() => toggleWhite(!removeWhite)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
            removeWhite ? 'bg-accent' : 'bg-surface-2 ring-1 ring-border'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              removeWhite ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </label>
      <button
        type="button"
        onClick={() => preview && onUse(preview)}
        disabled={!preview}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        <Check className="h-4 w-4" />
        <span>Use signature</span>
      </button>
    </div>
  )
}

/* --------------------------------- submit --------------------------------- */

type SignArgs = {
  file: File
  signature: Blob
  pages: string
  cx: number
  cy: number
  width: number
  rotation: number
  add_date: boolean
  date_text: string
  date_size: number
  date_position: DatePosition
}

const signSubmitter = ({ file, signature, pages, cx, cy, width, rotation, add_date, date_text, date_size, date_position }: SignArgs) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('signature', signature, 'signature.png')
  formData.append('pages', pages)
  formData.append('cx', String(cx))
  formData.append('cy', String(cy))
  formData.append('width', String(width))
  formData.append('rotation', String(rotation))
  formData.append('add_date', String(add_date))
  formData.append('date_text', date_text)
  formData.append('date_size', String(date_size))
  formData.append('date_position', date_position)
  return submitJob('/api/sign', formData)
}

/* ---------------------------------- page ---------------------------------- */

export default function SignPage() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState('all')
  const [numPages, setNumPages] = useState<number | null>(null)
  const [previewPage, setPreviewPage] = useState(1)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const [signature, setSignature] = useState<PlacedSignature | null>(null)
  const [studioOpen, setStudioOpen] = useState(true)
  const [studioTab, setStudioTab] = useState<StudioTab>('draw')

  const [cx, setCx] = useState(70)
  const [cy, setCy] = useState(80)
  const [sigWidth, setSigWidth] = useState(25)
  const [rotation, setRotation] = useState<number | ''>(0)
  const [addDate, setAddDate] = useState(false)
  const [dateText, setDateText] = useState('')
  const [dateSize, setDateSize] = useState<DateSize>('M')
  const [datePosition, setDatePosition] = useState<DatePosition>('below')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const pageCacheRef = useRef(new Map<number, string>())
  const placeRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; cx: number; cy: number; width: number } | null>(null)

  const clearPageCache = () => {
    for (const url of pageCacheRef.current.values()) URL.revokeObjectURL(url)
    pageCacheRef.current.clear()
  }

  useEffect(() => () => clearPageCache(), [])

  // Restore the saved signature (image data only; nothing leaves the browser).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && stored.startsWith('data:image/')) {
        decodeImageSize(stored)
          .then(({ w, h }) => {
            if (h > 0) {
              setSignature({ dataUrl: stored, aspect: w / h })
              setStudioOpen(false)
            }
          })
          .catch(() => {
            try {
              localStorage.removeItem(STORAGE_KEY)
            } catch {
              // ignore
            }
          })
      }
    } catch {
      // private mode etc: studio simply starts empty
    }
  }, [])

  // Fetch page count when the file changes (own effect; not gated by the page-image flow).
  useEffect(() => {
    clearPageCache()
    setPageUrl(null)
    setPageError(null)
    setPreviewPage(1)
    setNumPages(null)
    if (!file) {
      return
    }
    let alive = true
    const infoData = new FormData()
    infoData.append('file', file)
    apiClient
      .post('/api/pdf-info', infoData)
      .then((res) => {
        if (alive) setNumPages(res.data.num_pages)
      })
      .catch((err) => {
        console.error('Failed to get PDF info:', err)
      })
    return () => {
      alive = false
    }
  }, [file])

  // Load (or reuse the cached) image whenever the file or picker page changes.
  useEffect(() => {
    if (!file) {
      setPageUrl(null)
      return
    }
    const cached = pageCacheRef.current.get(previewPage)
    if (cached) {
      setPageUrl(cached)
      setPageError(null)
      return
    }
    let alive = true
    const load = async () => {
      setPageLoading(true)
      setPageError(null)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('format', 'png')
        fd.append('dpi', '110')
        fd.append('pages', String(previewPage))
        const res = await fetch(`${API_URL}${resolveApiPath('/api/pdf-to-images')}`, {
          method: 'POST',
          body: fd,
          headers: apiKeyHeaders(),
        })
        if (!res.ok) throw new Error(`Page preview failed (${res.status}).`)
        const blob = await res.blob()
        if (!alive) return
        const url = URL.createObjectURL(blob)
        pageCacheRef.current.set(previewPage, url)
        setPageUrl(url)
      } catch (e) {
        if (!alive) return
        setPageError(e instanceof Error ? e.message : 'Could not load page preview.')
      } finally {
        if (alive) setPageLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [file, previewPage])

  // Pages-spec parsing, same rules as the watermark page.
  const getSelectedPages = (): Set<number> => {
    const selected = new Set<number>()
    if (!numPages) return selected
    const trimmedAll = pages.trim()
    if (!trimmedAll) return selected
    if (trimmedAll.toLowerCase() === 'all') {
      for (let i = 1; i <= numPages; i++) selected.add(i)
      return selected
    }
    const parts = trimmedAll.split(',')
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (trimmed.includes('-')) {
        const dashIdx = trimmed.indexOf('-')
        const startRaw = trimmed.slice(0, dashIdx).trim()
        const endRaw = trimmed.slice(dashIdx + 1).trim()
        const start = startRaw === '' ? 1 : parseInt(startRaw, 10)
        const end = endRaw === '' ? numPages : parseInt(endRaw, 10)
        if (isNaN(start) || isNaN(end)) continue
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          if (i >= 1 && i <= numPages) selected.add(i)
        }
      } else {
        const page = parseInt(trimmed, 10)
        if (!isNaN(page) && page >= 1 && page <= numPages) selected.add(page)
      }
    }
    return selected
  }

  const selectedPages = getSelectedPages()
  const pagesTrimmed = pages.trim()
  const isPagesAll = pagesTrimmed.toLowerCase() === 'all'
  const pagesValid = isPagesAll || (pagesTrimmed !== '' && selectedPages.size > 0)

  const { isSubmitting, isDone, isError, submitError, submit, reset, downloadUrl } =
    useFileJob<SignArgs>(signSubmitter)

  const handleUseSignature = async (dataUrl: string) => {
    try {
      const { w, h } = await decodeImageSize(dataUrl)
      if (h <= 0) return
      setSignature({ dataUrl, aspect: w / h })
      setStudioOpen(false)
      try {
        localStorage.setItem(STORAGE_KEY, dataUrl)
      } catch {
        // quota / private mode: signature still works for this session
      }
    } catch {
      // undecodable image: stay in the studio
    }
  }

  const handleSubmit = async () => {
    if (!file || !signature) return
    if (!pages.trim()) {
      alert('Please enter pages to sign (e.g. all or 1-3, 5).')
      return
    }
    if (numPages !== null && !pagesValid) {
      alert('Pages range is invalid or out of range for this file.')
      return
    }
    const ok = await submit({
      file,
      signature: dataURLToBlob(signature.dataUrl),
      pages: pages.trim() || 'all',
      cx,
      cy,
      width: sigWidth,
      rotation: rotation === '' ? 0 : rotation,
      add_date: addDate,
      date_text: dateText,
      date_size: DATE_SIZE_MAP[dateSize],
      date_position: datePosition,
    })
    if (!ok) {
      alert('Failed to initialize signing task. Please check server connection.')
    }
  }

  const resetPlacement = () => {
    setPages('all')
    setPreviewPage(1)
    setCx(70)
    setCy(80)
    setSigWidth(25)
    setRotation(0)
    setAddDate(false)
    setDateText('')
    setDateSize('M')
    setDatePosition('below')
    setIsPreviewOpen(false)
  }

  const handleRemoveFile = () => {
    setFile(null)
    setNumPages(null)
    setPageUrl(null)
    setPageError(null)
    resetPlacement()
  }

  const handleReset = () => {
    handleRemoveFile()
    reset()
  }

  const handleSignAnother = () => {
    handleRemoveFile()
    reset()
  }

  // Signature box dragging (move) — percentages map 1:1 to backend cx/cy.
  const handleBoxDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placeRef.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, cx, cy, width: sigWidth }
  }

  const handleBoxMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const box = placeRef.current
    if (!d || d.mode !== 'move' || !box) return
    const r = box.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    setCx(clamp(d.cx + ((e.clientX - d.startX) / r.width) * 100, 0, 100))
    setCy(clamp(d.cy + ((e.clientY - d.startY) / r.height) * 100, 0, 100))
  }

  const handleBoxUp = () => {
    dragRef.current = null
  }

  // Bottom-right resize handle — width% of the page, height follows aspect.
  const handleResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placeRef.current) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, cx, cy, width: sigWidth }
  }

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const box = placeRef.current
    if (!d || d.mode !== 'resize' || !box) return
    const r = box.getBoundingClientRect()
    if (r.width <= 0) return
    setSigWidth(clamp(d.width + ((e.clientX - d.startX) / r.width) * 100, 5, 90))
  }

  const canSubmit = file && signature && !isSubmitting && pagesValid
  const isWorkspace = file && !isDone && !isError && !isSubmitting
  const rotValue = rotation === '' ? 0 : rotation
  const [previewDate] = useState(() =>
    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  )
  const todayStr = previewDate

  return (
    <div className={`mx-auto w-full min-w-0 flex-1 flex flex-col justify-center overflow-x-clip px-4 sm:px-6 py-6 sm:py-10 transition-all duration-300 ${file ? 'max-w-[1400px]' : 'max-w-2xl'}`}>
      {/* Header */}
      <div className="mb-5 sm:mb-7 min-w-0">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all tools</span>
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <PenLine className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sign PDF</h1>
            <p className="text-sm text-muted mt-0.5">Draw, type, or upload a signature, place it, and stamp it onto your PDF.</p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!file && !isDone && !isError && !isSubmitting && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 min-w-0"
          >
            <DropZone onFileAccepted={setFile} />
            <p className="text-center text-xs text-muted">
              Your signature stays in this browser — nothing is uploaded until you sign.
            </p>
          </motion.div>
        )}

        {isWorkspace && file && (
          <motion.div
            key="file-selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4 sm:gap-5 min-w-0"
          >
            {/* Slim file bar */}
            <div className="flex items-center gap-3 min-w-0 rounded-xl border border-card-border bg-surface px-3 py-2.5 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium tracking-tight">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB{numPages !== null ? ` · ${numPages} pages` : ' · reading…'} · {isPagesAll ? 'signing all' : `${selectedPages.size} selected`}
                </p>
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                <Repeat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Replace</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const next = e.target.files?.[0]
                    if (next) setFile(next)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleRemoveFile}
                aria-label="Remove file"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Workspace: compact settings + generous placement stage */}
            <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 sm:gap-5 items-start min-w-0">
              {/* Settings */}
              <div className="flex flex-col gap-4 min-w-0 order-1">
                {/* 01 — Signature */}
                <div className="flex flex-col gap-2.5 min-w-0 rounded-xl border border-card-border bg-surface p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">01 — Signature</span>
                    {signature && !studioOpen && (
                      <button
                        type="button"
                        onClick={() => setStudioOpen(true)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2 cursor-pointer transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>

                  {(!signature || studioOpen) ? (
                    <>
                      <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Signature input methods">
                        {(
                          [
                            { id: 'draw', label: 'Draw', icon: Pencil },
                            { id: 'type', label: 'Type', icon: Type },
                            { id: 'upload', label: 'Upload', icon: Upload },
                          ] as const
                        ).map((t) => {
                          const Icon = t.icon
                          const active = studioTab === t.id
                          return (
                            <button
                              key={t.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => setStudioTab(t.id)}
                              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition-colors cursor-pointer ${
                                active ? 'bg-surface text-foreground shadow-sm ring-1 ring-border' : 'text-muted hover:text-foreground'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{t.label}</span>
                            </button>
                          )
                        })}
                      </div>
                      {studioTab === 'draw' && <DrawStudio onUse={handleUseSignature} />}
                      {studioTab === 'type' && <TypeStudio onUse={handleUseSignature} />}
                      {studioTab === 'upload' && <UploadStudio onUse={handleUseSignature} />}
                    </>
                  ) : (
                    signature && (
                      <div className="flex items-center gap-3 rounded-xl border border-border p-3 overflow-hidden" style={CHECKERBOARD}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signature.dataUrl} alt="Your signature" className="max-h-16 w-auto max-w-[70%]" />
                        <span className="ml-auto shrink-0 rounded-full bg-success-subtle px-2.5 py-1 text-[11px] font-semibold text-success">
                          Saved
                        </span>
                      </div>
                    )
                  )}
                </div>

                {/* 02 — Pages */}
                <div className="flex flex-col gap-1.5 min-w-0 rounded-xl border border-card-border bg-surface p-3.5 shadow-sm">
                  <label htmlFor="sign-pages" className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                    <span>02 — Pages to sign</span>
                    <span className="text-xs text-muted font-normal">
                      {numPages !== null
                        ? isPagesAll
                          ? `${numPages} pages`
                          : `${selectedPages.size} of ${numPages}`
                        : 'e.g. all or 1-3, 5'}
                    </span>
                  </label>
                  <input
                    id="sign-pages"
                    type="text"
                    value={pages}
                    onChange={(e) => setPages(e.target.value)}
                    placeholder="e.g. all or 1-3, 5"
                    className="w-full h-11 px-3.5 rounded-lg border border-border bg-surface text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm font-mono"
                  />
                  <p className="text-xs text-muted leading-relaxed">
                    <span className="font-mono text-accent">all</span> signs every page. Use <span className="font-mono text-accent">1-3, 5</span> or open-ended <span className="font-mono text-accent">3-</span> for specific pages.
                  </p>
                  {numPages !== null && pagesTrimmed !== '' && !pagesValid && (
                    <p className="text-xs text-danger leading-relaxed">
                      No valid pages selected. Check the range against this file&apos;s {numPages} pages.
                    </p>
                  )}
                </div>

                {/* 03 — Placement */}
                <div className="flex flex-col gap-3 min-w-0 rounded-xl border border-card-border bg-surface p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-[13px] font-semibold">03 — Size & rotation</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {sigWidth.toFixed(1)}% · {rotValue}°
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="sign-width" className="text-[11px] font-bold text-muted uppercase tracking-wide">
                      Width ({sigWidth.toFixed(1)}% of page)
                    </label>
                    <input
                      id="sign-width"
                      type="range"
                      min={5}
                      max={90}
                      step={0.5}
                      value={sigWidth}
                      onChange={(e) => setSigWidth(Number(e.target.value))}
                      aria-label="Signature width as percent of page width"
                      className="w-full min-w-0 accent-[var(--accent)] cursor-pointer"
                    />
                    <p className="text-[11px] leading-snug text-muted">
                      Drag the box to move it, or pull its corner handle to resize. Position {cx.toFixed(1)}% / {cy.toFixed(1)}% from top-left.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-background px-3 py-3">
                    <label htmlFor="sign-rotation-slider" className="text-[11px] font-bold text-muted uppercase tracking-wide">
                      Rotation ({rotValue}° clockwise)
                    </label>
                    <input
                      id="sign-rotation-slider"
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={rotValue}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      aria-label="Signature rotation slider (clockwise degrees)"
                      className="w-full min-w-0 accent-[var(--accent)] cursor-pointer"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        step={0.5}
                        value={rotation}
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === '') {
                            setRotation('')
                            return
                          }
                          const n = parseFloat(v)
                          if (Number.isNaN(n)) {
                            setRotation('')
                            return
                          }
                          setRotation(clamp(n, -180, 180))
                        }}
                        aria-label="Signature rotation in degrees (clockwise)"
                        className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm font-mono tabular-nums text-foreground focus:outline-none focus:border-accent"
                      />
                      <span className="shrink-0 text-sm text-muted">° clockwise</span>
                    </div>
                  </div>
                </div>

                {/* 04 — Date */}
                <div className="flex flex-col gap-3 min-w-0 rounded-xl border border-card-border bg-surface px-3.5 py-3 shadow-sm">
                  <div className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
                      <span className="text-[13px] font-semibold">Add date under signature</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={addDate}
                      aria-label="Add date under signature"
                      onClick={() => setAddDate(!addDate)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
                        addDate ? 'bg-accent' : 'bg-surface-2 ring-1 ring-border'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                          addDate ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  {addDate && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="sign-date-text" className="text-[11px] font-bold text-muted uppercase tracking-wide">
                          Date text
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="sign-date-text"
                            type="text"
                            value={dateText}
                            onChange={(e) => setDateText(e.target.value)}
                            placeholder={todayStr}
                            maxLength={100}
                            className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setDateText('')}
                            className="inline-flex h-10 shrink-0 items-center rounded-lg border border-border px-2.5 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2 cursor-pointer transition-colors"
                          >
                            Today
                          </button>
                        </div>
                        <p className="text-[11px] leading-snug text-muted">Empty = today ({todayStr}).</p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Size</span>
                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Date size">
                          {(Object.keys(DATE_SIZE_MAP) as DateSize[]).map((s) => (
                            <button
                              key={s}
                              type="button"
                              aria-pressed={dateSize === s}
                              onClick={() => setDateSize(s)}
                              className={`inline-flex h-9 items-center justify-center rounded-md text-[13px] font-semibold transition-colors cursor-pointer ${
                                dateSize === s ? 'bg-surface text-foreground shadow-sm ring-1 ring-border' : 'text-muted hover:text-foreground'
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Position</span>
                        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Date position">
                          {(['below', 'above'] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              aria-pressed={datePosition === p}
                              onClick={() => setDatePosition(p)}
                              className={`inline-flex h-9 items-center justify-center rounded-md text-[13px] font-semibold capitalize transition-colors cursor-pointer ${
                                datePosition === p ? 'bg-surface text-foreground shadow-sm ring-1 ring-border' : 'text-muted hover:text-foreground'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="sticky bottom-3 lg:static">
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <PenLine className="h-4 w-4" />
                    <span>{isSubmitting ? 'Signing...' : 'Sign PDF'}</span>
                  </button>
                  {!signature && (
                    <p className="mt-1.5 text-center text-[11px] text-muted">
                      Create a signature above to enable signing.
                    </p>
                  )}
                </div>
              </div>

              {/* Placement stage — the hero */}
              <div className="min-w-0 order-2 rounded-xl border border-card-border bg-surface shadow-sm overflow-hidden lg:sticky lg:top-24 self-start lg:max-h-[calc(100vh-8rem)]">
                <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 px-3.5 sm:px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold truncate">
                    Placement · {numPages !== null ? `page ${Math.min(previewPage, numPages)} of ${numPages}` : 'loading…'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      disabled={numPages === null || previewPage <= 1}
                      aria-label="Previous page"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-40 cursor-pointer transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={numPages ?? 1}
                      value={previewPage}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10)
                        if (isNaN(n)) return
                        setPreviewPage(numPages ? clamp(n, 1, numPages) : Math.max(1, n))
                      }}
                      aria-label="Preview page number"
                      className="h-8 w-14 rounded-lg border border-border bg-surface px-1 text-center text-sm font-mono tabular-nums text-foreground focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setPreviewPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
                      disabled={numPages === null || (numPages !== null && previewPage >= numPages)}
                      aria-label="Next page"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-40 cursor-pointer transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="min-h-[280px] sm:min-h-[360px] lg:min-h-[520px] max-h-[62vh] lg:max-h-[72vh] overflow-y-auto overflow-x-hidden flex flex-col items-center">
                    {pageError ? (
                      <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
                        <AlertTriangle className="h-6 w-6 text-danger" />
                        <p className="text-sm text-muted max-w-[36ch]">{pageError}</p>
                      </div>
                    ) : pageUrl ? (
                      <div ref={placeRef} className="relative w-full max-w-[560px] select-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pageUrl}
                          alt={`PDF page ${previewPage} preview`}
                          className="block w-full rounded-lg border border-card-border bg-background"
                          draggable={false}
                        />
                        {pageLoading && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-overlay">
                            <span className="animate-pulse-soft text-sm font-medium text-white">Loading page…</span>
                          </div>
                        )}
                        {signature ? (
                          <div
                            onPointerDown={handleBoxDown}
                            onPointerMove={handleBoxMove}
                            onPointerUp={handleBoxUp}
                            onPointerCancel={handleBoxUp}
                            role="application"
                            aria-label={`Signature box at ${cx.toFixed(0)} percent across, ${cy.toFixed(0)} percent down, rotated ${rotValue} degrees`}
                            className="absolute cursor-move touch-none rounded-[2px] ring-2 ring-accent/80"
                            style={{
                              left: `${cx}%`,
                              top: `${cy}%`,
                              width: `${sigWidth}%`,
                              aspectRatio: `${signature.aspect}`,
                              transform: `translate(-50%, -50%) rotate(${rotValue}deg)`,
                              containerType: 'inline-size',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={signature.dataUrl}
                              alt=""
                              className="pointer-events-none block h-full w-full"
                              draggable={false}
                            />
                            {addDate && (
                              <div
                                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center leading-none text-muted ${
                                  datePosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
                                }`}
                                style={{ fontSize: `${DATE_SIZE_MAP[dateSize]}cqw` }}
                              >
                                {dateText || todayStr}
                              </div>
                            )}
                            <div
                              onPointerDown={handleResizeDown}
                              onPointerMove={handleResizeMove}
                              onPointerUp={handleBoxUp}
                              onPointerCancel={handleBoxUp}
                              aria-label="Resize signature"
                              className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize touch-none rounded-full border-2 border-accent bg-surface shadow"
                            />
                          </div>
                        ) : (
                          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
                            <span className="rounded-full bg-overlay px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                              Create your signature on the left to place it here
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex min-h-[280px] items-center justify-center">
                        <span className="animate-pulse-soft text-sm text-muted">Rendering page…</span>
                      </div>
                    )}
                    <p className="mt-2.5 text-center text-xs text-muted max-w-[52ch]">
                      {isPagesAll
                        ? `The signature will be stamped on all ${numPages ?? '…'} pages at this exact position.`
                        : `The signature will be stamped on ${selectedPages.size} page${selectedPages.size === 1 ? '' : 's'} at this exact position.`}{' '}
                      Drag the box to move it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {(isSubmitting || isDone || isError) && (
          <motion.div
            key="processing-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-6 text-center min-w-0"
          >
            {isSubmitting && (
              <div className="w-full max-w-md min-w-0">
                <ProgressBar progress={50} message="Signing PDF..." />
              </div>
            )}

            {isDone && downloadUrl && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success mb-1">
                  <Download className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">PDF Signed!</h3>
                  <p className="text-sm text-muted mt-1">
                    Your signed PDF is ready. Preview it to verify placement, then download.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-2 w-full max-w-full justify-center items-stretch sm:items-center">
                  <a
                    href={downloadUrl ?? ''}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PDF</span>
                  </a>
                  <button
                    onClick={() => setIsPreviewOpen(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Preview PDF</span>
                  </button>
                  <button
                    onClick={handleSignAnother}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Sign another</span>
                  </button>
                </div>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger mb-1">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold">Signing Failed</h3>
                  <p className="text-sm text-muted mt-1 max-w-md">
                    {submitError || 'An unexpected error occurred during processing.'}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-2 transition-colors mt-2 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Try Again</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isDone && downloadUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={downloadUrl ?? ''}
          fileName={file?.name ? `${file.name.replace(/\.[^/.]+$/, '')}_signed.pdf` : 'signed.pdf'}
        />
      )}
    </div>
  )
}
