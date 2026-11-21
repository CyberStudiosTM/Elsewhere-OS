import { useEffect, useRef, useState, type FormEvent } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { connectX, X_CALLBACK, xAuthorization, type XMessage, type XUser } from '../services/xMessages'
import { desktopNotice } from '../services/desktopNotifications'

type Connection = Awaited<ReturnType<typeof connectX>>
const CLIENT_KEY = 'elsewhere.x.client-id'

export default function XMessagesPanel({ open, close }: { open: boolean; close: () => void }) {
  const [clientId, setClientId] = useState(() => localStorage.getItem(CLIENT_KEY) || '')
  const [connection, setConnection] = useState<Connection>()
  const [messages, setMessages] = useState<XMessage[]>([])
  const [users, setUsers] = useState<Record<string, XUser>>({})
  const [conversation, select] = useState('')
  const [next, setNext] = useState('')
  const [handle, setHandle] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [listenerReady, setListenerReady] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [auto, setAuto] = useState(false)
  const pending = useRef<Awaited<ReturnType<typeof xAuthorization>> | null>(null)
  const seen = useRef(new Set<string>())
  const hasBaseline = useRef(false)
  const loading = useRef(false)
  const session = useRef(0)

  async function refresh(active: Connection, page?: string, notify = false) {
    if (loading.current) return
    const current = session.current
    loading.current = true
    try {
      const result = await active.list(page)
      if (current !== session.current) return
      const incoming = (result.data || []).filter(item => item.event_type === 'MessageCreate' && item.dm_conversation_id)
      if (notify && hasBaseline.current && incoming.some(item =>
        item.sender_id && item.sender_id !== active.account.id && !seen.current.has(item.id))) {
        void desktopNotice('x').catch(console.error)
      }
      for (const item of incoming) seen.current.add(item.id)
      if (!page) hasBaseline.current = true
      setMessages(old => [...new Map([...old, ...incoming].map(item => [item.id, item])).values()])
      setUsers(old => ({ ...old, ...Object.fromEntries((result.includes?.users || []).map(user => [user.id, user])) }))
      if (!notify) setNext(result.meta?.next_token || '')
    } finally {
      if (current === session.current) loading.current = false
    }
  }

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let disposed = false
    void listen<string>('elsewhere:x:oauth-callback', ({ payload }) => {
      const attempt = pending.current
      if (!attempt) return
      const callback = new URL(payload, X_CALLBACK)
      pending.current = null
      if (callback.pathname !== '/x/callback' || callback.searchParams.get('state') !== attempt.state) {
        setError('X authorization state did not match. Connect again.')
        return
      }
      const code = callback.searchParams.get('code')
      if (!code) {
        setError(callback.searchParams.get('error_description') || 'X authorization was declined.')
        return
      }
      setBusy(true)
      void connectX(attempt.clientId, code, attempt.verifier).then(async active => {
        if (disposed) return
        setConnection(active)
        setStatus('')
        await refresh(active)
      }).catch(cause => setError(String(cause))).finally(() => setBusy(false))
    }).then(stop => {
      if (disposed) stop()
      else { unlisten = stop; setListenerReady(true) }
    }).catch(cause => setError(String(cause)))
    return () => { disposed = true; unlisten?.() }
  }, [])

  useEffect(() => {
    if (!connection || !auto) return
    const timer = window.setInterval(() => {
      void refresh(connection, undefined, true).catch(cause => { setError(String(cause)); setAuto(false) })
    }, 180000)
    return () => clearInterval(timer)
  }, [connection, auto])

  async function run(action: () => Promise<void>) {
    if (busy) return
    setError('')
    setBusy(true)
    try { await action() }
    catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }

  function authorize(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      const id = clientId.trim()
      if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) throw new Error('Enter your public X OAuth 2.0 Client ID.')
      const attempt = await xAuthorization(id)
      if (await invoke('start_x_oauth_callback') !== X_CALLBACK) throw new Error('Unexpected X callback address.')
      pending.current = attempt
      localStorage.setItem(CLIENT_KEY, id)
      setStatus('Finish authorization in your browser, then return here.')
      await openUrl(attempt.url)
    })
  }

  function disconnect() {
    session.current += 1
    loading.current = false
    setConnection(undefined)
    setMessages([])
    setUsers({})
    select('')
    setHandle('')
    setDraft('')
    setAuto(false)
    setNext('')
    setError('')
    setStatus('')
    seen.current.clear()
    hasBaseline.current = false
  }

  function send(event: FormEvent) {
    event.preventDefault()
    if (!connection) return
    void run(async () => {
      const result = await connection.send(draft, conversation ? { conversation } : { handle })
      setDraft('')
      setHandle('')
      select(result.data.dm_conversation_id)
      setStatus('X accepted the message.')
      await refresh(connection).catch(cause => setError('Message accepted. Refresh failed. ' + String(cause)))
    })
  }

  if (!open) return null
  const threads = [...new Set(messages.map(item => item.dm_conversation_id))]
  const threadLabel = (id: string) => {
    const participants = new Set(messages.filter(item => item.dm_conversation_id === id)
      .flatMap(item => [...(item.participant_ids || []), ...(item.sender_id ? [item.sender_id] : [])]))
    if (connection) participants.delete(connection.account.id)
    const labels = [...participants].map(person => users[person] ? '@' + users[person].username : person)
    return labels.length ? labels.join(', ') : 'Conversation ' + id
  }
  return <div className="ew-ig-backdrop">
    <section className="ew-ig-connection" role="dialog" aria-modal="true" aria-label="X Direct Messages">
      <header><strong>X · Direct Messages</strong><button type="button" onClick={close} aria-label="Close">×</button></header>
      {connection ? <>
        <p>Connected as @{connection.account.username}</p>
        <button type="button" disabled={busy} onClick={() => void run(() => refresh(connection))}>Refresh inbox</button>
        <button type="button" disabled={busy} onClick={disconnect}>Disconnect</button>
        <label><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)} /> Check for new messages every 3 minutes</label>
        <label>Conversation<select value={conversation} onChange={event => { select(event.target.value); setDraft(''); setStatus('') }}>
          <option value="">New direct message</option>
          {conversation && !threads.includes(conversation) && <option value={conversation}>New conversation</option>}
          {threads.map(id => <option key={id} value={id}>{threadLabel(id)}</option>)}
        </select></label>
        <div style={{ maxHeight: '12rem', overflow: 'auto', overflowWrap: 'anywhere' }}>
          {messages.filter(item => item.dm_conversation_id === conversation)
            .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
            .map(item => <p key={item.id}><strong>{item.sender_id === connection.account.id ? 'You' : users[item.sender_id || '']?.username || 'X user'}: </strong>{item.text || 'Attachment'}</p>)}
        </div>
        {next && <button type="button" disabled={busy} onClick={() => void run(() => refresh(connection, next))}>Load older messages</button>}
        <form onSubmit={send}>
          {!conversation && <label>Recipient username<input value={handle} onChange={event => setHandle(event.target.value)} required /></label>}
          <label>Message<textarea value={draft} onChange={event => setDraft(event.target.value)} required maxLength={10000} /></label>
          <button type="submit" disabled={busy}>Send as @{connection.account.username}</button>
        </form>
      </> : <form onSubmit={authorize}>
        <p>Enable OAuth 2.0 for a public native app with direct message read and write access in the X developer portal. Register this callback:</p>
        <code>{X_CALLBACK}</code>
        <label>Public OAuth 2.0 Client ID<input value={clientId} onChange={event => setClientId(event.target.value)} required /></label>
        <button type="submit" disabled={busy || !listenerReady}>Connect X</button>
      </form>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="ew-ig-error">{error}</p>}
    </section>
  </div>
}
