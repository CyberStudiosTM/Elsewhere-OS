import { useSyncExternalStore } from 'react'

export const treasureCategories = {
  blinkies: 'Blinkies',
  buttons: '88×31 buttons',
  stamps: 'Stamps',
  glitter: 'Glitter graphics',
  gifs: 'GIFs',
  graphics: 'Graphics',
  dolls: 'Pixel dolls',
  dividers: 'Dividers',
  companions: 'Pixel companions',
  greetings: 'Greetings & reactions',
} as const

export type TreasureCategory = keyof typeof treasureCategories

export type Treasure = {
  id: string
  name: string
  category: TreasureCategory
  file: string
  tags: string[]
  creator: string
  source: string
  license: string
  animated: boolean
  width: number
  height: number
}

const categories: string[] = Object.keys(treasureCategories)

function isTreasure(item: unknown): item is Treasure {
  if (!item || typeof item !== 'object') return false
  const x = item as Partial<Treasure>
  return typeof x.id === 'string' && /^[a-z0-9_-]{1,80}$/.test(x.id) &&
    typeof x.name === 'string' && x.name.length > 0 && x.name.length <= 120 &&
    typeof x.category === 'string' && categories.includes(x.category) &&
    typeof x.file === 'string' && x.file.startsWith(`${x.category}/`) &&
    /^[\w.\-/ ]+$/.test(x.file) && !x.file.includes('..') &&
    /\.(png|gif|webp|jpe?g)$/i.test(x.file) &&
    Array.isArray(x.tags) && x.tags.every(t => typeof t === 'string') &&
    typeof x.creator === 'string' && x.creator.length > 0 &&
    typeof x.source === 'string' && x.source.length > 0 &&
    typeof x.license === 'string' && x.license.length > 0 &&
    typeof x.animated === 'boolean' &&
    Number.isInteger(x.width) && (x.width ?? 0) > 0 && (x.width ?? 0) <= 4096 &&
    Number.isInteger(x.height) && (x.height ?? 0) > 0 && (x.height ?? 0) <= 4096
}

export function treasureUrl(treasure: Treasure) {
  return '/web-treasures/' + treasure.file.split('/').map(encodeURIComponent).join('/')
}

let cache: Promise<Treasure[]> | undefined

let revision = 0
const listeners = new Set<() => void>()
if (import.meta.hot) {
  import.meta.hot.on('elsewhere:treasures-changed', () => {
    cache = undefined
    revision++
    for (const listener of listeners) listener()
  })
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function treasureRevision() { return revision }
export function useTreasureRevision() {
  return useSyncExternalStore(subscribe, treasureRevision)
}

export function loadTreasures(): Promise<Treasure[]> {
  if (cache) return cache
  cache = fetch('/web-treasures/manifest.json', { cache: 'no-cache' })
    .then(async r => {
      if (!r.ok) throw new Error('Web Treasures manifest unavailable.')
      const json: unknown = await r.json()
      if (!json || typeof json !== 'object') throw new Error('Invalid Web Treasures manifest.')
      const data = json as { version?: unknown; entries?: unknown }
      if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error('Invalid Web Treasures manifest.')
      if (!data.entries.every(isTreasure)) throw new Error('Invalid treasure entry or metadata.')
      const ids = data.entries.map((entry: Treasure) => entry.id)
      if (new Set(ids).size !== ids.length) throw new Error('Duplicate treasure IDs.')
      return data.entries as Treasure[]
    }).catch(error => { cache = undefined; throw error })
  return cache
}

export async function getTreasure(id: string) {
  return (await loadTreasures()).find(item => item.id === id)
}
