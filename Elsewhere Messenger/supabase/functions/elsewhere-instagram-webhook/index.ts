// Meta webhook for instant Instagram updates in Elsewhere Messenger.
//
// GET  Meta's one-time verification: echoes hub.challenge when hub.verify_token matches.
// POST Meta's "messages" notifications, signed with the app secret. For each Instagram account
//      in the event, records a contentless "new activity" row for every Elsewhere account that
//      connected it. Message text is never stored or logged.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const appSecret = Deno.env.get('ELSEWHERE_META_APP_SECRET') || ''
const verifyToken = Deno.env.get('ELSEWHERE_META_WEBHOOK_VERIFY_TOKEN') || ''
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
const adminKey = projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
const ID = /^[0-9]{6,30}$/

async function validSignature(body: string, header: string | null) {
  if (!header?.startsWith('sha256=') || !appSecret) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const given = header.slice('sha256='.length).toLowerCase()
  if (given.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ given.charCodeAt(index)
  return difference === 0
}

Deno.serve(async request => {
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const ok = verifyToken && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken
    return ok
      ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      : new Response('Verification failed.', { status: 403 })
  }
  if (request.method !== 'POST') return new Response('Unsupported request.', { status: 405 })

  const body = await request.text()
  if (body.length > 256 * 1024) return new Response('Too large.', { status: 413 })
  if (!await validSignature(body, request.headers.get('X-Hub-Signature-256'))) return new Response('Invalid signature.', { status: 401 })
  if (!supabaseUrl || !adminKey) return new Response('Not configured.', { status: 503 })

  try {
    const event = JSON.parse(body)
    if (event?.object !== 'instagram' || !Array.isArray(event.entry)) return new Response('Ignored.', { status: 200 })
    const admin = createClient(supabaseUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const rows: { user_id: string; ig_account_id: string; sender_id: string | null }[] = []
    for (const entry of event.entry.slice(0, 50)) {
      const account = String(entry?.id || '')
      if (!ID.test(account)) continue
      const { data: links } = await admin.from('elsewhere_instagram_links').select('user_id').eq('ig_account_id', account)
      if (!links?.length) continue
      const senders = new Set<string | null>()
      for (const item of Array.isArray(entry.messaging) ? entry.messaging.slice(0, 50) : [null]) {
        const sender = String(item?.sender?.id || '')
        senders.add(ID.test(sender) ? sender : null)
      }
      for (const link of links) for (const sender of senders) rows.push({ user_id: link.user_id, ig_account_id: account, sender_id: sender })
    }
    if (rows.length) await admin.from('elsewhere_instagram_activity').insert(rows.slice(0, 500))
    // Keep the signal table tiny: anything older than a day has already been picked up.
    await admin.from('elsewhere_instagram_activity').delete().lt('event_at', new Date(Date.now() - 86400000).toISOString())
  } catch {
    // Answer 200 anyway so Meta doesn't retry a malformed event for 36 hours. Nothing is logged.
  }
  return new Response('OK', { status: 200 })
})
