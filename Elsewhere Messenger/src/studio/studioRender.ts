import { studioStickers } from './studioStickers'
import { readLocalImage } from '../services/messengerMedia'
import { getTreasureFile } from '../services/treasureVaultDb'
import { getTreasure, treasureUrl, treasureRevision } from '../services/webTreasures'
import { drawMiniUi, drawStationery, drawStrokes } from './studioDrawn'
import { FILTERS, TEXT_STYLES, type FrameLayer, type Layer, type StudioDoc, type TextLayer } from './studioModel'

// Draws a Studio document to a new canvas for export. Editing handles and panels are
// never part of it, and the source photos are only read.

const blobs = new Map<string, Promise<Blob | null>>()
let lastRevision = 0
function refreshTreasureCache() {
  const revision = treasureRevision()
  if (lastRevision === revision) return
  lastRevision = revision
  for (const key of blobs.keys()) if (key.startsWith('treasure:')) blobs.delete(key)
  for (const [key, promise] of urls) {
    if (!key.startsWith('treasure:')) continue
    urls.delete(key)
    void promise.then(url => { if (url) URL.revokeObjectURL(url) })
  }
}
/** Reads a photo or Web Treasure from this PC (cached for the session). */
export function mediaBlob(id: string, kind: 'local' | 'treasure' | 'studio-sticker'): Promise<Blob | null> {
  refreshTreasureCache()
  const key = kind + ':' + id
  let found = blobs.get(key)
  if (!found) {
    found = (async () => {
      if (kind === 'local') return (await readLocalImage(id)) || null
      if (kind === 'studio-sticker') {
        const sticker = studioStickers.get(id)
        if (!sticker) return null
        const response = await fetch(sticker.url)
        return response.ok ? response.blob() : null
      }
      const saved = await getTreasureFile(id)
      if (saved) return saved
      const item = await getTreasure(id)
      if (!item) return null
      const response = await fetch(treasureUrl(item))
      return response.ok ? response.blob() : null
    })().catch(() => null)
    blobs.set(key, found)
  }
  return found
}

const urls = new Map<string, Promise<string | null>>()
/** An object URL for showing a library image in the editor. */
export function mediaUrl(id: string, kind: 'local' | 'treasure' | 'studio-sticker') {
  refreshTreasureCache()
  const key = kind + ':' + id
  let found = urls.get(key)
  if (!found) {
    found = mediaBlob(id, kind).then(blob => blob ? URL.createObjectURL(blob) : null)
    urls.set(key, found)
  }
  return found
}

async function bitmap(id: string, kind: 'local' | 'treasure' | 'studio-sticker') {
  const blob = await mediaBlob(id, kind)
  return blob ? createImageBitmap(blob) : null
}

function drawFrame(ctx: CanvasRenderingContext2D, layer: FrameLayer) {
  const { w, h, color, style } = layer
  const unit = Math.min(w, h)
  ctx.save()
  if (style === 'polaroid') {
    const side = unit * .05
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, side)
    ctx.fillRect(0, 0, side, h)
    ctx.fillRect(w - side, 0, side, h)
    ctx.fillRect(0, h - unit * .18, w, unit * .18)
  } else if (style === 'soft-white' || style === 'sky-glass' || style === 'pink-bubble') {
    const width = unit * (style === 'pink-bubble' ? .07 : .045)
    ctx.lineWidth = width
    ctx.strokeStyle = color
    const r = style === 'pink-bubble' ? unit * .09 : unit * .03
    ctx.beginPath()
    ctx.roundRect(width / 2, width / 2, w - width, h - width, r)
    ctx.stroke()
    if (style === 'sky-glass') {
      ctx.lineWidth = Math.max(1, width * .18)
      ctx.strokeStyle = 'rgba(255,255,255,.85)'
      ctx.beginPath()
      ctx.roundRect(width * .9, width * .9, w - width * 1.8, h - width * 1.8, r * .7)
      ctx.stroke()
    }
  } else if (style === 'dashed-stitch') {
    ctx.lineWidth = Math.max(2, unit * .008)
    ctx.strokeStyle = color
    ctx.setLineDash([unit * .025, unit * .018])
    ctx.strokeRect(unit * .035, unit * .035, w - unit * .07, h - unit * .07)
  } else if (style === 'film-strip') {
    const band = unit * .09
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, band)
    ctx.fillRect(0, h - band, w, band)
    ctx.fillStyle = '#f4f4f4'
    const hole = band * .38
    for (let x = band * .4; x < w - hole; x += band * .8) {
      ctx.fillRect(x, (band - hole) / 2, hole, hole)
      ctx.fillRect(x, h - band + (band - hole) / 2, hole, hole)
    }
  }
  ctx.restore()
}

