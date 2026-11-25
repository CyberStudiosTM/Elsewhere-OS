import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { imageInfo, loadSkinPackage } from '../skinmapper/packageLoader'
import { SKIN_FORMAT } from '../skinmapper/schema'

/** A minimal PNG header for a w×h image (enough for header checks; not decoded). */
function png(width: number, height: number) {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}
function jpeg(width: number, height: number) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 0, 0])
}
const manifest = { format: SKIN_FORMAT, formatVersion: '1.0.0', id: 'test-skin', name: 'Test Skin', author: 'Eid', skinMapVersion: '1.0', preview: 'assets/preview/cover.png' }
const theme = { tokens: { accentColor: '#2f86cf' }, slots: { 'window.frame': { active: { backgroundImage: { path: 'assets/frames/frame.png', scale: 'nine-slice', slice: [8, 8, 8, 8] } } } } }
function pack(files: Record<string, Uint8Array>) { return zipSync(files) }
const good = () => ({
  'manifest.json': strToU8(JSON.stringify(manifest)),
  'theme.json': strToU8(JSON.stringify(theme)),
  'assets/preview/cover.png': png(320, 240),
  'assets/frames/frame.png': png(64, 64),
})

describe('image headers', () => {
  it('reads PNG and JPEG sizes and rejects other files', () => {
    expect(imageInfo(png(800, 600))).toEqual({ type: 'image/png', width: 800, height: 600 })
    expect(imageInfo(jpeg(1024, 768))).toEqual({ type: 'image/jpeg', width: 1024, height: 768 })
    expect(imageInfo(strToU8('<svg onload=alert(1)>'))).toBeNull()
  })
})

describe('skin package loader', () => {
  it('loads a valid package', () => {
    const result = loadSkinPackage(pack(good()))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.skin.manifest.name).toBe('Test Skin')
      expect(result.skin.images.size).toBe(2)
    }
  })
  it('rejects path tricks, scripts, extra files and duplicates', () => {
    const cases: Record<string, Uint8Array>[] = [
      { ...good(), '../evil.png': png(1, 1) },
      { ...good(), 'assets/icons/run.js': strToU8('alert(1)') },
      { ...good(), 'index.html': strToU8('<script>') },
      { ...good(), 'assets/icons/x.svg': strToU8('<svg/>') },
      { ...good(), 'Assets/Frames/Frame.PNG': png(64, 64) },
    ]
    for (const files of cases) expect(loadSkinPackage(pack(files)).ok, Object.keys(files).join(',')).toBe(false)
  })
  it('rejects fake images, missing files and huge images', () => {
    expect(loadSkinPackage(pack({ ...good(), 'assets/frames/frame.png': strToU8('not really a png') })).ok).toBe(false)
    const missing = good() as Record<string, Uint8Array>
    delete missing['assets/frames/frame.png']
    expect(loadSkinPackage(pack(missing)).ok).toBe(false)
    expect(loadSkinPackage(pack({ ...good(), 'assets/frames/frame.png': png(9000, 64) })).ok).toBe(false)
  })
  it('rejects unsafe theme values and non-zip files', () => {
    const bad = { ...theme, tokens: { background: 'url(https://evil.example/x.png)' } }
    expect(loadSkinPackage(pack({ ...good(), 'theme.json': strToU8(JSON.stringify(bad)) })).ok).toBe(false)
    expect(loadSkinPackage(strToU8('just text')).ok).toBe(false)
  })
  it('rejects zip bombs by declared and real size', () => {
    const huge = new Uint8Array(11 * 1024 * 1024)
    huge.set(png(64, 64))
    expect(loadSkinPackage(pack({ ...good(), 'assets/textures/big.png': huge })).ok).toBe(false)
  })
  it('notes unused images without failing', () => {
    const result = loadSkinPackage(pack({ ...good(), 'assets/icons/spare.png': png(16, 16) }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.skin.findings.some(item => item.severity === 'info' && /isn’t used/.test(item.message))).toBe(true)
  })
})
