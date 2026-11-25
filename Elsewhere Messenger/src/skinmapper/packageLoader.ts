import { unzipSync, type UnzipFileInfo } from 'fflate'
import { validateManifest, validateTheme, type Finding, type SkinManifest, type SkinTheme } from './schema'

// SkinMapper Phase 2: opens an .eskin package (a zip; older .elsewhereskin files are the same format) and checks everything before
// anything is used. Nothing is executed, nothing outside the package is read, and a bad
// package is rejected as a whole, so the current skin always keeps working.

export const LIMITS = {
  compressedBytes: 50 * 1024 * 1024,
  unpackedBytes: 100 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024,
  assetCount: 300,
  imageSide: 4096,
  /** Total decoded pixels across all images (about 1 GB of RGBA at the maximum). */
  decodedPixels: 256 * 1024 * 1024,
  jsonBytes: 512 * 1024,
}

export type PackageImage = { path: string; type: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number; bytes: Uint8Array }
export type LoadedSkin = { manifest: SkinManifest; theme: SkinTheme; images: Map<string, PackageImage>; findings: Finding[] }
export type LoadResult = { ok: true; skin: LoadedSkin } | { ok: false; findings: Finding[] }

const ALLOWED_TOP = new Set(['manifest.json', 'theme.json'])
const ASSET_PATH = /^assets\/(frames|buttons|icons|textures|backgrounds|preview)\/[A-Za-z0-9 _.-]{1,120}\.(png|webp|jpe?g)$/i

/** Reads width and height from the file header, and confirms the real file type. */
export function imageInfo(bytes: Uint8Array): { type: PackageImage['type']; width: number; height: number } | null {
  const at = (i: number) => bytes[i]
  const u32be = (i: number) => ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0
  if (bytes.length > 24 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') {
    return { type: 'image/png', width: u32be(16), height: u32be(20) }
  }
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.slice(12, 16))
    if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + (at(24) | (at(25) << 8) | (at(26) << 16)), height: 1 + (at(27) | (at(28) << 8) | (at(29) << 16)) }
    if (chunk === 'VP8 ') return { type: 'image/webp', width: (at(26) | (at(27) << 8)) & 0x3fff, height: (at(28) | (at(29) << 8)) & 0x3fff }
    if (chunk === 'VP8L') {
      const b = bytes.slice(21, 25)
      return { type: 'image/webp', width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) }
    }
    return null
  }
  if (bytes.length > 4 && at(0) === 0xff && at(1) === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (at(i) !== 0xff) return null
      const marker = at(i + 1)
      const length = (at(i + 2) << 8) | at(i + 3)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'image/jpeg', height: (at(i + 5) << 8) | at(i + 6), width: (at(i + 7) << 8) | at(i + 8) }
      }
      if (length < 2) return null
      i += 2 + length
    }
  }
  return null
}

function parseJson(bytes: Uint8Array | undefined, name: string, findings: Finding[]) {
  if (!bytes) { findings.push({ severity: 'error', message: `${name} is missing.`, path: name }); return null }
  if (bytes.length > LIMITS.jsonBytes) { findings.push({ severity: 'error', message: `${name} is too large.`, path: name }); return null }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
  catch { findings.push({ severity: 'error', message: `${name} isn’t valid JSON.`, path: name }); return null }
}

/** Every image path a theme refers to. */
function referencedPaths(manifest: SkinManifest | null, theme: SkinTheme | null) {
  const paths = new Set<string>()
  if (manifest?.preview) paths.add(manifest.preview)
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const ref = value as { path?: unknown; path2x?: unknown }
    if (typeof ref.path === 'string') paths.add(ref.path)
    if (typeof ref.path2x === 'string') paths.add(ref.path2x)
    for (const child of Object.values(value as Record<string, unknown>)) visit(child)
  }
  visit(theme)
  return paths
}

