// SkinMapper pattern maker: seamless stationery textures drawn on this PC, saved as PNGs
// into the skin project like any imported image (so packages stay self-contained).

export type PatternKind = 'gingham' | 'polka' | 'memo-dots' | 'ruled' | 'grid' | 'checker' | 'stripes' | 'scallop'
export const PATTERNS: Record<PatternKind, string> = {
  gingham: 'Gingham', polka: 'Polka dots', 'memo-dots': 'Dotted memo paper', ruled: 'Ruled notebook paper',
  grid: 'Grid paper', checker: 'Checkerboard', stripes: 'Candy stripes', scallop: 'Scalloped trim',
}

/** Draws one seamless tile. `base` is the paper color, `ink` the pattern color. */
export function drawPattern(ctx: CanvasRenderingContext2D, kind: PatternKind, size: number, base: string, ink: string) {
  const s = size
  ctx.fillStyle = base
  ctx.fillRect(0, 0, s, kind === 'scallop' ? s / 2 : s)
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  if (kind === 'gingham') {
    ctx.globalAlpha = .35; ctx.fillRect(0, 0, s / 2, s); ctx.fillRect(0, 0, s, s / 2)
    ctx.globalAlpha = .35; ctx.fillRect(0, 0, s / 2, s / 2)
  } else if (kind === 'polka') {
    ctx.globalAlpha = .55
    for (const [x, y] of [[s / 4, s / 4], [s * 3 / 4, s * 3 / 4]]) { ctx.beginPath(); ctx.arc(x, y, s * .09, 0, Math.PI * 2); ctx.fill() }
  } else if (kind === 'memo-dots') {
    ctx.globalAlpha = .45
    for (let x = s / 8; x < s; x += s / 4) for (let y = s / 8; y < s; y += s / 4) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, s * .025), 0, Math.PI * 2); ctx.fill() }
  } else if (kind === 'ruled') {
    ctx.globalAlpha = .4; ctx.lineWidth = Math.max(1, s / 48)
    ctx.beginPath(); ctx.moveTo(0, s - ctx.lineWidth / 2); ctx.lineTo(s, s - ctx.lineWidth / 2); ctx.stroke()
  } else if (kind === 'grid') {
    ctx.globalAlpha = .3; ctx.lineWidth = Math.max(1, s / 64)
    ctx.beginPath(); ctx.moveTo(0, .5); ctx.lineTo(s, .5); ctx.moveTo(.5, 0); ctx.lineTo(.5, s); ctx.stroke()
  } else if (kind === 'checker') {
    ctx.globalAlpha = .6; ctx.fillRect(0, 0, s / 2, s / 2); ctx.fillRect(s / 2, s / 2, s / 2, s / 2)
  } else if (kind === 'stripes') {
    ctx.globalAlpha = .45
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s / 2, 0); ctx.lineTo(0, s / 2); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, s / 2); ctx.lineTo(s / 2, s); ctx.lineTo(0, s); ctx.closePath(); ctx.fill()
  } else if (kind === 'scallop') {
    ctx.globalAlpha = 1; ctx.fillStyle = ink
    ctx.beginPath(); ctx.arc(s / 2, 0, s / 2, 0, Math.PI); ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** A PNG tile, ready to import as a project asset. */
export async function patternPng(kind: PatternKind, base: string, ink: string, size = 32): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = kind === 'scallop' ? size / 2 : size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Patterns aren’t available on this PC.')
  drawPattern(ctx, kind, size, base, ink)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The pattern couldn’t be made.')), 'image/png'))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}
