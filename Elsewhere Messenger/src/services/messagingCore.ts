import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'

import { useStoredValue } from './localValues'
import type { MediaRef } from './messengerMedia'
import '../components/ConversationCore.css'

export type ContactGroup = 'Buddies' | 'Other Contacts' | 'Instagram Chats'

type Presence = 'online' | 'away' | 'busy' | 'offline'

type Contact = {
  id: string
  name: string
  group: ContactGroup
  status: Presence
  avatar: string
  note?: string
}

/** Built-in demo contacts were removed for the beta; contacts come from real conversations. */
export const CONTACTS: Contact[] = []

export function contactDirectory(
  history: History,
  owner: string | null,
): Contact[] {
  const directory = CONTACTS
    .filter(contact => contact.id !== owner)
    .map(contact => ({ ...contact }))

  for (const id of Object.keys(history)) {
    if (
      !id ||
      id === owner ||
      directory.some(contact => contact.id === id)
    ) {
      continue
    }

    directory.push({
      id,
      name: id,
      group: 'Other Contacts',
      status: 'offline',
      avatar: 'red-sunset-palm',
    })
  }

  return directory
}

export type FormatToggle =
  'bold' | 'italic' | 'underline'

export type MessageFormat = {
  bold: boolean
  italic: boolean
  underline: boolean
  fontFamily?: string
  fontSize?: number
  color?: string
}

const DEFAULT_FORMAT: MessageFormat = {
  bold: false,
  italic: false,
  underline: false,
}

export function formatStyle(
  format?: MessageFormat
): CSSProperties {
  const size = format?.fontSize

  return {
    fontWeight: format?.bold ? 'bold' : 'normal',
    fontStyle: format?.italic ? 'italic' : 'normal',
    textDecoration: format?.underline
      ? 'underline'
      : 'none',
    fontFamily: format?.fontFamily
      ? `${JSON.stringify(format.fontFamily)}, sans-serif`
      : undefined,
    fontSize: typeof size === 'number' &&
      Number.isFinite(size)
        ? `${Math.max(8, Math.min(48, size))}px`
        : undefined,
    color: /^#[0-9a-f]{6}$/i.test(format?.color ?? '')
      ? format?.color
      : undefined,
  }
}

export type Message = {
  account: string
  contact: string
  id: string
  own: boolean
  text: string
  time: string
  createdAt: number
  read: boolean
  format?: MessageFormat
  media?: MediaRef
  kind?: 'nudge'
}

export type History = Record<string, Message[]>

const EMPTY: History = {}

const DB_NAME = 'elsewhere-messenger-core'
const DB_VERSION = 1
const EVENT = 'elsewhere:messaging-core-changed'
const REVISION = 'elsewhere.messaging.revision'

let opening: Promise<IDBDatabase> | undefined

export function accountKey(
  name: string | null | undefined
): string | null {
  return name?.trim().normalize('NFC').toLowerCase() || null
}

function localKey(
  owner: string | null,
  contact: string | null,
  kind: string,
) {
  if (!owner || !contact) return null

  return `elsewhere.core.${kind}.v1:` +
    JSON.stringify([owner, contact])
}

export function useConversationDraft(
  owner: string | null,
  contact: string | null,
) {
  return useStoredValue(
    localKey(owner, contact, 'draft'),
    '',
  )
}

export function useConversationFormat(
  owner: string | null,
  contact: string | null,
) {
  return useStoredValue<MessageFormat>(
    localKey(owner, contact, 'format'),
    DEFAULT_FORMAT,
  )
}

function database() {
  if (opening) return opening

  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', {
          keyPath: 'id',
        })
      }

      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', {
          keyPath: ['account', 'id'],
        })

        store.createIndex('account', 'account')
      }
    }

    request.onsuccess = () => {
      const db = request.result

      db.onversionchange = () => {
        db.close()
        opening = undefined
      }

      resolve(db)
    }

    request.onerror = () => {
      opening = undefined
      reject(
        request.error ??
        new Error('Cannot open messaging database.')
      )
    }
  })

  return opening
}

