import { useEffect, useState } from 'react'
import { cloud } from './connectedClient'

// Elsewhere group chats. Reads go straight to the database (members only, enforced
// on the server). Every change goes through the server functions in 07_group_chats.sql.

export const ELSEWHERE_GROUP_PREFIX = 'elsewhere-group:'
export type CloudGroup = { id: string; name: string | null; created_at: string; members: string[] }
export type CloudGroupMessage = {
  id: string
  group_id: string
  sender_id: string | null
  client_id: string
  kind: 'message' | 'nudge' | 'gif' | 'image' | 'system'
  text_body: string
  created_at: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const elsewhereGroupId = (contactId: string | null | undefined) => {
  const id = contactId?.startsWith(ELSEWHERE_GROUP_PREFIX) ? contactId.slice(ELSEWHERE_GROUP_PREFIX.length) : ''
  return UUID.test(id) ? id : null
}

function required() {
  if (!cloud) throw new Error('Elsewhere Accounts aren’t connected in this build.')
  return cloud
}
async function rpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await required().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function loadCloudGroups(): Promise<CloudGroup[]> {
  const { data, error } = await required().from('elsewhere_groups').select('id, name, created_at, elsewhere_group_members(user_id)')
  if (error) throw error
  return (data as Array<{ id: string; name: string | null; created_at: string; elsewhere_group_members: { user_id: string }[] }>)
    .map(row => ({ id: row.id, name: row.name, created_at: row.created_at, members: row.elsewhere_group_members.map(member => member.user_id) }))
}
export async function loadCloudGroup(groupId: string): Promise<CloudGroup | null> {
  const { data, error } = await required().from('elsewhere_groups').select('id, name, created_at, elsewhere_group_members(user_id)').eq('id', groupId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as { id: string; name: string | null; created_at: string; elsewhere_group_members: { user_id: string }[] }
  return { id: row.id, name: row.name, created_at: row.created_at, members: row.elsewhere_group_members.map(member => member.user_id) }
}
export async function loadCloudGroupHistory(groupId: string) {
  const { data, error } = await required().from('elsewhere_group_messages').select('*').eq('group_id', groupId)
    .order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data as CloudGroupMessage[]).reverse()
}
export const createCloudGroup = (people: string[], name?: string) =>
  rpc<{ id: string }>('create_elsewhere_group', { people, group_name: name || null })
export const addCloudGroupMember = (groupId: string, person: string) =>
  rpc<void>('add_elsewhere_group_member', { target: groupId, person })
export const leaveCloudGroup = (groupId: string) => rpc<void>('leave_elsewhere_group', { target: groupId })
export const renameCloudGroup = (groupId: string, name: string) => rpc<void>('rename_elsewhere_group', { target: groupId, group_name: name })
export const sendCloudGroupMessage = (groupId: string, body: string, requestId: string, kind: 'message' | 'nudge' | 'gif' | 'image' = 'message') =>
  rpc<CloudGroupMessage>('send_elsewhere_group_message', { target: groupId, body, request_id: requestId, message_kind: kind })

/** New group messages (in any group the person is in) and being added to a group. */
export function watchCloudGroups(userId: string, onMessage: (message: CloudGroupMessage) => void, onMembership: () => void) {
  const client = required()
  const channel = client.channel('elsewhere-groups-' + userId + '-' + crypto.randomUUID())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'elsewhere_group_messages' },
      event => onMessage(event.new as CloudGroupMessage))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'elsewhere_group_members', filter: `user_id=eq.${userId}` },
      () => onMembership())
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

/** "Alex, Sam and Jo" style title when a group has no name. */
export function groupTitle(group: Pick<CloudGroup, 'name' | 'members'>, me: string, handles: Record<string, string>) {
  if (group.name) return group.name
  const others = group.members.filter(id => id !== me).map(id => handles[id] ? '@' + handles[id] : 'friend')
  if (!others.length) return 'Group chat'
  if (others.length <= 3) return others.join(', ')
  return `${others.slice(0, 2).join(', ')} +${others.length - 2}`
}

// The main window keeps the signed-in person's group list here for the buddy list.
type GroupList = { me: string; groups: CloudGroup[]; titles: Record<string, string> }
let groupList: GroupList = { me: '', groups: [], titles: {} }
const GROUPS_CHANGED = 'elsewhere:cloud-groups-changed'
export function publishCloudGroups(next: GroupList) {
  groupList = next
  window.dispatchEvent(new Event(GROUPS_CHANGED))
}
export function useCloudGroupList(): GroupList {
  const [value, setValue] = useState(groupList)
  useEffect(() => {
    const update = () => setValue(groupList)
    window.addEventListener(GROUPS_CHANGED, update)
    update()
    return () => window.removeEventListener(GROUPS_CHANGED, update)
  }, [])
  return value
}
