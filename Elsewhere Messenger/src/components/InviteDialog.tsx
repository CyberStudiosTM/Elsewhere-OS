import { useEffect, useMemo, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { CloudProfile } from '../services/connectedClient'
import { useElsewhereBridge } from '../services/elsewhereNativeBridge'
import { ELSEWHERE_GROUP_PREFIX } from '../services/elsewhereGroups'
import { OPEN_CONTACT_REMOTE } from '../services/elsewhereGroupHost'
import { OPEN_TOOLBAR_CONTACT, ToolbarDialog, type ToolbarSkin } from './ToolbarDialogs'

/** Switches the open conversation to this contact (the main window owns which chat is open). */
export function openConversation(contactId: string) {
  if (isTauri() && getCurrentWindow().label !== 'main') void emitTo('main', OPEN_CONTACT_REMOTE, contactId).catch(console.error)
  else window.dispatchEvent(new CustomEvent(OPEN_TOOLBAR_CONTACT, { detail: contactId }))
}

type Props = {
  skin: ToolbarSkin
  onClose: () => void
  /** 1-on-1 chat: start a group with this friend plus the people picked. */
  withPerson?: { id: string; name: string }
  /** Group chat: add the people picked. */
  group?: { id: string; members: string[]; add: (people: string[]) => Promise<void> }
}

export default function InviteDialog({ skin, onClose, withPerson, group }: Props) {
  const call = useElsewhereBridge()
  const [friends, setFriends] = useState<CloudProfile[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    void call({ action: 'friends', personId: '' })
      .then(result => { if (alive) setFriends(result.friends || []) })
      .catch(cause => { if (alive) { setFriends([]); setError(cause instanceof Error ? cause.message : String(cause)) } })
    return () => { alive = false }
  }, [call])

  const excluded = useMemo(() => new Set([...(group?.members || []), ...(withPerson ? [withPerson.id] : [])]), [group, withPerson])
  const choices = (friends || []).filter(friend => !excluded.has(friend.id))
    .filter(friend => !search || (friend.handle + ' ' + friend.display_name).toLowerCase().includes(search.toLowerCase().replace(/^@/, '')))
    .sort((a, b) => a.handle.localeCompare(b.handle))
  const toggle = (id: string) => setPicked(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id])

  async function submit() {
    if (!picked.length) return
    setBusy(true)
    setError('')
    try {
      if (group) {
        await group.add(picked)
        onClose()
      } else if (withPerson) {
        const result = await call({ action: 'group-create', personId: '', people: [withPerson.id, ...picked], name: name.trim() || undefined })
        if (!result.createdGroupId) throw new Error('The group chat couldn’t be created.')
        onClose()
        openConversation(ELSEWHERE_GROUP_PREFIX + result.createdGroupId)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }

  return <ToolbarDialog title={group ? 'Invite to Group Chat' : 'Start a Group Chat'} skin={skin} onClose={onClose}>
    <form className="ew-invite" onSubmit={event => { event.preventDefault(); void submit() }}>
      <p>{group ? 'Pick friends to add to this group chat.' : <>Pick friends to chat with you and <strong>{withPerson?.name}</strong> together.</>}</p>
      {!group && <label className="ew-invite-name">Group name (optional)
        <input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="the besties ♡" /></label>}
      <input className="ew-invite-search" type="search" placeholder="Search friends" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search friends" />
      <div className="ew-invite-list" role="group" aria-label="Friends">
        {friends === null ? <p>Loading your friends…</p>
          : !choices.length ? <p>{friends.length ? 'No more friends to add.' : 'Add Elsewhere friends first, then invite them here.'}</p>
            : choices.map(friend => <label key={friend.id} className="ew-invite-row">
              <input type="checkbox" checked={picked.includes(friend.id)} onChange={() => toggle(friend.id)} />
              <strong>@{friend.handle}</strong>{friend.display_name && <span> · {friend.display_name}</span>}
            </label>)}
      </div>
      <p className="ew-invite-note">Group chats can have up to 20 people. Everyone in the group can see the whole conversation.</p>
      {error && <p className="ew-account-error" role="alert">{error}</p>}
      <div className="ew-toolbar-actions">
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" disabled={busy || !picked.length}>{busy ? 'Working…' : group ? `Add ${picked.length || ''}`.trim() : 'Start group chat'}</button>
      </div>
    </form>
  </ToolbarDialog>
}
