import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { MediaRef } from './messengerMedia'

// Elsewhere Camera Booth (Studio Phase 1a). The Booth opens in the window that
// asked for it and remembers the conversation it came from. "Use Photo" stages an
// unsent attachment for exactly that conversation; nothing is ever sent automatically.

export type BoothSource = {
  /** Contact id of the originating conversation, or null when opened from the buddy list. */
  contactId: string | null
  contactName?: string
  /** Why Use Photo isn't available for this source (shown on the button), if it isn't. */
  useUnavailable?: string
}
export type StagedPhoto = { contactId: string; media: MediaRef }

const OPEN = 'elsewhere:photo-booth:open'
const STAGED = 'elsewhere:photo-booth:staged'

export function openPhotoBooth(source: BoothSource) {
  window.dispatchEvent(new CustomEvent<BoothSource>(OPEN, { detail: source }))
}
export function watchPhotoBoothOpen(action: (source: BoothSource) => void) {
  const handle = (event: Event) => action((event as CustomEvent<BoothSource>).detail)
  window.addEventListener(OPEN, handle)
  return () => window.removeEventListener(OPEN, handle)
}

let staged: StagedPhoto[] = []
export function stagePhoto(photo: StagedPhoto) {
  staged = [...staged.filter(item => item.contactId !== photo.contactId), photo]
  window.dispatchEvent(new Event(STAGED))
}
export function unstagePhoto(contactId: string) {
  staged = staged.filter(item => item.contactId !== contactId)
  window.dispatchEvent(new Event(STAGED))
}

/** Studio → Use in Messenger: stage the finished photo in the conversation it came from. */
export function listenForStudioPhotos() {
  const REMOTE = 'elsewhere:photo-booth:stage-remote'
  const apply = (photo: StagedPhoto | undefined) => { if (photo?.contactId && photo.media) stagePhoto(photo) }
  const local = (event: Event) => apply((event as CustomEvent<StagedPhoto>).detail)
  window.addEventListener(REMOTE, local)
  let stop: (() => void) | undefined
  let disposed = false
  if (isTauri()) void listen<StagedPhoto>(REMOTE, ({ payload }) => apply(payload))
    .then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
  return () => { disposed = true; stop?.(); window.removeEventListener(REMOTE, local) }
}

/** The unsent Booth photo waiting in this conversation, if any. */
export function useStagedPhoto(contactId: string | null | undefined): MediaRef | undefined {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const update = () => setVersion(value => value + 1)
    window.addEventListener(STAGED, update)
    return () => window.removeEventListener(STAGED, update)
  }, [])
  return contactId ? staged.find(item => item.contactId === contactId)?.media : undefined
}
