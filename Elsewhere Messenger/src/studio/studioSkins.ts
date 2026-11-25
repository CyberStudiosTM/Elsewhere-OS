// Studio skins: collections → variants → tokens. Studio.css reads only the CSS custom properties
// listed in TOKENS (Classic values are its defaults), and each variant overrides some of them.
// Skins change the workspace only: never the canvas, layers, project data or exported image.

/** Every custom property a skin may set. The `--st-*` ones are the skin tokens; the rest are the base palette. */
export const TOKENS = [
  '--sky', '--sky-deep', '--sky-pale', '--pearl', '--ink', '--soft', '--line', '--berry',
  '--st-bg', '--st-title-bg', '--st-title-edge', '--st-title-ink', '--st-title-shadow',
  '--st-menubar-bg', '--st-menubar-line', '--st-menu-ink', '--st-menu-hover-bg', '--st-menu-hover-ink',
  '--st-dropdown-bg', '--st-dropdown-ink', '--st-dropdown-line',
  '--st-button-bg', '--st-button-ink', '--st-button-line', '--st-button-line-width', '--st-primary-bg', '--st-primary-line',
  '--st-toolbox-bg', '--st-toolbox-ink', '--st-canvas-bg', '--st-desk-bg', '--st-desk-ink',
  '--st-tab-bg', '--st-tab-ink', '--st-tab-active-bg', '--st-tab-active-ink', '--st-tab-active-edge',
  '--st-section-bg', '--st-section-ink', '--st-heading-ink', '--st-heading-bg', '--st-heading-display', '--st-heading-pad', '--st-heading-radius',
  '--st-tile-bg', '--st-tile-ink', '--st-tile-line', '--st-tile-line-width', '--st-tile-hover-bg', '--st-tile-hover-line',
  '--st-chip-bg', '--st-chip-ink', '--st-chip-line', '--st-chip-line-width', '--st-drawer-bg',
  '--st-modal-bg', '--st-modal-ink', '--st-modal-line', '--st-modal-heading', '--st-link',
  '--st-list-active-line', '--st-list-active-shadow', '--st-primary-ink', '--st-primary-shadow',
  '--st-trim', '--st-trim-h', '--st-trim-base', '--st-toolbox-edge', '--st-toolbox-edge-w', '--st-drawer-trim', '--st-drawer-trim-h',
] as const
export type Token = typeof TOKENS[number]
export type Tokens = Partial<Record<Token, string>>

/**
 * Mascot / motif art spots. They sit in safe places only (never over the canvas) and let clicks through:
 *   title   – in the title bar, next to the title (shown 28px tall)
 *   toolbox – under the tools at the bottom of the toolbox (up to 72px wide)
 *   drawer  – at the right end of the bottom drawer (up to 88px tall)
 * Art files live in public/studio-skins/ as transparent PNGs drawn at 2× size. A spot stays empty until its file exists.
 */
export type MotifSlot = 'title' | 'toolbox' | 'drawer'
export type Motif = { slot: MotifSlot; file: string; label: string }
export const MOTIF_SLOTS: Record<MotifSlot, { cssHeight: number; cssMaxWidth: number; artSize: string }> = {
  title: { cssHeight: 28, cssMaxWidth: 96, artSize: 'up to 192×56 px' },
  toolbox: { cssHeight: 72, cssMaxWidth: 72, artSize: '144×144 px' },
  drawer: { cssHeight: 88, cssMaxWidth: 140, artSize: 'up to 280×176 px' },
}
/** File names are checked by tests to be plain (letters, digits, dashes, @2x.png), so they're used as-is. */
export const motifUrl = (file: string) => '/studio-skins/' + file

/** A little sticker set shown in the drawer's skin tab (emoji stickers until real sticker packs exist). */
export type DrawerSet = { label: string; glyphs: string[] }
export type StudioSkin = { id: string; name: string; about: string; swatch: [string, string, string]; tokens: Tokens; motifs?: Motif[]; set?: DrawerSet }
export type SkinCollection = { id: string; name: string; skins: StudioSkin[]; set?: DrawerSet }

/** The shared shape of the original single-palette looks (one panel color, one ink, one button style). */
type FlatLook = {
  palette: Pick<Tokens, '--sky' | '--sky-deep' | '--sky-pale' | '--pearl' | '--ink' | '--soft' | '--line' | '--berry'>
  bg: string; title: string; titleEdge: string; bar: string; ink: string; panel: string; canvas: string
  button: string; buttonInk: string; buttonLine: string; primary: string; primaryLine: string
  modal: string; modalInk: string; modalLine: string; heading: string
}
function flat(l: FlatLook): Tokens {
  return {
    ...l.palette, '--st-bg': l.bg, '--st-title-bg': l.title, '--st-title-edge': `1px solid ${l.titleEdge}`,
    '--st-menubar-bg': l.bar, '--st-tab-bg': l.bar, '--st-drawer-bg': l.bar, '--st-menu-ink': l.ink, '--st-tab-ink': l.ink,
    '--st-toolbox-bg': l.panel, '--st-desk-bg': l.panel, '--st-tab-active-bg': l.panel, '--st-section-bg': l.panel, '--st-tile-bg': l.panel, '--st-chip-bg': l.panel,
    '--st-toolbox-ink': l.ink, '--st-desk-ink': l.ink, '--st-tab-active-ink': l.ink, '--st-section-ink': l.ink, '--st-tile-ink': l.ink, '--st-chip-ink': l.ink,
    '--st-tile-hover-bg': l.panel, '--st-canvas-bg': l.canvas,
    '--st-button-bg': l.button, '--st-button-ink': l.buttonInk, '--st-button-line': l.buttonLine, '--st-list-active-line': l.buttonLine,
    '--st-primary-bg': l.primary, '--st-primary-line': l.primaryLine,
    '--st-modal-bg': l.modal, '--st-modal-ink': l.modalInk, '--st-modal-line': l.modalLine,
    '--st-dropdown-bg': l.modal, '--st-dropdown-ink': l.modalInk, '--st-dropdown-line': l.modalLine,
    '--st-heading-ink': l.heading, '--st-link': l.heading, '--st-modal-heading': l.heading,
  }
}
// ---------- Code-drawn textures (vector-sharp at any DPI, no image files) ----------
// Full backgrounds end with a base color; trims are transparent strips drawn over a bar.
const gingham = (ink: string, base: string, size = 14) =>
  `repeating-linear-gradient(0deg, ${ink} 0 ${size}px, transparent ${size}px ${size * 2}px), repeating-linear-gradient(90deg, ${ink} 0 ${size}px, transparent ${size}px ${size * 2}px) ${base}`
