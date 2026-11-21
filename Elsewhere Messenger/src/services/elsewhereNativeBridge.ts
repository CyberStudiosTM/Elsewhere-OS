import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ELSEWHERE_BUDDY_PREFIX, loadCloudHistory, lookupCloudProfiles, sendCloudMessage, sendCloudNudge,
  type CloudMessage, type CloudProfile,
} from './connectedClient'

/** The main window holds the Elsewhere sign-in. Chat windows ask it for one
 * conversation at a time and receive new messages; no token leaves main. */
const REQUEST = 'elsewhere:cloud:bridge-request'
const RESPONSE = 'elsewhere:cloud:bridge-response'
const INCOMING = 'elsewhere:cloud:incoming'
const CHAT_WINDOWS = ['classic-chat', 'dead-signal-chat'] as const
type ChatWindow = typeof CHAT_WINDOWS[number]
type Action = 'history' | 'send' | 'nudge'
type Request = { requestId: string; origin: ChatWindow; action: Action; personId: string; text?: string; clientId?: string }
type Response = { requestId: string; ok: boolean; error?: string; userId?: string; profile?: CloudProfile | null; messages?: CloudMessage[]; message?: CloudMessage }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const elsewherePersonId = (contactId: string | null | undefined) =>
  contactId?.startsWith(ELSEWHERE_BUDDY_PREFIX) ? contactId.slice(ELSEWHERE_BUDDY_PREFIX.length) : null
const isMainWindow = () => !isTauri() || getCurrentWindow().label === 'main'
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

async function perform(userId: string, request: Omit<Request, 'requestId' | 'origin'>): Promise<Omit<Response, 'requestId' | 'ok'>> {
  if (!UUID.test(request.personId)) throw new Error('Unknown Elsewhere contact.')
  if (request.action === 'history') {
    const [profile] = await lookupCloudProfiles([request.personId])
    return { userId, profile: profile || null, messages: await loadCloudHistory(userId, request.personId) }
  }
  const clientId = request.clientId && UUID.test(request.clientId) ? request.clientId : crypto.randomUUID()
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
    send, nudge,
  }
}
export function announceElsewhereMessageLocally(message: CloudMessage) {
  window.dispatchEvent(new CustomEvent(INCOMING, { detail: message }))
}
