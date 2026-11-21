import { invoke, isTauri } from '@tauri-apps/api/core'
import { currentSoundPreferences, playNotificationSound } from './classicSounds'
import { notificationStyle, showElsewhereToast } from './toastWindow'

const ENABLED = 'elsewhere.desktop-notifications'
const PREVIEWS = 'elsewhere.desktop-notification-previews'

function on(key: string) {
  try { return localStorage.getItem(key) !== 'off' }
  catch { return false }
}
export function desktopNotificationsEnabled() { return on(ENABLED) }
export function notificationPreviewsEnabled() { return on(PREVIEWS) }
export function setDesktopNotifications(enabled: boolean) { localStorage.setItem(ENABLED, enabled ? 'on' : 'off') }
export function setNotificationPreviews(enabled: boolean) { localStorage.setItem(PREVIEWS, enabled ? 'on' : 'off') }

export async function desktopNotice(source: string, details?: { sender?: string; preview?: string; contactId?: string }) {
  // The incoming-message sound follows Elsewhere's sound settings (silent when set to Off).
  try { playNotificationSound('incoming', currentSoundPreferences()) } catch (error) { console.error(error) }
  if (!desktopNotificationsEnabled() || !isTauri()) return
  const visible = notificationPreviewsEnabled() ? details : undefined
  if (notificationStyle() === 'elsewhere') {
    await showElsewhereToast({
      source,
      sender: visible?.sender?.slice(0, 128),
      preview: visible?.preview?.replace(/\s+/g, ' ').slice(0, 220),
      contactId: details?.contactId,
    })
    return
  }
  await invoke('show_desktop_notification', {
    source,
    sender: visible?.sender?.slice(0, 128) || null,
    preview: visible?.preview?.replace(/\s+/g, ' ').slice(0, 220) || null,
  })
}
