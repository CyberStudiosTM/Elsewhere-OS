import { useEffect, useState } from 'react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export type SpotifyTrack = { title: string; artist: string; artwork?: string; url?: string; playing: boolean }
type State = { connected: boolean; track: SpotifyTrack | null; hidden: boolean; error: string | null }
const EVENT = 'elsewhere:spotify:changed'
const HIDE_KEY = 'elsewhere.spotify.hide-activity'
let accessToken: string | null = null
let refreshToken: string | null = null
let expiresAt = 0
let clientId = ''
let timer: ReturnType<typeof setInterval> | null = null
let inFlight = false
let nextAllowedAt = 0
let state: State = { connected: false, track: null, hidden: readHidden(), error: null }
function readHidden() { try { return localStorage.getItem(HIDE_KEY) === 'true' } catch { return false } }
function update(patch: Partial<State>) { state = { ...state, ...patch }; window.dispatchEvent(new Event(EVENT)) }
export function spotifyState() { return state }
export function useSpotifyNowPlaying() {
  const [value, setValue] = useState(spotifyState)
  useEffect(() => {
    const listener = () => setValue(spotifyState())
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  }, [])
  return value
}
export function setSpotifyPrivate(hidden: boolean) {
  try { localStorage.setItem(HIDE_KEY, String(hidden)) } catch { /* optional */ }
  update({ hidden })
}
async function refreshAccessToken() {
  if (!refreshToken || !clientId) throw new Error('Reconnect Spotify to continue.')
  const response = await tauriFetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }).toString(),
  })
  if (!response.ok) throw new Error(`Spotify token refresh failed (${response.status}).`)
  const body = await response.json() as { access_token: string; expires_in: number; refresh_token?: string }
  accessToken = body.access_token
  refreshToken = body.refresh_token || refreshToken
  expiresAt = Date.now() + Math.max(30, body.expires_in - 60) * 1000
}
export async function connectSpotify(id: string, code: string, verifier: string, redirect: string) {
  const response = await tauriFetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: id, code, redirect_uri: redirect, code_verifier: verifier }).toString(),
  })
  if (!response.ok) throw new Error(`Spotify authorization failed (${response.status}). Check redirect URI and Client ID.`)
  const body = await response.json() as { access_token: string; refresh_token?: string; expires_in: number }
  if (!body.access_token) throw new Error('Spotify returned no access token.')
  clientId = id
  accessToken = body.access_token
  refreshToken = body.refresh_token || null
  expiresAt = Date.now() + Math.max(30, body.expires_in - 60) * 1000
  update({ connected: true, error: null })
  await getSpotifyPlayback()
  if (timer) clearInterval(timer)
  timer = setInterval(() => { if (!document.hidden) void getSpotifyPlayback() }, 60000)
}
export async function getSpotifyPlayback() {
  if (!accessToken || inFlight || Date.now() < nextAllowedAt) return
  inFlight = true
  try {
    if (Date.now() >= expiresAt) await refreshAccessToken()
    const response = await tauriFetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 204) { update({ track: null, error: null }); return }
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After') || '60')
      nextAllowedAt = Date.now() + Math.max(60, Math.min(Number.isFinite(seconds) ? seconds : 60, 3600)) * 1000
      update({ error: 'Spotify temporarily rate-limited requests.' }); return
    }
    if (response.status === 403) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
      const detail = body?.error?.message
      update({ track: null, error: `Spotify denied playback access (403).${detail ? ' ' + detail : ''} For a Development Mode app, confirm the app owner has Premium and the Spotify account you authorized is listed under Users and Access. Then disconnect and reconnect.` })
      return
    }
    if (!response.ok) throw new Error(`Spotify playback request failed (${response.status}).`)
    const data = await response.json() as {
      is_playing?: boolean; item?: { name?: string; type?: string; artists?: { name: string }[];
      album?: { images?: { url: string }[] }; external_urls?: { spotify?: string } } | null
    }
    const item = data.item
    update({ error: null, track: item?.type === 'track' && item.name ? {
      title: item.name, artist: item.artists?.map(a => a.name).join(', ') || 'Unknown artist',
      artwork: item.album?.images?.[0]?.url, url: item.external_urls?.spotify, playing: Boolean(data.is_playing),
    } : null })
  } catch (cause) { update({ error: cause instanceof Error ? cause.message : String(cause) }) }
  finally { inFlight = false }
}
export function disconnectSpotify() {
  if (timer) clearInterval(timer)
  timer = null; accessToken = null; refreshToken = null; clientId = ''; expiresAt = 0; nextAllowedAt = 0
  update({ connected: false, track: null, error: null })
}