function result<T>(
  request: IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function committed(
  transaction: IDBTransaction
): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()

    transaction.onabort = () => reject(
      transaction.error ??
      new Error('Messaging transaction aborted.')
    )

    transaction.onerror = () => reject(
      transaction.error ??
      new Error('Messaging transaction failed.')
    )
  })

  // Consumers still await the original promise.
  void done.catch(() => {})

  return done
}

function seedMessages(account: string): Message[] {
  const samples = [
    {
      contact: 'sunny_day',
      own: true,
      text: 'hey! are you free later?',
      time: '3:14 PM',
    },
    {
      contact: 'sunny_day',
      own: false,
      text: 'yeah! i was thinking we could listen to some new music tonight 🎧',
      time: '3:16 PM',
    },
    {
      contact: 'sunny_day',
      own: true,
      text: "that sounds perfect!!\ni'll send you a few tracks when i get home:)",
      time: '3:17 PM',
    },
    {
      contact: 'cyber',
      own: false,
      text: 'hiii handsome',
      time: '9:41 PM',
    },
    {
      contact: 'cyber',
      own: true,
      text: 'wyd pretty',
      time: '9:42 PM',
    },
    {
      contact: 'cyber',
      own: false,
      text: 'workingg,,\nthinking ab u tho',
      time: '9:42 PM',
    },
  ]

  return samples.map((sample, index) => ({
    ...sample,
    account,
    id: `demo-sample-${index + 1}`,
    createdAt: index + 1,
    read: true,
  }))
}

async function initializeAccount(account: string) {
  const db = await database()

  const tx = db.transaction(
    ['accounts', 'messages'],
    'readwrite',
  )

  const done = committed(tx)
  const profiles = tx.objectStore('accounts')
  const messages = tx.objectStore('messages')

  type AccountRecord = {
    id: string
    version: number
    createdAt: number
    demoFixturesRemoved?: boolean
    inboxBackfilled?: boolean
  }

  const existing = await result(
    profiles.get(account)
  ) as AccountRecord | undefined

  // Keep 07A.1's demo-message cleanup.
  if (!existing?.demoFixturesRemoved) {
    for (const sample of seedMessages(account)) {
      const row = await result(
        messages.get([account, sample.id])
      ) as Message | undefined

      if (
        row &&
        row.account === account &&
        row.id === sample.id &&
        row.contact === sample.contact &&
        row.text === sample.text &&
        row.time === sample.time &&
        row.createdAt === sample.createdAt &&
        row.own === sample.own &&
        !row.media
      ) {
        messages.delete([account, sample.id])
      }
    }
  }

  // Deliver older outgoing messages to the
  // recipient's inbox without moving originals.
  if (!existing?.inboxBackfilled) {
    const rows = await result(
      messages.getAll()
    ) as Message[]

    for (const sent of rows) {
      if (
        !sent.own ||
        sent.contact !== account ||
        sent.account === account ||
        sent.id.startsWith('demo-sample-')
      ) {
        continue
      }

      const alreadyDelivered = await result(
        messages.get([account, sent.id])
      ) as Message | undefined

      if (!alreadyDelivered) {
        messages.add({
          ...sent,
          account,
          contact: sent.account,
          own: false,
          read: false,
        })
      }
    }
  }

  profiles.put({
    id: account,
    version: 2,
    createdAt: existing?.createdAt ?? Date.now(),
    demoFixturesRemoved: true,
    inboxBackfilled: true,
  })

  await done
}

async function loadHistory(
  account: string
): Promise<History> {
  await initializeAccount(account)

  const db = await database()
  const tx = db.transaction('messages', 'readonly')
  const done = committed(tx)

  const rows = await result(
    tx.objectStore('messages')
      .index('account')
      .getAll(account)
  ) as Message[]

  await done

  rows.sort(
    (a, b) => a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id)
  )

  const history: History = Object.create(null)

  for (const row of rows) {

    ;(history[row.contact] ??= []).push(row)
  }

  return history
}

function announce() {
  window.dispatchEvent(new Event(EVENT))

  try {
    localStorage.setItem(
      REVISION,
      `${Date.now()}-${Math.random()}`
    )
  } catch {
    // Native events also announce updates.
  }

  if (isTauri()) {
    void emit(EVENT).catch(console.error)
  }
}

