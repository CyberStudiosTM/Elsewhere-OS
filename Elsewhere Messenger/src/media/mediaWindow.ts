import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

// The Elsewhere Media Player opens in its own see-through window ("media-player"), so shaped
// skins float on the desktop.
export const MEDIA_LABEL = 'media-player'
export function isMediaWindow() {
  if (isTauri()) return getCurrentWindow().label === MEDIA_LABEL
  return new URLSearchParams(window.location.search).has('media')
}
let opening = false
export async function openMediaPlayer() {
  if (!isTauri()) { window.open('/?media=1', '_blank', 'noopener'); return }
  if (opening) return
  opening = true
  try {
    const existing = await WebviewWindow.getByLabel(MEDIA_LABEL)
    if (existing) { await existing.unminimize().catch(() => {}); await existing.setFocus().catch(() => {}); return }
    const win = new WebviewWindow(MEDIA_LABEL, {
      url: 'index.html?media=1', title: 'Elsewhere Media Player', width: 720, height: 640, minWidth: 260, minHeight: 200,
      center: true, decorations: false, transparent: true, shadow: false, resizable: true, maximizable: true, minimizable: true, closable: true, focus: true,
    })
    await win.once('tauri://error', event => { console.error('Media Player window error', event.payload) })
  } finally { opening = false }
}
