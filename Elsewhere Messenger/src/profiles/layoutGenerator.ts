import { DESIGN_WIDTH, type Design, type DesignElement, type DesignStyle, type ModuleName, type ProfileDoc } from './profileRender'

// Profile Workshop · Layout Generator. Approved as a guided, RULE-BASED composer: no AI, no prompts, no image
// generation. It combines hand-made palettes, layout patterns and decorations with seeded randomness, and
// produces a normal editable Visual Designer page.

export const VIBES = {
  'y2k-kawaii': { label: 'Y2K kawaii', fonts: ['Comic Sans MS', 'Trebuchet MS', 'Verdana'], patterns: ['hearts', 'sparkles', 'dots'], glyphs: ['♡', '✿', '☆', '✦', '♥'],
    palettes: [{ bg: '#ffd6ec', panel: '#fff7fb', ink: '#5a2142', accent: '#ff5fa2', heading: '#c2449b' }, { bg: '#e6dcff', panel: '#ffffff', ink: '#3b2a5c', accent: '#9b7bff', heading: '#ff6fb5' }] },
  'frutiger-aero': { label: 'Frutiger Aero', fonts: ['Segoe UI', 'Tahoma', 'Trebuchet MS'], patterns: ['elsewhaero', 'none'], glyphs: ['✦', '☁', '◌', '❀'],
    palettes: [{ bg: '#7cc9f3', panel: '#f4fbff', ink: '#0b2a4a', accent: '#62c23d', heading: '#0a6fbd' }, { bg: '#bfe9ff', panel: '#ffffff', ink: '#103a5c', accent: '#2fb6e8', heading: '#1f7a3a' }] },
  'scene-emo': { label: 'Scene / emo', fonts: ['Verdana', 'Courier New', 'Trebuchet MS'], patterns: ['checker', 'stripes', 'stars'], glyphs: ['☠', '✖', '♥', '☆', '⚡'],
    palettes: [{ bg: '#111111', panel: '#1d1d1d', ink: '#f2f2f2', accent: '#ff2e8a', heading: '#39ff14' }, { bg: '#0d0d1a', panel: '#1a1a2e', ink: '#ececff', accent: '#00e5ff', heading: '#ff4fd8' }] },
  'gothic-web': { label: 'Gothic web', fonts: ['Georgia', 'Courier New'], patterns: ['grid', 'none', 'stars'], glyphs: ['✝', '☾', '❦', '†', '✧'],
    palettes: [{ bg: '#140b14', panel: '#221522', ink: '#e8dce8', accent: '#9c1f3c', heading: '#c9a2d6' }, { bg: '#0b0b10', panel: '#16161f', ink: '#d8d8e6', accent: '#6f2dbd', heading: '#e0e0e0' }] },
  'pixel-nostalgia': { label: 'Pixel nostalgia', fonts: ['Lucida Console', 'Courier New', 'Tahoma'], patterns: ['grid', 'checker', 'dots'], glyphs: ['▣', '♥', '★', '▶', '◆'],
    palettes: [{ bg: '#2b2d6e', panel: '#f0f0e8', ink: '#1a1a2a', accent: '#ffcc00', heading: '#e43b44' }, { bg: '#0f380f', panel: '#9bbc0f', ink: '#0f380f', accent: '#306230', heading: '#0f380f' }] },
} as const
export type Vibe = keyof typeof VIBES | 'surprise'
export type Structure = 'two-column' | 'collage' | 'modular' | 'surprise'
export type Decoration = 'minimal' | 'decorated' | 'maximalist'
export type GeneratorOptions = { vibe: Vibe; structure: Structure; decoration: Decoration; seed: number; modules: ModuleName[] }

