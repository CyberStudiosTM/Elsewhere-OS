import type { SkinTheme } from './schema'
import type { PatternKind } from './patterns'

// Starter skins from the approved stationery direction (docs/skinmapper/SKIN_DIRECTION_STATIONERY.md):
// the six priority picks. Every color in a skin's palette gets real space, not just outlines:
// the main flavor on the title bar, profile and your bubbles; cream on the paper panels;
// chocolate as solid bands (toolbar strip, group ribbons, Send); the accent on candy-dot badges,
// the close button and the toast. Mascot and motif art plugs into the decoration slots once drawn.

export type StarterPattern = { path: string; kind: PatternKind; base: string; ink: string; size?: number }
export type SkinFamily = 'Neapolitan' | 'Mint Choco' | 'Frutiger Evil' | 'Windows 7' | 'Elsewhaero Signature'
export type StarterSkin = { label: string; family: SkinFamily; theme: SkinTheme; patterns: StarterPattern[] }
/** Official collections, in menu order. Every verified skin belongs to one. */
export const SKIN_FAMILIES: { family: SkinFamily; name: string }[] = [
  { family: 'Neapolitan', name: 'Neapolitan Dream' },
  { family: 'Mint Choco', name: 'Mint Choco Diary' },
  { family: 'Frutiger Evil', name: 'Frutiger Evil' },
  { family: 'Windows 7', name: 'Windows 7' },
  { family: 'Elsewhaero Signature', name: 'Elsewhaero Signature' },
]

type Palette = {
  /** Four glossy stops for the title bar, or a pattern path to tile there. */
  title: string; titleImage?: string; titleText: string; titleShadow?: string
  main: string; soft: string; cream: string; choco: string; chocoText: string; accent: string
  font: string; contacts: string; transcript: string
  rowSelected: string; rowHover: string
  buttonRadius: string; buttonBorder: string; buttonBorderWidth: string; bubbleRadius: string; groupRadius: string
  sendHover: string
}

const tile = (path: string) => ({ path, scale: 'tile' as const })

