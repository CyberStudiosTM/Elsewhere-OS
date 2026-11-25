// Drawn decorations for Studio: stationery, Mini-UI objects and pen strokes.
// The same drawing code is used for the editor preview and for exports, so they always match.
// Mini-UI objects are fictional: their words are typed by the person, never read from real chats.

export type StationeryStyle = 'washi-stripes' | 'washi-dots' | 'washi-hearts' | 'washi-gingham' | 'memo' | 'postage' | 'ticket'
export const STATIONERY: Record<StationeryStyle, string> = {
  'washi-stripes': 'Washi tape · stripes', 'washi-dots': 'Washi tape · dots', 'washi-hearts': 'Washi tape · hearts', 'washi-gingham': 'Washi tape · gingham',
  memo: 'Memo note', postage: 'Postage stamp', ticket: 'Ticket stub',
}
export type MiniUiStyle = 'chat' | 'alert' | 'player'
export const MINI_UI: Record<MiniUiStyle, string> = { chat: 'Mini chat window', alert: 'Pop-up alert', player: 'Now playing' }

const TITLE = ['#7bc7ff', '#2388ed', '#095bd0', '#003da5', '#1267d6', '#6eb8fb']

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
}
function titleBar(ctx: CanvasRenderingContext2D, w: number, h: number, title: string) {
  const bar = Math.max(14, h * .16)
  const gradient = ctx.createLinearGradient(0, 0, 0, bar)
  TITLE.forEach((color, index) => gradient.addColorStop(index / (TITLE.length - 1), color))
  ctx.fillStyle = gradient
  roundRect(ctx, 0, 0, w, bar, Math.max(4, bar * .3)); ctx.fill()
  ctx.fillRect(0, bar / 2, w, bar / 2)
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.round(bar * .55)}px Tahoma, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(title.slice(0, 60), bar * .35, bar / 2, w - bar * 1.8)
  // close button
  const size = bar * .7
  const close = ctx.createLinearGradient(0, 0, 0, size)
  close.addColorStop(0, '#ffc5b9'); close.addColorStop(1, '#a80c08')
  ctx.fillStyle = close
  roundRect(ctx, w - size - bar * .15, (bar - size) / 2, size, size, size * .2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
  ctx.fillText('×', w - size / 2 - bar * .15, bar / 2)
  ctx.textAlign = 'left'
  return bar
}

export function drawStationery(ctx: CanvasRenderingContext2D, w: number, h: number, style: StationeryStyle, color: string) {
  ctx.save()
  if (style.startsWith('washi')) {
    // Torn ends and slight transparency, like real tape.
    ctx.globalAlpha *= .88
    ctx.beginPath()
    const teeth = Math.max(4, Math.round(h / 6))
    ctx.moveTo(0, 0)
    for (let i = 0; i <= teeth; i++) ctx.lineTo(i % 2 ? w * .02 : 0, (h / teeth) * i)
    ctx.lineTo(w, h)
    for (let i = teeth; i >= 0; i--) ctx.lineTo(i % 2 ? w * .98 : w, (h / teeth) * i)
    ctx.closePath()
    ctx.fillStyle = color; ctx.fill()
    ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    if (style === 'washi-stripes') for (let x = -h; x < w; x += h * .5) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h * .25, h); ctx.lineTo(x + h * .5 + h * .25, 0); ctx.lineTo(x + h * .5, 0); ctx.fill() }
    if (style === 'washi-dots') for (let x = h * .3; x < w; x += h * .5) for (let y = h * .25; y < h; y += h * .5) { ctx.beginPath(); ctx.arc(x + (y > h / 2 ? h * .25 : 0), y, h * .09, 0, Math.PI * 2); ctx.fill() }
    if (style === 'washi-hearts') { ctx.font = `${Math.round(h * .45)}px "Segoe UI Emoji", sans-serif`; ctx.textBaseline = 'middle'; for (let x = h * .15; x < w; x += h * .7) ctx.fillText('♡', x, h / 2) }
    if (style === 'washi-gingham') { ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < w; x += h * .4) ctx.fillRect(x, 0, h * .2, h); for (let y = 0; y < h; y += h * .4) ctx.fillRect(0, y, w, h * .2) }
  } else if (style === 'memo') {
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = Math.min(w, h) * .05; ctx.shadowOffsetY = Math.min(w, h) * .02
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h)
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = 'rgba(8, 80, 180, .25)'; ctx.lineWidth = Math.max(1, h * .006)
    for (let y = h * .22; y < h; y += h * .11) { ctx.beginPath(); ctx.moveTo(w * .06, y); ctx.lineTo(w * .94, y); ctx.stroke() }
    ctx.strokeStyle = 'rgba(232, 87, 138, .45)'; ctx.beginPath(); ctx.moveTo(w * .14, 0); ctx.lineTo(w * .14, h); ctx.stroke()
  } else if (style === 'postage') {
    const r = Math.min(w, h) * .045
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    for (let x = r; x < w; x += r * 2.6) { ctx.beginPath(); ctx.arc(x, 0, r, 0, Math.PI * 2); ctx.arc(x, h, r, 0, Math.PI * 2); ctx.fill() }
    for (let y = r; y < h; y += r * 2.6) { ctx.beginPath(); ctx.arc(0, y, r, 0, Math.PI * 2); ctx.arc(w, y, r, 0, Math.PI * 2); ctx.fill() }
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = color; ctx.fillRect(w * .1, h * .1, w * .8, h * .8)
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `bold ${Math.round(h * .16)}px Georgia, serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
    ctx.fillText('♡ 25', w * .86, h * .86)
  } else if (style === 'ticket') {
    const notch = h * .18
    ctx.fillStyle = color
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h / 2 - notch); ctx.arc(w, h / 2, notch, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(w, h); ctx.lineTo(0, h)
    ctx.lineTo(0, h / 2 + notch); ctx.arc(0, h / 2, notch, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); ctx.fill()
    ctx.setLineDash([h * .06, h * .05]); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(1, h * .02)
    ctx.beginPath(); ctx.moveTo(w * .72, h * .1); ctx.lineTo(w * .72, h * .9); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(h * .22)}px "Courier New", monospace`; ctx.textBaseline = 'middle'
    ctx.fillText('ADMIT ONE', w * .08, h / 2, w * .6)
  }
  ctx.restore()
}

