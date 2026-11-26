import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { FONTS, INTEREST_LABELS, LAYOUT_DEFAULTS, PATTERNS, blankDoc, normalizeDoc, renderProfile, type ProfileData, type ProfileDoc } from './profileRender'
import { deleteBulletin, getMyProfile, getProfile, getProfileVersion, listProfileVersions, type ProfileVersion, postBulletin, profileWebUrl, removeGuestbookEntry, saveProfile, signGuestbook, unpublishProfile, type MyProfile } from '../services/profiles'
import { toolbarAction } from '../services/toolbarActions'
import { ELSEWHERE_BUDDY_PREFIX } from '../services/connectedClient'
import Designer from './Designer'
import './profileRender.css'
import './ProfileApp.css'

// Elsewhere Profiles window: view anyone's profile (what the server lets you see) and, for your own,
// Quick Customize with a live preview. Drafts never go live until you press Publish.

const RECOVERY = 'elsewhere.profile.draft.v1'
const params = () => new URLSearchParams(window.location.search)

/** Shrinks a picked image to a small data: URL (profiles store small pictures inline in v1). */
function shrinkImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { reject(new Error('Pick a PNG, JPEG, GIF or WebP picture.')); return }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width, maxH / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale))
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      let out = canvas.toDataURL('image/webp', 0.86)
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', 0.86)
      if (out.length > 400000) out = canvas.toDataURL('image/jpeg', 0.7)
      resolve(out)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture couldn’t be opened.')) }
    img.src = url
  })
}

function Preview({ data, onOpen, buttons, onChanged }: { data: ProfileData; onOpen: (handle: string) => void; buttons: { label: string; onClick: () => void; primary?: boolean }[]; onChanged: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    renderProfile(ref.current, data, {
      profileHref: handle => '?profile=' + encodeURIComponent(handle),
      onOpenProfile: onOpen,
      railButtons: buttons,
      onSign: async body => { await signGuestbook(data.handle!, body); onChanged() },
      onRemoveEntry: async id => { await removeGuestbookEntry(id); onChanged() },
      onPostBulletin: async body => { await postBulletin(body); onChanged() },
      onDeleteBulletin: async id => { if (window.confirm('Delete this bulletin?')) { await deleteBulletin(id); onChanged() } },
    })
  }, [data, onOpen, buttons, onChanged])
  return <div ref={ref} className="pa-preview" />
}

