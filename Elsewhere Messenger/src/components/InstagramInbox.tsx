import { desktopNotice, desktopNotificationsEnabled } from '../services/desktopNotifications'
import { historyCacheEnabled, setHistoryCacheEnabled, mergeCachedHistory, clearCachedHistory } from '../services/instagramHistoryCache'
import { sendInstagramMediaRef } from '../services/instagramMediaSend'
import { emit, emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { IG_LIVE_ACTIVITY, IG_BRIDGE_REQUEST, IG_BRIDGE_RESPONSE, IG_BRIDGE_CONNECTED, IG_BRIDGE_DISCONNECTED, IG_BRIDGE_ORIGINS, type IGBridgeRequest, type IGBridgeResponse } from '../services/instagramNativeBridge'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  checkInstagramAccount, identifyInstagramAccount, refreshInstagramLoginToken, getThreads,
  getThreadMessages, sendInstagramText, lookupInstagramContact, instagramRateLimitRemainingMs, instagramRateLimitMessage,
  type IGAccount, type IGThread, type IGMessage, type IGParticipant,
} from '../services/instagramGraph'
import './InstagramInbox.css'
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import { openUrl } from '@tauri-apps/plugin-opener'
import { cloud } from '../services/connectedClient'
import { INSTAGRAM_LOGIN_CONFIG_ID, META_APP_ID } from '../services/publicAppIds'
import InstagramMessageContent from './InstagramMessageContent'

const HOST = 'graph.facebook.com' as const
const ID = /^\d{6,30}$/
function otherParticipant(t: IGThread, ownId: string) {
  const people = t.participants?.data || []
  const others = people.filter(p => p.id !== ownId)
  return others.length === 1 ? others[0] : undefined
}
function externalLabel(t: IGThread, ownId: string) {
  const other = otherParticipant(t, ownId)
  return other?.username ? '@' + other.username : other?.name || (other?.id ? 'User ' + other.id : 'Conversation ' + t.id)
}
const INSTAGRAM_HELPER = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || '').trim().replace(/\/$/, '') + '/functions/v1/elsewhere-instagram-auth'
const INSTAGRAM_CALLBACK = 'elsewhere:instagram:oauth-callback'
function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function safeError(cause: unknown) {
  if (cause instanceof Error) return cause.message
  // Native (Tauri) commands reject with plain strings; show them instead of a generic message.
  if (typeof cause === 'string' && cause.trim()) return cause.trim().slice(0, 300)
  return 'The operation failed. Check connection and permissions.'
}

