import type { useElsewhereGroupChat } from '../services/elsewhereNativeBridge'
import ElsewhereMediaMessage from './ElsewhereMediaMessage'

type GroupChat = ReturnType<typeof useElsewhereGroupChat>

/** The group's display title: its name, or the other members' handles. */
export function groupChatTitle(chat: GroupChat) {
  if (chat.group?.name) return chat.group.name
  const others = chat.members.filter(member => member.id !== chat.userId).map(member => '@' + member.handle)
  if (!others.length) return 'Group chat'
  return others.length <= 3 ? others.join(', ') : `${others.slice(0, 2).join(', ')} +${others.length - 2}`
}

/** Group chat transcript, shared by every skin (each skin styles the class names). */
export function GroupTranscript({ chat, skin, renderText }: { chat: GroupChat; skin: 'classic' | 'dead-signal'; renderText?: (text: string) => React.ReactNode }) {
  const cls = skin === 'classic'
    ? { message: 'em-message', me: 'em-sender-me', them: 'em-sender-them', text: 'ew-core-message-text', empty: 'em-empty' }
    : { message: 'ds-message', me: 'ds-sender-own', them: 'ds-sender-other', text: 'ds-message-text', empty: 'ds-muted' }
  const name = (id: string | null) => !id ? 'Someone' : id === chat.userId ? 'You' : chat.names[id] || 'Former member'
  return <>
    {chat.error && <p role="alert">{chat.error}</p>}
    {!chat.messages.length && !chat.error && <p className={cls.empty}>Say hi to the group!</p>}
    {chat.messages.map(message => message.kind === 'system' ? (
      <p key={message.id} className="ew-group-event">{name(message.sender_id)} {message.text_body}</p>
    ) : message.kind === 'nudge' ? (
      <p key={message.id} className="ew-nudge-event">{message.sender_id === chat.userId ? 'You sent a nudge.' : `${name(message.sender_id)} sent a nudge!`}</p>
    ) : (
      <div className={cls.message} key={message.id}>
        <div className={skin === 'classic' ? (message.sender_id === chat.userId ? cls.me : cls.them) : 'ds-message-heading'}>
          <strong className={skin === 'dead-signal' ? (message.sender_id === chat.userId ? cls.me : cls.them) : undefined}>{name(message.sender_id)}</strong>
          <span> says ({new Date(message.created_at).toLocaleString()}):</span>
        </div>
        {message.kind === 'gif' || message.kind === 'image'
          ? <ElsewhereMediaMessage message={{ id: message.id, sender_id: message.sender_id || '', recipient_id: '', client_id: message.client_id, kind: message.kind, text_body: message.text_body, created_at: message.created_at }} mediaUrl={chat.mediaUrl} />
          : <div className={cls.text}>{renderText ? renderText(message.text_body) : message.text_body}</div>}
      </div>
    ))}
  </>
}

/** Members, rename and leave controls for the conversation header. */
export function GroupHeaderTools({ chat, onInvite }: { chat: GroupChat; onInvite: () => void }) {
  if (!chat.group) return null
  const people = chat.members.map(member => member.id === chat.userId ? 'you' : '@' + member.handle).join(', ')
  return <span className="ew-group-tools">
    <span className="ew-group-members" title={people}>{chat.members.length} people</span>
    <button type="button" onClick={onInvite}>Invite</button>
    <button type="button" onClick={() => {
      const next = window.prompt('Group name (leave empty to use everyone’s names)', chat.group?.name || '')
      if (next !== null) void chat.rename(next.trim()).catch(error => window.alert(error instanceof Error ? error.message : String(error)))
    }}>Rename</button>
    <button type="button" onClick={() => {
      if (!window.confirm('Leave this group chat? You won’t get its messages anymore, and someone will need to invite you back.')) return
      void chat.leave().catch(error => window.alert(error instanceof Error ? error.message : String(error)))
    }}>Leave</button>
  </span>
}