function skin(p: Palette): SkinTheme {
  const slots: SkinTheme['slots'] = {
    'window.frame': { active: { background: p.cream, borderColor: p.choco, borderWidth: '2px', borderRadius: '14px' } },
    'window.titlebar': { active: p.titleImage
      ? { backgroundImage: tile(p.titleImage), textColor: p.titleText, ...(p.titleShadow ? { textShadow: p.titleShadow } : {}) }
      : { background: p.title, textColor: p.titleText, ...(p.titleShadow ? { textShadow: p.titleShadow } : {}) } },
    'window.titlebar.text': { active: { fontWeight: '700' } },
    'window.controls.minimize': { normal: { background: p.soft, borderColor: p.choco, borderRadius: '8px' } },
    'window.controls.close': { normal: { background: p.accent, borderColor: p.choco } },
    'buddy.profile': { normal: { background: p.soft, borderRadius: '12px' } },
    'buddy.profile.avatar': { normal: { borderColor: p.choco, borderWidth: '2px', borderRadius: '12px' } },
    'buddy.profile.name': { normal: { textColor: p.choco, fontWeight: '700' } },
    'buddy.toolbar': { normal: { background: p.choco } },
    'buddy.toolbar.button': { normal: { background: p.cream, borderColor: p.buttonBorder, borderWidth: p.buttonBorderWidth, borderRadius: p.buttonRadius }, hover: { background: p.soft } },
    'buddy.services.button': { normal: { background: p.cream, borderColor: p.choco, textColor: p.choco, borderRadius: p.buttonRadius }, selected: { background: p.choco, textColor: p.chocoText } },
    'buddy.contacts': { normal: { backgroundImage: tile(p.contacts), borderColor: p.choco, borderRadius: '12px' } },
    'buddy.group.heading': { normal: { background: p.choco, textColor: p.chocoText, borderRadius: p.groupRadius } },
    'buddy.contact.row': { normal: { textColor: p.choco }, selected: { background: p.rowSelected }, hover: { background: p.rowHover } },
    'buddy.contact.unread': { normal: { background: p.accent, textColor: '#ffffff', borderRadius: '10px' } },
    'chat.toolbar': { normal: { background: p.soft, borderRadius: '12px' } },
    'chat.transcript': { normal: { backgroundImage: tile(p.transcript), borderColor: p.choco, borderRadius: '12px', textColor: p.choco } },
    'chat.message.own': { normal: { background: p.soft, borderColor: p.choco, borderRadius: p.bubbleRadius, textColor: p.choco } },
    'chat.message.incoming': { normal: { background: p.cream, borderColor: p.choco, borderRadius: p.bubbleRadius, textColor: p.choco } },
    'chat.notice': { normal: { background: p.cream, textColor: p.choco } },
    'chat.composer': { normal: { background: '#ffffff', borderColor: p.choco, borderRadius: '12px', textColor: p.choco } },
    'chat.send': { normal: { background: p.choco, borderColor: p.choco, borderRadius: '12px', textColor: p.chocoText }, hover: { background: p.sendHover, textColor: '#ffffff' } },
    'signin.header': { normal: { background: p.soft, textColor: p.choco } },
    'signin.field': { normal: { background: '#ffffff', borderColor: p.choco, borderRadius: '8px', textColor: p.choco } },
    'signin.button': { normal: { background: p.choco, borderColor: p.choco, borderRadius: '12px', textColor: p.chocoText } },
    'toast.frame': { normal: { background: p.cream, borderColor: p.main, borderRadius: '14px', textColor: p.choco } },
  }
  return { tokens: { fontFamily: p.font, textColor: p.choco }, transcript: 'bubble', slots }
}
// The "soft outline" look from the concept mockups: pastel title bars and headings, chocolate text,
// thick chocolate outlines on every window, button and field, and a soft taupe drop shadow.
type SoftPalette = { title: string; soft: string; paper: string; choco: string; accent: string; font: string; contacts: string; transcript: string }
function softSkin(p: SoftPalette): SkinTheme {
  const outline = { borderColor: p.choco, borderWidth: '3px' }
  const slots: SkinTheme['slots'] = {
    'window.frame': { active: { background: p.paper, ...outline, borderRadius: '16px', shadow: '8px 8px 0px #c9beb9' } },
    'window.titlebar': { active: { background: p.title, textColor: p.choco } },
    'window.controls.minimize': { normal: { background: p.paper, borderColor: p.choco, borderRadius: '6px' } },
    'buddy.profile': { normal: { background: p.soft, borderRadius: '14px' } },
    'buddy.profile.avatar': { normal: { ...outline, borderRadius: '50%' } },
    'buddy.profile.name': { normal: { textColor: p.choco } },
    'buddy.toolbar.button': { normal: { background: p.soft, borderColor: p.choco, borderWidth: '2px', borderRadius: '10px' }, hover: { background: p.title } },
    'buddy.services.button': { normal: { background: p.paper, borderColor: p.choco, textColor: p.choco, borderRadius: '10px' }, selected: { background: p.title, textColor: p.choco } },
    'buddy.contacts': { normal: { backgroundImage: tile(p.contacts), borderColor: p.choco, borderRadius: '12px' } },
    'buddy.group.heading': { normal: { background: p.title, textColor: p.choco, borderRadius: '6px' } },
    'buddy.contact.row': { normal: { textColor: p.choco, mutedTextColor: p.accent }, selected: { background: p.soft }, hover: { background: p.soft } },
    'buddy.contact.unread': { normal: { background: p.choco, textColor: p.paper, borderRadius: '10px' } },
    'chat.toolbar': { normal: { background: p.paper, borderRadius: '12px' } },
    'chat.transcript': { normal: { backgroundImage: tile(p.transcript), borderColor: p.soft, borderRadius: '12px', textColor: p.choco } },
    'chat.message.own': { normal: { background: p.title, borderColor: p.title, borderRadius: '16px', textColor: p.choco } },
    'chat.message.incoming': { normal: { background: p.soft, borderColor: p.soft, borderRadius: '16px', textColor: p.choco } },
    'chat.notice': { normal: { background: p.soft, textColor: p.choco } },
    'chat.composer': { normal: { background: '#ffffff', ...outline, borderRadius: '8px', textColor: p.choco } },
    'chat.send': { normal: { background: p.title, ...outline, borderRadius: '12px', textColor: p.choco }, hover: { background: p.soft, textColor: p.choco } },
    'signin.header': { normal: { background: p.title, textColor: p.choco } },
    'signin.field': { normal: { background: '#ffffff', borderColor: p.choco, borderRadius: '8px', textColor: p.choco } },
    'signin.button': { normal: { background: p.title, borderColor: p.choco, borderRadius: '12px', textColor: p.choco } },
    'toast.frame': { normal: { background: p.paper, borderColor: p.choco, borderRadius: '16px', textColor: p.choco } },
  }
  return { tokens: { fontFamily: p.font, textColor: p.choco }, transcript: 'bubble', slots }
}
const softEntry = (label: string, family: StarterSkin['family'], id: string, p: Omit<SoftPalette, 'contacts' | 'transcript'>,
  contacts: Omit<StarterPattern, 'path'>, transcript: Omit<StarterPattern, 'path'>): [string, StarterSkin] => {
  const c = `assets/textures/${id}-panel.png`, t = `assets/textures/${id}-paper.png`
  return [id, { label, family, patterns: [{ path: c, ...contacts }, { path: t, ...transcript }], theme: softSkin({ ...p, contacts: c, transcript: t }) }]
}

