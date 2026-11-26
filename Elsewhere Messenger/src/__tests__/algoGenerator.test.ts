import { describe, expect, it } from 'vitest'
import { interpret } from '../profiles/algo/parser'
import { INSPIRATION, generate, validate } from '../profiles/algo/generator'

const kinds = (text: string) => interpret(text).pieces.map(p => p.concept)

describe('Algorithmic Intelligence · interpretation', () => {
  it('understands synonyms the same way', () => {
    expect(kinds('glittery title')).toEqual(['heading'])
    expect(interpret('glittery title').pieces[0].effects).toContain('sparkle')
    expect(interpret('sparkling heading').pieces[0].effects).toContain('sparkle')
  })
  it('fixes small typos', () => {
    const r = interpret('sparkely pnik buton')
    expect(r.pieces.map(p => p.concept)).toEqual(['button'])
    expect(r.pieces[0].colors).toContain('#ff5fa2')
    expect(r.corrections.length).toBeGreaterThan(0)
  })
  it('reads colors, hex codes, numbers and quoted text', () => {
    const r = interpret('a #00ff99 progress bar at 45 percent that says "loading cuteness"')
    expect(r.pieces[0].concept).toBe('progress')
    expect(r.pieces[0].colors).toEqual(['#00ff99'])
    expect(r.pieces[0].count).toBe(45)
    expect(r.pieces[0].text).toBe('loading cuteness')
  })
  it('handles several things in one request', () => {
    expect(kinds('a clock and falling stars, plus a dropdown menu')).toEqual(['clock', 'falling', 'dropdown'])
  })
  it('respects negation', () => {
    const r = interpret('pink falling hearts without animation')
    expect(r.pieces[0].no.has('animation')).toBe(true)
    expect(kinds('a heading, no button')).toEqual(['heading'])
  })
  it('understands particles for falling and trails', () => {
    expect(interpret('snow falling').pieces[0].particle).toBe('❄')
    const trail = interpret('heart cursor trail').pieces[0]
    expect(trail.concept).toBe('trail')
    expect(trail.particle).toBe('♥')
  })
  it('picks up an aesthetic', () => {
    expect(interpret('gothic clock').aesthetic).toBe('gothic')
  })
  it('is honest about unsupported and ambiguous requests', () => {
    expect(interpret('build me a spaceship simulator').outcome).toBe('unsupported')
    expect(interpret('make it pink').outcome).toBe('ambiguous')
    const partial = interpret('sparkly heading with quantum flux')
    expect(partial.outcome).toBe('partial')
    expect(partial.unknown).toContain('quantum')
  })
  it('never fakes real Elsewhere data', () => {
    const r = interpret('show my top friends')
    expect(r.notes.join(' ')).toMatch(/Top Friends piece/)
  })
})

describe('Algorithmic Intelligence · generated code', () => {
  it('every inspiration idea produces valid, safe code', () => {
    for (const idea of INSPIRATION) {
      const out = generate(idea)
      expect(out.made.length, idea).toBeGreaterThan(0)
      expect(out.problems, idea).toEqual([])
    }
  })
  it('is reproducible and keeps ids unique when combined', () => {
    expect(generate('sparkly heading').html).toBe(generate('sparkly heading').html)
    const out = generate('a clock and a clock and a button')
    expect(validate(out.html, out.css, out.js)).toEqual([])
  })
  it('escapes text so quotes cannot inject HTML', () => {
    const out = generate('heading that says "<img src=x onerror=alert(1)>"')
    expect(out.html).not.toContain('<img src=x')
    expect(out.html).toContain('&lt;img')
  })
  it('caps particles and honors reduced motion', () => {
    const out = generate('500 falling hearts')
    expect(out.js).toContain('i < 40')
    expect(out.css).toContain('prefers-reduced-motion')
  })
  it('flags blocked APIs', () => {
    expect(validate('', '', 'fetch("https://x")')).not.toEqual([])
  })
})
