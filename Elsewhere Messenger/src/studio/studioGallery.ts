// Studio Gallery: finished photos and photo strips saved on this PC, with a
// recoverable Trash. Private and local; nothing is uploaded.

export type GalleryKind = 'photo' | 'strip'
export type GalleryItem = {
  id: string
  name: string
  kind: GalleryKind
  blob: Blob
  width: number
  height: number
  thumbnail: string
  favorite: boolean
  createdAt: string
  /** Set when moved to Trash; cleared on restore. */
  deletedAt?: string
  /** The editable project it came from, if any. */
  projectId?: string
}

const DATABASE = 'elsewhere-photo-gallery'
const STORE = 'items'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The Gallery is unavailable.'))
  })
}
async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      let value: T | undefined
      if (request) request.onsuccess = () => { value = request.result }
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error ?? new Error('The Gallery couldn’t save that.'))
      tx.onabort = () => reject(tx.error ?? new Error('Saving to the Gallery was interrupted. The disk may be full.'))
    })
  } finally { db.close() }
}

async function thumb(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = 240 / Math.max(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)))
    canvas.height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return { thumbnail: canvas.toDataURL('image/jpeg', .82), width: bitmap.width, height: bitmap.height }
  } finally { bitmap.close() }
}

export async function saveToGallery(blob: Blob, name: string, kind: GalleryKind = 'photo', projectId?: string): Promise<GalleryItem> {
  const info = await thumb(blob)
  const item: GalleryItem = { id: crypto.randomUUID(), name: name.slice(0, 80) || 'Elsewhere photo', kind, blob, ...info, favorite: false, createdAt: new Date().toISOString(), projectId }
  await run('readwrite', store => store.put(item))
  return item
}
export async function listGallery(): Promise<GalleryItem[]> {
  const rows = await run<GalleryItem[]>('readonly', store => store.getAll() as IDBRequest<GalleryItem[]>) || []
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
async function update(id: string, change: (item: GalleryItem) => GalleryItem) {
  const item = await run<GalleryItem>('readonly', store => store.get(id) as IDBRequest<GalleryItem>)
  if (item) await run('readwrite', store => store.put(change(item)))
}
export const renameGalleryItem = (id: string, name: string) => update(id, item => ({ ...item, name: name.slice(0, 80) || item.name }))
export const favoriteGalleryItem = (id: string, favorite: boolean) => update(id, item => ({ ...item, favorite }))
export const trashGalleryItem = (id: string) => update(id, item => ({ ...item, deletedAt: new Date().toISOString() }))
export const restoreGalleryItem = (id: string) => update(id, item => { const next = { ...item }; delete next.deletedAt; return next })
export const deleteGalleryItemForever = (id: string) => run('readwrite', store => store.delete(id))
export async function duplicateGalleryItem(id: string) {
  const item = await run<GalleryItem>('readonly', store => store.get(id) as IDBRequest<GalleryItem>)
  if (!item) return
  await run('readwrite', store => store.put({ ...item, id: crypto.randomUUID(), name: item.name + ' copy', createdAt: new Date().toISOString(), favorite: false }))
}
