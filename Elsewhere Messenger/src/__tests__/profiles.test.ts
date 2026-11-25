import { describe, expect, it } from 'vitest'
import { blankDoc, normalizeDoc, safeImage, safeUrl } from '../profiles/profileRender'

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
    expect(doc.theme.pattern).toBe('none')
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
})
