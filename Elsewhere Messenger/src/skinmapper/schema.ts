// SkinMapper Phase 1: the SkinMap contract.
// A skin is data only: tokens, slot styles and asset references. No scripts, HTML, CSS text
// or remote URLs. The mapped renderer turns validated values into scoped CSS variables.

export const SKIN_FORMAT = 'elsewhere-skin'
export const FORMAT_VERSION = '1.0.0'
export const SKINMAP_VERSION = '1.0'

export type VisualState = 'normal' | 'hover' | 'pressed' | 'focus' | 'disabled' | 'selected' | 'active' | 'inactive'
  | 'unread' | 'online' | 'away' | 'busy' | 'offline' | 'expanded' | 'collapsed' | 'maximized' | 'error'
export type ScaleMode = 'contain' | 'cover' | 'fit' | 'original' | 'stretch' | 'tile' | 'nine-slice'
export type AssetKind = 'image' | 'icon' | 'frame' | 'texture'
export type WindowFamily = 'all' | 'sign-in' | 'buddy-list' | 'conversation' | 'dialog' | 'notification' | 'menu'

/** Style properties a slot may set. Each slot lists which ones it allows. */
export type StyleProperty =
  | 'background' | 'backgroundImage' | 'textColor' | 'mutedTextColor' | 'accentColor' | 'borderColor'
  | 'borderWidth' | 'borderRadius' | 'shadow' | 'opacity' | 'fontFamily' | 'fontSize' | 'fontWeight'
  | 'textShadow' | 'padding' | 'gap' | 'icon'

export type SlotDefinition = {
  id: string
  name: string
  window: WindowFamily
  /** Which design region from the handoff this slot belongs to (01-14). */
  region: number
  properties: StyleProperty[]
  assets: AssetKind[]
  scaling: ScaleMode[]
  states: VisualState[]
  /** Logical art box for icons/buttons (px at 1x), when fixed. */
  artBox?: { width: number; height: number }
  /** Smallest size the slot may render at without hiding its control. */
  minSize?: { width: number; height: number }
  /** Slot that this one inherits from when a value isn't set (besides window and global tokens). */
  inherits?: string
  /** Part of a real control: skins may restyle it but never hide it or move its hit area. */
  protected: boolean
  since: string
}

const ALL_BOX: StyleProperty[] = ['background', 'backgroundImage', 'borderColor', 'borderWidth', 'borderRadius', 'shadow', 'opacity']
const TEXT: StyleProperty[] = ['textColor', 'fontFamily', 'fontSize', 'fontWeight', 'textShadow']
const BUTTON_STATES: VisualState[] = ['normal', 'hover', 'pressed', 'focus', 'disabled']
const SURFACE_SCALING: ScaleMode[] = ['cover', 'contain', 'stretch', 'tile', 'nine-slice']
const ICON_SCALING: ScaleMode[] = ['contain', 'original']
const v = SKINMAP_VERSION

function slot(def: Omit<SlotDefinition, 'since'>): SlotDefinition { return { ...def, since: v } }

