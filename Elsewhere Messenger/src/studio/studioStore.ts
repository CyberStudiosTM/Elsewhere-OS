import type { StudioProject } from './studioModel'

// Editable projects and crash recovery for Studio, kept on this PC in IndexedDB.
// Projects reference photos in the local image library; nothing is uploaded.

const DATABASE = 'elsewhere-photo-studio'
const PROJECTS = 'projects'
const RECOVERY = 'recovery'
const RECOVERY_KEY = 'current'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(RECOVERY)) db.createObjectStore(RECOVERY)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Studio storage is unavailable.'))
  })
}

async function run<T>(store: string, mode: IDBTransactionMode, action: (objects: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = action(tx.objectStore(store))
      let value: T | undefined
      if (request) request.onsuccess = () => { value = request.result }
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error ?? new Error('Studio storage failed.'))
      tx.onabort = () => reject(tx.error ?? new Error('Studio storage was interrupted. The disk may be full.'))
    })
  } finally { db.close() }
}

export async function saveProject(project: StudioProject) {
  await run(PROJECTS, 'readwrite', store => store.put(project))
}
export async function loadProject(id: string) {
  return run<StudioProject>(PROJECTS, 'readonly', store => store.get(id) as IDBRequest<StudioProject>)
}
/** Saved projects, newest first. Trashed ones are left out unless includeTrash is set. */
export async function listProjects(includeTrash = false): Promise<StudioProject[]> {
  const rows = await run<StudioProject[]>(PROJECTS, 'readonly', store => store.getAll() as IDBRequest<StudioProject[]>) || []
  return rows.filter(row => includeTrash || !row.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
async function updateProject(id: string, change: (project: StudioProject) => StudioProject) {
  const found = await loadProject(id)
  if (found) await saveProject(change(found))
}
/** Moves a project to Trash (recoverable). */
export const trashProject = (id: string) => updateProject(id, project => ({ ...project, deletedAt: new Date().toISOString() }))
export const restoreProject = (id: string) => updateProject(id, project => { const next = { ...project }; delete next.deletedAt; return next })
export async function deleteProjectForever(id: string) {
  await run(PROJECTS, 'readwrite', store => store.delete(id))
}
/** Kept for older callers: now moves to Trash instead of deleting. */
export const deleteProject = trashProject

/** Autosave of the open session, so an interrupted edit can be restored. */
export async function saveRecovery(project: StudioProject) {
  await run(RECOVERY, 'readwrite', store => store.put(project, RECOVERY_KEY))
}
export async function loadRecovery() {
  return run<StudioProject>(RECOVERY, 'readonly', store => store.get(RECOVERY_KEY) as IDBRequest<StudioProject>)
}
export async function clearRecovery() {
  await run(RECOVERY, 'readwrite', store => store.delete(RECOVERY_KEY))
}

// ---------- My Treasures ----------
// The person's own uploaded images. The image data lives in the local image library
// (elsewhere-media-library); this list remembers which ones are their treasures.
export type MyTreasure = { id: string; name: string; width: number; height: number; size: number; addedAt: string }
const MY_TREASURES = 'elsewhere.my-treasures.v1'
const MY_TREASURES_CHANGED = 'elsewhere:my-treasures-changed'
export function listMyTreasures(): MyTreasure[] {
  try {
    const rows = JSON.parse(localStorage.getItem(MY_TREASURES) || '[]')
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.id === 'string' && typeof row.name === 'string') : []
  } catch { return [] }
}
function writeMyTreasures(rows: MyTreasure[]) {
  localStorage.setItem(MY_TREASURES, JSON.stringify(rows))
  window.dispatchEvent(new Event(MY_TREASURES_CHANGED))
}
export function addMyTreasure(item: MyTreasure) { writeMyTreasures([item, ...listMyTreasures().filter(row => row.id !== item.id)]) }
export function removeMyTreasure(id: string) { writeMyTreasures(listMyTreasures().filter(row => row.id !== id)) }
export function findDuplicateTreasure(name: string, size: number) { return listMyTreasures().find(row => row.name === name && row.size === size) }
export function watchMyTreasures(action: () => void) {
  window.addEventListener(MY_TREASURES_CHANGED, action)
  return () => window.removeEventListener(MY_TREASURES_CHANGED, action)
}
