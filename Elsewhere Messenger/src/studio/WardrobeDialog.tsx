// Skin Wardrobe ♡: the Studio's workspace looks. Changes panels, buttons and chrome only:
// never the canvas, layers, undo history or exported image. Classic is the default.

import { COLLECTIONS, DEFAULT_SKIN, SKINS, currentSkinId } from './studioSkins'

/** A skin id from studioSkins.ts. */
export type WardrobeLook = string
const KEY = 'elsewhere.studio.wardrobe.v1'

export const LOOKS = SKINS

export function readWardrobe(): WardrobeLook {
  try { return currentSkinId(localStorage.getItem(KEY)) } catch { return DEFAULT_SKIN }
}
export function writeWardrobe(look: WardrobeLook) {
  try { localStorage.setItem(KEY, look) } catch { /* the look applies for this session */ }
}

export default function WardrobeDialog({ current, onPreview, onChoose, onCancel }: {
  current: WardrobeLook; onPreview: (look: WardrobeLook) => void; onChoose: (look: WardrobeLook) => void; onCancel: () => void
}) {
  return <div className="ew-studio-modal" role="dialog" aria-modal="true" aria-label="Skin Wardrobe">
    <div className="ew-studio-modal-box ew-wardrobe">
      <h2>Skin Wardrobe ♡</h2>
      <p className="ew-studio-hint">Pick a look for Creative Studio’s workspace. Your work and exports never change.</p>
      {COLLECTIONS.map(collection => <section key={collection.id} className="ew-wardrobe-collection" aria-label={collection.name}>
        <h3>{collection.name}{collection.skins.length > 1 && collection.id !== 'classic-family' ? <small> · {collection.skins.length} looks</small> : null}</h3>
        <div className="ew-wardrobe-grid">
          {collection.skins.map(look => <button key={look.id} type="button" aria-pressed={current === look.id} className={current === look.id ? 'is-active' : ''}
            onClick={() => onPreview(look.id)} onDoubleClick={() => onChoose(look.id)}>
            <span className="ew-wardrobe-swatch" aria-hidden="true">{look.swatch.map(color => <i key={color} style={{ background: color }} />)}</span>
            <span className="ew-wardrobe-texture" aria-hidden="true" style={{ background: look.tokens['--st-canvas-bg'] ?? 'radial-gradient(circle at 30% 20%, #ffffff 0%, #e9f4fd 55%, #dbeefc 100%)' }} />
            <b>{look.name}{look.id === DEFAULT_SKIN ? ' (default)' : ''}</b>
            <small>{look.about}</small>
          </button>)}
        </div>
      </section>)}
      <div className="ew-studio-modal-actions">
        <button type="button" onClick={() => onChoose('classic')}>Restore Classic</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={() => onChoose(current)}>Use this look</button>
      </div>
    </div>
  </div>
}