// Frutiger Evil (the approved concepts in "frutiger evil/approved"): dark glass windows, a glowing
// edge, a glossy title bar and one hot accent for Send and badges.
type DarkPalette = {
  glass: [string, string, string, string]; titleText: string; deep: string; panel: string; row: string
  ink: string; muted: string; edge: string; glow: string; heading: string; headingText: string
  send: [string, string, string, string]; sendText: string; close: string; font: string
}
function darkSkin(p: DarkPalette): SkinTheme {
  const glass = gloss(...p.glass), send = gloss(...p.send)
  const field = { background: p.deep, borderColor: p.edge, borderRadius: '6px', textColor: p.ink }
  const slots: SkinTheme['slots'] = {
    'window.frame': { active: { background: p.deep, borderColor: p.edge, borderWidth: '1px', borderRadius: '10px', shadow: `0px 0px 14px ${p.glow}` } },
    'window.titlebar': { normal: { background: glass, textColor: p.titleText, textShadow: '0px 1px 2px #000000' }, active: { background: glass, textColor: p.titleText, textShadow: '0px 1px 2px #000000' } },
    'window.titlebar.text': { normal: { background: 'transparent', textColor: p.titleText } },
    'window.controls.minimize': { normal: { background: glass, borderColor: p.edge, borderRadius: '4px' } },
    'window.controls.close': { normal: { background: p.close, borderColor: p.edge, borderRadius: '4px' } },
    'buddy.profile': { normal: { background: p.panel, borderColor: p.edge, borderRadius: '8px' } },
    'buddy.profile.avatar': { normal: { borderColor: p.edge, borderWidth: '2px', borderRadius: '8px' } },
    'buddy.profile.name': { normal: { background: 'transparent', textColor: p.ink } },
    'buddy.profile.status': { normal: { background: 'transparent', textColor: p.muted } },
    'buddy.services': { normal: { background: p.panel } },
    'buddy.services.button': { normal: { background: p.panel, borderColor: p.edge, textColor: p.ink, borderRadius: '8px' }, selected: { background: p.row, textColor: p.ink } },
    'buddy.toolbar': { normal: { background: p.panel } },
    'buddy.toolbar.button': { normal: { background: p.panel, borderColor: p.panel, borderRadius: '8px' }, hover: { background: p.row } },
    'buddy.contacts': { normal: { background: p.deep, borderColor: p.edge, borderRadius: '8px' } },
    'buddy.group.heading': { normal: { background: p.heading, textColor: p.headingText, borderRadius: '6px' } },
    'buddy.contact.row': { normal: { background: 'transparent', textColor: p.ink, mutedTextColor: p.muted }, selected: { background: p.row }, hover: { background: p.row } },
    'buddy.contact.unread': { normal: { background: p.send[2], textColor: p.sendText, borderRadius: '10px' } },
    'menu.bar': { normal: { background: p.panel, textColor: p.ink } },
    'menu.dropdown': { normal: { background: p.deep, borderColor: p.edge, textColor: p.ink } },
    'menu.item': { normal: { background: 'transparent', textColor: p.ink }, hover: { background: p.row, textColor: p.ink } },
    'chat.toolbar': { normal: { background: p.panel } },
    'chat.transcript': { normal: { background: p.deep, borderColor: p.edge, borderRadius: '8px', textColor: p.ink } },
    'chat.message.own': { normal: { background: p.row, borderColor: p.edge, borderRadius: '10px', textColor: p.ink } },
    'chat.message.incoming': { normal: { background: p.panel, borderColor: p.edge, borderRadius: '10px', textColor: p.ink } },
    'chat.composer': { normal: field },
    'chat.send': { normal: { background: send, borderColor: p.edge, borderRadius: '8px', textColor: p.sendText }, hover: { background: p.send[2], textColor: p.sendText } },
    'signin.field': { normal: field },
    'signin.header': { normal: { background: `linear-gradient(110deg, ${p.deep} 0%, ${p.panel} 55%, ${p.row} 100%)`, textColor: p.titleText, textShadow: `0px 0px 8px ${p.glow}` } },
    'signin.error': { normal: { background: 'transparent', textColor: '#ffb3c1' } },
    'chat.notice': { normal: { background: p.panel, borderColor: p.edge, textColor: p.ink } },
    'dialog.frame': { normal: { background: p.deep, borderColor: p.edge, textColor: p.ink } },
    'dialog.button': { normal: { background: send, borderColor: p.edge, textColor: p.sendText } },
    'nudge.banner': { normal: { background: p.panel, borderColor: p.edge, textColor: p.ink } },
    'signin.button': { normal: { background: send, borderColor: p.edge, borderRadius: '10px', textColor: p.sendText } },
    'toast.frame': { normal: { background: p.deep, borderColor: p.edge, borderRadius: '10px', textColor: p.ink } },
  }
  return { tokens: { fontFamily: p.font, textColor: p.ink }, transcript: 'bubble', slots }
}
// Light glass skins (Windows 7 family and the Elsewhaero Signature Collection): glossy title bars,
// bright panels, dark readable text and one glossy accent for Send and badges.
type GlassPalette = {
  glass: [string, string, string, string]; titleText: string; titleShadow: string; frame: string; panel: string; row: string
  heading: string; headingText: string; ink: string; muted: string; send: [string, string, string, string]; sendText: string; close: string; font: string
}
function glassSkin(p: GlassPalette): SkinTheme {
  const glass = gloss(...p.glass), send = gloss(...p.send)
  const field = { background: '#ffffff', borderColor: p.frame, borderRadius: '4px', textColor: p.ink }
  const slots: SkinTheme['slots'] = {
    'window.frame': { active: { background: p.panel, borderColor: p.frame, borderWidth: '1px', borderRadius: '8px' } },
    'window.titlebar': { normal: { background: glass, textColor: p.titleText, textShadow: p.titleShadow }, active: { background: glass, textColor: p.titleText, textShadow: p.titleShadow } },
    'window.titlebar.text': { normal: { background: 'transparent', textColor: p.titleText } },
    'window.controls.minimize': { normal: { background: glass, borderColor: p.frame, borderRadius: '3px' } },
    'window.controls.close': { normal: { background: p.close, borderColor: p.frame, borderRadius: '3px' } },
    'buddy.profile': { normal: { background: p.row, borderColor: p.frame, borderRadius: '6px' } },
    'buddy.profile.avatar': { normal: { borderColor: p.frame, borderWidth: '2px', borderRadius: '6px' } },
    'buddy.profile.name': { normal: { background: 'transparent', textColor: p.ink } },
    'buddy.profile.status': { normal: { background: 'transparent', textColor: p.muted } },
    'buddy.toolbar': { normal: { background: p.panel } },
    'buddy.toolbar.button': { normal: { background: p.panel, borderColor: p.panel, borderRadius: '6px' }, hover: { background: p.row } },
    'buddy.services': { normal: { background: p.panel } },
    'buddy.services.button': { normal: { background: '#ffffff', borderColor: p.frame, textColor: p.ink, borderRadius: '6px' }, selected: { background: p.heading, textColor: p.headingText } },
    'buddy.contacts': { normal: { background: '#ffffff', borderColor: p.frame, borderRadius: '6px' } },
    'buddy.group.heading': { normal: { background: p.heading, textColor: p.headingText, borderRadius: '4px' } },
    'buddy.contact.row': { normal: { background: 'transparent', textColor: p.ink, mutedTextColor: p.muted }, selected: { background: p.row }, hover: { background: p.row } },
    'buddy.contact.unread': { normal: { background: p.ink, textColor: '#ffffff', borderRadius: '10px' } },
    'menu.bar': { normal: { background: p.panel, textColor: p.ink } },
    'menu.dropdown': { normal: { background: '#ffffff', borderColor: p.frame, textColor: p.ink } },
    'menu.item': { normal: { background: 'transparent', textColor: p.ink }, hover: { background: p.row, textColor: p.ink } },
    'chat.toolbar': { normal: { background: p.panel } },
    'chat.transcript': { normal: { background: '#ffffff', borderColor: p.frame, borderRadius: '6px', textColor: p.ink } },
    'chat.message.own': { normal: { background: p.row, borderColor: p.row, borderRadius: '8px', textColor: p.ink } },
    'chat.message.incoming': { normal: { background: '#ffffff', borderColor: p.row, borderRadius: '8px', textColor: p.ink } },
    'chat.notice': { normal: { background: p.row, borderColor: p.frame, textColor: p.ink } },
    'chat.composer': { normal: field },
    'chat.send': { normal: { background: send, borderColor: p.frame, borderRadius: '6px', textColor: p.sendText }, hover: { background: gloss(p.send[1], p.send[0], p.send[3], p.send[1]), textColor: p.sendText } },
    'signin.field': { normal: field },
    'signin.header': { normal: { background: `linear-gradient(110deg, ${p.row} 0%, ${p.panel} 70%, ${p.row} 100%)`, textColor: p.ink } },
    'signin.error': { normal: { background: 'transparent', textColor: '#b3261e' } },
    'signin.button': { normal: { background: send, borderColor: p.frame, borderRadius: '8px', textColor: p.sendText } },
    'dialog.frame': { normal: { background: p.panel, borderColor: p.frame, textColor: p.ink } },
    'dialog.button': { normal: { background: send, borderColor: p.frame, textColor: p.sendText } },
    'nudge.banner': { normal: { background: p.row, borderColor: p.frame, textColor: p.ink } },
    'toast.frame': { normal: { background: p.panel, borderColor: p.frame, borderRadius: '8px', textColor: p.ink } },
  }
  return { tokens: { fontFamily: p.font, textColor: p.ink }, transcript: 'bubble', slots }
}
const glassEntry = (family: SkinFamily, id: string, label: string, p: GlassPalette): [string, StarterSkin] => [id, { label, family, patterns: [], theme: glassSkin(p) }]
const white = '0px 1px 0px #ffffff', deep = (c: string) => `0px 1px 1px ${c}`