/** The v1 slot registry. Names follow the approved handoff regions; IDs never change once released. */
export const SLOTS: SlotDefinition[] = [
  // 01 Window chrome
  slot({ id: 'window.frame', name: 'Window frame', window: 'all', region: 1, properties: [...ALL_BOX, 'accentColor'], assets: ['frame', 'texture'], scaling: ['nine-slice', 'stretch', 'tile'], states: ['active', 'inactive', 'maximized'], protected: false }),
  slot({ id: 'window.titlebar', name: 'Title bar', window: 'all', region: 1, properties: [...ALL_BOX, ...TEXT], assets: ['image', 'texture'], scaling: SURFACE_SCALING, states: ['active', 'inactive'], minSize: { width: 120, height: 22 }, protected: true }),
  slot({ id: 'window.titlebar.text', name: 'Title text', window: 'all', region: 1, properties: TEXT, assets: [], scaling: [], states: ['active', 'inactive'], inherits: 'window.titlebar', protected: false }),
  slot({ id: 'window.controls.minimize', name: 'Minimize button', window: 'all', region: 1, properties: [...ALL_BOX, 'icon'], assets: ['icon'], scaling: ICON_SCALING, states: BUTTON_STATES, artBox: { width: 24, height: 20 }, minSize: { width: 18, height: 16 }, protected: true }),
  slot({ id: 'window.controls.maximize', name: 'Maximize button', window: 'all', region: 1, properties: [...ALL_BOX, 'icon'], assets: ['icon'], scaling: ICON_SCALING, states: BUTTON_STATES, artBox: { width: 24, height: 20 }, minSize: { width: 18, height: 16 }, inherits: 'window.controls.minimize', protected: true }),
  slot({ id: 'window.controls.close', name: 'Close button', window: 'all', region: 1, properties: [...ALL_BOX, 'icon'], assets: ['icon'], scaling: ICON_SCALING, states: BUTTON_STATES, artBox: { width: 24, height: 20 }, minSize: { width: 18, height: 16 }, inherits: 'window.controls.minimize', protected: true }),
  slot({ id: 'window.trim', name: 'Decorative trim / shell', window: 'all', region: 1, properties: ['backgroundImage', 'opacity'], assets: ['frame', 'image'], scaling: ['nine-slice', 'contain', 'stretch'], states: ['active', 'inactive'], protected: false }),
  // 02 Buddy list profile
  slot({ id: 'buddy.profile', name: 'Profile header', window: 'buddy-list', region: 2, properties: [...ALL_BOX, 'padding'], assets: ['image', 'texture'], scaling: SURFACE_SCALING, states: ['normal'], protected: false }),
  slot({ id: 'buddy.profile.avatar', name: 'Your picture frame', window: 'buddy-list', region: 2, properties: ['borderColor', 'borderWidth', 'borderRadius', 'shadow'], assets: ['frame'], scaling: ['nine-slice', 'stretch'], states: ['normal'], artBox: { width: 64, height: 64 }, protected: false }),
  slot({ id: 'buddy.profile.name', name: 'Your name', window: 'buddy-list', region: 2, properties: TEXT, assets: [], scaling: [], states: ['normal'], protected: false }),
  slot({ id: 'buddy.profile.status', name: 'Your status', window: 'buddy-list', region: 2, properties: [...TEXT, 'mutedTextColor'], assets: [], scaling: [], states: ['online', 'away', 'busy', 'offline'], protected: true }),
  slot({ id: 'buddy.profile.decoration', name: 'Profile decoration', window: 'buddy-list', region: 2, properties: ['backgroundImage', 'opacity'], assets: ['image'], scaling: ['contain', 'original'], states: ['normal'], protected: false }),
  // 03 Buddy list toolbar
  slot({ id: 'buddy.toolbar', name: 'Buddy toolbar', window: 'buddy-list', region: 3, properties: [...ALL_BOX, 'gap'], assets: ['texture', 'image'], scaling: SURFACE_SCALING, states: ['normal'], protected: false }),
  ...['add-contact', 'mail', 'call', 'webcam', 'nudge', 'web-treasures', 'activities'].map(action => slot({
    id: `buddy.toolbar.${action}`, name: `Buddy toolbar: ${action.replace('-', ' ')}`, window: 'buddy-list', region: 3,
    properties: [...ALL_BOX, 'icon'], assets: ['icon'], scaling: ICON_SCALING, states: BUTTON_STATES,
    artBox: { width: 32, height: 32 }, minSize: { width: 24, height: 24 }, inherits: 'buddy.toolbar.button', protected: true,
  })),
  slot({ id: 'buddy.toolbar.button', name: 'Buddy toolbar button (shared)', window: 'buddy-list', region: 3, properties: [...ALL_BOX, ...TEXT], assets: ['image'], scaling: ['nine-slice', 'stretch'], states: BUTTON_STATES, protected: true }),
  // 04 Service filter
  slot({ id: 'buddy.services', name: 'Service filter', window: 'buddy-list', region: 4, properties: [...ALL_BOX, 'gap'], assets: ['texture'], scaling: SURFACE_SCALING, states: ['normal'], protected: false }),
  slot({ id: 'buddy.services.button', name: 'Service button', window: 'buddy-list', region: 4, properties: [...ALL_BOX, ...TEXT], assets: ['image'], scaling: ['nine-slice', 'stretch'], states: [...BUTTON_STATES, 'selected'], protected: true }),
  // 05-07 Contacts
  slot({ id: 'buddy.contacts', name: 'Contact panel', window: 'buddy-list', region: 5, properties: [...ALL_BOX, 'padding'], assets: ['image', 'texture'], scaling: SURFACE_SCALING, states: ['normal'], minSize: { width: 200, height: 120 }, protected: true }),
  slot({ id: 'buddy.group.heading', name: 'Group heading', window: 'buddy-list', region: 6, properties: [...ALL_BOX, ...TEXT], assets: ['image', 'texture'], scaling: ['stretch', 'tile', 'nine-slice'], states: ['normal', 'hover', 'focus', 'expanded', 'collapsed'], protected: true }),
  slot({ id: 'buddy.contact.row', name: 'Contact row', window: 'buddy-list', region: 7, properties: [...ALL_BOX, ...TEXT, 'mutedTextColor'], assets: ['image'], scaling: ['stretch', 'nine-slice'], states: ['normal', 'hover', 'selected', 'unread', 'focus'], minSize: { width: 160, height: 20 }, protected: true }),
  slot({ id: 'buddy.contact.presence', name: 'Presence dot', window: 'buddy-list', region: 7, properties: ['icon', 'background'], assets: ['icon'], scaling: ICON_SCALING, states: ['online', 'away', 'busy', 'offline'], artBox: { width: 16, height: 16 }, protected: true }),
  slot({ id: 'buddy.contact.unread', name: 'Unread badge', window: 'buddy-list', region: 7, properties: [...ALL_BOX, ...TEXT], assets: [], scaling: [], states: ['normal'], protected: true }),
  // 08 Menus
  slot({ id: 'menu.bar', name: 'Menu bar', window: 'menu', region: 8, properties: [...ALL_BOX, ...TEXT], assets: ['texture'], scaling: SURFACE_SCALING, states: ['normal'], protected: true }),
  slot({ id: 'menu.dropdown', name: 'Menu drop-down', window: 'menu', region: 8, properties: [...ALL_BOX, ...TEXT], assets: ['frame', 'texture'], scaling: ['nine-slice', 'stretch', 'tile'], states: ['normal'], protected: true }),
  slot({ id: 'menu.item', name: 'Menu item', window: 'menu', region: 8, properties: [...ALL_BOX, ...TEXT], assets: [], scaling: [], states: ['normal', 'hover', 'focus', 'disabled'], protected: true }),
  // 09 Conversation
  slot({ id: 'chat.toolbar', name: 'Conversation toolbar', window: 'conversation', region: 9, properties: [...ALL_BOX, 'gap'], assets: ['texture', 'image'], scaling: SURFACE_SCALING, states: ['normal'], protected: false }),
  ...['invite', 'send-files', 'webcam', 'audio', 'nudge', 'emoticons', 'activities', 'web-treasures'].map(action => slot({
    id: `chat.toolbar.${action}`, name: `Chat toolbar: ${action.replace('-', ' ')}`, window: 'conversation', region: 9,
    properties: [...ALL_BOX, 'icon'], assets: ['icon'], scaling: ICON_SCALING, states: BUTTON_STATES,
    artBox: { width: 32, height: 32 }, minSize: { width: 24, height: 24 }, inherits: 'buddy.toolbar.button', protected: true,
  })),
  slot({ id: 'chat.transcript', name: 'Conversation history', window: 'conversation', region: 9, properties: [...ALL_BOX, ...TEXT, 'padding'], assets: ['image', 'texture'], scaling: SURFACE_SCALING, states: ['normal'], minSize: { width: 240, height: 120 }, protected: true }),
  slot({ id: 'chat.message.own', name: 'Your messages', window: 'conversation', region: 9, properties: [...ALL_BOX, ...TEXT, 'padding'], assets: ['frame'], scaling: ['nine-slice', 'stretch'], states: ['normal'], protected: false }),
  slot({ id: 'chat.message.incoming', name: 'Their messages', window: 'conversation', region: 9, properties: [...ALL_BOX, ...TEXT, 'padding'], assets: ['frame'], scaling: ['nine-slice', 'stretch'], states: ['normal'], inherits: 'chat.message.own', protected: false }),
  slot({ id: 'chat.notice', name: 'Service notices', window: 'conversation', region: 9, properties: [...ALL_BOX, ...TEXT], assets: [], scaling: [], states: ['normal'], protected: true }),
  slot({ id: 'chat.composer', name: 'Message box', window: 'conversation', region: 9, properties: [...ALL_BOX, ...TEXT, 'padding'], assets: ['frame', 'texture'], scaling: ['nine-slice', 'stretch', 'tile'], states: ['normal', 'focus', 'disabled'], minSize: { width: 200, height: 40 }, protected: true }),
  slot({ id: 'chat.send', name: 'Send button', window: 'conversation', region: 9, properties: [...ALL_BOX, ...TEXT], assets: ['image'], scaling: ['nine-slice', 'stretch'], states: BUTTON_STATES, minSize: { width: 48, height: 22 }, inherits: 'buddy.toolbar.button', protected: true }),
  // 10 Sign-in
  slot({ id: 'signin.header', name: 'Sign-in header', window: 'sign-in', region: 10, properties: [...ALL_BOX, ...TEXT], assets: ['image'], scaling: ['contain', 'cover', 'original'], states: ['normal'], protected: false }),
  slot({ id: 'signin.field', name: 'Sign-in fields', window: 'sign-in', region: 10, properties: [...ALL_BOX, ...TEXT], assets: [], scaling: [], states: ['normal', 'focus', 'disabled', 'error'], minSize: { width: 160, height: 20 }, protected: true }),
  slot({ id: 'signin.button', name: 'Sign In button', window: 'sign-in', region: 10, properties: [...ALL_BOX, ...TEXT], assets: ['image'], scaling: ['nine-slice', 'stretch'], states: BUTTON_STATES, minSize: { width: 80, height: 24 }, inherits: 'buddy.toolbar.button', protected: true }),
  slot({ id: 'signin.error', name: 'Sign-in error', window: 'sign-in', region: 10, properties: TEXT, assets: [], scaling: [], states: ['normal'], protected: true }),
  // 11 Dialogs
  slot({ id: 'dialog.frame', name: 'Dialog frame', window: 'dialog', region: 11, properties: [...ALL_BOX, ...TEXT], assets: ['frame'], scaling: ['nine-slice', 'stretch'], states: ['normal'], inherits: 'window.frame', protected: true }),
  slot({ id: 'dialog.button', name: 'Dialog buttons', window: 'dialog', region: 11, properties: [...ALL_BOX, ...TEXT], assets: ['image'], scaling: ['nine-slice', 'stretch'], states: BUTTON_STATES, inherits: 'buddy.toolbar.button', protected: true }),
  // 12 Notifications
  slot({ id: 'toast.frame', name: 'Pop-up notification', window: 'notification', region: 12, properties: [...ALL_BOX, ...TEXT], assets: ['frame', 'image'], scaling: ['nine-slice', 'stretch', 'cover'], states: ['normal'], minSize: { width: 330, height: 120 }, protected: false }),
  slot({ id: 'nudge.banner', name: 'Nudge banner', window: 'notification', region: 12, properties: [...ALL_BOX, ...TEXT], assets: ['image'], scaling: ['stretch', 'nine-slice'], states: ['normal'], protected: true }),
]

