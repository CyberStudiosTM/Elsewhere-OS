// Studio document model (Phase 1b). A project is a stack of layers over an
// untouched base photo. Edits never change the source image; the look is applied
// when rendering, and exports are new files.

export type FilterName = 'none' | 'dream-glow' | 'rose-tint' | 'blue-glass' | 'soft-mono' | 'film-warm' | 'webcam-glow'
export const FILTERS: Record<FilterName, { label: string; css: (strength: number) => string }> = {
  none: { label: 'Original', css: () => 'none' },
  'dream-glow': { label: 'Dream Glow', css: s => `brightness(${1 + .12 * s}) saturate(${1 + .28 * s}) contrast(${1 - .08 * s})` },
  'rose-tint': { label: 'Rose Tint', css: s => `sepia(${.23 * s}) saturate(${1 + .55 * s}) hue-rotate(${-30 * s}deg)` },
  'blue-glass': { label: 'Blue Glass', css: s => `sepia(${.25 * s}) hue-rotate(${155 * s}deg) brightness(${1 + .06 * s}) saturate(${1 + .2 * s})` },
  'soft-mono': { label: 'Soft Monochrome', css: s => `grayscale(${s}) contrast(${1 - .12 * s})` },
  'film-warm': { label: 'Warm Film', css: s => `sepia(${.35 * s}) contrast(${1 + .08 * s}) brightness(${1 + .04 * s})` },
  'webcam-glow': { label: 'Webcam Glow', css: s => `brightness(${1 + .18 * s}) contrast(${1 - .15 * s}) saturate(${1 + .15 * s}) blur(${.4 * s}px)` },
}

export type FrameStyle = 'polaroid' | 'soft-white' | 'sky-glass' | 'dashed-stitch' | 'pink-bubble' | 'film-strip'
export const FRAMES: Record<FrameStyle, string> = {
  polaroid: 'Polaroid',
  'soft-white': 'Soft White',
  'sky-glass': 'Sky Glass',
  'dashed-stitch': 'Stitched',
  'pink-bubble': 'Pink Bubble',
  'film-strip': 'Film Strip',
}

export type TextStyle = 'bubble' | 'pixel' | 'handwritten' | 'glitter' | 'plain'
export const TEXT_STYLES: Record<TextStyle, { label: string; font: string; weight: number }> = {
  bubble: { label: 'Bubble', font: '"Segoe UI Black", "Arial Rounded MT Bold", "Segoe UI", sans-serif', weight: 900 },
  pixel: { label: 'Pixel', font: '"Courier New", "Lucida Console", monospace', weight: 700 },
  handwritten: { label: 'Handwritten', font: '"Segoe Print", "Comic Sans MS", cursive', weight: 400 },
  glitter: { label: 'Glitter', font: '"Segoe UI", sans-serif', weight: 800 },
  plain: { label: 'Plain', font: '"Segoe UI", Tahoma, sans-serif', weight: 600 },
}

type LayerBase = {
  id: string
  name: string
  /** Position and size in canvas pixels (top-left corner, before rotation). */
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  flipX: boolean
  hidden: boolean
  locked: boolean
  /** Nearest-neighbor scaling for crisp pixel art. */
  pixelated: boolean
}
export type MediaKind = 'local' | 'treasure' | 'studio-sticker'
export type ImageLayer = LayerBase & {
  type: 'image'; mediaId: string; mediaKind: MediaKind; /** Fill the box and crop the overflow (collage photos). */ cover?: boolean
  /** The picture before its background was removed, so it can be restored. */
  originalMediaId?: string; originalKind?: MediaKind
}
/** An empty photo spot in a collage or strip, waiting for a picture. Not drawn in exports. */
export type SlotLayer = LayerBase & { type: 'slot' }
export type StickerLayer = LayerBase & { type: 'sticker'; glyph: string }
export type TextLayer = LayerBase & { type: 'text'; text: string; style: TextStyle; color: string; outline: string; size: number; align: 'left' | 'center' | 'right' }
export type FrameLayer = LayerBase & { type: 'frame'; style: FrameStyle; color: string }
import type { MiniUiStyle, StationeryStyle } from './studioDrawn'
export type StationeryLayer = LayerBase & { type: 'stationery'; style: StationeryStyle; color: string }
export type MiniUiLayer = LayerBase & { type: 'mini-ui'; style: MiniUiStyle; title: string; lines: string[] }
export type Stroke = { points: number[]; color: string; size: number }
/** Pen drawing. Points are in the layer's original size (baseW × baseH) and scale with it. */
export type DrawLayer = LayerBase & { type: 'draw'; strokes: Stroke[]; baseW: number; baseH: number }
export type Layer = ImageLayer | StickerLayer | TextLayer | FrameLayer | SlotLayer | StationeryLayer | MiniUiLayer | DrawLayer

