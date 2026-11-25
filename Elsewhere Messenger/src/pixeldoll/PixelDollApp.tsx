import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  BANDS, CATEGORIES, composeLayers, itemFits, moveItem, newDoll, newDollId, toggleItem,
  type CategoryId, type DollProject, type Item, type Library,
} from './dollModel'
import { PLACEHOLDER_LIBRARY } from './placeholderLibrary'
import { canvasPng, drawDoll, loadLibrary, renderDoll } from './dollRender'
import { deleteDoll, deleteOutfit, listDolls, listOutfits, readRecovery, saveDoll, saveOutfit, writeRecovery, type OutfitSet } from './dollStore'
import { saveLocalImage } from '../services/messengerMedia'
import { toolbarAction } from '../services/toolbarActions'
import './PixelDoll.css'

// Pixel Doll Studio (Phase 1: Foundation). Classic look by default. Doll art comes from Cyber's asset
// library; until it's added, the engine runs on clearly-labeled grey-box placeholder parts.

const HISTORY = 60
const ZOOMS = [1, 2, 3, 4] as const

/** Crisp preview of a doll (or a single item) drawn into a canvas element. */
function DollCanvas({ doll, library, scale, grid = false, className }: { doll: DollProject; library: Library; scale: number; grid?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    void drawDoll(doll, library).then(native => {
      const canvas = ref.current
      if (!alive || !canvas) return
      canvas.width = native.width * scale; canvas.height = native.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(native, 0, 0, canvas.width, canvas.height)
      if (grid && scale >= 2) {
        ctx.strokeStyle = 'rgba(8, 80, 180, .14)'; ctx.lineWidth = 1
        for (let x = 0; x <= native.width; x += 8) { ctx.beginPath(); ctx.moveTo(x * scale + .5, 0); ctx.lineTo(x * scale + .5, canvas.height); ctx.stroke() }
        for (let y = 0; y <= native.height; y += 8) { ctx.beginPath(); ctx.moveTo(0, y * scale + .5); ctx.lineTo(canvas.width, y * scale + .5); ctx.stroke() }
      }
    })
    return () => { alive = false }
  }, [doll, library, scale, grid])
  return <canvas ref={ref} className={className} />
}

/** An item's own pixels, cropped to what it covers and scaled up crisply to fit the card. */
function ItemThumb({ doll, library }: { doll: DollProject; library: Library }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    void drawDoll(doll, library).then(native => {
      const canvas = ref.current
      if (!alive || !canvas) return
      const data = native.getContext('2d')!.getImageData(0, 0, native.width, native.height).data
      let x0 = native.width, y0 = native.height, x1 = -1, y1 = -1
      for (let y = 0; y < native.height; y++) for (let x = 0; x < native.width; x++) if (data[(y * native.width + x) * 4 + 3]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      }
      const box = 56
      canvas.width = box; canvas.height = box
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, box, box)
      if (x1 < 0) return
      const w = x1 - x0 + 1, h = y1 - y0 + 1
      const scale = Math.max(1, Math.floor(Math.min((box - 4) / w, (box - 4) / h))) || 1
      const fit = Math.min(scale, (box - 4) / Math.max(w, h))
      const dw = Math.round(w * fit), dh = Math.round(h * fit)
      ctx.drawImage(native, x0, y0, w, h, Math.round((box - dw) / 2), Math.round((box - dh) / 2), dw, dh)
    })
    return () => { alive = false }
  }, [doll, library])
  return <canvas ref={ref} className="pd-thumb" />
}

/** A doll wearing just one item, with no body: used for item thumbnails. */
function itemOnly(item: Item, doll: DollProject, library: Library): [DollProject, Library] {
  return [{ ...doll, equipped: [{ item: item.id, color: doll.equipped.find(e => e.item === item.id)?.color || item.colors?.[0] }] },
    { ...library, bodies: library.bodies.map(body => ({ ...body, parts: [] })) }]
}