const grid = (ink: string, base: string, size = 18) =>
  `linear-gradient(${ink} 1px, transparent 1px) 0 0 / ${size}px ${size}px, linear-gradient(90deg, ${ink} 1px, transparent 1px) 0 0 / ${size}px ${size}px ${base}`
const ruled = (ink: string, base: string, gap = 22) => `repeating-linear-gradient(180deg, transparent 0 ${gap - 1}px, ${ink} ${gap - 1}px ${gap}px) ${base}`
const dots = (ink: string, base: string, size = 18) => `radial-gradient(${ink} 2px, transparent 2.5px) 0 0 / ${size}px ${size}px ${base}`
const lattice = (ink: string, base: string) =>
  `repeating-linear-gradient(45deg, ${ink} 0 2px, transparent 2px 14px), repeating-linear-gradient(-45deg, ${ink} 0 2px, transparent 2px 14px) ${base}`
const drips = (choco: string) =>
  `radial-gradient(ellipse 5px 9px at 50% 0, ${choco} 96%, transparent 100%) 0 0 / 22px 100% repeat-x, radial-gradient(ellipse 4px 5px at 50% 0, ${choco} 96%, transparent 100%) 11px 0 / 22px 100% repeat-x, linear-gradient(${choco}, ${choco}) 0 0 / 100% 4px no-repeat`
const lace = (lace: string, hole: string) =>
  `radial-gradient(circle at 8px 2px, ${hole} 1.3px, transparent 1.9px) 0 0 / 16px 100% repeat-x, radial-gradient(circle at 8px 0, ${lace} 6px, transparent 6.6px) 0 0 / 16px 100% repeat-x`
const whipped = (cream: string, choco: string) =>
  `radial-gradient(circle at 9px 0, ${cream} 7px, transparent 7.6px) 0 0 / 18px 8px repeat-x, ${drips(choco).replace(/ 0 0 \/ 22px 100%/, ' 0 4px / 22px 100%').replace(/ 11px 0 \/ 22px 100%/, ' 11px 4px / 22px 100%')}`
const stitch = (ink: string) => `repeating-linear-gradient(90deg, ${ink} 0 7px, transparent 7px 12px) 0 50% / 100% 2px no-repeat`
const washi = (a: string, b: string) => `repeating-linear-gradient(135deg, ${a} 0 8px, ${b} 8px 16px)`
const spiral = (ring: string) =>
  `radial-gradient(circle at 50% 50%, transparent 2.6px, ${ring} 2.8px 4.2px, transparent 4.6px) 0 4px / 100% 16px repeat-y, linear-gradient(90deg, rgba(0,0,0,.06), transparent)`
const airmail = () => 'repeating-linear-gradient(135deg, #e46f73 0 10px, #fffaf6 10px 16px, #6f9bd8 16px 26px, #fffaf6 26px 32px)'
const bubbles = (sky: string, deep: string) =>
  `radial-gradient(circle, transparent 5px, rgba(255,255,255,.75) 5.5px 6.6px, transparent 7.2px) 0 0 / 46px 46px, radial-gradient(circle, rgba(255,255,255,.7) 2px, transparent 2.6px) 23px 30px / 46px 46px, linear-gradient(180deg, ${sky}, ${deep})`
const rain = (top: string, bottom: string) =>
  `repeating-linear-gradient(100deg, transparent 0 22px, rgba(255,255,255,.38) 22px 23px), linear-gradient(180deg, ${top}, ${bottom})`
const pixelChecker = (a: string, b: string, size = 8) => `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0 / ${size}px ${size}px`
const drops = (c: string) =>
  `radial-gradient(ellipse 2.5px 4.5px at 50% 60%, ${c} 96%, transparent 100%) 0 0 / 20px 100% repeat-x, radial-gradient(ellipse 2px 3.5px at 50% 40%, ${c} 96%, transparent 100%) 10px 0 / 20px 100% repeat-x`
const starString = (star: string, cord: string) =>
  `radial-gradient(circle at 12px 7px, ${star} 2.6px, transparent 3.2px) 0 0 / 38px 100% repeat-x, radial-gradient(circle at 31px 9px, ${star} 1.6px, transparent 2.2px) 0 0 / 38px 100% repeat-x, linear-gradient(${cord}, ${cord}) 0 3px / 100% 1px no-repeat`

/**
 * A Neapolitan / Mint Choco stationery variant. One shared recipe; each variant changes its chrome,
 * textures and trims. Panels stay light and readable; the canvas surround carries the strongest pattern.
 */
