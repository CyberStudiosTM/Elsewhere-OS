import { useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

const URL = 'https://www.instagram.com/direct/inbox/'
const WINDOW_LABEL = 'elsewhere-instagram-direct'

export default function InstagramLiveLauncher() {
  const [error, setError] = useState('')

  // Show this launcher on the actual main desktop only, not chat/login windows.
  if (!isTauri() || getCurrentWindow().label !== 'main') return null

  async function openInbox() {
    setError('')
    try {
      const existing = await WebviewWindow.getByLabel(WINDOW_LABEL)
      if (existing) {
        await existing.show()
        await existing.setFocus()
        return
      }

      const inbox = new WebviewWindow(WINDOW_LABEL, {
        url: URL,
        title: 'Instagram Direct | Elsewhere Messenger',
        width: 1100,
        height: 780,
        minWidth: 680,
        minHeight: 530,
        center: true,
        resizable: true,
      })
      await inbox.once('tauri://error', (event) => {
        setError(`Could not open Instagram window: ${String(event.payload)}`)
      })
    } catch (cause) {
      setError(`Could not open Instagram window: ${String(cause)}`)
    }
  }

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 65, zIndex: 2147483000,
      fontFamily: 'Tahoma, sans-serif', fontSize: 12, textAlign: 'right' }}>
      <button type="button" onClick={() => { void openInbox() }} style={{
        background: 'linear-gradient(#f8fdff, #bad7fb)', color: '#12437c',
        border: '1px solid #3778bd', borderRadius: 7, padding: '8px 12px',
        boxShadow: '0 2px 8px #0004', cursor: 'pointer', fontWeight: 700,
      }}>
        Instagram DMs
      </button>
      {error && <div role="alert" style={{ maxWidth: 360, padding: 8,
        marginTop: 5, background: '#fff4f4', color: '#9c2121' }}>{error}</div>}
    </div>
  )
}