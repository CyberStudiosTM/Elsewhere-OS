import { describe, expect, it } from 'vitest'
import { cutout, edgeColor } from '../studio/backgroundRemover'

// A white 8×8 picture with a red 4×4 square in the middle, and one white pixel inside the red.
function picture() {
  const w = 8, h = 8
  const data = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    const x = p % w, y = Math.floor(p / w)
    const red = x >= 2 && x < 6 && y >= 2 && y < 6
    data.set(red ? [220, 20, 30, 255] : [255, 255, 255, 255], p * 4)
  }
  data.set([255, 255, 255, 255], (3 * w + 3) * 4) // white hole inside the art, not touching the edge
  return { data, w, h }
}
const alpha = (data: Uint8ClampedArray, w: number, x: number, y: number) => data[(y * w + x) * 4 + 3]

describe('background remover', () => {
  it('finds the edge color', () => {
    const { data, w, h } = picture()
    expect(edgeColor(data, w, h)).toEqual([252, 252, 252])
  })
  it('clears only the background touching the edges', () => {
    const { data, w, h } = picture()
    cutout(data, w, h)
    expect(alpha(data, w, 0, 0)).toBe(0)
    expect(alpha(data, w, 7, 7)).toBe(0)
    expect(alpha(data, w, 2, 2)).toBe(255) // the art stays
    expect(alpha(data, w, 3, 3)).toBe(255) // same color inside the art stays
  })
  it('can clear a color everywhere', () => {
    const { data, w, h } = picture()
    cutout(data, w, h, { everywhere: true })
    expect(alpha(data, w, 3, 3)).toBe(0)
    expect(alpha(data, w, 2, 2)).toBe(255)
  })
  it('removes the color under a picked point', () => {
    const { data, w, h } = picture()
    cutout(data, w, h, { point: { x: 4, y: 4 } })
    expect(alpha(data, w, 4, 4)).toBe(0)
    expect(alpha(data, w, 0, 0)).toBe(255)
  })
  it('does nothing when the border is already clear', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)
    expect(cutout(data, 4, 4)).toBe(0)
  })
})
