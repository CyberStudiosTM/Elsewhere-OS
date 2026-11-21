import { useEffect, useState } from 'react'

export const PROFILE_PHOTOS = [
  { id: 'flower', label: 'Flower', url: '/approved/classic-extracts-v2/avatar-flower-full.png' },
  { id: 'cloud', label: 'Cloud', url: '/approved/classic-extracts-v2/avatar-cloud-clean.png' },
  { id: 'palm', label: 'Palm tree', url: '/approved/classic-extracts-v2/avatar-palm-full.png' },
  { id: 'skull', label: 'CRT skull', url: '/approved/dead-signal/avatars/crt-skull.png' },
  { id: 'sunset', label: 'Red sunset', url: '/approved/dead-signal/avatars/red-sunset-palm.png' },
  { id: 'tower', label: 'Transmission tower', url: '/approved/dead-signal/avatars/transmission-tower.png' },
] as const

const KEY = 'elsewhere.profile-photo.v1:'
const CHANGED = 'elsewhere:profile-photo-changed'
const validCustom = (value: string) => value.length <= 350000 && /^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(value)

function readProfilePhoto(owner: string | null) {
  if (!owner) return ''
  try {
    const value = localStorage.getItem(KEY + owner) || ''
    return PROFILE_PHOTOS.some(item => item.id === value) || validCustom(value) ? value : ''
  } catch { return '' }
}

export function saveProfilePhoto(owner: string, value: string) {
  if (value) localStorage.setItem(KEY + owner, value)
  else localStorage.removeItem(KEY + owner)
  window.dispatchEvent(new Event(CHANGED))
}

export function useProfilePhoto(owner: string | null) {
  const [entry, setEntry] = useState(() => ({ owner, value: readProfilePhoto(owner) }))
  useEffect(() => {
    const update = () => setEntry({ owner, value: readProfilePhoto(owner) })
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === KEY + owner) update()
    }
    window.addEventListener(CHANGED, update)
    window.addEventListener('storage', onStorage)
    update()
    return () => {
      window.removeEventListener(CHANGED, update)
      window.removeEventListener('storage', onStorage)
    }
  }, [owner])
  const value = entry.owner === owner ? entry.value : readProfilePhoto(owner)
  return { value, url: PROFILE_PHOTOS.find(item => item.id === value)?.url || (validCustom(value) ? value : undefined) }
}

export async function prepareProfilePhoto(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
    throw new Error('Choose a PNG, JPEG, WebP or GIF up to 8 MB.')
  }
  const image = await createImageBitmap(file)
  try {
    const side = Math.min(image.width, image.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare the picture.')
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256)
    const result = canvas.toDataURL('image/webp', 0.87)
    if (!validCustom(result)) throw new Error('Could not save this picture. Try a different image.')
    return result
  } finally { image.close() }
}