const darkEntry = (id: string, label: string, p: DarkPalette): [string, StarterSkin] => [id, { label, family: 'Frutiger Evil', patterns: [], theme: darkSkin(p) }]

const gloss = (top: string, mid: string, deep: string, bottom: string) => `linear-gradient(to bottom, ${top} 0%, ${mid} 45%, ${deep} 55%, ${bottom} 100%)`
const shadow = (color: string) => `0px 1px 0px ${color}`

export const STARTER_SKINS: Record<string, StarterSkin> = {
  // Strawberry milk, vanilla memo sheets, a chocolate pen and tiny warm-red accents.
  'strawberry-letter-club': { label: 'Strawberry Letter Club', family: 'Neapolitan', patterns: [
    { path: 'assets/textures/strawberry-memo-dots.png', kind: 'polka', base: '#fff3dc', ink: '#f27a9e' },
    { path: 'assets/textures/strawberry-ruled.png', kind: 'ruled', base: '#fffaf0', ink: '#e7b9a0', size: 24 },
  ], theme: skin({
    title: gloss('#ffd1e0', '#ff8fb3', '#f0668f', '#ffb3c9'), titleText: '#ffffff', titleShadow: shadow('#5a3524'),
    main: '#f0668f', soft: '#ffc4d6', cream: '#fff3dc', choco: '#5a3524', chocoText: '#fff3dc', accent: '#d7263d',
    font: 'Trebuchet MS', contacts: 'assets/textures/strawberry-memo-dots.png', transcript: 'assets/textures/strawberry-ruled.png',
    rowSelected: '#ffc4d6', rowHover: '#ffe3ec', buttonRadius: '10px', buttonBorder: '#f0668f', buttonBorderWidth: '2px',
    bubbleRadius: '14px', groupRadius: '10px', sendHover: '#b8304f',
  }) },
  // Dusty strawberry notebook, pale vanilla paper, cocoa ink and caramel-gold washi tape.
  'sweet-ribbon-notebook': { label: 'Sweet Ribbon Notebook', family: 'Neapolitan', patterns: [
    { path: 'assets/textures/ribbon-ruled.png', kind: 'ruled', base: '#fdf3df', ink: '#d98ca0', size: 22 },
    { path: 'assets/textures/ribbon-grid.png', kind: 'grid', base: '#fffaf0', ink: '#d9b27a', size: 20 },
  ], theme: skin({
    title: gloss('#f3c6d1', '#e2a0b2', '#c97890', '#efbfcb'), titleText: '#ffffff', titleShadow: shadow('#6e4a38'),
    main: '#c97890', soft: '#f3c6d1', cream: '#fdf3df', choco: '#6e4a38', chocoText: '#fdf3df', accent: '#8a5a1c',
    font: 'Verdana', contacts: 'assets/textures/ribbon-ruled.png', transcript: 'assets/textures/ribbon-grid.png',
    rowSelected: '#f4dca8', rowHover: '#f9e9c8', buttonRadius: '8px', buttonBorder: '#c9964a', buttonBorderWidth: '2px',
    bubbleRadius: '8px', groupRadius: '4px', sendHover: '#9c4a63',
  }) },
  // Pale strawberry, marshmallow cream, cocoa mocha, red and blush accents: the roundest of the set.
  'marshmallow-bunny-trio': { label: 'Marshmallow Bunny Trio', family: 'Neapolitan', patterns: [
    { path: 'assets/textures/marshmallow-polka.png', kind: 'polka', base: '#fff8ef', ink: '#ffb0c6' },
    { path: 'assets/textures/marshmallow-dots.png', kind: 'memo-dots', base: '#fff6f8', ink: '#c9a28c' },
  ], theme: skin({
    title: gloss('#fff0f4', '#ffcbda', '#ffa9c1', '#ffdfe8'), titleText: '#6b4a3a',
    main: '#ff8fb0', soft: '#ffd2df', cream: '#fff8ef', choco: '#6b4a3a', chocoText: '#fff8ef', accent: '#c22e4a',
    font: 'Comic Sans MS', contacts: 'assets/textures/marshmallow-polka.png', transcript: 'assets/textures/marshmallow-dots.png',
    rowSelected: '#ffd2df', rowHover: '#ffe8ef', buttonRadius: '16px', buttonBorder: '#ff8fb0', buttonBorderWidth: '2px',
    bubbleRadius: '20px', groupRadius: '14px', sendHover: '#a8304c',
  }) },
  // Pastel mint, cream-mint white, milk chocolate (chips in the polka dots) and a tiny aqua.
  'mint-choco-pen-pal': { label: 'Mint Choco Pen Pal', family: 'Mint Choco', patterns: [
    { path: 'assets/textures/mint-polka.png', kind: 'polka', base: '#dff7ec', ink: '#7a5240' },
    { path: 'assets/textures/mint-grid.png', kind: 'grid', base: '#fffaf0', ink: '#a9e3cf', size: 20 },
  ], theme: skin({
    title: gloss('#d4f7ea', '#9fe6cd', '#5cc9a5', '#bdf0de'), titleText: '#5a3a2a', titleShadow: shadow('#e8fbf3'),
    main: '#5cc9a5', soft: '#bdeedc', cream: '#fffaf0', choco: '#5a3a2a', chocoText: '#e3faf1', accent: '#1d7f86',
    font: 'Trebuchet MS', contacts: 'assets/textures/mint-polka.png', transcript: 'assets/textures/mint-grid.png',
    rowSelected: '#bdeedc', rowHover: '#ddf6ec', buttonRadius: '10px', buttonBorder: '#5a3a2a', buttonBorderWidth: '2px',
    bubbleRadius: '14px', groupRadius: '10px', sendHover: '#1d7f86',
  }) },
  // Mint green and cool white checker, thick dark-chocolate sticker outlines, pale teal.
  'mint-checker-sticker-sack': { label: 'Mint Checker Sticker Sack', family: 'Mint Choco', patterns: [
    { path: 'assets/textures/mint-checker.png', kind: 'checker', base: '#ffffff', ink: '#a6ead2', size: 28 },
    { path: 'assets/textures/mint-stripes.png', kind: 'stripes', base: '#f3fffb', ink: '#c6f1ec', size: 24 },
    { path: 'assets/textures/mint-checker-title.png', kind: 'checker', base: '#8fe0c4', ink: '#5fcfa9', size: 16 },
  ], theme: skin({
    title: '', titleImage: 'assets/textures/mint-checker-title.png', titleText: '#3b2418', titleShadow: shadow('#ffffff'),
    main: '#3fbf95', soft: '#a6ead2', cream: '#ffffff', choco: '#3b2418', chocoText: '#c9f5e5', accent: '#167a80',
    font: 'Verdana', contacts: 'assets/textures/mint-checker.png', transcript: 'assets/textures/mint-stripes.png',
    rowSelected: '#8fe0c4', rowHover: '#d2f5e8', buttonRadius: '12px', buttonBorder: '#3b2418', buttonBorderWidth: '3px',
    bubbleRadius: '12px', groupRadius: '12px', sendHover: '#167a80',
  }) },
  // Pale mint, milk white, chocolate and dusty-pink accents: a sleepy cat memo set.
  'mint-chococat-dream': { label: 'Mint Chococat Dream', family: 'Mint Choco', patterns: [
    { path: 'assets/textures/chococat-dots.png', kind: 'memo-dots', base: '#fffdf8', ink: '#e8a5b5' },
    { path: 'assets/textures/chococat-ruled.png', kind: 'ruled', base: '#f3fcf8', ink: '#a9e3cf', size: 24 },
  ], theme: skin({
    title: gloss('#e6faf2', '#bfeedd', '#8fdcc2', '#d4f5e9'), titleText: '#4f3326', titleShadow: shadow('#ffffff'),
    main: '#e8a5b5', soft: '#c9f0e2', cream: '#fffdf8', choco: '#4f3326', chocoText: '#fbe3ea', accent: '#a8455f',
    font: 'Trebuchet MS', contacts: 'assets/textures/chococat-dots.png', transcript: 'assets/textures/chococat-ruled.png',
    rowSelected: '#f6d3dc', rowHover: '#fbe7ec', buttonRadius: '12px', buttonBorder: '#e8a5b5', buttonBorderWidth: '2px',
    bubbleRadius: '16px', groupRadius: '10px', sendHover: '#a8455f',
  }) },
  // Soft outline looks, from the 10 concept mockups (colors sampled from each mockup's color story).
  ...Object.fromEntries([
    softEntry('Strawberry Seal Letter', 'Neapolitan', 'strawberry-seal-letter',
      { title: '#f5b1c1', soft: '#f9dbdc', paper: '#fff4de', choco: '#644039', accent: '#ce6579', font: 'Trebuchet MS' },
      { kind: 'ruled', base: '#fff4de', ink: '#f9dbdc', size: 22 }, { kind: 'ruled', base: '#fffaf0', ink: '#fbe6e2', size: 26 }),
    softEntry('Sleepy Bear Memo Pad', 'Neapolitan', 'sleepy-bear-memo-pad',
      { title: '#dfb6a3', soft: '#f4e2d7', paper: '#fff4e8', choco: '#5a372f', accent: '#c87983', font: 'Trebuchet MS' },
      { kind: 'memo-dots', base: '#fff4e8', ink: '#e7c9cf' }, { kind: 'memo-dots', base: '#fffaf2', ink: '#f1dccf' }),
    softEntry('Parfait Charm Pouch', 'Neapolitan', 'parfait-charm-pouch',
      { title: '#f4b0a9', soft: '#f9d8db', paper: '#fff2d9', choco: '#653d32', accent: '#db6d80', font: 'Trebuchet MS' },
      { kind: 'gingham', base: '#fff2d9', ink: '#f9d8db', size: 20 }, { kind: 'gingham', base: '#fffaf0', ink: '#fbe3e3', size: 24 }),
    softEntry('Washi Ribbon Ruled', 'Neapolitan', 'washi-ribbon-ruled',
      { title: '#e6c6cc', soft: '#efe1dd', paper: '#fbf3e7', choco: '#714e54', accent: '#c780a3', font: 'Verdana' },
      { kind: 'grid', base: '#fbf3e7', ink: '#f0dcdc', size: 18 }, { kind: 'grid', base: '#fff9f5', ink: '#f3e4e2', size: 22 }),
    softEntry('Puffy Bunny Sticker Sheet', 'Neapolitan', 'puffy-bunny-sticker-sheet',
      { title: '#f3c4d5', soft: '#f6dfe7', paper: '#fff7e9', choco: '#5e3e37', accent: '#db8fa9', font: 'Comic Sans MS' },
      { kind: 'polka', base: '#fff7e9', ink: '#f8dbe4' }, { kind: 'polka', base: '#fff0f3', ink: '#fbe3ea' }),
    softEntry('Mint Envelope Seal', 'Mint Choco', 'mint-envelope-seal',
      { title: '#b8e8d9', soft: '#dcefe8', paper: '#f7fff3', choco: '#59473f', accent: '#569e90', font: 'Trebuchet MS' },
      { kind: 'ruled', base: '#f7fff3', ink: '#dcefe8', size: 22 }, { kind: 'ruled', base: '#f9fff6', ink: '#e4f4eb', size: 26 }),
    softEntry('Bunny Clip Planner', 'Mint Choco', 'bunny-clip-planner',
      { title: '#a7d7c9', soft: '#dfefe5', paper: '#f7fff5', choco: '#5e483f', accent: '#6cada3', font: 'Verdana' },
      { kind: 'grid', base: '#f7fff5', ink: '#dfefe5', size: 18 }, { kind: 'grid', base: '#f9fff7', ink: '#e6f2ea', size: 22 }),
    softEntry('Mint Parfait Receipt', 'Mint Choco', 'mint-parfait-receipt',
      { title: '#bae3ce', soft: '#e0eee3', paper: '#fffbef', choco: '#674b3c', accent: '#6cb99e', font: 'Trebuchet MS' },
      { kind: 'gingham', base: '#fffbef', ink: '#e0eee3', size: 20 }, { kind: 'checker', base: '#fffbef', ink: '#f2f6ea', size: 24 }),
    softEntry('Mint Check Sticker Sheet', 'Mint Choco', 'mint-check-sticker-sheet',
      { title: '#93d9bf', soft: '#d7f4e7', paper: '#f9fffa', choco: '#4e403c', accent: '#3b9c90', font: 'Verdana' },
      { kind: 'checker', base: '#f9fffa', ink: '#d7f4e7', size: 24 }, { kind: 'checker', base: '#fbfffc', ink: '#e8fcf3', size: 28 }),
    softEntry('Moonlit Cat Memo', 'Mint Choco', 'moonlit-cat-memo',
      { title: '#bce6dd', soft: '#dfefe9', paper: '#f9fff8', choco: '#574840', accent: '#7cb8b0', font: 'Trebuchet MS' },
      { kind: 'memo-dots', base: '#f9fff8', ink: '#d5f0e3' }, { kind: 'ruled', base: '#f9fff8', ink: '#e6f3ee', size: 24 }),
  ]),
  ...Object.fromEntries([
    // Crimson eclipse over black water: dark violet glass, a red-pink rim glow, a crimson Send.
    darkEntry('eclipse-relay', 'Eclipse Relay', {
      glass: ['#3a3550', '#221f36', '#15132a', '#25203a'], titleText: '#f6eef8', deep: '#0d0c1c', panel: '#17152b', row: '#2c1a35',
      ink: '#f3ecf6', muted: '#b9a9c6', edge: '#7a3a5e', glow: '#c8174a66', heading: '#211d36', headingText: '#f3ecf6',
      send: ['#ff7a9a', '#d8264e', '#a3123a', '#c51d47'], sendText: '#ffffff', close: '#c8173f', font: 'Segoe UI' }),
    // Sunken teal ruins: black-green glass, cyan light, red coral on the close button.
    darkEntry('blackwater', 'Blackwater', {
      glass: ['#2b5c62', '#14393f', '#0a2328', '#123238'], titleText: '#e6fbfb', deep: '#04161a', panel: '#0a2226', row: '#0f3a3f',
      ink: '#e3f7f6', muted: '#93c4c1', edge: '#2a8f8f', glow: '#22d3d066', heading: '#0d2e33', headingText: '#e3f7f6',
      send: ['#5fd9d4', '#1f8f8d', '#0d5f60', '#16807f'], sendText: '#ffffff', close: '#b3122a', font: 'Segoe UI' }),
    // Volcanic sunset: wine-red glass, hot pink rims, lime-yellow group headings.
    darkEntry('infernal-paradise', 'Infernal Paradise', {
      glass: ['#b8235f', '#86133f', '#5a0b2a', '#7a1238'], titleText: '#fff3f6', deep: '#26060f', panel: '#3d0a1c', row: '#5c1030',
      ink: '#fff1f4', muted: '#f4b9c9', edge: '#e2336f', glow: '#ff2f7d66', heading: '#4a0c22', headingText: '#e9ff57',
      send: ['#ff7aa5', '#e0245f', '#a6113f', '#c81b52'], sendText: '#ffffff', close: '#d3123a', font: 'Segoe UI' }),
    // Midnight deep sea: indigo glass, periwinkle glow, jellyfish blue.
    darkEntry('abyssal', 'Abyssal', {
      glass: ['#3b4a99', '#222c6b', '#141b4a', '#1c2560'], titleText: '#eef1ff', deep: '#070b26', panel: '#0f1538', row: '#1b2457',
      ink: '#e6eaff', muted: '#a7b2e6', edge: '#5566c9', glow: '#6d7cff66', heading: '#141c48', headingText: '#e6eaff',
      send: ['#8796ff', '#3c4fd0', '#24339a', '#3243b8'], sendText: '#ffffff', close: '#b3264a', font: 'Segoe UI' }),
  ]),
  ...Object.fromEntries([
    // Windows 7: the classic glossy desktop chrome, re-colored.
    glassEntry('Windows 7', 'luna-blue', 'Luna Blue', { glass: ['#5f9cf0', '#2a63d6', '#0f45bd', '#3a77df'], titleText: '#ffffff', titleShadow: deep('#0a2a78'), frame: '#1f57c8', panel: '#eef5ff', row: '#d6e8ff', heading: '#cfe2ff', headingText: '#0b3a8c', ink: '#0d1f3d', muted: '#4a5f80', send: ['#9fd0ff', '#3a86ee', '#1557c8', '#5c9cf2'], sendText: '#ffffff', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Windows 7', 'aero-glass-blue', 'Aero Glass Blue', { glass: ['#e4f3ff', '#9ccff5', '#5aa2e0', '#b9ddf8'], titleText: '#0b2a4a', titleShadow: white, frame: '#6aa6dc', panel: '#f2f8ff', row: '#dcecfb', heading: '#d6e9fb', headingText: '#0b3a6e', ink: '#0d1f3d', muted: '#4a5f80', send: ['#e3f3ff', '#8cc8f5', '#3a8fd8', '#a9d6f8'], sendText: '#062a4f', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Windows 7', 'forest-green', 'Forest Green', { glass: ['#c6ee9c', '#8fd45a', '#4f9f22', '#9fdc6c'], titleText: '#ffffff', titleShadow: deep('#24520c'), frame: '#4fa12e', panel: '#f4fbee', row: '#dff3cf', heading: '#d6efc2', headingText: '#2d5a12', ink: '#1b2e10', muted: '#4c6640', send: ['#d6f7b5', '#7fcf45', '#3f9a1f', '#9edc6c'], sendText: '#123a03', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Windows 7', 'xp-classic-blue', 'XP Classic Blue', { glass: ['#7fb2f5', '#3a80e8', '#1554c8', '#4a8cec'], titleText: '#ffffff', titleShadow: deep('#0a2a78'), frame: '#1554c8', panel: '#ffffff', row: '#e3eefc', heading: '#d6e5fb', headingText: '#0b3a8c', ink: '#111827', muted: '#4a5f80', send: ['#c7e2ff', '#5c9cf2', '#1f63d8', '#7cb2f6'], sendText: '#ffffff', close: '#e0452f', font: 'Tahoma' }),
    glassEntry('Windows 7', 'silver', 'Silver', { glass: ['#f7f9fc', '#e1e7ef', '#b5c0cf', '#e6ebf2'], titleText: '#1d2b44', titleShadow: white, frame: '#8f9db0', panel: '#f7f9fc', row: '#e6ecf4', heading: '#e1e7ef', headingText: '#1d2b44', ink: '#1a2233', muted: '#56627a', send: ['#dce8f7', '#8fafdb', '#5679b0', '#a6c0e4'], sendText: '#0f2140', close: '#d9553f', font: 'Segoe UI' }),
    // Elsewhaero Signature Collection: the glass, colors and accents of each device skin.
    glassEntry('Elsewhaero Signature', 'prism-pager', 'Prism Pager', { glass: ['#e9f6ff', '#9fd3ff', '#4e9fe8', '#bfe3ff'], titleText: '#0b2a4a', titleShadow: white, frame: '#4e9fe8', panel: '#f4faff', row: '#dcefff', heading: '#cfe8ff', headingText: '#0b3a6e', ink: '#0b2a4a', muted: '#3f5f80', send: ['#e9ffc9', '#a6e85a', '#62b81f', '#b8ef7d'], sendText: '#173d05', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Elsewhaero Signature', 'orbit-relay', 'Orbit Relay', { glass: ['#e6f4ff', '#8cc8f5', '#3d8fdc', '#b5dcfb'], titleText: '#0b2a4a', titleShadow: white, frame: '#3d8fdc', panel: '#f3f9ff', row: '#ddeefc', heading: '#e3f8d8', headingText: '#1f5212', ink: '#0b2a4a', muted: '#3f5f80', send: ['#ecffd9', '#8fe060', '#46b01f', '#ade98a'], sendText: '#123a03', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Elsewhaero Signature', 'bubbleline', 'Bubbleline', { glass: ['#effcff', '#a8ecff', '#4fc8ef', '#c5f3ff'], titleText: '#033a4f', titleShadow: white, frame: '#5bc6ea', panel: '#f2fdff', row: '#d9f6ff', heading: '#d2f5ff', headingText: '#03445c', ink: '#06303f', muted: '#3d6170', send: ['#e0fbff', '#7fdcf5', '#2ab0dd', '#9be6f8'], sendText: '#033a4f', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Elsewhaero Signature', 'signal-switchboard', 'Signal Switchboard', { glass: ['#f7f9fb', '#d5dbe3', '#a9b4c2', '#dde3ea'], titleText: '#1d2b44', titleShadow: white, frame: '#8d99aa', panel: '#f5f7fa', row: '#e4e9ef', heading: '#1f3a22', headingText: '#8bff7a', ink: '#1a2233', muted: '#56627a', send: ['#d9ffd2', '#62e04f', '#2a9e1c', '#8be879'], sendText: '#0c3306', close: '#e0532f', font: 'Lucida Console' }),
    glassEntry('Elsewhaero Signature', 'candycall', 'CandyCall', { glass: ['#fff0f8', '#ffb3dc', '#ff6fbf', '#ffc9e6'], titleText: '#5a0f3a', titleShadow: white, frame: '#ff6fbf', panel: '#fff7fb', row: '#ffe3f2', heading: '#ffd9ee', headingText: '#7a1450', ink: '#3d0b27', muted: '#7a4762', send: ['#ffe0f1', '#ff8fcf', '#e8459f', '#ffadd9'], sendText: '#4a0a2e', close: '#e0452f', font: 'Trebuchet MS' }),
    glassEntry('Elsewhaero Signature', 'chromapop', 'ChromaPop', { glass: ['#f6edff', '#d3a8ff', '#a86cf0', '#e2c4ff'], titleText: '#2e0a55', titleShadow: white, frame: '#a86cf0', panel: '#fdfaff', row: '#efe3ff', heading: '#ffe9a8', headingText: '#5a3a00', ink: '#24103d', muted: '#5f4a7a', send: ['#fff6c2', '#ffd84a', '#f0a800', '#ffe27a'], sendText: '#3d2a00', close: '#e0452f', font: 'Trebuchet MS' }),
    glassEntry('Elsewhaero Signature', 'pixelpulse', 'PixelPulse', { glass: ['#f4f7f6', '#d8e2df', '#b3c4bf', '#e1e9e6'], titleText: '#16302a', titleShadow: white, frame: '#93a8a2', panel: '#f7faf9', row: '#e3ece9', heading: '#1f3a22', headingText: '#8bff7a', ink: '#16302a', muted: '#4f6a62', send: ['#d9ffd2', '#62e04f', '#2a9e1c', '#8be879'], sendText: '#0c3306', close: '#e0452f', font: 'Lucida Console' }),
    glassEntry('Elsewhaero Signature', 'halolink', 'HaloLink', { glass: ['#f2f7fc', '#c4d8ef', '#8fb0d6', '#d3e3f4'], titleText: '#0e2747', titleShadow: white, frame: '#7f9fc6', panel: '#f6f9fd', row: '#e1ebf7', heading: '#dcf0cf', headingText: '#24511a', ink: '#0e2747', muted: '#4a5f80', send: ['#ecffd9', '#9be65e', '#55b324', '#b6ef85'], sendText: '#173d05', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Elsewhaero Signature', 'butterfly-dock', 'Butterfly Dock', { glass: ['#ecfffa', '#a9eedd', '#4fc7aa', '#c2f3e6'], titleText: '#063b30', titleShadow: white, frame: '#4fc7aa', panel: '#f3fffc', row: '#dbf6ee', heading: '#c9ecff', headingText: '#063f5c', ink: '#063b30', muted: '#3e6a5f', send: ['#e3f3ff', '#8cc8f5', '#2f86d6', '#a9d6f8'], sendText: '#062a4f', close: '#e0452f', font: 'Segoe UI' }),
    glassEntry('Elsewhaero Signature', 'dreambeacon', 'DreamBeacon', { glass: ['#6d86f0', '#3654d8', '#1d34a8', '#3a56cc'], titleText: '#ffffff', titleShadow: deep('#0c1a5c'), frame: '#24409e', panel: '#f3f6ff', row: '#dfe6ff', heading: '#1f3a9a', headingText: '#ffe7a3', ink: '#0f1a45', muted: '#4a5788', send: ['#fff4c9', '#ffd66b', '#e0a816', '#ffe08f'], sendText: '#3d2a00', close: '#e0452f', font: 'Segoe UI' }),
  ]),
}
