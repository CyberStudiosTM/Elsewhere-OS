import { useEffect, useRef } from 'react'
import { toolbarAction } from '../services/toolbarActions'
import { useStudioPreview } from '../services/previewFeatures'
import './ActivitiesMenu.css'

/** The Activities drop-down in conversation toolbars: Creative Studio (with SkinMapper under it). */
export default function ActivitiesMenu({ anchor, skin, onClose }: { anchor: HTMLElement | null; skin: 'classic' | 'dead-signal'; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null)
  const studio = useStudioPreview()
  useEffect(() => {
    if (!anchor) return
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const away = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose()
    }
    const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); anchor.focus() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', keys, true)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', keys, true) }
  }, [anchor, onClose])
  if (!anchor) return null
  const box = anchor.getBoundingClientRect()
  const left = Math.max(4, Math.min(box.left, window.innerWidth - 200))
  return <div ref={menu} className={`ew-activities-menu ew-activities-${skin}`} role="menu" aria-label="Activities"
    style={{ top: box.bottom + 2, left }}>
    <button type="button" role="menuitem" onClick={() => { onClose(); toolbarAction({ kind: 'photo' }) }}>Creative Studio…</button>
    <button type="button" role="menuitem" onClick={() => { onClose(); toolbarAction({ kind: 'skinmapper' }) }} title="Design your own Messenger skin">SkinMapper… <span>(beta)</span></button>
    {studio
      ? <button type="button" role="menuitem" title="Make and dress your own pixel doll" onClick={() => { onClose(); toolbarAction({ kind: 'pixel-doll' }) }}>Pixel Doll Studio… <span>(beta)</span></button>
      : <button type="button" role="menuitem" disabled title="Coming soon">Pixel Doll Studio <span>(coming soon)</span></button>}
  </div>
}