type Stationery = {
  main: string; soft: string; cream: string; choco: string; ink: string; softInk: string; line: string; accent: string
  title: string; titleInk: string; chocoBar?: boolean; barBg?: string; barInk?: string
  canvas: string; desk: string; toolbox: string; drawer?: string; primary: string; primaryInk?: string
  trim?: [string, number]; trimBase?: string; toolboxEdge?: [string, number]; drawerTrim?: [string, number]
}
function stationery(v: Stationery): Tokens {
  const barBg = v.barBg ?? (v.chocoBar ? v.choco : v.cream)
  const barInk = v.barInk ?? (v.chocoBar ? v.cream : v.ink)
  return {
    '--sky': v.main, '--sky-deep': v.choco, '--sky-pale': v.soft, '--pearl': v.cream, '--ink': v.ink, '--soft': v.softInk, '--line': v.line, '--berry': v.accent,
    '--st-bg': v.cream, '--st-title-bg': v.title, '--st-title-ink': v.titleInk,
    '--st-title-shadow': v.titleInk === v.ink ? '0 1px 0 rgba(255,255,255,.55)' : `0 1px 0 ${v.choco}`, '--st-title-edge': `2px solid ${v.choco}`,
    '--st-menubar-bg': barBg, '--st-menubar-line': v.choco, '--st-menu-ink': barInk, '--st-menu-hover-bg': v.soft, '--st-menu-hover-ink': v.ink,
    '--st-dropdown-bg': v.cream, '--st-dropdown-ink': v.ink, '--st-dropdown-line': v.choco,
    '--st-button-bg': `linear-gradient(${v.cream}, ${v.soft})`, '--st-button-ink': v.ink, '--st-button-line': v.choco, '--st-button-line-width': '2px',
    '--st-primary-bg': v.primary, '--st-primary-line': v.choco, '--st-primary-ink': v.primaryInk ?? v.ink, '--st-primary-shadow': v.primaryInk && v.primaryInk !== v.ink ? `0 1px 0 ${v.choco}` : '0 1px 0 rgba(255,255,255,.5)',
    '--st-toolbox-bg': v.toolbox, '--st-toolbox-ink': v.ink, '--st-canvas-bg': v.canvas, '--st-desk-bg': v.desk, '--st-desk-ink': v.ink,
    '--st-tab-bg': v.soft, '--st-tab-ink': v.ink, '--st-tab-active-bg': v.cream, '--st-tab-active-ink': v.ink, '--st-tab-active-edge': `3px solid ${v.choco}`,
    '--st-section-bg': v.cream, '--st-section-ink': v.ink,
    '--st-heading-bg': v.choco, '--st-heading-ink': v.cream, '--st-heading-display': 'inline-block', '--st-heading-pad': '2px 10px', '--st-heading-radius': '4px 10px 10px 4px',
    '--st-tile-bg': v.cream, '--st-tile-ink': v.ink, '--st-tile-line': v.main, '--st-tile-line-width': '2px', '--st-tile-hover-bg': v.soft, '--st-tile-hover-line': v.choco,
    '--st-chip-bg': v.cream, '--st-chip-ink': v.ink, '--st-chip-line': v.main, '--st-chip-line-width': '2px',
    '--st-drawer-bg': v.drawer ?? v.cream,
    '--st-modal-bg': v.cream, '--st-modal-ink': v.ink, '--st-modal-line': v.choco, '--st-modal-heading': v.ink, '--st-link': v.ink,
    '--st-list-active-line': v.accent, '--st-list-active-shadow': `0 0 0 2px ${v.accent}`,
    ...(v.trim ? { '--st-trim': v.trim[0], '--st-trim-h': `${v.trim[1]}px`, '--st-trim-base': v.trimBase ?? v.soft } : {}),
    ...(v.toolboxEdge ? { '--st-toolbox-edge': v.toolboxEdge[0], '--st-toolbox-edge-w': `${v.toolboxEdge[1]}px` } : {}),
    ...(v.drawerTrim ? { '--st-drawer-trim': v.drawerTrim[0], '--st-drawer-trim-h': `${v.drawerTrim[1]}px` } : {}),
  }
}
const gloss = (top: string, mid: string, deep: string, bottom: string) => `linear-gradient(180deg, ${top} 0%, ${mid} 45%, ${deep} 55%, ${bottom} 100%)`

// Collection palettes from the brief: Neapolitan strawberry #E8A5BA · vanilla #FFF1D8 · chocolate #87614D;
// Mint Choco mint #B5DDD0 · cream #F8F3DF · cocoa #755447. Text inks are a deeper cocoa so every label reads clearly.
const NEA = { main: '#e8a5ba', soft: '#fbd9e3', cream: '#fff6ea', choco: '#87614d', ink: '#5a3a2e', softInk: '#7a5546', line: '#f0cfd8', accent: '#d6516b' }
const MINT = { main: '#b5ddd0', soft: '#d7efe6', cream: '#fbf8ec', choco: '#755447', ink: '#4a3329', softInk: '#6a5146', line: '#c9e6db', accent: '#2f8577' }

