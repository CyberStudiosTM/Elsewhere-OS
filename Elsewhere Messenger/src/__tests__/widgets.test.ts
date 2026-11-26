import { describe, expect, it } from 'vitest'
import { compileWidget, normalizeWidgetPackage, widgetValues } from '../profiles/profileRender'
import { OFFICIAL_WIDGETS } from '../profiles/widgetLibrary'

describe('Widgets Studio packages', () => {
  it('official widgets are valid packages whose code parses', () => {
    for (const w of OFFICIAL_WIDGETS) {
      const pkg = normalizeWidgetPackage(w)!
      expect(pkg.props.length, w.name).toBe(w.props.length)
      const out = compileWidget({ pkg, values: widgetValues(pkg, {}) })
      expect(() => new Function(out.js), w.name).not.toThrow()
      expect(out.html, w.name).not.toMatch(/\{\{\s*[a-z]/i)
      expect(out.css, w.name).not.toMatch(/\{\{\s*[a-z]/i)
    }
  })
  it('escapes settings so they cannot inject HTML, CSS or script', () => {
    const pkg = normalizeWidgetPackage({ name: 'x', props: [{ key: 'name', label: 'n', type: 'text', default: '' }, { key: 'c', label: 'c', type: 'color', default: '#000000' }],
      code: { html: '<p>{{name}}</p>', css: 'p{color:{{c}}} p::after{content:"{{name}}"}', js: 'void props' } })!
    const out = compileWidget({ pkg, values: { name: '<img src=x onerror=alert(1)>";}</style><script>alert(1)</script>', c: 'red;background:url(x)' } })
    expect(out.html).not.toContain('<img')
    expect(out.html).toContain('&lt;img')
    expect(out.css).toContain('color:#000000')
    expect(out.css).not.toMatch(/<\/style>|[;{}]alert/)
    expect(out.js).not.toContain('</script>')
  })
  it('checks each instance setting against its declared type and range', () => {
    const pkg = normalizeWidgetPackage(OFFICIAL_WIDGETS.find(w => w.id === 'pocket-pet'))!
    const v = widgetValues(pkg, { size: 9999, face: 'not-a-pet', color: 'blue', extra: 'dropped' })
    expect(v.size).toBe(120)
    expect(v.face).toBe('🐰')
    expect(v.color).toBe('#ffd1e6')
    expect('extra' in v).toBe(false)
  })
  it('drops bad property definitions', () => {
    const pkg = normalizeWidgetPackage({ props: [{ key: '1bad', type: 'text' }, { key: 'ok', type: 'script' }, { key: 'fine', type: 'number', min: 0, max: 5, default: 99 }, { key: 'fine', type: 'text' }] })!
    expect(pkg.props.map(p => p.key)).toEqual(['fine'])
    expect(pkg.props[0].default).toBe(5)
  })
})
