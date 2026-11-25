import { describe, expect, it } from 'vitest'
import { BANDS, composeLayers, itemFits, moveItem, newDoll, readDoll, readLibrary, toggleItem } from '../pixeldoll/dollModel'
import { PLACEHOLDER_LIBRARY as LIB } from '../pixeldoll/placeholderLibrary'

describe('Pixel Doll Studio engine', () => {
  it('draws parts back to front by depth band (back hair behind the body, front hair on top)', () => {
    let doll = newDoll(LIB)
    doll = toggleItem(doll, LIB, 'ph-long-hair')
    const bands = composeLayers(doll, LIB).layers.map(layer => layer.band)
    expect(bands.indexOf('back-hair')).toBeLessThan(bands.indexOf('body'))
    expect(bands.lastIndexOf('front-hair')).toBeGreaterThan(bands.lastIndexOf('body'))
    const order = bands.map(band => BANDS.indexOf(band))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('swaps single-slot items and toggles the rest', () => {
    let doll = newDoll(LIB)
    doll = toggleItem(doll, LIB, 'ph-skirt')
    doll = toggleItem(doll, LIB, 'ph-pants')
    expect(doll.equipped.map(e => e.item)).toEqual(['ph-pants'])
    doll = toggleItem(doll, LIB, 'ph-bow'); doll = toggleItem(doll, LIB, 'ph-bag')
    doll = toggleItem(doll, LIB, 'ph-bow')
    expect(doll.equipped.map(e => e.item)).toEqual(['ph-pants', 'ph-bag'])
  })
  it('hides items with no art for the pose instead of stretching them', () => {
    let doll = toggleItem(newDoll(LIB), LIB, 'ph-pants')
    doll = { ...doll, pose: 'sit' }
    const pants = LIB.items.find(i => i.id === 'ph-pants')!
    expect(itemFits(pants, doll.body, 'sit')).toBe(false)
    const { layers, unavailable } = composeLayers(doll, LIB)
    expect(unavailable.map(i => i.id)).toEqual(['ph-pants'])
    expect(layers.some(l => l.item?.id === 'ph-pants')).toBe(false)
  })
  it('reorders worn items and keeps hidden ones in the outfit', () => {
    let doll = toggleItem(toggleItem(newDoll(LIB), LIB, 'ph-tee'), LIB, 'ph-corset')
    doll = moveItem(doll, 'ph-corset', -1)
    expect(doll.equipped.map(e => e.item)).toEqual(['ph-corset', 'ph-tee'])
    doll = { ...doll, equipped: doll.equipped.map(e => ({ ...e, hidden: true })) }
    expect(composeLayers(doll, LIB).layers.some(l => l.item)).toBe(false)
    expect(doll.equipped).toHaveLength(2)
  })
  it('saved dolls round-trip and keep items whose art is not installed yet', () => {
    const doll = { ...toggleItem(newDoll(LIB, 'Rose'), LIB, 'ph-dress'), equipped: [{ item: 'future-item', color: '#112233' }, { item: 'ph-dress' }] }
    const back = readDoll(JSON.parse(JSON.stringify(doll)))!
    expect(back.equipped.map(e => e.item)).toEqual(['future-item', 'ph-dress'])
    expect(readDoll({ nope: true })).toBeNull()
  })
  it('reads an asset-library manifest safely and falls back to placeholders for missing sections', () => {
    const manifest = { format: 'elsewhere-pixel-doll-library', items: [
      { id: 'lace-dress', name: 'Lace dress', category: 'dresses', parts: [{ band: 'dresses', sprites: { 'doll-a/stand': 'items/lace-dress.png' } }] },
      { id: 'bad', name: 'Bad', category: 'dresses', parts: [{ band: 'dresses', sprites: { '*': '../../secret.png' } }] },
    ] }
    const lib = readLibrary(manifest, '/pixel-doll/library/', LIB)!
    expect(lib.items.map(i => i.id)).toEqual(['lace-dress'])
    expect(lib.items[0].parts[0].sprites['doll-a/stand']).toEqual({ src: '/pixel-doll/library/items/lace-dress.png' })
    expect(lib.bodies).toBe(LIB.bodies)
    expect(lib.source).toBe('mixed')
    expect(readLibrary({ format: 'other' }, '/', LIB)).toBeNull()
  })
  it('placeholder parts are all labeled as placeholders', () => {
    expect(LIB.items.every(item => item.placeholder && item.name.startsWith('Placeholder'))).toBe(true)
    expect(LIB.bodies.every(body => body.placeholder)).toBe(true)
  })
})