export type StudioDoc = {
  /** What it's for: a decorated photo, a photo strip or a collage (strips save to Photo Strips). */
  kind?: 'photo' | 'strip' | 'collage'
  width: number
  height: number
  /** Base photo in the local image library. Never modified. */
  photoId: string | null
  /** Where the base photo sits after the canvas was resized (fills the whole canvas when missing). */
  photoBox?: { x: number; y: number; w: number; h: number }
  background: string
  filter: FilterName
  filterStrength: number
  layers: Layer[]
}

export type StudioProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  doc: StudioDoc
  thumbnail?: string
  /** The conversation the photo came from, so Use in Messenger never guesses. */
  sourceContactId?: string | null
  sourceContactName?: string
  /** Set when moved to Trash in My Gallery. */
  deletedAt?: string
}

export const newId = () => crypto.randomUUID()

export type CollageLayout = { id: string; label: string; kind: 'strip' | 'collage'; width: number; height: number; background: string; boxes: [number, number, number, number, number][] }
/** Approved collage layouts: two- and four-shot strips, grids and spreads. Boxes are x, y, w, h, rotation. */
export const COLLAGE_LAYOUTS: CollageLayout[] = [
  { id: 'strip-2', label: 'Photo strip · 2 shots', kind: 'strip', width: 600, height: 1440, background: '#ffffff', boxes: [[40, 40, 520, 640, 0], [40, 720, 520, 640, 0]] },
  { id: 'strip-4', label: 'Photo strip · 4 shots', kind: 'strip', width: 600, height: 2120, background: '#ffffff', boxes: [0, 1, 2, 3].map(i => [40, 40 + i * 500, 520, 460, 0] as [number, number, number, number, number]) },
  { id: 'grid-4', label: 'Grid · 2 × 2', kind: 'collage', width: 1200, height: 1200, background: '#ffffff', boxes: [[30, 30, 555, 555, 0], [615, 30, 555, 555, 0], [30, 615, 555, 555, 0], [615, 615, 555, 555, 0]] },
  { id: 'pile-3', label: 'Photo pile', kind: 'collage', width: 1400, height: 1000, background: '#dff1ff', boxes: [[120, 140, 560, 420, -8], [620, 90, 560, 420, 6], [380, 470, 560, 420, -2]] },
  { id: 'moodboard-5', label: 'Moodboard', kind: 'collage', width: 1500, height: 1000, background: '#fff6df', boxes: [[40, 40, 700, 480, 0], [780, 40, 680, 300, 0], [780, 380, 330, 580, 0], [1130, 380, 330, 280, 0], [40, 560, 700, 400, 0]] },
]
export function collageDoc(layout: CollageLayout): StudioDoc {
  return {
    kind: layout.kind, width: layout.width, height: layout.height, photoId: null, background: layout.background, filter: 'none', filterStrength: 1,
    layers: layout.boxes.map(([x, y, w, h, rotation], index) => ({
      id: newId(), name: `Photo spot ${index + 1}`, x, y, w, h, rotation, opacity: 1, flipX: false, hidden: false, locked: false, pixelated: false, type: 'slot' as const,
    })),
  }
}

