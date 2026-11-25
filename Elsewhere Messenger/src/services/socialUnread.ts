import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSocialAccount, watchSocialAccount } from './mainAccount'

// Unread counts for Elsewhere, Instagram and Discord contacts (local conversations
// keep their own read flags in messagingCore). The main window owns the counts:
// it adds one per incoming message and clears a contact when its chat is focused.

const CHANGED = 'elsewhere:social-unread-changed'
const CHAT_FOCUS = 'elsewhere:chat-focus'
type Counts = Record<string, number>
type Focus = { contactId: string | null }

let counts: Counts = {}
let loadedFor: string | null | undefined
let focusedChat: string | null = null

const key = (account: string) => 'elsewhere.social-unread.v1.' + account
function load() {
  const account = getSocialAccount()
  if (account === loadedFor) return
  loadedFor = account
  counts = {}
  if (!account) return
  try {
    const saved = JSON.parse(localStorage.getItem(key(account)) || '{}')
    for (const [id, value] of Object.entries(saved)) if (typeof value === 'number' && value > 0) counts[id] = Math.min(999, value)
  } catch { /* start from zero */ }
}
function save() {
  const account = getSocialAccount()
  if (account) { try { localStorage.setItem(key(account), JSON.stringify(counts)) } catch { /* counts stay for this session */ } }
  window.dispatchEvent(new Event(CHANGED))
}

/** Counts one more unread message for this contact, unless its chat is open and focused. */
export function bumpSocialUnread(contactId: string) {
  load()
  if (!getSocialAccount() || focusedChat === contactId) return
  counts = { ...counts, [contactId]: Math.min(999, (counts[contactId] || 0) + 1) }
  save()
}
export function clearSocialUnread(contactId: string) {
  load()
  if (!counts[contactId]) return
  const next = { ...counts }
  delete next[contactId]
  counts = next
  save()
}

/** Main window: live unread counts for the buddy list. */
export function useSocialUnread(): Counts {
  const [value, setValue] = useState<Counts>(() => { load(); return counts })
  useEffect(() => {
    const update = () => { load(); setValue(counts) }
    window.addEventListener(CHANGED, update)
    const stop = watchSocialAccount(update)
    update()
    return () => { window.removeEventListener(CHANGED, update); stop() }
  }, [])
  return value
}

/** Main window: clears a contact when its chat window reports focus. */
export function useChatFocusReceiver() {
  useEffect(() => {
    const apply = (focus: Focus) => {
      focusedChat = focus.contactId
      if (focus.contactId) clearSocialUnread(focus.contactId)
    }
    const local = (event: Event) => apply((event as CustomEvent<Focus>).detail)
    window.addEventListener(CHAT_FOCUS, local)
    let unlisten: (() => void) | undefined
    let disposed = false
    if (isTauri()) void listen<Focus>(CHAT_FOCUS, ({ payload }) => apply(payload))
      .then(stop => { if (disposed) stop(); else unlisten = stop }).catch(console.error)
    return () => { disposed = true; window.removeEventListener(CHAT_FOCUS, local); unlisten?.() }
  }, [])
}

/** Chat windows: tell the main window which conversation is in front of the user. */
export function useReportChatFocus(contactId: string | null | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const send = (focus: Focus) => {
      if (isTauri() && getCurrentWindow().label !== 'main') void emitTo('main', CHAT_FOCUS, focus).catch(() => {})
      else window.dispatchEvent(new CustomEvent(CHAT_FOCUS, { detail: focus }))
    }
    const focused = () => send({ contactId: contactId || null })
    const blurred = () => send({ contactId: null })
    if (document.hasFocus()) focused()
    window.addEventListener('focus', focused)
    window.addEventListener('blur', blurred)
    return () => { window.removeEventListener('focus', focused); window.removeEventListener('blur', blurred); blurred() }
  }, [contactId, enabled])
}