/** Small seeded random generator (mulberry32), so the same options + seed always give the same page. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function generateLayout(opts: GeneratorOptions): { theme: ProfileDoc['theme']; design: Design } {
  const r = rng(opts.seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(r() * list.length)]
  const vibeKey = opts.vibe === 'surprise' ? pick(Object.keys(VIBES) as (keyof typeof VIBES)[]) : opts.vibe
  const vibe = VIBES[vibeKey]
  type Palette = { bg: string; panel: string; ink: string; accent: string; heading: string }
  const palette: Palette = pick(vibe.palettes as readonly Palette[])
  const font: string = pick(vibe.fonts as readonly string[])
  const theme: ProfileDoc['theme'] = { ...palette, font, pattern: pick(vibe.patterns as readonly string[]) }
  const structure = opts.structure === 'surprise' ? pick(['two-column', 'collage', 'modular'] as const) : opts.structure
  const modules: ModuleName[] = opts.modules.length ? opts.modules : ['identity', 'about', 'friends', 'guestbook']
  const elements: DesignElement[] = []
  let z = 0
  const id = () => Math.floor(r() * 1e9).toString(36) + (z + 1)
  const add = (e: Omit<DesignElement, 'id' | 'z'>) => elements.push({ ...e, id: id(), z: z++ })
  const panelStyle = (): DesignStyle => ({ radius: pick([0, 6, 12, 18]), shadow: pick([0, 1, 2]) })

  // Title heading across the top.
  const title = `${pick(vibe.glyphs as readonly string[])} welcome to my page ${pick(vibe.glyphs as readonly string[])}`
  add({ kind: 'heading', x: 40, y: 24, w: DESIGN_WIDTH - 80, h: 64, text: title, style: { size: 38, bold: true, align: 'center', color: palette.heading, font } })
  let top = 110
  const heights: Record<ModuleName, number> = { identity: 200, about: 240, interests: 220, music: 130, links: 170, friends: 230, bulletins: 260, guestbook: 320, counter: 120, poll: 220, webring: 140 }

  if (structure === 'two-column') {
    const left = modules.filter(m => ['identity', 'music', 'interests', 'links'].includes(m))
    const right = modules.filter(m => !left.includes(m))
    let yl = top, yr = top
    for (const m of left) { add({ kind: 'module', module: m, x: 24, y: yl, w: 360, h: heights[m], style: panelStyle() }); yl += heights[m] + 16 }
    for (const m of right) { add({ kind: 'module', module: m, x: 400, y: yr, w: 536, h: heights[m], style: panelStyle() }); yr += heights[m] + 16 }
    top = Math.max(yl, yr)
  } else if (structure === 'modular') {
    const w = 292, gap = 18
    const colY = [top, top, top]
    for (const m of modules) {
      const wide = m === 'guestbook' || m === 'bulletins'
      if (wide) { const y = Math.max(...colY); add({ kind: 'module', module: m, x: 24, y, w: w * 3 + gap * 2, h: heights[m], style: panelStyle() }); colY.fill(y + heights[m] + gap); continue }
      const c = colY.indexOf(Math.min(...colY))
      add({ kind: 'module', module: m, x: 24 + c * (w + gap), y: colY[c], w, h: heights[m], style: panelStyle() }); colY[c] += heights[m] + gap
    }
    top = Math.max(...colY)
  } else {
    // Collage: staggered, slightly rotated cards.
    let y = top
    modules.forEach((m, i) => {
      const w = m === 'guestbook' || m === 'bulletins' ? 520 : 380 + Math.floor(r() * 80)
      const x = i % 2 === 0 ? 30 + Math.floor(r() * 60) : DESIGN_WIDTH - w - 30 - Math.floor(r() * 60)
      add({ kind: 'module', module: m, x, y, w, h: heights[m], style: { ...panelStyle(), rot: Math.round((r() - 0.5) * 6) } })
      y += Math.round(heights[m] * 0.72)
    })
    top = y + 220
  }

  // Decorations scale with the chosen density.
  const count = opts.decoration === 'minimal' ? 2 : opts.decoration === 'decorated' ? 7 : 16
  const anims = ['float', 'pulse', 'wiggle', 'glow', 'none'] as const
  for (let i = 0; i < count; i++) {
    const kind = pick(['glyph', 'glyph', 'shape', 'divider'] as const)
    const x = Math.floor(r() * (DESIGN_WIDTH - 80)), y = 90 + Math.floor(r() * Math.max(200, top - 120))
    if (kind === 'glyph') add({ kind: 'heading', x, y, w: 70, h: 70, text: pick(vibe.glyphs as readonly string[]), style: { size: 30 + Math.floor(r() * 30), align: 'center', color: pick([palette.accent, palette.heading]), anim: opts.decoration === 'minimal' ? 'none' : pick(anims) } })
    else if (kind === 'shape') add({ kind: 'shape', x, y, w: 60 + Math.floor(r() * 120), h: 40 + Math.floor(r() * 90), style: { bg: palette.accent, bg2: palette.heading, angle: Math.floor(r() * 360), radius: 999, opacity: 0.35 } })
    else add({ kind: 'divider', x: 40, y: Math.min(top, y), w: DESIGN_WIDTH - 80, h: 5, style: { color: palette.accent } })
  }
  // Decorations sit behind the profile pieces so nothing gets covered.
  const decorations = elements.filter(e => e.kind !== 'module' && e !== elements[0])
  decorations.forEach((e, i) => { e.z = -100 + i })
  return { theme, design: { on: true, height: Math.max(900, top + 60), elements, pages: [], homeName: 'Home', adapt: 'reflow' } }
}
