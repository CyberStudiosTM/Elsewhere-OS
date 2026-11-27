import { describe, expect, it } from 'vitest'
import { CANVAS_PRESETS, blankDoc, frameLayer, resizeDoc, textLayer } from '../studio/studioModel'

describe('canvas resize', () => {
  it('has the Instagram presets', () => {
    expect(CANVAS_PRESETS.find(item => item.id === 'ig-post')).toMatchObject({ width: 1080, height: 1350 })
    expect(CANVAS_PRESETS.find(item => item.id === 'ig-story')).toMatchObject({ width: 1080, height: 1920 })
  })
  it('fits content inside a new size without cutting it off', () => {
    const doc = blankDoc(1000, 1000)
    doc.photoId = 'photo'
    const text = { ...textLayer(doc), x: 0, y: 0, w: 1000, h: 100, size: 50 }
    doc.layers = [text]
    const next = resizeDoc(doc, 1080, 1920, 'fit')
    expect(next.width).toBe(1080)
    expect(next.photoBox).toEqual({ x: 0, y: 420, w: 1080, h: 1080 })
    const moved = next.layers[0]
    expect(moved).toMatchObject({ x: 0, y: 420, w: 1080, h: 108 })
    if (moved.type === 'text') expect(moved.size).toBe(54)
  })
  it('keeps whole-picture frames covering the new canvas', () => {
    const doc = blankDoc(800, 600)
    doc.layers = [frameLayer(doc, 'polaroid')]
    const next = resizeDoc(doc, 1080, 1080, 'fill')
    expect(next.layers[0]).toMatchObject({ x: 0, y: 0, w: 1080, h: 1080 })
  })
  it('can change only the canvas and keep sizes', () => {
    const doc = blankDoc(100, 100)
    doc.layers = [{ ...textLayer(doc), x: 10, y: 10, w: 20, h: 20 }]
    const next = resizeDoc(doc, 200, 100, 'canvas')
    expect(next.layers[0]).toMatchObject({ x: 60, y: 10, w: 20, h: 20 })
  })
  it('never changes the original document', () => {
    const doc = blankDoc(100, 100)
    resizeDoc(doc, 50, 50, 'fit')
    expect(doc.width).toBe(100)
  })
})
