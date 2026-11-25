// Pixel Doll Studio: the doll engine (no UI). Dolls are data (body, pose, skin, equipped items);
// the picture is always rebuilt from sprite parts, so a saved doll stays editable forever.
//
// Sprites live on a fixed CANVAS (128×256 px, feet near the bottom). Every part of an item sits in a
// depth BAND, so one garment can have a back part (a cape behind the body) and a front part. Parts are
// drawn per body + pose; an item without art for the current pose is "not available in this pose"
// (never stretched or rotated).

export const CANVAS = { width: 128, height: 256 } as const
export const PROJECT_VERSION = 1

/** Depth bands, back to front. */
export const BANDS = [
  'back-hair', 'back-wear', 'body', 'tattoo', 'face', 'makeup', 'base', 'legwear', 'shoes', 'bottoms',
  'tops', 'dresses', 'outerwear', 'front-hair', 'accessories', 'hair-accessories', 'handheld',
] as const
export type Band = typeof BANDS[number]

export const CATEGORIES = [
  { id: 'bodies', label: 'Bodies', group: 'doll' },
  { id: 'skin', label: 'Skin', group: 'doll' },
  { id: 'hair', label: 'Hair', group: 'doll' },
  { id: 'eyes', label: 'Eyes', group: 'doll' },
  { id: 'makeup', label: 'Makeup', group: 'doll' },
  { id: 'tattoos', label: 'Tattoos', group: 'doll' },
  { id: 'tops', label: 'Tops', group: 'wear' },
  { id: 'bottoms', label: 'Bottoms', group: 'wear' },
  { id: 'dresses', label: 'Dresses', group: 'wear' },
  { id: 'legwear', label: 'Legwear', group: 'wear' },
  { id: 'shoes', label: 'Shoes', group: 'wear' },
  { id: 'outerwear', label: 'Outerwear', group: 'wear' },
  { id: 'accessories', label: 'Accessories', group: 'wear' },
  { id: 'poses', label: 'Poses', group: 'scene' },
] as const
export type CategoryId = typeof CATEGORIES[number]['id']
/** Categories where only one item can be worn at a time (picking another swaps it). */
export const SINGLE: CategoryId[] = ['hair', 'eyes', 'dresses', 'bottoms', 'shoes', 'legwear']

/** A rectangle of pixels in sprite space (used by the built-in placeholder shapes). */
export type Rect = [x: number, y: number, w: number, h: number]
/** One drawn piece: an image from the asset library, or placeholder rectangles drawn in code. */
export type Sprite = { src: string } | { rects: Rect[]; color?: string }
export type Part = { band: Band; sprites: Record<string, Sprite> } // key: `${body}/${pose}` or `*/${pose}` or `*`
export type Item = {
  id: string; name: string; category: CategoryId
  parts: Part[]
  /** Color choices. For library art: each variant is its own set of sprites (ids in `parts` use {variant}). */
  colors?: string[]
  placeholder?: boolean
}
export type BodyTemplate = { id: string; name: string; poses: string[]; placeholder?: boolean; parts: Part[] }
export type PoseTemplate = { id: string; name: string }
export type SkinTone = { id: string; name: string; ramp: [string, string, string] }
export type Library = { bodies: BodyTemplate[]; poses: PoseTemplate[]; skins: SkinTone[]; items: Item[]; source: 'placeholder' | 'library' | 'mixed' }

export type Equipped = { item: string; color?: string; hidden?: boolean }
export type DollProject = {
  version: number; id: string; name: string; createdAt: string; updatedAt: string
  body: string; pose: string; skin: string
  /** Wear order: later = on top within the same band. */
  equipped: Equipped[]
  thumbnail?: string
}

export const newDollId = () => crypto.randomUUID()

export function newDoll(library: Library, name = 'New Doll'): DollProject {
  const now = new Date().toISOString()
  const body = library.bodies[0]
  return {
    version: PROJECT_VERSION, id: newDollId(), name, createdAt: now, updatedAt: now,
    body: body?.id || 'standard', pose: body?.poses[0] || 'stand', skin: library.skins[0]?.id || 'tone-1', equipped: [],
  }
}

/** The sprite for this body + pose, or undefined when the item has no art for it. */
export function spriteFor(part: Part, body: string, pose: string): Sprite | undefined {
  return part.sprites[`${body}/${pose}`] ?? part.sprites[`*/${pose}`] ?? part.sprites['*']
}

export function itemFits(item: Item, body: string, pose: string) {
  return item.parts.every(part => spriteFor(part, body, pose) !== undefined)
}

export type Layer = { band: Band; sprite: Sprite; item?: Item; equipped?: Equipped; tint?: string; skin?: SkinTone }

/** Every visible sprite for the doll, sorted back to front. Items without art for the pose are skipped. */
export function composeLayers(doll: DollProject, library: Library): { layers: Layer[]; unavailable: Item[] } {
  const body = library.bodies.find(item => item.id === doll.body) || library.bodies[0]
  const skin = library.skins.find(item => item.id === doll.skin) || library.skins[0]
  const layers: (Layer & { order: number })[] = []
  const unavailable: Item[] = []
  if (body) for (const part of body.parts) {
    const sprite = spriteFor(part, body.id, doll.pose)
    if (sprite) layers.push({ band: part.band, sprite, skin, order: -1 })
  }
  doll.equipped.forEach((equipped, order) => {
    const item = library.items.find(entry => entry.id === equipped.item)
    if (!item) return
    if (!itemFits(item, doll.body, doll.pose)) { unavailable.push(item); return }
    if (equipped.hidden) return
    for (const part of item.parts) {
      const sprite = spriteFor(part, doll.body, doll.pose)!
      layers.push({ band: part.band, sprite, item, equipped, tint: equipped.color, order })
    }
  })
  layers.sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || a.order - b.order)
  return { layers, unavailable }
}

