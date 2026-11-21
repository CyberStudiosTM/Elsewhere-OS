import type { IGAttachment, IGMessage, IGShare } from './instagramGraph'

export type InstagramAssetKind = 'image' | 'video' | 'reel' | 'post' | 'gif' | 'sticker' | 'audio' | 'file' | 'story' | 'profile' | 'location' | 'unknown'
export type InstagramAsset = {
  kind: InstagramAssetKind
  label: string
  url?: string
  title?: string
}
export type InstagramContent = { text: string; assets: InstagramAsset[]; fallback?: string; reactions: string[]; reply?: string }

// Never render arbitrary protocols from a remote message, even when inside a link.
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : undefined
  } catch { return undefined }
}
const arrayData = <T>(value: T[] | { data?: T[] } | undefined): T[] =>
  Array.isArray(value) ? value : value?.data || []

function classify(type: string, sticker: boolean): InstagramAssetKind {
  const t = type.toLowerCase()
  if (sticker || t.includes('sticker')) return 'sticker'
  if (t.includes('gif')) return 'gif'
  if (t.includes('reel')) return 'reel'
  if (t.includes('post') || t === 'share' || t === 'media') return 'post'
  if (t.includes('story')) return 'story'
  if (t.includes('image') || t === 'photo') return 'image'
  if (t.includes('video')) return 'video'
  if (t.includes('audio') || t.includes('voice')) return 'audio'
  if (t.includes('profile')) return 'profile'
  if (t.includes('location')) return 'location'
  if (t.includes('file')) return 'file'
  return 'unknown'
}
const LABELS: Record<InstagramAssetKind, string> = {
  image: 'Instagram photo', video: 'Instagram video', reel: 'Instagram Reel',
  post: 'Shared Instagram post', gif: 'GIF', sticker: 'Sticker',
  audio: 'Voice or audio message', file: 'Attached file', story: 'Instagram story',
  profile: 'Shared profile', location: 'Shared location', unknown: 'Instagram attachment',
}
function fromAttachment(a: IGAttachment): InstagramAsset {
  const kind = classify(a.type || '', !!a.image_data?.render_as_sticker)
  const url = safeUrl(a.image_data?.url) || safeUrl(a.video_data?.url) ||
    safeUrl(a.audio_data?.url) || safeUrl(a.file_url) || safeUrl(a.payload?.url) || safeUrl(a.url)
  return { kind, label: LABELS[kind], url, title: a.payload?.title || a.name }
}
function fromShare(s: IGShare): InstagramAsset {
  const kind = classify(s.type || 'share', false)
  return { kind, label: LABELS[kind], title: s.name || s.description, url: safeUrl(s.url) || safeUrl(s.link) }
}
export function parseInstagramContent(message: IGMessage): InstagramContent {
  const assets = [
    ...arrayData(message.attachments).map(fromAttachment),
    ...arrayData(message.shares).map(fromShare),
  ]
  const stories = Array.isArray(message.story) ? message.story : message.story ? [message.story] : []
  for (const story of stories) assets.push({ kind: 'story', label: LABELS.story, url: safeUrl(story.link) })
  const text = message.message || message.text || ''
  const reactions = arrayData(message.reactions).map(r => r.emoji || r.reaction || '').filter(Boolean)
  return {
    text,
    assets,
    reactions,
    reply: message.reply_to ? 'Reply to another Instagram message' : undefined,
    fallback: !text && assets.length === 0
      ? message.is_deleted ? 'This Instagram message was removed.' : message.is_unsupported ? 'Instagram has not made this message available through its API.' :
        'Message content was not provided by Meta. It may be media or unavailable content.'
      : undefined,
  }
}
