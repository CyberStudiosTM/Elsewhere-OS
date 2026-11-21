export const keyKinds = [
  'letter',
  'space',
  'enter',
  'backspace',
] as const

export type KeyKind =
  (typeof keyKinds)[number]

export type Clip = ArrayBuffer | null

export type SoundPack = {
  id: string
  name: string
  source: 'custom' | 'gx' | 'notification'
  clips: Partial<Record<KeyKind, Clip[]>>
}

export type SelectedFiles =
  Partial<Record<KeyKind, File[]>>

export const keyLabels: Record<KeyKind, string> = {
  letter: 'Letters and punctuation',
  space: 'Space',
  enter: 'Enter',
  backspace: 'Backspace and Delete',
}

const DATABASE = 'elsewhere-sound-library'
const STORE = 'packs'

export const PACK_REVISION =
  'elsewhere.sound.pack-revision'

const MAX_FILE = 2 * 1024 * 1024
const MAX_PACK = 16 * 1024 * 1024
const MAX_LIBRARY = 64 * 1024 * 1024
const MAX_CLIPS = 32

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(
          STORE,
          { keyPath: 'id' }
        )
      }
    }

    request.onsuccess = () => resolve(request.result)

    request.onerror = () => reject(
      request.error ?? new Error('Cannot open sound library.')
    )
  })
}

async function readRequest<T>(
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase()

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(
        STORE,
        'readonly'
      )

      const request = action(
        transaction.objectStore(STORE)
      )

      request.onsuccess = () => resolve(request.result)

      request.onerror = () => reject(
        request.error ?? new Error('Cannot read sound library.')
      )

      transaction.onabort = () => reject(
        transaction.error ?? new Error('Sound library read aborted.')
      )
    })
  } finally {
    database.close()
  }
}

async function writeRequest(
  action: (store: IDBObjectStore) => void
) {
  const database = await openDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        STORE,
        'readwrite'
      )

      transaction.oncomplete = () => resolve()

      transaction.onerror = () => reject(
        transaction.error ?? new Error('Cannot save sound library.')
      )

      transaction.onabort = () => reject(
        transaction.error ?? new Error('Sound library update aborted.')
      )

      action(transaction.objectStore(STORE))
    })
  } finally {
    database.close()
  }
}

export function listSoundPacks(): Promise<SoundPack[]> {
  return readRequest((store) => store.getAll())
}

const packCache = new Map<
  string,
  Promise<SoundPack | undefined>
>()

function loadSoundPack(id: string) {
  const existing = packCache.get(id)

  if (existing) return existing

  const task = readRequest<SoundPack | undefined>(
    (store) => store.get(id)
  ).catch((error) => {
    packCache.delete(id)
    throw error
  })

  packCache.set(id, task)

  return task
}

export function warmSoundPack(id: string) {
  return loadSoundPack(id)
}

function notifyLibraryChanged(id: string) {
  packCache.delete(id)

  try {
    localStorage.setItem(
      PACK_REVISION,
      `${Date.now()}-${Math.random()}`
    )
  } catch {
    // The IndexedDB library remains available.
  }
}

function packBytes(pack: SoundPack) {
  return Object.values(pack.clips)
    .flat()
    .reduce(
      (total, clip) => total + (clip?.byteLength ?? 0),
      0
    )
}

function cleanName(name: string) {
  const result = name.trim().slice(0, 64)

  if (!result) {
    throw new Error('Enter a sound pack name.')
  }

  return result
}

async function storePack(pack: SoundPack) {
  const existing = await listSoundPacks()

  const total = existing
    .filter((item) => item.id !== pack.id)
    .reduce(
      (sum, item) => sum + packBytes(item),
      packBytes(pack)
    )

  if (total > MAX_LIBRARY) {
    throw new Error(
      'Sound library limit reached. Remove an unused pack first.'
    )
  }

  await writeRequest((store) => {
    store.put(pack)
  })

  notifyLibraryChanged(pack.id)

  return pack
}

