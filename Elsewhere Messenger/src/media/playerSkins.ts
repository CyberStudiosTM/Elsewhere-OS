import { strToU8, zipSync } from 'fflate'
import { MUSIC_SKINS, type Control, type DisplayStyle, type Hotspot, type MusicSkin } from './mediaSkins'
import { VIDEO_SKINS, type VideoSkin } from './videoSkins'
import { imageInfo, loadSkinPackage, type LoadResult } from '../skinmapper/packageLoader'
import { FORMAT_VERSION, SKINMAP_VERSION, SKIN_FORMAT, type SkinManifest, type SkinTheme } from '../skinmapper/schema'

// Media Player skins made in SkinMapper. A player skin is the player's art plus where the
// display, visualizer and every control sit on it (Cyber: art + positions; controls never removed).
// Official layouts are the templates people start from.

export type PlayerTarget = 'music' | 'video'
export type MusicLayout = Pick<MusicSkin, 'display' | 'visualizer' | 'hotspots' | 'volume' | 'spin' | 'accent'>
export type VideoLayout = Pick<VideoSkin, 'window' | 'accent' | 'icon'>
export type PlayerSkinRecord = {
  id: string
  name: string
  author: string
  target: PlayerTarget
  /** The official layout this skin started from. */
  template: string
  art: Blob
  width: number
  height: number
  music?: MusicLayout
  video?: VideoLayout
  updatedAt: string
}

/** Controls every music skin keeps (the toolbar covers library, add and mode). */
export const REQUIRED_CONTROLS: Control[] = ['play', 'prev', 'next']
export const CONTROL_NAMES: Record<Control, string> = {
  play: 'Play / Pause', prev: 'Previous', next: 'Next', stop: 'Stop', shuffle: 'Shuffle', repeat: 'Repeat', library: 'Library', like: 'Like',
  minimize: 'Minimize', close: 'Close', mute: 'Mute',
}
export const ALL_CONTROLS = Object.keys(CONTROL_NAMES) as Control[]

/** Starts a new skin from an official layout (Cyber's approved designs). */
export async function fromTemplate(target: PlayerTarget, template: string, name: string, author: string): Promise<PlayerSkinRecord> {
  const official = target === 'music' ? MUSIC_SKINS.find(skin => skin.id === template) : VIDEO_SKINS.find(skin => skin.id === template)
  if (!official) throw new Error('That layout template wasn’t found.')
  const art = await (await fetch(official.art)).blob()
  const base = { id: crypto.randomUUID(), name: name.trim() || official.name + ' (mine)', author: author.trim() || 'me', target, template, art, width: official.width, height: official.height, updatedAt: new Date().toISOString() }
  if (target === 'music') {
    const skin = official as MusicSkin
    return { ...base, music: structuredClone({ display: skin.display, visualizer: skin.visualizer, hotspots: skin.hotspots, volume: skin.volume, spin: skin.spin, accent: skin.accent }) }
  }
  const skin = official as VideoSkin
  return { ...base, video: { window: { ...skin.window }, accent: skin.accent, icon: skin.icon } }
}

/** Swaps in new art; positions are scaled so the layout keeps its place on the new picture. */
export async function replaceArt(record: PlayerSkinRecord, file: Blob): Promise<PlayerSkinRecord> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = imageInfo(bytes)
  if (!info) throw new Error('Choose a PNG, WebP, JPEG or GIF picture.')
  if (bytes.length > 10 * 1024 * 1024) throw new Error('That picture is larger than 10 MB.')
  // Art is shown at half its pixel size (crisp on high-DPI screens), like the official skins.
  const width = Math.round(info.width / 2), height = Math.round(info.height / 2)
  if (width < 80 || height < 60) throw new Error('That picture is too small for a player (at least 160 × 120 pixels).')
  if (width > 2048 || height > 2048) throw new Error('That picture is too big (up to 4096 pixels on a side).')
  const sx = width / record.width, sy = height / record.height, sr = Math.min(sx, sy)
  const box = <T extends { x: number; y: number; w: number; h: number }>(b: T): T => ({ ...b, x: Math.round(b.x * sx), y: Math.round(b.y * sy), w: Math.round(b.w * sx), h: Math.round(b.h * sy) })
  const next: PlayerSkinRecord = { ...record, art: new Blob([bytes], { type: info.type }), width, height, updatedAt: new Date().toISOString() }
  if (record.music) next.music = {
    ...record.music, display: box(record.music.display), visualizer: box(record.music.visualizer),
    hotspots: record.music.hotspots.map(spot => ({ ...spot, x: Math.round(spot.x * sx), y: Math.round(spot.y * sy), r: Math.max(8, Math.round(spot.r * sr)) })),
    volume: record.music.volume && { x: Math.round(record.music.volume.x * sx), y: Math.round(record.music.volume.y * sy), w: Math.round(record.music.volume.w * sx) },
    spin: record.music.spin && { x: Math.round(record.music.spin.x * sx), y: Math.round(record.music.spin.y * sy), rx: Math.round(record.music.spin.rx * sx), ry: Math.round(record.music.spin.ry * sy) },
  }
  if (record.video) next.video = { ...record.video, window: box(record.video.window) }
  return next
}

