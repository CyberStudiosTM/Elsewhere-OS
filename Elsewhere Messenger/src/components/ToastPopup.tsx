import { useEffect, useRef, useState } from 'react'
import { useWearCustomSkin } from '../services/customSkin'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { TOAST_OPEN, TOAST_READY, TOAST_SHOW, type ToastPayload } from '../services/toastWindow'
import './ToastPopup.css'

const VISIBLE_MS = 7000
const SERVICE: Record<string, string> = {
  elsewhere: 'Elsewhere', instagram: 'Instagram', discord: 'Discord', x: 'X', test: 'Elsewhere',
}

/** The contents of Elsewhere's corner pop-up window. */
export default function ToastPopup() {
  const [toast, setToast] = useState<ToastPayload | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const skin = (() => { try { return localStorage.getItem('elsewhere.messenger.skin') === 'dead-signal' ? 'dead' : 'classic' } catch { return 'classic' } })()
  // A saved SkinMapper skin also dresses Classic pop-ups.
  useWearCustomSkin(skin === 'classic')

  useEffect(() => {
    document.documentElement.classList.add('ew-toast-root')
    let stop: (() => void) | undefined
    let disposed = false
    void listen<ToastPayload>(TOAST_SHOW, ({ payload }) => {
      setToast(payload)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void getCurrentWindow().close().catch(console.error), VISIBLE_MS)
    }).then(unlisten => {
      if (disposed) { unlisten(); return }
      stop = unlisten
      void emitTo('main', TOAST_READY).catch(console.error)
    }).catch(console.error)
    return () => { disposed = true; stop?.(); window.clearTimeout(timer.current) }
  }, [])

  const close = () => void getCurrentWindow().close().catch(console.error)
  if (!toast) return null
  const service = SERVICE[toast.source] || 'Elsewhere'
  const sender = toast.sender?.trim()
  const preview = toast.preview?.trim()
  return <aside className={`ew-toast ew-toast-${skin}`} role="status"
    onMouseEnter={() => window.clearTimeout(timer.current)}
    onMouseLeave={() => { timer.current = window.setTimeout(close, 3000) }}>
    <div className="ew-toast-title">
      <span className="ew-toast-icon" aria-hidden="true" />
      <span>Elsewhere Messenger</span>
      <button type="button" aria-label="Dismiss" onClick={close}>×</button>
    </div>
    <button type="button" className="ew-toast-body" onClick={() => {
      void emitTo('main', TOAST_OPEN, toast.contactId || '').catch(console.error).finally(close)
    }}>
      <span className="ew-toast-avatar" aria-hidden="true" />
      <span className="ew-toast-text">
        {sender ? <strong>{sender}</strong> : <strong>New {service} message</strong>}
        {sender && <small> · {service}</small>}
        {preview && <span className="ew-toast-preview">{preview}</span>}
      </span>
    </button>
  </aside>
}
