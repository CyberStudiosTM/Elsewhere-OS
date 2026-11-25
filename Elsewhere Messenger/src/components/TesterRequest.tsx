import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import { cloud } from '../services/connectedClient'

// While Meta hasn't approved the app, only people with a Tester role on the Meta app can
// connect Instagram. This lets someone ask for that role; the owner gets an email.

const HELPER = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || '').trim().replace(/\/$/, '') + '/functions/v1/elsewhere-tester-request'
type Existing = { status: 'pending' | 'added' | 'declined'; facebook_profile: string } | null

export default function TesterRequest() {
  const [open, setOpen] = useState(false)
  const [existing, setExisting] = useState<Existing>(null)
  const [profile, setProfile] = useState('')
  const [note, setNote] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cloud) return
    let alive = true
    void cloud.from('elsewhere_tester_requests').select('status, facebook_profile').maybeSingle()
      .then(({ data }) => { if (alive && data) setExisting(data as Existing) }, () => {})
    return () => { alive = false }
  }, [])

  async function send() {
    setError('')
    setMessage('')
    if (!cloud || !isTauri()) { setError('Requests work in the Elsewhere Messenger app.'); return }
    setBusy(true)
    try {
      const session = (await cloud.auth.getSession()).data.session
      if (!session) throw new Error('Sign in to your Elsewhere account first.')
      const response = await nativeFetch(HELPER, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ facebookProfile: profile, note, agreedToTest: agreed }),
      })
      const body = await response.json().catch(() => ({})) as { saved?: boolean; status?: 'pending' | 'added'; message?: string }
      if (!response.ok || !body.saved) throw new Error(body.message || 'Your request couldn’t be sent.')
      setExisting({ status: body.status || 'pending', facebook_profile: profile })
      setMessage(body.status === 'added' ? 'You’re already a tester. Click Connect Instagram.'
        : 'Request sent! When you’re added, Meta sends you an invite. Accept it in Facebook → Settings & privacy → Your activity → Apps and websites → Requests, then come back and click Connect Instagram.')
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }

  if (existing?.status === 'added') return <p className="ew-ig-note" role="status">You’re a beta tester. If you haven’t yet, accept Meta’s invite in <strong>Facebook → Settings & privacy → Your activity → Apps and websites → Requests</strong>, then click Connect Instagram.</p>

  return <div className="ew-tester-request">
    {existing?.status === 'pending' && !open
      ? <p className="ew-ig-note" role="status">{message || 'Your tester request is in. When you’re added, accept Meta’s invite in Facebook → Settings & privacy → Your activity → Apps and websites → Requests, then click Connect Instagram.'}</p>
      : !open && <p className="ew-ig-note">Elsewhere is waiting on Meta’s approval, so for now Instagram works for beta testers only.{' '}
        <button type="button" className="ew-link-button" onClick={() => { setOpen(true); setMessage('') }}>Request tester access</button></p>}
    {existing?.status === 'pending' && !open && <button type="button" className="ew-link-button" onClick={() => { setOpen(true); setProfile(existing.facebook_profile) }}>Update my request</button>}
    {open && <form className="ew-tester-form" onSubmit={event => { event.preventDefault(); void send() }}>
      <p>Meta adds testers by their <strong>Facebook</strong> account (the one you’ll sign in with). Paste your Facebook profile link.</p>
      <label>Facebook profile link
        <input type="url" inputMode="url" placeholder="https://www.facebook.com/yourname" value={profile} maxLength={300}
          onChange={event => setProfile(event.target.value)} required /></label>
      <label>Note (optional)
        <input type="text" value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder="Anything that helps us find you" /></label>
      <label className="ew-tester-agree"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} required />
        {' '}I agree to be an Elsewhere beta tester: I’ll try Instagram in Elsewhere during the beta and may share feedback. My tester role can be removed at any time.</label>
      <div className="ew-ig-actions">
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" disabled={busy || !profile.trim() || !agreed}>{busy ? 'Sending…' : 'Send request'}</button>
      </div>
    </form>}
    {error && <p className="ew-ig-note" role="alert">{error}</p>}
  </div>
}
