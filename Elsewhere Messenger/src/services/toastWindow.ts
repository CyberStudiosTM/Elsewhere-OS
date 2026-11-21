import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'

/** Elsewhere's own corner pop-up (like the classic "is now online" toast),
 * shown in a small always-on-top window that never takes focus. */
export const TOAST_LABEL = 'elsewhere-toast'
export const TOAST_SHOW = 'elsewhere:toast:show'
export const TOAST_READY = 'elsewhere:toast:ready'
export const TOAST_OPEN = 'elsewhere:toast:open'
export type ToastPayload = { source: string; sender?: string; preview?: string; contactId?: string }

const WIDTH = 330
const HEIGHT = 120
const STYLE_KEY = 'elsewhere.notification-style'
export type NotificationStyle = 'elsewhere' | 'windows'
export function notificationStyle(): NotificationStyle {
  try { return localStorage.getItem(STYLE_KEY) === 'windows' ? 'windows' : 'elsewhere' } catch { return 'elsewhere' }
}
export function setNotificationStyle(style: NotificationStyle) {
  try { localStorage.setItem(STYLE_KEY, style) } catch { /* default stays */ }
}

export const isToastWindow = () => isTauri() && getCurrentWindow().label === TOAST_LABEL

let pending: ToastPayload | null = null
let readyListener: Promise<() => void> | null = null

/** Main window: show a pop-up in the bottom-right corner of the current screen. */
export async function showElsewhereToast(payload: ToastPayload) {
  if (!isTauri()) return
  const existing = await WebviewWindow.getByLabel(TOAST_LABEL)
  if (existing) {
    await emitTo(TOAST_LABEL, TOAST_SHOW, payload)
    return
  }
  pending = payload
  readyListener ??= listen(TOAST_READY, () => {
    if (pending) void emitTo(TOAST_LABEL, TOAST_SHOW, pending).catch(console.error)
    pending = null
  })
  await readyListener
  const monitor = await currentMonitor()
  const scale = monitor?.scaleFactor || 1
  const area = monitor?.workArea ?? (monitor ? { position: monitor.position, size: monitor.size } : null)
  const x = area ? (area.position.x + area.size.width) / scale - WIDTH - 12 : undefined
  const y = area ? (area.position.y + area.size.height) / scale - HEIGHT - 12 : undefined
  new WebviewWindow(TOAST_LABEL, {
    url: 'index.html',
    title: 'Elsewhere Messenger',
    width: WIDTH,
    height: HEIGHT,
    ...(x !== undefined && y !== undefined ? { x, y } : { center: true }),
    decorations: false,
    transparent: true,
    shadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false,
    focusable: false,
  })
}
