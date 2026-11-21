import { invoke, isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { GiphyFetch } from '@giphy/js-fetch-api'
import type { IGif } from '@giphy/js-types'

export type GiphyKind = 'gifs' | 'stickers' | 'emoji'

export type MediaRef =
  | {
      kind: 'treasure'
      id: string
      name: string
    }
  | {
      kind: 'local'
      id: string
      name: string
    }
  | {
      kind: 'giphy'
      id: string
      mediaType: GiphyKind
    }

export type MediaTab = 'local' | GiphyKind

export type MediaPickerState = {
  anchor: HTMLButtonElement
  tab: MediaTab
}

type LocalImage = {
  id: string
  name: string
  blob: Blob
  size: number
}

const DATABASE = 'elsewhere-media-library'
const STORE = 'images'

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_LIBRARY = 128 * 1024 * 1024

const TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(
          STORE,
          { keyPath: 'id' }
        )
      }
    }

    request.onsuccess = () => resolve(request.result)

    request.onerror = () => reject(
      request.error ??
      new Error('Cannot open the image library.')
    )
  })
}

export async function validateImage(file: File) {
  if (!TYPES.includes(file.type)) {
    throw new Error(
      'Choose a PNG, JPEG, GIF or WebP image.'
    )
  }

  if (file.size === 0 || file.size > MAX_IMAGE) {
    throw new Error(
      'Images must be smaller than 8 MB.'
    )
  }

  const url = URL.createObjectURL(file)

  try {
    const image = new Image()

    image.src = url

    await image.decode()

    if (
      image.naturalWidth > 4096 ||
      image.naturalHeight > 4096
    ) {
      throw new Error(
        'Images may be up to 4096 pixels per side.'
      )
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function saveLocalImage(
  file: File
): Promise<MediaRef> {
  await validateImage(file)

  const database = await openDatabase()

  const record: LocalImage = {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 180),
    blob: file.slice(0, file.size, file.type),
    size: file.size,
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction =
        database.transaction(STORE, 'readwrite')

      const store = transaction.objectStore(STORE)

      const existing = store.getAll()

      existing.onsuccess = () => {
        const images = existing.result as LocalImage[]

        const total = images.reduce(
          (sum, image) => sum + image.size,
          record.size
        )

        if (total > MAX_LIBRARY) {
          transaction.abort()

          reject(new Error(
            'The local image library has reached its 128 MB limit.'
          ))

          return
        }

        store.put(record)
      }

      transaction.oncomplete = () => resolve()

      transaction.onerror = () => reject(
        transaction.error ??
        new Error('Unable to save image.')
      )

      transaction.onabort = () => reject(
        transaction.error ??
        new Error('Image storage was interrupted.')
      )
    })

    return {
      kind: 'local',
      id: record.id,
      name: record.name,
    }
  } finally {
    database.close()
  }
}

export async function readLocalImage(
  id: string
): Promise<Blob | undefined> {
  const database = await openDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE, 'readonly')
        .objectStore(STORE)
        .get(id)

      request.onsuccess = () => {
        const record =
          request.result as LocalImage | undefined

        resolve(record?.blob)
      }

      request.onerror = () => reject(
        request.error ??
        new Error('Cannot read the attachment.')
      )
    })
  } finally {
    database.close()
  }
}

export function mediaLabel(media: MediaRef) {
  if (media.kind === 'treasure') return `[Web treasure: ${media.name}]`
  if (media.kind === 'local') return '[Image attachment]'

  if (media.mediaType === 'emoji') {
    return '[Animated emoji]'
  }

  return media.mediaType === 'stickers'
    ? '[Sticker]'
    : '[GIF]'
}

// ========================================
// GIPHY PROVIDER
// ========================================

const API_KEY = 'elsewhere.media.giphy-key'
const GIPHY_KEY_CHANGED = 'elsewhere:giphy:key-changed'
const nativeWindows = () => isTauri() && /Windows/.test(navigator.userAgent)

function legacyGiphyKey() {
  try {
    return localStorage.getItem(API_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

function clearLegacyGiphyKey() {
  try { localStorage.removeItem(API_KEY) } catch { /* Native storage remains authoritative. */ }
}

export async function readGiphyKey() {
  const legacyKey = legacyGiphyKey()
  if (!nativeWindows()) return legacyKey
  const key = await invoke<string | null>('load_giphy_key', { legacyKey: legacyKey || null })
  if (key && legacyKey) clearLegacyGiphyKey()
  return key || ''
}

export async function saveGiphyKey(value: string) {
  const key = value.trim()
  if (!key || key.length > 512) throw new Error('Enter a valid GIPHY Web SDK key.')
  if (nativeWindows()) {
    await invoke('save_giphy_key', { key })
    clearLegacyGiphyKey()
  } else {
    localStorage.setItem(API_KEY, key)
  }
  if (isTauri()) void emit(GIPHY_KEY_CHANGED).catch(console.error)
}

export async function removeGiphyKey() {
  if (nativeWindows()) await invoke('remove_giphy_key')
  clearLegacyGiphyKey()
  if (isTauri()) void emit(GIPHY_KEY_CHANGED).catch(console.error)
}

export function watchGiphyKey(change: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === API_KEY || event.key === null) change()
  }
  window.addEventListener('storage', onStorage)
  let stopped = false
  let unlisten: (() => void) | undefined
  if (isTauri()) void listen(GIPHY_KEY_CHANGED, change).then(stop => {
    if (stopped) stop()
    else unlisten = stop
  }).catch(console.error)
  return () => {
    stopped = true
    unlisten?.()
    window.removeEventListener('storage', onStorage)
  }
}

export type GiphyItem = IGif

let sdk:
  | GiphyFetch
  | undefined

let configuredKey = ''

async function getSDK(signal?: AbortSignal) {
  const key = await readGiphyKey()
  checkRequest(signal)

  if (!key) {
    throw new Error(
      'Enter your GIPHY Web SDK key first.'
    )
  }

  if (!sdk || configuredKey !== key) {
    sdk = new GiphyFetch(key)
    configuredKey = key
  }

  return sdk
}

function checkRequest(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException(
      'Request cancelled.',
      'AbortError'
    )
  }
}

