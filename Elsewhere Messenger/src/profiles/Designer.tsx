import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ANIMATIONS, DESIGN_WIDTH, FONTS, MODULES, renderDesignPage,
  type Design, type DesignElement, type DesignStyle, type ElementKind, type ModuleName, type ProfileData, type ProfileDoc,
} from './profileRender'
import CodeEditor from './CodeEditor'
import AlgoPanel from './AlgoPanel'
import { VIBES, generateLayout, type Decoration, type GeneratorOptions, type Structure, type Vibe } from './layoutGenerator'
import './Designer.css'

// Profile Workshop · Visual Designer: a Wix-style free-form editor. It edits doc.design; the shared renderer
// (profileRender.ts) draws the exact same page for visitors in the app and on the web.

type Props = {
  doc: ProfileDoc
  data: ProfileData
  onDoc: (next: ProfileDoc) => void
  onSave: (publish: boolean) => void
  onLeave: () => void
  dirty: boolean
  pickImage: (file: File) => Promise<string>
  onError: (message: string) => void
  /** Where code blocks run (dev harness overrides it). */
  sandboxUrl?: string
}
type Box = { x: number; y: number; w: number; h: number }
type Drag = { kind: 'move' | 'resize'; dir: string; startX: number; startY: number; start: Map<string, Box>; before: Design; moved: boolean }
type Guide = { axis: 'x' | 'y'; at: number }

const MODULE_LABELS: Record<ModuleName, string> = { identity: 'Name card', about: 'About me', interests: 'Interests', music: 'Profile song', links: 'Links', friends: 'Top Friends', bulletins: 'Bulletins', guestbook: 'Guestbook' }
const KIND_LABELS: Record<ElementKind, string> = { heading: 'Heading', text: 'Text', image: 'Picture', button: 'Button', divider: 'Divider', shape: 'Shape', module: 'Module', code: 'Code block' }
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP = 6
const newId = () => Math.random().toString(36).slice(2, 10)
const label = (e: DesignElement) => e.kind === 'module' ? MODULE_LABELS[e.module!] : (e.text?.trim().slice(0, 24) || KIND_LABELS[e.kind])

function starter(kind: ElementKind, module: ModuleName | undefined, y: number, theme: ProfileDoc['theme']): Omit<DesignElement, 'id' | 'z'> {
  const base = { x: 40, y, style: {} as DesignStyle }
  switch (kind) {
    case 'heading': return { ...base, kind, w: 520, h: 56, text: 'Hi, welcome to my page ♡', style: { size: 34, bold: true, color: theme.heading } }
    case 'text': return { ...base, kind, w: 420, h: 120, text: 'Write anything here. Double-check it in the properties panel →', style: { size: 15 } }
    case 'image': return { ...base, kind, w: 260, h: 200, style: { radius: 12, shadow: 1, fit: 'cover' } }
    case 'button': return { ...base, kind, w: 180, h: 44, text: 'Visit my links', style: { bg: theme.accent, color: '#ffffff', radius: 22, shadow: 1, bold: true } }
    case 'divider': return { ...base, kind, w: 600, h: 6, style: { color: theme.accent } }
    case 'shape': return { ...base, kind, w: 240, h: 160, style: { bg: theme.panel, radius: 18, shadow: 1, opacity: 0.9 } }
    case 'module': return { ...base, kind, module, w: module === 'guestbook' || module === 'bulletins' ? 560 : 440, h: module === 'identity' ? 190 : 260, style: {} }
    case 'code': return { ...base, kind, w: 420, h: 240, code: {
      html: '<div class="sparkle">click me ✦</div>',
      css: '.sparkle { display: grid; place-items: center; height: 100vh; font: bold 28px Tahoma, sans-serif; color: #ff5fa2; cursor: pointer; }',
      js: "document.querySelector('.sparkle').addEventListener('click', e => { e.target.textContent = 'hi ♡'; e.target.style.color = '#3a7bd5' })",
    } }
  }
}
/** Turns the Quick Customize page into designer modules so nothing is lost when switching. */
function fromLayout(doc: ProfileDoc): Design {
  const place: [ModuleName, number, number, number, number][] = [
    ['identity', 20, 20, 440, 200], ['about', 480, 20, 460, 260], ['music', 20, 240, 440, 120], ['interests', 20, 380, 440, 240],
    ['friends', 480, 300, 460, 220], ['links', 20, 640, 440, 160], ['bulletins', 480, 540, 460, 260], ['guestbook', 20, 820, 920, 320],
  ]
  const shown = (m: ModuleName) => m === 'identity' || doc.sections[m as keyof ProfileDoc['sections']] !== false
  return { on: true, height: 1180, elements: place.filter(([m]) => shown(m)).map(([module, x, y, w, h], i) => ({ id: newId(), kind: 'module', module, x, y, w, h, z: i, style: {} })) }
}

