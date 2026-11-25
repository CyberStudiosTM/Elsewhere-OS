// Instagram sign-in helper for Elsewhere Messenger (Meta "Unified login",
// i.e. Facebook Login for Business with an Instagram configuration).
//
// GET  (Meta redirects the browser here): passes the one-time code to the
//      Elsewhere app listening on this PC at 127.0.0.1:8766. The code is useless
//      without the app secret, which never leaves this function.
// POST (from a signed-in Elsewhere app): swaps the code for that person's own
//      access token and returns it. Nothing is stored or logged.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const appId = Deno.env.get('ELSEWHERE_META_APP_ID') || ''
const appSecret = Deno.env.get('ELSEWHERE_META_APP_SECRET') || ''
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
function projectKey(keysVariable: string, legacyVariable: string): string {
  const keys = Deno.env.get(keysVariable)
  if (keys) {
    try {
      const key = JSON.parse(keys)?.default
      if (typeof key === 'string' && key.trim()) return key
    } catch { /* The legacy key still works on projects supplying one. */ }
  }
  return Deno.env.get(legacyVariable) || ''
}
const publicKey = projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
const adminKey = projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
const ACCOUNT = /^[0-9]{6,30}$/
const redirectUri = supabaseUrl.replace(/\/$/, '') + '/functions/v1/elsewhere-instagram-auth'
const APP_CALLBACK = 'http://127.0.0.1:8766/instagram/callback'
const STATE = /^[A-Za-z0-9_-]{20,100}$/
const CODE = /^[A-Za-z0-9_.#-]{10,2048}$/

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

function toApp(params: Record<string, string>) {
  const target = new URL(APP_CALLBACK)
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}

Deno.serve(async request => {
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const state = url.searchParams.get('state') || ''
    if (!STATE.test(state)) return new Response('This page is only for connecting Instagram to Elsewhere.', { status: 400 })
    const error = url.searchParams.get('error')
    if (error) return toApp({ state, error: error === 'access_denied' ? 'denied' : 'failed' })
    const code = (url.searchParams.get('code') || '').replace(/#_$/, '')
    if (!CODE.test(code)) return toApp({ state, error: 'failed' })
    return toApp({ state, code })
  }
  if (request.method !== 'POST') return json(405, { message: 'Unsupported request.' })
  if (!appId || !appSecret || !supabaseUrl || !publicKey) return json(503, { message: 'Instagram connect isn’t set up yet.' })

  // Only signed-in, verified Elsewhere accounts may use the app secret.
  const jwt = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { message: 'Sign in to Elsewhere first.' })
  const auth = createClient(supabaseUrl, publicKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: who, error: whoError } = await auth.auth.getUser(jwt)
  if (whoError || !who.user?.email_confirmed_at) return json(401, { message: 'Sign in to Elsewhere first.' })

  try {
    const text = await request.text()
    if (text.length > 4096) return json(413, { message: 'Request is too large.' })
    const input = JSON.parse(text)

    // Link step: remember which Elsewhere account connected this Instagram account (for instant
    // updates), after proving the caller's own Meta token can reach it, and ask Meta to send its events.
    if (input?.action === 'link') {
      const account = String(input.igAccountId || '')
      const token = String(input.accessToken || '')
      if (!ACCOUNT.test(account) || !token || token.length > 2048 || !adminKey) return json(400, { message: 'Can’t link this Instagram account.' })
      const check = await fetch(`https://graph.facebook.com/v27.0/${account}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      })
      const owned = await check.json().catch(() => ({}))
      if (!check.ok || String(owned?.id) !== account) return json(403, { message: 'This Instagram sign-in can’t reach that account.' })
      const admin = createClient(supabaseUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } })
      const { error } = await admin.from('elsewhere_instagram_links').upsert({ ig_account_id: account, user_id: who.user.id })
      if (error) return json(503, { message: 'Instant updates aren’t set up on the server yet.' })
      const subscribe = await fetch(`https://graph.facebook.com/v27.0/${account}/subscribed_apps?subscribed_fields=messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      })
      const result = await subscribe.json().catch(() => ({}))
      return json(200, { linked: true, subscribed: subscribe.ok && result?.success === true, metaError: subscribe.ok ? undefined : String(result?.error?.message || subscribe.status).slice(0, 200) })
    }

    const code = String(input?.code || '').replace(/#_$/, '')
    if (!CODE.test(code)) return json(400, { message: 'Meta didn’t return a valid sign-in code.' })

    const exchange = new URL('https://graph.facebook.com/v27.0/oauth/access_token')
    exchange.searchParams.set('client_id', appId)
    exchange.searchParams.set('client_secret', appSecret)
    exchange.searchParams.set('redirect_uri', redirectUri)
    exchange.searchParams.set('code', code)
    const response = await fetch(exchange, { signal: AbortSignal.timeout(10000) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || typeof body?.access_token !== 'string') {
      return json(400, { message: 'Meta didn’t accept the sign-in. Try connecting again.' })
    }
    return json(200, { accessToken: body.access_token, expiresIn: Number(body.expires_in) || 0 })
  } catch {
    // Codes and tokens are intentionally kept out of logs.
    return json(503, { message: 'Instagram connect is temporarily unavailable.' })
  }
})
