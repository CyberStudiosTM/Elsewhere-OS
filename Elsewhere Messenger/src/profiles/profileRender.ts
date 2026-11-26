// Elsewhere Profiles: the ONE renderer used by the Messenger profile window and the public web page.
// No imports and no framework, so the same file is also compiled for the website (public/profile-render.js).
// Everything the creator types is shown as text (never HTML), links must be https, and images must be
// https or small data: images. Data arrives already filtered by the server for this viewer.

export type ProfileTheme = { bg: string; panel: string; ink: string; accent: string; heading: string; font: string; pattern: string }
export type ProfileDoc = {
  v: 1
  layout: 'classic' | 'original'
  theme: ProfileTheme
  headline: string
  mood: string
  status: string
  about: string
  interests: { label: string; value: string }[]
  music: { title: string; artist: string; url: string }
  links: { label: string; url: string }[]
  topFriends: string[]
  avatar: string
  banner: string
  sections: { about: boolean; interests: boolean; music: boolean; bulletins: boolean; friends: boolean; guestbook: boolean; links: boolean }
  privateCard: { message: string }
  /** Visual Designer page. When `on` and it has elements, it replaces the starter layout. */
  design: Design
}

// ---------- Visual Designer model ----------
export const DESIGN_WIDTH = 960
export const MODULES = ['identity', 'about', 'interests', 'music', 'links', 'friends', 'bulletins', 'guestbook'] as const
export type ModuleName = typeof MODULES[number]
export const ELEMENT_KINDS = ['heading', 'text', 'image', 'button', 'divider', 'shape', 'module', 'code'] as const
/** Custom HTML/CSS/JS runs only here: a page on a separate origin, loaded in an opaque-origin sandbox. */
export const CODE_SANDBOX_URL = 'https://cyberthreed.github.io/CyberStudios/elsewhere/sandbox.html'
export const CODE_LIMIT = 60000
export type ElementKind = typeof ELEMENT_KINDS[number]
export const ANIMATIONS = ['none', 'float', 'pulse', 'wiggle', 'spin', 'glow'] as const
export type DesignStyle = {
  color?: string; bg?: string; bg2?: string; angle?: number; font?: string; size?: number; bold?: boolean; italic?: boolean
  align?: 'left' | 'center' | 'right'; radius?: number; borderW?: number; borderColor?: string; borderStyle?: 'solid' | 'dashed' | 'dotted'
  shadow?: number; opacity?: number; padding?: number; rot?: number; anim?: typeof ANIMATIONS[number]; fit?: 'cover' | 'contain'
}
export type DesignElement = {
  id: string; kind: ElementKind; module?: ModuleName
  x: number; y: number; w: number; h: number; z: number
  hidden?: boolean; locked?: boolean; hideMobile?: boolean; group?: string
  text?: string; src?: string; href?: string
  code?: { html: string; css: string; js: string }
  style: DesignStyle
}
export type Design = { on: boolean; height: number; elements: DesignElement[] }
export const blankDesign = (): Design => ({ on: false, height: 900, elements: [] })
export type ProfileData = {
  status: 'ok' | 'locked' | 'missing'
  access?: 'owner' | 'friend' | 'visitor'
  id?: string | null
  handle?: string
  display_name?: string
  doc?: Partial<ProfileDoc>
  published?: boolean
  top_friends?: { handle: string; display_name: string }[]
  guestbook?: { id: string; body: string; created_at: string; handle: string; display_name: string; mine: boolean }[]
  guestbook_mode?: 'everyone' | 'friends' | 'off'
  can_sign?: boolean
  bulletins?: { id: string; body: string; created_at: string }[]
  card?: { message?: string }
  signed_in?: boolean
}
export type ProfileActions = {
  /** Where profile links go (web: ?u=handle, app: opens that profile). */
  profileHref: (handle: string) => string
  onOpenProfile?: (handle: string) => void
  onSign?: (body: string) => Promise<void>
  onRemoveEntry?: (id: string) => Promise<void>
  onPostBulletin?: (body: string) => Promise<void>
  onDeleteBulletin?: (id: string) => Promise<void>
  /** Shown in the protected identity rail (e.g. Message, Edit profile, Sign in). */
  railButtons?: { label: string; onClick: () => void; primary?: boolean }[]
  /** Disable audio/animation extras (reduced motion is also respected automatically). */
  quiet?: boolean
  /** Where code blocks run (defaults to the public Elsewhere sandbox). */
  sandboxUrl?: string
}

