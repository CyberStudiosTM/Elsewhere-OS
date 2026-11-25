import { describe, expect, it } from 'vitest'
import {
  SKINMAP_VERSION, SKIN_FORMAT, SLOTS, SLOT_INDEX, compatibility, resetProperty, resolve, validateManifest, validateTheme,
  type SkinTheme,
} from '../skinmapper/schema'

const errors = (list: { severity: string }[]) => list.filter(item => item.severity === 'error')

describe('slot registry', () => {
  it('has unique, stable ids and valid inheritance links', () => {
    const ids = SLOTS.map(slot => slot.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const slot of SLOTS) {
      expect(slot.id).toMatch(/^[a-z]+(\.[a-z0-9-]+)+$/)
      if (slot.inherits) expect(SLOT_INDEX[slot.inherits], `${slot.id} inherits a missing slot`).toBeDefined()
      expect(slot.since).toBe(SKINMAP_VERSION)
    }
  })
  it('covers every real toolbar action as its own replaceable button', () => {
    for (const action of ['add-contact', 'mail', 'call', 'webcam', 'nudge', 'web-treasures', 'activities']) expect(SLOT_INDEX[`buddy.toolbar.${action}`]).toBeDefined()
    for (const action of ['invite', 'send-files', 'webcam', 'audio', 'nudge', 'emoticons', 'activities', 'web-treasures']) expect(SLOT_INDEX[`chat.toolbar.${action}`]).toBeDefined()
  })
  it('marks real controls as protected', () => {
    for (const id of ['chat.composer', 'chat.send', 'signin.field', 'signin.button', 'window.controls.close']) expect(SLOT_INDEX[id].protected).toBe(true)
  })
})

describe('manifest validation', () => {
  const good = { format: SKIN_FORMAT, formatVersion: '1.0.0', id: 'candy-call', name: 'CandyCall', author: 'Cyber', skinMapVersion: '1.0', preview: 'assets/preview/cover.png' }
  it('accepts a valid manifest', () => expect(errors(validateManifest(good))).toEqual([]))
  it('rejects other formats, bad ids and paths outside the package', () => {
    expect(errors(validateManifest({ ...good, format: 'winamp' })).length).toBe(1)
    expect(errors(validateManifest({ ...good, id: 'Bad ID!' })).length).toBe(1)
    expect(errors(validateManifest({ ...good, preview: '../../secret.png' })).length).toBe(1)
    expect(errors(validateManifest({ ...good, preview: 'https://evil.example/x.png' })).length).toBe(1)
  })
  it('refuses skins made for a newer SkinMap instead of crashing', () => {
    expect(validateManifest({ ...good, skinMapVersion: '9.0' }).some(item => item.severity === 'error' && /newer/.test(item.message))).toBe(true)
    expect(compatibility('0.9')).toBe('older')
    expect(compatibility(SKINMAP_VERSION)).toBe('same')
    expect(compatibility('nope')).toBe('invalid')
  })
})