export function loadSkinPackage(bytes: Uint8Array): LoadResult {
  const findings: Finding[] = []
  const fail = (message: string, path?: string): LoadResult => ({ ok: false, findings: [...findings, { severity: 'error', message, path }] })
  if (bytes.length > LIMITS.compressedBytes) return fail('This skin package is larger than 50 MB.')

  // Check the zip's table of contents before unpacking anything.
  const seen = new Set<string>()
  let declaredTotal = 0
  let entryProblem = ''
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (file: UnzipFileInfo) => {
        const name = file.name
        if (name.endsWith('/')) return false
        if (entryProblem) return false
        if (/^[\\/]|\\|^[A-Za-z]:|(^|\/)\.\.(\/|$)|\0/.test(name)) { entryProblem = `Unsafe file path in package: "${name}".`; return false }
        const key = name.toLowerCase()
        if (seen.has(key)) { entryProblem = `The package has two files named "${name}".`; return false }
        seen.add(key)
        if (!ALLOWED_TOP.has(name) && !ASSET_PATH.test(name)) { entryProblem = `"${name}" isn’t allowed in a skin package (only manifest.json, theme.json and PNG, WebP or JPEG images in assets/).`; return false }
        if (seen.size > LIMITS.assetCount + 2) { entryProblem = 'The package has more than 300 images.'; return false }
        declaredTotal += file.originalSize
        if (file.originalSize > (ALLOWED_TOP.has(name) ? LIMITS.jsonBytes : LIMITS.imageBytes)) { entryProblem = `"${name}" is too large.`; return false }
        if (declaredTotal > LIMITS.unpackedBytes) { entryProblem = 'The package unpacks to more than 100 MB.'; return false }
        return true
      },
    })
  } catch {
    return fail('This file isn’t a readable skin package.')
  }
  if (entryProblem) return fail(entryProblem)

  // Never trust the declared sizes alone (zip bombs can lie): check the real sizes too.
  let actualTotal = 0
  for (const [name, data] of Object.entries(files)) {
    actualTotal += data.length
    if (data.length > (ALLOWED_TOP.has(name) ? LIMITS.jsonBytes : LIMITS.imageBytes)) return fail(`"${name}" is too large.`, name)
  }
  if (actualTotal > LIMITS.unpackedBytes) return fail('The package unpacks to more than 100 MB.')

  const manifest = parseJson(files['manifest.json'], 'manifest.json', findings) as SkinManifest | null
  const theme = parseJson(files['theme.json'], 'theme.json', findings) as SkinTheme | null
  if (manifest) findings.push(...validateManifest(manifest))
  if (theme) findings.push(...validateTheme(theme))

  const images = new Map<string, PackageImage>()
  let pixels = 0
  for (const [name, data] of Object.entries(files)) {
    if (ALLOWED_TOP.has(name)) continue
    const info = imageInfo(data)
    if (!info) { findings.push({ severity: 'error', message: `"${name}" isn’t a real PNG, WebP or JPEG image.`, path: name }); continue }
    const extension = name.split('.').pop()!.toLowerCase()
    const expected = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg'
    if (info.type !== expected) findings.push({ severity: 'warning', message: `"${name}" is actually ${info.type.replace('image/', '').toUpperCase()}; it will be read as that.`, path: name })
    if (!info.width || !info.height || info.width > LIMITS.imageSide || info.height > LIMITS.imageSide) {
      findings.push({ severity: 'error', message: `"${name}" is ${info.width}×${info.height}; images can be up to 4096 pixels per side.`, path: name })
      continue
    }
    pixels += info.width * info.height
    images.set(name, { path: name, bytes: data, ...info })
  }
  if (pixels > LIMITS.decodedPixels) findings.push({ severity: 'error', message: 'The images are too large in total to load safely.' })

  for (const path of referencedPaths(manifest, theme)) {
    if (!images.has(path)) findings.push({ severity: 'error', message: `The skin uses "${path}", but it isn’t in the package.`, path })
  }
  for (const path of images.keys()) {
    if (!referencedPaths(manifest, theme).has(path)) findings.push({ severity: 'info', message: `"${path}" isn’t used by the skin.`, path })
  }

  if (!manifest || !theme || findings.some(item => item.severity === 'error')) return { ok: false, findings }
  return { ok: true, skin: { manifest, theme, images, findings } }
}
