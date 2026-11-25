import { describe, expect, it } from 'vitest'
import { compileTheme, declarationsToCss, nineSliceCss, variableName } from '../skinmapper/compileTheme'
import type { SkinTheme } from '../skinmapper/schema'

const urls: Record<string, string> = { 'assets/frames/main.png': 'blob:elsewhere/frame-1', 'assets/frames/n.png': 'blob:http://localhost:5173/abc-n-123' }
const urlFor = (asset: { path: string }) => urls[asset.path]

describe('theme compiler', () => {
  const theme: SkinTheme = {
    tokens: { textColor: '#111111', fontFamily: 'Tahoma' },
    slots: {
      'buddy.toolbar.button': { normal: { background: '#eeeeee', borderRadius: 6 }, hover: { background: '#dddddd' } },
      'window.frame': { active: { backgroundImage: { path: 'assets/frames/main.png', scale: 'nine-slice', slice: [10, 12, 10, 12] } } },
      'chat.send': { normal: { opacity: 3 } },
    },
    transcript: 'bubble',
  }
  const compiled = compileTheme(theme, urlFor)

  it('names variables by slot, state and property', () => {
    expect(variableName('chat.send', 'background', 'hover')).toBe('--sm-chat-send-hover-background')
    expect(variableName('chat.send', 'textColor')).toBe('--sm-chat-send-text-color')
  })
  it('applies inheritance and global tokens', () => {
    expect(compiled.declarations['--sm-chat-send-background']).toBe('#eeeeee')
    expect(compiled.declarations['--sm-chat-send-hover-background']).toBe('#dddddd')
    expect(compiled.declarations['--sm-buddy-profile-name-text-color']).toBe('#111111')
    expect(compiled.declarations['--sm-buddy-toolbar-button-border-radius']).toBe('6px')
  })
  it('only emits package images as blob links and records nine-slice data', () => {
    expect(compiled.declarations['--sm-window-frame-active-background-image']).toBe('url("blob:elsewhere/frame-1")')
    expect(compiled.nineSlice['window.frame:active']).toEqual({ url: 'blob:elsewhere/frame-1', slice: [10, 12, 10, 12], repeat: 'stretch' })
  })
  it('clamps values and quotes fonts safely', () => {
    expect(compiled.declarations['--sm-chat-send-opacity']).toBe('1')
    expect(compiled.declarations['--sm-buddy-profile-name-font-family']).toBe('"Tahoma", "Segoe UI", sans-serif')
    expect(compiled.transcript).toBe('bubble')
  })
  it('scopes everything to the mapped skin root', () => {
    const css = declarationsToCss(compiled)
    expect(css.startsWith('[data-elsewhere-skin="mapped"] {')).toBe(true)
    expect(css).not.toMatch(/<|javascript:|@import/)
  })
  it('draws nine-slice frames with border-image, scoped to the slot', () => {
    const css = nineSliceCss(compiled)
    expect(css).toContain('[data-elsewhere-skin="mapped"] [data-sm-slot="window.frame"]')
    expect(css).toContain('border-image: url("blob:elsewhere/frame-1") 10 12 10 12 fill / 10px 12px 10px 12px stretch;')
  })
  it('keeps every character of real image links', () => {
    const withN = compileTheme({ tokens: {}, slots: { 'toast.frame': { normal: { backgroundImage: { path: 'assets/frames/n.png', scale: 'nine-slice', slice: [4, 4, 4, 4] } } } } }, urlFor)
    expect(nineSliceCss(withN)).toContain('blob:http://localhost:5173/abc-n-123')
  })
})
