import { CANVAS, composeLayers, readLibrary, type DollProject, type Layer, type Library } from './dollModel'
import { PLACEHOLDER_LIBRARY } from './placeholderLibrary'

// Draws a doll at native size (128×256), then scales it up with nearest-neighbour only,
// so every pixel stays a crisp square (never blurred, never resampled).

const images = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(src: string) {
  let found = images.get(src)
  if (!found) {
    found = new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src })
    images.set(src, found)
  }
  return found
}

/** Library art paths can say {skin} or {color} to pick the version for the chosen tone or color. */
export function spritePath(src: string, layer: Pick<Layer, 'skin' | 'tint'>) {
  return src.replace('{skin}', layer.skin?.id || 'tone-1').replace('{color}', (layer.tint || '').replace('#', ''))
}

function fillFor(layer: Layer, color: string | undefined) {
  const want = color || layer.tint || layer.item?.colors?.[0] || '#9aa3b5'
  const skin = /^skin:([012])$/.exec(want)
  return skin ? (layer.skin?.ramp[Number(skin[1])] || '#d8b4a0') : want
}

export async function drawDoll(doll: DollProject, library: Library): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS.width; canvas.height = CANVAS.height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (const layer of composeLayers(doll, library).layers) {
    if ('rects' in layer.sprite) {
      ctx.fillStyle = fillFor(layer, layer.sprite.color)
      for (const [x, y, w, h] of layer.sprite.rects) ctx.fillRect(x, y, w, h)
    } else {
      const img = await loadImage(spritePath(layer.sprite.src, layer))
      if (img) ctx.drawImage(img, 0, 0)
    }
  }
  return canvas
}

/** Native drawing scaled up by a whole number, optionally on a solid background. */
export async function renderDoll(doll: DollProject, library: Library, scale = 1, background?: string): Promise<HTMLCanvasElement> {
  const native = await drawDoll(doll, library)
  const out = document.createElement('canvas')
  const s = Math.max(1, Math.min(8, Math.round(scale)))
  out.width = CANVAS.width * s; out.height = CANVAS.height * s
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, out.width, out.height) }
  ctx.drawImage(native, 0, 0, out.width, out.height)
  return out
}

export const canvasPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The doll picture couldn’t be made.')), 'image/png'))

/** Cyber's asset library (public/pixel-doll/library/manifest.json). Falls back to placeholders until it exists. */
export async function loadLibrary(): Promise<Library> {
  try {
    const response = await fetch('/pixel-doll/library/manifest.json', { cache: 'no-cache' })
    if (!response.ok) return PLACEHOLDER_LIBRARY
    const library = readLibrary(await response.json(), '/pixel-doll/library/', PLACEHOLDER_LIBRARY)
    return library || PLACEHOLDER_LIBRARY
  } catch { return PLACEHOLDER_LIBRARY }
}
