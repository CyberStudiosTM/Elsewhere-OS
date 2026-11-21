import { isTauri } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { SocialService } from '../components/SocialServiceFilter'

export const TOOLBAR_ACTION = 'elsewhere:toolbar-action'
export const NUDGE_LOCAL_ONLY = 'Nudge only available in local messaging'
export type ToolbarRequest = {
  kind: 'new-dm' | 'add-contact' | 'call' | 'photo' | 'mail' | 'accounts'
  service?: SocialService
  video?: boolean
  personId?: string
  purpose?: 'reset-password'
}
export function toolbarAction(request: ToolbarRequest) {
  if (isTauri() && getCurrentWindow().label !== 'main') {
    void emitTo('main', TOOLBAR_ACTION, request).catch(console.error)
  } else {
    window.dispatchEvent(new CustomEvent(TOOLBAR_ACTION, { detail: request }))
  }
}

const discordInbox = 'https://discord.com/channels/@me'
const instagramInbox = 'https://www.instagram.com/direct/inbox/'
async function openExternal(url: string) {
  if (isTauri()) await openUrl(url)
  else if (url.startsWith('https:')) window.open(url, '_blank', 'noopener,noreferrer')
  else window.location.href = url
}
export const openDefaultMail = () => openExternal('mailto:')
/** Opens the Windows Camera app. */
export const openCamera = () => openExternal('microsoft.windows.camera:')
export const openDiscordInbox = () => openExternal(discordInbox)
export const openInstagramInbox = () => openExternal(instagramInbox)
export function callPhone(number: string) {
  const normalized = number.trim().replace(/[(). -]/g, '')
  if (!/^\+?[0-9]{3,18}$/.test(normalized)) throw new Error('Enter a valid phone number.')
  return openExternal('tel:' + normalized)
}
