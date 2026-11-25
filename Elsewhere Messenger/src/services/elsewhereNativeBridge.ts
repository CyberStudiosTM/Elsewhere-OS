import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ELSEWHERE_BUDDY_PREFIX, loadCloudHistory, lookupCloudProfiles, sendCloudMedia, sendCloudMessage, sendCloudNudge,
  type CloudMessage, type CloudProfile,
} from './connectedClient'
import { elsewhereMediaUrl, prepareElsewhereMedia } from './elsewhereMedia'
import {
  addCloudGroupMember, createCloudGroup, leaveCloudGroup, loadCloudGroup, loadCloudGroupHistory, renameCloudGroup,
  sendCloudGroupMessage, type CloudGroup, type CloudGroupMessage,
} from './elsewhereGroups'
import { loadCloudFriends } from './connectedClient'
import type { MediaRef } from './messengerMedia'

/** The main window holds the Elsewhere sign-in. Chat windows ask it for one
 * conversation at a time and receive new messages; no token leaves main. */
const REQUEST = 'elsewhere:cloud:bridge-request'
const RESPONSE = 'elsewhere:cloud:bridge-response'
const INCOMING = 'elsewhere:cloud:incoming'
const GROUP_INCOMING = 'elsewhere:cloud:group-incoming'
const CHAT_WINDOWS = ['classic-chat', 'dead-signal-chat'] as const
type ChatWindow = typeof CHAT_WINDOWS[number]
type Action = 'history' | 'send' | 'nudge' | 'media' | 'media-url'
  | 'friends' | 'group-history' | 'group-send' | 'group-media' | 'group-create' | 'group-add' | 'group-leave' | 'group-rename'
