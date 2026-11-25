// Saves an Instagram beta tester request and emails the owner, so they can add the
// person as a Tester on the Meta app (needed until Meta approves the app).
// The email goes through the owner's Google Apps Script mailer (ELSEWHERE_MAILER_URL,
// with ELSEWHERE_MAILER_SECRET). If the mailer isn't set up, the request is still saved.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

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
const mailerUrl = Deno.env.get('ELSEWHERE_MAILER_URL') || ''
const mailerSecret = Deno.env.get('ELSEWHERE_MAILER_SECRET') || ''
const metaAppId = Deno.env.get('ELSEWHERE_META_APP_ID') || ''
const options = { auth: { autoRefreshToken: false, persistSession: false } }

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

/** Accepts a facebook.com profile link (or profile.php?id=) and returns a clean https link. */
function facebookProfile(value: string): string | null {
  try {
    const url = new URL(value.trim().startsWith('http') ? value.trim() : 'https://' + value.trim())
    if (!/^(www\.|m\.|web\.)?facebook\.com$/i.test(url.hostname)) return null
    const id = url.pathname === '/profile.php' ? url.searchParams.get('id') : null
    if (id) return /^\d{5,25}$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null
    const name = url.pathname.split('/').filter(Boolean)[0] || ''
    return /^[A-Za-z0-9.]{3,80}$/.test(name) ? `https://www.facebook.com/${name}` : null
  } catch { return null }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json(405, { message: 'Unsupported request.' })
  if (!supabaseUrl || !publicKey || !adminKey) return json(503, { message: 'Tester requests aren’t set up yet.' })
  const jwt = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { message: 'Sign in to Elsewhere first.' })
  const { data: who, error: whoError } = await createClient(supabaseUrl, publicKey, options).auth.getUser(jwt)
  const user = who?.user
  if (whoError || !user?.email_confirmed_at) return json(401, { message: 'Sign in to Elsewhere first.' })

  try {
    const text = await request.text()
    if (text.length > 2048) return json(413, { message: 'Request is too large.' })
    const input = JSON.parse(text)
    const profile = facebookProfile(String(input?.facebookProfile || ''))
    if (!profile) return json(400, { message: 'Paste the link to your Facebook profile, like facebook.com/yourname.' })
    const note = String(input?.note || '').trim().slice(0, 500)
    if (input?.agreedToTest !== true) return json(400, { message: 'Please agree to be a beta tester first.' })

    const admin = createClient(supabaseUrl, adminKey, options)
    const { data: existing } = await admin.from('elsewhere_tester_requests').select('status').eq('user_id', user.id).maybeSingle()
    if (existing?.status === 'added') return json(200, { saved: true, status: 'added' })
    const { error } = await admin.from('elsewhere_tester_requests')
      .upsert({ user_id: user.id, facebook_profile: profile, note: note || null, status: 'pending', agreed_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return json(503, { message: 'Your request couldn’t be saved. Try again in a minute.' })

    let emailed = false
    if (mailerUrl && mailerSecret) {
      const { data: person } = await admin.from('elsewhere_profiles').select('handle, display_name').eq('id', user.id).maybeSingle()
      const rolesLink = metaAppId ? `https://developers.facebook.com/apps/${metaAppId}/roles/roles/` : 'https://developers.facebook.com/apps/'
      const response = await fetch(mailerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          secret: mailerSecret,
          subject: `Elsewhere: Instagram tester request from @${person?.handle || 'new user'}`,
          body: [
            `@${person?.handle || '(no handle yet)'}${person?.display_name ? ` (${person.display_name})` : ''} wants to connect Instagram during the beta.`,
            '',
            `Elsewhere email: ${user.email}`,
            `Facebook profile: ${profile}`,
            note ? `Note: ${note}` : '',
            '',
            'To let them in:',
            `1. Open your app's Roles page: ${rolesLink}`,
            '2. Add People → Testers → enter their Facebook name or profile.',
            '3. They accept the invite in Facebook → Settings & privacy → Your activity → Apps and websites → Requests (on Facebook), then click Connect Instagram in Elsewhere.',
            'They agreed to the Elsewhere beta tester terms in the app (Meta requires an agreement with testers).',
          ].filter(line => line !== null).join('\n'),
        }),
      }).catch(() => null)
      emailed = Boolean(response?.ok)
    }
    return json(200, { saved: true, status: 'pending', emailed })
  } catch {
    return json(503, { message: 'Your request couldn’t be sent right now. Try again in a minute.' })
  }
})