/** Puts an item on (single-slot categories swap out the old one), or takes it off if already worn. */
export function toggleItem(doll: DollProject, library: Library, itemId: string): DollProject {
  const item = library.items.find(entry => entry.id === itemId)
  if (!item) return doll
  if (doll.equipped.some(entry => entry.item === itemId)) return { ...doll, equipped: doll.equipped.filter(entry => entry.item !== itemId) }
  const kept = SINGLE.includes(item.category)
    ? doll.equipped.filter(entry => library.items.find(other => other.id === entry.item)?.category !== item.category)
    : doll.equipped
  return { ...doll, equipped: [...kept, { item: itemId, color: item.colors?.[0] }] }
}

/** Moves a worn item up (toward the front) or down within the wear order. */
export function moveItem(doll: DollProject, itemId: string, direction: -1 | 1): DollProject {
  const index = doll.equipped.findIndex(entry => entry.item === itemId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= doll.equipped.length) return doll
  const equipped = [...doll.equipped]
  ;[equipped[index], equipped[target]] = [equipped[target], equipped[index]]
  return { ...doll, equipped }
}

/** Reads a saved doll safely: unknown items stay listed (they show again when their art is added). */
export function readDoll(raw: unknown): DollProject | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<DollProject>
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null
  const equipped = Array.isArray(value.equipped)
    ? value.equipped.filter((entry): entry is Equipped => !!entry && typeof entry.item === 'string').map(entry => ({
        item: entry.item, ...(typeof entry.color === 'string' ? { color: entry.color } : {}), ...(entry.hidden ? { hidden: true } : {}),
      }))
    : []
  return {
    version: typeof value.version === 'number' ? value.version : PROJECT_VERSION,
    id: value.id, name: value.name.slice(0, 80),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    body: typeof value.body === 'string' ? value.body : 'standard',
    pose: typeof value.pose === 'string' ? value.pose : 'stand',
    skin: typeof value.skin === 'string' ? value.skin : 'tone-1',
    equipped,
    ...(typeof value.thumbnail === 'string' ? { thumbnail: value.thumbnail } : {}),
  }
}

const SAFE_SPRITE = /^[A-Za-z0-9 _{}./-]{1,160}\.(png|webp)$/i
function readSprites(raw: unknown, base: string): Part['sprites'] | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Part['sprites'] = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const src = typeof value === 'string' ? value : (value as { src?: unknown })?.src
    if (typeof src !== 'string' || !SAFE_SPRITE.test(src) || src.includes('..') || src.startsWith('/')) return null
    if (!/^(\*|[\w-]+)\/[\w-]+$|^\*$/.test(key)) return null
    out[key] = { src: base + src }
  }
  return Object.keys(out).length ? out : null
}
function readParts(raw: unknown, base: string): Part[] | null {
  if (!Array.isArray(raw) || !raw.length) return null
  const parts: Part[] = []
  for (const entry of raw) {
    const band = (entry as { band?: unknown })?.band
    const sprites = readSprites((entry as { sprites?: unknown })?.sprites, base)
    if (typeof band !== 'string' || !(BANDS as readonly string[]).includes(band) || !sprites) return null
    parts.push({ band: band as Band, sprites })
  }
  return parts
}
const text = (value: unknown, max = 60) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
const id = (value: unknown) => typeof value === 'string' && /^[\w-]{1,60}$/.test(value) ? value : null

/** Reads Cyber's asset-library manifest. Anything malformed is skipped; missing sections use `fallback`. */
export function readLibrary(raw: unknown, base: string, fallback: Library): Library | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (m.format !== 'elsewhere-pixel-doll-library') return null
  const bodies = (Array.isArray(m.bodies) ? m.bodies : []).flatMap(entry => {
    const e = entry as Record<string, unknown>; const parts = readParts(e.parts, base)
    const poses = Array.isArray(e.poses) ? e.poses.filter((pose): pose is string => !!id(pose)) : []
    return id(e.id) && text(e.name) && parts && poses.length ? [{ id: e.id as string, name: text(e.name)!, poses, parts }] : []
  })
  const poses = (Array.isArray(m.poses) ? m.poses : []).flatMap(entry => {
    const e = entry as Record<string, unknown>
    return id(e.id) && text(e.name) ? [{ id: e.id as string, name: text(e.name)! }] : []
  })
  const skins = (Array.isArray(m.skins) ? m.skins : []).flatMap(entry => {
    const e = entry as Record<string, unknown>; const ramp = e.ramp
    const ok = Array.isArray(ramp) && ramp.length === 3 && ramp.every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
    return id(e.id) && text(e.name) && ok ? [{ id: e.id as string, name: text(e.name)!, ramp: ramp as [string, string, string] }] : []
  })
  const categories = CATEGORIES.map(category => category.id as string)
  const items = (Array.isArray(m.items) ? m.items : []).flatMap(entry => {
    const e = entry as Record<string, unknown>; const parts = readParts(e.parts, base)
    const colors = Array.isArray(e.colors) ? e.colors.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) : undefined
    return id(e.id) && text(e.name) && typeof e.category === 'string' && categories.includes(e.category) && parts
      ? [{ id: e.id as string, name: text(e.name)!, category: e.category as CategoryId, parts, ...(colors?.length ? { colors } : {}) }] : []
  })
  if (!bodies.length && !items.length) return null
  return {
    bodies: bodies.length ? bodies : fallback.bodies,
    poses: poses.length ? poses : fallback.poses,
    skins: skins.length ? skins : fallback.skins,
    items: items.length ? items : fallback.items,
    source: bodies.length && items.length ? 'library' : 'mixed',
  }
}
