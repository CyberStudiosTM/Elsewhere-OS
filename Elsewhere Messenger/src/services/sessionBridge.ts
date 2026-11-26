import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { cloud } from './connectedClient'

// The main window owns the Elsewhere sign-in: it is the only window that holds the refresh token and refreshes
// it. Helper windows (like the Profile window) borrow a short-lived access token from it instead of signing in
// again, so two windows never rotate the same refresh token. Tokens are only ever sent to the asking window's
// own label (emitTo), never broadcast.

const ASK = 'elsewhere:session-ask'
const GIVE = 'elsewhere:session-give'
const MAIN = 'main'
/** Windows that may borrow the main window's sign-in. */
const BORROWERS = new Set(['profile'])

type Lent = { access_token: string; expires_at: number } | null

/** Main window only: answer helper windows that ask for the current sign-in. */
export function lendSessionToWindows(): () => void {
  if (!isTauri() || !cloud || getCurrentWindow().label !== MAIN) return () => {}
  let stop = () => {}
  let stopped = false
  void listen<{ from?: string }>(ASK, async event => {
    const from = event.payload?.from || ''
    if (!BORROWERS.has(from)) return
    const session = (await cloud!.auth.getSession()).data.session
    const lent: Lent = session ? { access_token: session.access_token, expires_at: session.expires_at ?? 0 } : null
    await emitTo(from, GIVE, lent)
  }).then(unlisten => { if (stopped) unlisten(); else stop = unlisten })
  return () => { stopped = true; stop() }
}

let cached: Lent = null
let pending: Promise<string | null> | null = null

/** Helper windows: the main window's current access token, or null when it isn't signed in or isn't open. */
export async function borrowedAccessToken(): Promise<string | null> {
  if (cached && cached.expires_at - Date.now() / 1000 > 60) return cached.access_token
  pending ??= new Promise<string | null>(resolve => {
    let unlisten = () => {}
    const finish = (value: Lent) => { window.clearTimeout(timer); unlisten(); cached = value; pending = null; resolve(value?.access_token ?? null) }
    const timer = window.setTimeout(() => finish(null), 4000)
    void listen<Lent>(GIVE, event => finish(event.payload)).then(stop => {
      unlisten = stop
      void emitTo(MAIN, ASK, { from: getCurrentWindow().label })
    })
  })
  return pending
}
