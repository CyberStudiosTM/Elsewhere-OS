import { describe, expect, it } from 'vitest'
import { STARTER_SKINS } from '../skinmapper/stationerySkins'
import { validateTheme } from '../skinmapper/schema'
import { contrastFindings } from '../skinmapper/contrast'

describe('stationery starter skins', () => {
  it('includes the six priority picks from the skin direction', () => {
    expect(Object.values(STARTER_SKINS).map(item => item.label).slice(0, 6)).toEqual([
      'Strawberry Letter Club', 'Sweet Ribbon Notebook', 'Marshmallow Bunny Trio',
      'Mint Choco Pen Pal', 'Mint Checker Sticker Sack', 'Mint Chococat Dream',
    ])
  })
  it('adds the 10 soft-outline mockup looks, five per collection, with unique names', () => {
    const all = Object.values(STARTER_SKINS)
    expect(all.filter(item => item.family === 'Neapolitan' || item.family === 'Mint Choco')).toHaveLength(16)
    expect(new Set(all.map(item => item.label)).size).toBe(all.length)
    expect(all.filter(item => item.family === 'Neapolitan')).toHaveLength(8)
    expect(all.filter(item => item.family === 'Mint Choco')).toHaveLength(8)
  })
  for (const [id, skin] of Object.entries(STARTER_SKINS)) {
    it(`${skin.label} passes every safety check`, () => {
      expect(validateTheme(skin.theme).filter(item => item.severity === 'error')).toEqual([])
    })
    it(`${skin.label} keeps buttons and badges readable`, () => {
      const warnings = contrastFindings(skin.theme).filter(item => item.severity === 'warning')
      expect(warnings.map(item => item.slot), id).toEqual([])
    })
    it(`${skin.label} ships every pattern it uses`, () => {
      const used = JSON.stringify(skin.theme)
      for (const match of used.matchAll(/"path":"([^"]+)"/g)) expect(skin.patterns.some(pattern => pattern.path === match[1])).toBe(true)
    })
  }
})

describe('gradients', () => {
  it('allows glossy color gradients but nothing else', () => {
    const ok = validateTheme({ tokens: {}, slots: { 'window.titlebar': { active: { background: 'linear-gradient(to bottom, #ffd1e0 0%, #ff8fb3 45%, #f0668f 55%, #ffb3c9 100%)' } } } })
    expect(ok.filter(item => item.severity === 'error')).toEqual([])
    for (const bad of ['linear-gradient(to bottom, url(x.png), #fff)', 'linear-gradient(red, blue)', 'radial-gradient(#fff, #000)', 'linear-gradient(to bottom, #fff 0%, #000 100%); background: red']) {
      expect(validateTheme({ tokens: {}, slots: { 'window.titlebar': { active: { background: bad } } } }).some(item => item.severity === 'error'), bad).toBe(true)
    }
  })
})