export const SLOT_INDEX: Record<string, SlotDefinition> = Object.fromEntries(SLOTS.map(item => [item.id, item]))

// ---------- Skin package data ----------

export type AssetRef = {
  /** Path inside the package, e.g. "assets/frames/main.png". */
  path: string
  scale?: ScaleMode
  /** Nine-slice insets in source pixels (top, right, bottom, left). */
  slice?: [number, number, number, number]
  /** Optional 2x variant path. */
  path2x?: string
  pixelated?: boolean
}
export type SlotStyle = Partial<Record<Exclude<StyleProperty, 'backgroundImage' | 'icon'>, string | number>> & {
  backgroundImage?: AssetRef
  icon?: AssetRef
}
export type SkinTheme = {
  /** Global tokens, e.g. { "accentColor": "#2f86cf", "fontFamily": "Segoe UI" } */
  tokens: SlotStyle
  /** Per window family tokens. */
  windows?: Partial<Record<WindowFamily, SlotStyle>>
  /** Per slot overrides, optionally per state: slots["chat.send"]["hover"]. */
  slots?: Record<string, Partial<Record<VisualState, SlotStyle>>>
  transcript?: 'classic' | 'bubble'
  /** Shell mode for device-shaped skins (transparent window with trim). */
  shell?: { trim: AssetRef; inset: [number, number, number, number] }
  /** Stickers and Web Treasures placed on the windows. Decorative only: they never cover clicks. */
  decorations?: Decoration[]
}
export type DecorationWindow = 'buddy-list' | 'conversation' | 'sign-in'
export type DecorationAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type Decoration = {
  id: string
  asset: AssetRef
  window: DecorationWindow
  anchor: DecorationAnchor
  /** Distance in px from the anchored corner. */
  x: number
  y: number
  /** Width in px; the height follows the picture. */
  width: number
  rotation?: number
  opacity?: number
  flip?: boolean
}
export const DECORATION_LIMIT = 24
export const DECORATION_WINDOWS: DecorationWindow[] = ['buddy-list', 'conversation', 'sign-in']
export const DECORATION_ANCHORS: DecorationAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
export type SkinManifest = {
  format: typeof SKIN_FORMAT
  formatVersion: string
  id: string
  name: string
  author: string
  description?: string
  skinMapVersion: string
  preview: string
  license?: string
  credits?: string
}

