import { useEffect, useMemo, useRef, useState } from 'react'
import { PROP_TYPES, codeFrame, compileWidget, normalizeWidgetPackage, widgetValues, type WidgetPackage, type WidgetProp } from './profileRender'
import { OFFICIAL_WIDGETS } from './widgetLibrary'
import CodeEditor from './CodeEditor'

// Profile Workshop · Widgets Studio: browse, customize, preview and insert widgets; build your own from
// HTML/CSS/JavaScript with declared settings; remix; and share them as .ewidget files.

const MINE = 'elsewhere.widgets.mine.v1'
type Values = Record<string, string | number | boolean>
const loadMine = (): WidgetPackage[] => { try { return (JSON.parse(localStorage.getItem(MINE) || '[]') as unknown[]).map(normalizeWidgetPackage).filter((w): w is WidgetPackage => !!w) } catch { return [] } }
const saveMine = (list: WidgetPackage[]) => { try { localStorage.setItem(MINE, JSON.stringify(list)) } catch { /* storage full */ } }

/** Friendly controls generated from a widget's declared properties (used here and in the Designer Inspector). */
export function WidgetPropsForm({ pkg, values, onChange }: { pkg: WidgetPackage; values: Values; onChange: (next: Values) => void }) {
  const groups = [...new Set(pkg.props.map(p => p.group || 'Settings'))]
  const set = (key: string, value: string | number | boolean) => onChange(widgetValues(pkg, { ...values, [key]: value }))
  return <div className="ws-form">{groups.map(g => <fieldset key={g}><legend>{g}</legend>{pkg.props.filter(p => (p.group || 'Settings') === g).map(p => {
    const v = values[p.key]
    return <label key={p.key} className={p.type === 'boolean' ? 'dz-check' : ''}>
      {p.type !== 'boolean' && p.label}
      {p.type === 'text' && <input value={String(v ?? '')} maxLength={400} onChange={e => set(p.key, e.target.value)} />}
      {p.type === 'number' && <input type="number" value={Number(v)} min={p.min} max={p.max} onChange={e => set(p.key, Number(e.target.value))} />}
      {p.type === 'color' && <input type="color" value={String(v)} onChange={e => set(p.key, e.target.value)} />}
      {p.type === 'select' && <select value={String(v)} onChange={e => set(p.key, e.target.value)}>{p.options?.map(o => <option key={o} value={o}>{o}</option>)}</select>}
      {p.type === 'boolean' && <><input type="checkbox" checked={Boolean(v)} onChange={e => set(p.key, e.target.checked)} /> {p.label}</>}
      {p.help && <small>{p.help}</small>}
    </label>
  })}</fieldset>)}</div>
}

function Preview({ pkg, values, sandboxUrl }: { pkg: WidgetPackage; values: Values; sandboxUrl?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const t = window.setTimeout(() => ref.current?.replaceChildren(codeFrame(compileWidget({ pkg, values }), sandboxUrl || '')), 300); return () => window.clearTimeout(t) }, [pkg, values, sandboxUrl])
  return <div className="ws-preview" ref={ref} style={{ minHeight: Math.min(320, pkg.minH + 20) }} />
}

const blankPackage = (): WidgetPackage => ({ id: 'my-widget-' + Math.random().toString(36).slice(2, 7), name: 'My widget', version: '1.0.0', author: '', description: '', category: 'Other', remix: true, minW: 200, minH: 150,
  props: [{ key: 'color', label: 'Color', type: 'color', default: '#ff5fa2', group: 'Appearance' }, { key: 'text', label: 'Text', type: 'text', default: 'hello ♡', group: 'Content' }],
  code: { html: '<div class="hi">{{text}}</div>', css: 'body{margin:0;display:grid;place-items:center;height:100vh}.hi{font:bold 26px "Trebuchet MS",sans-serif;color:{{color}}}', js: "// `props` holds this widget's settings, e.g. props.text\ndocument.querySelector('.hi').addEventListener('click', e => { e.target.textContent = props.text + ' ✦' })" } })

