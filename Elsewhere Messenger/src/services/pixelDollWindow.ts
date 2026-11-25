import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

// Pixel Doll Studio opens in its own resizable window ("pixel-doll").
export const PIXEL_DOLL_LABEL = 'pixel-doll'
export function isPixelDollWindow() {
  if (isTauri()) return getCurrentWindow().label === PIXEL_DOLL_LABEL
  return new URLSearchParams(window.location.search).has('pixel-doll')
}
let opening = false
export async function openPixelDoll() {
  if (!isTauri()) { window.open('/?pixel-doll=1', '_blank', 'noopener'); return }
  if (opening) return
  opening = true
  try {
    const existing = await WebviewWindow.getByLabel(PIXEL_DOLL_LABEL)
    if (existing) { await existing.unminimize().catch(() => {}); await existing.setFocus().catch(() => {}); return }
    const win = new WebviewWindow(PIXEL_DOLL_LABEL, {
      url: 'index.html?pixel-doll=1', title: 'Elsewhere Pixel Doll Studio', width: 1180, height: 780, minWidth: 760, minHeight: 560,
      center: true, decorations: false, resizable: true, maximizable: true, minimizable: true, closable: true, focus: true,
    })
    await win.once('tauri://error', event => { console.error('Pixel Doll Studio window error', event.payload) })
  } finally { opening = false }
}
