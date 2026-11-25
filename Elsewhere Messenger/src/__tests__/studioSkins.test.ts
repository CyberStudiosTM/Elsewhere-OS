import { describe, expect, it } from 'vitest'
import { COLLECTIONS, DEFAULT_SKIN, MOTIF_SLOTS, SKINS, TOKENS, currentSkinId, drawerSet, findSkin, motifUrl, skinStyle } from '../studio/studioSkins'
import { contrastRatio, parseColor } from '../skinmapper/contrast'

import css from '../studio/Studio.css?raw'
const hexes = (value = '') => value.match(/#[0-9a-f]{6}\b/gi) ?? []
function ratio(fg?: string, bg?: string) {
  const a = parseColor(fg), b = parseColor(bg)
  if (!a || !b) throw new Error(`not a color: ${fg} on ${bg}`)
  return contrastRatio(a, b)
}

describe('Studio skin registry', () => {
  it('keeps Classic as the default with no overrides (its look is the CSS defaults)', () => {
    expect(DEFAULT_SKIN).toBe('classic')
    expect(SKINS[0].id).toBe('classic')
    expect(skinStyle('classic')).toEqual({})
    expect(findSkin('nope').id).toBe('classic')
  })
  it('has the two collections with five variants each, plus the original looks', () => {
    const byId = Object.fromEntries(COLLECTIONS.map(c => [c.id, c.skins.map(s => s.name)]))
    expect(byId['neapolitan-dream']).toEqual(['Strawberry Bunny Notebook', 'Chocolate Cat Parfait', 'Lace Bunny Bakery', 'Scrapbook Sweets', 'Dreamy Dessert Night'])
    expect(byId['mint-choco-diary']).toEqual(['Mint Gingham Café', 'Choco Ribbon Notebook', 'Mint Plush Pâtisserie', 'Cozy Clover Diary', 'Whipped Mint Stationery'])
    expect(byId['classic-family']).toEqual(['Classic', 'Cloudscape', 'Love.exe', 'Sugar Archive', 'Nightbyte', 'Pixel Angel'])
    expect(byId['sweet-shop-stationery']).toEqual(['Lemon Ribbon Club', 'Jellyfish Soda Aquarium', 'Cherry Soda Arcade', 'Rainy Day Letterbook', 'Peach Milk Post Office', 'Blueberry Ribbon Diary'])
  })
  it('uses unique ids and only known tokens', () => {
    expect(new Set(SKINS.map(s => s.id)).size).toBe(SKINS.length)
    for (const skin of SKINS) for (const key of Object.keys(skin.tokens)) expect(TOKENS, `${skin.id} ${key}`).toContain(key)
  })
  it('gives every token a Classic default in Studio.css', () => {
    for (const token of TOKENS) expect(css, token).toMatch(new RegExp(`\\n\\s*${token}:`))
  })
  it('opens variant 01 for anyone who had the old Neapolitan or Mint Choco look', () => {
    expect(currentSkinId('neapolitan-dream')).toBe('neapolitan-01-strawberry-bunny-notebook')
    expect(currentSkinId('mint-choco')).toBe('mint-01-mint-gingham-cafe')
    expect(currentSkinId('cloudscape')).toBe('cloudscape')
    expect(currentSkinId('gone')).toBe('classic')
    expect(currentSkinId(null)).toBe('classic')
  })
  it('gives every themed look one art spot per safe slot, with unique, safe file names', () => {
    const variants = COLLECTIONS.filter(c => c.id !== 'classic-family').flatMap(c => c.skins)
    const files = new Set<string>()
    for (const skin of variants) {
      expect(skin.motifs?.map(m => m.slot).sort(), skin.id).toEqual(['drawer', 'title', 'toolbox'])
      for (const motif of skin.motifs ?? []) {
        expect(motif.file).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+@2x\.png$/)
        expect(motif.file.startsWith(skin.id.split('-').slice(0, 2).join('-') + '-'), `${motif.file} belongs to ${skin.id}`).toBe(true)
        expect(files.has(motif.file), motif.file).toBe(false)
        files.add(motif.file)
        expect(motifUrl(motif.file)).toBe('/studio-skins/' + motif.file)
      }
    }
    expect(files.size).toBe(48)
    expect(Object.keys(MOTIF_SLOTS).sort()).toEqual(['drawer', 'title', 'toolbox'])
    expect(findSkin('classic').motifs).toBeUndefined()
  })
  it('gives every look a drawer sticker set', () => {
    for (const skin of SKINS) {
      const set = drawerSet(skin.id)
      expect(set.label, skin.id).toBeTruthy()
      expect(set.glyphs.length, skin.id).toBeGreaterThanOrEqual(8)
    }
    expect(drawerSet('sweet-lemon-ribbon-club').glyphs).toContain('🍋')
    expect(drawerSet('neapolitan-02-chocolate-cat-parfait').label).toBe('🍓 Neapolitan set')
    expect(drawerSet('classic').label).toBe('✨ Starter set')
  })
  it('never sets anything that could change the canvas or exports (no layout, size or transform tokens)', () => {
    for (const skin of SKINS) for (const value of Object.values(skin.tokens)) expect(value).not.toMatch(/url\(|expression|javascript:|@import/i)
  })

  const variants = COLLECTIONS.filter(c => c.id !== 'classic-family').flatMap(c => c.skins)
  for (const skin of variants) {
    const t = skin.tokens
    it(`${skin.name}: labels are readable (4.5:1)`, () => {
      const pairs: [string, string | undefined, string | undefined][] = [
        ['menu', t['--st-menu-ink'], t['--st-menubar-bg']],
        ['tabs', t['--st-tab-ink'], t['--st-tab-bg']],
        ['active tab', t['--st-tab-active-ink'], t['--st-tab-active-bg']],
        ['ribbon heading', t['--st-heading-ink'], t['--st-heading-bg']],
        ['panel text', t['--ink'], t['--pearl']],
        ['soft text', t['--soft'], t['--pearl']],
        ['toolbox', t['--st-toolbox-ink'], hexes(t['--st-toolbox-bg']).at(-1) ?? t['--st-toolbox-bg']],
        ['drawer', t['--ink'], hexes(t['--st-drawer-bg']).at(-1) ?? t['--st-drawer-bg']],
        ['tile', t['--st-tile-ink'], t['--st-tile-bg']],
        ['menu hover', t['--st-menu-hover-ink'], t['--st-menu-hover-bg']],
      ]
      for (const color of hexes(t['--st-button-bg'])) pairs.push(['button', t['--st-button-ink'], color])
      // Title and Finish text sits across the middle of their gloss (the 2nd and 3rd stops).
      for (const color of hexes(t['--st-title-bg']).slice(1, 3)) pairs.push(['title', t['--st-title-ink'], color])
      for (const color of hexes(t['--st-primary-bg']).slice(1, 3)) pairs.push(['finish', t['--st-primary-ink'], color])
      for (const [label, fg, bg] of pairs) expect(ratio(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    })
  }
})
