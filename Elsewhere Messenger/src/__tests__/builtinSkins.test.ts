import { describe, expect, it } from 'vitest'
import { BUILTIN_COLLECTIONS, BUILTIN_PREFIX, builtinSkins } from '../services/customSkin'
import { STARTER_SKINS } from '../skinmapper/stationerySkins'
import { classicSkinCss } from '../skinmapper/classicOverlay'

describe('built-in skins in the Skins menu', () => {
  it('lists every verified skin, so a quick start is always wearable too', () => {
    expect(builtinSkins().map(item => item.id)).toEqual(Object.keys(STARTER_SKINS).map(key => BUILTIN_PREFIX + key))
  })
  it('puts every skin in a named collection, none left over', () => {
    const grouped = BUILTIN_COLLECTIONS.flatMap(collection => builtinSkins(collection.family))
    expect(grouped).toHaveLength(builtinSkins().length)
    for (const collection of BUILTIN_COLLECTIONS) expect(builtinSkins(collection.family).length).toBeGreaterThan(0)
  })
  it('turns each built-in skin into Classic overlay CSS', () => {
    for (const [key, skin] of Object.entries(STARTER_SKINS)) {
      const css = classicSkinCss(skin.theme, asset => `blob:${asset.path}`)
      expect(css.length, key).toBeGreaterThan(100)
      expect(css, key).not.toContain('undefined')
    }
  })
})

describe('Classic overlay selectors', () => {
  it('keeps commas inside attribute values and brackets in one selector', () => {
    const css = classicSkinCss(STARTER_SKINS['abyssal'].theme, () => undefined)
    expect(css).toContain('.ew-core-message-text[style*="color: rgb(0, 0, 0)"]')
    expect(css).not.toMatch(/rgb\(0, html\[/)
  })
})
