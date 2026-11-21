// Permanently deletes the caller's Elsewhere account and everything stored for it:
// profile, messages they sent or received, contacts, blocks, reports they filed,
// and Instagram instant-update links. The caller must re-enter their password.
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

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
const options = { auth: { autoRefreshToken: false, persistSession: false } }

// Rows tied to the account, by table and column. Tables that don't exist are skipped.
const OWNED: [string, string][] = [
  ['elsewhere_instagram_activity', 'user_id'],
  ['elsewhere_instagram_links', 'user_id'],
  ['elsewhere_messages', 'sender_id'],
  ['elsewhere_messages', 'recipient_id'],
  ['elsewhere_friendships', 'user_a'],
  ['elsewhere_friendships', 'user_b'],
  ['elsewhere_blocks', 'blocker_id'],
  ['elsewhere_blocks', 'blocked_id'],
  ['elsewhere_reports', 'reporter_id'],
  ['elsewhere_profiles', 'id'],
]

Deno.serve(async request => {
  if (request.method !== 'POST') return json(405, { message: 'Unsupported request.' })
  if (!supabaseUrl || !publicKey || !adminKey) return json(503, { message: 'Account deletion isn’t set up yet.' })

  const jwt = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { message: 'Sign in to Elsewhere first.' })
  const auth = createClient(supabaseUrl, publicKey, options)
  const { data: who, error: whoError } = await auth.auth.getUser(jwt)
  const user = who?.user
  if (whoError || !user?.email) return json(401, { message: 'Sign in to Elsewhere first.' })

  try {
    const text = await request.text()
    if (text.length > 1024) return json(413, { message: 'Request is too large.' })
    const password = String(JSON.parse(text)?.password || '')
    if (!password || password.length > 72) return json(400, { message: 'Enter your password to delete your account.' })

    // Confirm it's really them, with a throwaway client that keeps no session.
    const check = createClient(supabaseUrl, publicKey, options)
    const { data: signedIn, error: passwordError } = await check.auth.signInWithPassword({ email: user.email, password })
    if (passwordError || signedIn.user?.id !== user.id) return json(403, { message: 'That password isn’t right.' })
    await check.auth.signOut({ scope: 'local' }).catch(() => {})

    const admin = createClient(supabaseUrl, adminKey, options)
    for (const [table, column] of OWNED) {
      await admin.from(table).delete().eq(column, user.id).then(() => {}, () => {})
    }
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) return json(503, { message: 'Your account couldn’t be deleted right now. Try again in a minute.' })
    return json(200, { deleted: true })
  } catch {
    return json(503, { message: 'Your account couldn’t be deleted right now. Try again in a minute.' })
  }
})
