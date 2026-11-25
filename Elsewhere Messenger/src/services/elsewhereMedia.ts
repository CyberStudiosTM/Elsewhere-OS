import { cloud, type CloudMessage } from './connectedClient'
import { readLocalImage, resolveGiphy, type MediaRef } from './messengerMedia'
import { getTreasure, treasureUrl } from './webTreasures'
import { getTreasureFile } from './treasureVaultDb'

// Photos and GIFs in Elsewhere DMs. Runs in the main window (it holds the sign-in).
// Photos upload to the private bucket at <me>/<friend>/<id>.<ext>; GIFs are GIPHY links.

export const DM_MEDIA_BUCKET = 'elsewhere-dm-media'
const MAX_BYTES = 8 * 1024 * 1024
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

export type PreparedMedia = { kind: 'image' | 'gif'; body: string }

async function blobFor(media: Exclude<MediaRef, { kind: 'giphy' }>): Promise<Blob> {
  let blob: Blob | null | undefined
  if (media.kind === 'local') blob = await readLocalImage(media.id)
  else {
    blob = await getTreasureFile(media.id)
    if (!blob) {
      const item = await getTreasure(media.id)
      if (item) { const response = await fetch(treasureUrl(item)); if (response.ok) blob = await response.blob() }
    }
  }
  if (!blob) throw new Error('This image is missing from your library.')
  return blob
}

/** Uploads a photo (or resolves a GIF) for this friend or group and returns what to send.
 * `folder` is the friend's id for DMs, or "group-<id>" for group chats. */
export async function prepareElsewhereMedia(me: string, folder: string, media: MediaRef): Promise<PreparedMedia> {
  if (media.kind === 'giphy') {
    const url = (await resolveGiphy(media.id))?.images?.original?.url
    if (!url) throw new Error('GIPHY didn’t return that GIF. Try another one.')
    const target = new URL(url)
    if (target.protocol !== 'https:' || !/(^|\.)giphy\.com$/.test(target.hostname)) throw new Error('Unexpected GIF link.')
    return { kind: 'gif', body: target.href.slice(0, 600) }
  }
  if (!cloud) throw new Error('Sign in to Elsewhere first.')
  const blob = await blobFor(media)
  const extension = EXTENSIONS[blob.type]
  if (!extension) throw new Error('Send a PNG, JPEG, GIF or WebP image.')
  if (blob.size > MAX_BYTES) throw new Error('Photos can be up to 8 MB.')
  const path = `${me}/${folder}/${crypto.randomUUID()}.${extension}`
  const { error } = await cloud.storage.from(DM_MEDIA_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw new Error('The photo couldn’t be uploaded. Check your connection and try again.')
  return { kind: 'image', body: path }
}

const urlCache = new Map<string, { url: string; expires: number }>()
/** A short-lived link to a photo in a conversation the signed-in person is part of. */
export async function elsewhereMediaUrl(me: string, path: string): Promise<string> {
  const parts = path.split('/')
  // DMs: one of the two folders is mine. Groups: the server only allows current members to read.
  if (parts.length !== 3 || (!parts.slice(0, 2).includes(me) && !parts[1].startsWith('group-'))) throw new Error('That photo isn’t in your conversations.')
  const cached = urlCache.get(path)
  if (cached && cached.expires > Date.now() + 60000) return cached.url
  if (!cloud) throw new Error('Sign in to Elsewhere first.')
  const { data, error } = await cloud.storage.from(DM_MEDIA_BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new Error('The photo couldn’t be loaded.')
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3600_000 })
  return data.signedUrl
}

/** Short text for previews and notifications. */
export function elsewhereMessageSummary(message: Pick<CloudMessage, 'kind' | 'text_body'>) {
  return message.kind === 'image' ? 'Sent a photo' : message.kind === 'gif' ? 'Sent a GIF' : message.text_body
}
