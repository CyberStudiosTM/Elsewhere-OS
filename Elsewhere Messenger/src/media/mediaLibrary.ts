import { readId3 } from './mediaTags'

// The Media Player's library: songs and videos copied onto this PC (IndexedDB), so they
// play offline and stay put even if the original file moves. Nothing is uploaded.

export type MediaKind = 'audio' | 'video'
export type MediaItem = {
  id: string
  kind: MediaKind
  type: string
  size: number
  addedAt: string
  title: string
  artist?: string
  album?: string
  duration?: number
  cover?: Blob
}
type Stored = MediaItem & { blob: Blob }

export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac']
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
const EXTENSIONS: Record<string, MediaKind> = { mp3: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', wav: 'audio', flac: 'audio', opus: 'audio', mp4: 'video', m4v: 'video', webm: 'video', mov: 'video', ogv: 'video' }
export const ACCEPT = [...AUDIO_TYPES, ...VIDEO_TYPES, ...Object.keys(EXTENSIONS).map(ext => '.' + ext)].join(',')
const LIMIT = 4 * 1024 * 1024 * 1024

/** Works out whether a file is a song or a video from its type or extension. */
export function kindOf(file: { name: string; type: string }): MediaKind | null {
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return EXTENSIONS[file.name.split('.').pop()?.toLowerCase() || ''] || null
}

/** "my_song-final.mp3" → "my song-final" */
export function titleFromName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled'
}

const DB = 'elsewhere-media'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('items')) request.result.createObjectStore('items', { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The media library is unavailable.'))
  })
}
async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction('items', mode)
      const request = action(t.objectStore('items'))
      let value: T | undefined
      if (request) request.onsuccess = () => { value = request.result }
      t.oncomplete = () => resolve(value)
      t.onerror = () => reject(t.error ?? new Error('The media library couldn’t be saved.'))
      t.onabort = () => reject(t.error ?? new Error('Saving stopped. Your disk may be full.'))
    })
  } finally { db.close() }
}

function durationOf(blob: Blob, kind: MediaKind): Promise<number | undefined> {
  return new Promise(resolve => {
    const element = document.createElement(kind === 'video' ? 'video' : 'audio')
    const url = URL.createObjectURL(blob)
    const done = (value?: number) => { URL.revokeObjectURL(url); element.removeAttribute('src'); resolve(value) }
    element.preload = 'metadata'
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : undefined)
    element.onerror = () => done(undefined)
    window.setTimeout(() => done(undefined), 8000)
    element.src = url
  })
}

/** Copies files into the library. Returns what was added and why anything was skipped. */
export async function addMedia(files: File[]): Promise<{ added: MediaItem[]; skipped: string[] }> {
  const added: MediaItem[] = [], skipped: string[] = []
  for (const file of files) {
    const kind = kindOf(file)
    if (!kind) { skipped.push(`${file.name} isn’t a song or video Elsewhere can play.`); continue }
    if (file.size > LIMIT) { skipped.push(`${file.name} is larger than 4 GB.`); continue }
    const tags = kind === 'audio' ? readId3(new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer())) : {}
    const item: Stored = {
      id: crypto.randomUUID(), kind, type: file.type || (kind === 'audio' ? 'audio/mpeg' : 'video/mp4'), size: file.size, addedAt: new Date().toISOString(),
      title: tags.title || titleFromName(file.name), artist: tags.artist, album: tags.album,
      cover: tags.cover ? new Blob([new Uint8Array(tags.cover.bytes)], { type: tags.cover.type }) : undefined,
      duration: await durationOf(file, kind), blob: file,
    }
    try { await run('readwrite', store => store.put(item)); const { blob: _blob, ...listed } = item; void _blob; added.push(listed) }
    catch (cause) { skipped.push(`${file.name}: ${cause instanceof Error ? cause.message : 'couldn’t be saved.'}`) }
  }
  return { added, skipped }
}

export async function listMedia(): Promise<MediaItem[]> {
  const all = (await run<Stored[]>('readonly', store => store.getAll() as IDBRequest<Stored[]>)) || []
  return all.map(({ blob: _blob, ...item }) => { void _blob; return item }).sort((a, b) => a.addedAt.localeCompare(b.addedAt))
}
export async function mediaBlob(id: string): Promise<Blob | undefined> {
  return (await run<Stored>('readonly', store => store.get(id) as IDBRequest<Stored>))?.blob
}
export const removeMedia = (id: string) => run('readwrite', store => store.delete(id))
export async function renameMedia(id: string, patch: Pick<MediaItem, 'title' | 'artist'>) {
  const item = await run<Stored>('readonly', store => store.get(id) as IDBRequest<Stored>)
  if (item) await run('readwrite', store => store.put({ ...item, ...patch }))
}

export function formatTime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
