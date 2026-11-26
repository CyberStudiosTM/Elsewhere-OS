import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEPARTMENTS, LICENSES, REPORT_CATEGORIES, SHOWCASE_CATEGORIES, actOnReport, amModerator, commentShowcase, countDownload, deleteShowcase, getCreator, getResource, getShowcase,
  listReports, listResources, listShowcase, myCollection, myReports, postShowcase, removeComment, report, restoreItem, saveResource, setFavorite, setHeart, updateShowcase, withdrawResource,
  type Department, type Report, type Resource, type ResourceCard, type ShowcaseCard, type ShowcaseCategory, type ShowcasePost,
} from '../services/exchange'
import { blankDoc, codeFrame, compileWidget, normalizeDesign, normalizeWidgetPackage, renderProfile, widgetValues, type ProfileData, type ProfileDoc } from './profileRender'

// Elsewhere Creative Exchange: free-first sharing of layouts, widgets, skins, decorations, styles and code, plus the
// Community Showcase for finished work, creator pages, reporting and moderation. Nothing installs or goes live
// without a deliberate click, and previews never touch your real account or profile.

type Tab = 'explore' | 'showcase' | 'collection' | 'desk' | 'moderation'
const WIDGETS_KEY = 'elsewhere.widgets.mine.v1', ASSETS_KEY = 'elsewhere.assets.mine.v1'
const sample: ProfileData = { status: 'ok', access: 'visitor', handle: 'preview', display_name: 'Preview Person', published: true, guestbook_mode: 'everyone', signed_in: false,
  top_friends: [{ handle: 'sunny_day', display_name: 'sunny' }, { handle: 'poolside', display_name: 'poolside.exe' }],
  guestbook: [{ id: 'g', body: 'love this page!!', created_at: '2026-11-20T10:00:00Z', handle: 'sunny_day', display_name: 'sunny', mine: false }], bulletins: [{ id: 'b', body: 'new layout ♡', created_at: '2026-11-22T10:00:00Z' }] }
const readFile = (file: File) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(new Error('read')); r.readAsDataURL(file) })
const readText = (file: File) => file.text()
const pushLocal = (key: string, item: unknown) => { try { const list = JSON.parse(localStorage.getItem(key) || '[]'); list.push(item); localStorage.setItem(key, JSON.stringify(list)) } catch { throw new Error('This PC’s library is full.') } }
const download = (name: string, data: unknown) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
const ago = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Isolated preview: layouts render with made-up data; widgets/code only run after "Run demo". */
function ResourcePreview({ r }: { r: Resource }) {
  const ref = useRef<HTMLDivElement>(null)
  const [run, setRun] = useState(false)
  useEffect(() => {
    const host = ref.current; if (!host) return
    host.replaceChildren()
    const pkg = r.package as Record<string, unknown>
    if (r.kind === 'layout' || r.kind === 'style') {
      const doc: ProfileDoc = { ...blankDoc('original'), theme: { ...blankDoc('original').theme, ...(pkg.theme as object || {}) }, design: normalizeDesign(r.kind === 'layout' ? pkg.design : null), assets: (pkg.assets as ProfileDoc['assets']) || [] }
      renderProfile(host, { ...sample, doc }, { profileHref: () => '#', quiet: true })
    } else if (run && r.kind === 'widget') { const w = normalizeWidgetPackage(pkg); if (w) host.append(codeFrame(compileWidget({ pkg: w, values: widgetValues(w, {}) }), '')) }
    else if (run && r.kind === 'code') host.append(codeFrame({ html: String(pkg.html || ''), css: String(pkg.css || ''), js: String(pkg.js || '') }, ''))
  }, [r, run])
  return <div className="ex-preview-wrap">
    {(r.kind === 'widget' || r.kind === 'code') && !run && <button type="button" onClick={() => setRun(true)}>▶ Run demo (in the locked sandbox)</button>}
    {(r.kind === 'decoration' || r.kind === 'skin') && r.preview && <img className="ex-preview-img" src={r.preview} alt="" />}
    <div ref={ref} className={'ex-preview ex-preview-' + r.kind} />
  </div>
}