export function drawMiniUi(ctx: CanvasRenderingContext2D, w: number, h: number, style: MiniUiStyle, title: string, lines: string[]) {
  ctx.save()
  ctx.shadowColor = 'rgba(4,47,117,.3)'; ctx.shadowBlur = Math.min(w, h) * .04; ctx.shadowOffsetY = Math.min(w, h) * .015
  ctx.fillStyle = '#f5f9ff'; roundRect(ctx, 0, 0, w, h, Math.min(w, h) * .05); ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = '#0850b4'; ctx.lineWidth = Math.max(1, Math.min(w, h) * .012); roundRect(ctx, 0, 0, w, h, Math.min(w, h) * .05); ctx.stroke()
  ctx.save(); roundRect(ctx, 0, 0, w, h, Math.min(w, h) * .05); ctx.clip()
  const bar = titleBar(ctx, w, h, title || (style === 'chat' ? 'Conversation' : style === 'alert' ? 'Elsewhere' : 'Now Playing'))
  ctx.restore()
  const pad = bar * .5
  const size = Math.max(9, Math.round(bar * .55))
  ctx.font = `${size}px Tahoma, sans-serif`; ctx.textBaseline = 'top'
  if (style === 'chat') {
    let y = bar + pad
    for (const [index, line] of lines.slice(0, 8).entries()) {
      const [who, ...rest] = line.split(':')
      const text = rest.join(':').trim()
      ctx.fillStyle = index % 2 ? '#0850b4' : '#2a8a2a'; ctx.font = `bold ${size}px Tahoma, sans-serif`
      ctx.fillText((text ? who : 'you').trim() + ' says:', pad, y, w - pad * 2)
      ctx.fillStyle = '#101a31'; ctx.font = `${size}px Tahoma, sans-serif`
      ctx.fillText(text || line, pad * 1.6, y + size * 1.2, w - pad * 3)
      y += size * 2.7
      if (y > h - pad) break
    }
  } else if (style === 'alert') {
    ctx.font = `${Math.round(size * 1.8)}px "Segoe UI Emoji", sans-serif`; ctx.fillText('💌', pad, bar + pad)
    ctx.fillStyle = '#101a31'; ctx.font = `${size}px Tahoma, sans-serif`
    lines.slice(0, 4).forEach((line, index) => ctx.fillText(line, pad + size * 2.6, bar + pad + index * size * 1.4, w - pad * 2 - size * 2.6))
    const bw = w * .28, bh = size * 1.8
    const button = ctx.createLinearGradient(0, h - pad - bh, 0, h - pad)
    button.addColorStop(0, '#ffffff'); button.addColorStop(1, '#d9ecff')
    ctx.fillStyle = button; roundRect(ctx, w - pad - bw, h - pad - bh, bw, bh, bh * .25); ctx.fill()
    ctx.strokeStyle = '#8aafd9'; ctx.stroke()
    ctx.fillStyle = '#06418d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('OK', w - pad - bw / 2, h - pad - bh / 2)
  } else {
    ctx.fillStyle = '#101a31'; ctx.font = `bold ${size}px Tahoma, sans-serif`
    ctx.fillText((lines[0] || 'song title').slice(0, 60), pad, bar + pad, w - pad * 2)
    ctx.font = `${size}px Tahoma, sans-serif`; ctx.fillStyle = '#3f5677'
    ctx.fillText((lines[1] || 'artist').slice(0, 60), pad, bar + pad + size * 1.4, w - pad * 2)
    const trackY = h - pad - size * 2.2
    ctx.fillStyle = '#c8dcf4'; roundRect(ctx, pad, trackY, w - pad * 2, size * .5, size * .25); ctx.fill()
    ctx.fillStyle = '#2388ed'; roundRect(ctx, pad, trackY, (w - pad * 2) * .42, size * .5, size * .25); ctx.fill()
    ctx.fillStyle = '#06418d'; ctx.font = `${Math.round(size * 1.1)}px "Segoe UI Symbol", sans-serif`; ctx.textAlign = 'center'
    ctx.fillText('⏮   ▶   ⏭', w / 2, trackY + size * .9)
  }
  ctx.restore()
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: { points: number[]; color: string; size: number }[]) {
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.size
    ctx.beginPath(); ctx.moveTo(stroke.points[0], stroke.points[1])
    for (let i = 2; i < stroke.points.length; i += 2) ctx.lineTo(stroke.points[i], stroke.points[i + 1])
    if (stroke.points.length === 2) ctx.lineTo(stroke.points[0] + .1, stroke.points[1])
    ctx.stroke()
  }
  ctx.restore()
}
