// The official Elsewhere Video Player skins (approved board, Cyber 2026-11-27). Each is the
// board's decorative frame (bubbles, wings, disc, water, vines) cut from the art, with the real
// video window placed where the board's window sits. Boxes are in the art's own pixels (1×).

export type VideoSkin = {
  id: string
  name: string
  icon: string
  art: string
  width: number
  height: number
  window: { x: number; y: number; w: number; h: number }
  accent: string
}

const url = (name: string) => `/media-skins/${name}@2x.webp`

export const VIDEO_SKINS: VideoSkin[] = [
  { id: 'bubble', name: 'Bubble Machine', icon: '🫧', art: url('video-bubble'), width: 528, height: 368, window: { x: 44, y: 60, w: 454, h: 284 }, accent: '#7fe0ff' },
  { id: 'butterfly', name: 'Butterfly Frequency', icon: '🦋', art: url('video-butterfly'), width: 634, height: 362, window: { x: 100, y: 60, w: 436, h: 276 }, accent: '#a8ff6a' },
  { id: 'dreamdisc', name: 'DreamDisc', icon: '💿', art: url('video-dreamdisc'), width: 482, height: 298, window: { x: 98, y: 20, w: 376, h: 262 }, accent: '#c6b6f3' },
  { id: 'liquid', name: 'Liquid Radio', icon: '🌊', art: url('video-liquid'), width: 444, height: 304, window: { x: 38, y: 22, w: 402, h: 250 }, accent: '#4fd8ff' },
  { id: 'garden', name: 'Glass Garden', icon: '🌿', art: url('video-garden'), width: 476, height: 300, window: { x: 40, y: 27, w: 432, h: 236 }, accent: '#9bf05a' },
]

export const findVideoSkin = (id: string) => VIDEO_SKINS.find(skin => skin.id === id)
