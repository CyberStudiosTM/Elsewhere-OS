// Adds the user's collected old-web graphics to the built-in Elsewhere Collection.
//
//   node scripts/import-treasures.mjs            (dry run: shows what would be added)
//   node scripts/import-treasures.mjs --write    (copies files and updates the manifest)
//
// Put packs in  elsewhere messenger/assets-incoming/<category>/<pack name>/  where <category> is one of:
// blinkies, buttons, stamps, glitter, gifs, graphics, dolls, dividers, companions, greetings
// (aliases: "web treasures" → stamps, "stickers" → companions).
//
// GIFs and graphics can sit directly in their category or in nested theme folders.
//
// Credits come from, in order:
//   1. credits.txt in the pack folder:  creator: …  /  source: https://…  /  license: …  (any lines may be missing)
//   2. the hidden "Zone.Identifier" download note Windows adds when you save an image from a browser
//      (ReferrerUrl = the page it came from, HostUrl = the image link). The creator is guessed from the
//      site name (e.g. someartist.neocities.org → someartist) and marked as a guess.
// Images with no credit info at all are listed at the end so you can fill in credits.txt for them.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const CATEGORIES = ['blinkies', 'buttons', 'stamps', 'glitter', 'gifs', 'graphics', 'dolls', 'dividers', 'companions', 'greetings']
const ALIASES = { 'web treasures': 'stamps', 'web-treasures': 'stamps', stickers: 'companions', stationery: 'greetings', frames: 'dividers' }
const IMAGE = /\.(png|gif|webp|jpe?g)$/i

function slug(text) { return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'treasure' }

/** Width/height from the file header (PNG, GIF, JPEG, WebP), plus whether a GIF is animated. */
function imageInfo(bytes) {
  const u32 = i => bytes.readUInt32BE(i)
  if (bytes.slice(1, 4).toString() === 'PNG') return { width: u32(16), height: u32(20), animated: bytes.includes(Buffer.from('acTL')) }
  if (bytes.slice(0, 3).toString() === 'GIF') {
    let frames = 0
    for (let i = 0; i < bytes.length - 1 && frames < 2; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) frames++
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), animated: frames > 1 }
  }
  if (bytes.slice(0, 4).toString() === 'RIFF' && bytes.slice(8, 12).toString() === 'WEBP') {
    const chunk = bytes.slice(12, 16).toString()
    if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), animated: Boolean(bytes[20] & 2) }
    if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, animated: false }
    if (chunk === 'VP8L') { const b = bytes.slice(21, 25); return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)), animated: false } }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      const marker = bytes[i + 1]
      const length = bytes.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7), animated: false }
      i += 2 + length
    }
  }
  return null
}

/** Reads Windows' hidden download note, if the file still has it. */
function downloadNote(file) {
  try {
    const text = readFileSync(file + ':Zone.Identifier', 'utf8')
    const value = key => (text.match(new RegExp(`^${key}=(.+)$`, 'm')) || [])[1]?.trim()
    return { referrer: value('ReferrerUrl'), host: value('HostUrl') }
  } catch { return {} }
}
function creatorFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const sub = host.match(/^([a-z0-9-]+)\.(neocities\.org|tumblr\.com|carrd\.co|deviantart\.com|nekoweb\.org)$/)
    if (sub) return sub[1]
    const path = new URL(url).pathname.split('/').filter(Boolean)
    if (/deviantart\.com$|tumblr\.com$/.test(host) && path[0]) return path[0]
    return host
  } catch { return '' }
}
function readCredits(folder) {
  const file = join(folder, 'credits.txt')
  if (!existsSync(file)) return {}
  const text = readFileSync(file, 'utf8')
  const value = key => (text.match(new RegExp(`^\\s*${key}\\s*[:=]\\s*(.+)$`, 'im')) || [])[1]?.trim()
  return { creator: value('creator'), source: value('source'), license: value('license') || value('terms') }
}

function* themeFolders(root, pack = '') {
  yield pack
  for (const entry of readdirSync(join(root, pack), { withFileTypes: true })) {
    if (entry.isDirectory()) yield* themeFolders(root, pack ? pack + '/' + entry.name : entry.name)
  }
}

