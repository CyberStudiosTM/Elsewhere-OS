import { isTauri } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

// Studio opens in its own resizable window ("photo-studio").

export const STUDIO_LABEL = 'photo-studio'
export const STUDIO_OPEN_PHOTO = 'elsewhere:studio:open-photo'
export type StudioOpen = { photo?: string; photos?: string[]; layout?: string; source?: string | null; sourceName?: string }

export function isStudioWindow() {
  if (isTauri()) return getCurrentWindow().label === STUDIO_LABEL
  return new URLSearchParams(window.location.search).has('studio')
}

function studioUrl(open: StudioOpen) {
  const params = new URLSearchParams({ studio: '1' })
  if (open.photo) params.set('photo', open.photo)
  if (open.photos?.length) params.set('photos', open.photos.slice(0, 8).join(','))
  if (open.layout) params.set('layout', open.layout)
  if (open.source) params.set('source', open.source)
  if (open.sourceName) params.set('sourceName', open.sourceName.slice(0, 80))
  return 'index.html?' + params.toString()
}

let opening = false
export async function openStudio(open: StudioOpen = {}) {
  if (!isTauri()) { window.open('/' + studioUrl(open).replace(/^index\.html/, ''), '_blank', 'noopener'); return }
  if (opening) return
  opening = true
  try {
    const existing = await WebviewWindow.getByLabel(STUDIO_LABEL)
    if (existing) {
      await existing.unminimize().catch(() => {})
      await existing.setFocus().catch(() => {})
      if (open.photo || open.photos?.length) await emitTo(STUDIO_LABEL, STUDIO_OPEN_PHOTO, open)
      return
    }
    const studio = new WebviewWindow(STUDIO_LABEL, {
      url: studioUrl(open),
      title: 'Elsewhere Creative Studio',
      width: 1100,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      center: true,
      decorations: false,
      resizable: true,
      maximizable: true,
      minimizable: true,
      closable: true,
      focus: true,
    })
    await studio.once('tauri://error', event => { console.error('Studio window error', event.payload) })
  } finally { opening = false }
}