export default function InstagramInbox({ integrated=false }: { integrated?:boolean }) {
  const [token, setToken] = useState('')
  const tokenRef = useRef('')
  const [manualId, setManualId] = useState('')
  const [account, setAccount] = useState('')
  const [accounts, setAccounts] = useState<IGAccount[]>([])
  const [threads, setThreads] = useState<IGThread[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const [messages, setMessages] = useState<IGMessage[]>([])
  const automaticPages = useRef(0)
  const seenCursors = useRef(new Set<string>())
  const [cursor, setCursor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [rateRemainingMs, setRateRemainingMs] = useState(() => instagramRateLimitRemainingMs())
  useEffect(() => {
    const update = () => setRateRemainingMs(instagramRateLimitRemainingMs())
    const interval = window.setInterval(update, 10000)
    return () => window.clearInterval(interval)
  }, [])
  const ratePaused = rateRemainingMs > 0
  const rateMinutes = Math.max(1, Math.ceil(rateRemainingMs / 60000))
  const busyRef = useRef(false)
  const [remember, setRemember] = useState(false)
  const restoreStarted = useRef(false)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('Not connected')
  const [error, setError] = useState('')
  const [auto, setAuto] = useState(integrated)
  const [panelOpen,setPanelOpen]=useState(false)
  const [cacheHistory,setCacheHistory] = useState(historyCacheEnabled)
  const cacheRef=useRef(cacheHistory)
  useEffect(()=>{cacheRef.current=cacheHistory;setHistoryCacheEnabled(cacheHistory)},[cacheHistory])
  const theme = localStorage.getItem('elsewhere.messenger.skin') === 'dead-signal' ? 'dead' : 'classic'

  useEffect(() => { tokenRef.current = token }, [token])
  useEffect(() => { selectedRef.current = selected }, [selected])
  const bridgeAccount=useRef('')
  const bridgePhoto = useRef<string | undefined>(undefined)
  const bridgeThreads=useRef<IGThread[]>([])
  const profiles=useRef(new Map<string, {updated:number;data:Partial<IGParticipant>}>())
  const enrichedThreads = useCallback(async (items: IGThread[], owner: string, accessToken: string) => {
    const now = Date.now()
    const people = new Map(items.flatMap(item => item.participants?.data || [])
      .filter(person => person.id !== owner).map(person => [person.id, person]))
    const due = [...people.keys()].filter(id => {
      const saved = profiles.current.get(id)
      return !saved || now - saved.updated >= (Object.keys(saved.data).length ? 86400000 : 300000)
    }).sort((a, b) => (profiles.current.get(a)?.updated ?? 0) - (profiles.current.get(b)?.updated ?? 0))
    await Promise.all(due.slice(0, 3).map(async id => {
      const data = await lookupInstagramContact(accessToken, id).catch(() => ({}))
      if (tokenRef.current === accessToken && bridgeAccount.current === owner) {
        profiles.current.set(id, { updated: Date.now(), data: { ...profiles.current.get(id)?.data, ...data } })
      }
    }))
    return items.map(item => {
      if (!item.participants?.data) return item
      return { ...item, participants: { ...item.participants, data: item.participants.data.map(person =>
        person.id === owner ? person : { ...person, ...profiles.current.get(person.id)?.data }) } }
    })
  }, [])
  const threadSync = useRef<Promise<IGThread[]> | null>(null)
  const publishThreads = useCallback(async (items: IGThread[], owner: string, accessToken: string) => {
    while (threadSync.current) await threadSync.current.catch(() => {})
    if (tokenRef.current !== accessToken || bridgeAccount.current !== owner) {
      throw new Error('Instagram account changed while refreshing.')
    }
    const merged = new Map([...bridgeThreads.current, ...items].map(thread => [thread.id, thread]))
    const task = enrichedThreads([...merged.values()], owner, accessToken).then(detailed => {
      if (tokenRef.current !== accessToken || bridgeAccount.current !== owner) {
        throw new Error('Instagram account changed while refreshing.')
      }
      bridgeThreads.current = detailed
      setThreads(detailed)
      return detailed
    })
    threadSync.current = task
    try { return await task }
    finally { if (threadSync.current === task) threadSync.current = null }
  }, [enrichedThreads])
  useEffect(()=>{bridgeAccount.current=account},[account])
  useEffect(()=>{bridgeThreads.current=threads},[threads])
  useEffect(()=>{
    if(!isTauri() || !integrated)return
    let stop:UnlistenFn|undefined
    let disposed=false
    void listen<IGBridgeRequest>(IG_BRIDGE_REQUEST,async({payload})=>{
      if(!IG_BRIDGE_ORIGINS.includes(payload.origin) || !/^[\w-]{1,120}$/.test(payload.requestId))return
      const response:IGBridgeResponse={requestId:payload.requestId,ok:false}
      try {
        const currentToken=tokenRef.current
        const accountId=bridgeAccount.current
        if(!currentToken||!accountId) throw new Error('Connect Instagram in Elsewhere Tools first.')
        if(payload.action==='threads') {
          response.account=accountId;response.accountPhoto=bridgePhoto.current;response.threads=bridgeThreads.current;response.ok=true
        }else if(payload.action==='messages'||payload.action==='send'||payload.action==='media') {
          const thread=bridgeThreads.current.find(t=>t.id===payload.threadId)
          if(!thread)throw new Error('Choose a real Instagram conversation from the connected inbox.')
          if(payload.action==='messages') {
            const data=await getThreadMessages(HOST,currentToken,thread.id)
            response.messages=cacheRef.current?await mergeCachedHistory(accountId,thread.id,data.data||[]):data.data||[]
            if (tokenRef.current === currentToken && bridgeAccount.current === accountId) {
              response.threads = bridgeThreads.current
              if (otherParticipant(thread, accountId) && !otherParticipant(thread, accountId)?.profile_pic &&
                  !otherParticipant(thread, accountId)?.profile_picture_url) {
                void enrichedThreads([thread], accountId, currentToken).then(([updated]) => {
                  if (!updated || tokenRef.current !== currentToken || bridgeAccount.current !== accountId) return
                  const detail = new Map(updated.participants?.data?.map(person => [person.id, person]))
                  const all = bridgeThreads.current.map(item => item.id !== thread.id || !item.participants?.data ? item : {
                    ...item, participants: { ...item.participants, data: item.participants.data.map(person =>
                      ({ ...person, ...detail.get(person.id) })) },
                  })
                  bridgeThreads.current = all
                  setThreads(all)
                  return emit(IG_BRIDGE_CONNECTED)
                }).catch(() => {})
              }
            }
            response.ok=true
          }else {
            const other=otherParticipant(thread, accountId)
            if(!other?.id)throw new Error('Meta did not supply a single eligible recipient for this conversation.')
            if(payload.action==='media') {
              if(!payload.media)throw new Error('Choose a valid image, GIF or sticker.')
              const result=await sendInstagramMediaRef(currentToken,accountId,other.id,payload.media)
              response.acceptedId=result.message_id;response.ok=true
            }else {
              const message=(payload.text||'').trim()
              if(!message||message.length>1000)throw new Error('Instagram messages must be between 1 and 1000 characters.')
              const result=await sendInstagramText(currentToken,accountId,other.id,message,payload.replyToMid)
              response.acceptedId=result.message_id;response.ok=true
            }
          }
        }else throw new Error('Unsupported Instagram operation.')
      }catch(e){response.error=e instanceof Error?e.message:'Instagram request failed'}
      if(!disposed)void emitTo(payload.origin,IG_BRIDGE_RESPONSE,response).catch(()=>{})
    }).then(unlisten=>{if(disposed)unlisten();else stop=unlisten}).catch(console.error)
    return()=>{disposed=true;stop?.()}
  },[integrated,enrichedThreads])

  useEffect(()=>{if(!integrated)return;const open=()=>setPanelOpen(true);window.addEventListener('elsewhere:instagram:manage',open);return()=>window.removeEventListener('elsewhere:instagram:manage',open)},[integrated])

  async function guard(fn: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await fn() }
    catch (cause) { setError(safeError(cause)); setStatus('Connection needs attention') }
    finally { setBusy(false); busyRef.current = false }
  }

  const openAccount = useCallback(async (id: string, accessToken: string) => {
    // Verify account-object permission before the conversation call. This is
    // the checkpoint that distinguishes wrong asset assignment from empty DMs.
    const profile = await checkInstagramAccount(accessToken, id)
    const page = await getThreads(HOST, accessToken, id)
    if (bridgeAccount.current !== id) {
      profiles.current.clear()
      threadSync.current = null
    }
    automaticPages.current = 0
    seenCursors.current.clear()
    bridgeAccount.current = id
    bridgePhoto.current = profile.photo
    bridgeThreads.current = page.data || []
    setAccount(id)
    setAccounts(previous => previous.some(a => a.id === id) ? previous : [...previous, profile])
    setThreads(page.data || [])
    setCursor(page.paging?.next ? (page.paging?.cursors?.after || null) : null)
    setSelected(null)
    setMessages([])
    setDraft('')
    setConnected(true)
    if (integrated) setAuto(true)
    if(isTauri())void emit(IG_BRIDGE_CONNECTED).catch(()=>{})
    setStatus(`Authorized @${profile.username}; ${(page.data || []).length} API conversations loaded`)
    if (integrated) {
      void publishThreads(page.data || [], id, accessToken).then(() => emit(IG_BRIDGE_CONNECTED)).catch(() => {})
    }
  }, [integrated, publishThreads])

  useEffect(() => {
    if (!integrated || !isTauri() || restoreStarted.current || ratePaused) return
    restoreStarted.current = true
    busyRef.current = true
    setBusy(true)
    void invoke<{ token: string; accountId: string } | null>('load_instagram_credential').then(async saved => {
      if (!saved) return
      setRemember(true)
      let savedToken = saved.token
      // Instagram Login tokens last 60 days; extend them whenever Elsewhere starts.
      try {
        const renewed = await refreshInstagramLoginToken(savedToken)
        if (renewed && renewed !== savedToken) {
          savedToken = renewed
          await invoke('save_instagram_credential', { credential: { token: renewed, accountId: saved.accountId } })
        }
      } catch { /* The current token still works until it expires. */ }
      tokenRef.current = savedToken
      try {
        await openAccount(saved.accountId, savedToken)
        setToken(savedToken)
      } catch (cause) {
        tokenRef.current = ''
        setError('Saved Instagram sign-in needs attention. ' + safeError(cause))
      }
    }).catch(cause => setError(String(cause))).finally(() => {
      busyRef.current = false
      setBusy(false)
    })
  }, [integrated, openAccount, ratePaused])

  const pendingLogin = useRef<{ state: string; stop: () => void } | null>(null)
  useEffect(() => () => pendingLogin.current?.stop(), [])
  function connectWithInstagram() {
    void guard(async () => {
      if (!META_APP_ID || !INSTAGRAM_LOGIN_CONFIG_ID) throw new Error('Instagram connect isn’t set up in this build yet.')
      if (!isTauri()) throw new Error('Open Elsewhere Messenger to connect Instagram.')
      const session = (await cloud?.auth.getSession())?.data.session
      if (!session) throw new Error('Sign in to your Elsewhere account first.')
      pendingLogin.current?.stop()
      const state = randomState()
      await invoke('start_instagram_oauth_callback')
      const stop = await listen<string>(INSTAGRAM_CALLBACK, ({ payload }) => {
        if (pendingLogin.current?.state !== state) return
        pendingLogin.current.stop()
        pendingLogin.current = null
        const query = new URLSearchParams(payload.slice(payload.indexOf('?') + 1))
        void guard(async () => {
          if (query.get('state') !== state) throw new Error('Instagram sign-in didn’t match. Try connecting again.')
          if (query.get('error')) throw new Error(query.get('error') === 'denied' ? 'Instagram connection was cancelled.' : 'Instagram couldn’t complete the sign-in. Try again.')
          const code = query.get('code') || ''
          const fresh = (await cloud?.auth.getSession())?.data.session
          if (!fresh) throw new Error('Sign in to your Elsewhere account first.')
          setStatus('Finishing Instagram sign-in…')
          const response = await nativeFetch(INSTAGRAM_HELPER, {
            method: 'POST',
            headers: { Authorization: `Bearer ${fresh.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          })
          const body = await response.json().catch(() => ({})) as { accessToken?: string; message?: string }
          if (!response.ok || !body.accessToken) throw new Error(body.message || 'Instagram connect is temporarily unavailable.')
          const instagramToken = body.accessToken
          // Unified login returns a system-user token; find the Instagram account it was granted.
          const owned = await identifyInstagramAccount(HOST, instagramToken)
          setAccounts(owned)
          const own = owned[0]
          if (!own) throw new Error('Meta didn’t share an Instagram account. Connect again and choose your Instagram account when asked.')
          tokenRef.current = instagramToken
          setToken(instagramToken)
          await openAccount(own.id, instagramToken)
          if (integrated) await invoke('save_instagram_credential', { credential: { token: instagramToken, accountId: own.id } })
          setRemember(true)
        })
      })
      pendingLogin.current = { state, stop }
      // Meta "Unified login": Facebook Login for Business with Elsewhere's Instagram configuration.
      const authorize = new URL('https://www.facebook.com/v27.0/dialog/oauth')
      authorize.searchParams.set('client_id', META_APP_ID)
      authorize.searchParams.set('config_id', INSTAGRAM_LOGIN_CONFIG_ID)
      authorize.searchParams.set('redirect_uri', INSTAGRAM_HELPER)
      authorize.searchParams.set('response_type', 'code')
      authorize.searchParams.set('override_default_response_type', 'true')
      authorize.searchParams.set('state', state)
      await openUrl(authorize.toString())
      setStatus('Finish signing in to Instagram in your browser…')
    })
  }

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void guard(async () => {
      const key = tokenRef.current.trim()
      if (!key) throw new Error('Enter a Unified Login system-user access token.')
      let list: IGAccount[] = []
      // Do not silently fall back to arbitrary account IDs after failed lookup.
      try {
        list = await identifyInstagramAccount(HOST, key)
        setAccounts(list)
      } catch (cause) {
        if (!manualId.trim()) throw new Error('Assigned-Instagram-accounts lookup failed. ' + safeError(cause))
        setStatus('Assigned-accounts lookup unavailable; checking explicitly entered account ID')
      }
      const id = manualId.trim() || list[0]?.id
      if (!id) throw new Error('No Instagram asset assigned to this system-user token. Meta must authorize the asset before a conversation can load.')
      if (!ID.test(id)) throw new Error('Instagram account ID must be numeric.')
      await openAccount(id, key)
      if (integrated) {
        try {
          if (remember) await invoke('save_instagram_credential', { credential: { token: key, accountId: id } })
          else await invoke('forget_instagram_credential')
        } catch (cause) { setError(String(cause)) }
      }
    })
  }

  const loadMessages = useCallback(async (id: string, accessToken: string) => {
    const result = await getThreadMessages(HOST, accessToken, id)
    const synced = cacheRef.current ? await mergeCachedHistory(account,id,result.data||[]) : result.data||[]
    setMessages([...synced].sort((a,b) => (a.created_time || '').localeCompare(b.created_time || '')))
    setSelected(id)
    setDraft('')
    setStatus(`Retrieved ${(result.data || []).length} real messages from Meta`)
  }, [account])

  function chooseThread(id: string) { void guard(async () => loadMessages(id, tokenRef.current)) }
  function refresh() {
    const remaining = instagramRateLimitRemainingMs()
    if (remaining > 0) {
      setRateRemainingMs(remaining)
      setError(instagramRateLimitMessage())
      return
    }
    void guard(async () => {
    if (!account) return
    const page = await getThreads(HOST, tokenRef.current, account)
    if (integrated) {
      const merged = new Map(bridgeThreads.current.map(thread => [thread.id, thread]))
      for (const thread of page.data || []) merged.set(thread.id, thread)
      await publishThreads([...merged.values()], account, tokenRef.current)
      await emit(IG_BRIDGE_CONNECTED)
    } else setThreads(page.data || [])
    setCursor(page.paging?.next ? (page.paging.cursors?.after || null) : null)
    if (selectedRef.current) await loadMessages(selectedRef.current, tokenRef.current)
    setStatus('Refreshed from Meta')
  })
  }
  const fetchNextPage = useCallback(async (owner: string, next: string) => {
    const accessToken = tokenRef.current
    if (!accessToken || seenCursors.current.has(next)) return
    seenCursors.current.add(next)
    try {
      const page = await getThreads(HOST, accessToken, owner, next)
      if (bridgeAccount.current !== owner || tokenRef.current !== accessToken) return
      if (integrated) {
        await publishThreads(page.data || [], owner, accessToken)
        await emit(IG_BRIDGE_CONNECTED)
        setStatus(`${bridgeThreads.current.length} Instagram conversations loaded.`)
      } else {
        setThreads(old => [...new Map([...old, ...(page.data || [])].map(thread => [thread.id, thread])).values()])
      }
      const after = page.paging?.next ? page.paging.cursors?.after : undefined
      setCursor(after && !seenCursors.current.has(after) ? after : null)
    } catch (cause) {
      seenCursors.current.delete(next)
      throw cause
    }
  }, [integrated, publishThreads])

  function nextPage() {
    if (cursor && account) void guard(() => fetchNextPage(account, cursor))
  }

  useEffect(() => {
    if (!integrated || !connected || !cursor || !account || busy || ratePaused || automaticPages.current >= 6) return
    const timer = window.setTimeout(() => {
      if (busyRef.current || instagramRateLimitRemainingMs() > 0) return
      automaticPages.current += 1
      void fetchNextPage(account, cursor).catch(cause => setError(safeError(cause)))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [integrated, connected, cursor, account, busy, ratePaused, fetchNextPage])

  // Refresh the conversation list now (used by the 3-minute timer and by instant webhook signals).
  const pollNow = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!auto || !connected || !account) return
    let canceled = false
    let running = false
    const poll = () => {
      if (canceled || running || busyRef.current || !tokenRef.current || instagramRateLimitRemainingMs() > 0) return
      running = true
      void getThreads(HOST, tokenRef.current, account).then(async page => {
        if (canceled) return
        const previous = bridgeThreads.current
        const merged = new Map(previous.map(thread => [thread.id, thread]))
        for (const thread of page.data || []) merged.set(thread.id, thread)
        const latest = [...merged.values()].sort((a, b) => (b.updated_time || '').localeCompare(a.updated_time || ''))
        if (integrated) {
          await publishThreads(latest, account, tokenRef.current)
          await emit(IG_BRIDGE_CONNECTED)
          const prior = new Map(previous.map(thread => [thread.id, thread.updated_time]))
          const changed = (page.data || []).filter(thread => thread.updated_time &&
            (!prior.has(thread.id) || Date.parse(thread.updated_time) > Date.parse(prior.get(thread.id) || '')))
          for (const thread of changed.slice(0, 3)) {
            if (canceled || !desktopNotificationsEnabled()) break
            const result = await getThreadMessages(HOST, tokenRef.current, thread.id)
            const newest = (result.data || []).reduce<IGMessage | undefined>((last, item) =>
              !last || Date.parse(item.created_time || '') > Date.parse(last.created_time || '') ? item : last, undefined)
            if (!canceled && newest?.from?.id && newest.from.id !== account) {
              await desktopNotice('instagram', {
                contactId: 'instagram:' + thread.id,
                sender: newest.from.username || newest.from.name || externalLabel(thread, account),
                preview: newest.message || newest.text || (newest.attachments ? 'Sent an attachment' : undefined),
              }).catch(console.error)
              break
            }
          }
        } else setThreads(latest)
        // Selected conversation updates are handled by the chat-window refresh.
        // Do not duplicate that request from the main window's contact poll.
      }).catch(cause => { if (!canceled) setError(safeError(cause)) }).finally(() => { running = false })
    }
    pollNow.current = poll
    const timer = window.setInterval(poll, 180000)
    return () => { canceled = true; pollNow.current = null; window.clearInterval(timer) }
  }, [auto, connected, account, integrated, publishThreads])

  // Instant updates: link this Instagram account to the Elsewhere account on the server, then listen
  // for contentless "new activity" signals that Meta's webhook writes for it.
  const [liveStatus, setLiveStatus] = useState('')
  useEffect(() => {
    if (!integrated || !isTauri() || !connected || !account || !cloud) return
    const client = cloud
    let alive = true
    let channel: ReturnType<typeof client.channel> | undefined
    void (async () => {
      const session = (await client.auth.getSession()).data.session
      if (!session || !alive) return
      try {
        const response = await nativeFetch(INSTAGRAM_HELPER, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'link', igAccountId: account, accessToken: tokenRef.current }),
        })
        const body = await response.json().catch(() => ({})) as { linked?: boolean; subscribed?: boolean; metaError?: string; message?: string }
        if (!alive) return
        setLiveStatus(!response.ok || !body.linked ? 'Instant updates are off: ' + (body.message || 'server not ready.')
          : body.subscribed ? 'Instant updates are on.'
            : 'Instant updates are waiting on Meta' + (body.metaError ? ' (' + body.metaError + ')' : '') + '. New messages still arrive every few minutes.')
      } catch { if (alive) setLiveStatus('Instant updates are off right now. New messages still arrive every few minutes.') }
      if (!alive) return
      channel = client.channel('elsewhere-ig-activity-' + session.user.id + '-' + crypto.randomUUID())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'elsewhere_instagram_activity', filter: `user_id=eq.${session.user.id}` },
          () => {
            pollNow.current?.()
            void emit(IG_LIVE_ACTIVITY).catch(() => {})
          }).subscribe()
    })()
    return () => { alive = false; if (channel) void client.removeChannel(channel) }
  }, [integrated, connected, account])

  const current = useMemo(() => threads.find(t => t.id === selected), [threads, selected])
  const recipient = current && account ? otherParticipant(current, account) : undefined
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void guard(async () => {
      if (!account || !selected || !recipient?.id) throw new Error('Select an eligible conversation with a valid recipient ID.')
      const text = draft.trim()
      if (!text) return
      // No local success bubbles; Meta must accept the real write first.
      const result = await sendInstagramText(tokenRef.current, account, recipient.id, text)
      if (!result.message_id) throw new Error('Meta did not return a message ID. Send outcome unknown; check Instagram before retrying.')
      setDraft('')
      try { await loadMessages(selected, tokenRef.current) }
      catch (cause) { setError('Sent, but refresh failed: ' + safeError(cause)) }
      setStatus(`Meta accepted message ${result.message_id}. Confirm delivery in Instagram.`)
    })
  }
  function disconnect() {
    profiles.current.clear(); threadSync.current = null; bridgeAccount.current = ''; bridgePhoto.current = undefined; bridgeThreads.current = []
    setToken(''); tokenRef.current = ''; setManualId(''); setAccount(''); setAccounts([])
    setThreads([]); setMessages([]); setSelected(null); setCursor(null); setDraft('')
    setConnected(false); setAuto(false); setStatus('Disconnected'); setError('')
    setRemember(false)
    if (integrated && isTauri()) void invoke('forget_instagram_credential').catch(cause => setError(String(cause)))
    if(isTauri())void emit(IG_BRIDGE_DISCONNECTED).catch(()=>{})
  }

  if(integrated){
    return <>
      {panelOpen && <div className="ew-ig-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPanelOpen(false)}}>
        <section className="ew-ig-connection" role="dialog" aria-modal="true" aria-label="Instagram Connection">
          <header><strong>Instagram Connection</strong><button type="button" onClick={()=>setPanelOpen(false)} aria-label="Close">×</button></header>
          <p>{connected ? status : status.startsWith('Finish') ? status : 'Sign in with Instagram to bring your Instagram DMs into Elsewhere. Works with Business and Creator accounts.'}</p>
          {ratePaused && <p role="status" className="ew-ig-note">Instagram paused by Meta. About {rateMinutes} minute(s) remain. Contacts may be temporarily unavailable; Elsewhere will not retry automatically during this cooldown.</p>}
          {!connected ? <>
            <div className="ew-ig-warning" role="note">
              <strong>Business or Creator accounts only.</strong> Instagram doesn’t let apps connect to personal accounts.
              You can switch for free in Instagram: <em>Settings → Account type and tools → Switch to professional account</em>.
              You’ll sign in through Facebook and choose your Instagram account. During the beta, your account must also be added as a tester.
            </div>
            <div className="ew-ig-actions"><button type="button" onClick={connectWithInstagram} disabled={busy || ratePaused}>
              {busy ? 'Connecting…' : ratePaused ? `Instagram paused (${rateMinutes}m)` : 'Connect Instagram'}</button></div>
            <p className="ew-ig-note">Meta opens in your browser. Sign in, choose your Instagram account and allow access, then come back here. Instagram only lets apps reply within 24 hours of someone’s last message, and shows the newest 20 messages per chat.</p>
            <details className="ew-ig-note"><summary>Advanced: developer token</summary>
              <form onSubmit={connect}>
                <label>System-user access token<input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} placeholder="Paste your Instagram token" required /></label>
                <label>Account ID (optional)<input type="text" inputMode="numeric" value={manualId} onChange={event=>setManualId(event.target.value)} /></label>
                <label><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> Remember Instagram on this Windows PC</label>
                <button disabled={busy || ratePaused} type="submit">Connect with token</button>
              </form>
            </details>
          </> : <div className="ew-ig-actions"><button type="button" onClick={refresh} disabled={busy || ratePaused} title={ratePaused ? `Rate limit: ${rateMinutes} minute(s) remaining` : 'Refresh Instagram contacts'}>{ratePaused ? `Refresh paused (${rateMinutes}m)` : 'Refresh contacts'}</button>{cursor && <button type="button" disabled={busy || ratePaused} onClick={nextPage}>Load more conversations</button>}<button type="button" onClick={disconnect}>Disconnect</button></div>}
          {connected && liveStatus && <p className="ew-ig-note" role="status">{liveStatus}</p>}
          <p className="ew-ig-note">Your Instagram sign-in is saved in Windows Credential Manager under your Elsewhere account. Disconnect removes it.</p>
          {error && <p role="alert" className="ew-ig-error">{error}</p>}
        </section>
      </div>}
    </>
  }
  return <main className={`ig-inbox ig-${theme}`}>
    <header className="ig-header"><span>✦</span><strong>Elsewhere Messenger · Instagram</strong><small>Unified Login API test</small></header>
    <section className="ig-status"><span>{status}</span><span>{isTauri() ? 'Tauri native API connection' : 'Browser: API disabled'}</span></section>
    {!connected ? <div className="ig-login">
      <h2>Instagram authorization checkpoint</h2>
      <p>For your existing Unified Login app. Connect with its <strong>system-user token</strong> on Facebook Graph. No Instagram website wrapper.</p>
      <form onSubmit={connect}>
        <label>Unified Login system-user access token<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={e => setToken(e.target.value)} required placeholder="Paste privately on this computer" /></label>
        <label>Instagram account ID (optional, only to diagnose failed asset discovery)<input type="text" autoComplete="off" inputMode="numeric" value={manualId} onChange={e => setManualId(e.target.value)} placeholder="Leave blank for assigned account lookup" /></label>
        <button type="submit" disabled={busy || !isTauri()}>{busy ? 'Checking Meta…' : 'Verify account & load real conversations'}</button>
      </form>
      <p className="ig-muted">Access token remains in this window's memory only. Never share it in screenshots, chat, logs or GitHub.</p>
      <p className="ig-muted">If Meta returns 100/33, this checkpoint failed: the token has no access to the specified Instagram account object. Don't keep changing account IDs.</p>
    </div> : <div className="ig-layout"><aside className="ig-sidebar">
      <div className="ig-controls"><strong>Real Instagram inbox</strong><button type="button" disabled={busy || ratePaused} onClick={refresh}>{ratePaused ? `Paused ${rateMinutes}m` : 'Refresh'}</button></div>
      <div className="ig-controls"><label><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Poll every 3 min</label><button type="button" onClick={disconnect}>Disconnect</button></div>
      {ratePaused && <p role="status" className="ig-muted">Instagram paused by Meta. About {rateMinutes} minute(s) left. Manual refresh is disabled.</p>}
      <div className="ig-controls"><label title="Message contents are stored unencrypted in your local app data on this device; access tokens are never cached."><input type="checkbox" checked={cacheHistory} onChange={e=>setCacheHistory(e.target.checked)} /> Save accessible history locally</label><button type="button" onClick={()=>{if(window.confirm('Delete all locally cached Instagram messages on this device?')) void clearCachedHistory().then(()=>setStatus('Local Instagram history deleted')).catch(e=>setError(safeError(e)))}}>Clear saved history</button></div>
      {cacheHistory && <small className="ig-muted">Saved message content is unencrypted on this device. Your access token is never stored.</small>}
      {accounts.length > 1 && <label>Account<select value={account} onChange={e => { void guard(async () => openAccount(e.target.value, tokenRef.current)) }}>{accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}</select></label>}
      <div className="ig-threads">{threads.length ? threads.map(t => <button key={t.id} type="button" className={selected === t.id ? 'active' : ''} onClick={() => chooseThread(t.id)} disabled={busy}><strong>{externalLabel(t, account)}</strong><small>{t.updated_time ? new Date(t.updated_time).toLocaleString() : 'Instagram conversation'}</small></button>) : <p>Meta returned zero accessible conversations. This is not proof your Instagram inbox is empty.</p>}{cursor && <button type="button" disabled={busy} onClick={nextPage}>More conversations</button>}</div>
    </aside><section className="ig-chat"><div className="ig-chat-head"><strong>{current ? externalLabel(current, account) : 'Choose a conversation'}</strong><small>{recipient?.id ? 'API recipient available' : 'Read only until eligible recipient selected'}</small></div>
      <div className="ig-messages" aria-live="polite">{selected ? (messages.length ? messages.map(m => <article key={m.id} className={m.from?.id === account ? 'own' : 'other'}><small>{m.from?.username || m.from?.name || m.from?.id || 'Instagram'} · {m.created_time ? new Date(m.created_time).toLocaleString() : ''}</small><InstagramMessageContent message={m} /></article>) : <p>No API-accessible messages returned.</p>) : <p>Select a real conversation from the list.</p>}</div>
      <form className="ig-composer" onSubmit={send}><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={recipient ? 'Reply through Meta API…' : 'Select a conversation with a recipient'} maxLength={1000} disabled={!recipient || busy} rows={3} /><button type="submit" disabled={!recipient || busy || !draft.trim()}>{busy ? 'Working…' : 'Send real DM'}</button></form>
      <footer className="ig-chat-foot">This is the API proof-of-connection window, not yet the shared Classic / Dead Signal native composer. A successful API response is not delivery confirmation; verify on the recipient's Instagram.</footer>
    </section></div>}
    {error && <div className="ig-error" role="alert">{error}</div>}
    <footer className="ig-bottom">Instagram developer test · No token written to disk · No simulated messages</footer>
  </main>
}
