import { strToU8, zipSync } from 'fflate'
import { FORMAT_VERSION, SKINMAP_VERSION, SKIN_FORMAT, type SkinManifest, type SkinTheme } from './schema'
import { imageInfo, loadSkinPackage, type LoadResult } from './packageLoader'
import { patternPng, type PatternKind } from './patterns'
import { STARTER_SKINS } from './stationerySkins'

// SkinMapper editable projects: the theme plus imported images, saved on this PC.
// Export turns a project into an .eskin package and re-checks it with the loader.

export type ProjectAsset = { path: string; name: string; type: string; width: number; height: number; bytes: Uint8Array }
export type SkinProject = {
  id: string
  name: string
  author: string
  description: string
  theme: SkinTheme
  assets: ProjectAsset[]
  createdAt: string
  updatedAt: string
}

/** Starting points for Quick Create. All share the same SkinMap; Classic is the default. */
export const TEMPLATES: Record<string, { label: string; theme: SkinTheme }> = {
  classic: { label: 'Classic (default)', theme: { tokens: {}, transcript: 'classic' } },
  glossy: {
    label: 'Glossy Sky',
    theme: {
      tokens: { fontFamily: 'Segoe UI' },
      slots: {
        'window.titlebar': { active: { background: '#5fb3ec' } },
        'window.frame': { active: { borderColor: '#2f86cf', borderRadius: '14px' } },
        'chat.send': { normal: { background: '#2f86cf', borderRadius: '14px' } },
        'buddy.toolbar.button': { normal: { borderRadius: '10px' } },
      },
      transcript: 'bubble',
    },
  },
  pixel: {
    label: 'Pixel',
    theme: {
      tokens: { fontFamily: 'Courier New', borderRadius: '0px' },
      slots: {
        'window.frame': { active: { borderRadius: '0px', borderColor: '#7a5cff', shadow: '4px 4px 0px #2b1d66' } },
        'window.titlebar': { active: { background: '#7a5cff' } },
        'chat.send': { normal: { background: '#7a5cff', borderRadius: '0px' } },
      },
      transcript: 'classic',
    },
  },
  minimal: {
    label: 'Minimal Night',
    theme: {
      tokens: { fontFamily: 'Segoe UI' },
      slots: {
        'window.frame': { active: { background: '#1b1f27', borderColor: '#3a4150', borderRadius: '8px' } },
        'window.titlebar': { active: { background: '#232936' } },
        'buddy.contacts': { normal: { background: '#232936', textColor: '#e6e9ef', borderColor: '#3a4150' } },
        'chat.transcript': { normal: { background: '#232936', textColor: '#e6e9ef', borderColor: '#3a4150' } },
        'chat.composer': { normal: { background: '#232936', textColor: '#e6e9ef', borderColor: '#3a4150' } },
        'chat.send': { normal: { background: '#5b8cff' } },
      },
      transcript: 'bubble',
    },
  },
}

export function newProject(name: string, author: string, template = 'classic'): SkinProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), name: name.trim() || 'My Skin', author: author.trim() || 'me', description: '',
    theme: structuredClone(TEMPLATES[template]?.theme || TEMPLATES.classic.theme), assets: [], createdAt: now, updatedAt: now,
  }
}

/** Starts a project from a stationery starter skin, drawing its paper patterns into the project. */
export async function newStarterProject(name: string, author: string, starter: string): Promise<SkinProject> {
  const recipe = STARTER_SKINS[starter]
  if (!recipe) return newProject(name, author, 'classic')
  const project = newProject(name || recipe.label, author, 'classic')
  project.theme = structuredClone(recipe.theme)
  for (const pattern of recipe.patterns) {
    const tile = await patternPng(pattern.kind, pattern.base, pattern.ink, pattern.size)
    project.assets.push({ path: pattern.path, name: pattern.path.split('/').pop()!.replace(/\.png$/, ''), type: 'image/png', width: tile.width, height: tile.height, bytes: tile.bytes })
  }
  return project
}

/** Adds a generated pattern tile to the project's textures. */
export async function makePatternAsset(project: SkinProject, kind: PatternKind, base: string, ink: string, size: number): Promise<ProjectAsset> {
  const tile = await patternPng(kind, base, ink, size)
  let path = `assets/textures/${kind}.png`
  for (let n = 2; project.assets.some(asset => asset.path === path); n++) path = `assets/textures/${kind}-${n}.png`
  return { path, name: path.split('/').pop()!.replace(/\.png$/, ''), type: 'image/png', width: tile.width, height: tile.height, bytes: tile.bytes }
}

const FOLDERS = ['frames', 'buttons', 'icons', 'textures', 'backgrounds', 'decorations'] as const
export type AssetFolder = typeof FOLDERS[number]
export const ASSET_FOLDERS = FOLDERS

