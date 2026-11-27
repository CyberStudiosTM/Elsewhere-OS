import { describe, expect, it } from 'vitest'
import { readId3 } from '../media/mediaTags'
import { formatTime, kindOf, titleFromName } from '../media/mediaLibrary'

function frame(id: string, body: number[]) {
  const size = body.length
  return [...id].map(c => c.charCodeAt(0)).concat([(size >> 24) & 255, (size >> 16) & 255, (size >> 8) & 255, size & 255, 0, 0], body)
}
const text = (value: string) => [3, ...new TextEncoder().encode(value)]
function tag(frames: number[]) {
  const size = frames.length
  const synch = [(size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127]
  return new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, ...synch, ...frames])
}

describe('song tags', () => {
  it('reads title, artist and album', () => {
    const tags = readId3(tag([...frame('TIT2', text('Glass Ocean')), ...frame('TPE1', text('Luma')), ...frame('TALB', text('Elsewhere'))]))
    expect(tags).toMatchObject({ title: 'Glass Ocean', artist: 'Luma', album: 'Elsewhere' })
  })
  it('reads a cover picture', () => {
    const picture = Array.from({ length: 40 }, (_, i) => i + 1)
    const apic = [0, ...new TextEncoder().encode('image/png'), 0, 3, 0, ...picture]
    const tags = readId3(tag(frame('APIC', apic)))
    expect(tags.cover?.type).toBe('image/png')
    expect(tags.cover?.bytes.length).toBe(40)
  })
  it('ignores files without a tag', () => {
    expect(readId3(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toEqual({})
  })
})

describe('media library helpers', () => {
  it('knows songs from videos', () => {
    expect(kindOf({ name: 'a.mp3', type: '' })).toBe('audio')
    expect(kindOf({ name: 'clip.MP4', type: '' })).toBe('video')
    expect(kindOf({ name: 'x.webm', type: 'audio/webm' })).toBe('audio')
    expect(kindOf({ name: 'notes.txt', type: 'text/plain' })).toBeNull()
  })
  it('makes a tidy title from a file name', () => {
    expect(titleFromName('my_song__final.mp3')).toBe('my song final')
  })
  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(158)).toBe('2:38')
    expect(formatTime(3725)).toBe('1:02:05')
  })
})
