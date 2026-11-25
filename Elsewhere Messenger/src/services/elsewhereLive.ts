import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { isTauri } from '@tauri-apps/api/core'
import { emit, emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { cloud } from './connectedClient'
import type { LocalPresence } from './localSession'

// Online status and typing for Elsewhere friends. The main window holds the
// Elsewhere sign-in, so it joins one private channel per friend (dm:<a>:<b>,
// readable only by the two of them) and relays the state to chat windows.

export type FriendStatus = 'online' | 'away' | 'busy' | 'offline'
type LiveState = { status: Record<string, FriendStatus>; typing: Record<string, boolean> }

const STATE = 'elsewhere:cloud:live-state'
const STATE_REQUEST = 'elsewhere:cloud:live-request'
const TYPING_OUT = 'elsewhere:cloud:typing-out'
const TYPING_SHOW_MS = 6000
const TYPING_SEND_EVERY_MS = 3000

const isMain = () => !isTauri() || getCurrentWindow().label === 'main'
let state: LiveState = { status: {}, typing: {} }
const typingTimers = new Map<string, number>()
let sendTypingNow: ((personId: string) => void) | null = null

function publish(next: LiveState) {
  state = next
  window.dispatchEvent(new CustomEvent(STATE, { detail: state }))
  if (isTauri() && isMain()) void emit(STATE, state).catch(() => {})
}
const topicFor = (me: string, friend: string) => 'dm:' + (me < friend ? me + ':' + friend : friend + ':' + me)
const asStatus = (presence: LocalPresence | undefined): FriendStatus | null =>
  presence === 'Invisible' ? null : presence === 'Away' ? 'away' : presence === 'Busy' ? 'busy' : 'online'

/** Main window: join each friend's shared channel and share our own status. */
export function useElsewhereLiveHost(userId: string, friendIds: string[], presence: LocalPresence | undefined) {
  const friendsKey = [...friendIds].sort().join(',')
  const mine = asStatus(presence)

  useEffect(() => {
    if (!cloud || !userId || !friendsKey) { publish({ status: {}, typing: {} }); return }
    const client = cloud
    const friends = friendsKey.split(',')
    const channels = new Map<string, RealtimeChannel>()
    const lastSent = new Map<string, number>()
    let alive = true

    for (const friend of friends) {
      const channel = client.channel(topicFor(userId, friend), { config: { private: true, presence: { key: userId } } })
      channel
        .on('presence', { event: 'sync' }, () => {
          const entry = (channel.presenceState()[friend] as Array<{ status?: FriendStatus }> | undefined)?.[0]
          const status: FriendStatus = entry?.status === 'away' || entry?.status === 'busy' ? entry.status : entry ? 'online' : 'offline'
          if (alive && state.status[friend] !== status) publish({ ...state, status: { ...state.status, [friend]: status } })
        })
        .on('broadcast', { event: 'typing' }, () => {
          if (!alive) return
          window.clearTimeout(typingTimers.get(friend))
          typingTimers.set(friend, window.setTimeout(() => {
            if (alive) publish({ ...state, typing: { ...state.typing, [friend]: false } })
          }, TYPING_SHOW_MS))
          if (!state.typing[friend]) publish({ ...state, typing: { ...state.typing, [friend]: true } })
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED' && mine) void channel.track({ status: mine }).catch(() => {})
        })
      channels.set(friend, channel)
    }

    sendTypingNow = personId => {
      const channel = channels.get(personId)
      if (!channel || !mine) return
      const now = Date.now()
      if (now - (lastSent.get(personId) || 0) < TYPING_SEND_EVERY_MS) return
      lastSent.set(personId, now)
      void channel.send({ type: 'broadcast', event: 'typing', payload: {} }).catch(() => {})
    }

    return () => {
      alive = false
      sendTypingNow = null
      for (const timer of typingTimers.values()) window.clearTimeout(timer)
      typingTimers.clear()
      for (const channel of channels.values()) void client.removeChannel(channel)
      publish({ status: {}, typing: {} })
    }
  }, [userId, friendsKey, mine])

  // Chat windows: send their typing through us, and get the current state when they open.
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const stops: Array<() => void> = []
    void listen<{ personId: string }>(TYPING_OUT, ({ payload }) => { if (payload?.personId) sendTypingNow?.(payload.personId) })
      .then(stop => { if (disposed) stop(); else stops.push(stop) }).catch(console.error)
    void listen(STATE_REQUEST, () => { void emit(STATE, state).catch(() => {}) })
      .then(stop => { if (disposed) stop(); else stops.push(stop) }).catch(console.error)
    return () => { disposed = true; stops.forEach(stop => stop()) }
  }, [])
}

/** Any window: friends' live status and typing. */
export function useElsewhereLive(): LiveState {
  const [value, setValue] = useState<LiveState>(state)
  useEffect(() => {
    const local = (event: Event) => setValue((event as CustomEvent<LiveState>).detail)
    window.addEventListener(STATE, local)
    let unlisten: (() => void) | undefined
    let disposed = false
    if (isTauri() && !isMain()) {
      void listen<LiveState>(STATE, ({ payload }) => setValue(payload))
        .then(stop => { if (disposed) stop(); else { unlisten = stop; void emitTo('main', STATE_REQUEST).catch(() => {}) } })
        .catch(console.error)
    }
    return () => { disposed = true; window.removeEventListener(STATE, local); unlisten?.() }
  }, [])
  return value
}

/** Any window: tell this friend we're typing (throttled). */
export function sendElsewhereTyping(personId: string | null) {
  if (!personId) return
  if (isMain()) sendTypingNow?.(personId)
  else void emitTo('main', TYPING_OUT, { personId }).catch(() => {})
}