export default function ProfileApp() {
  const [handle, setHandle] = useState(() => params().get('profile') || 'me')
  const [editing, setEditing] = useState(() => params().get('edit') === '1')
  const [data, setData] = useState<ProfileData | null>(null)
  const [mine, setMine] = useState<MyProfile | null>(null)
  const [doc, setDoc] = useState<ProfileDoc>(() => blankDoc())
  const [visibility, setVisibility] = useState<MyProfile['visibility']>('public')
  const [guestbook, setGuestbook] = useState<MyProfile['guestbook']>('friends')
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [viewAs, setViewAs] = useState<'me' | 'friend' | 'public'>('me')
  const [versions, setVersions] = useState<ProfileVersion[] | string | null>(null)
  const [mode, setMode] = useState<'quick' | 'designer'>(() => params().get('mode') === 'designer' ? 'designer' : 'quick')

  const load = useCallback(async () => {
    setError('')
    try {
      const me = await getMyProfile().catch(() => null)
      setMine(me)
      const target = handle === 'me' ? me?.handle : handle
      if (!target) { setError('Sign in to Elsewhere to see profiles.'); return }
      setData(await getProfile(target))
      if (me && target === me.handle) {
        let draft = me.draft
        try { const saved = JSON.parse(localStorage.getItem(RECOVERY) || 'null'); if (saved?.handle === me.handle && saved.doc) { draft = saved.doc; setDirty(true); setNotice('Restored your unsaved changes.') } } catch { /* none */ }
        const empty = !draft || !Object.keys(draft).length
        setDoc(empty ? blankDoc() : normalizeDoc(draft))
        setVisibility(me.visibility); setGuestbook(me.guestbook)
        if (empty && editing) setChoosing(true)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [handle, editing])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(t) }, [notice])
  // Keep unsaved edits safe if the window closes.
  useEffect(() => {
    if (!dirty || !mine) return
    const t = window.setTimeout(() => { try { localStorage.setItem(RECOVERY, JSON.stringify({ handle: mine.handle, doc })) } catch { /* full */ } }, 500)
    return () => window.clearTimeout(t)
  }, [doc, dirty, mine])

  const isMine = Boolean(mine && data?.handle === mine.handle)
  const change = (next: Partial<ProfileDoc>) => { setDoc(d => ({ ...d, ...next })); setDirty(true) }
  const theme = (next: Partial<ProfileDoc['theme']>) => { setDoc(d => ({ ...d, theme: { ...d.theme, ...next } })); setDirty(true) }

  // While editing, preview the draft exactly as visitors will see it once published.
  const previewData = useMemo<ProfileData | null>(() => {
    if (data && isMine && !editing && viewAs !== 'me') {
      // Preview as someone else: what a friend or the public would get (the server enforces the real thing).
      const blocked = visibility === 'private' || (viewAs === 'public' && visibility === 'friends')
      if (!data.published) return { status: 'locked', handle: data.handle, display_name: data.display_name, card: { message: 'Not published yet: visitors see “Profile not found” until you publish.' }, signed_in: true }
      if (blocked) return { status: 'locked', handle: data.handle, display_name: data.display_name, card: { message: doc.privateCard.message }, signed_in: viewAs === 'friend' }
      return { ...data, access: viewAs === 'friend' ? 'friend' : 'visitor', published: true, signed_in: viewAs === 'friend',
        can_sign: viewAs === 'friend' && guestbook !== 'off', guestbook: (data.guestbook || []).map(entry => ({ ...entry, mine: false })) }
    }
    if (!data || !editing || !isMine || !mine) return data
    const byId = new Map(mine.friends.map(f => [f.id, f]))
    return { ...data, doc, access: 'owner', published: data.published, guestbook_mode: guestbook,
      top_friends: doc.topFriends.map(id => byId.get(id)).filter((f): f is NonNullable<typeof f> => !!f) }
  }, [data, editing, isMine, mine, doc, guestbook, viewAs, visibility])

  async function save(publish: boolean) {
    setError('')
    try {
      await saveProfile(normalizeDoc(doc), visibility, guestbook, publish)
      setDirty(false); localStorage.removeItem(RECOVERY)
      setNotice(publish ? 'Published! Your profile is live ♡' : 'Draft saved. Publish when you’re ready.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  function close() {
    if (dirty && !window.confirm('You have unsaved profile changes. Close anyway? (They’ll be restored next time.)')) return
    if (isTauri()) void getCurrentWindow().close(); else window.close()
  }
  const open = useCallback((next: string) => { setEditing(false); setHandle(next); setData(null) }, [])

  const buttons = useMemo(() => {
    const list: { label: string; onClick: () => void; primary?: boolean }[] = []
    if (!data || data.status === 'missing') return list
    if (isMine) {
      if (!editing) list.push({ label: '✎ Edit profile', onClick: () => setEditing(true), primary: true })
      list.push({ label: '🔗 Copy link', onClick: () => { void navigator.clipboard?.writeText(profileWebUrl(data.handle!)).then(() => setNotice('Profile link copied.')) } })
      if (!editing) list.push({ label: viewAs === 'me' ? '👁 View as: me' : viewAs === 'friend' ? '👁 View as: a friend' : '👁 View as: the public',
        onClick: () => setViewAs(v => v === 'me' ? 'friend' : v === 'friend' ? 'public' : 'me') })
    } else {
      if (data.id && data.access === 'friend') list.push({ label: '💬 Message', primary: true, onClick: () => toolbarAction({ kind: 'open-contact', personId: ELSEWHERE_BUDDY_PREFIX + data.id }) })
      if (mine) list.push({ label: 'My profile', onClick: () => open(mine.handle) })
    }
    return list
  }, [data, isMine, editing, mine, open, viewAs])

  const pickTopFriend = (id: string, on: boolean) => change({ topFriends: on ? [...doc.topFriends, id].slice(0, 12) : doc.topFriends.filter(f => f !== id) })
  const moveTopFriend = (id: string, step: -1 | 1) => {
    const list = [...doc.topFriends]; const i = list.indexOf(id); const j = i + step
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]; change({ topFriends: list })
  }
  async function pickImage(kind: 'avatar' | 'banner', files: FileList | null) {
    const file = files?.[0]; if (!file) return
    try { change({ [kind]: await shrinkImage(file, kind === 'avatar' ? 360 : 1200, kind === 'avatar' ? 360 : 400) } as Partial<ProfileDoc>) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  return <div className="pa-app">
    <div className="pa-titlebar" data-tauri-drag-region>
      <span data-tauri-drag-region>🦋 {editing ? `Profile Workshop · ${mode === 'designer' ? 'Visual Designer' : 'Quick Customize'}` : 'Elsewhere Profile'}{dirty ? ' •' : ''}</span>
      {isTauri() && <>
        <button type="button" aria-label="Minimize" onClick={() => void getCurrentWindow().minimize()}>_</button>
        <button type="button" aria-label="Maximize" onClick={() => void getCurrentWindow().toggleMaximize()}>□</button>
      </>}
      <button type="button" className="pa-close" aria-label="Close" onClick={close}>×</button>
    </div>
    {(notice || error) && <p className={error ? 'pa-banner is-error' : 'pa-banner'} role={error ? 'alert' : 'status'}>{error || notice}</p>}
    {choosing && <div className="pa-backdrop"><section className="pa-dialog" role="dialog" aria-label="Choose your starting layout">
      <h2>Choose your starting layout ♡</h2>
      <p>Both have every feature, and you can restyle everything later.</p>
      <div className="pa-layouts">
        <button type="button" onClick={() => { setDoc(blankDoc('classic')); setDirty(true); setChoosing(false) }}>
          <span className="pa-layout-art pa-art-classic" aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>Classic Profile</strong><small>A two-column homepage inspired by 2005–2008 profile pages.</small></button>
        <button type="button" onClick={() => { setDoc(blankDoc('original')); setDirty(true); setChoosing(false) }}>
          <span className="pa-layout-art pa-art-original" aria-hidden="true"><i /><i /><i /></span>
          <strong>Elsewhere Original</strong><small>Glossy Elsewhaero panels with floating modules.</small></button>
      </div>
      <button type="button" className="pa-skip" onClick={() => { setDoc(blankDoc('original')); setChoosing(false) }}>Skip for now</button>
    </section></div>}
    {editing && isMine && mode === 'designer' && previewData ? <div className="pa-body pa-designer">
      <Designer doc={doc} data={previewData} dirty={dirty} onDoc={next => { setDoc(next); setDirty(true) }} onSave={publish => void save(publish)}
        onLeave={() => setMode('quick')} pickImage={file => shrinkImage(file, 800, 800)} onError={setError} />
    </div> : <div className={editing && isMine ? 'pa-body is-editing' : 'pa-body'}>
      {editing && isMine && <aside className="pa-editor" aria-label="Quick Customize">
        <div className="pa-editor-actions">
          <button type="button" onClick={() => void save(false)} disabled={!dirty}>💾 Save draft</button>
          <button type="button" className="is-primary" onClick={() => void save(true)}>✦ Publish</button>
          <button type="button" onClick={() => { if (!dirty || window.confirm('Leave the editor? Your draft is kept.')) setEditing(false) }}>👁 View</button>
          <button type="button" onClick={() => setMode('designer')}>✦ Visual Designer</button>
        </div>
        {doc.design.on && doc.design.elements.length > 0 && <small>Your profile uses your Visual Designer page. Text, pictures and friends you set here still show in its pieces.</small>}
        {data?.published && <button type="button" className="pa-link" onClick={() => { if (window.confirm('Unpublish your profile? Visitors will see “Profile not found” until you publish again.')) void unpublishProfile().then(load) }}>Unpublish</button>}

        <details open><summary>Layout & colors</summary>
          <label>Layout<select value={doc.layout} onChange={e => change({ layout: e.target.value as ProfileDoc['layout'], theme: { ...LAYOUT_DEFAULTS[e.target.value as ProfileDoc['layout']] } })}>
            <option value="original">Elsewhere Original</option><option value="classic">Classic Profile</option></select></label>
          <div className="pa-colors">{([['bg', 'Background'], ['panel', 'Panels'], ['heading', 'Headings'], ['accent', 'Accent'], ['ink', 'Text']] as const).map(([key, label]) =>
            <label key={key}>{label}<input type="color" value={doc.theme[key]} onChange={e => theme({ [key]: e.target.value })} /></label>)}</div>
          <label>Font<select value={doc.theme.font} onChange={e => theme({ font: e.target.value })}>{FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select></label>
          <label>Background pattern<select value={doc.theme.pattern} onChange={e => theme({ pattern: e.target.value })}>{PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
        </details>
        <details open><summary>Picture & banner</summary>
          <label>Profile picture<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => void pickImage('avatar', e.target.files)} /></label>
          {doc.avatar && <button type="button" className="pa-link" onClick={() => change({ avatar: '' })}>Remove picture</button>}
          <label>Banner<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => void pickImage('banner', e.target.files)} /></label>
          {doc.banner && <button type="button" className="pa-link" onClick={() => change({ banner: '' })}>Remove banner</button>}
        </details>
        <details open><summary>About you</summary>
          <label>Headline<input value={doc.headline} maxLength={120} onChange={e => change({ headline: e.target.value })} placeholder="somewhere between a daydream and a computer screen" /></label>
          <label>Mood<input value={doc.mood} maxLength={60} onChange={e => change({ mood: e.target.value })} placeholder="dreamy ☁" /></label>
          <label>Status<input value={doc.status} maxLength={160} onChange={e => change({ status: e.target.value })} placeholder="what are you up to?" /></label>
          <label>About me<textarea rows={6} value={doc.about} maxLength={5000} onChange={e => change({ about: e.target.value })} /></label>
        </details>
        <details><summary>Interests</summary>
          {doc.interests.map((row, i) => <div key={i} className="pa-row">
            <select value={row.label} onChange={e => change({ interests: doc.interests.map((r, j) => j === i ? { ...r, label: e.target.value } : r) })}>{[...new Set([...INTEREST_LABELS, row.label])].map(l => <option key={l}>{l}</option>)}</select>
            <input value={row.value} maxLength={600} onChange={e => change({ interests: doc.interests.map((r, j) => j === i ? { ...r, value: e.target.value } : r) })} />
            <button type="button" aria-label="Remove" onClick={() => change({ interests: doc.interests.filter((_, j) => j !== i) })}>✕</button></div>)}
          {doc.interests.length < 10 && <button type="button" onClick={() => change({ interests: [...doc.interests, { label: 'General', value: '' }] })}>+ Add interest</button>}
        </details>
        <details><summary>Profile song</summary>
          <label>Song title<input value={doc.music.title} maxLength={120} onChange={e => change({ music: { ...doc.music, title: e.target.value } })} /></label>
          <label>Artist<input value={doc.music.artist} maxLength={120} onChange={e => change({ music: { ...doc.music, artist: e.target.value } })} /></label>
          <label>Listen link (https)<input value={doc.music.url} onChange={e => change({ music: { ...doc.music, url: e.target.value } })} placeholder="https://…" /></label>
          <small>Songs never auto-play: visitors choose to listen.</small>
        </details>
        <details><summary>Links</summary>
          {doc.links.map((link, i) => <div key={i} className="pa-row">
            <input value={link.label} maxLength={60} placeholder="Label" onChange={e => change({ links: doc.links.map((l, j) => j === i ? { ...l, label: e.target.value } : l) })} />
            <input value={link.url} placeholder="https://…" onChange={e => change({ links: doc.links.map((l, j) => j === i ? { ...l, url: e.target.value } : l) })} />
            <button type="button" aria-label="Remove" onClick={() => change({ links: doc.links.filter((_, j) => j !== i) })}>✕</button></div>)}
          {doc.links.length < 12 && <button type="button" onClick={() => change({ links: [...doc.links, { label: '', url: '' }] })}>+ Add link</button>}
        </details>
        <details><summary>Top Friends ({doc.topFriends.length}/12)</summary>
          {!mine?.friends.length && <small>Add friends in Messenger to show them here.</small>}
          {doc.topFriends.map(id => { const f = mine?.friends.find(x => x.id === id); return f && <div key={id} className="pa-row pa-top">
            <span>{f.display_name} <small>@{f.handle}</small></span>
            <button type="button" aria-label="Move up" onClick={() => moveTopFriend(id, -1)}>▲</button><button type="button" aria-label="Move down" onClick={() => moveTopFriend(id, 1)}>▼</button>
            <button type="button" aria-label="Remove" onClick={() => pickTopFriend(id, false)}>✕</button></div> })}
          {mine?.friends.filter(f => !doc.topFriends.includes(f.id)).map(f => <button key={f.id} type="button" className="pa-add-friend" disabled={doc.topFriends.length >= 12} onClick={() => pickTopFriend(f.id, true)}>+ {f.display_name} <small>@{f.handle}</small></button>)}
        </details>
        <details><summary>Sections</summary>
          {(Object.keys(doc.sections) as (keyof ProfileDoc['sections'])[]).map(key => <label key={key} className="pa-check"><input type="checkbox" checked={doc.sections[key]} onChange={e => change({ sections: { ...doc.sections, [key]: e.target.checked } })} /> {key === 'friends' ? 'Top Friends' : key[0].toUpperCase() + key.slice(1)}</label>)}
        </details>
        <details onToggle={e => { if ((e.target as HTMLDetailsElement).open && versions === null) void listProfileVersions().then(setVersions, () => setVersions('Version history isn’t switched on yet (run supabase/12_profile_versions.sql).')) }}><summary>Version history</summary>
          {versions === null && <small>Loading…</small>}
          {typeof versions === 'string' && <small>{versions}</small>}
          {Array.isArray(versions) && !versions.length && <small>Every time you publish, a copy is kept here (your last 30).</small>}
          {Array.isArray(versions) && versions.map((v, i) => <div key={v.id} className="pa-row pa-top">
            <span>{new Date(v.created_at).toLocaleString()}{i === 0 ? ' · live now' : ''}</span>
            <button type="button" onClick={() => { if (dirty && !window.confirm('Replace your current draft with this version? Your live profile won’t change until you publish.')) return
              void getProfileVersion(v.id).then(found => { setDoc(normalizeDoc(found)); setDirty(true); setNotice('Version loaded into your draft. Publish to make it live.') }, cause => setError(cause instanceof Error ? cause.message : String(cause))) }}>Load into draft</button>
          </div>)}
        </details>
        <details open><summary>Privacy</summary>
          <label>Who can see my profile<select value={visibility} onChange={e => { setVisibility(e.target.value as MyProfile['visibility']); setDirty(true) }}>
            <option value="public">Everyone, including the web</option><option value="friends">Friends only</option><option value="private">Only me</option></select></label>
          <label>Guestbook<select value={guestbook} onChange={e => { setGuestbook(e.target.value as MyProfile['guestbook']); setDirty(true) }}>
            <option value="everyone">Anyone signed in can sign</option><option value="friends">Friends can sign</option><option value="off">Off</option></select></label>
          <label>Message for people who can’t see it<input value={doc.privateCard.message} maxLength={300} onChange={e => change({ privateCard: { message: e.target.value } })} placeholder="This profile is just for friends ♡" /></label>
          <small>Privacy is checked by Elsewhere’s server, so hidden things are never sent to people who can’t see them.</small>
        </details>
      </aside>}
      <main className="pa-view">{previewData ? <Preview data={previewData} onOpen={open} buttons={buttons} onChanged={() => void load()} /> : !error && <p className="pa-loading">Loading…</p>}</main>
    </div>}
  </div>
}