export const COLLECTIONS: SkinCollection[] = [
  { id: 'classic-family', name: 'Classic & friends', skins: [
    { id: 'classic', name: 'Classic', about: 'Elsewhere Messenger’s own blues. The default.', swatch: ['#095bd0', '#f5f9ff', '#88baf6'], tokens: {} },
    { id: 'cloudscape', name: 'Cloudscape', about: 'Sky blue, pearl white, glossy Elsewhaero.', swatch: ['#5fb3ec', '#f8fbff', '#b4d4ee'], tokens: flat({
      palette: { '--sky': '#5fb3ec', '--sky-deep': '#2f86cf', '--sky-pale': '#e6f3fd', '--pearl': '#f8fbff', '--ink': '#173b5c', '--soft': '#567691', '--line': '#b4d4ee', '--berry': '#e8578a' },
      bg: 'linear-gradient(180deg,#dff0fd,#f4f9ff 40%,#eaf4fd)', title: 'linear-gradient(180deg,#a9dcff 0%,#5fb3ec 48%,#2f86cf 52%,#6cc0f2 100%)', titleEdge: '#2f86cf',
      bar: '#e6f3fd', ink: '#173b5c', panel: '#f8fbff', canvas: '#e6f3fd',
      button: 'linear-gradient(180deg,#fff 0%,#e8f4fe 50%,#d3eafb 51%,#ecf7ff 100%)', buttonInk: '#173b5c', buttonLine: '#b4d4ee',
      primary: 'linear-gradient(180deg,#bfe6ff 0%,#5fb3ec 50%,#2f86cf 51%,#5bb4ee 100%)', primaryLine: '#2f86cf',
      modal: '#f8fbff', modalInk: '#173b5c', modalLine: '#2f86cf', heading: '#2f86cf' }) },
    { id: 'love-exe', name: 'Love.exe', about: 'Hot-pink purikura chrome and hearts.', swatch: ['#ff4fa3', '#fff5fa', '#ffb3d6'], tokens: flat({
      palette: { '--sky': '#ff4fa3', '--sky-deep': '#d61f7a', '--sky-pale': '#ffe3f1', '--pearl': '#fff5fa', '--ink': '#5a1238', '--soft': '#9a4a70', '--line': '#ffb3d6', '--berry': '#ff2e93' },
      bg: 'linear-gradient(180deg,#ffd6ea,#fff0f7 45%,#ffe0ef)', title: 'linear-gradient(180deg,#ffb3d9 0%,#ff4fa3 45%,#d61f7a 55%,#ff7dbc 100%)', titleEdge: '#d61f7a',
      bar: '#ffe3f1', ink: '#5a1238', panel: '#fff5fa', canvas: '#ffe3f1',
      button: 'linear-gradient(#fff,#ffe0f0)', buttonInk: '#a3175d', buttonLine: '#ffb3d6',
      primary: 'linear-gradient(#ffb3d9,#ff4fa3 50%,#d61f7a 51%,#ff6fb5)', primaryLine: '#d61f7a',
      modal: '#fff5fa', modalInk: '#5a1238', modalLine: '#d61f7a', heading: '#d61f7a' }) },
    { id: 'sugar-archive', name: 'Sugar Archive', about: 'Warm cream, brown ink, dusty-pink lace.', swatch: ['#b47c78', '#fbf3e4', '#e6cfc0'], tokens: flat({
      palette: { '--sky': '#d9a3a8', '--sky-deep': '#9c6b55', '--sky-pale': '#f6e7e4', '--pearl': '#fbf3e4', '--ink': '#5b3a29', '--soft': '#8a6a58', '--line': '#e6cfc0', '--berry': '#b47c78' },
      bg: 'linear-gradient(180deg,#f6ead6,#fbf3e4 45%,#f1e2cc)', title: 'linear-gradient(180deg,#e8c9c4 0%,#d9a3a8 45%,#b47c78 55%,#dcb3ad 100%)', titleEdge: '#9c6b55',
      bar: '#f6e7e4', ink: '#5b3a29', panel: '#fbf3e4', canvas: '#f6e7e4',
      button: 'linear-gradient(#fffaf2,#f3e2d3)', buttonInk: '#5b3a29', buttonLine: '#e6cfc0',
      primary: 'linear-gradient(#e8c9c4,#b47c78)', primaryLine: '#9c6b55',
      modal: '#fbf3e4', modalInk: '#5b3a29', modalLine: '#9c6b55', heading: '#9c6b55' }) },
    { id: 'nightbyte', name: 'Nightbyte', about: 'Dark violet, silver chrome, cyber-kawaii nights.', swatch: ['#3a2d63', '#1f1836', '#9b7bff'], tokens: flat({
      palette: { '--sky': '#9b7bff', '--sky-deep': '#c9c9d9', '--sky-pale': '#261d40', '--pearl': '#1f1836', '--ink': '#ece8ff', '--soft': '#b2a8d6', '--line': '#4a3d73', '--berry': '#c9c9d9' },
      bg: 'linear-gradient(180deg,#151026,#1c1530 50%,#120d20)', title: 'linear-gradient(180deg,#5b4a8f 0%,#3a2d63 45%,#231a40 55%,#4a3b78 100%)', titleEdge: '#c9c9d9',
      bar: '#261d40', ink: '#ece8ff', panel: '#1f1836', canvas: '#261d40',
      button: 'linear-gradient(#352a5c,#261d40)', buttonInk: '#ece8ff', buttonLine: '#4a3d73',
      primary: 'linear-gradient(#b9a2ff,#7b5cf0 50%,#5a3fd1 51%,#8f74ff)', primaryLine: '#c9c9d9',
      modal: '#1f1836', modalInk: '#ece8ff', modalLine: '#c9c9d9', heading: '#9b7bff' }) },
    { id: 'pixel-angel', name: 'Pixel Angel', about: 'Pearl white, lavender, crisp pixel stars.', swatch: ['#8a6fd1', '#fdfbff', '#e2d8fb'], tokens: flat({
      palette: { '--sky': '#c9b6f2', '--sky-deep': '#8a6fd1', '--sky-pale': '#f3eeff', '--pearl': '#fdfbff', '--ink': '#3d2f66', '--soft': '#6e5f99', '--line': '#e2d8fb', '--berry': '#ff9ad5' },
      bg: 'linear-gradient(180deg,#f1ecff,#fdfbff 45%,#ece4ff)', title: 'linear-gradient(180deg,#e7dcff 0%,#c9b6f2 45%,#8a6fd1 55%,#d3c4f7 100%)', titleEdge: '#8a6fd1',
      bar: '#f3eeff', ink: '#3d2f66', panel: '#fdfbff', canvas: '#f3eeff',
      button: 'linear-gradient(#fff,#efe8ff)', buttonInk: '#5b46a3', buttonLine: '#e2d8fb',
      primary: 'linear-gradient(#e7dcff,#a58be6 50%,#8a6fd1 51%,#b49cf0)', primaryLine: '#8a6fd1',
      modal: '#fdfbff', modalInk: '#3d2f66', modalLine: '#8a6fd1', heading: '#8a6fd1' }) },
  ] },
  { id: 'neapolitan-dream', name: 'Neapolitan Dream', set: { label: '🍓 Neapolitan set', glyphs: ['🍓', '🍰', '🎀', '🐰', '🐱', '🧁', '🍫', '💗', '💌', '🌸', '🍦', '🍒'] }, skins: [
    { id: 'neapolitan-01-strawberry-bunny-notebook', name: 'Strawberry Bunny Notebook', about: 'Pink gingham, ring-bound memo paper, bows and hearts.', swatch: ['#e8a5ba', '#fff6ea', '#87614d'], motifs: [{ slot: 'title', file: 'neapolitan-01-bow-hearts@2x.png', label: 'Bow with little hearts' }, { slot: 'toolbox', file: 'neapolitan-01-bunny@2x.png', label: 'Bunny with a bow' }, { slot: 'drawer', file: 'neapolitan-01-strawberry-cake@2x.png', label: 'Strawberry cake slice and pocky' }],
      tokens: stationery({ ...NEA,
      title: gloss('#fde4ec', '#f6bfd0', '#eaa9bd', '#f9cfdb'), titleInk: NEA.ink,
      canvas: gingham('rgba(232,165,186,.32)', '#fff3f5'), desk: ruled('#f3c9d5', '#fffaf3'), toolbox: NEA.soft, drawer: dots('#f6c3d1', NEA.cream),
      primary: gloss('#fde4ec', '#f2b3c6', '#e8a5ba', '#f7c6d4'),
      trim: [stitch('#e8a5ba'), 6], trimBase: NEA.cream, toolboxEdge: [spiral('#b39a90'), 14] }) },
    { id: 'neapolitan-02-chocolate-cat-parfait', name: 'Chocolate Cat Parfait', about: 'Cocoa-drip chrome and chocolate lattice with strawberry pink.', swatch: ['#87614d', '#fbd9e3', '#e8a5ba'], motifs: [{ slot: 'title', file: 'neapolitan-02-bow@2x.png', label: 'Pink bow' }, { slot: 'toolbox', file: 'neapolitan-02-cat-peek@2x.png', label: 'Calico cat peeking' }, { slot: 'drawer', file: 'neapolitan-02-chocolate-squares@2x.png', label: 'Chocolate bar squares and a heart stamp' }],
      tokens: stationery({ ...NEA,
      title: gloss('#a87766', '#8b6350', '#6e4c3c', '#94695a'), titleInk: NEA.cream, chocoBar: true,
      canvas: lattice('rgba(135,97,77,.22)', '#fde4ea'), desk: grid('#f3d3db', '#fffaf3'), toolbox: NEA.soft,
      primary: gloss('#fde4ec', '#f2b3c6', '#e8a5ba', '#f7c6d4'),
      trim: [drips('#87614d'), 12] }) },
    { id: 'neapolitan-03-lace-bunny-bakery', name: 'Lace Bunny Bakery', about: 'Ornate lace, embroidery, bunnies and strawberries in soft pink.', swatch: ['#f6cbd8', '#fff6ea', '#e8a5ba'], motifs: [{ slot: 'title', file: 'neapolitan-03-bow-strawberry@2x.png', label: 'Pink bow and strawberry' }, { slot: 'toolbox', file: 'neapolitan-03-bunny-strawberry@2x.png', label: 'Bunny holding a strawberry' }, { slot: 'drawer', file: 'neapolitan-03-flowers@2x.png', label: 'Little pink flowers' }],
      tokens: stationery({ ...NEA,
      title: gloss('#fff4f7', '#fbdde6', '#f6cbd8', '#fde6ed'), titleInk: NEA.ink, barBg: '#fbe0e8',
      canvas: lattice('rgba(232,165,186,.28)', '#fdeaf0'), desk: dots('#f7d6df', '#fffaf5'), toolbox: '#fdeef2',
      primary: gloss('#fde4ec', '#f2b3c6', '#e8a5ba', '#f7c6d4'),
      trim: [lace('#ffffff', '#f3c4d2'), 10], drawerTrim: [lace('#ffffff', '#f3c4d2'), 9] }) },
    { id: 'neapolitan-04-scrapbook-sweets', name: 'Scrapbook Sweets', about: 'Layered papers, washi tape, polaroids and a chocolate title bar.', swatch: ['#a77274', '#fbf1e6', '#f0c0c0'], motifs: [{ slot: 'title', file: 'neapolitan-04-binder-clip@2x.png', label: 'Binder clip' }, { slot: 'toolbox', file: 'neapolitan-04-polaroid@2x.png', label: 'Parfait polaroid' }, { slot: 'drawer', file: 'neapolitan-04-sleepy-cat@2x.png', label: 'Sleeping calico cat' }],
      tokens: stationery({ ...NEA,
      title: gloss('#ad7a7c', '#93605f', '#7d4f50', '#9a6668'), titleInk: NEA.cream,
      canvas: gingham('rgba(240,168,184,.30)', '#fff3ee', 12), desk: grid('#efdccf', '#fbf3e8'), toolbox: '#fbe9e4', drawer: ruled('#f0d9cf', '#fbf3e8'),
      primary: gloss('#fde4ec', '#f2b3c6', '#e8a5ba', '#f7c6d4'),
      trim: [washi('#f6b8c6', '#fde3ea'), 8] }) },
    { id: 'neapolitan-05-dreamy-dessert-night', name: 'Dreamy Dessert Night', about: 'Lavender night sky, glowing stars and cozy pink panels.', swatch: ['#846a83', '#fddfae', '#f4b7c9'], motifs: [{ slot: 'title', file: 'neapolitan-05-moon-stars@2x.png', label: 'Moon and stars' }, { slot: 'toolbox', file: 'neapolitan-05-game-console@2x.png', label: 'Pink handheld game console' }, { slot: 'drawer', file: 'neapolitan-05-sleepy-bunny@2x.png', label: 'Sleepy bunny with headphones and a star plush' }],
      tokens: stationery({ ...NEA,
      title: gloss('#fde4ec', '#f6bfd0', '#eaa9bd', '#f9cfdb'), titleInk: NEA.ink, barBg: '#5e4b6e', barInk: '#fff1e6',
      canvas: `radial-gradient(circle, #fddfae 1.6px, transparent 2.4px) 0 0 / 46px 34px, radial-gradient(circle, rgba(255,247,227,.7) 1px, transparent 1.8px) 23px 17px / 46px 34px, linear-gradient(180deg, #5e4b6e, #846a83 70%, #a07c8f)`,
      desk: '#fff6ea', toolbox: NEA.soft, drawer: '#f6e9f0',
      primary: gloss('#fde4ec', '#f2b3c6', '#e8a5ba', '#f7c6d4'),
      trim: [starString('#fddfae', 'rgba(255,241,230,.5)'), 14], trimBase: '#5e4b6e' }) },
  ] },
  { id: 'mint-choco-diary', name: 'Mint Choco Diary', set: { label: '🍃 Mint Choco set', glyphs: ['🍫', '🍦', '🧁', '🐱', '🎀', '🍀', '💚', '🍵', '📓', '✉️', '🌿', '🐹'] }, skins: [
    { id: 'mint-01-mint-gingham-cafe', name: 'Mint Gingham Café', about: 'Airy mint gingham, cocoa accents and tiny hearts.', swatch: ['#b5ddd0', '#fbf8ec', '#755447'], motifs: [{ slot: 'title', file: 'mint-01-bow@2x.png', label: 'Mint bow' }, { slot: 'toolbox', file: 'mint-01-choco-cat@2x.png', label: 'Choco cat with a mint bow' }, { slot: 'drawer', file: 'mint-01-frappe@2x.png', label: 'Mint-choco frappé and chocolate square' }],
      tokens: stationery({ ...MINT,
      title: gloss('#e6f7f0', '#c6e9dc', '#a9dcc9', '#cfeee2'), titleInk: MINT.ink,
      canvas: gingham('rgba(150,210,190,.32)', '#f2fbf6'), desk: dots('#cfe9df', '#fffdf4'), toolbox: MINT.soft,
      primary: gloss('#e6f7f0', '#bfe5d6', '#a9dcc9', '#cbece0'),
      trim: [gingham('rgba(117,84,71,.35)', '#efe3da', 4), 8] }) },
    { id: 'mint-02-choco-ribbon-notebook', name: 'Choco Ribbon Notebook', about: 'Spiral journal edges, mint bows and chocolate-dipped chrome.', swatch: ['#9a7665', '#dbf3e3', '#b5ddd0'], motifs: [{ slot: 'title', file: 'mint-02-bow@2x.png', label: 'Mint bow' }, { slot: 'toolbox', file: 'mint-02-cat-polaroid@2x.png', label: 'Cat polaroid with a clip' }, { slot: 'drawer', file: 'mint-02-cupcake@2x.png', label: 'Mint-choco cupcake' }],
      tokens: stationery({ ...MINT,
      title: gloss('#e6f7f0', '#c6e9dc', '#a9dcc9', '#cfeee2'), titleInk: MINT.ink,
      canvas: grid('#cfe6dc', '#f4fbf7'), desk: grid('#dcebe3', '#fffdf4', 16), toolbox: MINT.soft,
      primary: gloss('#e6f7f0', '#bfe5d6', '#a9dcc9', '#cbece0'),
      trim: [drips('#8a6656'), 12], toolboxEdge: [spiral('#9a8f88'), 14] }) },
    { id: 'mint-03-mint-plush-patisserie', name: 'Mint Plush Pâtisserie', about: 'Rounded plush friends, scallops and bows, mint and chocolate.', swatch: ['#c7e4cd', '#fef8ef', '#9c796e'], motifs: [{ slot: 'title', file: 'mint-03-bows@2x.png', label: 'Two mint bows' }, { slot: 'toolbox', file: 'mint-03-hamster-peek@2x.png', label: 'Plush hamster peeking' }, { slot: 'drawer', file: 'mint-03-macarons@2x.png', label: 'Macarons and a chocolate heart' }],
      tokens: stationery({ ...MINT,
      title: gloss('#a07a6c', '#86604f', '#6e4d40', '#93705f'), titleInk: MINT.cream, barBg: '#cfeadf',
      canvas: dots('#bfe2d4', '#f6fcf8', 20), desk: '#fffdf4', toolbox: '#e5f5ee',
      primary: gloss('#e6f7f0', '#bfe5d6', '#a9dcc9', '#cbece0'),
      trim: [lace('#ffffff', '#c9e6db'), 10], drawerTrim: [lace('#ffffff', '#c9e6db'), 9] }) },
    { id: 'mint-04-cozy-clover-diary', name: 'Cozy Clover Diary', about: 'A lamplit stationery corner with a deeper cocoa frame.', swatch: ['#8e5f4f', '#d5f0de', '#fefaf3'], motifs: [{ slot: 'title', file: 'mint-04-lamp@2x.png', label: 'Hanging lamp' }, { slot: 'toolbox', file: 'mint-04-window@2x.png', label: 'Arched window with a moon' }, { slot: 'drawer', file: 'mint-04-sleepy-cat@2x.png', label: 'Sleeping cat on a pillow with coffee and books' }],
      tokens: stationery({ ...MINT,
      title: gloss('#9c6d5c', '#8e5f4f', '#734a3c', '#86594a'), titleInk: MINT.cream, chocoBar: true, choco: '#734a3c',
      canvas: 'radial-gradient(circle at 16% 18%, rgba(255,240,196,.95) 0, rgba(255,240,196,.35) 14%, transparent 34%), linear-gradient(180deg, #d9efe3, #c6e4d4)',
      desk: ruled('#e3eee6', '#fffcf3'), toolbox: MINT.soft,
      primary: gloss('#e6f7f0', '#bfe5d6', '#a9dcc9', '#cbece0'),
      trim: [stitch('#d5f0de'), 6], trimBase: '#734a3c' }) },
    { id: 'mint-05-whipped-mint-stationery', name: 'Whipped Mint Stationery', about: 'Whipped-cream scallops, a dipped chocolate header and mint bows.', swatch: ['#def4e5', '#fcf6ee', '#997366'], motifs: [{ slot: 'title', file: 'mint-05-bow-heart@2x.png', label: 'Mint bow with a heart' }, { slot: 'toolbox', file: 'mint-05-ice-cream@2x.png', label: 'Mint-choco ice cream' }, { slot: 'drawer', file: 'mint-05-sleepy-cat@2x.png', label: 'Sleeping cat with chocolate chunks' }],
      tokens: stationery({ ...MINT,
      title: gloss('#e6f7f0', '#c6e9dc', '#a9dcc9', '#cfeee2'), titleInk: MINT.ink,
      canvas: dots('#cbe9dc', '#f3fbf6', 16), desk: '#fffdf4', toolbox: MINT.soft,
      primary: gloss('#e6f7f0', '#bfe5d6', '#a9dcc9', '#cbece0'),
      trim: [whipped('#fffdf7', '#8a6656'), 16], drawerTrim: [lace('#fffdf7', '#cfe9df'), 9] }) },
  ] },
  { id: 'sweet-shop-stationery', name: 'Sweet Shop Stationery', skins: [
    { id: 'sweet-lemon-ribbon-club', name: 'Lemon Ribbon Club', about: 'Butter-yellow gingham, blue gingham bows, daisies and lemonade.', swatch: ['#f5df8a', '#fffbea', '#4f75a8'],
      set: { label: '🍋 Lemon set', glyphs: ['🍋', '🌼', '🎀', '🐻', '🧃', '🍰', '💛', '🥞', '✉️', '🌻', '🍹', '💙'] },
      motifs: [{ slot: 'title', file: 'sweet-lemon-gingham-bow@2x.png', label: 'Blue gingham bow with daisies' }, { slot: 'toolbox', file: 'sweet-lemon-bear@2x.png', label: 'Bear hugging a lemon' }, { slot: 'drawer', file: 'sweet-lemon-lemonade@2x.png', label: 'Lemonade and lemon slices' }],
      tokens: stationery({ main: '#f5df8a', soft: '#fbf0c4', cream: '#fffbea', choco: '#4f75a8', ink: '#5a4a2a', softInk: '#6e5c34', line: '#f1e3a8', accent: '#4f7fb8',
        title: gloss('#fff6d2', '#fbe7a0', '#f5d97a', '#fbecb2'), titleInk: '#5a4a2a',
        canvas: gingham('rgba(240,205,90,.35)', '#fffbe6'), desk: dots('#f3e3a6', '#fffdf3'), toolbox: '#fbf0c4',
        primary: gloss('#fff6d2', '#fbe7a0', '#f5d97a', '#fbecb2'),
        trim: [gingham('rgba(120,160,215,.5)', '#eaf2fc', 4), 8], drawerTrim: [lace('#ffffff', '#f3e3a6'), 9] }) },
    { id: 'sweet-jellyfish-soda-aquarium', name: 'Jellyfish Soda Aquarium', about: 'Aqua glass, bubbles, jellyfish, seashells and lace doilies.', swatch: ['#9dcfea', '#f7fbff', '#9b7fd1'],
      set: { label: '🪼 Sea set', glyphs: ['🪼', '🐚', '🫧', '🐬', '🐠', '⭐', '🎀', '🍹', '🦀', '🌊', '🐳', '💎'] },
      motifs: [{ slot: 'title', file: 'sweet-jellyfish-jellyfish@2x.png', label: 'Glossy jellyfish' }, { slot: 'toolbox', file: 'sweet-jellyfish-bottle@2x.png', label: 'Bottle with a jellyfish and a bow' }, { slot: 'drawer', file: 'sweet-jellyfish-shells@2x.png', label: 'Seashells, pearl and coral' }],
      tokens: stationery({ main: '#9dcfea', soft: '#d8eef9', cream: '#f7fbff', choco: '#4d6aa8', ink: '#2f4660', softInk: '#4f6a85', line: '#cfe3f4', accent: '#8a6fc4',
        title: gloss('#e6f6fd', '#c3e6f7', '#a6d7f0', '#d2ecf9'), titleInk: '#2f4660',
        canvas: bubbles('#c4e8f8', '#a3d1ee'), desk: dots('#d6e9f7', '#fbfdff'), toolbox: '#dff1fa',
        primary: gloss('#e6f6fd', '#c3e6f7', '#a6d7f0', '#d2ecf9'),
        trim: [lace('#ffffff', '#cfe3f4'), 10], drawerTrim: [lace('#ffffff', '#cfe3f4'), 9] }) },
    { id: 'sweet-cherry-soda-arcade', name: 'Cherry Soda Arcade', about: 'Cherry-pink pixels, checkerboards, arcade tickets and soda floats.', swatch: ['#d36f8c', '#fff6f7', '#b84a6b'],
      set: { label: '🍒 Arcade set', glyphs: ['🍒', '🕹️', '👾', '🎮', '🎟️', '🍨', '💖', '⭐', '🐰', '🎀', '🥤', '💾'] },
      motifs: [{ slot: 'title', file: 'sweet-cherry-cherries@2x.png', label: 'Pixel cherries' }, { slot: 'toolbox', file: 'sweet-cherry-arcade-cabinet@2x.png', label: 'Cherry Soda arcade cabinet' }, { slot: 'drawer', file: 'sweet-cherry-ticket-float@2x.png', label: 'Arcade ticket and cherry soda float' }],
      tokens: stationery({ main: '#d36f8c', soft: '#f8dce2', cream: '#fff6f7', choco: '#b84a6b', ink: '#5c2338', softInk: '#8a4a60', line: '#f0c2cc', accent: '#e0466e',
        title: gloss('#d9738f', '#b84a6b', '#9e3a5a', '#c55a7a'), titleInk: '#fff6f7',
        canvas: grid('rgba(209,111,140,.22)', '#fde8ec', 12), desk: '#fff6f7', toolbox: '#f8dce2', drawer: pixelChecker('#fdeef1', '#fff8f9', 16),
        primary: gloss('#fbe2e8', '#f4c3cf', '#eeaebe', '#f7d0da'),
        trim: [pixelChecker('#d36f8c', '#fff6f7'), 8] }) },
    { id: 'sweet-rainy-day-letterbook', name: 'Rainy Day Letterbook', about: 'A rainy window, hydrangeas, raindrops and a sleepy bunny.', swatch: ['#abb2d2', '#f8f7fc', '#646ea0'],
      set: { label: '☔ Rainy day set', glyphs: ['☔', '🌧️', '☁️', '💧', '🐰', '💜', '✉️', '📖', '🫖', '🌂', '🪻', '🌈'] },
      motifs: [{ slot: 'title', file: 'sweet-rainy-cloud-mobile@2x.png', label: 'Cloud mobile with raindrops' }, { slot: 'toolbox', file: 'sweet-rainy-sleepy-bunny@2x.png', label: 'Sleepy bunny' }, { slot: 'drawer', file: 'sweet-rainy-hydrangeas@2x.png', label: 'Hydrangeas in a jar and books' }],
      tokens: stationery({ main: '#abb2d2', soft: '#e0e4f3', cream: '#f8f7fc', choco: '#646ea0', ink: '#3b3f5e', softInk: '#5c6186', line: '#d3d8ec', accent: '#8a6fc4',
        title: gloss('#eef0f9', '#d6dbef', '#c3c9e5', '#dfe3f3'), titleInk: '#3b3f5e',
        canvas: rain('#c9cfe8', '#b4bcdf'), desk: dots('#dcdff0', '#fbfaff'), toolbox: '#e6e8f5', drawer: gingham('rgba(171,178,210,.25)', '#f6f5fb', 10),
        primary: gloss('#eef0f9', '#d6dbef', '#c3c9e5', '#dfe3f3'),
        trim: [drops('#8a9ad0'), 12] }) },
    { id: 'sweet-peach-milk-post-office', name: 'Peach Milk Post Office', about: 'Peach gingham, airmail stripes, stamps, letters and a postal bunny.', swatch: ['#e4b1ac', '#fff8f4', '#9e544d'],
      set: { label: '🍑 Post office set', glyphs: ['🍑', '✉️', '💌', '📮', '🌸', '🎀', '🐰', '📦', '🧸', '🏷️', '🍰', '💗'] },
      motifs: [{ slot: 'title', file: 'sweet-peach-stamp@2x.png', label: 'Peach postage stamp' }, { slot: 'toolbox', file: 'sweet-peach-postal-bunny@2x.png', label: 'Postal bunny with a letter' }, { slot: 'drawer', file: 'sweet-peach-mailbox@2x.png', label: 'Mailbox and letters' }],
      tokens: stationery({ main: '#e4b1ac', soft: '#f8e2d8', cream: '#fff8f4', choco: '#9e544d', ink: '#5e3530', softInk: '#8a5a52', line: '#efcfc6', accent: '#d0485a',
        title: gloss('#fdece6', '#f6d2c8', '#eebdb3', '#f8dcd3'), titleInk: '#5e3530',
        canvas: gingham('rgba(228,160,150,.30)', '#fff3ee'), desk: ruled('#f3d9d0', '#fffaf6'), toolbox: '#f8e2d8',
        primary: gloss('#fdece6', '#f6d2c8', '#eebdb3', '#f8dcd3'),
        trim: [airmail(), 8] }) },
    { id: 'sweet-blueberry-ribbon-diary', name: 'Blueberry Ribbon Diary', about: 'Lavender gingham, ruled diary pages, blueberries and a bear in a beret.', swatch: ['#b2a0d2', '#fbf8fc', '#6c56a8'],
      set: { label: '🫐 Blueberry set', glyphs: ['🫐', '🎀', '🐻', '🧁', '🥞', '🍨', '💜', '📓', '✉️', '⭐', '🍰', '🔖'] },
      motifs: [{ slot: 'title', file: 'sweet-blueberry-bow@2x.png', label: 'Purple bow with a bear charm' }, { slot: 'toolbox', file: 'sweet-blueberry-bear@2x.png', label: 'Bear in a beret' }, { slot: 'drawer', file: 'sweet-blueberry-parfait@2x.png', label: 'Blueberry parfait and macarons' }],
      tokens: stationery({ main: '#b2a0d2', soft: '#e6dff2', cream: '#fbf8fc', choco: '#6c56a8', ink: '#3e2f63', softInk: '#5f5085', line: '#ddd3ee', accent: '#7b5cc7',
        title: gloss('#f1ecf9', '#ddd2ef', '#cbbde6', '#e4daf3'), titleInk: '#3e2f63',
        canvas: gingham('rgba(178,160,210,.30)', '#f8f4fc'), desk: ruled('#e3daf0', '#fdfbff'), toolbox: '#ece6f6',
        primary: gloss('#f1ecf9', '#ddd2ef', '#cbbde6', '#e4daf3'),
        trim: [lace('#ffffff', '#ddd3ee'), 10], toolboxEdge: [spiral('#a597c2'), 14] }) },
  ] },
]

