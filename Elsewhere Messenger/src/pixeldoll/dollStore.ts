import { readDoll, type DollProject, type Equipped } from './dollModel'

// Saved dolls and outfit sets, kept on this PC (IndexedDB). Dolls are always stored as editable data;
// the thumbnail is only a preview.

const DB = 'elsewhere-pixel-doll'
const VERSION = 1
export type OutfitSet = { id: string; name: string; equipped: Equipped[]; createdAt: string }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('dolls')) db.createObjectStore('dolls', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('outfits')) db.createObjectStore('outfits', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function run<T>(store: 'dolls' | 'outfits', mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = work(tx.objectStore(store))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export const saveDoll = (doll: DollProject) => run('dolls', 'readwrite', s => s.put({ ...doll, updatedAt: new Date().toISOString() }))
export const deleteDoll = (id: string) => run('dolls', 'readwrite', s => s.delete(id))
export async function listDolls(): Promise<DollProject[]> {
  const rows = await run<unknown[]>('dolls', 'readonly', s => s.getAll())
  return rows.map(readDoll).filter((doll): doll is DollProject => !!doll).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
export const saveOutfit = (outfit: OutfitSet) => run('outfits', 'readwrite', s => s.put(outfit))
export const deleteOutfit = (id: string) => run('outfits', 'readwrite', s => s.delete(id))
export async function listOutfits(): Promise<OutfitSet[]> {
  const rows = await run<OutfitSet[]>('outfits', 'readonly', s => s.getAll())
  return rows.filter(row => row && typeof row.id === 'string' && Array.isArray(row.equipped)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Crash recovery: the doll being edited is kept here until it's saved.
const RECOVERY = 'elsewhere.pixelDoll.recovery.v1'
export function writeRecovery(doll: DollProject | null) {
  try { if (doll) localStorage.setItem(RECOVERY, JSON.stringify(doll)); else localStorage.removeItem(RECOVERY) } catch { /* optional */ }
}
export function readRecovery(): DollProject | null {
  try { return readDoll(JSON.parse(localStorage.getItem(RECOVERY) || 'null')) } catch { return null }
}
