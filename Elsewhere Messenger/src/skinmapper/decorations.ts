import type { AssetRef, Decoration, DecorationWindow } from './schema'

// Skin decorations: stickers, Web Treasures and Studio creations placed on the windows.
// They're pictures only: they sit above the window art, never take clicks and never move a control.

/** The real Classic window each decoration window means. */
export const DECORATION_TARGETS: Record<DecorationWindow, string> = {
  'buddy-list': '.em-buddy-window',
  conversation: '.em-chat-window',
  'sign-in': '.em-login-window',
}
export const DECORATION_WINDOW_NAMES: Record<DecorationWindow, string> = { 'buddy-list': 'Buddy List', conversation: 'Conversation', 'sign-in': 'Sign-In' }

/** Position and look of one decoration, as inline styles (React or DOM). */
export function decorationStyle(item: Decoration): Record<string, string> {
  const [vertical, horizontal] = item.anchor.split('-') as ['top' | 'bottom', 'left' | 'right']
  const style: Record<string, string> = {
    position: 'absolute', width: `${item.width}px`, height: 'auto', pointerEvents: 'none', userSelect: 'none',
    opacity: String(item.opacity ?? 1), transform: `rotate(${item.rotation || 0}deg)${item.flip ? ' scaleX(-1)' : ''}`, zIndex: '40',
  }
  style[vertical] = `${item.y}px`
  style[horizontal] = `${item.x}px`
  if (item.asset.pixelated) style.imageRendering = 'pixelated'
  return style
}

const LAYER = 'ew-skin-decor'
const kebab = (name: string) => name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())

/**
 * Puts the decorations into every open Classic window, and into windows that open later.
 * Returns a function that removes them again.
 */
export function mountDecorations(decorations: Decoration[] | undefined, urlFor: (asset: AssetRef) => string | undefined): () => void {
  const list = (decorations || []).filter(item => urlFor(item.asset))
  const remove = () => document.querySelectorAll('.' + LAYER).forEach(node => node.remove())
  remove()
  if (!list.length) return () => {}
  const signature = JSON.stringify(list)
  const apply = () => {
    for (const [family, selector] of Object.entries(DECORATION_TARGETS) as [DecorationWindow, string][]) {
      const mine = list.filter(item => item.window === family)
      if (!mine.length) continue
      document.querySelectorAll<HTMLElement>(selector).forEach(windowElement => {
        const existing = windowElement.querySelector<HTMLElement>(`:scope > .${LAYER}`)
        if (existing?.dataset.signature === signature) return
        existing?.remove()
        const layer = document.createElement('div')
        layer.className = LAYER
        layer.dataset.signature = signature
        layer.setAttribute('aria-hidden', 'true')
        layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;overflow:visible'
        for (const item of mine) {
          const image = document.createElement('img')
          image.src = urlFor(item.asset)!
          image.alt = ''
          image.draggable = false
          image.style.cssText = Object.entries(decorationStyle(item)).map(([key, value]) => `${kebab(key)}:${value}`).join(';')
          layer.appendChild(image)
        }
        windowElement.appendChild(layer)
      })
    }
  }
  apply()
  let queued = 0
  const observer = new MutationObserver(records => {
    if (records.every(record => [...record.addedNodes, ...record.removedNodes].every(node => node instanceof HTMLElement && node.classList.contains(LAYER)))) return
    if (!queued) queued = requestAnimationFrame(() => { queued = 0; apply() })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { observer.disconnect(); if (queued) cancelAnimationFrame(queued); remove() }
}