export const FONTS = ['Tahoma', 'Verdana', 'Trebuchet MS', 'Georgia', 'Courier New', 'Comic Sans MS', 'Segoe UI', 'Lucida Console', 'Arial']
export const PATTERNS = ['elsewhaero', 'none', 'stars', 'hearts', 'grid', 'dots', 'checker', 'stripes', 'sparkles']
export const INTEREST_LABELS = ['General', 'Music', 'Movies', 'Television', 'Books', 'Games', 'Heroes']

export const LAYOUT_DEFAULTS: Record<ProfileDoc['layout'], ProfileTheme> = {
  classic: { bg: '#cfe6ff', panel: '#ffffff', ink: '#16233a', accent: '#ff5fa2', heading: '#3a7bd5', font: 'Verdana', pattern: 'stars' },
  original: { bg: '#7cc9f3', panel: '#f4fbff', ink: '#0b2a4a', accent: '#62c23d', heading: '#0a6fbd', font: 'Segoe UI', pattern: 'elsewhaero' },
}

export function blankDoc(layout: ProfileDoc['layout'] = 'original'): ProfileDoc {
  return {
    v: 1, layout, theme: { ...LAYOUT_DEFAULTS[layout] }, headline: '', mood: '', status: '', about: '',
    interests: INTEREST_LABELS.slice(0, 4).map(label => ({ label, value: '' })),
    music: { title: '', artist: '', url: '' }, links: [], topFriends: [], avatar: '', banner: '',
    sections: { about: true, interests: true, music: true, bulletins: true, friends: true, guestbook: true, links: true },
    privateCard: { message: '' }, design: blankDesign(),
  }
}

const COLOR = /^#[0-9a-f]{6}$/i
const str = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : ''
const color = (value: unknown, fallback: string) => typeof value === 'string' && COLOR.test(value) ? value : fallback
export function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try { const url = new URL(value.trim()); return url.protocol === 'https:' ? url.href : '' } catch { return '' }
}
export function safeImage(value: unknown): string {
  if (typeof value !== 'string') return ''
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value) && value.length < 420000) return value
  return safeUrl(value)
}

/** Reads any stored doc into a complete, safe ProfileDoc (unknown fields dropped, bad values defaulted). */
export function normalizeDoc(raw: unknown): ProfileDoc {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const layout = d.layout === 'classic' ? 'classic' : 'original'
  const base = blankDoc(layout)
  const t = (d.theme && typeof d.theme === 'object' ? d.theme : {}) as Record<string, unknown>
  const s = (d.sections && typeof d.sections === 'object' ? d.sections : {}) as Record<string, unknown>
  const m = (d.music && typeof d.music === 'object' ? d.music : {}) as Record<string, unknown>
  const card = (d.privateCard && typeof d.privateCard === 'object' ? d.privateCard : {}) as Record<string, unknown>
  return {
    v: 1, layout,
    theme: {
      bg: color(t.bg, base.theme.bg), panel: color(t.panel, base.theme.panel), ink: color(t.ink, base.theme.ink),
      accent: color(t.accent, base.theme.accent), heading: color(t.heading, base.theme.heading),
      font: FONTS.includes(t.font as string) ? t.font as string : base.theme.font,
      pattern: PATTERNS.includes(t.pattern as string) ? t.pattern as string : base.theme.pattern,
    },
    headline: str(d.headline, 120), mood: str(d.mood, 60), status: str(d.status, 160), about: str(d.about, 5000),
    interests: Array.isArray(d.interests) ? d.interests.slice(0, 10).map(row => ({ label: str((row as { label?: unknown })?.label, 30), value: str((row as { value?: unknown })?.value, 600) })) : base.interests,
    music: { title: str(m.title, 120), artist: str(m.artist, 120), url: safeUrl(m.url) },
    links: Array.isArray(d.links) ? d.links.slice(0, 12).map(row => ({ label: str((row as { label?: unknown })?.label, 60), url: safeUrl((row as { url?: unknown })?.url) })).filter(link => link.url) : [],
    topFriends: Array.isArray(d.topFriends) ? d.topFriends.filter((id): id is string => typeof id === 'string').slice(0, 12) : [],
    avatar: safeImage(d.avatar), banner: safeImage(d.banner),
    sections: Object.fromEntries(Object.keys(base.sections).map(key => [key, s[key] !== false])) as ProfileDoc['sections'],
    privateCard: { message: str(card.message, 300) },
    design: normalizeDesign(d.design),
  }
}

