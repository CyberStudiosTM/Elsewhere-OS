import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeAssets, type DesignElement, type ProfileAsset, type ProfileDoc } from './profileRender'
import { loadTreasures, treasureUrl, type Treasure } from '../services/webTreasures'

// Profile Workshop · Asset Manager: Project Assets (stored in the profile, used anywhere as `asset:<id>`),
// My Library (kept on this PC for any project), Web Treasures, Favorites and Unused. Import, organize,
// prepare copies (originals are never changed) and slice sprite sheets.

const MINE = 'elsewhere.assets.mine.v1'
type Shelf = 'project' | 'mine' | 'treasures' | 'favorites' | 'unused'
type Sprite = NonNullable<DesignElement['sprite']>
const newId = () => Math.random().toString(36).slice(2, 12)
const loadMine = (): ProfileAsset[] => { try { return normalizeAssets(JSON.parse(localStorage.getItem(MINE) || '[]')) } catch { return [] } }
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) + s.length }
const PRESETS = [['88×31 web button', 88, 31], ['99×56 stamp', 99, 56], ['150×20 blinkie', 150, 20], ['32×32 pixel icon', 32, 32], ['200×200 icon', 200, 200], ['800×300 banner', 800, 300]] as const

function readFile(file: File): Promise<string> { return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(new Error('read')); r.readAsDataURL(file) }) }
function loadImage(src: string): Promise<HTMLImageElement> { return new Promise((ok, fail) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => fail(new Error('That picture couldn’t be opened.')); i.src = src }) }
/** Canvas export: WebP for photos, PNG for pixel art/transparency (never smooths pixel art). */
function exportCanvas(c: HTMLCanvasElement, pixel: boolean) {
  if (pixel) return c.toDataURL('image/png')
  const webp = c.toDataURL('image/webp', 0.88)
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png')
}
/** Brings an imported picture into a size profiles can hold. Small GIFs stay animated. */
async function prepareImport(file: File): Promise<{ src: string; w: number; h: number; note?: string }> {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error(`${file.type || 'That file'} isn’t a PNG, JPEG, GIF or WebP.`)
  const data = await readFile(file)
  const img = await loadImage(data)
  if (data.length < 300000 && img.width <= 1600 && img.height <= 1600) return { src: data, w: img.width, h: img.height }
  const k = Math.min(1, 1200 / img.width, 1200 / img.height)
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  let src = exportCanvas(c, false)
  if (src.length > 380000) src = c.toDataURL('image/jpeg', 0.75)
  return { src, w: c.width, h: c.height, note: file.type === 'image/gif' ? 'Big GIFs are saved as a still picture to fit in your profile.' : undefined }
}