describe('theme validation (safety)', () => {
  it('accepts plain colors, sizes and package images', () => {
    const theme: SkinTheme = {
      tokens: { accentColor: '#2f86cf', fontFamily: 'Segoe UI', borderRadius: '8px' },
      slots: {
        'chat.send': { normal: { background: '#5fb3ec', textColor: '#ffffff' }, hover: { background: 'rgba(95, 179, 236, 0.8)' } },
        'window.frame': { active: { backgroundImage: { path: 'assets/frames/main.png', scale: 'nine-slice', slice: [12, 12, 12, 12] } } },
      },
    }
    expect(errors(validateTheme(theme))).toEqual([])
  })
  it('blocks code, CSS injection and remote links', () => {
    const attacks = [
      { tokens: { background: 'url(https://evil.example/track.png)' } },
      { tokens: { textColor: 'red; } body { display:none' } },
      { tokens: { background: 'javascript:alert(1)' } },
      { tokens: { fontFamily: 'Comic Sans MS"; @import "evil.css' } },
      { slots: { 'chat.send': { normal: { backgroundImage: { path: '../../../Windows/win.ini' } } } } },
      { slots: { 'chat.send': { normal: { backgroundImage: { path: 'assets/buttons/payload.svg' } } } } },
      { slots: { 'chat.send': { normal: { backgroundImage: { path: 'https://evil.example/a.png' } } } } },
    ]
    for (const theme of attacks) expect(errors(validateTheme({ tokens: {}, ...theme })).length, JSON.stringify(theme)).toBeGreaterThan(0)
  })
  it('rejects bad nine-slice values and unsupported scaling', () => {
    expect(errors(validateTheme({ tokens: {}, slots: { 'window.frame': { active: { backgroundImage: { path: 'assets/frames/a.png', scale: 'nine-slice', slice: [1, 2, 3] as never } } } } })).length).toBe(1)
    expect(errors(validateTheme({ tokens: {}, slots: { 'buddy.contact.presence': { online: { icon: { path: 'assets/icons/dot.png', scale: 'tile' } } } } })).length).toBe(1)
  })
  it('ignores unknown parts and states with a warning instead of failing', () => {
    const found = validateTheme({ tokens: {}, slots: { 'future.thing': { normal: {} }, 'chat.send': { wiggly: {} as never } } })
    expect(errors(found)).toEqual([])
    expect(found.filter(item => item.severity === 'warning').length).toBe(2)
  })
  it('checks shell mode values', () => {
    expect(errors(validateTheme({ tokens: {}, shell: { trim: { path: 'assets/frames/pager.png', scale: 'contain' }, inset: [40, 30, 60, 30] } }))).toEqual([])
    expect(errors(validateTheme({ tokens: {}, shell: { trim: { path: 'assets/frames/pager.png' }, inset: [-1, 0, 0, 0] } })).length).toBe(1)
  })
})

describe('inheritance', () => {
  const theme: SkinTheme = {
    tokens: { textColor: '#111111', accentColor: '#2f86cf' },
    windows: { conversation: { textColor: '#222222' } },
    slots: {
      'buddy.toolbar.button': { normal: { background: '#eeeeee' }, hover: { background: '#dddddd' } },
      'chat.send': { normal: { textColor: '#ffffff' } },
    },
  }
  it('follows slot → inherited slot → window → global → default', () => {
    expect(resolve(theme, 'chat.send', 'textColor')).toEqual({ value: '#ffffff', origin: 'slot' })
    expect(resolve(theme, 'chat.send', 'background')).toEqual({ value: '#eeeeee', origin: 'inherited-slot' })
    expect(resolve(theme, 'chat.send', 'background', 'hover')).toEqual({ value: '#dddddd', origin: 'inherited-slot' })
    expect(resolve(theme, 'chat.transcript', 'textColor')).toEqual({ value: '#222222', origin: 'window' })
    expect(resolve(theme, 'buddy.profile.name', 'textColor')).toEqual({ value: '#111111', origin: 'global' })
    expect(resolve(theme, 'chat.send', 'borderRadius', 'normal', { borderRadius: '4px' })).toEqual({ value: '4px', origin: 'default' })
  })
  it('a state without its own value falls back to normal', () => {
    expect(resolve(theme, 'chat.send', 'textColor', 'pressed')).toEqual({ value: '#ffffff', origin: 'slot' })
  })
  it('resetting one property leaves everything else alone', () => {
    const next = resetProperty(theme, 'buddy.toolbar.button', 'hover', 'background')
    expect(next.slots?.['buddy.toolbar.button']?.hover).toBeUndefined()
    expect(next.slots?.['buddy.toolbar.button']?.normal).toEqual({ background: '#eeeeee' })
    expect(next.slots?.['chat.send']).toEqual(theme.slots?.['chat.send'])
    expect(theme.slots?.['buddy.toolbar.button']?.hover).toEqual({ background: '#dddddd' })
  })
})