export const nudgeMessage = (username: string) => `${username} nudged you, respond now!`

export function appendNudge(account: string, contact: string, username: string) {
  return appendMessage(account, contact, nudgeMessage(username), DEFAULT_FORMAT, undefined, 'nudge')
}

export async function appendMessage(
  account: string,
  contact: string,
  text: string,
  format: MessageFormat,
  media?: MediaRef,
  kind?: Message['kind'],
) {
  const destination = accountKey(contact)

  if (
    !destination ||
    destination.length > 40 ||
    destination === account
  ) {
    throw new Error('Invalid recipient account.')
  }

  if (!text.trim() || text.length > 16000) {
    throw new Error(
      'Messages must contain 1 to 16,000 characters.'
    )
  }

  await initializeAccount(account)

  const message: Message = {
    account,
    contact: destination,
    id: crypto.randomUUID(),
    own: true,
    text,
    time: new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    }),
    createdAt: Date.now(),
    read: true,
    format: { ...format },
    ...(media ? { media } : {}),
    ...(kind ? { kind } : {}),
  }

  const db = await database()
  const tx = db.transaction('messages', 'readwrite')
  const done = committed(tx)

  const store = tx.objectStore('messages')

  if (kind === 'nudge') {
    const recent = await result(store.index('account').getAll(account)) as Message[]
    if (recent.some(row => row.kind === 'nudge' && row.own && row.contact === destination &&
      row.createdAt > message.createdAt - 10_000)) {
      await done
      throw new Error('Wait a few seconds before nudging again.')
    }
  }

  // Both messages succeed or both roll back.
  store.add(message)

  store.add({
    ...message,
    account: destination,
    contact: account,
    own: false,
    read: false,
  })

  await done
  announce()

  return message
}

export function useCoreHistory(
  owner: string | null
): History {
  const [state, setState] = useState<{
    owner: string | null
    history: History
  }>({
    owner: null,
    history: EMPTY,
  })

  useEffect(() => {
    if (!owner) return

    let disposed = false
    let revision = 0
    let remove: (() => void) | undefined

    function refresh() {
      if (disposed) return

      const request = ++revision

      void loadHistory(owner!).then(history => {
        if (!disposed && request === revision) {
          setState({ owner, history })
        }
      }).catch(console.error)
    }

    function storage(event: StorageEvent) {
      if (event.key === REVISION) refresh()
    }

    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', refresh)

    if (isTauri()) {
      void listen(EVENT, refresh).then(unlisten => {
        if (disposed) {
          unlisten()
        } else {
          remove = unlisten
          refresh()
        }
      }).catch(console.error)
    }

    refresh()

    return () => {
      disposed = true
      remove?.()

      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', refresh)
    }
  }, [owner])

  return owner && state.owner === owner
    ? state.history
    : EMPTY
}

export function unreadCount(messages: Message[] = []) {
  return messages.filter(
    message => !message.own && !message.read
  ).length
}

async function markRead(
  owner: string,
  contact: string,
) {
  const db = await database()
  const tx = db.transaction('messages', 'readwrite')
  const done = committed(tx)
  const store = tx.objectStore('messages')

  const rows = await result(
    store.index('account').getAll(owner)
  ) as Message[]

  let changed = false

  for (const row of rows) {
    if (
      row.contact === contact &&
      !row.own &&
      !row.read
    ) {
      store.put({ ...row, read: true })
      changed = true
    }
  }

  await done

  if (changed) announce()
}

export function useConversationRead(
  owner: string | null,
  contact: string | null,
  history: History,
  active: boolean,
) {
  useEffect(() => {
    if (!owner || !contact || !active) return

    function read() {
      if (
        document.hasFocus() &&
        unreadCount(history[contact!]) > 0
      ) {
        void markRead(owner!, contact!)
          .catch(console.error)
      }
    }

    read()

    window.addEventListener('focus', read)

    return () => {
      window.removeEventListener('focus', read)
    }
  }, [owner, contact, history, active])
}