type Request = {
  requestId: string; origin: ChatWindow; action: Action; personId: string; text?: string; clientId?: string; media?: MediaRef; path?: string
  groupId?: string; people?: string[]; name?: string; kind?: 'message' | 'nudge' | 'gif'
}
type Response = {
  requestId: string; ok: boolean; error?: string; userId?: string; profile?: CloudProfile | null; messages?: CloudMessage[]; message?: CloudMessage; url?: string
  friends?: CloudProfile[]; group?: CloudGroup | null; members?: CloudProfile[]; groupMessages?: CloudGroupMessage[]; groupMessage?: CloudGroupMessage; createdGroupId?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const elsewherePersonId = (contactId: string | null | undefined) =>
  contactId?.startsWith(ELSEWHERE_BUDDY_PREFIX) ? contactId.slice(ELSEWHERE_BUDDY_PREFIX.length) : null
const isMainWindow = () => !isTauri() || getCurrentWindow().label === 'main'
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

async function performGroup(userId: string, request: Omit<Request, 'requestId' | 'origin'>): Promise<Omit<Response, 'requestId' | 'ok'>> {
  if (request.action === 'friends') {
    const rows = await loadCloudFriends()
    const ids = rows.filter(row => row.accepted_at).map(row => row.user_a === userId ? row.user_b : row.user_a)
    return { userId, friends: ids.length ? await lookupCloudProfiles(ids) : [] }
  }
  if (request.action === 'group-create') {
    const people = (request.people || []).filter(id => UUID.test(id))
    const made = await createCloudGroup(people, request.name)
    return { userId, createdGroupId: made.id }
  }
  const groupId = request.groupId || ''
  if (!UUID.test(groupId)) throw new Error('Unknown group chat.')
  if (request.action === 'group-history') {
    const group = await loadCloudGroup(groupId)
    if (!group) return { userId, group: null, members: [], groupMessages: [] }
    const [members, groupMessages] = await Promise.all([lookupCloudProfiles(group.members), loadCloudGroupHistory(groupId)])
    return { userId, group, members, groupMessages }
  }
  if (request.action === 'group-add') {
    for (const person of (request.people || []).filter(id => UUID.test(id))) await addCloudGroupMember(groupId, person)
    return { userId }
  }
  if (request.action === 'group-leave') { await leaveCloudGroup(groupId); return { userId } }
  if (request.action === 'group-rename') { await renameCloudGroup(groupId, (request.name || '').slice(0, 60)); return { userId } }
  if (request.action === 'group-media') {
    if (!request.media) throw new Error('Choose a photo or GIF.')
    const prepared = await prepareElsewhereMedia(userId, 'group-' + groupId, request.media)
    const clientId = request.clientId && UUID.test(request.clientId) ? request.clientId : crypto.randomUUID()
    return { userId, groupMessage: await sendCloudGroupMessage(groupId, prepared.body, clientId, prepared.kind) }
  }
  // group-send
  const kind = request.kind === 'nudge' || request.kind === 'gif' ? request.kind : 'message'
  const text = kind === 'nudge' ? 'Nudge' : (request.text || '').trim()
  if (!text || text.length > 16000) throw new Error('Message is empty or too long.')
  const clientId = request.clientId && UUID.test(request.clientId) ? request.clientId : crypto.randomUUID()
  return { userId, groupMessage: await sendCloudGroupMessage(groupId, text, clientId, kind) }
}

async function perform(userId: string, request: Omit<Request, 'requestId' | 'origin'>): Promise<Omit<Response, 'requestId' | 'ok'>> {
  if (request.action === 'friends' || request.action.startsWith('group-')) return performGroup(userId, request)
  if (!UUID.test(request.personId)) throw new Error('Unknown Elsewhere contact.')
  if (request.action === 'history') {
    const [profile] = await lookupCloudProfiles([request.personId])
    return { userId, profile: profile || null, messages: await loadCloudHistory(userId, request.personId) }
  }
  if (request.action === 'media-url') return { userId, url: await elsewhereMediaUrl(userId, request.path || '') }
  const clientId = request.clientId && UUID.test(request.clientId) ? request.clientId : crypto.randomUUID()
  if (request.action === 'media') {
    if (!request.media) throw new Error('Choose a photo or GIF.')
    const prepared = await prepareElsewhereMedia(userId, request.personId, request.media)
    return { userId, message: await sendCloudMedia(request.personId, prepared.kind, prepared.body, clientId) }
  }
  if (request.action === 'nudge') return { userId, message: await sendCloudNudge(request.personId, clientId) }
  const text = (request.text || '').trim()
  if (!text || text.length > 16000) throw new Error('Message is empty or too long.')
  return { userId, message: await sendCloudMessage(request.personId, text, clientId) }
}

/** Runs in the main window: answers chat windows and forwards new messages. */
export function useElsewhereBridgeHost(userId: string) {
  useEffect(() => {
    if (!isTauri() || !userId) return
    let stop: (() => void) | undefined
    let disposed = false
    void listen<Request>(REQUEST, ({ payload }) => {
      if (!payload || !CHAT_WINDOWS.includes(payload.origin)) return
      void perform(userId, payload)
        .then(result => emitTo(payload.origin, RESPONSE, { ...result, requestId: payload.requestId, ok: true } satisfies Response))
        .catch(cause => emitTo(payload.origin, RESPONSE, { requestId: payload.requestId, ok: false, error: errorText(cause) } satisfies Response))
        .catch(console.error)
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { disposed = true; stop?.() }
  }, [userId])
}
export function forwardElsewhereMessage(message: CloudMessage) {
  if (!isTauri()) return
  for (const label of CHAT_WINDOWS) void emitTo(label, INCOMING, message).catch(() => {})
}
export function forwardElsewhereGroupMessage(message: CloudGroupMessage) {
  window.dispatchEvent(new CustomEvent(GROUP_INCOMING, { detail: message }))
  if (!isTauri()) return
  for (const label of CHAT_WINDOWS) void emitTo(label, GROUP_INCOMING, message).catch(() => {})
}

/** Talks to the main window (or acts directly when this is the main window). */
export function useElsewhereBridge(directUserId?: string) {
  const pending = useRef(new Map<string, { resolve: (value: Response) => void; reject: (reason: Error) => void; timer: number }>())
  useEffect(() => {
    if (!isTauri() || isMainWindow()) return
    const waiting = pending.current
    let stop: (() => void) | undefined
    let disposed = false
    void listen<Response>(RESPONSE, ({ payload }) => {
      const item = waiting.get(payload.requestId)
      if (!item) return
      waiting.delete(payload.requestId)
      window.clearTimeout(item.timer)
      item.resolve(payload)
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => {
      disposed = true
      stop?.()
      for (const item of waiting.values()) { window.clearTimeout(item.timer); item.reject(new Error('Conversation closed.')) }
      waiting.clear()
    }
  }, [])
  return useCallback(async (request: Omit<Request, 'requestId' | 'origin'>): Promise<Omit<Response, 'requestId' | 'ok'>> => {
    if (isMainWindow()) {
      if (!directUserId) throw new Error('Sign in to Elsewhere first.')
      return perform(directUserId, request)
    }
    const label = getCurrentWindow().label as ChatWindow
    if (!CHAT_WINDOWS.includes(label)) throw new Error('Elsewhere conversations open in the chat window.')
    const requestId = crypto.randomUUID()
    const response = await new Promise<Response>((resolve, reject) => {
      const timer = window.setTimeout(() => { pending.current.delete(requestId); reject(new Error('Elsewhere didn’t answer. Make sure the main window is signed in.')) }, 20000)
      pending.current.set(requestId, { resolve, reject, timer })
      void emitTo('main', REQUEST, { ...request, requestId, origin: label } satisfies Request).catch(cause => {
        window.clearTimeout(timer); pending.current.delete(requestId); reject(new Error(errorText(cause)))
      })
    })
    if (!response.ok) throw new Error(response.error || 'Elsewhere request failed.')
    return response
  }, [directUserId])
}

/** One Elsewhere group conversation, usable from the main window or a chat window. */
export function useElsewhereGroupChat(groupId: string | null, directUserId?: string) {
  const call = useElsewhereBridge(directUserId)
  const [group, setGroup] = useState<CloudGroup | null>(null)
  const [members, setMembers] = useState<CloudProfile[]>([])
  const [userId, setUserId] = useState('')
  const [messages, setMessages] = useState<CloudGroupMessage[]>([])
  const [failure, setFailure] = useState<{ groupId: string; text: string }>()
  const merge = useCallback((incoming: CloudGroupMessage[]) => {
    setMessages(old => [...new Map([...old, ...incoming].map(row => [row.id, row])).values()]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)))
  }, [])
  const refresh = useCallback(async () => {
    if (!groupId) return
    const result = await call({ action: 'group-history', personId: '', groupId })
    setGroup(result.group ?? null)
    setMembers(result.members || [])
    setUserId(result.userId || '')
    merge(result.groupMessages || [])
    setFailure(result.group ? undefined : { groupId, text: 'You’re not in this group chat anymore.' })
  }, [groupId, call, merge])
  useEffect(() => {
    if (!groupId) return
    let alive = true
    const load = () => { void refresh().catch(cause => { if (alive) setFailure({ groupId, text: errorText(cause) }) }) }
    load()
    const timer = window.setInterval(load, 30000)
    const onIncoming = (row: CloudGroupMessage) => {
      if (!alive || row.group_id !== groupId) return
      merge([row])
      if (row.kind === 'system') load()
    }
    let stop: (() => void) | undefined
    let disposed = false
    if (isTauri()) void listen<CloudGroupMessage>(GROUP_INCOMING, ({ payload }) => onIncoming(payload))
      .then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    const local = (event: Event) => onIncoming((event as CustomEvent<CloudGroupMessage>).detail)
    window.addEventListener(GROUP_INCOMING, local)
    return () => { alive = false; disposed = true; window.clearInterval(timer); stop?.(); window.removeEventListener(GROUP_INCOMING, local) }
  }, [groupId, refresh, merge])

  const send = useCallback(async (text: string, kind: 'message' | 'nudge' | 'gif' = 'message') => {
    if (!groupId) return
    const clientId = crypto.randomUUID()
    const localId = 'local:' + clientId
    if (kind === 'message') merge([{ id: localId, group_id: groupId, sender_id: userId, client_id: clientId, kind, text_body: text.trim(), created_at: new Date().toISOString() }])
    try {
      const result = await call({ action: 'group-send', personId: '', groupId, text, clientId, kind })
      setMessages(old => old.filter(row => row.id !== localId))
      if (result.groupMessage) merge([result.groupMessage])
    } catch (cause) {
      setMessages(old => old.filter(row => row.id !== localId))
      throw cause
    }
  }, [groupId, call, merge, userId])
  const add = useCallback(async (people: string[]) => {
    if (!groupId) return
    await call({ action: 'group-add', personId: '', groupId, people })
    await refresh()
  }, [groupId, call, refresh])
  const leave = useCallback(async () => { if (groupId) await call({ action: 'group-leave', personId: '', groupId }) }, [groupId, call])
  const sendMedia = useCallback(async (media: MediaRef) => {
    if (!groupId) return
    const result = await call({ action: 'group-media', personId: '', groupId, media, clientId: crypto.randomUUID() })
    if (result.groupMessage) merge([result.groupMessage])
  }, [groupId, call, merge])
  const mediaUrl = useCallback(async (path: string) => {
    const result = await call({ action: 'media-url', personId: '', path })
    if (!result.url) throw new Error('The photo couldn’t be loaded.')
    return result.url
  }, [call])
  const rename = useCallback(async (name: string) => { if (groupId) { await call({ action: 'group-rename', personId: '', groupId, name }); await refresh() } }, [groupId, call, refresh])

  const names: Record<string, string> = {}
  for (const member of members) names[member.id] = member.display_name || '@' + member.handle
  return {
    group: group && group.id === groupId ? group : null,
    members, names, userId,
    messages: groupId ? messages.filter(row => row.group_id === groupId) : [],
    error: failure && failure.groupId === groupId ? failure.text : '',
    send, add, leave, rename, sendMedia, mediaUrl,
  }
}

/** One Elsewhere conversation, usable from the main window or a chat window. */
export function useElsewhereChat(personId: string | null, directUserId?: string) {
  const [profile, setProfile] = useState<CloudProfile | null>(null)
  const [userId, setUserId] = useState('')
  const [messages, setMessages] = useState<CloudMessage[]>([])
  const [failure, setError] = useState<{ personId: string; text: string }>()
  const pending = useRef(new Map<string, { resolve: (value: Response) => void; reject: (reason: Error) => void; timer: number }>())

  const call = useCallback(async (request: Omit<Request, 'requestId' | 'origin'>): Promise<Omit<Response, 'requestId' | 'ok'>> => {
    if (isMainWindow()) {
      if (!directUserId) throw new Error('Sign in to Elsewhere first.')
      return perform(directUserId, request)
    }
    const label = getCurrentWindow().label as ChatWindow
    if (!CHAT_WINDOWS.includes(label)) throw new Error('Elsewhere conversations open in the chat window.')
    const requestId = crypto.randomUUID()
    const response = await new Promise<Response>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.current.delete(requestId)
        reject(new Error('Elsewhere didn’t answer. Make sure the main window is signed in.'))
      }, 15000)
      pending.current.set(requestId, { resolve, reject, timer })
      void emitTo('main', REQUEST, { ...request, requestId, origin: label } satisfies Request).catch(cause => {
        window.clearTimeout(timer)
        pending.current.delete(requestId)
        reject(new Error(errorText(cause)))
      })
    })
    if (!response.ok) throw new Error(response.error || 'Elsewhere request failed.')
    return response
  }, [directUserId])

  const merge = useCallback((incoming: CloudMessage[]) => {
    setMessages(old => [...new Map([...old, ...incoming].map(row => [row.id, row])).values()]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)))
  }, [])

  useEffect(() => {
    if (!isTauri() || isMainWindow()) return
    const waiting = pending.current
    let stop: (() => void) | undefined
    let disposed = false
    void listen<Response>(RESPONSE, ({ payload }) => {
      const item = waiting.get(payload.requestId)
      if (!item) return
      waiting.delete(payload.requestId)
      window.clearTimeout(item.timer)
      item.resolve(payload)
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => {
      disposed = true
      stop?.()
      for (const item of waiting.values()) { window.clearTimeout(item.timer); item.reject(new Error('Conversation closed.')) }
      waiting.clear()
    }
  }, [])

  useEffect(() => {
    if (!personId) return
    let alive = true
    const refresh = () => {
      void call({ action: 'history', personId }).then(result => {
        if (!alive) return
        setProfile(result.profile ?? null)
        setUserId(result.userId || '')
        merge(result.messages || [])
        setError(undefined)
      }).catch(cause => { if (alive) setError({ personId, text: errorText(cause) }) })
    }
    refresh()
    const timer = window.setInterval(refresh, 30000)
    let stop: (() => void) | undefined
    let disposed = false
    const onIncoming = (row: CloudMessage) => { if (alive && row.sender_id === personId) merge([row]) }
    if (isTauri()) void listen<CloudMessage>(INCOMING, ({ payload }) => onIncoming(payload))
      .then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    const local = (event: Event) => onIncoming((event as CustomEvent<CloudMessage>).detail)
    window.addEventListener(INCOMING, local)
    return () => { alive = false; disposed = true; window.clearInterval(timer); stop?.(); window.removeEventListener(INCOMING, local) }
  }, [personId, call, merge])

  const send = useCallback(async (text: string) => {
    if (!personId) return
    const clientId = crypto.randomUUID()
    const localId = 'local:' + clientId
    // Show it right away; the stored copy replaces it when the send completes.
    merge([{ id: localId, sender_id: userId, recipient_id: personId, client_id: clientId, kind: 'message',
      text_body: text.trim(), created_at: new Date().toISOString() }])
    try {
      const result = await call({ action: 'send', personId, text, clientId })
      setMessages(old => old.filter(row => row.id !== localId))
      if (result.message) merge([result.message])
    } catch (cause) {
      setMessages(old => old.filter(row => row.id !== localId))
      throw cause
    }
  }, [personId, call, merge, userId])
  const sendMedia = useCallback(async (media: MediaRef) => {
    if (!personId) return
    const result = await call({ action: 'media', personId, media, clientId: crypto.randomUUID() })
    if (result.message) merge([result.message])
  }, [personId, call, merge])
  const mediaUrl = useCallback(async (path: string) => {
    const result = await call({ action: 'media-url', personId: personId || '', path })
    if (!result.url) throw new Error('The photo couldn’t be loaded.')
    return result.url
  }, [personId, call])
  const nudge = useCallback(async () => {
    if (!personId) return
    const result = await call({ action: 'nudge', personId, clientId: crypto.randomUUID() })
    if (result.message) merge([result.message])
  }, [personId, call, merge])

  // Show only what belongs to the open conversation; older state is ignored, not reset.
  return {
    profile: profile && profile.id === personId ? profile : null,
    userId,
    messages: personId ? messages.filter(row => row.sender_id === personId || row.recipient_id === personId) : [],
    error: failure && failure.personId === personId ? failure.text : '',
    send, nudge, sendMedia, mediaUrl,
  }
}
export function announceElsewhereMessageLocally(message: CloudMessage) {
  window.dispatchEvent(new CustomEvent(INCOMING, { detail: message }))
}
