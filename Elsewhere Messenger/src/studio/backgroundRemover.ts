import { GIFEncoder, quantize, applyPalette } from 'gifenc'

// Background remover for stickers, graphics and GIFs. It clears the flat background
// that touches the edges of the picture (or the color under a picked point), keeps the
// same color where it's inside the artwork, and cleans the light halo around the edges.
// Every frame of an animated GIF is processed and it stays animated.

export type CutoutOptions = {
  /** How different a pixel can be from the background and still count as background (0–120). */
  tolerance?: number
  /** Remove the color under this point instead of the edge color (picture pixels). */
  point?: { x: number; y: number }
  /** Also clear the matching color everywhere, not only the connected area. */
  everywhere?: boolean
}

/** The most common opaque color around the border, or null if the border is already clear. */
export function edgeColor(data: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const counts = new Map<number, number>()
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4
    if (data[i + 3] < 128) return
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1) }
  for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y) }
  let best = -1, most = 0
  for (const [key, count] of counts) if (count > most) { most = count; best = key }
  if (best < 0) return null
  return [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4]
}

/** Clears the background in place. Returns how many pixels were cleared. */
export function cutout(data: Uint8ClampedArray, w: number, h: number, options: CutoutOptions = {}): number {
  const tol = options.tolerance ?? 34
  let bg: [number, number, number] | null
  if (options.point) {
    const px = Math.min(w - 1, Math.max(0, Math.round(options.point.x))), py = Math.min(h - 1, Math.max(0, Math.round(options.point.y)))
    const i = (py * w + px) * 4
    bg = [data[i], data[i + 1], data[i + 2]]
  } else bg = edgeColor(data, w, h)
  if (!bg) return 0
  const distance = (i: number) => Math.max(Math.abs(data[i] - bg![0]), Math.abs(data[i + 1] - bg![1]), Math.abs(data[i + 2] - bg![2]))
  const matches = (p: number) => data[p * 4 + 3] < 128 || distance(p * 4) <= tol
  const cleared = new Uint8Array(w * h)

  if (options.everywhere) {
    for (let p = 0; p < w * h; p++) if (matches(p)) cleared[p] = 1
  } else {
    const seen = new Uint8Array(w * h)
    const stack: number[] = []
    const seed = (x: number, y: number) => stack.push(y * w + x)
    if (options.point) seed(Math.round(options.point.x), Math.round(options.point.y))
    else {
      for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1) }
      for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y) }
    }
    while (stack.length) {
      const p = stack.pop()!
      if (p < 0 || p >= w * h || seen[p]) continue
      seen[p] = 1
      if (!matches(p)) continue
      cleared[p] = 1
      const x = p % w
      if (x > 0) stack.push(p - 1)
      if (x < w - 1) stack.push(p + 1)
      stack.push(p - w, p + w)
    }
  }

  // Light anti-aliased edge pixels that touch the cleared area.
  const fringe: number[] = []
  for (let p = 0; p < w * h; p++) {
    if (cleared[p] || distance(p * 4) > tol * 2.2) continue
    const x = p % w
    if ((x > 0 && cleared[p - 1]) || (x < w - 1 && cleared[p + 1]) || (p >= w && cleared[p - w]) || (p < w * (h - 1) && cleared[p + w])) fringe.push(p)
  }
  // Cleared pixels become fully empty (color too), so GIF palettes match them to the clear color.
  const empty = (p: number) => { data[p * 4] = 0; data[p * 4 + 1] = 0; data[p * 4 + 2] = 0; data[p * 4 + 3] = 0 }
  let count = 0
  for (let p = 0; p < w * h; p++) if (cleared[p]) { empty(p); count++ }
  for (const p of fringe) { empty(p); count++ }
  // Pixels that were already see-through get the same treatment.
  for (let p = 0; p < w * h; p++) if (data[p * 4 + 3] === 0) { data[p * 4] = 0; data[p * 4 + 1] = 0; data[p * 4 + 2] = 0 }
  return count
}

type Frame = { data: ImageData; delay: number }

async function decodeFrames(blob: Blob): Promise<{ frames: Frame[]; animated: boolean }> {
  const Decoder = (globalThis as unknown as { ImageDecoder?: new (init: { data: ReadableStream | ArrayBuffer; type: string }) => {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }
    decode: (options: { frameIndex: number }) => Promise<{ image: VideoFrame }>
    close: () => void
  } }).ImageDecoder
  if (blob.type === 'image/gif' && Decoder) {
    const decoder = new Decoder({ data: await blob.arrayBuffer(), type: 'image/gif' })
    await decoder.tracks.ready
    const total = decoder.tracks.selectedTrack?.frameCount || 1
    const frames: Frame[] = []
    for (let index = 0; index < total; index++) {
      const { image } = await decoder.decode({ frameIndex: index })
      const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      frames.push({ data: ctx.getImageData(0, 0, canvas.width, canvas.height), delay: Math.max(20, Math.round((image.duration || 100000) / 1000)) })
      image.close()
    }
    decoder.close()
    return { frames, animated: frames.length > 1 }
  }
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { frames: [{ data: ctx.getImageData(0, 0, canvas.width, canvas.height), delay: 100 }], animated: false }
}

/** Makes a new image with the background removed. The original is never changed. */
export async function removeBackground(blob: Blob, options: CutoutOptions = {}): Promise<{ blob: Blob; cleared: number }> {
  const { frames, animated } = await decodeFrames(blob)
  let cleared = 0
  for (const frame of frames) cleared += cutout(frame.data.data, frame.data.width, frame.data.height, options)
  if (animated) {
    const gif = GIFEncoder()
    for (const frame of frames) {
      const { data, width, height } = frame.data
      const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true })
      const index = applyPalette(data, palette, 'rgba4444')
      const clear = palette.findIndex(color => color.length > 3 && color[3] === 0)
      gif.writeFrame(index, width, height, { palette, delay: frame.delay, transparent: clear >= 0, transparentIndex: Math.max(0, clear), dispose: 2 })
    }
    gif.finish()
    return { blob: new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' }), cleared }
  }
  const { data, width, height } = frames[0].data
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d')!.putImageData(new ImageData(data, width, height), 0, 0)
  return { blob: await canvas.convertToBlob({ type: 'image/png' }), cleared }
}
