// Reads the song title, artist, album and cover picture from an MP3's ID3v2 tag.
// Only reads; never changes the file. Anything it can't read is simply left out.

export type SongTags = { title?: string; artist?: string; album?: string; cover?: { type: string; bytes: Uint8Array } }

const synchsafe = (b: Uint8Array, i: number) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3]
const plain = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0

function decodeText(bytes: Uint8Array): string {
  if (!bytes.length) return ''
  const encoding = bytes[0]
  const body = bytes.subarray(1)
  let text: string
  if (encoding === 0) text = new TextDecoder('latin1').decode(body)
  else if (encoding === 1) text = new TextDecoder(body[0] === 0xfe ? 'utf-16be' : 'utf-16le').decode(body.subarray(body[0] === 0xff || body[0] === 0xfe ? 2 : 0))
  else if (encoding === 2) text = new TextDecoder('utf-16be').decode(body)
  else text = new TextDecoder('utf-8').decode(body)
  return text.replace(/\0+$/, '').split('\0')[0].trim().slice(0, 200)
}

/** Finds the end of a zero-terminated string in the given encoding. */
function skipString(bytes: Uint8Array, start: number, encoding: number) {
  const wide = encoding === 1 || encoding === 2
  for (let i = start; i < bytes.length - (wide ? 1 : 0); i += wide ? 2 : 1) {
    if (bytes[i] === 0 && (!wide || bytes[i + 1] === 0)) return i + (wide ? 2 : 1)
  }
  return bytes.length
}

export function readId3(bytes: Uint8Array): SongTags {
  const tags: SongTags = {}
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return tags
  const version = bytes[3]
  if (version < 3 || version > 4) return tags
  const flags = bytes[5]
  const end = Math.min(bytes.length, 10 + synchsafe(bytes, 6))
  let i = 10
  if (flags & 0x40) i += version === 4 ? synchsafe(bytes, 10) : plain(bytes, 10) + 4 // extended header
  while (i + 10 <= end) {
    const id = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3])
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const size = version === 4 ? synchsafe(bytes, i + 4) : plain(bytes, i + 4)
    const start = i + 10
    if (size <= 0 || start + size > end) break
    const frame = bytes.subarray(start, start + size)
    if (id === 'TIT2') tags.title = decodeText(frame) || undefined
    else if (id === 'TPE1') tags.artist = decodeText(frame) || undefined
    else if (id === 'TALB') tags.album = decodeText(frame) || undefined
    else if (id === 'APIC' && !tags.cover && frame.length > 4) {
      const encoding = frame[0]
      const mimeEnd = skipString(frame, 1, 0)
      const mime = new TextDecoder('latin1').decode(frame.subarray(1, mimeEnd - 1)).toLowerCase()
      const pictureStart = skipString(frame, mimeEnd + 1, encoding) // after picture type and description
      const picture = frame.subarray(pictureStart)
      const type = mime.includes('png') ? 'image/png' : 'image/jpeg'
      if (picture.length > 32) tags.cover = { type, bytes: picture.slice() }
    }
    i = start + size
  }
  return tags
}
