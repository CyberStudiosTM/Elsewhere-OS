import { useEffect, useRef } from 'react'

// Music-reactive visualizer drawn by the player (skins only describe its style and colors).
export type VisualizerStyle = 'bars' | 'wave' | 'bubbles'

export default function Visualizer({ analyser, playing, style, accent, className }: {
  analyser: AnalyserNode | null; playing: boolean; style: VisualizerStyle; accent: string; className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    const bins = new Uint8Array(analyser?.frequencyBinCount || 64)
    const wave = new Uint8Array(analyser?.fftSize || 128)
    const bubbles: { x: number; y: number; r: number; v: number }[] = []
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const draw = (time: number) => {
      const ratio = window.devicePixelRatio || 1
      const w = canvas.clientWidth, h = canvas.clientHeight
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio) }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const live = playing && analyser
      if (live) { analyser.getByteFrequencyData(bins); analyser.getByteTimeDomainData(wave) }
      const level = (i: number, count: number) => {
        if (live) return bins[Math.floor((i / count) * bins.length * 0.7)] / 255
        return reduce ? 0.12 : 0.08 + 0.06 * Math.sin(time / 600 + i * 0.7)
      }
      const glow = ctx.createLinearGradient(0, h, 0, 0)
      glow.addColorStop(0, accent); glow.addColorStop(1, '#ffffff')
      if (style === 'bars') {
        const count = Math.max(8, Math.floor(w / 7))
        const bw = w / count
        for (let i = 0; i < count; i++) {
          const v = Math.max(0.06, level(i, count))
          ctx.fillStyle = glow
          ctx.globalAlpha = 0.9
          ctx.fillRect(i * bw + 1, h - v * h, Math.max(1, bw - 2), v * h)
        }
      } else if (style === 'wave') {
        ctx.lineWidth = 2.2
        ctx.strokeStyle = glow
        ctx.shadowColor = accent; ctx.shadowBlur = 8
        for (let layer = 0; layer < 2; layer++) {
          ctx.globalAlpha = layer ? 0.45 : 0.95
          ctx.beginPath()
          for (let x = 0; x <= w; x += 3) {
            const t = x / w
            const v = live ? (wave[Math.floor(t * (wave.length - 1))] - 128) / 128 : 0.25 * Math.sin(time / 500 + t * 9 + layer)
            const y = h / 2 + v * h * 0.42 * (layer ? 0.6 : 1) * Math.sin(Math.PI * t)
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
        ctx.shadowBlur = 0
      } else {
        const energy = live ? bins.slice(0, 24).reduce((a, b) => a + b, 0) / (24 * 255) : 0.15
        if (!reduce && Math.random() < 0.08 + energy * 0.6 && bubbles.length < 40) bubbles.push({ x: Math.random() * w, y: h + 6, r: 2 + Math.random() * 5 * (0.5 + energy), v: 0.3 + Math.random() * 0.9 + energy })
        for (let i = 0; i < 16; i++) {
          const v = Math.max(0.05, level(i, 16))
          ctx.globalAlpha = 0.75
          ctx.fillStyle = glow
          ctx.fillRect((i / 16) * w + 1, h - v * h * 0.8, w / 16 - 2, v * h * 0.8)
        }
        for (const b of bubbles) {
          b.y -= b.v
          ctx.globalAlpha = 0.8
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke()
          ctx.globalAlpha = 0.35; ctx.fillStyle = accent; ctx.fill()
        }
        for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].y < -10) bubbles.splice(i, 1)
      }
      ctx.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser, playing, style, accent])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
