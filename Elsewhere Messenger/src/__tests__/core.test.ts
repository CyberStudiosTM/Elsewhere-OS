import { describe, expect, it } from 'vitest'
import { ELSEWHERE_GROUP_PREFIX, elsewhereGroupId, groupTitle } from '../services/elsewhereGroups'
import { instagramRecentGroup, sortInstagramThreads } from '../services/instagramContactPreferences'
import { blankDoc, frameLayer, stickerLayer, textLayer, FILTERS } from '../studio/studioModel'
import { matchesSocialService, serviceForContact } from '../components/SocialServiceFilter'

const id = '11111111-2222-3333-4444-555555555555'

describe('group chat ids and titles', () => {
  it('reads a group id only from a valid group contact id', () => {
    expect(elsewhereGroupId(ELSEWHERE_GROUP_PREFIX + id)).toBe(id)
    expect(elsewhereGroupId('elsewhere-user:' + id)).toBeNull()
    expect(elsewhereGroupId(ELSEWHERE_GROUP_PREFIX + 'not-a-uuid')).toBeNull()
    expect(elsewhereGroupId(null)).toBeNull()
  })
  it('uses the name when set, otherwise the other members', () => {
    const handles = { a: 'sunny', b: 'pool', c: 'cloud', d: 'glow' }
    expect(groupTitle({ name: 'besties', members: ['me', 'a'] }, 'me', handles)).toBe('besties')
    expect(groupTitle({ name: null, members: ['me', 'a', 'b'] }, 'me', handles)).toBe('@sunny, @pool')
    expect(groupTitle({ name: null, members: ['me', 'a', 'b', 'c', 'd'] }, 'me', handles)).toBe('@sunny, @pool +2')
    expect(groupTitle({ name: null, members: ['me'] }, 'me', handles)).toBe('Group chat')
  })
})

describe('social service filter', () => {
  it('sorts contacts into services by id', () => {
    expect(serviceForContact('instagram:123')).toBe('instagram')
    expect(serviceForContact('discord:9')).toBe('discord')
    expect(serviceForContact(ELSEWHERE_GROUP_PREFIX + id)).toBe('elsewhere')
    expect(matchesSocialService('discord:9', 'instagram')).toBe(false)
    expect(matchesSocialService('discord:9', 'all')).toBe(true)
  })
})

describe('Instagram contact sorting', () => {
  it('puts recent chats first and old ones in Other Contacts', () => {
    const now = Date.parse('2026-11-21T12:00:00Z')
    const recent = { id: 'r', updated_time: '2026-11-20T12:00:00Z' }
    const old = { id: 'o', updated_time: '2026-10-01T12:00:00Z' }
    const appearance = { defaultColor: '#87E7C0', contacts: { o: { color: '#ff00aa', favorite: false } } }
    expect(instagramRecentGroup(recent, appearance, now)).toBe('Buddies')
    expect(instagramRecentGroup(old, appearance, now)).toBe('Other Contacts')
    expect(sortInstagramThreads([old, recent], appearance).map(t => t.id)).toEqual(['r', 'o'])
  })
  it('keeps starred people in Buddies and on top', () => {
    const now = Date.parse('2026-11-21T12:00:00Z')
    const starred = { defaultColor: '#87E7C0', contacts: { o: { color: '#ff00aa', favorite: true } } }
    const old = { id: 'o', updated_time: '2026-10-01T12:00:00Z' }
    const recent = { id: 'r', updated_time: '2026-11-20T12:00:00Z' }
    expect(instagramRecentGroup(old, starred, now)).toBe('Buddies')
    expect(sortInstagramThreads([recent, old], starred).map(t => t.id)).toEqual(['o', 'r'])
  })
})

describe('Studio model', () => {
  it('centers new layers and keeps frames full-size', () => {
    const doc = blankDoc(1000, 800)
    const sticker = stickerLayer(doc, '♡')
    expect(sticker.x + sticker.w / 2).toBe(500)
    expect(sticker.y + sticker.h / 2).toBe(400)
    const frame = frameLayer(doc, 'polaroid')
    expect([frame.x, frame.y, frame.w, frame.h]).toEqual([0, 0, 1000, 800])
    expect(textLayer(doc).text.length).toBeGreaterThan(0)
  })
  it('never changes the photo for the Original filter', () => {
    expect(FILTERS.none.css(1)).toBe('none')
    expect(FILTERS['soft-mono'].css(0)).toContain('grayscale(0)')
  })
})
