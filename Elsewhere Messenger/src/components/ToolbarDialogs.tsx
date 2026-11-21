import { useEffect, useRef, useState } from 'react'
import { instagramContactId, instagramContactName, useNativeInstagram } from '../services/instagramNativeBridge'
import { callPhone, openDiscordInbox, openInstagramInbox, type ToolbarRequest } from '../services/toolbarActions'
import './ToolbarDialogs.css'

export type ToolbarSkin = 'classic' | 'dead-signal'
export const OPEN_TOOLBAR_CONTACT = 'elsewhere:toolbar-open-contact'
export function ToolbarDialog({ title, skin, onClose, children }: {
  title: string
  skin: ToolbarSkin
  onClose: () => void
  children: React.ReactNode
}) {
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeButton.current?.focus() }, [])
  return <div className={`ew-toolbar-overlay ew-toolbar-${skin}`} onMouseDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className="ew-toolbar-dialog" role="dialog" aria-label={title} aria-modal="true"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
      <header><strong>{title}</strong><button ref={closeButton} type="button" onClick={onClose} aria-label="Close">×</button></header>
      <div className="ew-toolbar-body">{children}</div>
    </section>
  </div>
}

export default function ToolbarDialogs({ request, skin, onClose, onElsewhere }: {
  request: ToolbarRequest
  skin: ToolbarSkin
  onClose: () => void
  onElsewhere: () => void
}) {
  const [service, setService] = useState(request.kind === 'call' ? 'all' : request.service || 'all')
  const [number, setNumber] = useState('')
  const [error, setError] = useState('')
  async function launch(action: () => Promise<void>) {
    setError('')
    try { await action(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <ToolbarDialog title={request.kind === 'call' ? (request.video ? 'Video Call' : 'Start a Call') : 'New DM'}
    skin={skin} onClose={onClose}>
    {request.kind === 'call' ? <>
      <p>Choose an app and start the call there.</p>
      <div className="ew-toolbar-options">
        <button type="button" onClick={() => void launch(openDiscordInbox)}>Open Discord</button>
        <button type="button" onClick={() => void launch(openInstagramInbox)}>Open Instagram</button>
      </div>
      {!request.video && <form onSubmit={event => { event.preventDefault(); void launch(() => callPhone(number)) }}>
        <label>Phone <input type="tel" value={number} onChange={event => setNumber(event.target.value)} required /></label>
        <button type="submit">Open phone app</button>
      </form>}
    </> : service === 'all' ? <div className="ew-toolbar-options">
      <button type="button" onClick={onElsewhere}>Elsewhere</button>
      <button type="button" onClick={() => setService('instagram')}>Instagram</button>
      <button type="button" onClick={() => setService('discord')}>Discord</button>
    </div> : service === 'instagram' ? <>
      <InstagramConversations onClose={onClose} />
      <button type="button" onClick={() => void launch(openInstagramInbox)}>New conversation in Instagram</button>
    </> : <>
      <p>Open Discord to send a personal direct message.</p>
      <button type="button" onClick={() => void launch(openDiscordInbox)}>Open Discord DMs</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </ToolbarDialog>
}

function InstagramConversations({ onClose }: { onClose: () => void }) {
  const { account, threads, connected } = useNativeInstagram(null)
  const [query, setQuery] = useState('')
  const found = threads.map(thread => ({
    id: instagramContactId(thread.id),
    name: instagramContactName(thread, account),
  })).filter(contact => contact.name.toLowerCase().includes(query.trim().toLowerCase()))
  return <>
    {connected ? <>
      <label>Find a conversation<input value={query} onChange={event => setQuery(event.target.value)} placeholder="@username" /></label>
      {!!found.length && <div className="ew-toolbar-conversations">{found.map(contact =>
        <button type="button" key={contact.id} onClick={() => {
          window.dispatchEvent(new CustomEvent(OPEN_TOOLBAR_CONTACT, { detail: contact.id }))
          onClose()
        }}>{contact.name}</button>)}</div>}
      {!found.length && <p>No matching conversations.</p>}
    </> : <p>Connect Instagram in Tools to open its conversations here.</p>}
  </>
}
