import { describe, expect, it } from 'vitest'
import { CLASSIC_TARGETS, classicSkinCss } from '../skinmapper/classicOverlay'
import { SLOTS } from '../skinmapper/schema'
import { STARTER_SKINS } from '../skinmapper/stationerySkins'

describe('wearing a saved skin on Classic', () => {
  it('writes nothing for an empty skin, so Classic stays exactly Classic', () => {
    expect(classicSkinCss({ tokens: {} }, () => undefined)).toBe('')
  })
  it('only styles the parts a skin changes, scoped to the custom-skin root', () => {
    const css = classicSkinCss({ tokens: {}, slots: { 'chat.send': { normal: { background: '#c93d68' } } } }, () => undefined)
    expect(css).toContain('html[data-elsewhere-custom-skin] .em-compose button[type="submit"]')
    expect(css).toContain('background: #c93d68 !important;')
    expect(css).not.toContain('.em-titlebar')
    for (const line of css.split('\n').filter(l => l.includes('{'))) expect(line.startsWith('html[data-elsewhere-custom-skin]')).toBe(true)
  })
  it('maps hover and selected states to real Classic selectors', () => {
    const css = classicSkinCss({ tokens: {}, slots: { 'buddy.contact.row': { hover: { background: '#ffe0ea' }, selected: { background: '#ffc4d6' } } } }, () => undefined)
    expect(css).toContain('.em-contact:hover')
    expect(css).toContain('.em-contact.em-contact-selected')
  })
  it('refuses values that could break out of a CSS rule', () => {
    const css = classicSkinCss({ tokens: {}, slots: { 'chat.send': { normal: { background: 'red; } body { display:none' } } } }, () => undefined)
    expect(css).toBe('')
  })
  it('turns images into blob URLs only through the provided lookup', () => {
    const css = classicSkinCss({ tokens: {}, slots: { 'buddy.contacts': { normal: { backgroundImage: { path: 'assets/textures/a.png', scale: 'tile' } } } } }, () => 'blob:test')
    expect(css).toContain('background-image: url("blob:test")')
    expect(css).toContain('background-repeat: repeat')
    expect(classicSkinCss({ tokens: {}, slots: { 'buddy.contacts': { normal: { backgroundImage: { path: 'x.png', scale: 'tile' } } } } }, () => undefined)).toBe('')
  })
  it('only targets skin parts that exist in the SkinMap', () => {
    const ids = new Set(SLOTS.map(slot => slot.id))
    for (const id of Object.keys(CLASSIC_TARGETS)) expect(ids.has(id), id).toBe(true)
  })
  it('dresses Classic in every starter skin without errors', () => {
    for (const skin of Object.values(STARTER_SKINS)) expect(classicSkinCss(skin.theme, () => 'blob:x').length).toBeGreaterThan(100)
  })
})
