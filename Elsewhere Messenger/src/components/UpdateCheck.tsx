import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { ToolbarDialog, type ToolbarSkin } from './ToolbarDialogs'

const CHECK_UPDATES = 'elsewhere:check-updates'
const STARTUP_DELAY_MS = 8000

/** Asks the main window to check for updates and show the result (from any window). */
export function requestUpdateCheck() {
  if (isTauri() && getCurrentWindow().label !== 'main') void emitTo('main', CHECK_UPDATES).catch(console.error)
  else window.dispatchEvent(new Event(CHECK_UPDATES))
}

type State =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'latest' }
  | { step: 'available'; update: Update }
  | { step: 'downloading'; update: Update; percent?: number }
  | { step: 'failed'; message: string }

/** Checks once shortly after startup (quietly) and whenever Help → Check for Updates is used. */
export default function UpdateCheck({ skin }: { skin: ToolbarSkin }) {
  const [state, setState] = useState<State>({ step: 'idle' })
  const running = useRef(false)

  useEffect(() => {
    if (!isTauri() || getCurrentWindow().label !== 'main' || import.meta.env.DEV) return
    const run = async (manual: boolean) => {
      if (running.current) return
      running.current = true
      if (manual) setState({ step: 'checking' })
      try {
        const update = await check()
        if (update) setState({ step: 'available', update })
        else if (manual) setState({ step: 'latest' })
      } catch (cause) {
        if (manual) setState({ step: 'failed', message: 'Couldn’t check for updates. Check your internet connection and try again.' })
        else console.error('Update check failed:', cause)
      } finally { running.current = false }
    }
    const timer = window.setTimeout(() => void run(false), STARTUP_DELAY_MS)
    const local = () => void run(true)
    window.addEventListener(CHECK_UPDATES, local)
    let unlisten: (() => void) | undefined
    let disposed = false
    void listen(CHECK_UPDATES, local).then(stop => { if (disposed) stop(); else unlisten = stop })
    return () => { disposed = true; window.clearTimeout(timer); window.removeEventListener(CHECK_UPDATES, local); unlisten?.() }
  }, [])

  async function install(update: Update) {
    setState({ step: 'downloading', update })
    let total = 0
    let received = 0
    try {
      await update.downloadAndInstall(event => {
        if (event.event === 'Started') total = event.data.contentLength || 0
        else if (event.event === 'Progress') {
          received += event.data.chunkLength
          if (total) setState({ step: 'downloading', update, percent: Math.min(100, Math.round(received / total * 100)) })
        }
      })
      // On Windows the installer closes the app and reopens it when it's done.
    } catch {
      setState({ step: 'failed', message: 'The update couldn’t be installed. Try again from Help → Check for Updates.' })
    }
  }

  const close = () => { if (state.step !== 'downloading') setState({ step: 'idle' }) }
  if (state.step === 'idle') return null
  return <ToolbarDialog title={state.step === 'available' || state.step === 'downloading' ? 'Update Available' : 'Check for Updates'} skin={skin} onClose={close}>
    {state.step === 'checking' && <p role="status">Checking for updates…</p>}
    {state.step === 'latest' && <><p>You have the newest version of Elsewhere Messenger.</p>
      <div className="ew-toolbar-actions"><button type="button" onClick={close}>OK</button></div></>}
    {state.step === 'failed' && <><p role="alert">{state.message}</p>
      <div className="ew-toolbar-actions"><button type="button" onClick={close}>OK</button></div></>}
    {state.step === 'available' && <>
      <p>Elsewhere Messenger {state.update.version} is ready to install. You have {state.update.currentVersion}.</p>
      {state.update.body && <p style={{ whiteSpace: 'pre-line' }}>{state.update.body}</p>}
      <p>The app closes while it updates, then opens again. Your accounts and settings stay as they are.</p>
      <div className="ew-toolbar-actions">
        <button type="button" onClick={close}>Later</button>
        <button type="button" onClick={() => void install(state.update)}>Update now</button>
      </div>
    </>}
    {state.step === 'downloading' && <p role="status">Downloading {state.update.version}{state.percent !== undefined ? ` (${state.percent}%)` : ''}… The app will restart when it’s done.</p>}
  </ToolbarDialog>
}