export async function renameSoundPack(
  pack: SoundPack,
  name: string
) {
  return storePack({
    ...pack,
    name: cleanName(name),
  })
}

export async function deleteSoundPack(id: string) {
  await writeRequest((store) => {
    store.delete(id)
  })

  notifyLibraryChanged(id)
}

type ImportFiles = Partial<
  Record<KeyKind, (File | null)[]>
>

async function importPack(
  name: string,
  source: SoundPack['source'],
  groups: ImportFiles
) {
  const all = Object.values(groups).flat()

  const files = all.filter(
    (file): file is File => file !== null
  )

  if (!files.length) {
    throw new Error('Choose at least one audio file.')
  }

  if (all.length > MAX_CLIPS) {
    throw new Error('A pack can contain up to 32 clips.')
  }

  if (
    files.reduce((sum, file) => sum + file.size, 0) >
    MAX_PACK
  ) {
    throw new Error('A pack cannot exceed 16 MB.')
  }

  for (const file of files) {
    if (!/\.(wav|mp3|ogg)$/i.test(file.name)) {
      throw new Error(`Unsupported file: ${file.name}`)
    }

    if (file.size === 0 || file.size > MAX_FILE) {
      throw new Error(
        `${file.name}: each clip must be between 1 byte and 2 MB.`
      )
    }
  }

  const context = new AudioContext()

  try {
    const clips: SoundPack['clips'] = {}

    for (const key of keyKinds) {
      const group = groups[key]

      if (!group) continue

      const validated: Clip[] = []

      for (const file of group) {
        if (file === null) {
          validated.push(null)
          continue
        }

        const bytes = await file.arrayBuffer()

        let decoded: AudioBuffer

        try {
          decoded = await context.decodeAudioData(
            bytes.slice(0)
          )
        } catch {
          throw new Error(
            `Cannot decode ${file.name}. Try a standard WAV or MP3 file.`
          )
        }

        if (
          !Number.isFinite(decoded.duration) ||
          decoded.duration <= 0 ||
          decoded.duration > 5
        ) {
          throw new Error(
            `${file.name}: sound clips must be five seconds or shorter.`
          )
        }

        validated.push(bytes)
      }

      clips[key] = validated
    }

    return await storePack({
      id: crypto.randomUUID(),
      name: cleanName(name),
      source,
      clips,
    })
  } finally {
    await context.close().catch(() => {})
  }
}

export function importCustomPack(
  name: string,
  groups: SelectedFiles
) {
  return importPack(name, 'custom', groups)
}

type GXManifest = {
  name?: unknown
  mod?: {
    payload?: {
      keyboard_sounds?: unknown
    }
  }
}

