import { isTauri } from '@tauri-apps/api/core'
import { emit, emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { SocialService } from '../components/SocialServiceFilter'

export const TOOLBAR_ACTION = 'elsewhere:toolbar-action'
export const NUDGE_LOCAL_ONLY = 'Nudge only available in local messaging'
export type ToolbarRequest = {
  kind: 'new-dm' | 'add-contact' | 'call' | 'photo' | 'mail' | 'accounts' | 'skinmapper' | 'media-player' | 'pixel-doll' | 'profile' | 'open-contact'
  /** For 'profile': whose profile to open (handle), or nothing for your own. */
  handle?: string
  edit?: boolean
  service?: SocialService
  video?: boolean
  personId?: string
  purpose?: 'reset-password'
  /** Local image library id of a photo to open in Studio. */
  mediaId?: string
  /** The conversation a Booth photo came from (Use in Messenger goes back there). */
  sourceId?: string
  /** Several Booth shots and the strip layout to put them in (multi-shot photo strips). */
  mediaIds?: string[]
  layout?: string
  sourceName?: string
}
export function toolbarAction(request: ToolbarRequest) {
  if (isTauri() && getCurrentWindow().label !== 'main') {
    void emitTo('main', TOOLBAR_ACTION, request).catch(console.error)
  } else {
    window.dispatchEvent(new CustomEvent(TOOLBAR_ACTION, { detail: request }))
  }
}

/** Opens Web Treasures (the panel lives in the main window). */
export function openWebTreasures() {
  if (isTauri()) void emit('elsewhere:web-treasures:open').catch(console.error)
  else window.dispatchEvent(new Event('elsewhere:web-treasures:open'))
}

const discordInbox = 'https://discord.com/channels/@me'
const instagramInbox = 'https://www.instagram.com/direct/inbox/'
async function openExternal(url: string) {
  if (isTauri()) await openUrl(url)
  else if (url.startsWith('https:')) window.open(url, '_blank', 'noopener,noreferrer')
  else window.location.href = url
}
export const openDefaultMail = () => openExternal('mailto:')
const CONTACT_EMAIL = 'elsewhere.os.info@gmail.com'
/** Opens an email to the Elsewhere team about a Web Treasure (credit fix or removal). */
export function requestTreasureRemoval(name?: string) {
  const subject = 'Web Treasures: credit or removal request' + (name ? ` (${name.slice(0, 80)})` : '')
  const body = [
    'Hi Elsewhere team,',
    '',
    'I made (or own) a graphic in Web Treasures and would like it:',
    '[ ] removed    [ ] credited differently',
    '',
    'Which graphic' + (name ? ` (I was looking at "${name.slice(0, 80)}")` : '') + ':',
    'Link to my original or my site:',
    'How I’d like to be credited (if keeping it):',
  ].join('\n')
  return openExternal(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
}
/** Opens the Windows Camera app. */
export const openCamera = () => openExternal('microsoft.windows.camera:')
export const openDiscordInbox = () => openExternal(discordInbox)
export const openInstagramInbox = () => openExternal(instagramInbox)
export function callPhone(number: string) {
  const normalized = number.trim().replace(/[(). -]/g, '')
  if (!/^\+?[0-9]{3,18}$/.test(normalized)) throw new Error('Enter a valid phone number.')
  return openExternal('tel:' + normalized)
}