const num = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && isFinite(value) ? Math.min(max, Math.max(min, Math.round(value * 100) / 100)) : fallback
function normalizeStyle(raw: unknown): DesignStyle {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: DesignStyle = {}
  for (const key of ['color', 'bg', 'bg2', 'borderColor'] as const) if (typeof s[key] === 'string' && COLOR.test(s[key] as string)) out[key] = s[key] as string
  if (FONTS.includes(s.font as string)) out.font = s.font as string
  if (s.size !== undefined) out.size = num(s.size, 8, 160, 16)
  if (s.angle !== undefined) out.angle = num(s.angle, 0, 360, 180)
  if (s.bold === true) out.bold = true
  if (s.italic === true) out.italic = true
  if (s.align === 'center' || s.align === 'right' || s.align === 'left') out.align = s.align
  if (s.radius !== undefined) out.radius = num(s.radius, 0, 400, 0)
  if (s.borderW !== undefined) out.borderW = num(s.borderW, 0, 24, 0)
  if (s.borderStyle === 'dashed' || s.borderStyle === 'dotted' || s.borderStyle === 'solid') out.borderStyle = s.borderStyle
  if (s.shadow !== undefined) out.shadow = num(s.shadow, 0, 3, 0)
  if (s.opacity !== undefined) out.opacity = num(s.opacity, 0.05, 1, 1)
  if (s.padding !== undefined) out.padding = num(s.padding, 0, 120, 0)
  if (s.rot !== undefined) out.rot = num(s.rot, -180, 180, 0)
  if (ANIMATIONS.includes(s.anim as typeof ANIMATIONS[number])) out.anim = s.anim as typeof ANIMATIONS[number]
  if (s.fit === 'contain' || s.fit === 'cover') out.fit = s.fit
  return out
}
/** Reads any stored design into a safe one (unknown kinds dropped, numbers clamped, links/images checked). */
export function normalizeDesign(raw: unknown): Design {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(d.elements) ? d.elements.slice(0, 120) : []
  const elements: DesignElement[] = []
  for (const item of list) {
    const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    if (!ELEMENT_KINDS.includes(e.kind as ElementKind)) continue
    if (e.kind === 'module' && !MODULES.includes(e.module as ModuleName)) continue
    const el: DesignElement = {
      id: str(e.id, 24) || Math.random().toString(36).slice(2, 10), kind: e.kind as ElementKind,
      x: num(e.x, -400, DESIGN_WIDTH + 200, 0), y: num(e.y, -200, 12000, 0), w: num(e.w, 4, 2000, 200), h: num(e.h, 2, 6000, 60),
      z: Math.round(num(e.z, -1000, 1000, 0)), style: normalizeStyle(e.style),
    }
    if (e.kind === 'module') el.module = e.module as ModuleName
    if (e.hidden === true) el.hidden = true
    if (e.locked === true) el.locked = true
    if (e.hideMobile === true) el.hideMobile = true
    if (typeof e.group === 'string' && e.group) el.group = str(e.group, 24)
    if (typeof e.text === 'string') el.text = str(e.text, 4000)
    if (e.kind === 'image' || e.kind === 'shape') { const src = safeImage(e.src); if (src) el.src = src }
    if (e.kind === 'button' || e.kind === 'image' || e.kind === 'text' || e.kind === 'heading') { const href = safeUrl(e.href); if (href) el.href = href }
    if (e.kind === 'code') { const c = (e.code && typeof e.code === 'object' ? e.code : {}) as Record<string, unknown>; el.code = { html: str(c.html, CODE_LIMIT), css: str(c.css, CODE_LIMIT), js: str(c.js, CODE_LIMIT) } }
    elements.push(el)
  }
  return { on: d.on === true, height: num(d.height, 200, 12000, 900), elements }
}

