import { useEffect, useRef, useState } from 'react'
import { DECORATION_ANCHORS, DECORATION_LIMIT, type Decoration, type DecorationAnchor, type DecorationWindow } from './schema'
import { DECORATION_WINDOW_NAMES } from './decorations'
import { loadTreasures, treasureUrl, type Treasure } from '../services/webTreasures'
import { getTreasureFile } from '../services/treasureVaultDb'
import { readLocalImage } from '../services/messengerMedia'
import { listMyTreasures, type MyTreasure } from '../studio/studioStore'
import { studioStickers } from '../studio/studioStickers'
import { listGallery, type GalleryItem } from '../studio/studioGallery'

// SkinMapper: decorate a skin with Web Treasures, My Treasures, Creative Studio stickers and
// finished Studio creations. Pictures are copied into the skin, so it works anywhere it's worn.

const ANCHOR_NAMES: Record<DecorationAnchor, string> = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' }
type Source = 'treasures' | 'mine' | 'stickers' | 'gallery'

export default function DecorationsPanel({ decorations, view, urls, onChange, onAdd }: {
  decorations: Decoration[]
  view: DecorationWindow | 'notification'
  urls: Record<string, string>
  onChange: (next: Decoration[]) => void
  /** Adds a picture to the skin and places it on the current window. */
  onAdd: (blob: Blob, pixelated: boolean) => Promise<void>
}) {
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  if (view === 'notification') return <p className="sm-hint">Decorations go on the Buddy List, Conversation and Sign-In windows. Pick one of those tabs above the preview.</p>
  const here = decorations.filter(item => item.window === view)
  const current = decorations.find(item => item.id === selected && item.window === view) || here[here.length - 1]
  const update = (patch: Partial<Decoration>) => current && onChange(decorations.map(item => item.id === current.id ? { ...item, ...patch } : item))
  const full = decorations.length >= DECORATION_LIMIT

  return <div className="sm-decor">
    <p className="sm-hint">Stickers and Web Treasures on the {DECORATION_WINDOW_NAMES[view]} window. They never cover buttons: clicks go straight through them.</p>
    <div className="sm-decor-add">
      <button type="button" disabled={full} onClick={() => setPicking(true)}>+ Add a decoration…</button>
      <button type="button" disabled={full} onClick={() => fileInput.current?.click()}>+ From this PC…</button>
    </div>
    {full && <p className="sm-hint">A skin can have up to {DECORATION_LIMIT} decorations.</p>}
    {!here.length ? <p className="sm-hint">Nothing on this window yet.</p> : <div className="sm-decor-list">
      {here.map(item => <button key={item.id} type="button" className={item.id === current?.id ? 'is-active' : ''} onClick={() => setSelected(item.id)} aria-label="Select decoration">
        {urls[item.asset.path] ? <img src={urls[item.asset.path]} alt="" /> : '?'}</button>)}
    </div>}
    {current && <div className="sm-decor-edit">
      <label className="sm-field">Corner
        <select value={current.anchor} onChange={event => update({ anchor: event.target.value as DecorationAnchor })}>
          {DECORATION_ANCHORS.map(anchor => <option key={anchor} value={anchor}>{ANCHOR_NAMES[anchor]}</option>)}</select></label>
      <label className="sm-slider">Across {current.x}px<input type="range" min={-60} max={600} value={current.x} onChange={event => update({ x: Number(event.target.value) })} /></label>
      <label className="sm-slider">Down {current.y}px<input type="range" min={-60} max={700} value={current.y} onChange={event => update({ y: Number(event.target.value) })} /></label>
      <label className="sm-slider">Size {current.width}px<input type="range" min={8} max={400} value={current.width} onChange={event => update({ width: Number(event.target.value) })} /></label>
      <label className="sm-slider">Tilt {current.rotation || 0}°<input type="range" min={-180} max={180} value={current.rotation || 0} onChange={event => update({ rotation: Number(event.target.value) })} /></label>
      <label className="sm-slider">Opacity {Math.round((current.opacity ?? 1) * 100)}%<input type="range" min={10} max={100} value={Math.round((current.opacity ?? 1) * 100)} onChange={event => update({ opacity: Number(event.target.value) / 100 })} /></label>
      <label className="sm-check"><input type="checkbox" checked={Boolean(current.flip)} onChange={event => update({ flip: event.target.checked })} /> Flip</label>
      <label className="sm-check"><input type="checkbox" checked={Boolean(current.asset.pixelated)} onChange={event => update({ asset: { ...current.asset, pixelated: event.target.checked } })} /> Crisp pixels</label>
      <div className="sm-decor-add">
        <button type="button" onClick={() => {
          const index = decorations.findIndex(item => item.id === current.id)
          const next = [...decorations]; const [moved] = next.splice(index, 1); next.push(moved); onChange(next)
        }}>Bring to front</button>
        <button type="button" className="sm-danger" onClick={() => { onChange(decorations.filter(item => item.id !== current.id)); setSelected(null) }}>Remove</button>
      </div>
    </div>}
    {picking && <DecorationPicker onClose={() => setPicking(false)} onPick={async (blob, pixelated) => { setPicking(false); await onAdd(blob, pixelated) }} />}
    <input ref={fileInput} type="file" hidden accept="image/png,image/webp,image/jpeg,image/gif" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (file) void onAdd(file, false)
    }} />
  </div>
}