// ---------- Validation ----------

export type Severity = 'error' | 'warning' | 'info'
export type Finding = { severity: Severity; message: string; slot?: string; path?: string }

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|transparent)$/i
/** Glossy gradients: only a direction plus 2-8 color stops (no links, no functions besides rgba). */
const GRADIENT = /^linear-gradient\(\s*(to (top|bottom|left|right)|\d{1,3}deg)\s*(,\s*(#[0-9a-f]{3,8}|rgba?\([\d.\s,%]+\))(\s+\d{1,3}%)?){2,8}\s*\)$/i
const LENGTH = /^-?\d{1,4}(\.\d+)?(px|em|%)?$/
const SHADOW = /^(none|(-?\d{1,3}px\s+){2,3}(-?\d{1,3}px\s+)?(#[0-9a-f]{3,8}|rgba?\([\d.\s,%]+\))(\s*,\s*(-?\d{1,3}px\s+){2,3}(-?\d{1,3}px\s+)?(#[0-9a-f]{3,8}|rgba?\([\d.\s,%]+\)))*)$/i
const FONTS = new Set(['Segoe UI', 'Tahoma', 'Verdana', 'Arial', 'Trebuchet MS', 'Georgia', 'Courier New', 'Comic Sans MS', 'Segoe Print', 'Lucida Console', 'system-ui'])
const SAFE_PATH = /^assets\/(frames|buttons|icons|textures|backgrounds|decorations|preview)\/[A-Za-z0-9 _.-]{1,120}\.(png|webp|jpe?g|gif)$/i
const ID = /^[a-z0-9][a-z0-9.-]{2,63}$/

function checkAsset(ref: unknown, where: string, slot: SlotDefinition | undefined, out: Finding[]) {
  if (!ref || typeof ref !== 'object') { out.push({ severity: 'error', message: `${where}: image reference must be an object with a path.`, slot: slot?.id }); return }
  const asset = ref as AssetRef
  for (const key of ['path', 'path2x'] as const) {
    const value = asset[key]
    if (value === undefined && key === 'path2x') continue
    if (typeof value !== 'string' || !SAFE_PATH.test(value) || value.includes('..')) {
      out.push({ severity: 'error', message: `${where}: "${String(value)}" isn't an allowed package image path (PNG, WebP, JPEG or GIF inside assets/).`, slot: slot?.id, path: String(value) })
    }
  }
  if (asset.scale && slot && !slot.scaling.includes(asset.scale)) {
    out.push({ severity: 'error', message: `${where}: "${asset.scale}" scaling isn't supported for ${slot.name}.`, slot: slot.id })
  }
  if (asset.slice !== undefined) {
    if (!Array.isArray(asset.slice) || asset.slice.length !== 4 || asset.slice.some(n => !Number.isInteger(n) || n < 0 || n > 2048)) {
      out.push({ severity: 'error', message: `${where}: nine-slice needs four whole numbers between 0 and 2048.`, slot: slot?.id })
    } else if (asset.scale && asset.scale !== 'nine-slice') {
      out.push({ severity: 'warning', message: `${where}: slice values are ignored unless scaling is nine-slice.`, slot: slot?.id })
    }
  }
}

function checkStyle(style: unknown, where: string, slot: SlotDefinition | undefined, out: Finding[]) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) { out.push({ severity: 'error', message: `${where}: must be an object.`, slot: slot?.id }); return }
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (slot && !slot.properties.includes(key as StyleProperty)) {
      out.push({ severity: 'info', message: `${where}: "${key}" isn't used by ${slot.name} and will be ignored.`, slot: slot.id })
      continue
    }
    if (key === 'backgroundImage' || key === 'icon') { checkAsset(value, `${where}.${key}`, slot, out); continue }
    const text = String(value)
    if (/[<>{};]|url\(|expression|javascript:|@import/i.test(text)) {
      out.push({ severity: 'error', message: `${where}.${key}: contains code or a link, which skins can't include.`, slot: slot?.id })
      continue
    }
    const ok = key === 'background' ? COLOR.test(text) || GRADIENT.test(text)
      : key.endsWith('Color') ? COLOR.test(text)
      : key === 'shadow' || key === 'textShadow' ? SHADOW.test(text)
        : key === 'opacity' ? typeof value === 'number' && value >= 0 && value <= 1
          : key === 'fontFamily' ? FONTS.has(text)
            : key === 'fontWeight' ? /^(400|500|600|700|800|900|normal|bold)$/.test(text)
              : LENGTH.test(text)
    if (!ok) out.push({ severity: 'error', message: `${where}.${key}: "${text}" isn't a valid value.`, slot: slot?.id })
  }
}

export function validateManifest(input: unknown): Finding[] {
  const out: Finding[] = []
  const m = input as Partial<SkinManifest> | null
  if (!m || typeof m !== 'object') return [{ severity: 'error', message: 'manifest.json is missing or not an object.' }]
  if (m.format !== SKIN_FORMAT) out.push({ severity: 'error', message: `This isn't an Elsewhere skin (format must be "${SKIN_FORMAT}").` })
  if (typeof m.id !== 'string' || !ID.test(m.id)) out.push({ severity: 'error', message: 'Skin id must be 3–64 lowercase letters, numbers, dots or dashes.' })
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 60) out.push({ severity: 'error', message: 'Skin name is required (up to 60 characters).' })
  if (typeof m.author !== 'string' || !m.author.trim() || m.author.length > 80) out.push({ severity: 'error', message: 'Author is required (up to 80 characters).' })
  if (typeof m.preview !== 'string' || !SAFE_PATH.test(m.preview)) out.push({ severity: 'error', message: 'Preview must be an image inside assets/preview/.' })
  const compat = compatibility(m.skinMapVersion)
  if (compat === 'newer') out.push({ severity: 'error', message: `This skin needs a newer Elsewhere (SkinMap ${m.skinMapVersion}). Update Elsewhere Messenger to use it.` })
  if (compat === 'invalid') out.push({ severity: 'error', message: 'skinMapVersion is missing or invalid.' })
  if (compat === 'older') out.push({ severity: 'info', message: `Made for SkinMap ${m.skinMapVersion}. New parts use Elsewhere’s defaults.` })
  return out
}

export function validateTheme(input: unknown): Finding[] {
  const out: Finding[] = []
  const t = input as Partial<SkinTheme> | null
  if (!t || typeof t !== 'object') return [{ severity: 'error', message: 'theme.json is missing or not an object.' }]
  checkStyle(t.tokens ?? {}, 'tokens', undefined, out)
  for (const [family, style] of Object.entries(t.windows || {})) checkStyle(style, `windows.${family}`, undefined, out)
  for (const [id, states] of Object.entries(t.slots || {})) {
    const def = SLOT_INDEX[id]
    if (!def) { out.push({ severity: 'warning', message: `Unknown part "${id}" will be ignored (it may be from a newer SkinMap).`, slot: id }); continue }
    for (const [state, style] of Object.entries(states || {})) {
      if (!def.states.includes(state as VisualState)) out.push({ severity: 'warning', message: `${def.name} doesn't have a "${state}" state; it will be ignored.`, slot: id })
      checkStyle(style, `slots.${id}.${state}`, def, out)
    }
  }
  if (t.decorations !== undefined) {
    if (!Array.isArray(t.decorations)) out.push({ severity: 'error', message: 'decorations must be a list.' })
    else {
      if (t.decorations.length > DECORATION_LIMIT) out.push({ severity: 'error', message: `A skin can have up to ${DECORATION_LIMIT} decorations.` })
      t.decorations.forEach((item, index) => {
        const where = `decorations[${index}]`
        if (!item || typeof item !== 'object') { out.push({ severity: 'error', message: `${where} must be an object.` }); return }
        checkAsset(item.asset, `${where}.asset`, undefined, out)
        if (!DECORATION_WINDOWS.includes(item.window)) out.push({ severity: 'error', message: `${where}: window must be buddy-list, conversation or sign-in.` })
        if (!DECORATION_ANCHORS.includes(item.anchor)) out.push({ severity: 'error', message: `${where}: anchor must be a corner.` })
        const num = (value: unknown, low: number, high: number) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
        if (!num(item.x, -400, 2000) || !num(item.y, -400, 2000)) out.push({ severity: 'error', message: `${where}: position must be between -400 and 2000 px.` })
        if (!num(item.width, 4, 800)) out.push({ severity: 'error', message: `${where}: width must be between 4 and 800 px.` })
        if (item.rotation !== undefined && !num(item.rotation, -360, 360)) out.push({ severity: 'error', message: `${where}: rotation must be between -360 and 360.` })
        if (item.opacity !== undefined && !num(item.opacity, 0, 1)) out.push({ severity: 'error', message: `${where}: opacity must be between 0 and 1.` })
      })
    }
  }
  if (t.transcript && t.transcript !== 'classic' && t.transcript !== 'bubble') out.push({ severity: 'error', message: 'transcript must be "classic" or "bubble".' })
  if (t.shell) {
    checkAsset(t.shell.trim, 'shell.trim', SLOT_INDEX['window.trim'], out)
    if (!Array.isArray(t.shell.inset) || t.shell.inset.length !== 4 || t.shell.inset.some(n => !Number.isInteger(n) || n < 0 || n > 400)) {
      out.push({ severity: 'error', message: 'shell.inset needs four whole numbers between 0 and 400 (top, right, bottom, left).' })
    }
  }
  return out
}

/** How a skin's SkinMap version relates to this app's. */
export function compatibility(version: unknown): 'same' | 'older' | 'newer' | 'invalid' {
  if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version)) return 'invalid'
  const [major, minor] = version.split('.').map(Number)
  const [ownMajor, ownMinor] = SKINMAP_VERSION.split('.').map(Number)
  if (major > ownMajor || (major === ownMajor && minor > ownMinor)) return 'newer'
  return major === ownMajor && minor === ownMinor ? 'same' : 'older'
}