export async function importGXPack(files: File[]) {
  const roots = files.filter((file) => {
    const path = file.webkitRelativePath
      .replace(/\\/g, '/')
      .split('/')

    return path.length === 2 &&
      path[1].toLowerCase() === 'manifest.json'
  })

  if (roots.length !== 1) {
    throw new Error(
      'Select the unpacked GX mod folder containing manifest.json.'
    )
  }

  const manifestFile = roots[0]

  if (manifestFile.size > 1024 * 1024) {
    throw new Error('GX manifest is too large.')
  }

  const manifest = JSON.parse(
    await manifestFile.text()
  ) as GXManifest

  const keyboard = manifest?.mod?.payload?.keyboard_sounds

  if (!keyboard || typeof keyboard !== 'object' ||
      Array.isArray(keyboard)) {
    throw new Error(
      'This mod does not contain a supported keyboard sound payload.'
    )
  }

  const entries = keyboard as Record<string, unknown>

  const root = manifestFile.webkitRelativePath
    .replace(/\\/g, '/')
    .split('/')[0]

  const resources = new Map(
    files.map((file) => [
      file.webkitRelativePath.replace(/\\/g, '/'),
      file,
    ])
  )

  const mapping: Record<KeyKind, string> = {
    letter: 'TYPING_LETTER',
    space: 'TYPING_SPACE',
    enter: 'TYPING_ENTER',
    backspace: 'TYPING_BACKSPACE',
  }

  const groups: ImportFiles = {}

  for (const key of keyKinds) {
    const raw = entries[mapping[key]]

    if (raw === undefined) continue

    if (!Array.isArray(raw) ||
        raw.some((entry) => typeof entry !== 'string')) {
      throw new Error(
        `Unsupported GX sound group: ${mapping[key]}`
      )
    }

    if (raw.length > MAX_CLIPS) {
      throw new Error('GX sound group contains too many clips.')
    }

    const selected: (File | null)[] = []

    for (const entry of raw as string[]) {
      // GX permits silent entries in a sequence.

      if (entry === '') {
        selected.push(null)
        continue
      }

      const path = entry.replace(/\\/g, '/')

      if (
        path.startsWith('/') ||
        path.includes(':') ||
        path.split('/').some(
          (part) => part === '..' || part === '.'
        )
      ) {
        throw new Error('Unsafe audio path in GX manifest.')
      }

      const file = resources.get(`${root}/${path}`)

      if (!file) {
        throw new Error(`Missing GX audio file: ${path}`)
      }

      selected.push(file)
    }

    groups[key] = selected
  }

  return importPack(
    typeof manifest.name === 'string'
      ? manifest.name
      : root,
    'gx',
    groups
  )
}

export function keyKind(key: string): KeyKind {
  if (key === ' ') return 'space'
  if (key === 'Enter') return 'enter'

  if (key === 'Backspace' || key === 'Delete') {
    return 'backspace'
  }

  return 'letter'
}

const positions = new Map<string, number>()

const decodedCache = new WeakMap<
  AudioContext,
  Map<string, Promise<AudioBuffer>>
>()

let activeClips = 0

export async function playImportedKey(
  context: AudioContext,
  id: string,
  key: KeyKind,
  volume: number
): Promise<boolean> {
  const pack = await loadSoundPack(id)

  if (!pack) return false

  const group = pack.clips[key]

  // Custom packs may reuse their letter clips.
  // Missing GX groups fall back to the built-in preset.

  const clips = group ?? (
    pack.source === 'custom'
      ? pack.clips.letter
      : undefined
  )

  if (!clips) return false
  if (clips.length === 0) return true

  const groupKey = `${id}:${key}`

  const position = positions.get(groupKey) ?? 0
  const index = position % clips.length

  positions.set(groupKey, position + 1)

  const clip = clips[index]

  if (clip === null) return true
  if (activeClips >= 12) return true

  let cache = decodedCache.get(context)

  if (!cache) {
    cache = new Map()
    decodedCache.set(context, cache)
  }

  const cacheKey = `${groupKey}:${index}`

  let decoding = cache.get(cacheKey)

  if (!decoding) {
    decoding = context.decodeAudioData(
      clip.slice(0)
    ).catch((error) => {
      cache?.delete(cacheKey)
      throw error
    })

    cache.set(cacheKey, decoding)
  }

  const buffer = await decoding

  if (activeClips >= 12) return true

  const source = context.createBufferSource()
  const gain = context.createGain()

  source.buffer = buffer

  gain.gain.value = Math.max(
    0,
    Math.min(1, volume)
  ) * 0.65

  source.connect(gain)
  gain.connect(context.destination)

  activeClips++

  source.onended = () => {
    activeClips = Math.max(0, activeClips - 1)
    source.disconnect()
    gain.disconnect()
  }

  source.start()

  return true
}
export function importNotificationClip(file: File) {
  return importPack(
    file.name.replace(/\.[^.]+$/, ''),
    'notification',
    { letter: [file] }
  )
}

function invalidateSoundLibrary(event: StorageEvent) {
  if (event.key === PACK_REVISION) {
    packCache.clear()
    positions.clear()
  }
}

window.addEventListener(
  'storage',
  invalidateSoundLibrary
)