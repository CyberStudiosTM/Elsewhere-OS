import { useCallback, useEffect, useState } from 'react'
import {
  createWebring, getHome, joinWebring, leaveWebring, manageWebring, myWebrings, randomProfile, searchProfiles, setDiscovery, setProfileSaved,
  type HomeData, type Webring,
} from '../services/profiles'

// Elsewhere Home: your private landing hub. Friends' bulletins in time order (with a natural end), your new
// guestbook entries, saved profiles, your stats, discovery and webrings. Rearrange or hide any module.

const LAYOUT = 'elsewhere.home.layout.v1'
const MODULES = { feed: 'Friends’ bulletins', guestbook: 'New in my guestbook', saved: 'Saved profiles', stats: 'My profile', discover: 'Discover', webrings: 'Webrings' } as const
type Module = keyof typeof MODULES
const DEFAULT: { order: Module[]; hidden: Module[] } = { order: ['stats', 'feed', 'guestbook', 'saved', 'discover', 'webrings'], hidden: [] }
const loadLayout = () => { try { const v = JSON.parse(localStorage.getItem(LAYOUT) || 'null'); if (v && Array.isArray(v.order)) { const order = [...v.order.filter((m: string) => m in MODULES), ...DEFAULT.order.filter(m => !v.order.includes(m))] as Module[]; return { order, hidden: (v.hidden || []).filter((m: string) => m in MODULES) as Module[] } } } catch { /* default */ } return DEFAULT }
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function HomeApp({ onOpen, onError }: { onOpen: (handle: string) => void; onError: (message: string) => void }) {
  const [home, setHome] = useState<HomeData | null>(null)
  const [older, setOlder] = useState<HomeData['bulletins']>([])
  const [more, setMore] = useState(false)
  const [layout, setLayout] = useState(loadLayout)
  const [customizing, setCustomizing] = useState(false)
  const [query, setQuery] = useState(''); const [tag, setTag] = useState('')
  const [results, setResults] = useState<{ handle: string; display_name: string; tags: string[] }[] | null>(null)
  const [rings, setRings] = useState<Webring[] | null>(null)
  const [tagsText, setTagsText] = useState('')
  const fail = useCallback((cause: unknown) => onError(cause instanceof Error ? (/switched on|does not exist|Could not find/i.test(cause.message) ? 'Home isn’t switched on yet (run supabase/14_profile_home.sql).' : cause.message) : String(cause)), [onError])

  const load = useCallback(() => {
    getHome().then(h => { setHome(h); setOlder([]); setMore(h.more); setTagsText(h.tags.join(', ')) }, fail)
    myWebrings().then(setRings, () => setRings([]))
  }, [fail])
  useEffect(() => { load() }, [load])
  const saveLayout = (next: typeof layout) => { setLayout(next); try { localStorage.setItem(LAYOUT, JSON.stringify(next)) } catch { /* ignore */ } }
  const move = (m: Module, step: -1 | 1) => { const order = [...layout.order]; const i = order.indexOf(m), j = i + step; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; saveLayout({ ...layout, order }) }
  const feed = home ? [...home.bulletins, ...older] : []
  const loadOlder = () => { const last = feed[feed.length - 1]; if (last) getHome(last.created_at).then(h => { setOlder(o => [...o, ...h.bulletins]); setMore(h.more) }, fail) }
  const person = (p: { handle: string; display_name: string }) => <button type="button" className="hm-person" onClick={() => onOpen(p.handle)}>{p.display_name} <small>@{p.handle}</small></button>

  const body: Record<Module, () => React.ReactNode> = {
    stats: () => <div className="hm-stats">
      <div><b>{home?.views ?? '…'}</b><span>profile visits</span></div>
      <div><b>{home?.requests ?? '…'}</b><span>friend requests waiting</span></div>
      <div><b>{home?.saved.length ?? '…'}</b><span>saved profiles</span></div>
      <button type="button" onClick={() => onOpen('me')}>View my profile</button>
    </div>,
    feed: () => <>
      {!feed.length && <p className="hm-empty">No bulletins from friends yet.</p>}
      <ol className="hm-feed">{feed.map(b => <li key={b.id}>{person(b)}<time>{when(b.created_at)}</time><p>{b.body}</p></li>)}</ol>
      {more ? <button type="button" onClick={loadOlder}>Show older</button> : feed.length > 0 && <p className="hm-end">You’re all caught up ✦</p>}
    </>,
    guestbook: () => <>{!home?.guestbook.length ? <p className="hm-empty">No guestbook entries yet.</p> : <ol className="hm-feed">{home.guestbook.map(g => <li key={g.id}>{person(g)}<time>{when(g.created_at)}</time><p>{g.body}</p></li>)}</ol>}</>,
    saved: () => <>{!home?.saved.length ? <p className="hm-empty">Save profiles you love with ☆ Save on their page.</p> : <ul className="hm-list">{home.saved.map(s => <li key={s.handle}>{person(s)}<button type="button" className="hm-x" aria-label={`Unsave @${s.handle}`} onClick={() => setProfileSaved(s.handle, false).then(load, fail)}>✕</button></li>)}</ul>}</>,
    discover: () => <div className="hm-discover">
      <form onSubmit={e => { e.preventDefault(); searchProfiles(query, tag).then(setResults, fail) }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search @handles or names" aria-label="Search profiles" />
        <input value={tag} onChange={e => setTag(e.target.value)} placeholder="tag (e.g. y2k)" aria-label="Tag" />
        <button type="submit">Search</button>
        <button type="button" onClick={() => randomProfile().then(h => h ? onOpen(h) : onError('No profiles in the directory yet.'), fail)}>🎲 Random profile</button>
      </form>
      {results && (!results.length ? <p className="hm-empty">No matching profiles in the directory.</p> : <ul className="hm-list">{results.map(r => <li key={r.handle}>{person(r)}<small>{r.tags.join(' · ')}</small></li>)}</ul>)}
      <fieldset><legend>Be discoverable</legend>
        <label className="dz-check"><input type="checkbox" checked={!!home?.discoverable} onChange={e => setDiscovery(e.target.checked, tagsText.split(',').map(t => t.trim()).filter(Boolean)).then(load, fail)} /> List my profile in the directory (only if it’s public and published)</label>
        <label>My tags<input value={tagsText} onChange={e => setTagsText(e.target.value)} onBlur={() => home && setDiscovery(home.discoverable, tagsText.split(',').map(t => t.trim()).filter(Boolean)).then(load, fail)} placeholder="y2k, frutiger aero, music" /></label>
      </fieldset>
    </div>,
    webrings: () => <div className="hm-rings">
      {rings === null ? <p className="hm-empty">Loading…</p> : !rings.length && <p className="hm-empty">You’re not in any webrings yet.</p>}
      {rings?.map(r => <div key={r.id} className="hm-ring">
        <strong>{r.name}</strong> <small>{r.members} member{r.members === 1 ? '' : 's'}{r.status === 'pending' ? ' · waiting for approval' : ''}{r.mine ? ' · yours' : ''}</small>
        {r.about && <p>{r.about}</p>}
        <div className="hm-row"><button type="button" onClick={() => void navigator.clipboard?.writeText(r.id)}>Copy ring ID</button>{!r.mine && <button type="button" onClick={() => leaveWebring(r.id).then(load, fail)}>Leave</button>}</div>
        {r.mine && r.pending.map(h => <div key={h} className="hm-row">@{h} wants to join <button type="button" onClick={() => manageWebring(r.id, h, true).then(load, fail)}>Approve</button><button type="button" onClick={() => manageWebring(r.id, h, false).then(load, fail)}>Decline</button></div>)}
      </div>)}
      <div className="hm-row">
        <button type="button" onClick={() => { const name = window.prompt('Webring name', 'the glitter ring')?.trim(); if (name) createWebring(name, window.prompt('What’s it about? (optional)') || '').then(load, fail) }}>+ Start a webring</button>
        <button type="button" onClick={() => { const id = window.prompt('Paste the ring ID you were given')?.trim(); if (id) joinWebring(id).then(s => { onError(s === 'member' ? 'Joined!' : 'Request sent. The ring’s owner will approve it.'); load() }, fail) }}>Join with an ID</button>
      </div>
      <p className="hm-empty">Add the Webring piece to your profile in the Visual Designer to show ◀ previous · random · next ▶.</p>
    </div>,
  }

  return <div className="hm">
    <header className="hm-head"><h1>🏠 Elsewhere Home</h1><span className="hm-grow" /><button type="button" onClick={load}>↻ Refresh</button><button type="button" onClick={() => setCustomizing(c => !c)}>{customizing ? 'Done' : '✎ Customize'}</button></header>
    {customizing && layout.hidden.length > 0 && <p className="hm-hidden">Hidden: {layout.hidden.map(m => <button key={m} type="button" onClick={() => saveLayout({ ...layout, hidden: layout.hidden.filter(x => x !== m) })}>+ {MODULES[m]}</button>)}</p>}
    <div className="hm-grid">{layout.order.filter(m => !layout.hidden.includes(m)).map(m => <section key={m} className={'hm-card hm-' + m} aria-label={MODULES[m]}>
      <h2>{MODULES[m]}{customizing && <span className="hm-tools"><button type="button" aria-label="Move up" onClick={() => move(m, -1)}>▲</button><button type="button" aria-label="Move down" onClick={() => move(m, 1)}>▼</button><button type="button" aria-label="Hide" onClick={() => saveLayout({ ...layout, hidden: [...layout.hidden, m] })}>✕</button></span>}</h2>
      {body[m]()}
    </section>)}</div>
  </div>
}
