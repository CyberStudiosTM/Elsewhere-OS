import { useEffect, useRef } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { CloudProfile } from './connectedClient'
import { OPEN_TOOLBAR_CONTACT } from '../components/ToolbarDialogs'
import { desktopNotice, desktopNotificationsEnabled, notificationPreviewsEnabled } from './desktopNotifications'
import { forwardElsewhereGroupMessage } from './elsewhereNativeBridge'
import {
  ELSEWHERE_GROUP_PREFIX, groupTitle, loadCloudGroups, publishCloudGroups, watchCloudGroups, type CloudGroup,
} from './elsewhereGroups'
import { bumpSocialUnread } from './socialUnread'

/** Chat windows ask the main window to switch to a conversation (e.g. a new group chat). */
export const OPEN_CONTACT_REMOTE = 'elsewhere:open-contact'

/** Main window: keeps the group list fresh and delivers new group messages. */
export function useElsewhereGroupHost(userId: string, friends: CloudProfile[] | undefined) {
  const friendsRef = useRef<CloudProfile[]>([])
  friendsRef.current = friends || []
  const groupsRef = useRef<CloudGroup[]>([])

  useEffect(() => {
    if (!userId) { publishCloudGroups({ me: '', groups: [], titles: {} }); return }
    let alive = true
    const publish = (groups: CloudGroup[]) => {
      groupsRef.current = groups
      const handles: Record<string, string> = {}
      for (const friend of friendsRef.current) handles[friend.id] = friend.handle
      const titles: Record<string, string> = {}
      for (const group of groups) titles[group.id] = groupTitle(group, userId, handles)
      publishCloudGroups({ me: userId, groups, titles })
    }
    const refresh = () => { void loadCloudGroups().then(groups => { if (alive) publish(groups) }).catch(cause => console.error('Elsewhere groups:', cause)) }
    refresh()
    const timer = window.setInterval(refresh, 60000)
    const stop = watchCloudGroups(userId, row => {
      forwardElsewhereGroupMessage(row)
      if (row.kind === 'system') refresh()
      if (!row.sender_id || row.sender_id === userId || row.kind === 'system') return
      const contactId = ELSEWHERE_GROUP_PREFIX + row.group_id
      bumpSocialUnread(contactId)
      const sender = friendsRef.current.find(friend => friend.id === row.sender_id)
      const group = groupsRef.current.find(item => item.id === row.group_id)
      const handles: Record<string, string> = {}
      for (const friend of friendsRef.current) handles[friend.id] = friend.handle
      const title = group ? groupTitle(group, userId, handles) : 'Group chat'
      if (!desktopNotificationsEnabled() && row.kind !== 'nudge') return
      const who = sender?.display_name || (sender ? '@' + sender.handle : 'Someone')
      void desktopNotice('elsewhere', {
        contactId,
        sender: `${who} in ${title}`,
        preview: !notificationPreviewsEnabled() ? undefined : row.kind === 'nudge' ? `${who} sent a nudge!` : row.kind === 'gif' ? 'Sent a GIF' : row.kind === 'image' ? 'Sent a photo' : row.text_body,
      }).catch(console.error)
    }, refresh)
    return () => { alive = false; window.clearInterval(timer); stop() }
  }, [userId])

  // Titles follow friend handle changes.
  useEffect(() => {
    if (!userId || !groupsRef.current.length) return
    const handles: Record<string, string> = {}
    for (const friend of friends || []) handles[friend.id] = friend.handle
    const titles: Record<string, string> = {}
    for (const group of groupsRef.current) titles[group.id] = groupTitle(group, userId, handles)
    publishCloudGroups({ me: userId, groups: groupsRef.current, titles })
  }, [userId, friends])

  // A chat window asking to switch conversations (no focus change).
  useEffect(() => {
    if (!isTauri()) return
    let stop: (() => void) | undefined
    let disposed = false
    void listen<string>(OPEN_CONTACT_REMOTE, ({ payload }) => {
      if (payload) window.dispatchEvent(new CustomEvent(OPEN_TOOLBAR_CONTACT, { detail: payload }))
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { disposed = true; stop?.() }
  }, [])
}
