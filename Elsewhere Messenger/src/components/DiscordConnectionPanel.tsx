import { DISCORD_CLIENT_ID } from '../services/publicAppIds'
import DiscordServerPanel from './DiscordServerPanel'
import { useEffect, useRef, useState } from 'react'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { clearDiscordConnection, setDiscordConnection, useDiscordConnection, type DiscordGuild, type DiscordIdentity } from '../services/discordConnection'
import './DiscordConnectionPanel.css'

const CALLBACK = 'http://127.0.0.1:8765/discord/callback'
const KEY = 'elsewhere.discord.public-client-id'
const DISCORD_API = 'https://discord.com/api/v10'

type Pending = { state: string; verifier: string; clientId: string; remember: boolean }
type SavedAccount = { clientId: string; refreshToken: string }
type DiscordAuth = { access_token?: string; refresh_token?: string }
function randomString(size = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
async function pkceChallenge(verifier: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default function DiscordConnectionPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connection = useDiscordConnection()
  const [clientId, setClientId] = useState(() => { try { return localStorage.getItem(KEY) || DISCORD_CLIENT_ID } catch { return DISCORD_CLIENT_ID } })
  const [authorizationUrl, setAuthorizationUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [remember, setRemember] = useState(() => /Windows/.test(navigator.userAgent))
  const [remembered, setRemembered] = useState(false)
  const [restoreFailed, setRestoreFailed] = useState(false)
  const restored = useRef(false)
  const pending = useRef<Pending | null>(null)
  const alive = useRef(true)
  const busyRef = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    if (!restored.current) {
      restored.current = true
      void restoreAccount()
    }
    let disposed = false
    let unlisten: undefined | (() => void)
    void listen<string>('elsewhere:discord:oauth-callback', event => {
      void finishCallback(event.payload)
    }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(() => setError('Could not listen for the Discord callback.'))
    return () => { disposed = true; unlisten?.() }
    // Listener is kept mounted even if the panel is hidden; the main window owns OAuth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function requestToken(fields: Record<string, string>): Promise<DiscordAuth> {
    const response = await tauriFetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      connectTimeout: 10000,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (fields.grant_type === 'refresh_token' && payload?.error === 'invalid_grant') {
        throw new Error('Discord rejected the saved authorization. Authorize once to replace it.')
      }
      throw new Error(`Discord authorization failed (HTTP ${response.status}). Check the network and your Discord app settings.`)
    }
    const auth = await response.json() as DiscordAuth
    if (!auth.access_token) throw new Error('Discord returned no access token.')
    return auth
  }

  async function loadIdentity(accessToken: string) {
    const headers = { Authorization: `Bearer ${accessToken}` }
    const who = await tauriFetch(`${DISCORD_API}/users/@me`, { headers, connectTimeout: 10000 })
    if (!who.ok) throw new Error(`Discord profile request failed (HTTP ${who.status}).`)
    const identity = await who.json() as DiscordIdentity
    const memberships = await tauriFetch(`${DISCORD_API}/users/@me/guilds`, { headers, connectTimeout: 10000 })
    const guilds = memberships.ok ? await memberships.json() as DiscordGuild[] : []
    if (alive.current) setDiscordConnection(identity, guilds, accessToken)
  }

  async function restoreAccount() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setRestoreFailed(false)
    try {
      const saved = await invoke<SavedAccount | null>('load_discord_account')
      if (!saved) return
      setClientId(saved.clientId)
      setRemember(true)
      setRemembered(true)
      const auth = await requestToken({
        grant_type: 'refresh_token', client_id: saved.clientId, refresh_token: saved.refreshToken,
      })
      if (auth.refresh_token && auth.refresh_token !== saved.refreshToken) {
        await invoke('save_discord_account', { credential: { clientId: saved.clientId, refreshToken: auth.refresh_token } })
      }
      await loadIdentity(auth.access_token!)
    } catch (cause) {
      if (alive.current) {
        setRestoreFailed(true)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  async function disconnectAccount() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await invoke('forget_discord_account')
      clearDiscordConnection()
      setAuthorizationUrl('')
      setRemembered(false)
      setRestoreFailed(false)
    } catch (cause) { setError(String(cause)) }
    finally { busyRef.current = false; setBusy(false) }
  }

  async function start() {
    if (busyRef.current) return
    setError('')
    if (!isTauri()) { setError('Discord connection requires the native Elsewhere app.'); return }
    const id = clientId.trim()
    if (!/^\d{15,25}$/.test(id)) { setError('Enter the public Application ID from Discord Developer Portal.'); return }
    try {
      const redirect = await invoke<string>('start_discord_oauth_callback')
      if (redirect !== CALLBACK) throw new Error('Unexpected callback address.')
      const verifier = randomString(48)
      const state = randomString(24)
      const challenge = await pkceChallenge(verifier)
      pending.current = { state, verifier, clientId: id, remember }
      try { localStorage.setItem(KEY, id) } catch { /* Client ID is public; persistence optional */ }
      const params = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: CALLBACK,
        scope: 'identify guilds', state, code_challenge: challenge, code_challenge_method: 'S256' })
      const url = `https://discord.com/oauth2/authorize?${params}`
      setAuthorizationUrl(url)
      // Open the system browser by user action when available; a copyable link remains.
      await openUrl(url)
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)) }
  }

  async function finishCallback(path: string) {
    const attempt = pending.current
    if (!attempt || busyRef.current) return
    const data = new URL(path, CALLBACK)
    if (data.pathname !== '/discord/callback' || data.searchParams.get('state') !== attempt.state) {
      setError('Discord returned an unexpected OAuth state. Authorization cancelled.')
      pending.current = null
      return
    }
    const oauthError = data.searchParams.get('error')
    const code = data.searchParams.get('code')
    if (oauthError || !code) { pending.current = null; setError(oauthError || 'Discord did not return an authorization code.'); return }
    busyRef.current = true
    setBusy(true)
    pending.current = null
    try {
      const auth = await requestToken({
        grant_type: 'authorization_code', client_id: attempt.clientId,
        code, redirect_uri: CALLBACK, code_verifier: attempt.verifier,
      })
      let saveError = ''
      try {
        if (attempt.remember) {
          if (!auth.refresh_token) throw new Error('Discord linked this session but returned no refresh token to save.')
          await invoke('save_discord_account', { credential: { clientId: attempt.clientId, refreshToken: auth.refresh_token } })
        } else await invoke('forget_discord_account')
        setRemembered(attempt.remember)
      } catch (cause) { saveError = cause instanceof Error ? cause.message : String(cause) }
      await loadIdentity(auth.access_token!)
      if (alive.current) {
        setAuthorizationUrl('')
        setRestoreFailed(false)
        setError(saveError)
      }
    } catch (cause) {
      if (alive.current) setError(String(cause instanceof Error ? cause.message : cause))
    } finally { busyRef.current = false; if (alive.current) setBusy(false) }
  }

  return <section className="ew-discord-mask" hidden={!open} aria-hidden={!open}>
    <div className="ew-discord-panel" role="dialog" aria-modal="true" aria-label="Discord connection">
      <header><strong>Discord · Elsewhere</strong><button type="button" onClick={onClose} aria-label="Close Discord connection">×</button></header>
      <div className="ew-discord-content">
        {connection ? <>
          <p><strong>Connected as {connection.identity.global_name || connection.identity.username}</strong></p>
          <p>Authorized Discord identity. {connection.guilds.length} accessible server(s) listed below.</p>
          <div className="ew-discord-guilds">{connection.guilds.map(g => <div key={g.id}>{g.name}</div>)}</div>
          <p className="ew-discord-muted">Personal DMs, friend lists and message history are not exposed by these permissions. Server chat requires a separately authorized bot.</p>
          {remembered && <p>Discord account saved on this PC.</p>}
          <button type="button" disabled={busy} onClick={() => void disconnectAccount()}>Disconnect account</button>
        </> : <>
          <p>Sign in with Discord to show your Discord name and servers in Elsewhere. Discord opens in your browser; nothing to set up.</p>
          {/Windows/.test(navigator.userAgent) && <label><input type="checkbox" checked={remember}
            onChange={event => setRemember(event.target.checked)} /> Remember my Discord account on this PC</label>}
          <div className="ew-discord-actions"><button type="button" disabled={busy} onClick={() => void start()}>Connect Discord</button>
            {restoreFailed && <button type="button" disabled={busy} onClick={() => void restoreAccount()}>Retry saved account</button>}
            {remembered && <button type="button" disabled={busy} onClick={() => void disconnectAccount()}>Forget saved account</button>}
          </div>
          {authorizationUrl && <p>If your browser did not open, <a href={authorizationUrl} onClick={e => { e.preventDefault(); void openUrl(authorizationUrl).catch(err => setError(String(err))) }}>open Discord authorization</a>. A callback tab will confirm success.</p>}
          <p className="ew-discord-muted">If enabled, Windows Credential Manager keeps the authorization for the next launch.</p>
          <details className="ew-discord-muted">
            <summary>Advanced: use a different Discord application</summary>
            <label htmlFor="ew-discord-id">Discord Application ID (public)</label>
            <input id="ew-discord-id" value={clientId} onChange={e => setClientId(e.target.value)} placeholder={DISCORD_CLIENT_ID} />
            <p>The application needs <strong>Public Client</strong> enabled and this redirect: <code>{CALLBACK}</code></p>
          </details>
        </>}
        <DiscordServerPanel clientId={clientId.trim()} />
        {busy && <p>Checking Discord account...</p>}
        {error && <p role="alert" className="ew-discord-error">{error}</p>}
      </div>
    </div>
  </section>
}