export default function PixelDollApp() {
  const [library, setLibrary] = useState<Library>(PLACEHOLDER_LIBRARY)
  const [doll, setDoll] = useState<DollProject>(() => newDoll(PLACEHOLDER_LIBRARY))
  const [past, setPast] = useState<DollProject[]>([])
  const [future, setFuture] = useState<DollProject[]>([])
  const [saved, setSaved] = useState(true)
  const [category, setCategory] = useState<CategoryId>('hair')
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number>(2)
  const [grid, setGrid] = useState(false)
  const [transparent, setTransparent] = useState(false)
  const [dialog, setDialog] = useState<'gallery' | 'export' | null>(null)
  const [recovery, setRecovery] = useState<DollProject | null>(null)
  const [outfits, setOutfits] = useState<OutfitSet[]>([])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void loadLibrary().then(setLibrary)
    const found = readRecovery()
    if (found) setRecovery(found)
    void listOutfits().then(setOutfits).catch(() => {})
  }, [])
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(''), 3200); return () => window.clearTimeout(t) }, [notice])
  // Autosave for crash recovery while there are unsaved changes.
  useEffect(() => { if (saved) return; const t = window.setTimeout(() => writeRecovery(doll), 600); return () => window.clearTimeout(t) }, [doll, saved])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (!saved) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saved])

  const change = useCallback((next: DollProject) => {
    setPast(list => [...list.slice(-HISTORY + 1), doll]); setFuture([]); setDoll(next); setSaved(false)
  }, [doll])
  const undo = useCallback(() => { if (!past.length) return; setFuture(list => [doll, ...list]); setDoll(past[past.length - 1]); setPast(list => list.slice(0, -1)); setSaved(false) }, [past, doll])
  const redo = useCallback(() => { if (!future.length) return; setPast(list => [...list, doll]); setDoll(future[0]); setFuture(list => list.slice(1)); setSaved(false) }, [future, doll])

  const { unavailable } = useMemo(() => composeLayers(doll, library), [doll, library])
  const worn = doll.equipped.map(entry => ({ entry, item: library.items.find(item => item.id === entry.item) })).filter(row => row.item) as { entry: DollProject['equipped'][number]; item: Item }[]
  const selectedRow = worn.find(row => row.item.id === selected)
  const items = library.items.filter(item => item.category === category)
  const placeholder = library.source !== 'library'

  async function save() {
    const native = await drawDoll(doll, library)
    const thumb = document.createElement('canvas'); thumb.width = native.width; thumb.height = native.height
    thumb.getContext('2d')!.drawImage(native, 0, 0)
    const next = { ...doll, thumbnail: thumb.toDataURL('image/png') }
    await saveDoll(next)
    setDoll(next); setSaved(true); writeRecovery(null); setNotice(`Saved “${next.name}”.`)
  }
  function confirmDiscard() { return saved || window.confirm('This doll has unsaved changes. Leave without saving?') }
  function startNew() { if (!confirmDiscard()) return; setDoll(newDoll(library)); setPast([]); setFuture([]); setSaved(true); writeRecovery(null) }
  function rename() {
    const name = window.prompt('Doll name', doll.name)?.trim()
    if (name) change({ ...doll, name: name.slice(0, 80) })
  }
  async function exportPng(scale: number) {
    const canvas = await renderDoll(doll, library, scale, transparent ? undefined : '#ffffff')
    const url = URL.createObjectURL(await canvasPng(canvas))
    const link = document.createElement('a')
    link.href = url; link.download = `${doll.name.replace(/[^\w -]+/g, '').trim() || 'pixel-doll'}@${scale}x.png`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
    setDialog(null); setNotice(`Exported at ${scale}× with crisp pixels.`)
  }
  async function sendToStudio() {
    const canvas = await renderDoll(doll, library, 4)
    const file = new File([await canvasPng(canvas)], `${doll.name || 'pixel-doll'}.png`, { type: 'image/png' })
    const ref = await saveLocalImage(file)
    toolbarAction({ kind: 'photo', mediaId: ref.id, sourceName: 'Pixel Doll Studio' })
    setNotice('Sent to Creative Studio. Your doll stays editable here.')
  }
  async function saveSet() {
    const name = window.prompt('Name this outfit set', 'My outfit')?.trim()
    if (!name || !doll.equipped.length) return
    const outfit: OutfitSet = { id: newDollId(), name: name.slice(0, 60), equipped: doll.equipped, createdAt: new Date().toISOString() }
    await saveOutfit(outfit); setOutfits(await listOutfits())
  }
  function closeWindow() {
    if (!confirmDiscard()) return
    writeRecovery(null)
    if (isTauri()) void getCurrentWindow().close(); else window.close()
  }

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo() }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo() }
      else if (key === 's') { event.preventDefault(); void save() }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  const groups = ['doll', 'wear', 'scene'] as const
  return <div className="pd-app">
    <div className="pd-titlebar" data-tauri-drag-region>
      <span className="pd-title-icon" aria-hidden="true">✿</span>
      <span data-tauri-drag-region>{doll.name}{saved ? '' : ' •'} · Elsewhere Pixel Doll Studio</span>
      {isTauri() && <>
        <button type="button" className="pd-win" aria-label="Minimize" onClick={() => void getCurrentWindow().minimize()}>_</button>
        <button type="button" className="pd-win" aria-label="Maximize" onClick={() => void getCurrentWindow().toggleMaximize()}>□</button>
      </>}
      <button type="button" className="pd-win pd-close" aria-label="Close" onClick={closeWindow}>×</button>
    </div>
    <div className="pd-toolbar" role="toolbar" aria-label="Doll">
      <button type="button" onClick={startNew}>✚ New Doll</button>
      <button type="button" onClick={() => setDialog('gallery')}>📂 My Dolls…</button>
      <button type="button" className="pd-primary" onClick={() => void save()}>💾 Save Doll</button>
      <button type="button" onClick={() => setDialog('export')}>🖼 Export PNG…</button>
      <button type="button" onClick={() => void sendToStudio().catch(error => setNotice(error instanceof Error ? error.message : String(error)))}>✦ Send to Studio</button>
      <span className="pd-sep" />
      <button type="button" disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
      <button type="button" disabled={!future.length} onClick={redo} title="Redo (Ctrl+Y)">↷ Redo</button>
      <button type="button" onClick={rename} title="Rename this doll">✎ Rename</button>
      <span className="pd-notice" role="status">{notice}</span>
    </div>
    {placeholder && <p className="pd-banner">Placeholder parts: plain grey-box shapes stand in for the doll art until Cyber's sprite library is added. Everything else works for real.</p>}
    {recovery && <div className="pd-banner pd-recovery" role="alert">
      Pixel Doll Studio closed before you saved <strong>{recovery.name}</strong>. Want it back?
      <button type="button" onClick={() => { setDoll(recovery); setSaved(false); setRecovery(null) }}>Restore</button>
      <button type="button" onClick={() => { writeRecovery(null); setRecovery(null) }}>Discard</button>
    </div>}
    <div className="pd-body">
      <nav className="pd-categories" aria-label="Categories">
        {groups.map(group => <div key={group} className="pd-cat-group">
          {CATEGORIES.filter(c => c.group === group).map(c => <button key={c.id} type="button" className={category === c.id ? 'is-active' : ''} onClick={() => setCategory(c.id)}>{c.label}</button>)}
        </div>)}
        <div className="pd-cat-group"><button type="button" disabled title="Pixel Room Builder comes in a later phase">Rooms <small>(later)</small></button></div>
      </nav>

      <section className="pd-items" aria-label={CATEGORIES.find(c => c.id === category)?.label}>
        <strong>{CATEGORIES.find(c => c.id === category)?.label}</strong>
        {category === 'bodies' && <div className="pd-list">{library.bodies.map(body => <button key={body.id} type="button" className={doll.body === body.id ? 'is-active' : ''}
          onClick={() => change({ ...doll, body: body.id, pose: body.poses.includes(doll.pose) ? doll.pose : body.poses[0] })}>{body.name}</button>)}</div>}
        {category === 'skin' && <div className="pd-swatches">{library.skins.map(skin => <button key={skin.id} type="button" title={skin.name} aria-label={skin.name}
          aria-pressed={doll.skin === skin.id} style={{ background: `linear-gradient(135deg, ${skin.ramp[0]}, ${skin.ramp[1]} 55%, ${skin.ramp[2]})` }} onClick={() => change({ ...doll, skin: skin.id })} />)}</div>}
        {category === 'poses' && <div className="pd-list">{library.poses.filter(pose => library.bodies.find(b => b.id === doll.body)?.poses.includes(pose.id) ?? true).map(pose =>
          <button key={pose.id} type="button" className={doll.pose === pose.id ? 'is-active' : ''} onClick={() => change({ ...doll, pose: pose.id })}>{pose.name}</button>)}</div>}
        {!['bodies', 'skin', 'poses'].includes(category) && (items.length ? <div className="pd-grid">{items.map(item => {
          const on = doll.equipped.some(entry => entry.item === item.id)
          const fits = itemFits(item, doll.body, doll.pose)
          const [thumbDoll, thumbLib] = itemOnly(item, doll, library)
          return <button key={item.id} type="button" className={'pd-item' + (on ? ' is-on' : '') + (fits ? '' : ' is-unfit')} aria-pressed={on}
            title={fits ? item.name : `${item.name}: not available in this pose`} onClick={() => { change(toggleItem(doll, library, item.id)); setSelected(item.id) }}>
            <ItemThumb doll={thumbDoll} library={thumbLib} />
            <span>{item.name.replace(/^Placeholder /, '')}</span>
            {!fits && <small>not in this pose</small>}
          </button>
        })}</div> : <p className="pd-empty">Nothing in {CATEGORIES.find(c => c.id === category)?.label} yet. It fills in from Cyber's asset library.</p>)}
      </section>

      <main className="pd-stage">
        <div className="pd-stage-bar">
          <label>View <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>{ZOOMS.map(z => <option key={z} value={z}>{z * 100}%</option>)}</select></label>
          <label><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} /> Show grid</label>
          <label><input type="checkbox" checked={transparent} onChange={event => setTransparent(event.target.checked)} /> Transparent BG</label>
          <span className="pd-pose-chip">{library.poses.find(p => p.id === doll.pose)?.name || doll.pose}</span>
        </div>
        <div className={'pd-stage-canvas' + (transparent ? ' is-transparent' : '')}>
          <div className="pd-arch"><DollCanvas doll={doll} library={library} scale={zoom} grid={grid} className="pd-doll" /></div>
        </div>
        {unavailable.length > 0 && <p className="pd-unfit" role="status">Not available in this pose (hidden, never stretched): {unavailable.map(item => item.name.replace(/^Placeholder /, '')).join(', ')}</p>}
      </main>

      <aside className="pd-side">
        <section>
          <strong>Layers (outfit)</strong>
          {worn.length ? <ol className="pd-layers">{[...worn].reverse().map(({ entry, item }) => <li key={item.id} className={selected === item.id ? 'is-selected' : ''}>
            <button type="button" className="pd-eye" aria-label={entry.hidden ? `Show ${item.name}` : `Hide ${item.name}`} aria-pressed={!entry.hidden}
              onClick={() => change({ ...doll, equipped: doll.equipped.map(e => e.item === item.id ? { ...e, hidden: !e.hidden } : e) })}>{entry.hidden ? '◌' : '👁'}</button>
            <button type="button" className="pd-layer-name" onClick={() => setSelected(item.id)}>{item.name.replace(/^Placeholder /, '')}<small>{item.parts.map(p => p.band).filter((b, i, a) => a.indexOf(b) === i).sort((a, b) => BANDS.indexOf(a) - BANDS.indexOf(b)).join(' · ')}</small></button>
            <button type="button" aria-label="Move toward front" onClick={() => change(moveItem(doll, item.id, 1))}>▲</button>
            <button type="button" aria-label="Move toward back" onClick={() => change(moveItem(doll, item.id, -1))}>▼</button>
            <button type="button" aria-label={`Take off ${item.name}`} onClick={() => change(toggleItem(doll, library, item.id))}>✕</button>
          </li>)}</ol> : <p className="pd-empty">Nothing worn yet. Pick items from the list.</p>}
          <small className="pd-hint">Parts are drawn in depth bands (back hair behind the body, front hair on top). ▲▼ change the order within a band.</small>
        </section>
        {selectedRow && <section>
          <strong>Selected item</strong>
          <p className="pd-selected-name">{selectedRow.item.name}</p>
          {selectedRow.item.colors && <div className="pd-swatches pd-colors">{selectedRow.item.colors.map(color => <button key={color} type="button" aria-label={`Color ${color}`} aria-pressed={selectedRow.entry.color === color}
            style={{ background: color }} onClick={() => change({ ...doll, equipped: doll.equipped.map(e => e.item === selectedRow.item.id ? { ...e, color } : e) })} />)}</div>}
        </section>}
        <section>
          <strong>Outfit sets</strong>
          <button type="button" disabled={!doll.equipped.length} onClick={() => void saveSet()}>Save set…</button>
          {outfits.map(outfit => <div key={outfit.id} className="pd-outfit">
            <button type="button" onClick={() => change({ ...doll, equipped: outfit.equipped })}>{outfit.name}</button>
            <button type="button" aria-label={`Delete ${outfit.name}`} onClick={() => { if (window.confirm(`Delete the outfit set “${outfit.name}”?`)) void deleteOutfit(outfit.id).then(listOutfits).then(setOutfits) }}>✕</button>
          </div>)}
        </section>
      </aside>
    </div>

    {dialog === 'export' && <div className="pd-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(null) }}>
      <section className="pd-dialog" role="dialog" aria-label="Export PNG">
        <header><strong>Export PNG</strong><button type="button" aria-label="Close" onClick={() => setDialog(null)}>×</button></header>
        <p>Pick a size. Pixels are scaled by whole numbers only, so they stay crisp squares. {transparent ? 'The background is transparent.' : 'The background is white (tick Transparent BG for none).'}</p>
        <div className="pd-export">{[1, 2, 3, 4].map(scale => <button key={scale} type="button" onClick={() => void exportPng(scale)}>{scale}×<small>{128 * scale}×{256 * scale}</small></button>)}</div>
      </section>
    </div>}
    {dialog === 'gallery' && <Gallery library={library} onClose={() => setDialog(null)} onOpen={found => {
      if (!confirmDiscard()) return
      setDoll(found); setPast([]); setFuture([]); setSaved(true); setDialog(null)
    }} />}
  </div>
}

function Gallery({ library, onClose, onOpen }: { library: Library; onClose: () => void; onOpen: (doll: DollProject) => void }) {
  const [dolls, setDolls] = useState<DollProject[] | null>(null)
  const refresh = () => void listDolls().then(setDolls).catch(() => setDolls([]))
  useEffect(refresh, [])
  return <div className="pd-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="pd-dialog pd-gallery" role="dialog" aria-label="My Dolls">
      <header><strong>My Dolls</strong><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
      {!dolls ? <p>Loading…</p> : !dolls.length ? <p>No saved dolls yet. Save one with 💾 Save Doll.</p> : <div className="pd-gallery-grid">{dolls.map(doll => <article key={doll.id}>
        <DollCanvas doll={doll} library={library} scale={1} className="pd-thumb" />
        <strong>{doll.name}</strong>
        <small>{new Date(doll.updatedAt).toLocaleDateString()}</small>
        <div>
          <button type="button" onClick={() => onOpen(doll)}>Open</button>
          <button type="button" onClick={() => void saveDoll({ ...doll, id: newDollId(), name: `${doll.name} copy`.slice(0, 80), createdAt: new Date().toISOString() }).then(refresh)}>Duplicate</button>
          <button type="button" onClick={() => { const name = window.prompt('Rename doll', doll.name)?.trim(); if (name) void saveDoll({ ...doll, name: name.slice(0, 80) }).then(refresh) }}>Rename</button>
          <button type="button" onClick={() => { if (window.confirm(`Delete “${doll.name}” forever? This can’t be undone.`)) void deleteDoll(doll.id).then(refresh) }}>Delete</button>
        </div>
      </article>)}</div>}
    </section>
  </div>
}