function ReportDialog({ target, onDone }: { target: { kind: 'resource' | 'showcase' | 'comment' | 'profile'; id: string; label: string }; onDone: (msg: string) => void }) {
  const [category, setCategory] = useState<keyof typeof REPORT_CATEGORIES>('spam')
  const [details, setDetails] = useState('')
  return <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}><section className="dz-gen" role="dialog" aria-label="Report">
    <h2>⚑ Report {target.label}</h2>
    <label>What’s wrong?<select value={category} onChange={e => setCategory(e.target.value as keyof typeof REPORT_CATEGORIES)}>{Object.entries(REPORT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Details (links or proof help with stolen work)<textarea rows={4} maxLength={2000} value={details} onChange={e => setDetails(e.target.value)} /></label>
    <p className="dz-tip">Reports are private. The person you report isn’t told who reported them. Bugs belong in feedback to the creator, not here.</p>
    <div className="dz-row"><button type="button" onClick={() => onDone('')}>Cancel</button>
      <button type="button" className="is-primary" onClick={() => report(target.kind, target.id, category, details).then(() => onDone('Thanks. Your report was sent and you can follow it in Creator Desk → My reports.'), e => onDone(e instanceof Error ? e.message : String(e)))}>Send report</button></div>
  </section></div>
}

export default function ExchangeApp({ me, draft, onApply, onOpenProfile, onNotice, onError }: {
  me: string; draft: ProfileDoc
  onApply: (kind: 'layout' | 'style' | 'code', pkg: Record<string, unknown>) => void
  onOpenProfile: (handle: string) => void; onNotice: (m: string) => void; onError: (m: string) => void
}) {
  const [tab, setTab] = useState<Tab>('explore')
  const [dept, setDept] = useState<Department | ''>('')
  const [query, setQuery] = useState(''); const [tag, setTag] = useState(''); const [sort, setSort] = useState('newest')
  const [cards, setCards] = useState<ResourceCard[] | null>(null)
  const [posts, setPosts] = useState<ShowcaseCard[] | null>(null)
  const [cat, setCat] = useState<ShowcaseCategory | ''>(''); const [postSort, setPostSort] = useState('newest')
  const [collection, setCollection] = useState<{ favorites: ResourceCard[]; mine: ResourceCard[]; showcase: ShowcaseCard[] } | null>(null)
  const [open, setOpen] = useState<Resource | null>(null)
  const [post, setPost] = useState<ShowcasePost | null>(null)
  const [creator, setCreator] = useState<{ handle: string; display_name: string; resources: ResourceCard[]; showcase: ShowcaseCard[] } | null>(null)
  const [reporting, setReporting] = useState<{ kind: 'resource' | 'showcase' | 'comment' | 'profile'; id: string; label: string } | null>(null)
  const [mod, setMod] = useState(false)
  const [reports, setReports] = useState<Report[] | null>(null)
  const [mine, setMineReports] = useState<Report[] | null>(null)
  const [comment, setComment] = useState('')
  const fail = useCallback((e: unknown) => onError(e instanceof Error ? e.message : String(e)), [onError])

  useEffect(() => { amModerator().then(setMod, () => setMod(false)) }, [])
  useEffect(() => { if (tab === 'explore') listResources(dept || undefined, query, tag, sort).then(setCards, fail) }, [tab, dept, sort, fail]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'showcase') listShowcase(cat || undefined, '', postSort).then(setPosts, fail) }, [tab, cat, postSort, fail])
  useEffect(() => { if (tab === 'collection' || tab === 'desk') { myCollection().then(setCollection, fail); myReports().then(setMineReports, () => {}) } }, [tab, fail])
  useEffect(() => { if (tab === 'moderation') listReports(true).then(setReports, fail) }, [tab, fail])

  const openResource = (id: string) => getResource(id).then(r => r.missing ? onError('That resource isn’t available.') : setOpen(r), fail)
  const openPost = (id: string) => getShowcase(id).then(p => p.missing ? onError('That post isn’t available.') : setPost(p), fail)
  const openCreator = (handle: string) => getCreator(handle).then(c => c.status === 'ok' ? setCreator(c) : onError('That creator isn’t available.'), fail)

  async function install(r: Resource) {
    const pkg = r.package as Record<string, unknown>
    try {
      if (r.kind === 'layout' || r.kind === 'style' || r.kind === 'code') { if (r.kind === 'layout' && !window.confirm('Apply this layout to your DRAFT? Your live profile won’t change until you publish, and Undo or version history can bring your old look back.')) return; onApply(r.kind, pkg) }
      else if (r.kind === 'widget') { const w = normalizeWidgetPackage({ ...pkg, author: pkg.author || '@' + r.creator.handle }); if (!w) throw new Error('That widget package is damaged.'); pushLocal(WIDGETS_KEY, w); onNotice(`Added “${r.title}” to My Widgets. Insert it from 🧩 Widgets in the Visual Designer.`) }
      else if (r.kind === 'decoration') { pushLocal(ASSETS_KEY, { id: Math.random().toString(36).slice(2, 12), name: r.title, src: pkg.src, w: pkg.w, h: pkg.h, folder: 'Exchange', tags: r.tags, fav: false, origin: 'by @' + r.creator.handle }); onNotice(`Added “${r.title}” to My Library. Find it in 🖼 Assets.`) }
      else if (r.kind === 'skin') { download(r.title.replace(/[^a-z0-9]+/gi, '-') + '.eskin', pkg); onNotice('Downloaded the .eskin file. Open it from Tools → Skins.') }
      void countDownload(r.id).catch(() => {})
    } catch (e) { fail(e) }
  }

  // ---------- Creator Desk: publish ----------
  const [form, setForm] = useState({ kind: 'layout' as Department, title: '', description: '', tags: '', license: 'remix', remix: true, visibility: 'public', version: '1.0.0', changelog: '', preview: '', parent: '', widget: '', html: '', css: '', js: '', file: null as unknown, image: '' })
  const myWidgets: { id: string; name: string }[] = (() => { try { return JSON.parse(localStorage.getItem(WIDGETS_KEY) || '[]') } catch { return [] } })()
  async function publish() {
    let pkg: unknown
    if (form.kind === 'layout') pkg = { format: 'elsewhere-layout', theme: draft.theme, design: draft.design, assets: draft.assets }
    else if (form.kind === 'style') pkg = { format: 'elsewhere-style', theme: draft.theme }
    else if (form.kind === 'widget') { const w = (JSON.parse(localStorage.getItem(WIDGETS_KEY) || '[]') as { id: string }[]).find(x => x.id === form.widget); if (!w) return onError('Pick one of your widgets.'); pkg = w }
    else if (form.kind === 'code') { if (!form.html && !form.js && !form.css) return onError('Add some code first.'); pkg = { format: 'elsewhere-code', html: form.html, css: form.css, js: form.js } }
    else if (form.kind === 'decoration') { if (!form.image) return onError('Pick a picture.'); const img = new Image(); img.src = form.image; await img.decode().catch(() => {}); pkg = { format: 'elsewhere-decoration', src: form.image, w: img.naturalWidth, h: img.naturalHeight } }
    else { if (!form.file) return onError('Pick a .eskin file.'); pkg = form.file }
    if (!form.title.trim()) return onError('Give it a title.')
    const size = JSON.stringify(pkg).length
    if (size > 600000) return onError('That’s too big to share (about 600 KB max). Use fewer or smaller pictures.')
    saveResource({ kind: form.kind, title: form.title, description: form.description, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean), license: form.license, remix: form.remix,
      visibility: form.visibility, version: form.version, changelog: form.changelog, package: pkg, preview: form.preview || (form.kind === 'decoration' ? form.image : ''), parent: form.parent || null })
      .then(() => { onNotice(form.visibility === 'public' ? 'Published to the Exchange ♡' : 'Saved.'); setForm(f => ({ ...f, title: '', description: '', changelog: '' })); myCollection().then(setCollection, fail) }, fail)
  }
  const [show, setShow] = useState({ category: 'studio' as ShowcaseCategory, title: '', description: '', tags: '', image: '', visibility: 'public', allow_comments: true })
  const sharePost = () => {
    if (!show.image || !show.title.trim()) return onError('Add a picture and a title.')
    postShowcase({ ...show, tags: show.tags.split(',').map(t => t.trim()).filter(Boolean) }).then(() => { onNotice('Shared to the Showcase ♡'); setShow(s => ({ ...s, title: '', description: '', image: '' })); myCollection().then(setCollection, fail) }, fail)
  }

  const card = (r: ResourceCard) => <button key={r.id} type="button" className="ex-card" onClick={() => void openResource(r.id)}>
    <span className="ex-thumb">{r.preview ? <img src={r.preview} alt="" /> : <span>{DEPARTMENTS[r.kind].icon}</span>}</span>
    <strong>{r.title}</strong>
    <small>{DEPARTMENTS[r.kind].label} · v{r.version} · @{r.creator.handle}</small>
    <span className="ex-labels">{r.official && <i>Official</i>}{r.has_code && <i>Contains custom code</i>}{r.remix && <i>Remixable</i>}{r.visibility !== 'public' && <i>{r.visibility}</i>}{r.status !== 'published' && <i className="ex-warn">{r.status}</i>}</span>
    <small>⬇ {r.downloads} · ♡ {r.favorites}</small>
  </button>
  const tile = (p: ShowcaseCard) => <button key={p.id} type="button" className="ex-tile" onClick={() => void openPost(p.id)}><img src={p.image} alt={p.title} loading="lazy" /><span>{p.title} <small>@{p.creator.handle} · ♥ {p.hearts}</small></span></button>

  return <div className="ex">
    <nav className="ex-tabs" role="tablist">{([['explore', '✦ Explore'], ['showcase', '🖼 Showcase'], ['collection', '♡ My Collection'], ['desk', '🛠 Creator Desk'], ...(mod ? [['moderation', '⚑ Moderation']] : [])] as [Tab, string][]).map(([k, l]) =>
      <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>

    {tab === 'explore' && <div className="ex-body">
      <div className="ex-depts"><button type="button" className={!dept ? 'is-on' : ''} onClick={() => setDept('')}>Everything</button>{(Object.keys(DEPARTMENTS) as Department[]).map(d => <button key={d} type="button" className={dept === d ? 'is-on' : ''} title={DEPARTMENTS[d].about} onClick={() => setDept(d)}>{DEPARTMENTS[d].icon} {DEPARTMENTS[d].label}</button>)}</div>
      <form className="ex-search" onSubmit={e => { e.preventDefault(); listResources(dept || undefined, query, tag, sort).then(setCards, fail) }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the Exchange" aria-label="Search" />
        <input value={tag} onChange={e => setTag(e.target.value)} placeholder="aesthetic tag (y2k, gothic web…)" aria-label="Tag" />
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="newest">Newest</option><option value="downloads">Most downloaded</option><option value="favorites">Most loved</option><option value="alpha">A–Z</option></select>
        <button type="submit">Search</button>
      </form>
      <div className="ex-grid">{cards === null ? <p className="dz-tip">Loading…</p> : !cards.length ? <p className="dz-tip">Nothing here yet. Be the first to share something in Creator Desk ♡</p> : cards.map(card)}</div>
    </div>}

    {tab === 'showcase' && <div className="ex-body">
      <div className="ex-depts"><button type="button" className={!cat ? 'is-on' : ''} onClick={() => setCat('')}>Everything</button>{(Object.keys(SHOWCASE_CATEGORIES) as ShowcaseCategory[]).map(c => <button key={c} type="button" className={cat === c ? 'is-on' : ''} onClick={() => setCat(c)}>{SHOWCASE_CATEGORIES[c]}</button>)}
        <select value={postSort} onChange={e => setPostSort(e.target.value)} aria-label="Sort"><option value="newest">Fresh creations</option><option value="hearts">Most loved</option><option value="random">Random</option></select></div>
      <div className="ex-gallery">{posts === null ? <p className="dz-tip">Loading…</p> : !posts.length ? <p className="dz-tip">No creations here yet. Share yours from Creator Desk ♡</p> : posts.map(tile)}</div>
    </div>}

    {tab === 'collection' && <div className="ex-body">
      <h3>♡ Favorites</h3><div className="ex-grid">{!collection?.favorites.length ? <p className="dz-tip">Favorite things in Explore to keep them here.</p> : collection.favorites.map(card)}</div>
    </div>}

    {tab === 'desk' && <div className="ex-body ex-desk">
      <section><h3>Share a resource</h3>
        <label>Type<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as Department })}>{(Object.keys(DEPARTMENTS) as Department[]).map(d => <option key={d} value={d}>{DEPARTMENTS[d].label}</option>)}</select></label>
        {form.kind === 'layout' && <p className="dz-tip">Shares your current DRAFT design, colors and project pictures. Your guestbook, friends, bulletins and account stay private: they only show as live pieces for whoever uses it.</p>}
        {form.kind === 'style' && <p className="dz-tip">Shares your draft’s colors, font and background pattern.</p>}
        {form.kind === 'widget' && <label>Widget<select value={form.widget} onChange={e => setForm({ ...form, widget: e.target.value })}><option value="">(pick from My Widgets)</option>{myWidgets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
        {form.kind === 'code' && <><label>HTML<textarea rows={3} value={form.html} onChange={e => setForm({ ...form, html: e.target.value })} /></label><label>CSS<textarea rows={3} value={form.css} onChange={e => setForm({ ...form, css: e.target.value })} /></label><label>JavaScript<textarea rows={3} value={form.js} onChange={e => setForm({ ...form, js: e.target.value })} /></label></>}
        {form.kind === 'decoration' && <label>Picture<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 400000) onError('Decorations can be up to 400 KB.'); else void readFile(f).then(image => setForm(x => ({ ...x, image }))) } }} /></label>}
        {form.kind === 'skin' && <label>.eskin file<input type="file" accept=".eskin,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) void readText(f).then(t => { try { setForm(x => ({ ...x, file: JSON.parse(t) })) } catch { onError('That isn’t a valid .eskin file.') } }) }} /></label>}
        <label>Title<input value={form.title} maxLength={80} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label>Description<textarea rows={3} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <label>Aesthetic tags<input value={form.tags} placeholder="frutiger aero, kawaii stationery" onChange={e => setForm({ ...form, tags: e.target.value })} /></label>
        {form.kind !== 'decoration' && <label>Preview picture (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f && f.size < 300000) void readFile(f).then(preview => setForm(x => ({ ...x, preview }))); else if (f) onError('Previews can be up to 300 KB.') }} /></label>}
        <div className="dz-row">
          <label>License<select value={form.license} onChange={e => setForm({ ...form, license: e.target.value })}>{Object.entries(LICENSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Who can find it<select value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}><option value="public">Public</option><option value="unlisted">Unlisted (link only)</option><option value="private">Private draft</option></select></label>
        </div>
        <div className="dz-row"><label>Version<input value={form.version} maxLength={16} onChange={e => setForm({ ...form, version: e.target.value })} /></label><label>What changed<input value={form.changelog} maxLength={1000} onChange={e => setForm({ ...form, changelog: e.target.value })} /></label></div>
        <label className="dz-check"><input type="checkbox" checked={form.remix} onChange={e => setForm({ ...form, remix: e.target.checked })} /> Let others remix it (they must credit you)</label>
        {form.parent && <p className="dz-tip">Remix of resource {form.parent.slice(0, 8)}… (credit is added automatically). <button type="button" className="dz-link" onClick={() => setForm({ ...form, parent: '' })}>clear</button></p>}
        <button type="button" className="is-primary" onClick={() => void publish()}>Share</button>
      </section>
      <section><h3>Share to the Showcase</h3>
        <p className="dz-tip">Show off something you made (art, dolls, skins, profile designs…). It’s only a picture: your project files stay yours.</p>
        <label>Category<select value={show.category} onChange={e => setShow({ ...show, category: e.target.value as ShowcaseCategory })}>{Object.entries(SHOWCASE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Picture<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 520000) onError('Showcase pictures can be up to 500 KB.'); else void readFile(f).then(image => setShow(x => ({ ...x, image }))) } }} /></label>
        {show.image && <img className="ex-preview-img" src={show.image} alt="" />}
        <label>Title<input value={show.title} maxLength={80} onChange={e => setShow({ ...show, title: e.target.value })} /></label>
        <label>About it (process notes, credits…)<textarea rows={3} maxLength={1000} value={show.description} onChange={e => setShow({ ...show, description: e.target.value })} /></label>
        <label>Tags<input value={show.tags} onChange={e => setShow({ ...show, tags: e.target.value })} /></label>
        <div className="dz-row"><label>Who can see it<select value={show.visibility} onChange={e => setShow({ ...show, visibility: e.target.value })}><option value="public">Everyone</option><option value="friends">Friends</option><option value="unlisted">Link only</option><option value="private">Only me</option></select></label>
          <label className="dz-check"><input type="checkbox" checked={show.allow_comments} onChange={e => setShow({ ...show, allow_comments: e.target.checked })} /> Allow comments</label></div>
        <button type="button" className="is-primary" onClick={sharePost}>Share</button>
      </section>
      <section><h3>My resources</h3>
        <div className="ex-grid">{!collection?.mine.length ? <p className="dz-tip">Nothing shared yet.</p> : collection.mine.map(card)}</div>
        <h3>My showcase</h3><div className="ex-gallery">{!collection?.showcase.length ? <p className="dz-tip">No posts yet.</p> : collection.showcase.map(tile)}</div>
        <h3>My reports</h3>{!mine?.length ? <p className="dz-tip">No reports.</p> : <ul className="ex-reports">{mine.map(r => <li key={r.id}>{REPORT_CATEGORIES[r.category]} · {r.target_kind} · <b>{r.status.replace('_', ' ')}</b>{r.resolution && ` · ${r.resolution}`} <small>{ago(r.created_at)}</small></li>)}</ul>}
      </section>
    </div>}

    {tab === 'moderation' && <div className="ex-body">
      <div className="dz-row"><button type="button" onClick={() => listReports(true).then(setReports, fail)}>Open cases</button><button type="button" onClick={() => listReports(false).then(setReports, fail)}>All cases</button></div>
      {!reports?.length ? <p className="dz-tip">No open reports ♡</p> : <ul className="ex-reports">{reports.map(r => <li key={r.id} className="ex-case">
        <b>{REPORT_CATEGORIES[r.category]}</b> · {r.target_kind} <code>{r.target_id.slice(0, 8)}</code> · by @{r.reporter} · {ago(r.created_at)} · <b>{r.status.replace('_', ' ')}</b>
        {r.details && <p>{r.details}</p>}
        <div className="dz-row">
          {r.target_kind === 'resource' && <button type="button" onClick={() => void openResource(r.target_id)}>Open</button>}
          {r.target_kind === 'showcase' && <button type="button" onClick={() => void openPost(r.target_id)}>Open</button>}
          {(['review', 'dismiss', 'restrict', 'remove'] as const).map(a => <button key={a} type="button" onClick={() => { const note = window.prompt(`Note for “${a}” (the reporter sees this)`, a === 'dismiss' ? 'No rule was broken.' : '') ?? null; if (note !== null) actOnReport(r.id, a, note).then(() => listReports(true).then(setReports, fail), fail) }}>{a}</button>)}
          <button type="button" onClick={() => restoreItem(r.target_kind, r.target_id).then(() => onNotice('Restored.'), fail)}>restore</button>
        </div>
      </li>)}</ul>}
    </div>}

    {open && <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}><section className="ex-detail" role="dialog" aria-label={open.title}>
      <header className="ce-head"><strong>{DEPARTMENTS[open.kind].icon} {open.title}</strong><span className="ce-grow" /><button type="button" onClick={() => setOpen(null)}>Close</button></header>
      <div className="ex-detail-body">
        <ResourcePreview r={open} />
        <div className="ex-info">
          <p>{open.description || 'No description.'}</p>
          <p><button type="button" className="dz-link" onClick={() => void openCreator(open.creator.handle)}>by {open.creator.display_name} @{open.creator.handle}</button> · v{open.version} · updated {ago(open.updated_at)}</p>
          {open.parent && <p className="dz-tip">Remix of <button type="button" className="dz-link" onClick={() => void openResource(open.parent!.id)}>{open.parent.title}</button> by @{open.parent.creator}</p>}
          <p className="ex-labels">{open.official && <i>Official Elsewhere resource</i>}<i>{open.official ? '' : 'Community resource'}</i>{open.has_code && <i>Contains custom code (runs in the locked sandbox)</i>}</p>
          <p><b>License:</b> {LICENSES[open.license]}{open.remix ? ' · remixing allowed with credit' : ''}</p>
          {open.changelog && <p><b>What’s new:</b> {open.changelog}</p>}
          <p>{open.tags.map(t => <span key={t} className="ex-tag">{t}</span>)}</p>
          <div className="dz-row">
            <button type="button" className="is-primary" onClick={() => void install(open)}>{{ layout: 'Apply to my draft', style: 'Use these colors', code: 'Add to my draft', widget: 'Add to My Widgets', decoration: 'Add to My Library', skin: 'Download .eskin' }[open.kind]}</button>
            <button type="button" onClick={() => setFavorite(open.id, !open.favorite).then(() => setOpen({ ...open, favorite: !open.favorite }), fail)}>{open.favorite ? '♥ Favorited' : '♡ Favorite'}</button>
            {(open.mine || open.license === 'share' || open.license === 'cc-by') && <button type="button" onClick={() => download(open.title.replace(/[^a-z0-9]+/gi, '-') + '.json', open.package)}>Download package</button>}
            {open.remix && !open.mine && <button type="button" onClick={() => { void install(open); setForm(f => ({ ...f, kind: open.kind, parent: open.id, title: open.title + ' (remix)', license: open.license })); setOpen(null); setTab('desk') }}>Remix</button>}
            {open.mine && <button type="button" onClick={() => { if (window.confirm('Withdraw this resource from the Exchange? People who installed it keep their copy.')) withdrawResource(open.id).then(() => { setOpen(null); myCollection().then(setCollection, fail) }, fail) }}>Withdraw</button>}
            {!open.mine && <button type="button" onClick={() => setReporting({ kind: 'resource', id: open.id, label: '“' + open.title + '”' })}>⚑ Report</button>}
          </div>
        </div>
      </div>
    </section></div>}

    {post && <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}><section className="ex-detail" role="dialog" aria-label={post.title}>
      <header className="ce-head"><strong>🖼 {post.title}</strong><span className="ce-grow" /><button type="button" onClick={() => setPost(null)}>Close</button></header>
      <div className="ex-detail-body">
        <div className="ex-post-img"><img src={post.image} alt={post.title} /></div>
        <div className="ex-info">
          <p><button type="button" className="dz-link" onClick={() => void openCreator(post.creator.handle)}>by {post.creator.display_name} @{post.creator.handle}</button> · {SHOWCASE_CATEGORIES[post.category]} · {ago(post.created_at)}</p>
          {post.description && <p>{post.description}</p>}
          <p>{post.tags.map(t => <span key={t} className="ex-tag">{t}</span>)}</p>
          <div className="dz-row">
            <button type="button" onClick={() => setHeart(post.id, !post.hearted).then(() => setPost({ ...post, hearted: !post.hearted, hearts: post.hearts + (post.hearted ? -1 : 1) }), fail)}>{post.hearted ? '♥' : '♡'} {post.hearts}</button>
            {post.resource && <button type="button" onClick={() => void openResource(post.resource!)}>See the resource</button>}
            {post.mine && <select aria-label="Who can see it" value={post.visibility} onChange={e => updateShowcase(post.id, e.target.value, post.allow_comments).then(() => setPost({ ...post, visibility: e.target.value as ShowcasePost['visibility'] }), fail)}><option value="public">Everyone</option><option value="friends">Friends</option><option value="unlisted">Link only</option><option value="private">Only me</option></select>}
            {post.mine && <button type="button" onClick={() => { if (window.confirm('Delete this post?')) deleteShowcase(post.id).then(() => setPost(null), fail) }}>Delete</button>}
            {!post.mine && <button type="button" onClick={() => setReporting({ kind: 'showcase', id: post.id, label: 'this post' })}>⚑ Report</button>}
          </div>
          <p className="dz-tip">Pictures shared publicly can be screenshotted. Credit the artist if you’re inspired ♡</p>
          {post.allow_comments ? <>
            <h3>Comments</h3>
            <ul className="ex-comments">{post.comments.map(c => <li key={c.id}><b>@{c.handle}</b> {c.body} {(c.mine || post.mine) && <button type="button" className="dz-link" onClick={() => removeComment(c.id).then(() => openPost(post.id), fail)}>remove</button>} {!c.mine && <button type="button" className="dz-link" onClick={() => setReporting({ kind: 'comment', id: c.id, label: 'this comment' })}>report</button>}</li>)}</ul>
            <form onSubmit={e => { e.preventDefault(); if (comment.trim()) commentShowcase(post.id, comment).then(() => { setComment(''); void openPost(post.id) }, fail) }} className="dz-row"><input value={comment} maxLength={500} onChange={e => setComment(e.target.value)} placeholder="Say something nice ♡" aria-label="Comment" /><button type="submit">Post</button></form>
          </> : <p className="dz-tip">Comments are off for this post.</p>}
        </div>
      </div>
    </section></div>}

    {creator && <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}><section className="ex-detail" role="dialog" aria-label={'Creator ' + creator.handle}>
      <header className="ce-head"><strong>✦ {creator.display_name} @{creator.handle}</strong><span className="ce-grow" /><button type="button" onClick={() => onOpenProfile(creator.handle)}>Profile</button><button type="button" onClick={() => setCreator(null)}>Close</button></header>
      <div className="ex-body"><h3>Resources</h3><div className="ex-grid">{!creator.resources.length ? <p className="dz-tip">No public resources yet.</p> : creator.resources.map(r => <span key={r.id} onClickCapture={() => setCreator(null)}>{card(r)}</span>)}</div>
        <h3>Showcase</h3><div className="ex-gallery">{!creator.showcase.length ? <p className="dz-tip">No showcase posts yet.</p> : creator.showcase.map(p => <span key={p.id} onClickCapture={() => setCreator(null)}>{tile(p)}</span>)}</div>
        {creator.handle !== me && <button type="button" className="dz-link" onClick={() => setReporting({ kind: 'profile', id: creator.handle, label: '@' + creator.handle })}>⚑ Report this creator</button>}</div>
    </section></div>}

    {reporting && <ReportDialog target={reporting} onDone={msg => { setReporting(null); if (msg) onNotice(msg) }} />}
  </div>
}
