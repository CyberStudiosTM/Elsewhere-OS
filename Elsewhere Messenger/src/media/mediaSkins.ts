// The official Elsewhere Media Player skins: Cyber's approved designs, cut from the official
// board, with Elsewhere's real controls placed on the art. Positions are in the art's own
// pixels (1×); the player scales them with the art. Every control is always present (Cyber,
// 2026-11-27: skins change art and positions only).

export type Control = 'play' | 'prev' | 'next' | 'stop' | 'shuffle' | 'repeat' | 'library' | 'like' | 'minimize' | 'close' | 'mute'
export type Box = { x: number; y: number; w: number; h: number }
export type Hotspot = { control: Control; x: number; y: number; r: number }
export type DisplayStyle = 'stack' | 'row' | 'lcd'
export type MusicSkin = {
  id: string
  name: string
  blurb: string
  art: string
  width: number
  height: number
  display: Box & { style: DisplayStyle; radius: number }
  visualizer: Box & { style: 'bars' | 'wave' | 'bubbles'; behind?: boolean }
  hotspots: Hotspot[]
  /** A volume slider drawn on the art (Liquid Radio). */
  volume?: { x: number; y: number; w: number }
  /** A spinning shine over the art (DreamDisc's disc). */
  spin?: { x: number; y: number; rx: number; ry: number }
  accent: string
}

const url = (name: string) => `/media-skins/${name}@2x.webp`

export const MUSIC_SKINS: MusicSkin[] = [
  {
    id: 'bubble', name: 'Bubble Machine', blurb: 'A luminous, spherical player with music-reactive bubbles.', art: url('music-bubble'), width: 443, height: 393,
    display: { x: 148, y: 50, w: 154, h: 182, style: 'stack', radius: 22 },
    visualizer: { x: 132, y: 234, w: 196, h: 40, style: 'bubbles' },
    hotspots: [
      { control: 'shuffle', x: 80, y: 293, r: 16 }, { control: 'prev', x: 148, y: 323, r: 22 }, { control: 'play', x: 223, y: 323, r: 34 },
      { control: 'next', x: 298, y: 323, r: 22 }, { control: 'repeat', x: 362, y: 293, r: 16 },
      { control: 'minimize', x: 312, y: 48, r: 11 }, { control: 'close', x: 345, y: 48, r: 11 },
    ],
    accent: '#7fe0ff',
  },
  {
    id: 'butterfly', name: 'Butterfly Frequency', blurb: 'A graceful winged player with animated wings and dual visualizers.', art: url('music-butterfly'), width: 576, height: 404,
    display: { x: 244, y: 88, w: 98, h: 146, style: 'stack', radius: 30 },
    visualizer: { x: 240, y: 238, w: 106, h: 40, style: 'bars' },
    hotspots: [
      { control: 'shuffle', x: 97, y: 288, r: 18 }, { control: 'prev', x: 234, y: 317, r: 18 }, { control: 'play', x: 291, y: 318, r: 28 },
      { control: 'next', x: 349, y: 317, r: 18 }, { control: 'repeat', x: 477, y: 289, r: 18 }, { control: 'library', x: 449, y: 328, r: 16 },
      { control: 'minimize', x: 494, y: 48, r: 11 }, { control: 'close', x: 527, y: 48, r: 11 },
    ],
    accent: '#a8ff6a',
  },
  {
    id: 'dreamdisc', name: 'DreamDisc', blurb: 'A modern tribute to portable CD players, with a spinning disc.', art: url('music-dreamdisc'), width: 408, height: 400,
    display: { x: 80, y: 238, w: 288, h: 62, style: 'lcd', radius: 12 },
    visualizer: { x: 268, y: 244, w: 94, h: 50, style: 'bars' },
    hotspots: [
      { control: 'stop', x: 96, y: 338, r: 16 }, { control: 'prev', x: 149, y: 342, r: 20 }, { control: 'play', x: 216, y: 342, r: 30 },
      { control: 'next', x: 286, y: 342, r: 20 }, { control: 'library', x: 341, y: 338, r: 16 },
    ],
    spin: { x: 211, y: 170, rx: 146, ry: 52 },
    accent: '#c6b6f3',
  },
  {
    id: 'liquid', name: 'Liquid Radio', blurb: 'A flowing, water-inspired player with a living waveform.', art: url('music-liquid'), width: 732, height: 270,
    display: { x: 96, y: 70, w: 246, h: 92, style: 'row', radius: 16 },
    visualizer: { x: 350, y: 72, w: 300, h: 96, style: 'wave' },
    hotspots: [
      { control: 'shuffle', x: 85, y: 201, r: 16 }, { control: 'library', x: 130, y: 201, r: 15 }, { control: 'prev', x: 262, y: 201, r: 21 },
      { control: 'play', x: 338, y: 201, r: 32 }, { control: 'next', x: 413, y: 201, r: 21 }, { control: 'mute', x: 535, y: 201, r: 13 },
      { control: 'repeat', x: 645, y: 201, r: 15 }, { control: 'minimize', x: 617, y: 58, r: 11 }, { control: 'close', x: 650, y: 58, r: 11 },
    ],
    volume: { x: 552, y: 201, w: 50 },
    accent: '#4fd8ff',
  },
  {
    id: 'garden', name: 'Glass Garden', blurb: 'A whimsical glass stereo with living plants and soft light.', art: url('music-garden'), width: 764, height: 310,
    display: { x: 210, y: 156, w: 340, h: 74, style: 'row', radius: 14 },
    visualizer: { x: 342, y: 74, w: 212, h: 74, style: 'bars', behind: true },
    hotspots: [
      { control: 'shuffle', x: 222, y: 261, r: 16 }, { control: 'prev', x: 302, y: 261, r: 20 }, { control: 'play', x: 375, y: 261, r: 30 },
      { control: 'next', x: 447, y: 261, r: 20 }, { control: 'repeat', x: 523, y: 261, r: 16 },
      { control: 'minimize', x: 543, y: 60, r: 11 }, { control: 'close', x: 575, y: 60, r: 11 },
    ],
    accent: '#9bf05a',
  },
]

export const CLASSIC = 'classic'
export const findMusicSkin = (id: string) => MUSIC_SKINS.find(skin => skin.id === id)