export default function AssetManager({ doc, onDoc, mode, onUse, onClose }: {
  doc: ProfileDoc; onDoc: (next: ProfileDoc) => void; mode: 'browse' | 'pick'
  onUse: (asset: ProfileAsset, sprite?: Sprite) => void; onClose: () => void
}) {
  const [shelf, setShelf] = useState<Shelf>('project')
  const [mine, setMine] = useState<ProfileAsset[]>(loadMine)
  const [treasures, setTreasures] = useState<Treasure[]>([])
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [picked, setPicked] = useState<string>('')
  const [note, setNote] = useState('')
  const [prep, setPrep] = useState<{ w: number; h: number; rot: number; flipH: boolean; flipV: boolean; trim: boolean; pixel: boolean } | null>(null)
  const [sprite, setSprite] = useState<Sprite | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const spritePreview = useRef<HTMLDivElement>(null)

  useEffect(() => { if (shelf === 'treasures' && !treasures.length) void loadTreasures().then(setTreasures).catch(() => setNote('Web Treasures couldn’t load.')) }, [shelf, treasures.length])
  const storeMine = (list: ProfileAsset[]) => { setMine(list); try { localStorage.setItem(MINE, JSON.stringify(list)) } catch { setNote('This PC’s library is full. Remove a few pictures first.') } }
  const setAssets = (assets: ProfileAsset[]) => onDoc({ ...doc, assets })

  // Every place a project asset is used (all pages).
  const allElements = useMemo(() => [...doc.design.elements, ...doc.design.pages.flatMap(p => p.elements)], [doc.design])
  const usage = (id: string) => allElements.filter(e => e.src === 'asset:' + id).length + (doc.avatar === 'asset:' + id ? 1 : 0)

  const treasureAssets: ProfileAsset[] = useMemo(() => treasures.map(t => ({ id: 't' + hash(t.id), name: t.name, src: treasureUrl(t), w: t.width, h: t.height, folder: t.category, tags: t.tags.slice(0, 8), fav: false, origin: t.creator ? `by ${t.creator}` : '' })), [treasures])
  const list = shelf === 'project' ? doc.assets : shelf === 'mine' ? mine : shelf === 'treasures' ? treasureAssets : shelf === 'favorites' ? [...doc.assets, ...mine].filter(a => a.fav) : doc.assets.filter(a => !usage(a.id))
  const folders = [...new Set(list.map(a => a.folder).filter(Boolean))]
  const term = search.trim().toLowerCase()
  const shown = list.filter(a => (!folder || a.folder === folder) && (!term || [a.name, a.folder, ...a.tags].some(x => x.toLowerCase().includes(term))))
  const current = list.find(a => a.id === picked) || null
  const inProject = current ? doc.assets.some(a => a.id === current.id) : false

  /** Copies an asset into Project Assets (treasures are converted to data so they work on the web too). */
  async function toProject(a: ProfileAsset): Promise<ProfileAsset> {
    if (doc.assets.some(x => x.id === a.id)) return a
    let src = a.src
    if (!src.startsWith('data:') && !src.startsWith('https:')) src = await readFile(new File([await (await fetch(src)).blob()], a.name, { type: 'image/png' }))
    const copy = { ...a, id: newId(), src }
    const dup = doc.assets.find(x => hash(x.src) === hash(src))
    if (dup) return dup
    setAssets([...doc.assets, copy]); return copy
  }
  async function importFiles(files: FileList | File[] | null) {
    if (!files?.length) return
    const added: ProfileAsset[] = []; const notes: string[] = []
    for (const file of [...files].slice(0, 20)) {
      try {
        const got = await prepareImport(file)
        if ([...doc.assets, ...added].some(a => hash(a.src) === hash(got.src))) { notes.push(`“${file.name.replace(/\.[^.]+$/, '')}” is already here.`); continue }
        added.push({ id: newId(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), src: got.src, w: got.w, h: got.h, folder: folder || '', tags: [], fav: false, origin: 'uploaded by you' })
        if (got.note) notes.push(got.note)
      } catch (cause) { notes.push(cause instanceof Error ? cause.message : String(cause)) }
    }
    if (added.length) setAssets([...doc.assets, ...added])
    setShelf('project'); setNote(`Added ${added.length} picture${added.length === 1 ? '' : 's'}.` + (notes.length ? ' ' + [...new Set(notes)].join(' ') : ''))
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => { const files = [...(event.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (files.length) { event.preventDefault(); void importFiles(files) } }
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste)
  })
  const edit = (patch: Partial<ProfileAsset>) => {
    if (!current) return
    if (inProject) setAssets(doc.assets.map(a => a.id === current.id ? { ...a, ...patch } : a))
    else if (shelf === 'mine' || mine.some(a => a.id === current.id)) storeMine(mine.map(a => a.id === current.id ? { ...a, ...patch } : a))
  }
  function remove() {
    if (!current) return
    if (inProject) {
      const n = usage(current.id)
      if (!window.confirm(n ? `“${current.name}” is used ${n} time${n === 1 ? '' : 's'} on your profile. Remove it anyway? Those pictures will be empty.` : `Remove “${current.name}” from this profile?`)) return
      setAssets(doc.assets.filter(a => a.id !== current.id))
    } else if (window.confirm(`Remove “${current.name}” from My Library on this PC?`)) storeMine(mine.filter(a => a.id !== current.id))
    setPicked('')
  }
  async function replace(files: FileList | null) {
    const file = files?.[0]; if (!file || !current || !inProject) return
    const n = usage(current.id)
    if (!window.confirm(`Replace “${current.name}” everywhere it’s used (${n} place${n === 1 ? '' : 's'})?`)) return
    try { const got = await prepareImport(file); edit({ src: got.src, w: got.w, h: got.h }); setNote('Replaced everywhere ♡') } catch (cause) { setNote(cause instanceof Error ? cause.message : String(cause)) }
  }
  /** Image prep: always saves a new copy so the original is kept. */
  async function savePrepared() {
    if (!current || !prep) return
    const img = await loadImage(current.src)
    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (prep.trim) {
      const t = document.createElement('canvas'); t.width = img.width; t.height = img.height
      const tc = t.getContext('2d')!; tc.drawImage(img, 0, 0)
      const d = tc.getImageData(0, 0, t.width, t.height).data
      let minX = t.width, minY = t.height, maxX = -1, maxY = -1
      for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (d[(y * t.width + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
      if (maxX >= 0) { sx = minX; sy = minY; sw = maxX - minX + 1; sh = maxY - minY + 1 }
    }
    const turned = prep.rot % 180 !== 0
    // prep.w/h describe the whole picture (already swapped when rotated); trimming keeps the same scale.
    const baseW = turned ? prep.h : prep.w, baseH = turned ? prep.w : prep.h
    const outW = Math.max(1, Math.round(sw * baseW / img.width)), outH = Math.max(1, Math.round(sh * baseH / img.height))
    const c = document.createElement('canvas'); c.width = turned ? outH : outW; c.height = turned ? outW : outH
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = !prep.pixel
    g.translate(c.width / 2, c.height / 2); g.rotate(prep.rot * Math.PI / 180); g.scale(prep.flipH ? -1 : 1, prep.flipV ? -1 : 1)
    g.drawImage(img, sx, sy, sw, sh, -outW / 2, -outH / 2, outW, outH)
    const src = exportCanvas(c, prep.pixel)
    const copy: ProfileAsset = { ...current, id: newId(), name: (current.name + ' copy').slice(0, 60), src, w: c.width, h: c.height, fav: false }
    setAssets([...doc.assets, copy]); setPicked(copy.id); setShelf('project'); setPrep(null); setNote('Saved a new copy. The original is unchanged.')
  }
  // Sprite preview.
  useEffect(() => {
    const box = spritePreview.current
    if (!box || !sprite || !current) return
    box.style.backgroundImage = `url("${current.src.replace(/"/g, '%22')}")`; box.style.backgroundSize = `${sprite.cols * 100}% ${sprite.rows * 100}%`
    let f = 0
    const show = () => { const c = f % sprite.cols, r = Math.floor(f / sprite.cols); box.style.backgroundPosition = `${sprite.cols > 1 ? c / (sprite.cols - 1) * 100 : 0}% ${sprite.rows > 1 ? r / (sprite.rows - 1) * 100 : 0}%`; f = (f + 1) % sprite.frames }
    show(); const t = window.setInterval(show, 1000 / sprite.fps); return () => window.clearInterval(t)
  }, [sprite, current])

  const kb = (a: ProfileAsset) => Math.round(a.src.length * 0.75 / 1024)
  return <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}>
    <section className="am" role="dialog" aria-label="Asset Manager" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void importFiles(e.dataTransfer.files) }}>
      <header className="ce-head">
        <strong>🖼 Asset Manager{mode === 'pick' ? ' · choose a picture' : ''}</strong><span className="ce-grow" />
        <button type="button" onClick={() => fileInput.current?.click()}>+ Import</button>
        <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => { void importFiles(e.target.files); e.target.value = '' }} />
        <button type="button" onClick={onClose}>Close</button>
      </header>
      {note && <p className="ws-note" role="status">{note}</p>}
      <div className="am-body">
        <nav className="am-shelves">
          {([['project', `Project Assets (${doc.assets.length})`], ['mine', `My Library (${mine.length})`], ['treasures', 'Web Treasures'], ['favorites', 'Favorites'], ['unused', 'Unused']] as const).map(([k, l]) =>
            <button key={k} type="button" className={shelf === k ? 'is-on' : ''} onClick={() => { setShelf(k); setFolder(''); setPicked('') }}>{l}</button>)}
          {folders.length > 0 && <><h3>Folders</h3><button type="button" className={!folder ? 'is-on' : ''} onClick={() => setFolder('')}>All</button>{folders.map(f => <button key={f} type="button" className={folder === f ? 'is-on' : ''} onClick={() => setFolder(f)}>📁 {f}</button>)}</>}
          <p className="dz-tip">Drag pictures in, or paste with Ctrl+V.</p>
        </nav>
        <div className="am-grid-wrap">
          <input className="am-search" type="search" placeholder="Search names, folders and tags" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="am-grid">
            {!shown.length && <p className="dz-tip">{shelf === 'project' ? 'No pictures yet. Import some, or bring them in from My Library or Web Treasures.' : 'Nothing here yet.'}</p>}
            {shown.map(a => <button key={a.id} type="button" className={'am-tile' + (picked === a.id ? ' is-on' : '')} onClick={() => setPicked(a.id)} onDoubleClick={() => void toProject(a).then(x => onUse(x))} aria-label={a.name}>
              <img src={a.src} alt="" loading="lazy" draggable={false} style={{ imageRendering: a.w && a.w <= 160 ? 'pixelated' : undefined }} />
              {a.fav && <span className="am-fav" aria-hidden="true">♥</span>}
            </button>)}
          </div>
        </div>
        <aside className="am-detail">
          {!current ? <p className="dz-tip">Pick a picture to see its details.</p> : <>
            <div className="am-big"><img src={current.src} alt="" style={{ imageRendering: current.w && current.w <= 160 ? 'pixelated' : undefined }} /></div>
            {(inProject || shelf === 'mine') ? <label>Name<input value={current.name} maxLength={60} onChange={e => edit({ name: e.target.value })} /></label> : <strong>{current.name}</strong>}
            <small>{current.w}×{current.h} · ~{kb(current)} KB{current.origin ? ` · ${current.origin}` : ''}{inProject ? ` · used ${usage(current.id)}×` : ''}</small>
            {(inProject || shelf === 'mine') && <>
              <label>Folder<input value={current.folder} maxLength={30} placeholder="(none)" onChange={e => edit({ folder: e.target.value })} /></label>
              <label>Tags (comma separated)<input value={current.tags.join(', ')} onChange={e => edit({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 8) })} /></label>
              <label className="dz-check"><input type="checkbox" checked={current.fav} onChange={e => edit({ fav: e.target.checked })} /> Favorite</label>
            </>}
            <div className="dz-row">
              <button type="button" className="is-primary" onClick={() => void toProject(current).then(x => onUse(x))}>{mode === 'pick' ? 'Choose' : 'Use on page'}</button>
              {!inProject && <button type="button" onClick={() => void toProject(current).then(() => setNote('Copied into Project Assets.'))}>+ Project</button>}
              {inProject && !mine.some(m => hash(m.src) === hash(current.src)) && <button type="button" onClick={() => storeMine([...mine, { ...current, id: newId() }])}>+ My Library</button>}
            </div>
            {inProject && <div className="dz-row">
              <button type="button" onClick={() => setPrep({ w: current.w || 200, h: current.h || 200, rot: 0, flipH: false, flipV: false, trim: false, pixel: (current.w || 999) <= 160 })}>✂ Edit a copy</button>
              <button type="button" onClick={() => setSprite({ cols: 4, rows: 1, frames: 4, fps: 8 })}>🎞 Sprite sheet</button>
              <button type="button" onClick={() => replaceInput.current?.click()}>Replace</button>
              <input ref={replaceInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => { void replace(e.target.files); e.target.value = '' }} />
            </div>}
            {(inProject || shelf === 'mine') && <button type="button" className="dz-link" onClick={remove}>Remove</button>}
            {prep && <div className="am-panel">
              <strong>Edit a copy</strong>
              <div className="dz-row"><label>W<input type="number" min={1} max={4000} value={prep.w} onChange={e => setPrep({ ...prep, w: Math.max(1, Math.min(4000, Number(e.target.value))) })} /></label>
                <label>H<input type="number" min={1} max={4000} value={prep.h} onChange={e => setPrep({ ...prep, h: Math.max(1, Math.min(4000, Number(e.target.value))) })} /></label></div>
              <select aria-label="Size preset" value="" onChange={e => { const p = PRESETS.find(x => x[0] === e.target.value); if (p) setPrep({ ...prep, w: p[1], h: p[2] }) }}><option value="">Size presets…</option>{PRESETS.map(p => <option key={p[0]} value={p[0]}>{p[0]}</option>)}</select>
              <div className="dz-row">
                <button type="button" onClick={() => setPrep({ ...prep, rot: (prep.rot + 90) % 360, w: prep.h, h: prep.w })}>⟳ Rotate</button>
                <button type="button" className={prep.flipH ? 'is-on' : ''} onClick={() => setPrep({ ...prep, flipH: !prep.flipH })}>⇋ Flip</button>
                <button type="button" className={prep.flipV ? 'is-on' : ''} onClick={() => setPrep({ ...prep, flipV: !prep.flipV })}>⇵ Flip</button>
              </div>
              <div className="dz-row">
                <button type="button" onClick={() => setPrep({ ...prep, w: prep.w * 2, h: prep.h * 2, pixel: true })}>×2 pixel</button>
                <button type="button" onClick={() => setPrep({ ...prep, w: prep.w * 3, h: prep.h * 3, pixel: true })}>×3 pixel</button>
              </div>
              <label className="dz-check"><input type="checkbox" checked={prep.trim} onChange={e => setPrep({ ...prep, trim: e.target.checked })} /> Trim see-through edges</label>
              <label className="dz-check"><input type="checkbox" checked={prep.pixel} onChange={e => setPrep({ ...prep, pixel: e.target.checked })} /> Keep pixels crisp (pixel art)</label>
              <div className="dz-row"><button type="button" onClick={() => setPrep(null)}>Cancel</button><button type="button" className="is-primary" onClick={() => void savePrepared()}>Save copy</button></div>
            </div>}
            {sprite && <div className="am-panel">
              <strong>Sprite Sheet Studio</strong>
              <div className="dz-row">
                <label>Columns<input type="number" min={1} max={32} value={sprite.cols} onChange={e => { const cols = Math.max(1, Math.min(32, Number(e.target.value))); setSprite({ ...sprite, cols, frames: Math.min(sprite.frames, cols * sprite.rows) || cols * sprite.rows }) }} /></label>
                <label>Rows<input type="number" min={1} max={32} value={sprite.rows} onChange={e => { const rows = Math.max(1, Math.min(32, Number(e.target.value))); setSprite({ ...sprite, rows, frames: sprite.cols * rows }) }} /></label>
              </div>
              <div className="dz-row">
                <label>Frames<input type="number" min={1} max={sprite.cols * sprite.rows} value={sprite.frames} onChange={e => setSprite({ ...sprite, frames: Math.max(1, Math.min(sprite.cols * sprite.rows, Number(e.target.value))) })} /></label>
                <label>Speed (fps)<input type="number" min={1} max={30} value={sprite.fps} onChange={e => setSprite({ ...sprite, fps: Math.max(1, Math.min(30, Number(e.target.value))) })} /></label>
              </div>
              <div className="am-sprite" ref={spritePreview} style={{ aspectRatio: `${(current.w / sprite.cols) || 1} / ${(current.h / sprite.rows) || 1}` }} />
              <div className="dz-row"><button type="button" onClick={() => setSprite(null)}>Cancel</button><button type="button" className="is-primary" onClick={() => { onUse(current, sprite); setSprite(null) }}>Use as animation</button></div>
            </div>}
          </>}
        </aside>
      </div>
    </section>
  </div>
}
