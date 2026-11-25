import type { MouseEvent } from 'react'
import './mapped.css'

// SkinMapper editor preview: the mapped skin drawn with simulated people and messages.
// Nothing here can send, sign in or call anything; every control is inert. Clicking a part
// selects its SkinMap slot for editing.

export type PreviewWindow = 'buddy-list' | 'conversation' | 'sign-in' | 'notification'
export type PreviewState = { compact?: boolean; longNames?: boolean; empty?: boolean; error?: boolean }

const PEOPLE = [
  { name: 'sunny_day', note: 'out enjoying the weather ☀', status: 'online' },
  { name: 'poolside.exe', note: 'listening to music ♪', status: 'online', unread: 2 },
  { name: 'somewhere', note: 'brb', status: 'away' },
  { name: 'bluelagoon', note: '', status: 'offline' },
  { name: 'daydreamer', note: '', status: 'offline' },
]
const LONG = 'a_really_really_long_display_name_that_keeps_going_forever'

function Slot({ id, picked, className, children, as = 'div', ...rest }: { id: string; picked: string | null; className?: string; children?: React.ReactNode; as?: 'div' | 'span' | 'button' } & Record<string, unknown>) {
  const Tag = as as 'div'
  return <Tag data-sm-slot={id} className={(className || '') + (picked === id ? ' sm-is-picked' : '')} {...rest}>{children}</Tag>
}