export default function WidgetsStudio({ sandboxUrl, author, onInsert, onClose }: { sandboxUrl?: string; author: string; onInsert: (pkg: WidgetPackage, values: Values) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'official' | 'mine' | 'create'>('official')
  const [mine, setMine] = useState<WidgetPackage[]>(loadMine)
  const [picked, setPicked] = useState<WidgetPackage>(OFFICIAL_WIDGETS[0])
  const [values, setValues] = useState<Values>(() => widgetValues(OFFICIAL_WIDGETS[0], {}))
  const [draft, setDraft] = useState<WidgetPackage>(blankPackage)
  const [coding, setCoding] = useState(false)
  const [note, setNote] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const pick = (pkg: WidgetPackage) => { setPicked(pkg); setValues(widgetValues(pkg, {})) }
  const list = tab === 'official' ? OFFICIAL_WIDGETS : mine
  const categories = useMemo(() => [...new Set(list.map(w => w.category))], [list])
  const draftValues = useMemo(() => widgetValues(draft, {}), [draft])

  function storeMine(next: WidgetPackage[]) { setMine(next); saveMine(next) }
  function saveDraft() {
    const pkg = normalizeWidgetPackage({ ...draft, author: draft.author || author })
    if (!pkg) return
    storeMine([...mine.filter(w => w.id !== pkg.id), pkg]); setNote(`Saved “${pkg.name}” to My Widgets.`); setTab('mine'); pick(pkg)
  }
  function remix(pkg: WidgetPackage) {
    if (!pkg.remix) { setNote('This widget’s creator doesn’t allow remixes.'); return }
    setDraft({ ...pkg, id: pkg.id + '-remix-' + Math.random().toString(36).slice(2, 6), name: pkg.name + ' (remix)', author, description: `${pkg.description} Remixed from ${pkg.name} by ${pkg.author || 'unknown'}.`, version: '1.0.0' })
    setTab('create')
  }
  function exportPkg(pkg: WidgetPackage) {
    const blob = new Blob([JSON.stringify({ format: 'elsewhere-widget', ...pkg }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = pkg.id + '.ewidget'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  async function importFile(file?: File) {
    if (!file) return
    try {
      const raw = JSON.parse(await file.text()) as { format?: string }
      const pkg = raw.format === 'elsewhere-widget' ? normalizeWidgetPackage(raw) : null
      if (!pkg) throw new Error('bad')
      storeMine([...mine.filter(w => w.id !== pkg.id), pkg]); setTab('mine'); pick(pkg); setNote(`Imported “${pkg.name}”. It runs in the locked sandbox like every widget.`)
    } catch { setNote('That file isn’t an Elsewhere widget.') }
  }
  const setProp = (i: number, patch: Partial<WidgetProp>) => setDraft(d => ({ ...d, props: d.props.map((p, j) => j === i ? { ...p, ...patch } : p) }))

  return <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}>
    <section className="ws" role="dialog" aria-label="Widgets Studio">
      <header className="ce-head">
        <strong>🧩 Widgets Studio</strong>
        <nav className="ce-tabs" role="tablist">{([['official', 'Official'], ['mine', `My Widgets (${mine.length})`], ['create', 'Create']] as const).map(([k, l]) =>
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => { setTab(k); if (k !== 'create') { const first = (k === 'official' ? OFFICIAL_WIDGETS : mine)[0]; if (first) pick(first) } }}>{l}</button>)}</nav>
        <span className="ce-grow" />
        <button type="button" onClick={() => fileInput.current?.click()}>Import .ewidget</button>
        <input ref={fileInput} type="file" accept=".ewidget,application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
        <button type="button" onClick={onClose}>Close</button>
      </header>
      {note && <p className="ws-note" role="status">{note}</p>}
      {tab !== 'create' ? <div className="ws-body">
        <div className="ws-list">
          {!list.length && <p className="dz-tip">No widgets here yet. Make one in Create, remix an official one, or import a .ewidget file.</p>}
          {categories.map(c => <div key={c}><h3>{c}</h3>{list.filter(w => w.category === c).map(w =>
            <button key={w.id} type="button" className={'ws-card' + (picked.id === w.id ? ' is-on' : '')} onClick={() => pick(w)}><strong>{w.name}</strong><small>{w.description}</small></button>)}</div>)}
        </div>
        {list.some(w => w.id === picked.id) && <div className="ws-detail">
          <h2>{picked.name} <small>v{picked.version}{picked.author ? ` · by ${picked.author}` : ''}</small></h2>
          <Preview pkg={picked} values={values} sandboxUrl={sandboxUrl} />
          <WidgetPropsForm pkg={picked} values={values} onChange={setValues} />
          <div className="dz-row">
            <button type="button" className="is-primary" onClick={() => { onInsert(picked, values); onClose() }}>Insert into profile</button>
            {picked.remix && <button type="button" onClick={() => remix(picked)}>Remix</button>}
            <button type="button" onClick={() => exportPkg(picked)}>Export</button>
            {tab === 'mine' && <button type="button" onClick={() => { if (window.confirm(`Remove “${picked.name}” from My Widgets?`)) storeMine(mine.filter(w => w.id !== picked.id)) }}>Remove</button>}
          </div>
        </div>}
      </div> : <div className="ws-body">
        <div className="ws-create">
          <label>Name<input value={draft.name} maxLength={40} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>Category<input value={draft.category} maxLength={24} onChange={e => setDraft({ ...draft, category: e.target.value })} /></label>
          <label>Description<input value={draft.description} maxLength={200} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className="dz-check"><input type="checkbox" checked={draft.remix} onChange={e => setDraft({ ...draft, remix: e.target.checked })} /> Others may remix it (with credit)</label>
          <h3>Settings people can change</h3>
          <p className="dz-tip">Use <code>{'{{key}}'}</code> in HTML/CSS and <code>props.key</code> in JavaScript.</p>
          {draft.props.map((p, i) => <div key={i} className="ws-prop">
            <input aria-label="key" value={p.key} maxLength={24} onChange={e => setProp(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '') })} />
            <input aria-label="label" value={p.label} maxLength={40} onChange={e => setProp(i, { label: e.target.value })} />
            <select aria-label="type" value={p.type} onChange={e => setProp(i, { type: e.target.value as WidgetProp['type'], default: e.target.value === 'number' ? 0 : e.target.value === 'boolean' ? false : e.target.value === 'color' ? '#ff5fa2' : '' })}>{PROP_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <input aria-label="default" value={String(p.default)} onChange={e => setProp(i, { default: p.type === 'number' ? Number(e.target.value) : p.type === 'boolean' ? e.target.value === 'true' : e.target.value })} />
            {p.type === 'select' && <input aria-label="options" placeholder="a|b|c" value={(p.options || []).join('|')} onChange={e => setProp(i, { options: e.target.value.split('|') })} />}
            <button type="button" aria-label="Remove setting" onClick={() => setDraft(d => ({ ...d, props: d.props.filter((_, j) => j !== i) }))}>✕</button>
          </div>)}
          <button type="button" onClick={() => setDraft(d => ({ ...d, props: [...d.props, { key: 'setting' + (d.props.length + 1), label: 'New setting', type: 'text', default: '' }] }))}>+ Add setting</button>
          <div className="dz-row"><button type="button" onClick={() => setCoding(true)}>{'</>'} Edit HTML, CSS & JavaScript…</button><button type="button" onClick={() => setDraft(blankPackage())}>Start over</button></div>
          <div className="dz-row"><button type="button" className="is-primary" onClick={saveDraft}>Save to My Widgets</button></div>
        </div>
        <div className="ws-detail"><h2>Preview</h2><Preview pkg={draft} values={draftValues} sandboxUrl={sandboxUrl} /><p className="dz-tip">Widgets run in the same locked sandbox as code blocks: no sign-ins, messages, internet or private data.</p></div>
        {coding && <CodeEditor code={draft.code} sandboxUrl={sandboxUrl} onChange={code => setDraft(d => ({ ...d, code }))} onClose={() => setCoding(false)} />}
      </div>}
    </section>
  </div>
}