const RATING = 'pg-13' as const

export async function searchGiphy(
  kind: GiphyKind,
  query: string,
  offset: number,
  signal?: AbortSignal
): Promise<GiphyItem[]> {
  checkRequest(signal)

  const gf = await getSDK(signal)

  const options = {
    limit: 20,
    offset,
  }

  const result =
    kind === 'emoji'
      ? await gf.emojiDefaultVariations(options)
      : query.trim()
        ? await gf.search(query, {
            ...options,
            type: kind,
            rating: RATING,
          })
        : await gf.trending({
            ...options,
            type: kind,
            rating: RATING,
          })

  checkRequest(signal)

  return result.data
}

export async function getGiphyItems(
  ids: string[],
  signal?: AbortSignal
): Promise<GiphyItem[]> {
  if (!ids.length) return []

  checkRequest(signal)

  const result = await (await getSDK(signal)).gifs(
    ids.slice(0, 40)
  )

  checkRequest(signal)

  return result.data
}

export async function resolveGiphy(
  id: string,
  signal?: AbortSignal
): Promise<GiphyItem | undefined> {
  checkRequest(signal)

  const result = await (await getSDK(signal)).gif(id)

  checkRequest(signal)

  return result.data || undefined
}

export async function relatedGiphy(
  id: string,
  type: 'gifs' | 'stickers',
  offset: number,
  signal?: AbortSignal
): Promise<GiphyItem[]> {
  checkRequest(signal)

  const result = await (await getSDK(signal)).related(
    id,
    {
      type,
      limit: 20,
      offset,
    }
  )

  checkRequest(signal)

  return result.data
}

export async function emojiVariations(
  id: string,
  signal?: AbortSignal
): Promise<GiphyItem[]> {
  checkRequest(signal)

  const result = await (await getSDK(signal))
    .emojiVariations(id)

  checkRequest(signal)

  return result.data
}

// The React SDK handles display and click
// analytics. Register the actual send separately.

export function registerGiphyAction(
  item: GiphyItem,
  action: 'onsent'
) {
  const data = item as unknown as {
    analytics?: {
      onsent?: {
        url?: string
      }
    }
  }

  const value = data.analytics?.[action]?.url

  if (!value) return

  try {
    const url = new URL(value)

    if (
      url.protocol !== 'https:' ||
      !(
        url.hostname === 'giphy.com' ||
        url.hostname.endsWith('.giphy.com')
      )
    ) return

    void fetch(value, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    // Analytics must never interrupt messaging.
  }
}
// Save only provider identifiers, not API
// responses, media URLs or media files.

type Collection = 'favorites' | 'recents'

type SavedGiphy = {
  id: string
  mediaType: GiphyKind
}

const collectionKey = (collection: Collection) =>
  `elsewhere.media.${collection}.v1`

export function readCollection(
  collection: Collection
): SavedGiphy[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(
        collectionKey(collection)
      ) ?? '[]'
    )

    if (!Array.isArray(value)) return []

    return value.filter((item) =>
      item &&
      typeof item.id === 'string' &&
      item.id.length <= 128 &&
      (
        item.mediaType === 'gifs' ||
        item.mediaType === 'stickers' ||
        item.mediaType === 'emoji'
      )
    ).slice(0, 80)
  } catch {
    return []
  }
}

function saveCollection(
  collection: Collection,
  items: SavedGiphy[]
) {
  localStorage.setItem(
    collectionKey(collection),
    JSON.stringify(items.slice(0, 80))
  )
}

export function toggleFavorite(
  id: string,
  mediaType: GiphyKind
) {
  const current = readCollection('favorites')

  const exists = current.some(
    (item) =>
      item.id === id &&
      item.mediaType === mediaType
  )

  const next = exists
    ? current.filter(
        (item) =>
          item.id !== id ||
          item.mediaType !== mediaType
      )
    : [{ id, mediaType }, ...current]

  saveCollection('favorites', next)

  return !exists
}

export function rememberRecent(
  id: string,
  mediaType: GiphyKind
) {
  saveCollection('recents', [
    { id, mediaType },

    ...readCollection('recents').filter(
      (item) =>
        item.id !== id ||
        item.mediaType !== mediaType
    ),
  ])
}