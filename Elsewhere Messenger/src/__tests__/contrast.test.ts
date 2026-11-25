import { describe, expect, it } from 'vitest'
import { contrastFindings, contrastRatio, parseColor } from '../skinmapper/contrast'

describe('readability checks', () => {
  it('measures contrast like WCAG', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0)
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5)
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30])
    expect(parseColor('linear-gradient(red, blue)')).toBeNull()
  })
  it('warns about hard-to-read parts and names the part', () => {
    const found = contrastFindings({ tokens: {}, slots: { 'chat.send': { normal: { background: '#e8578a', textColor: '#f39bbb' } } } })
    const warning = found.find(item => item.severity === 'warning' && item.slot === 'chat.send')
    expect(warning?.message).toMatch(/hard to tell apart/)
  })
  it('stays quiet for readable parts and untouched defaults', () => {
    expect(contrastFindings({ tokens: {} })).toEqual([])
    expect(contrastFindings({ tokens: {}, slots: { 'chat.send': { normal: { background: '#0850b4', textColor: '#ffffff' } } } })
      .filter(item => item.severity === 'warning' && item.slot === 'chat.send')).toEqual([])
  })
  it('asks for an eye check when there is an image behind text', () => {
    const found = contrastFindings({ tokens: {}, slots: { 'chat.transcript': { normal: { backgroundImage: { path: 'assets/textures/stars.png' }, textColor: '#333333' } } } })
    expect(found.some(item => item.severity === 'info' && item.slot === 'chat.transcript')).toBe(true)
  })
})
