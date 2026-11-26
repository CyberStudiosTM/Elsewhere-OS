import { describe, expect, it } from 'vitest'
import { blankDoc, normalizeDesign, normalizeDoc, safeImage, safeUrl } from '../profiles/profileRender'

describe('Elsewhere Profiles renderer safety', () => {
  it('only allows https links', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('http://example.com')).toBe('')
    expect(safeUrl('data:text/html,hi')).toBe('')
  })
  it('only allows small data: images or https pictures', () => {
    expect(safeImage('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(safeImage('data:image/svg+xml;base64,AAAA')).toBe('')
    expect(safeImage('data:image/png;base64,' + 'A'.repeat(500000))).toBe('')
  })
  it('turns any stored data into a complete, safe profile', () => {
    const doc = normalizeDoc({ layout: 'classic', theme: { bg: 'red; background:url(x)', font: 'Evil Font', pattern: 'nope' },
      about: 123, links: [{ label: 'ok', url: 'https://a.example' }, { label: 'bad', url: 'javascript:x' }], topFriends: ['a', 5, 'b'],
      sections: { guestbook: false }, extra: '<script>' })
    expect(doc.layout).toBe('classic')
    expect(doc.theme.bg).toBe(blankDoc('classic').theme.bg)
    expect(doc.theme.font).toBe('Verdana')
    expect(doc.theme.pattern).toBe(blankDoc('classic').theme.pattern)
    expect(doc.about).toBe('')
    expect(doc.links).toEqual([{ label: 'ok', url: 'https://a.example/' }])
    expect(doc.topFriends).toEqual(['a', 'b'])
    expect(doc.sections.guestbook).toBe(false)
    expect(doc.sections.about).toBe(true)
    expect(JSON.stringify(doc)).not.toContain('<script>')
  })
  it('starts both layouts with every module on', () => {
    for (const layout of ['classic', 'original'] as const) {
      const doc = blankDoc(layout)
      expect(Object.values(doc.sections).every(Boolean)).toBe(true)
      expect(doc.layout).toBe(layout)
    }
  })
  it('only keeps safe Visual Designer elements', () => {
    const d = normalizeDesign({ on: true, height: 99999999, elements: [
      { id: 'a', kind: 'button', x: 10, y: 20, w: 100, h: 40, z: 1, text: '<img src=x onerror=alert(1)>', href: 'javascript:alert(1)', style: { bg: 'red;position:fixed', color: '#ff00aa', size: 9999, font: 'Evil', anim: 'explode' } },
      { id: 'b', kind: 'image', x: 0, y: 0, w: 50, h: 50, z: 0, src: 'data:image/svg+xml;base64,AAAA', style: {} },
      { id: 'c', kind: 'script', x: 0, y: 0, w: 1, h: 1 },
      { id: 'd', kind: 'module', module: 'passwords', x: 0, y: 0, w: 1, h: 1 },
      { id: 'e', kind: 'module', module: 'friends', x: -99999, y: 5, w: 300, h: 200, z: 2, style: { shadow: 2 } },
    ] })
    expect(d.height).toBe(12000)
    expect(d.elements.map(e => e.id)).toEqual(['a', 'b', 'e'])
    const [button, image, friends] = d.elements
    expect(button.href).toBeUndefined()
    expect(button.style.bg).toBeUndefined()
    expect(button.style.color).toBe('#ff00aa')
    expect(button.style.size).toBe(160)
    expect(button.style.font).toBeUndefined()
    expect(button.style.anim).toBeUndefined()
    expect(image.src).toBeUndefined()
    expect(friends.x).toBe(-400)
  })
  it('keeps old profiles working with an empty, switched-off design', () => {
    const doc = normalizeDoc({ layout: 'classic' })
    expect(doc.design).toEqual({ on: false, height: 900, elements: [], pages: [], homeName: 'Home', adapt: 'reflow' })
  })
  it('keeps code blocks as plain text with size limits', () => {
    const big = 'x'.repeat(70000)
    const d = normalizeDesign({ elements: [{ id: 'c', kind: 'code', x: 0, y: 0, w: 300, h: 200, z: 0, code: { html: '<b>hi</b>', css: big, js: 42 }, href: 'https://a.example' }] })
    expect(d.elements[0].code).toEqual({ html: '<b>hi</b>', css: 'x'.repeat(60000), js: '' })
    expect(d.elements[0].href).toBeUndefined()
  })
  it('keeps pages tidy: unique links, page limits, safe interactions', () => {
    const d = normalizeDesign({ pages: [
      { name: 'Music!!', elements: [{ id: 'x', kind: 'text', x: 0, y: 0, w: 10, h: 10, global: true, on: { trigger: 'click', action: 'page', target: 'home' } }] },
      { name: 'music' }, { name: 'Home' },
      ...Array.from({ length: 20 }, (_, i) => ({ name: 'p' + i })),
    ], elements: [{ id: 'n', kind: 'nav', x: 0, y: 0, w: 300, h: 50, global: true, on: { trigger: 'explode', action: 'show', target: 'n' } }] })
    expect(d.pages.length).toBe(12)
    const slugs = d.pages.map(p => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs[0]).toBe('music')
    expect(slugs).not.toContain('home')
    expect(d.pages[0].elements[0].global).toBeUndefined()
    expect(d.pages[0].elements[0].on).toEqual({ trigger: 'click', action: 'page', target: 'home' })
    expect(d.elements[0].global).toBe(true)
    expect(d.elements[0].on).toBeUndefined()
    expect(d.adapt).toBe('reflow')
  })
})
