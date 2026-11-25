import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { cloud } from '../services/connectedClient'
import { ToolbarDialog, type ToolbarSkin } from './ToolbarDialogs'

const OPEN_FEEDBACK = 'elsewhere:open-feedback'
const MAX = 4000

/** Opens Send Feedback in the main window (from any window). */
export function openFeedback() {
  if (isTauri() && getCurrentWindow().label !== 'main') void emitTo('main', OPEN_FEEDBACK).catch(console.error)
  else window.dispatchEvent(new Event(OPEN_FEEDBACK))
}

/** Help → Send Feedback. Saves to Elsewhere's feedback list for the beta. */
export default function FeedbackDialog({ skin }: { skin: ToolbarSkin }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<'bug' | 'idea' | 'other'>('bug')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const show = () => { setOpen(true); setSent(false); setError('') }
    window.addEventListener(OPEN_FEEDBACK, show)
    let unlisten: (() => void) | undefined
    let disposed = false
    if (isTauri() && getCurrentWindow().label === 'main') {
      void listen(OPEN_FEEDBACK, show).then(stop => { if (disposed) stop(); else unlisten = stop })
    }
    return () => { disposed = true; window.removeEventListener(OPEN_FEEDBACK, show); unlisten?.() }
  }, [])

  async function send() {
    setError('')
    if (!cloud) { setError('Feedback needs Elsewhere Accounts, which aren’t set up in this build.'); return }
    const text = body.trim()
    if (!text) { setError('Write a little about what happened or what you’d like.'); return }
    setBusy(true)
    try {
      const { data } = await cloud.auth.getSession()
      if (!data.session) throw new Error('Sign in to your Elsewhere account to send feedback.')
      const version = isTauri() ? await getVersion().catch(() => '') : 'web'
      const { error: insertError } = await cloud.from('elsewhere_feedback').insert({ category, body: text.slice(0, MAX), app_version: version, skin })
      if (insertError) throw new Error('Your feedback couldn’t be sent. Try again in a minute.')
      setBody('')
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }

  if (!open) return null
  return <ToolbarDialog title="Send Feedback" skin={skin} onClose={() => { if (!busy) setOpen(false) }}>
    {sent ? <>
      <p role="status">Thank you! Your feedback was sent. ♡</p>
      <div className="ew-toolbar-actions">
        <button type="button" onClick={() => setSent(false)}>Send more</button>
        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </div>
    </> : <form className="ew-feedback-form" onSubmit={event => { event.preventDefault(); void send() }}>
      <p className="ew-feedback-intro">Elsewhere Messenger is in beta ♡ Tell us what broke, what felt off, or what you’d love to see.</p>
      <fieldset className="ew-feedback-kinds">
        <legend>This is about…</legend>
        {([['bug', '🛠 Something isn’t working'], ['idea', '✨ An idea'], ['other', '💌 Something else']] as const).map(([value, label]) =>
          <label key={value} className={category === value ? 'is-on' : ''}><input type="radio" name="feedback-kind" checked={category === value} onChange={() => setCategory(value)} /> {label}</label>)}
      </fieldset>
      <label className="ew-feedback-body"><span>Your feedback</span>
        <textarea rows={7} maxLength={MAX} value={body} onChange={event => setBody(event.target.value)}
          placeholder={category === 'bug' ? 'What were you doing, and what happened?' : category === 'idea' ? 'What would make Elsewhere better?' : 'Tell us anything ♡'} required />
        <small className="ew-feedback-count">{body.length} / {MAX}</small>
      </label>
      {error && <p className="ew-account-error" role="alert">{error}</p>}
      <p className="ew-feedback-note">Sent with your app version and skin, linked to your Elsewhere account so we can follow up. Please don’t include passwords.</p>
      <div className="ew-toolbar-actions ew-feedback-actions">
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="ew-feedback-send" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
      </div>
    </form>}
  </ToolbarDialog>
}