function DecorationPicker({ onClose, onPick }: { onClose: () => void; onPick: (blob: Blob, pixelated: boolean) => Promise<void> }) {
  const [source, setSource] = useState<Source>('treasures')
  const [treasures, setTreasures] = useState<Treasure[] | null>(null)
  const [mine] = useState<MyTreasure[]>(listMyTreasures)
  const [gallery, setGallery] = useState<GalleryItem[] | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void loadTreasures().then(setTreasures, () => setTreasures([])) }, [])
  useEffect(() => { if (source === 'gallery' && !gallery) void listGallery().then(list => setGallery(list.filter(item => !item.deletedAt)), () => setGallery([])) }, [source, gallery])
  const term = search.trim().toLowerCase()
  const take = async (load: () => Promise<Blob | null | undefined>, pixelated = false) => {
    if (busy) return
    setBusy(true)
    try { const blob = await load(); if (blob) await onPick(blob, pixelated) } finally { setBusy(false) }
  }
  const fetchBlob = async (url: string) => { const response = await fetch(url); return response.ok ? response.blob() : null }

  return <div className="sm-modal" role="dialog" aria-modal="true" aria-label="Add a decoration">
    <div className="sm-modal-box sm-picker">
      <h2>Add a decoration</h2>
      <div className="sm-picker-tabs" role="tablist">
        {([['treasures', '🌐 Web Treasures'], ['mine', '💾 My Treasures'], ['stickers', '🎀 Studio stickers'], ['gallery', '🖼️ My Gallery']] as [Source, string][]).map(([id, label]) =>
          <button key={id} type="button" role="tab" aria-selected={source === id} className={source === id ? 'is-active' : ''} onClick={() => setSource(id)}>{label}</button>)}
      </div>
      {source === 'treasures' && <input type="search" placeholder="Search Web Treasures" aria-label="Search Web Treasures" value={search} onChange={event => setSearch(event.target.value)} />}
      <div className="sm-picker-grid" aria-busy={busy}>
        {source === 'treasures' && (treasures === null ? <p className="sm-hint">Loading…</p> : treasures
          .filter(item => !term || (item.name + ' ' + item.tags.join(' ') + ' ' + item.creator).toLowerCase().includes(term))
          .map(item => <button key={item.id} type="button" title={item.creator ? 'by ' + item.creator.replace(/\s*\(from download info\)\s*/gi, '') : ''} aria-label="Web Treasure"
            onClick={() => void take(async () => (await getTreasureFile(item.id)) || fetchBlob(treasureUrl(item)), /pixel|blinkie|8-?bit/i.test(item.tags.join(' ')))}>
            <img src={treasureUrl(item)} alt="" loading="lazy" /></button>))}
        {source === 'mine' && (!mine.length ? <p className="sm-hint">Nothing in My Treasures yet. Add some in Creative Studio → Web Treasures.</p>
          : mine.map(item => <MineTile key={item.id} item={item} onPick={() => void take(() => readLocalImage(item.id), Math.max(item.width, item.height) <= 160)} />))}
        {source === 'stickers' && [...studioStickers.values()].map(art => <button key={art.id} type="button" title={art.pack} aria-label={'Sticker from ' + art.pack}
          onClick={() => void take(() => fetchBlob(art.url))}><img src={art.url} alt="" loading="lazy" /></button>)}
        {source === 'gallery' && (gallery === null ? <p className="sm-hint">Loading…</p> : !gallery.length ? <p className="sm-hint">Nothing in My Gallery yet. Finish a Creative Studio project and choose Save to Gallery.</p>
          : gallery.map(item => <GalleryTile key={item.id} item={item} onPick={() => void take(async () => item.blob)} />))}
      </div>
      <div className="sm-actions"><button type="button" onClick={onClose}>Cancel</button></div>
    </div>
  </div>
}

function useObjectUrl(load: () => Promise<Blob | null | undefined> | Blob | undefined) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true, made = ''
    void Promise.resolve(load()).then(blob => { if (alive && blob) { made = URL.createObjectURL(blob); setUrl(made) } })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}
function MineTile({ item, onPick }: { item: MyTreasure; onPick: () => void }) {
  const url = useObjectUrl(() => readLocalImage(item.id))
  return <button type="button" aria-label="My Treasure" onClick={onPick}>{url ? <img src={url} alt="" /> : '…'}</button>
}
function GalleryTile({ item, onPick }: { item: GalleryItem; onPick: () => void }) {
  const url = useObjectUrl(() => item.blob)
  return <button type="button" aria-label="Gallery picture" onClick={onPick}>{url ? <img src={url} alt="" /> : '…'}</button>
}