/** Copies an image file into the project (PNG, WebP or JPEG; checked by its real header). */
export async function importAsset(project: SkinProject, file: File, folder: AssetFolder): Promise<ProjectAsset> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = imageInfo(bytes)
  if (!info) throw new Error(`${file.name} isn’t a PNG, WebP, JPEG or GIF image.`)
  if (bytes.length > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`)
  if (info.width > 4096 || info.height > 4096) throw new Error(`${file.name} is bigger than 4096 pixels on a side.`)
  const extension = info.type === 'image/png' ? 'png' : info.type === 'image/webp' ? 'webp' : info.type === 'image/gif' ? 'gif' : 'jpg'
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9 _.-]+/g, '-').slice(0, 80) || 'image'
  let path = `assets/${folder}/${base}.${extension}`
  for (let n = 2; project.assets.some(asset => asset.path.toLowerCase() === path.toLowerCase()); n++) path = `assets/${folder}/${base}-${n}.${extension}`
  return { path, name: base, type: info.type, width: info.width, height: info.height, bytes }
}

/** Copies a sticker, Web Treasure or Studio creation into the project as a decoration image. */
export async function decorationAsset(project: SkinProject, blob: Blob): Promise<ProjectAsset> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const info = imageInfo(bytes)
  if (!info) throw new Error('That picture isn’t a PNG, WebP, JPEG or GIF image.')
  if (bytes.length > 10 * 1024 * 1024) throw new Error('That picture is larger than 10 MB.')
  if (info.width > 4096 || info.height > 4096) throw new Error('That picture is bigger than 4096 pixels on a side.')
  const extension = info.type === 'image/png' ? 'png' : info.type === 'image/webp' ? 'webp' : info.type === 'image/gif' ? 'gif' : 'jpg'
  let n = 1
  while (project.assets.some(asset => asset.path === `assets/decorations/decoration-${n}.${extension}`)) n++
  // Generic names only: the picture's own file name is never shown or packaged.
  return { path: `assets/decorations/decoration-${n}.${extension}`, name: `decoration ${n}`, type: info.type, width: info.width, height: info.height, bytes }
}

function slug(text: string) { return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'my-skin' }

/** A simple preview cover drawn from the theme colors (used when the creator hasn't added one). */
async function coverPng(project: SkinProject): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = 320; canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const title = String(project.theme.slots?.['window.titlebar']?.active?.background || '#095bd0')
  const body = String(project.theme.slots?.['window.frame']?.active?.background || '#f5f9ff')
  ctx.fillStyle = body; ctx.fillRect(0, 0, 320, 200)
  ctx.fillStyle = title.startsWith('#') ? title : '#095bd0'; ctx.fillRect(0, 0, 320, 36)
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px Tahoma'; ctx.fillText(project.name.slice(0, 28), 12, 24)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Cover failed')), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

/** Builds the .eskin bytes and re-validates them exactly as installing would. */
export async function exportPackage(project: SkinProject): Promise<{ bytes: Uint8Array; check: LoadResult; fileName: string }> {
  const manifest: SkinManifest = {
    format: SKIN_FORMAT, formatVersion: FORMAT_VERSION, id: slug(project.name), name: project.name.slice(0, 60),
    author: project.author.slice(0, 80), description: project.description.slice(0, 300), skinMapVersion: SKINMAP_VERSION,
    preview: 'assets/preview/cover.png',
  }
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'theme.json': strToU8(JSON.stringify(project.theme, null, 2)),
    'assets/preview/cover.png': await coverPng(project),
  }
  // Only images the theme actually uses go into the package.
  const used = JSON.stringify(project.theme)
  for (const asset of project.assets) if (used.includes(`"${asset.path}"`)) files[asset.path] = asset.bytes
  const bytes = zipSync(files, { level: 6 })
  return { bytes, check: loadSkinPackage(bytes), fileName: `${manifest.id}.eskin` }
}

/** Turns a loaded package back into an editable project (Import a Skin). */
export function projectFromPackage(result: Extract<LoadResult, { ok: true }>): SkinProject {
  const { manifest, theme, images } = result.skin
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), name: manifest.name, author: manifest.author, description: manifest.description || '', theme,
    assets: [...images.values()].filter(image => !image.path.startsWith('assets/preview/'))
      .map(image => ({ path: image.path, name: image.path.split('/').pop()!.replace(/\.[^.]+$/, ''), type: image.type, width: image.width, height: image.height, bytes: image.bytes })),
    createdAt: now, updatedAt: now,
  }
}

// ---------- Saved projects (IndexedDB) ----------
const DB = 'elsewhere-skinmapper'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects', { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('SkinMapper storage is unavailable.'))
  })
}
async function tx<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction('projects', mode)
      const request = action(t.objectStore('projects'))
      let value: T | undefined
      if (request) request.onsuccess = () => { value = request.result }
      t.oncomplete = () => resolve(value)
      t.onerror = () => reject(t.error ?? new Error('Saving failed.'))
      t.onabort = () => reject(t.error ?? new Error('Saving was interrupted. The disk may be full.'))
    })
  } finally { db.close() }
}
export const saveSkinProject = (project: SkinProject) => tx('readwrite', store => store.put({ ...project, updatedAt: new Date().toISOString() }))
export const deleteSkinProject = (id: string) => tx('readwrite', store => store.delete(id))
export async function listSkinProjects(): Promise<SkinProject[]> {
  return ((await tx<SkinProject[]>('readonly', store => store.getAll() as IDBRequest<SkinProject[]>)) || []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