function NumberField({ label: text, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return <label className="dz-num">{text}<input type="number" value={Math.round(value * 100) / 100} min={min} max={max} step={step}
    onChange={e => { const v = Number(e.target.value); if (isFinite(v)) onChange(Math.min(max, Math.max(min, v))) }} /></label>
}

export default function Designer({ doc, data, onDoc, onSave, onLeave, dirty, pickImage, onError, sandboxUrl }: Props) {
  const [coding, setCoding] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [algo, setAlgo] = useState(false)
  const [gen, setGen] = useState<GeneratorOptions>({ vibe: 'frutiger-aero', structure: 'modular', decoration: 'decorated', seed: 1, modules: ['identity', 'about', 'music', 'friends', 'interests', 'links', 'bulletins', 'guestbook'] })
  const past = useRef<Design[]>([])
  const future = useRef<Design[]>([])
  const lastKey = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  const clipboard = useRef<DesignElement[]>([])
  const drag = useRef<Drag | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const mobileHost = useRef<HTMLDivElement>(null)
  const docRef = useRef(doc)
  useLayoutEffect(() => { docRef.current = doc })
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const syncHistory = () => setHistory({ undo: past.current.length, redo: future.current.length })

  const setDesign = useCallback((next: Design) => onDoc({ ...docRef.current, design: next }), [onDoc])
  /** Records an undo step (typing into one field within a moment counts as one step). */
  const commit = useCallback((next: Design, key = '') => {
    const now = Date.now()
    if (!key || key !== lastKey.current.key || now - lastKey.current.at > 900) { past.current.push(docRef.current.design); if (past.current.length > 200) past.current.shift() }
    lastKey.current = { key, at: now }
    future.current = []
    docRef.current = { ...docRef.current, design: next }
    setDesign(next); syncHistory()
  }, [setDesign])
  const undo = useCallback(() => { const prev = past.current.pop(); if (!prev) return; future.current.push(docRef.current.design); setDesign(prev); syncHistory() }, [setDesign])
  const redo = useCallback(() => { const next = future.current.pop(); if (!next) return; past.current.push(docRef.current.design); setDesign(next); syncHistory() }, [setDesign])

  function runGenerator(next: GeneratorOptions) {
    setGen(next)
    const made = generateLayout(next)
    past.current.push(docRef.current.design); future.current = []; syncHistory()
    onDoc({ ...docRef.current, theme: made.theme, design: made.design })
    setSelected([])
  }
  const generatorDialog = generating && <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}>
    <section className="dz-gen" role="dialog" aria-label="Layout Generator">
      <h2>✦ Layout Generator</h2>
      <p>Pick a vibe and a structure. Every result is a normal page you can keep editing.</p>
      <label>Vibe<select value={gen.vibe} onChange={e => setGen({ ...gen, vibe: e.target.value as Vibe })}>
        {Object.entries(VIBES).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}<option value="surprise">Surprise me</option></select></label>
      <label>Structure<select value={gen.structure} onChange={e => setGen({ ...gen, structure: e.target.value as Structure })}>
        <option value="two-column">Classic two columns</option><option value="modular">Modular homepage</option><option value="collage">Freeform collage</option><option value="surprise">Surprise me</option></select></label>
      <label>Decoration<select value={gen.decoration} onChange={e => setGen({ ...gen, decoration: e.target.value as Decoration })}>
        <option value="minimal">Minimal</option><option value="decorated">Decorated</option><option value="maximalist">Maximalist</option></select></label>
      <fieldset><legend>Pieces to include</legend>{MODULES.map(m => <label key={m} className="dz-check"><input type="checkbox" checked={gen.modules.includes(m)}
        onChange={e => setGen({ ...gen, modules: e.target.checked ? [...gen.modules, m] : gen.modules.filter(x => x !== m) })} /> {MODULE_LABELS[m]}</label>)}</fieldset>
      <p className="dz-tip">Generating replaces this page and its colors (Undo brings the page back).</p>
      <p className="dz-credit">the elsewhere profile generator runs on a rule-based algorithm designed by Cyber. no data sets, no AI generation, no generative slop. it runs right on your computer: just code, functions, and vibes ♡</p>
      <div className="dz-row">
        <button type="button" onClick={() => setGenerating(false)}>Close</button>
        <button type="button" onClick={() => runGenerator({ ...gen, seed: gen.seed + 1 })}>🎲 Try another</button>
        <button type="button" className="is-primary" onClick={() => { runGenerator(gen); setGenerating(false) }}>✦ Generate</button>
      </div>
    </section>
  </div>
  const design = doc.design
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [guides, setGuides] = useState<Guide[]>([])
  const [scale, setScale] = useState(1)
  const [zoomPick, setZoomPick] = useState<'fit' | number>('fit')
  const byId = useMemo(() => new Map(design.elements.map(e => [e.id, e])), [design.elements])
  const sel = selected.map(id => byId.get(id)).filter((e): e is DesignElement => !!e)
  const one = sel.length === 1 ? sel[0] : null
  const update = (ids: string[], change: (e: DesignElement) => DesignElement, key = '') =>
    commit({ ...design, elements: design.elements.map(e => ids.includes(e.id) ? change(e) : e) }, key)
  const style = (patch: Partial<DesignStyle>, key = '') => update(selected, e => ({ ...e, style: { ...e.style, ...patch } }), key)

  // Fit the 960px canvas into the space available.
  useLayoutEffect(() => {
    const el = viewport.current; if (!el) return
    const fit = () => setScale(zoomPick === 'fit' ? Math.min(1, (el.clientWidth - 24) / DESIGN_WIDTH) : zoomPick)
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect()
  }, [zoomPick, device])

  // Live WYSIWYG render through the same renderer visitors get.
  const pageData = useMemo<ProfileData>(() => ({ ...data, doc }), [data, doc])
  useEffect(() => {
    const target = device === 'desktop' ? host.current : mobileHost.current
    if (target) renderDesignPage(target, pageData, { profileHref: () => '#', sandboxUrl })
  }, [pageData, device, sandboxUrl])

  const height = Math.max(design.height, design.elements.reduce((m, e) => e.hidden ? m : Math.max(m, e.y + e.h), 0) + 40)

  function add(kind: ElementKind, module?: ModuleName) {
    const top = viewport.current ? viewport.current.scrollTop / scale + 40 : 40
    const z = design.elements.reduce((m, e) => Math.max(m, e.z), 0) + 1
    const el: DesignElement = { id: newId(), z, ...starter(kind, module, Math.round(top), doc.theme) }
    commit({ ...design, on: true, elements: [...design.elements, el] })
    setSelected([el.id])
  }
  function remove(ids = selected) { if (!ids.length) return; commit({ ...design, elements: design.elements.filter(e => !ids.includes(e.id)) }); setSelected([]) }
  function duplicate(source = sel, offset = 16) {
    if (!source.length) return
    const z = design.elements.reduce((m, e) => Math.max(m, e.z), 0)
    const groupMap = new Map<string, string>()
    const copies = source.map((e, i) => ({ ...e, id: newId(), x: e.x + offset, y: e.y + offset, z: z + 1 + i, locked: false,
      group: e.group ? (groupMap.get(e.group) || (groupMap.set(e.group, newId()), groupMap.get(e.group)!)) : undefined, style: { ...e.style } }))
    commit({ ...design, elements: [...design.elements, ...copies] })
    setSelected(copies.map(c => c.id))
  }
  function arrange(how: 'front' | 'forward' | 'backward' | 'back') {
    if (!sel.length) return
    const sorted = [...design.elements].sort((a, b) => a.z - b.z)
    const ids = new Set(selected)
    let list = sorted
    if (how === 'front') list = [...sorted.filter(e => !ids.has(e.id)), ...sorted.filter(e => ids.has(e.id))]
    if (how === 'back') list = [...sorted.filter(e => ids.has(e.id)), ...sorted.filter(e => !ids.has(e.id))]
    if (how === 'forward') for (let i = list.length - 2; i >= 0; i--) if (ids.has(list[i].id) && !ids.has(list[i + 1].id)) { list = [...list]; [list[i], list[i + 1]] = [list[i + 1], list[i]] }
    if (how === 'backward') for (let i = 1; i < list.length; i++) if (ids.has(list[i].id) && !ids.has(list[i - 1].id)) { list = [...list]; [list[i], list[i - 1]] = [list[i - 1], list[i]] }
    const z = new Map(list.map((e, i) => [e.id, i]))
    commit({ ...design, elements: design.elements.map(e => ({ ...e, z: z.get(e.id)! })) })
  }
  function group() { if (sel.length < 2) return; const g = newId(); update(selected, e => ({ ...e, group: g })) }
  function ungroup() { update(selected, e => ({ ...e, group: undefined })) }
  function select(id: string, additive: boolean) {
    const e = byId.get(id); if (!e) return
    const ids = e.group ? design.elements.filter(x => x.group === e.group).map(x => x.id) : [id]
    setSelected(prev => additive ? (prev.includes(id) ? prev.filter(x => !ids.includes(x)) : [...prev, ...ids.filter(x => !prev.includes(x))]) : ids)
  }

  // ---------- Drag / resize with snapping guides ----------
  function snapEdges(moving: Box, ignore: Set<string>) {
    const xs = [0, DESIGN_WIDTH / 2, DESIGN_WIDTH], ys = [0]
    for (const e of design.elements) { if (ignore.has(e.id) || e.hidden) continue; xs.push(e.x, e.x + e.w / 2, e.x + e.w); ys.push(e.y, e.y + e.h / 2, e.y + e.h) }
    const pick = (values: number[], targets: number[]) => {
      let best: { delta: number; at: number } | null = null
      for (const v of values) for (const t of targets) { const d = t - v; if (Math.abs(d) <= SNAP / scale && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t } }
      return best
    }
    return { x: pick([moving.x, moving.x + moving.w / 2, moving.x + moving.w], xs), y: pick([moving.y, moving.y + moving.h / 2, moving.y + moving.h], ys) }
  }
  function startDrag(event: ReactPointerEvent, id: string, dir = '') {
    if (event.button !== 0) return
    event.stopPropagation()
    const e = byId.get(id); if (!e) return
    let ids = selected
    if (!selected.includes(id)) { const grouped = e.group ? design.elements.filter(x => x.group === e.group).map(x => x.id) : [id]; ids = event.shiftKey ? [...selected, ...grouped] : grouped; setSelected(ids) }
    if (dir === '' && ids.some(x => byId.get(x)?.locked)) return
    if (dir && e.locked) return
    drag.current = { kind: dir ? 'resize' : 'move', dir, startX: event.clientX, startY: event.clientY, before: design, moved: false,
      start: new Map(ids.map(x => { const el = byId.get(x)!; return [x, { x: el.x, y: el.y, w: el.w, h: el.h }] })) }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }
  function onPointerMove(event: ReactPointerEvent) {
    const d = drag.current; if (!d) return
    let dx = (event.clientX - d.startX) / scale, dy = (event.clientY - d.startY) / scale
    if (!d.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return
    d.moved = true
    const ignore = new Set(d.start.keys())
    const found: Guide[] = []
    if (d.kind === 'move') {
      const boxes = [...d.start.values()]
      const union = boxes.reduce((u, b) => ({ x: Math.min(u.x, b.x), y: Math.min(u.y, b.y), r: Math.max(u.r, b.x + b.w), b: Math.max(u.b, b.y + b.h) }), { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity })
      if (!event.altKey) {
        const s = snapEdges({ x: union.x + dx, y: union.y + dy, w: union.r - union.x, h: union.b - union.y }, ignore)
        if (s.x) { dx += s.x.delta; found.push({ axis: 'x', at: s.x.at }) }
        if (s.y) { dy += s.y.delta; found.push({ axis: 'y', at: s.y.at }) }
      }
      setDesign({ ...d.before, elements: d.before.elements.map(e => { const b = d.start.get(e.id); return b ? { ...e, x: Math.round(b.x + dx), y: Math.round(Math.max(0, b.y + dy)) } : e }) })
    } else {
      const [id, b] = [...d.start.entries()][0]
      let { x, y, w, h } = b
      if (d.dir.includes('e')) w = b.w + dx
      if (d.dir.includes('s')) h = b.h + dy
      if (d.dir.includes('w')) { x = b.x + dx; w = b.w - dx }
      if (d.dir.includes('n')) { y = b.y + dy; h = b.h - dy }
      if (event.shiftKey && b.w && b.h) { const ratio = b.w / b.h; if (d.dir.length === 2) h = w / ratio }
      if (!event.altKey) {
        const s = snapEdges({ x, y, w, h }, ignore)
        if (s.x && (d.dir.includes('e') || d.dir.includes('w'))) { if (d.dir.includes('e')) w += s.x.delta; else { x += s.x.delta; w -= s.x.delta } found.push({ axis: 'x', at: s.x.at }) }
        if (s.y && (d.dir.includes('s') || d.dir.includes('n'))) { if (d.dir.includes('s')) h += s.y.delta; else { y += s.y.delta; h -= s.y.delta } found.push({ axis: 'y', at: s.y.at }) }
      }
      w = Math.max(8, w); h = Math.max(4, h)
      setDesign({ ...d.before, elements: d.before.elements.map(e => e.id === id ? { ...e, x: Math.round(x), y: Math.round(Math.max(0, y)), w: Math.round(w), h: Math.round(h) } : e) })
    }
    setGuides(found)
  }
  function onPointerUp() {
    const d = drag.current; drag.current = null; setGuides([])
    if (d?.moved) { past.current.push(d.before); future.current = []; lastKey.current = { key: '', at: 0 }; syncHistory() }
  }

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      const ctrl = event.ctrlKey || event.metaKey
      if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
      if (ctrl && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelected(design.elements.map(e => e.id)); return }
      if (!sel.length) return
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); return }
      if (event.key === 'Escape') { setSelected([]); return }
      if (ctrl && event.key.toLowerCase() === 'c') { clipboard.current = sel.map(e => ({ ...e, style: { ...e.style } })); return }
      if (ctrl && event.key.toLowerCase() === 'x') { clipboard.current = sel.map(e => ({ ...e })); remove(); return }
      if (ctrl && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(); return }
      if (ctrl && event.key.toLowerCase() === 'g') { event.preventDefault(); if (event.shiftKey) ungroup(); else group(); return }
      const step = event.shiftKey ? 10 : 1
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
      if (move && !sel.some(e => e.locked)) { event.preventDefault(); update(selected, e => ({ ...e, x: e.x + move[0], y: Math.max(0, e.y + move[1]) }), 'nudge') }
    }
    const onPaste = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && clipboard.current.length) { event.preventDefault(); duplicate(clipboard.current, 24) }
    }
    window.addEventListener('keydown', onKey); window.addEventListener('keydown', onPaste)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onPaste) }
  })

  async function upload(files: FileList | null, apply: (src: string) => void) {
    const file = files?.[0]; if (!file) return
    try { apply(await pickImage(file)) } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const size = useMemo(() => JSON.stringify(doc).length, [doc])

  // ---------- Empty state ----------
  if (!design.elements.length) return <div className="dz-start">
    <h2>✦ Visual Designer</h2>
    <p>Build your page your way: drag things anywhere, resize them, layer them, and style every piece.</p>
    <div className="dz-start-choices">
      <button type="button" onClick={() => commit(fromLayout(doc))}><strong>Start from my profile</strong><small>Turns your current page into pieces you can move around.</small></button>
      <button type="button" onClick={() => commit({ ...design, on: true, elements: [{ id: newId(), z: 1, ...starter('heading', undefined, 40, doc.theme) }] })}><strong>Blank canvas</strong><small>Start with just a heading and build from scratch.</small></button>
      <button type="button" onClick={() => setGenerating(true)}><strong>✦ Layout Generator</strong><small>Pick a vibe and get a decorated page to make your own.</small></button>
    </div>
    {generatorDialog}
    <button type="button" className="dz-link" onClick={onLeave}>← Back to Quick Customize</button>
  </div>

  const ordered = [...design.elements].sort((a, b) => b.z - a.z)
  return <div className="dz">
    <div className="dz-bar">
      <button type="button" onClick={undo} disabled={!history.undo} title="Undo (Ctrl+Z)">↶</button>
      <button type="button" onClick={redo} disabled={!history.redo} title="Redo (Ctrl+Y)">↷</button>
      <span className="dz-sep" />
      <span className="dz-device" role="group" aria-label="Preview device">
        <button type="button" className={device === 'desktop' ? 'is-on' : ''} onClick={() => setDevice('desktop')}>🖥 Desktop</button>
        <button type="button" className={device === 'mobile' ? 'is-on' : ''} onClick={() => setDevice('mobile')}>📱 Mobile</button>
      </span>
      {device === 'desktop' && <select value={String(zoomPick)} onChange={e => setZoomPick(e.target.value === 'fit' ? 'fit' : Number(e.target.value))} aria-label="Zoom">
        <option value="fit">Fit</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select>}
      <label className="dz-check"><input type="checkbox" checked={design.on} onChange={e => commit({ ...design, on: e.target.checked })} /> Use this design on my profile</label>
      <span className="dz-grow" />
      {size > 600000 && <span className="dz-warn" title="Profiles can hold about 700 KB">Almost full: use fewer or smaller pictures</span>}
      <button type="button" onClick={() => setGenerating(true)}>✦ Generate</button>
      <button type="button" onClick={() => setAlgo(true)}>🧠 Code generator</button>
      <button type="button" onClick={onLeave}>Quick Customize</button>
      <button type="button" onClick={() => onSave(false)} disabled={!dirty}>💾 Save draft</button>
      <button type="button" className="is-primary" onClick={() => onSave(true)}>✦ Publish</button>
    </div>
    <div className="dz-body">
      <aside className="dz-left">
        <h3>Add</h3>
        <div className="dz-add">
          {(['heading', 'text', 'image', 'button', 'divider', 'shape', 'code'] as const).map(k => <button key={k} type="button" onClick={() => add(k)}>{{ heading: '𝐇', text: '¶', image: '🖼', button: '⬭', divider: '―', shape: '◼', code: '</>' }[k]} {KIND_LABELS[k]}</button>)}
        </div>
        <h3>Profile pieces</h3>
        <div className="dz-add">
          {MODULES.map(m => <button key={m} type="button" onClick={() => add('module', m)}>{MODULE_LABELS[m]}</button>)}
        </div>
        <h3>Layers</h3>
        <ol className="dz-layers">
          {ordered.map(e => <li key={e.id} className={selected.includes(e.id) ? 'is-selected' : ''}>
            <button type="button" className="dz-layer-name" onClick={ev => select(e.id, ev.shiftKey)}>{e.group ? '⛓ ' : ''}{label(e)}</button>
            <button type="button" title={e.hidden ? 'Show' : 'Hide'} aria-label={e.hidden ? 'Show' : 'Hide'} onClick={() => update([e.id], x => ({ ...x, hidden: !x.hidden }))}>{e.hidden ? '◌' : '👁'}</button>
            <button type="button" title={e.locked ? 'Unlock' : 'Lock'} aria-label={e.locked ? 'Unlock' : 'Lock'} onClick={() => update([e.id], x => ({ ...x, locked: !x.locked }))}>{e.locked ? '🔒' : '🔓'}</button>
          </li>)}
        </ol>
      </aside>

      <div className="dz-viewport" ref={viewport} onPointerDown={() => setSelected([])}>
        {device === 'desktop' ? <div className="dz-stage-wrap" style={{ width: DESIGN_WIDTH * scale, height: height * scale }}>
          <div className="dz-stage" style={{ transform: `scale(${scale})`, height }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div ref={host} className="dz-host" />
            <div className="dz-overlay">
              {design.elements.map(e => <div key={e.id} className={'dz-box' + (selected.includes(e.id) ? ' is-selected' : '') + (e.locked ? ' is-locked' : '')}
                style={{ left: e.x, top: e.y, width: e.w, height: e.h, zIndex: 500 + e.z, transform: e.style.rot ? `rotate(${e.style.rot}deg)` : undefined }}
                onPointerDown={ev => startDrag(ev, e.id)} onDoubleClick={() => { if (e.kind === 'text' || e.kind === 'heading' || e.kind === 'button') document.getElementById('dz-text')?.focus() }}>
                {one?.id === e.id && !e.locked && HANDLES.map(dir => <span key={dir} className={`dz-handle dz-h-${dir}`} onPointerDown={ev => startDrag(ev, e.id, dir)} />)}
              </div>)}
              {guides.map((g, i) => <div key={i} className={'dz-guide dz-guide-' + g.axis} style={g.axis === 'x' ? { left: g.at } : { top: g.at }} />)}
            </div>
          </div>
        </div> : <div className="dz-phone"><div ref={mobileHost} className="dz-mobile-host" onClick={ev => { const id = (ev.target as HTMLElement).closest('[data-el]')?.getAttribute('data-el'); if (id) select(id, false) }} /></div>}
      </div>

      <aside className="dz-right" onPointerDown={e => e.stopPropagation()}>
        {!sel.length && <>
          <h3>Page</h3>
          <NumberField label="Page height" value={design.height} min={200} max={12000} step={20} onChange={v => commit({ ...design, height: v }, 'height')} />
          <p className="dz-tip">Click anything on the page to style it. Shift-click to pick several, then group them (Ctrl+G). Hold Alt while dragging to turn snapping off.</p>
          <p className="dz-tip">Colors, font and background pattern for the whole page are in Quick Customize.</p>
        </>}
        {sel.length > 1 && <>
          <h3>{sel.length} selected</h3>
          <div className="dz-row"><button type="button" onClick={group}>Group</button><button type="button" onClick={ungroup}>Ungroup</button></div>
          <div className="dz-row">
            <button type="button" onClick={() => { const l = Math.min(...sel.map(e => e.x)); update(selected, e => ({ ...e, x: l })) }}>⇤ Align left</button>
            <button type="button" onClick={() => { const t = Math.min(...sel.map(e => e.y)); update(selected, e => ({ ...e, y: t })) }}>⤒ Align top</button>
          </div>
          <div className="dz-row">
            <button type="button" onClick={() => { const c = sel.reduce((s, e) => s + e.x + e.w / 2, 0) / sel.length; update(selected, e => ({ ...e, x: Math.round(c - e.w / 2) })) }}>Center</button>
            <button type="button" onClick={() => { const m = Math.max(...sel.map(e => e.w)); update(selected, e => ({ ...e, w: m })) }}>Same width</button>
          </div>
        </>}
        {sel.length > 0 && <div className="dz-row dz-arrange">
          <button type="button" onClick={() => arrange('front')} title="Bring to front">⏫</button>
          <button type="button" onClick={() => arrange('forward')} title="Bring forward">🔼</button>
          <button type="button" onClick={() => arrange('backward')} title="Send backward">🔽</button>
          <button type="button" onClick={() => arrange('back')} title="Send to back">⏬</button>
          <button type="button" onClick={() => duplicate()} title="Duplicate (Ctrl+D)">⧉</button>
          <button type="button" onClick={() => remove()} title="Delete">🗑</button>
        </div>}
        {one && <>
          <h3>{one.kind === 'module' ? MODULE_LABELS[one.module!] : KIND_LABELS[one.kind]}</h3>
          <div className="dz-grid4">
            <NumberField label="X" value={one.x} min={-400} max={1160} onChange={v => update(selected, e => ({ ...e, x: v }), 'x')} />
            <NumberField label="Y" value={one.y} min={0} max={12000} onChange={v => update(selected, e => ({ ...e, y: v }), 'y')} />
            <NumberField label="W" value={one.w} min={8} max={2000} onChange={v => update(selected, e => ({ ...e, w: v }), 'w')} />
            <NumberField label="H" value={one.h} min={4} max={6000} onChange={v => update(selected, e => ({ ...e, h: v }), 'h')} />
          </div>
          {(one.kind === 'heading' || one.kind === 'text' || one.kind === 'button') && <label>Text<textarea id="dz-text" rows={one.kind === 'text' ? 6 : 2} maxLength={4000} value={one.text || ''} onChange={e => update(selected, x => ({ ...x, text: e.target.value }), 'text')} /></label>}
          {(one.kind === 'image' || one.kind === 'shape') && <>
            <label>{one.kind === 'image' ? 'Picture' : 'Fill picture (optional)'}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => void upload(e.target.files, src => update(selected, x => ({ ...x, src })))} /></label>
            {one.src && <button type="button" className="dz-link" onClick={() => update(selected, x => ({ ...x, src: undefined }))}>Remove picture</button>}
          </>}
          {one.kind === 'image' && <>
            <label>Description (for screen readers)<input value={one.text || ''} maxLength={200} onChange={e => update(selected, x => ({ ...x, text: e.target.value }), 'alt')} /></label>
            <label>Fit<select value={one.style.fit || 'cover'} onChange={e => style({ fit: e.target.value as 'cover' | 'contain' })}><option value="cover">Fill the box</option><option value="contain">Show the whole picture</option></select></label>
          </>}
          {one.kind !== 'divider' && one.kind !== 'shape' && one.kind !== 'module' && one.kind !== 'code' && <label>Link (https, optional)<input value={one.href || ''} placeholder="https://…" onChange={e => update(selected, x => ({ ...x, href: e.target.value }), 'href')} /></label>}
          {one.kind === 'code' && <>
            <button type="button" className="dz-code-btn" onClick={() => setCoding(true)}>{'</>'} Edit HTML, CSS & JavaScript…</button>
            <p className="dz-tip">Code runs in a locked sandbox: no sign-ins, messages, internet or private data.</p>
          </>}
          {one.kind === 'module' && <p className="dz-tip">This piece shows your real {MODULE_LABELS[one.module!]}, kept up to date automatically. Edit its content in Quick Customize.</p>}

          {(one.kind === 'heading' || one.kind === 'text' || one.kind === 'button' || one.kind === 'module') && <details open><summary>Text style</summary>
            <label>Font<select value={one.style.font || ''} onChange={e => style({ font: e.target.value || undefined })}><option value="">Page font</option>{FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select></label>
            <div className="dz-row">
              <NumberField label="Size" value={one.style.size || 15} min={8} max={160} onChange={v => style({ size: v }, 'size')} />
              <label className="dz-color">Color<input type="color" value={one.style.color || doc.theme.ink} onChange={e => style({ color: e.target.value }, 'color')} /></label>
            </div>
            <div className="dz-row dz-toggles">
              <button type="button" className={one.style.bold ? 'is-on' : ''} onClick={() => style({ bold: !one.style.bold })}><b>B</b></button>
              <button type="button" className={one.style.italic ? 'is-on' : ''} onClick={() => style({ italic: !one.style.italic })}><i>I</i></button>
              {(['left', 'center', 'right'] as const).map(a => <button key={a} type="button" className={(one.style.align || 'left') === a ? 'is-on' : ''} onClick={() => style({ align: a })}>{{ left: '⯇', center: '≡', right: '⯈' }[a]}</button>)}
            </div>
          </details>}
          <details open><summary>Fill & border</summary>
            <div className="dz-row">
              <label className="dz-color">{one.kind === 'divider' ? 'Line' : 'Fill'}<input type="color" value={(one.kind === 'divider' ? one.style.color : one.style.bg) || '#ffffff'} onChange={e => style(one.kind === 'divider' ? { color: e.target.value } : { bg: e.target.value }, 'bg')} /></label>
              {one.kind !== 'divider' && <label className="dz-check"><input type="checkbox" checked={!!one.style.bg2} onChange={e => style({ bg2: e.target.checked ? doc.theme.accent : undefined, bg: one.style.bg || doc.theme.panel })} /> Gradient</label>}
              {one.style.bg2 && <label className="dz-color">To<input type="color" value={one.style.bg2} onChange={e => style({ bg2: e.target.value }, 'bg2')} /></label>}
            </div>
            {one.style.bg2 && <NumberField label="Gradient angle" value={one.style.angle ?? 180} min={0} max={360} step={15} onChange={v => style({ angle: v }, 'angle')} />}
            {one.style.bg && <button type="button" className="dz-link" onClick={() => style({ bg: undefined, bg2: undefined })}>No fill</button>}
            <div className="dz-row">
              <NumberField label="Border" value={one.style.borderW || 0} min={0} max={24} onChange={v => style({ borderW: v }, 'bw')} />
              <label className="dz-color">Color<input type="color" value={one.style.borderColor || '#000000'} onChange={e => style({ borderColor: e.target.value }, 'bc')} /></label>
              <select aria-label="Border style" value={one.style.borderStyle || 'solid'} onChange={e => style({ borderStyle: e.target.value as DesignStyle['borderStyle'] })}><option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option></select>
            </div>
            <div className="dz-row">
              <NumberField label="Corners" value={one.style.radius || 0} min={0} max={400} onChange={v => style({ radius: v }, 'radius')} />
              <NumberField label="Padding" value={one.style.padding || 0} min={0} max={120} onChange={v => style({ padding: v }, 'pad')} />
            </div>
          </details>
          <details open><summary>Effects</summary>
            <label>Shadow<input type="range" min={0} max={3} value={one.style.shadow || 0} onChange={e => style({ shadow: Number(e.target.value) }, 'shadow')} /></label>
            <label>Opacity<input type="range" min={5} max={100} value={Math.round((one.style.opacity ?? 1) * 100)} onChange={e => style({ opacity: Number(e.target.value) / 100 }, 'opacity')} /></label>
            <NumberField label="Rotate (°)" value={one.style.rot || 0} min={-180} max={180} onChange={v => style({ rot: v }, 'rot')} />
            <label>Animation<select value={one.style.anim || 'none'} onChange={e => style({ anim: e.target.value as DesignStyle['anim'] })}>{ANIMATIONS.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
            <label className="dz-check"><input type="checkbox" checked={!!one.hideMobile} onChange={e => update(selected, x => ({ ...x, hideMobile: e.target.checked }))} /> Hide on phones</label>
          </details>
        </>}
      </aside>
    </div>
    {generatorDialog}
    {algo && <AlgoPanel sandboxUrl={sandboxUrl} onClose={() => setAlgo(false)} onInsert={code => {
      const top = viewport.current ? Math.round(viewport.current.scrollTop / scale + 40) : 40
      const z = design.elements.reduce((m, e) => Math.max(m, e.z), 0) + 1
      const el: DesignElement = { id: newId(), kind: 'code', x: 40, y: top, w: 480, h: 280, z, code, style: {} }
      commit({ ...design, on: true, elements: [...design.elements, el] }); setSelected([el.id])
    }} />}
    {coding && one?.kind === 'code' && <CodeEditor code={one.code || { html: '', css: '', js: '' }} sandboxUrl={sandboxUrl}
      onChange={next => update([one.id], x => ({ ...x, code: next }))} onClose={() => setCoding(false)} />}
  </div>
}

