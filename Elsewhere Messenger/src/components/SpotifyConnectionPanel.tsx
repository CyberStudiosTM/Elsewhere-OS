import { useEffect, useRef, useState } from 'react'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { connectSpotify, disconnectSpotify, getSpotifyPlayback, setSpotifyPrivate, useSpotifyNowPlaying } from '../services/spotifyNowPlaying'
import './SpotifyConnectionPanel.css'

const CALLBACK = 'http://127.0.0.1:8766/spotify/callback'
const KEY = 'elsewhere.spotify.public-client-id'
type Pending = { state: string; verifier: string; clientId: string }
function randomString(size = 48) {
  return Array.from(crypto.getRandomValues(new Uint8Array(size)), n => n.toString(16).padStart(2, '0')).join('')
}
async function challenge(verifier: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export default function SpotifyConnectionPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const spotify = useSpotifyNowPlaying()
  const [clientId, setClientId] = useState(() => { try { return localStorage.getItem(KEY) || '' } catch { return '' } })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const pending = useRef<Pending | null>(null)
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen<string>('elsewhere:spotify:oauth-callback', event => {
      const attempt = pending.current
      if (!attempt) return
      pending.current = null
      const returned = new URL(event.payload, CALLBACK)
      if (returned.pathname !== '/spotify/callback' || returned.searchParams.get('state') !== attempt.state) {
        setError('Spotify authorization state did not match. Please reconnect.'); return
      }
      const code = returned.searchParams.get('code')
      if (!code) { setError(returned.searchParams.get('error') || 'Spotify returned no code.'); return }
      setBusy(true)
      void connectSpotify(attempt.clientId, code, attempt.verifier, CALLBACK)
        .then(() => { setUrl(''); setError('') })
        .catch(cause => setError(String(cause instanceof Error ? cause.message : cause)))
        .finally(() => setBusy(false))
    }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(cause => setError(String(cause)))
    return () => { disposed = true; unlisten?.() }
  }, [])
  async function authorize() {
    if (!isTauri()) { setError('Spotify connection requires the Elsewhere desktop app.'); return }
    const id = clientId.trim()
    if (!/^[a-zA-Z0-9]{20,64}$/.test(id)) { setError('Enter your public Spotify Client ID.'); return }
    setError(''); setBusy(true)
    try {
      const redirect = await invoke<string>('start_spotify_oauth_callback')
      if (redirect !== CALLBACK) throw new Error('Unexpected Spotify callback URL.')
      const verifier = randomString(); const state = randomString(24)
      pending.current = { state, verifier, clientId: id }
      try { localStorage.setItem(KEY, id) } catch { /* public ID */ }
      const params = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: CALLBACK,
        scope: 'user-read-currently-playing', state, code_challenge: await challenge(verifier), code_challenge_method: 'S256' })
      const href = `https://accounts.spotify.com/authorize?${params}`
      setUrl(href)
      await openUrl(href)
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)) }
    finally { setBusy(false) }
  }
  return <section className="ew-spotify-mask" hidden={!open} aria-hidden={!open}>
    <div className="ew-spotify-panel" role="dialog" aria-modal="true" aria-label="Spotify Now Playing settings">
      <header><strong>Spotify · Now Playing</strong><button type="button" onClick={onClose} aria-label="Close Spotify settings">×</button></header>
      <div className="ew-spotify-body">
        {spotify.connected ? <>
          <p>Spotify connected. {spotify.track ? `${spotify.track.title} · ${spotify.track.artist}` : spotify.error ? 'Playback status unavailable.' : 'Nothing playing right now.'}</p>
          {spotify.track?.artwork && <img src={spotify.track.artwork} alt="Album cover" width={72} height={72} />}
          <label><input type="checkbox" checked={spotify.hidden} onChange={e => setSpotifyPrivate(e.target.checked)} /> Hide listening activity from my Messenger profile</label>
          <div className="ew-spotify-actions"><button type="button" onClick={() => void getSpotifyPlayback()}>Refresh Now Playing</button><button type="button" onClick={disconnectSpotify}>Disconnect</button></div>
        </> : <>
          <p>Connect your Spotify account using OAuth PKCE. No Spotify client secret is required or stored.</p>
          <label htmlFor="ew-spotify-client">Spotify Client ID (public)</label>
          <input id="ew-spotify-client" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Spotify Developer Dashboard Client ID" />
          <p>Register this redirect URI in your Spotify developer app:</p><code>{CALLBACK}</code>
          <div className="ew-spotify-actions"><button type="button" disabled={busy} onClick={() => void authorize()}>Connect Spotify</button></div>
          {url && <a href={url} onClick={e => { e.preventDefault(); void openUrl(url).catch(err => setError(String(err))) }}>Open authorization in browser</a>}
        </>}
        {busy && <p>Connecting...</p>}
        {(error || spotify.error) && <p role="alert" className="ew-spotify-error">{error || spotify.error}</p>}
        <p className="ew-spotify-note">Tokens remain in memory and are cleared when Elsewhere exits. Spotify availability and API quotas depend on your account and app access.</p>
      </div>
    </div>
  </section>
}