// ---------- DOM helpers (text only, never innerHTML) ----------
type Child = Node | string | null | undefined | false
function h(tag: string, attrs: Record<string, string | undefined> = {}, ...children: Child[]) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(key, value)
  for (const child of children) if (child) el.append(child)
  return el
}
function paragraphs(text: string) {
  const box = h('div', { class: 'ep-text' })
  for (const part of text.split(/\n{2,}/)) if (part.trim()) box.append(h('p', {}, part.trim()))
  return box
}
const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
function initials(name: string) { return (name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase() }
function avatarEl(src: string, name: string, cls: string) {
  return src ? h('img', { class: cls, src, alt: `${name}'s picture`, loading: 'lazy' }) : h('div', { class: cls + ' ep-avatar-blank', 'aria-hidden': 'true' }, initials(name))
}
function box(title: string, cls: string, ...children: Child[]) {
  return h('section', { class: 'ep-box ' + cls }, h('h2', { class: 'ep-box-title' }, title), ...children)
}
function friendLink(friend: { handle: string; display_name: string }, actions: ProfileActions) {
  const a = h('a', { class: 'ep-friend', href: actions.profileHref(friend.handle) }, h('span', { class: 'ep-friend-pic', 'aria-hidden': 'true' }, initials(friend.display_name)), h('span', {}, friend.display_name), h('small', {}, '@' + friend.handle))
  if (actions.onOpenProfile) a.addEventListener('click', event => { event.preventDefault(); actions.onOpenProfile!(friend.handle) })
  return a
}
function composer(placeholder: string, button: string, send: (body: string) => Promise<void>, max: number) {
  const area = h('textarea', { placeholder, maxlength: String(max), rows: '3', 'aria-label': placeholder }) as HTMLTextAreaElement
  const go = h('button', { type: 'submit', class: 'ep-button' }, button) as HTMLButtonElement
  const note = h('p', { class: 'ep-note', role: 'status' })
  const form = h('form', { class: 'ep-compose' }, area, h('div', { class: 'ep-compose-row' }, note, go))
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const body = area.value.trim()
    if (!body) return
    go.disabled = true; note.textContent = ''
    try { await send(body); area.value = '' } catch (error) { note.textContent = error instanceof Error ? error.message : String(error) } finally { go.disabled = false }
  })
  return form
}

