// Emails the Elsewhere owner when someone finishes signing up (creates their handle),
// so they can add them as a Meta Tester while Instagram awaits App Review.
// Called only by the database trigger in 08_signup_notify.sql, which sends a shared
// secret header (ELSEWHERE_HOOK_SECRET). Sends through the owner's Apps Script mailer.

const hookSecret = Deno.env.get('ELSEWHERE_HOOK_SECRET') || ''
const mailerUrl = Deno.env.get('ELSEWHERE_MAILER_URL') || ''
const mailerSecret = Deno.env.get('ELSEWHERE_MAILER_SECRET') || ''
const metaAppId = Deno.env.get('ELSEWHERE_META_APP_ID') || ''

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json(405, { message: 'Unsupported request.' })
  if (!sameSecret(request.headers.get('x-elsewhere-hook') || '', hookSecret)) return json(401, { message: 'Not allowed.' })
  if (!mailerUrl || !mailerSecret) return json(200, { emailed: false, reason: 'mailer not set up' })
  try {
    const input = JSON.parse(await request.text())
    const handle = String(input?.handle || '').slice(0, 40)
    const displayName = String(input?.display_name || '').slice(0, 80)
    const email = String(input?.email || '').slice(0, 254)
    const rolesLink = metaAppId ? `https://developers.facebook.com/apps/${metaAppId}/roles/roles/` : 'https://developers.facebook.com/apps/'
    const response = await fetch(mailerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        secret: mailerSecret,
        subject: `Elsewhere: new signup @${handle || 'someone'}`,
        body: [
          `@${handle}${displayName ? ` (${displayName})` : ''} just joined Elsewhere.`,
          email ? `Email: ${email}` : '',
          '',
          'While Instagram is waiting on Meta App Review, they’ll need a Tester role to connect Instagram.',
          'If they ask (Instagram Connection → Request tester access), you’ll get a second email with their Facebook profile.',
          `Your app's Roles page: ${rolesLink}`,
        ].filter(Boolean).join('\n'),
      }),
    })
    return json(200, { emailed: response.ok })
  } catch {
    return json(200, { emailed: false })
  }
})