/** Old single-look ids from before the collections: they open variant 01 of their collection. */
const RENAMED: Record<string, string> = { 'neapolitan-dream': 'neapolitan-01-strawberry-bunny-notebook', 'mint-choco': 'mint-01-mint-gingham-cafe' }
export function currentSkinId(id: string | null | undefined): string {
  const next = id ? RENAMED[id] ?? id : ''
  return SKINS.some(skin => skin.id === next) ? next : DEFAULT_SKIN
}

export const SKINS: StudioSkin[] = COLLECTIONS.flatMap(collection => collection.skins)

const STARTER_SET: DrawerSet = { label: '✨ Starter set', glyphs: ['♡', '💖', '💕', '✨', '⭐', '🌟', '🎀', '🌸', '🌈', '☁️', '🦋', '🍓'] }
/** The drawer's skin tab: the skin's own set, else its collection's, else the starter stickers. */
export function drawerSet(id: string): DrawerSet {
  const skin = findSkin(id)
  return skin.set ?? COLLECTIONS.find(collection => collection.skins.includes(skin))?.set ?? STARTER_SET
}
export const DEFAULT_SKIN = 'classic'

export function findSkin(id: string | null | undefined): StudioSkin {
  return SKINS.find(skin => skin.id === id) || SKINS[0]
}
/** Inline custom properties for the Studio root. Classic sets none (the CSS defaults are Classic). */
export function skinStyle(id: string): Record<string, string> {
  return { ...findSkin(id).tokens }
}