// ---------- Inheritance ----------

export type Origin = 'slot' | 'inherited-slot' | 'window' | 'global' | 'default'
/** Effective value of one property for a slot and state, and where it came from. */
export function resolve(theme: SkinTheme, slotId: string, property: StyleProperty, state: VisualState = 'normal', defaults: SlotStyle = {}): { value: unknown; origin: Origin } {
  const def = SLOT_INDEX[slotId]
  const seen = new Set<string>()
  let current: SlotDefinition | undefined = def
  let first = true
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    const states = theme.slots?.[current.id]
    const value = states?.[state]?.[property as keyof SlotStyle] ?? (state !== 'normal' ? states?.normal?.[property as keyof SlotStyle] : undefined)
    if (value !== undefined) return { value, origin: first ? 'slot' : 'inherited-slot' }
    first = false
    current = current.inherits ? SLOT_INDEX[current.inherits] : undefined
  }
  const windowValue = def ? theme.windows?.[def.window]?.[property as keyof SlotStyle] : undefined
  if (windowValue !== undefined) return { value: windowValue, origin: 'window' }
  const globalValue = theme.tokens?.[property as keyof SlotStyle]
  if (globalValue !== undefined) return { value: globalValue, origin: 'global' }
  return { value: defaults[property as keyof SlotStyle], origin: 'default' }
}

/** Removes one override without touching anything else (returns a new theme). */
export function resetProperty(theme: SkinTheme, slotId: string, state: VisualState, property: StyleProperty): SkinTheme {
  const states = theme.slots?.[slotId]
  if (!states?.[state] || !(property in states[state]!)) return theme
  const nextState = { ...states[state] } as Record<string, unknown>
  delete nextState[property]
  const nextStates = { ...states, [state]: nextState as SlotStyle }
  if (!Object.keys(nextState).length) delete nextStates[state]
  const slots = { ...theme.slots, [slotId]: nextStates }
  if (!Object.keys(nextStates).length) delete slots[slotId]
  return { ...theme, slots }
}