export default function MappedPreview({ css, transcript, window: view, picked, onPick, state = {} }: {
  css: string
  transcript: 'classic' | 'bubble'
  window: PreviewWindow
  picked: string | null
  onPick: (slotId: string) => void
  state?: PreviewState
}) {
  // One click handler for the whole preview: the closest slot under the pointer wins.
  const pick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest('[data-sm-slot]') as HTMLElement | null
    event.preventDefault()
    if (target?.dataset.smSlot) onPick(target.dataset.smSlot)
  }
  const people = state.empty ? [] : PEOPLE.map((person, index) => index === 0 && state.longNames ? { ...person, name: LONG } : person)
  const width = state.compact ? 300 : view === 'conversation' ? 560 : 320
  const title = (text: string) => <Slot id="window.titlebar" picked={picked} className="sm-titlebar">
    <Slot as="span" id="window.titlebar.text" picked={picked}>{text}</Slot>
    <span className="sm-controls">
      <Slot as="button" id="window.controls.minimize" picked={picked} tabIndex={-1}>_</Slot>
      <Slot as="button" id="window.controls.maximize" picked={picked} tabIndex={-1}>□</Slot>
      <Slot as="button" id="window.controls.close" picked={picked} tabIndex={-1}>×</Slot>
    </span>
  </Slot>

  return <div data-elsewhere-skin="mapped" data-sm-editor="" data-sm-transcript={transcript} onClickCapture={pick} className="sm-preview-root">
    <style>{css}</style>
    {view === 'notification' ? <Slot id="toast.frame" picked={picked} className="sm-toast">
      <span className="sm-avatar" />
      <span><b>sunny_day</b> says:<br />hey! are you free later? ♡</span>
    </Slot> : <Slot id="window.frame" picked={picked} className="sm-window" style={{ width }}>
      {view === 'sign-in' && <>
        {title('Elsewhere Messenger')}
        <div className="sm-body">
          <Slot id="signin.header" picked={picked} className="sm-signin-header">Elsewhere Messenger</Slot>
          <label>E-mail address:<Slot as="span" id="signin.field" picked={picked}><input className="sm-field" readOnly value="cyber@elsewhere.net" tabIndex={-1} /></Slot></label>
          <label>Password:<Slot as="span" id="signin.field" picked={picked}><input className="sm-field" readOnly type="password" value="password" tabIndex={-1} /></Slot></label>
          {state.error && <Slot id="signin.error" picked={picked} className="sm-error">That password isn’t right.</Slot>}
          <Slot as="button" id="signin.button" picked={picked} className="sm-signin-button" tabIndex={-1}>Sign In</Slot>
        </div>
      </>}
      {view === 'buddy-list' && <>
        {title('Elsewhere Messenger')}
        <div className="sm-body">
          <Slot id="buddy.profile" picked={picked} className="sm-profile">
            <Slot as="span" id="buddy.profile.avatar" picked={picked} className="sm-avatar" />
            <span><Slot as="span" id="buddy.profile.name" picked={picked} className="sm-name">{state.longNames ? LONG : 'cyber'}</Slot><br />
              <Slot as="span" id="buddy.profile.status" picked={picked} className="sm-status">(Online)</Slot></span>
          </Slot>
          <Slot id="buddy.toolbar" picked={picked} className="sm-toolbar">
            {[['add-contact', '👤'], ['mail', '✉'], ['call', '📞'], ['webcam', '📷'], ['nudge', '⚡'], ['web-treasures', '🌐'], ['activities', '🎲']].map(([id, icon]) =>
              <Slot as="button" key={id} id={`buddy.toolbar.${id}`} picked={picked} className="sm-tool" tabIndex={-1} title={id}>{icon}</Slot>)}
          </Slot>
          <Slot id="buddy.services" picked={picked} className="sm-services">
            {['All', 'Elsewhere', 'Instagram', 'Discord'].map((label, index) =>
              <Slot as="button" key={label} id="buddy.services.button" picked={picked} className={index === 0 ? 'is-selected' : ''} tabIndex={-1}>{label}</Slot>)}
          </Slot>
          <Slot id="buddy.contacts" picked={picked} className="sm-contacts">
            <Slot id="buddy.group.heading" picked={picked} className="sm-group">▾ Buddies ({people.length})</Slot>
            {!people.length && <span className="sm-row"><small>No contacts yet</small></span>}
            {people.map((person, index) => <Slot key={person.name} id="buddy.contact.row" picked={picked} className={'sm-row' + (index === 1 ? ' is-selected' : '')}>
              <Slot as="span" id="buddy.contact.presence" picked={picked} className={'sm-dot' + (person.status === 'away' ? ' is-away' : person.status === 'offline' ? ' is-offline' : '')} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
              {person.unread ? <Slot as="span" id="buddy.contact.unread" picked={picked} className="sm-unread">{person.unread}</Slot> : <small>{person.note}</small>}
            </Slot>)}
          </Slot>
        </div>
      </>}
      {view === 'conversation' && <>
        {title((state.longNames ? LONG : 'sunny_day') + ' - Conversation')}
        <div className="sm-body">
          <Slot id="chat.toolbar" picked={picked} className="sm-chat-toolbar">
            {[['invite', '👥'], ['send-files', '📁'], ['webcam', '📷'], ['audio', '🎧'], ['nudge', '⚡'], ['emoticons', '😊'], ['activities', '🎲'], ['web-treasures', '🌐']].map(([id, icon]) =>
              <Slot as="button" key={id} id={`chat.toolbar.${id}`} picked={picked} className="sm-tool" tabIndex={-1} title={id}>{icon}</Slot>)}
          </Slot>
          <Slot id="chat.transcript" picked={picked} className="sm-transcript">
            <Slot id="chat.notice" picked={picked} className="sm-notice">Elsewhere · online messages aren’t end-to-end encrypted</Slot>
            {state.empty ? <small>Start a conversation.</small> : <>
              <Slot id="chat.message.incoming" picked={picked} className="sm-msg"><b>sunny_day</b> says:<br />hey! are you free later?</Slot>
              <Slot id="chat.message.own" picked={picked} className="sm-msg is-own"><b>cyber</b> says:<br />yeah! want to listen to music tonight? ♪</Slot>
              <Slot id="chat.message.incoming" picked={picked} className="sm-msg"><b>sunny_day</b> says:<br />that sounds perfect!!</Slot>
            </>}
          </Slot>
          <Slot id="chat.composer" picked={picked} className="sm-composer">
            <textarea readOnly tabIndex={-1} value="" placeholder="Type a message…" />
            <Slot as="button" id="chat.send" picked={picked} className="sm-send" tabIndex={-1}>Send</Slot>
          </Slot>
        </div>
      </>}
    </Slot>}
  </div>
}
