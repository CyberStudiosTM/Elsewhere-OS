import { describe, expect, it } from 'vitest'
import { validateTheme, type Decoration } from '../skinmapper/schema'
import { imageInfo } from '../skinmapper/packageLoader'
import { decorationStyle } from '../skinmapper/decorations'

const sticker: Decoration = { id: 'a', asset: { path: 'assets/decorations/decoration-1.gif' }, window: 'buddy-list', anchor: 'top-right', x: 12, y: 36, width: 64 }

describe('skin decorations', () => {
  it('accepts a decoration with a GIF from the decorations folder', () => {
    expect(validateTheme({ tokens: {}, decorations: [sticker] }).filter(item => item.severity === 'error')).toEqual([])
  })
  it('rejects decorations outside the package or out of range', () => {
    const bad = validateTheme({ tokens: {}, decorations: [{ ...sticker, asset: { path: 'https://example.com/a.gif' } }, { ...sticker, width: 5000 }, { ...sticker, window: 'desktop' as never }] })
    expect(bad.filter(item => item.severity === 'error').length).toBeGreaterThanOrEqual(3)
  })
  it('limits how many decorations a skin has', () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ ...sticker, id: String(index) }))
    expect(validateTheme({ tokens: {}, decorations: many }).some(item => item.message.includes('up to 24'))).toBe(true)
  })
  it('reads GIF sizes from the header', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 100, 0, 50, 0, 0, 0])
    expect(imageInfo(gif)).toEqual({ type: 'image/gif', width: 100, height: 50 })
  })
  it('places decorations from their corner and never takes clicks', () => {
    const style = decorationStyle({ ...sticker, anchor: 'bottom-left', rotation: 10, flip: true })
    expect(style).toMatchObject({ bottom: '36px', left: '12px', width: '64px', pointerEvents: 'none', transform: 'rotate(10deg) scaleX(-1)' })
  })
})
