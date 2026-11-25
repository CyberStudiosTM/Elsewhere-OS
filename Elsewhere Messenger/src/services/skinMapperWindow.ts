import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

// SkinMapper opens in its own resizable window ("skinmapper").
export const SKINMAPPER_LABEL = 'skinmapper'
export function isSkinMapperWindow() {
  if (isTauri()) return getCurrentWindow().label === SKINMAPPER_LABEL
  return new URLSearchParams(window.location.search).has('skinmapper')
}
let opening = false
export async function openSkinMapper() {
  if (!isTauri()) { window.open('/?skinmapper=1', '_blank', 'noopener'); return }
  if (opening) return
  opening = true
  try {
    const existing = await WebviewWindow.getByLabel(SKINMAPPER_LABEL)
    if (existing) { await existing.unminimize().catch(() => {}); await existing.setFocus().catch(() => {}); return }
    const win = new WebviewWindow(SKINMAPPER_LABEL, {
      url: 'index.html?skinmapper=1', title: 'Elsewhere SkinMapper', width: 1200, height: 760, minWidth: 720, minHeight: 520,
      center: true, decorations: false, resizable: true, maximizable: true, minimizable: true, closable: true, focus: true,
    })
    await win.once('tauri://error', event => { console.error('SkinMapper window error', event.payload) })
  } finally { opening = false }
}