/** Problems that would make a skin unusable. Empty when it's fine. */
export function checkPlayerSkin(record: PlayerSkinRecord): string[] {
  const problems: string[] = []
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= record.width && y <= record.height
  if (record.target === 'music' && record.music) {
    for (const control of REQUIRED_CONTROLS) if (!record.music.hotspots.some(spot => spot.control === control)) problems.push(`${CONTROL_NAMES[control]} is missing. Every player keeps it.`)
    for (const spot of record.music.hotspots) {
      if (!inside(spot.x, spot.y)) problems.push(`${CONTROL_NAMES[spot.control]} is off the player art.`)
      if (spot.r < 8) problems.push(`${CONTROL_NAMES[spot.control]} is too small to click (at least 16 px across).`)
    }
    const d = record.music.display
    if (d.w < 60 || d.h < 30) problems.push('The song display is too small to read (at least 60 × 30).')
  }
  if (record.target === 'video' && record.video) {
    const w = record.video.window
    if (w.w < 240 || w.h < 160) problems.push('The video window is too small (at least 240 × 160).')
  }
  return problems
}

export function toMusicSkin(record: PlayerSkinRecord, artUrl: string): MusicSkin {
  const layout = record.music!
  return { id: 'custom:' + record.id, name: record.name, blurb: 'by ' + record.author, art: artUrl, width: record.width, height: record.height, ...layout }
}
export function toVideoSkin(record: PlayerSkinRecord, artUrl: string): VideoSkin {
  return { id: 'custom:' + record.id, name: record.name, art: artUrl, width: record.width, height: record.height, ...record.video! }
}

// ---------- My player skins (IndexedDB) ----------
const DB = 'elsewhere-player-skins'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('skins')) request.result.createObjectStore('skins', { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Player skins are unavailable.'))
  })
}
async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction('skins', mode)
      const request = action(t.objectStore('skins'))
      let value: T | undefined
      if (request) request.onsuccess = () => { value = request.result }
      t.oncomplete = () => resolve(value)
      t.onerror = () => reject(t.error ?? new Error('Saving failed.'))
    })
  } finally { db.close() }
}
export const savePlayerSkin = (record: PlayerSkinRecord) => run('readwrite', store => store.put({ ...record, updatedAt: new Date().toISOString() }))
export const deletePlayerSkin = (id: string) => run('readwrite', store => store.delete(id))
export async function listPlayerSkins(target?: PlayerTarget): Promise<PlayerSkinRecord[]> {
  const all = (await run<PlayerSkinRecord[]>('readonly', store => store.getAll() as IDBRequest<PlayerSkinRecord[]>)) || []
  return all.filter(item => !target || item.target === target).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
/** Tells open Media Player windows that player skins changed. */
export const PLAYER_SKINS_CHANGED = 'elsewhere.player-skins.changed'
export function announcePlayerSkins() { try { localStorage.setItem(PLAYER_SKINS_CHANGED, String(Date.now())) } catch { /* optional */ } }

// ---------- .eskin packages for player skins ----------
type PlayerTheme = SkinTheme & { player?: { target: PlayerTarget; template: string; art: { path: string }; width: number; height: number; music?: MusicLayout; video?: VideoLayout } }

export async function exportPlayerSkin(record: PlayerSkinRecord): Promise<{ bytes: Uint8Array; check: LoadResult; fileName: string }> {
  const bytes = new Uint8Array(await record.art.arrayBuffer())
  const info = imageInfo(bytes)
  if (!info) throw new Error('The player art isn’t a supported picture.')
  const ext = info.type === 'image/png' ? 'png' : info.type === 'image/webp' ? 'webp' : info.type === 'image/gif' ? 'gif' : 'jpg'
  const slug = record.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'player'
  const manifest: SkinManifest = { format: SKIN_FORMAT, formatVersion: FORMAT_VERSION, id: `${record.target}-${slug}`.slice(0, 60), name: record.name.slice(0, 60), author: record.author.slice(0, 80), skinMapVersion: SKINMAP_VERSION, preview: `assets/preview/cover.${ext}` }
  const theme: PlayerTheme = { tokens: {}, player: { target: record.target, template: record.template, art: { path: `assets/frames/player.${ext}` }, width: record.width, height: record.height, music: record.music, video: record.video } }
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)), 'theme.json': strToU8(JSON.stringify(theme, null, 2)),
    [`assets/frames/player.${ext}`]: bytes, [`assets/preview/cover.${ext}`]: bytes,
  }
  const zipped = zipSync(files, { level: 6 })
  return { bytes: zipped, check: loadSkinPackage(zipped), fileName: `${manifest.id}.eskin` }
}

/** Opens a player-skin package as an editable record, or null if it's a Messenger skin. */
export function playerSkinFromPackage(result: Extract<LoadResult, { ok: true }>): PlayerSkinRecord | null {
  const player = (result.skin.theme as PlayerTheme).player
  if (!player) return null
  const image = result.skin.images.get(player.art.path)
  if (!image) return null
  return {
    id: crypto.randomUUID(), name: result.skin.manifest.name, author: result.skin.manifest.author, target: player.target, template: player.template,
    art: new Blob([new Uint8Array(image.bytes)], { type: image.type }), width: player.width, height: player.height, music: player.music, video: player.video,
    updatedAt: new Date().toISOString(),
  }
}

export type { Hotspot, DisplayStyle }