export function textFont(layer: TextLayer) {
  const style = TEXT_STYLES[layer.style]
  return `${style.weight} ${layer.size}px ${style.font}`
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  ctx.font = textFont(layer)
  ctx.textBaseline = 'middle'
  ctx.textAlign = layer.align
  const x = layer.align === 'left' ? 0 : layer.align === 'right' ? layer.w : layer.w / 2
  const lines = layer.text.split('\n')
  const lineHeight = layer.size * 1.2
  const top = layer.h / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => {
    const y = top + index * lineHeight
    if (layer.outline && layer.outline !== 'transparent') {
      ctx.lineWidth = Math.max(2, layer.size * .14)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = layer.outline
      ctx.strokeText(line, x, y)
    }
    ctx.fillStyle = layer.color
    if (layer.style === 'glitter') { ctx.shadowColor = '#fff6ba'; ctx.shadowBlur = layer.size * .3 }
    ctx.fillText(line, x, y)
    ctx.shadowBlur = 0
  })
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  if (layer.hidden) return
  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2)
  ctx.rotate((layer.rotation * Math.PI) / 180)
  if (layer.flipX) ctx.scale(-1, 1)
  ctx.translate(-layer.w / 2, -layer.h / 2)
  ctx.imageSmoothingEnabled = !layer.pixelated
  ctx.imageSmoothingQuality = 'high'
  if (layer.type === 'slot') {
    // Empty photo spots aren't part of the finished image.
  } else if (layer.type === 'stationery') drawStationery(ctx, layer.w, layer.h, layer.style, layer.color)
  else if (layer.type === 'mini-ui') drawMiniUi(ctx, layer.w, layer.h, layer.style, layer.title, layer.lines)
  else if (layer.type === 'draw') { ctx.scale(layer.w / layer.baseW, layer.h / layer.baseH); drawStrokes(ctx, layer.strokes) }
  else if (layer.type === 'image') {
    const image = await bitmap(layer.mediaId, layer.mediaKind)
    if (image) {
      if (layer.cover) {
        const scale = Math.max(layer.w / image.width, layer.h / image.height)
        const sw = layer.w / scale, sh = layer.h / scale
        ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, layer.w, layer.h)
      } else ctx.drawImage(image, 0, 0, layer.w, layer.h)
      image.close()
    }
  } else if (layer.type === 'sticker') {
    ctx.font = `${Math.round(layer.h * .86)}px "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#e8578a'
    ctx.fillText(layer.glyph, layer.w / 2, layer.h / 2 + layer.h * .04)
  } else if (layer.type === 'text') drawText(ctx, layer)
  else drawFrame(ctx, layer)
  ctx.restore()
}

/**
 * Renders the document. `opaque` fills transparency (needed for JPEG).
 * Returns a canvas the size of the document; callers export it.
 */
export async function renderDoc(doc: StudioDoc, opaque?: string, size = 1): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(doc.width * size)
  canvas.height = Math.round(doc.height * size)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This PC couldn’t prepare the image.')
  // Everything is drawn from the original files at the final size, so resizing never blurs twice.
  ctx.scale(size, size)
  ctx.imageSmoothingQuality = 'high'
  const fill = opaque || (doc.background === 'transparent' ? '' : doc.background)
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, doc.width, doc.height) }
  if (doc.photoId) {
    const photo = await bitmap(doc.photoId, 'local')
    if (photo) {
      ctx.save()
      ctx.filter = FILTERS[doc.filter].css(doc.filterStrength)
      const box = doc.photoBox || { x: 0, y: 0, w: doc.width, h: doc.height }
      ctx.drawImage(photo, box.x, box.y, box.w, box.h)
      ctx.restore()
      photo.close()
    }
  }
  for (const layer of doc.layers) await drawLayer(ctx, layer)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = .92) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The image couldn’t be created.')), type, quality))
}

/** A small preview for project lists. */
export async function thumbnail(doc: StudioDoc) {
  const full = await renderDoc(doc)
  const scale = 240 / Math.max(full.width, full.height)
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(full.width * scale))
  small.height = Math.max(1, Math.round(full.height * scale))
  small.getContext('2d')?.drawImage(full, 0, 0, small.width, small.height)
  return small.toDataURL('image/jpeg', .8)
}