/** Ready-made canvas sizes. */
export const CANVAS_PRESETS: { id: string; label: string; width: number; height: number }[] = [
  { id: 'ig-post', label: 'Instagram post (portrait 4:5)', width: 1080, height: 1350 },
  { id: 'ig-square', label: 'Instagram post (square)', width: 1080, height: 1080 },
  { id: 'ig-story', label: 'Instagram story / reel', width: 1080, height: 1920 },
  { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920 },
  { id: 'pfp', label: 'Profile picture', width: 800, height: 800 },
  { id: 'banner', label: 'Elsewhere profile banner', width: 960, height: 300 },
  { id: 'yt-thumb', label: 'YouTube thumbnail', width: 1280, height: 720 },
  { id: 'wallpaper', label: 'Desktop wallpaper (HD)', width: 1920, height: 1080 },
  { id: 'phone', label: 'Phone wallpaper', width: 1170, height: 2532 },
  { id: 'blinkie', label: 'Blinkie (old web)', width: 150, height: 20 },
  { id: 'button', label: '88×31 button (old web)', width: 88, height: 31 },
  { id: 'classic', label: 'Classic photo (4:3)', width: 1200, height: 900 },
]
export type ResizeMode = 'fit' | 'fill' | 'canvas'
export const RESIZE_MODES: Record<ResizeMode, string> = {
  fit: 'Scale everything to fit (nothing cut off)',
  fill: 'Scale everything to fill (edges may be cut off)',
  canvas: 'Keep sizes, just change the canvas (centered)',
}

/** A copy of the document at a new canvas size. Pictures keep their original files, so nothing loses quality. */
export function resizeDoc(doc: StudioDoc, width: number, height: number, mode: ResizeMode): StudioDoc {
  const scale = mode === 'canvas' ? 1 : mode === 'fit' ? Math.min(width / doc.width, height / doc.height) : Math.max(width / doc.width, height / doc.height)
  const ox = (width - doc.width * scale) / 2
  const oy = (height - doc.height * scale) / 2
  const box = doc.photoBox || { x: 0, y: 0, w: doc.width, h: doc.height }
  const round = (value: number) => Math.round(value * 100) / 100
  const layers = doc.layers.map(layer => {
    // Frames that covered the whole picture keep covering it.
    if (layer.type === 'frame' && layer.x === 0 && layer.y === 0 && layer.w === doc.width && layer.h === doc.height) return { ...layer, w: width, h: height }
    const moved = { ...layer, x: round(ox + layer.x * scale), y: round(oy + layer.y * scale), w: Math.max(1, round(layer.w * scale)), h: Math.max(1, round(layer.h * scale)) }
    return layer.type === 'text' ? { ...moved, size: Math.max(4, round(layer.size * scale)) } as Layer : moved as Layer
  })
  return {
    ...doc, width, height, layers,
    photoBox: doc.photoId ? { x: round(ox + box.x * scale), y: round(oy + box.y * scale), w: round(box.w * scale), h: round(box.h * scale) } : undefined,
  }
}

export function blankDoc(width = 1200, height = 900): StudioDoc {
  return { width, height, photoId: null, background: '#ffffff', filter: 'none', filterStrength: 1, layers: [] }
}