export function collectTreasures(code, write = false) {
  const incoming = join(code, '..', 'assets-incoming')
  const target = join(code, 'public', 'web-treasures')
  const manifestPath = join(target, 'manifest.json')
  const original = readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(original)
  const ids = new Set(manifest.entries.map(entry => entry.id))
  const added = []
  const sources = new Map()
  const claimed = new Set()
  const needCredits = []
  const skipped = []

  for (const folderName of existsSync(incoming) ? readdirSync(incoming) : []) {
    const category = CATEGORIES.includes(folderName.toLowerCase()) ? folderName.toLowerCase() : ALIASES[folderName.toLowerCase()]
    const folderPath = join(incoming, folderName)
    if (!statSync(folderPath).isDirectory()) continue
    if (!category) { skipped.push(`${folderName}/ (unknown category; use one of: ${CATEGORIES.join(', ')})`); continue }
    const packs = readdirSync(folderPath).filter(name => statSync(join(folderPath, name)).isDirectory())
    const nested = category === 'gifs' || category === 'graphics'
    const folders = nested ? themeFolders(folderPath) : packs.length ? packs : ['']
    for (const pack of folders) {
      const packPath = join(folderPath, pack)
      const credits = readCredits(packPath)
      for (const entryFile of readdirSync(packPath, { withFileTypes: true })) {
        if (!entryFile.isFile()) continue
        const file = entryFile.name
        if (!(category === 'gifs' ? /\.gif$/i : IMAGE).test(file)) continue
        const full = join(packPath, file)
        const bytes = readFileSync(full)
        let info
        try { info = imageInfo(bytes) } catch { /* Incomplete image during a save. */ }
        if (!info || !info.width || !info.height || info.width > 4096 || info.height > 4096 || bytes.length > 12 * 1024 * 1024) { skipped.push(`${full} (not a readable image, or too big)`); continue }
        const note = downloadNote(full)
        const source = credits.source || [note.referrer, note.host].find(url => /^https?:\/\//i.test(url || '')) || ''
        const guessed = !credits.creator && source ? creatorFromUrl(source) : ''
        const creator = credits.creator || (guessed ? `${guessed} (from download info)` : '')
        const license = credits.license || 'Shared old-web resource. All rights belong to the original creator.'
        const sourceKey = [folderName, pack, file].filter(Boolean).join('/')
        const stem = slug(`${pack || category}-${basename(file, extname(file))}`)
        const name = basename(file, extname(file)).replace(/[-_]+/g, ' ').slice(0, 120)
        const prior = manifest.entries.find(e => e.sourceKey === sourceKey) ||
          manifest.entries.find(e => !e.sourceKey && !claimed.has(e.id) && e.category === category &&
            e.name === name && (!pack || e.tags.includes(pack.toLowerCase().slice(0, 40))) &&
            extname(e.file).toLowerCase() === extname(file).toLowerCase() &&
            (e.id === stem || (e.id.startsWith(stem + '-') && /^\d+$/.test(e.id.slice(stem.length + 1)))))
        let id = prior?.id || stem
        for (let suffix = 2; !prior && ids.has(id); suffix++) id = stem + '-' + suffix
        claimed.add(id)
        ids.add(id)
        const fileName = `${category}/${id}${extname(file).toLowerCase()}`
        const entry = { id, name, sourceKey, category, file: fileName,
          tags: [...pack.split('/'), category].filter(Boolean).map(tag => tag.toLowerCase().slice(0, 40)), creator: creator || 'Unknown creator',
          source: source || 'Unknown source', license, animated: info.animated, width: info.width, height: info.height }
        sources.set(fileName, full)
        if (prior) Object.assign(prior, entry)
        else { manifest.entries.push(entry); added.push(entry) }
        if (!creator || !source) needCredits.push(full)
        if (write) {
          mkdirSync(join(target, category), { recursive: true })
          const dest = join(target, fileName)
          if (!existsSync(dest) || !bytes.equals(readFileSync(dest))) copyFileSync(full, dest)
        }
      }
    }
  }
  if (write) {
    const next = JSON.stringify(manifest, null, 2) + '\n'
    if (next !== original) writeFileSync(manifestPath, next)
  }
  return { manifest, sources, added, needCredits, skipped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const write = process.argv.includes('--write')
  const { added, needCredits, skipped } = collectTreasures(join(import.meta.dirname, '..'), write)
  console.log(`${write ? 'Added' : 'Would add'} ${added.length} treasure(s).`)
  for (const entry of added.slice(0, 40)) console.log(`  ${entry.category}/${entry.name} · ${entry.creator} · ${entry.source}`)
  if (added.length > 40) console.log(`  …and ${added.length - 40} more`)
  if (needCredits.length) { console.log(`\n${needCredits.length} image(s) have no creator or source. Add a credits.txt to their pack folder:`); needCredits.slice(0, 30).forEach(file => console.log('  ' + file)) }
  if (skipped.length) { console.log('\nSkipped:'); skipped.forEach(line => console.log('  ' + line)) }
  if (!write && added.length) console.log('\nRun again with --write to add them.')
}