// ---------- Modules ----------
function guestbookBox(data: ProfileData, actions: ProfileActions) {
  const entries = data.guestbook || []
  const list = h('ol', { class: 'ep-guestbook' })
  for (const entry of entries) {
    const item = h('li', {}, h('div', { class: 'ep-entry-head' }, friendLink(entry, actions), h('time', {}, when(entry.created_at))), paragraphs(entry.body))
    if ((data.access === 'owner' || entry.mine) && actions.onRemoveEntry) {
      const remove = h('button', { type: 'button', class: 'ep-link-button' }, 'remove')
      remove.addEventListener('click', () => { void actions.onRemoveEntry!(entry.id) })
      item.querySelector('.ep-entry-head')!.append(remove)
    }
    list.append(item)
  }
  const children: Child[] = [entries.length ? list : h('p', { class: 'ep-empty' }, 'No guestbook entries yet. Be the first ♡')]
  if (data.can_sign && actions.onSign && data.access !== 'owner') children.unshift(composer(`Sign ${data.display_name}'s guestbook…`, 'Sign', actions.onSign, 1000))
  else if (!data.signed_in && data.guestbook_mode !== 'off') children.unshift(h('p', { class: 'ep-note' }, 'Sign in to Elsewhere to sign this guestbook.'))
  return box(`${data.display_name}'s Guestbook`, 'ep-guestbook-box', ...children)
}
function bulletinsBox(data: ProfileData, actions: ProfileActions) {
  const posts = data.bulletins || []
  const list = h('ul', { class: 'ep-bulletins' })
  for (const post of posts) {
    const item = h('li', {}, h('time', {}, when(post.created_at)), paragraphs(post.body))
    if (data.access === 'owner' && actions.onDeleteBulletin) {
      const remove = h('button', { type: 'button', class: 'ep-link-button' }, 'delete')
      remove.addEventListener('click', () => { void actions.onDeleteBulletin!(post.id) })
      item.append(remove)
    }
    list.append(item)
  }
  const children: Child[] = [posts.length ? list : h('p', { class: 'ep-empty' }, 'No bulletins yet.')]
  if (data.access === 'owner' && actions.onPostBulletin) children.unshift(composer('Post a bulletin…', 'Post', actions.onPostBulletin, 2000))
  return box('Bulletins', 'ep-bulletins-box', ...children)
}
function friendsBox(data: ProfileData, actions: ProfileActions) {
  const friends = data.top_friends || []
  return box(`${data.display_name}'s Top Friends`, 'ep-friends-box',
    friends.length ? h('div', { class: 'ep-friend-grid' }, ...friends.map(f => friendLink(f, actions))) : h('p', { class: 'ep-empty' }, 'No Top Friends picked yet.'))
}
function interestsBox(doc: ProfileDoc, name: string) {
  const rows = doc.interests.filter(row => row.value.trim())
  if (!rows.length) return null
  return box(`${name}'s Interests`, 'ep-interests-box', h('table', { class: 'ep-interests' }, h('tbody', {}, ...rows.map(row => h('tr', {}, h('th', { scope: 'row' }, row.label || '♡'), h('td', {}, row.value))))))
}
function musicBox(doc: ProfileDoc) {
  if (!doc.music.title && !doc.music.url) return null
  const children: Child[] = [h('p', { class: 'ep-track' }, h('span', { class: 'ep-note-icon', 'aria-hidden': 'true' }, '♫ '), doc.music.title || 'My song', doc.music.artist ? h('small', {}, ' · ' + doc.music.artist) : null)]
  // Music never auto-plays: visitors choose to open it.
  if (doc.music.url) children.push(h('a', { class: 'ep-button', href: doc.music.url, target: '_blank', rel: 'noopener noreferrer' }, '▶ Listen'))
  return box('Profile Song', 'ep-music-box', ...children)
}
function linksBox(doc: ProfileDoc) {
  if (!doc.links.length) return null
  return box('Links', 'ep-links-box', h('ul', { class: 'ep-links' }, ...doc.links.map(link => h('li', {}, h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer ugc' }, link.label || new URL(link.url).hostname)))))
}
function aboutBox(doc: ProfileDoc, name: string) {
  return box(`About ${name}`, 'ep-about-box', doc.about.trim() ? paragraphs(doc.about) : h('p', { class: 'ep-empty' }, 'Nothing here yet.'))
}

// ---------- The protected identity rail (never styled by the creator) ----------
function rail(data: ProfileData, actions: ProfileActions) {
  const bar = h('header', { class: 'ep-rail', 'aria-label': 'Profile' },
    h('span', { class: 'ep-rail-logo', 'aria-hidden': 'true' }, '🦋'),
    h('span', { class: 'ep-rail-name' }, h('strong', {}, data.display_name || ''), h('small', {}, '@' + (data.handle || ''))))
  const tools = h('span', { class: 'ep-rail-actions' })
  for (const button of actions.railButtons || []) {
    const b = h('button', { type: 'button', class: button.primary ? 'is-primary' : undefined }, button.label)
    b.addEventListener('click', button.onClick)
    tools.append(b)
  }
  bar.append(tools)
  return bar
}

function pageShell(doc: ProfileDoc, layout: string) {
  const page = h('div', { class: `ep-page ep-layout-${layout} ep-pattern-${doc.theme.pattern}` })
  const vars: Record<string, string> = { '--ep-bg': doc.theme.bg, '--ep-panel': doc.theme.panel, '--ep-ink': doc.theme.ink, '--ep-accent': doc.theme.accent, '--ep-heading': doc.theme.heading, '--ep-font': `"${doc.theme.font}", Tahoma, sans-serif` }
  for (const [key, value] of Object.entries(vars)) page.style.setProperty(key, value)
  return page
}
function identityBox(doc: ProfileDoc, data: ProfileData, name: string) {
  return h('section', { class: 'ep-box ep-identity' },
    avatarEl(doc.avatar, name, 'ep-avatar'),
    h('div', { class: 'ep-identity-text' },
      h('h1', { class: 'ep-name' }, name),
      doc.headline ? h('p', { class: 'ep-headline' }, doc.headline) : null,
      doc.mood ? h('p', { class: 'ep-mood' }, h('b', {}, 'Mood: '), doc.mood) : null,
      doc.status ? h('p', { class: 'ep-status' }, h('b', {}, 'Status: '), doc.status) : null,
      h('p', { class: 'ep-handle' }, '@' + (data.handle || ''))))
}
function moduleBox(module: ModuleName, doc: ProfileDoc, data: ProfileData, actions: ProfileActions) {
  const name = data.display_name || data.handle || ''
  switch (module) {
    case 'identity': return identityBox(doc, data, name)
    case 'about': return aboutBox(doc, name)
    case 'interests': return interestsBox(doc, name) || box(`${name}'s Interests`, 'ep-interests-box', h('p', { class: 'ep-empty' }, 'No interests yet.'))
    case 'music': return musicBox(doc) || box('Profile Song', 'ep-music-box', h('p', { class: 'ep-empty' }, 'No song picked yet.'))
    case 'links': return linksBox(doc) || box('Links', 'ep-links-box', h('p', { class: 'ep-empty' }, 'No links yet.'))
    case 'friends': return friendsBox(data, actions)
    case 'bulletins': return bulletinsBox(data, actions)
    case 'guestbook': return data.guestbook_mode === 'off' ? box('Guestbook', 'ep-guestbook-box', h('p', { class: 'ep-empty' }, 'The guestbook is closed.')) : guestbookBox(data, actions)
  }
}
const SHADOWS = ['none', '0 2px 6px #0b2a4a33', '0 8px 20px #0b2a4a40', '0 16px 40px #0b2a4a59']
/** Applies a validated design style to an element (values were already checked by normalizeStyle). */
function applyStyle(el: HTMLElement, s: DesignStyle) {
  const st = el.style
  if (s.color) st.color = s.color
  if (s.bg && s.bg2) st.background = `linear-gradient(${s.angle ?? 180}deg, ${s.bg}, ${s.bg2})`
  else if (s.bg) st.background = s.bg
  if (s.font) st.fontFamily = `"${s.font}", Tahoma, sans-serif`
  if (s.size) st.fontSize = s.size + 'px'
  if (s.bold) st.fontWeight = 'bold'
  if (s.italic) st.fontStyle = 'italic'
  if (s.align) st.textAlign = s.align
  if (s.radius) st.borderRadius = s.radius + 'px'
  if (s.borderW) st.border = `${s.borderW}px ${s.borderStyle || 'solid'} ${s.borderColor || '#000000'}`
  if (s.shadow) st.boxShadow = SHADOWS[s.shadow]
  if (s.opacity !== undefined && s.opacity < 1) st.opacity = String(s.opacity)
  if (s.padding) st.padding = s.padding + 'px'
}
function elementBody(e: DesignElement, doc: ProfileDoc, data: ProfileData, actions: ProfileActions): HTMLElement {
  const link = (child: HTMLElement) => {
    if (!e.href) return child
    const a = h('a', { href: e.href, target: '_blank', rel: 'noopener noreferrer ugc', class: 'ep-el-link' }); a.append(child); return a
  }
  switch (e.kind) {
    case 'heading': return link(h('h2', { class: 'ep-el-heading' }, e.text || ''))
    case 'text': return link(paragraphs(e.text || ''))
    case 'button': return h('a', { class: 'ep-el-button', href: e.href || undefined, target: e.href ? '_blank' : undefined, rel: 'noopener noreferrer ugc', role: e.href ? undefined : 'presentation' }, e.text || 'Button')
    case 'image': return link(e.src ? h('img', { class: 'ep-el-img', src: e.src, alt: e.text || '', loading: 'lazy', draggable: 'false', style: `object-fit:${e.style.fit || 'cover'}` }) : h('div', { class: 'ep-el-img ep-el-empty' }, 'Picture'))
    case 'divider': return h('hr', { class: 'ep-el-divider' })
    case 'shape': return h('div', { class: 'ep-el-shape' })
    case 'module': return moduleBox(e.module!, doc, data, actions)
    case 'code': return codeFrame(e.code || { html: '', css: '', js: '' }, actions.sandboxUrl || CODE_SANDBOX_URL)
  }
}
/** A creator's code block: an opaque-origin sandboxed frame on a separate site. It can't reach the profile page,
 *  sign-ins, storage, the app, the network, pop-ups or top-level navigation. */
export function codeFrame(code: { html: string; css: string; js: string }, sandboxUrl: string) {
  const frame = h('iframe', { class: 'ep-el-code', src: sandboxUrl, sandbox: 'allow-scripts', referrerpolicy: 'no-referrer', loading: 'lazy', title: 'Custom code block', allow: '' }) as HTMLIFrameElement
  frame.addEventListener('load', () => frame.contentWindow?.postMessage({ type: 'elsewhere-code', html: code.html, css: code.css, js: code.js }, '*'))
  return frame
}
/** The free-form Visual Designer page. Desktop: exact positions on a 960px canvas. Narrow screens: a
 *  readable single column in top-to-bottom order, so a desktop design never makes mobile unusable. */
export function designCanvas(doc: ProfileDoc, data: ProfileData, actions: ProfileActions, editing = false) {
  const design = doc.design
  const bottom = design.elements.reduce((max, e) => e.hidden ? max : Math.max(max, e.y + e.h), 0)
  const canvas = h('div', { class: 'ep-canvas' + (editing ? ' is-editing' : '') })
  canvas.style.height = Math.max(design.height, bottom + 40) + 'px'
  const order = [...design.elements].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const e of design.elements) {
    if (e.hidden && !editing) continue
    const wrap = h('div', { class: `ep-el ep-el-${e.kind}` + (e.hideMobile ? ' ep-hide-mobile' : '') + (e.hidden ? ' is-hidden' : '') + (e.style.anim && e.style.anim !== 'none' ? ` ep-anim-${e.style.anim}` : ''), 'data-el': e.id })
    const st = wrap.style
    st.left = e.x + 'px'; st.top = e.y + 'px'; st.width = e.w + 'px'; st.height = e.h + 'px'; st.zIndex = String(500 + e.z)
    st.order = String(order.indexOf(e))
    if (e.style.rot) st.setProperty('--ep-rot', e.style.rot + 'deg')
    if (e.kind === 'divider') { wrap.style.setProperty('--ep-line', e.style.color || doc.theme.accent) }
    const body = elementBody(e, doc, data, actions)
    body.classList.add('ep-el-body')
    if (e.kind === 'shape' && e.src) body.style.backgroundImage = `url("${e.src.replace(/"/g, '%22')}")`
    applyStyle(e.kind === 'module' ? wrap : body, e.style)
    wrap.append(body)
    canvas.append(wrap)
  }
  return canvas
}

/** Renders just the designer page (background + canvas) for the editor's live canvas. */
export function renderDesignPage(host: HTMLElement, data: ProfileData, actions: ProfileActions) {
  host.replaceChildren()
  host.classList.add('ep-host')
  const doc = normalizeDoc(data.doc)
  const page = pageShell(doc, 'designer')
  page.append(designCanvas(doc, data, actions, true))
  host.append(page)
}

/** Renders a profile into `host` (replacing its contents). */
export function renderProfile(host: HTMLElement, data: ProfileData, actions: ProfileActions) {
  host.replaceChildren()
  host.classList.add('ep-host')
  if (data.status === 'missing') { host.append(h('div', { class: 'ep-state' }, h('h1', {}, 'Profile not found'), h('p', {}, 'This profile doesn’t exist or isn’t available.'))); return }
  host.append(rail(data, actions))
  if (data.status === 'locked') {
    host.append(h('div', { class: 'ep-state ep-locked' }, h('div', { class: 'ep-lock', 'aria-hidden': 'true' }, '🔒'), h('h1', {}, data.display_name || ''),
      h('p', {}, data.card?.message || (data.signed_in ? 'This profile is only visible to friends.' : 'This profile is private. Sign in to Elsewhere to see if you can view it.'))))
    return
  }
  const doc = normalizeDoc(data.doc)
  const name = data.display_name || data.handle || ''
  const page = pageShell(doc, doc.design.on && doc.design.elements.length ? 'designer' : doc.layout)
  if (data.access === 'owner' && !data.published) page.append(h('p', { class: 'ep-draft-note' }, 'Preview: this profile isn’t published yet, so only you can see it.'))
  if (doc.design.on && doc.design.elements.length) {
    page.append(designCanvas(doc, data, actions))
    host.append(page)
    return
  }

  const identity = identityBox(doc, data, name)
  const sections = doc.sections
  const parts = {
    about: sections.about ? aboutBox(doc, name) : null,
    interests: sections.interests ? interestsBox(doc, name) : null,
    music: sections.music ? musicBox(doc) : null,
    links: sections.links ? linksBox(doc) : null,
    friends: sections.friends ? friendsBox(data, actions) : null,
    bulletins: sections.bulletins ? bulletinsBox(data, actions) : null,
    guestbook: sections.guestbook && data.guestbook_mode !== 'off' ? guestbookBox(data, actions) : null,
  }
  if (doc.banner) page.append(h('img', { class: 'ep-banner', src: doc.banner, alt: '', loading: 'lazy' }))
  if (doc.layout === 'classic') {
    // Classic Profile: the familiar two-column homepage (left: you, right: your world).
    page.append(h('div', { class: 'ep-columns' },
      h('div', { class: 'ep-col-left' }, identity, parts.music, parts.interests, parts.links),
      h('div', { class: 'ep-col-right' }, parts.about, parts.bulletins, parts.friends, parts.guestbook)))
  } else {
    // Elsewhere Original: glossy modular panels.
    page.append(h('div', { class: 'ep-modules' }, identity, parts.about, parts.music, parts.friends, parts.interests, parts.bulletins, parts.links, parts.guestbook))
  }
  host.append(page)
}