function base(name: string, doc: StudioDoc, w: number, h: number): LayerBase {
  return { id: newId(), name, x: Math.round((doc.width - w) / 2), y: Math.round((doc.height - h) / 2), w, h, rotation: 0, opacity: 1, flipX: false, hidden: false, locked: false, pixelated: false }
}
export function stickerLayer(doc: StudioDoc, glyph: string): StickerLayer {
  const size = Math.round(Math.min(doc.width, doc.height) * .22)
  return { ...base('Sticker ' + glyph, doc, size, size), type: 'sticker', glyph }
}
export function textLayer(doc: StudioDoc, text = 'looking cute! ♡'): TextLayer {
  const size = Math.round(Math.min(doc.width, doc.height) * .08)
  return { ...base('Text', doc, Math.round(doc.width * .6), Math.round(size * 1.6)), type: 'text', text, style: 'bubble', color: '#ffffff', outline: '#e8578a', size, align: 'center' }
}
export function frameLayer(doc: StudioDoc, style: FrameStyle): FrameLayer {
  const color = style === 'pink-bubble' ? '#f6afd6' : style === 'sky-glass' ? '#8fd0fb' : style === 'film-strip' ? '#1b1b1f' : '#ffffff'
  return { ...base(FRAMES[style] + ' frame', doc, doc.width, doc.height), x: 0, y: 0, type: 'frame', style, color, locked: false }
}
export function stationeryLayer(doc: StudioDoc, style: StationeryStyle): StationeryLayer {
  const unit = Math.min(doc.width, doc.height)
  const washi = style.startsWith('washi')
  const w = Math.round(unit * (washi ? .5 : style === 'ticket' ? .42 : .3))
  const h = Math.round(unit * (washi ? .09 : style === 'ticket' ? .18 : style === 'postage' ? .36 : .3))
  const color = style === 'washi-stripes' ? '#f6afd6' : style === 'washi-dots' ? '#8fd0fb' : style === 'washi-hearts' ? '#ffb3c6' : style === 'washi-gingham' ? '#a8e6cf'
    : style === 'memo' ? '#fffbe0' : style === 'postage' ? '#2388ed' : '#e8578a'
  return { ...base(style.startsWith('washi') ? 'Washi tape' : style === 'memo' ? 'Memo note' : style === 'postage' ? 'Postage stamp' : 'Ticket stub', doc, w, h), rotation: washi ? -8 : 0, type: 'stationery', style, color }
}
export function miniUiLayer(doc: StudioDoc, style: MiniUiStyle): MiniUiLayer {
  const unit = Math.min(doc.width, doc.height)
  const w = Math.round(unit * (style === 'chat' ? .55 : .45))
  const h = Math.round(unit * (style === 'chat' ? .42 : style === 'alert' ? .22 : .24))
  const lines = style === 'chat' ? ['sunny_day: hey! are you free later?', 'you: yes!! movie night? ♡'] : style === 'alert' ? ['You’ve got a new message!'] : ['daydream.mp3', 'your favorite artist']
  return { ...base(style === 'chat' ? 'Mini chat window' : style === 'alert' ? 'Pop-up alert' : 'Now playing', doc, w, h), type: 'mini-ui', style, title: style === 'chat' ? 'sunny_day - Conversation' : style === 'alert' ? 'Elsewhere' : 'Now Playing', lines }
}
export function drawLayer(doc: StudioDoc): DrawLayer {
  return { ...base('Drawing', doc, doc.width, doc.height), x: 0, y: 0, type: 'draw', strokes: [], baseW: doc.width, baseH: doc.height }
}

export function imageLayer(doc: StudioDoc, mediaId: string, mediaKind: 'local' | 'treasure' | 'studio-sticker', naturalW: number, naturalH: number, name: string): ImageLayer {
  const scale = Math.min(1, (Math.min(doc.width, doc.height) * .4) / Math.max(naturalW, naturalH))
  const w = Math.max(8, Math.round(naturalW * scale))
  const h = Math.max(8, Math.round(naturalH * scale))
  return { ...base(name, doc, w, h), type: 'image', mediaId, mediaKind }
}

/** Starter stickers drawn from system emoji. These are placeholders until licensed packs are added. */
export const STARTER_STICKERS = ['♡', '💖', '💕', '✨', '⭐', '🌟', '🎀', '🌸', '🌈', '☁️', '🦋', '🍓', '🍰', '🧁', '🍦', '🐰', '🐱', '🐻', '🌙', '💫', '💌', '🎧', '📸', '💿']
