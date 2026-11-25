import {
  getThreadMessages,
  getThreads,
  sendInstagramText,
  type IGMessage,
  type IGParticipant,
  type IGThread,
} from './instagramGraph'

/** Instagram conversations are never written to messagingCore's local demo history. */
export type InstagramConversation = {
  source: 'instagram'
  id: string
  label: string
  recipientId: string | null
  updatedTime?: string
}

export type InstagramMessageView = {
  source: 'instagram'
  id: string
  text: string
  own: boolean
  createdTime?: string
}

const HOST = 'graph.facebook.com' as const

function remoteParticipant(thread: IGThread, ownId: string): IGParticipant | undefined {
  return thread.participants?.data?.find(person => person.id !== ownId)
}

export function toInstagramConversation(thread: IGThread, ownId: string): InstagramConversation {
  const person = remoteParticipant(thread, ownId)
  return {
    source: 'instagram',
    id: thread.id,
    label: person?.username ? `@${person.username}` : person?.name || (person?.id ? `User ${person.id}` : 'Instagram conversation'),
    recipientId: person?.id || null,
    updatedTime: thread.updated_time,
  }
}

export function toInstagramMessage(message: IGMessage, ownId: string): InstagramMessageView {
  return {
    source: 'instagram',
    id: message.id,
    text: message.message || message.text || ((Array.isArray(message.attachments) ? message.attachments.length : message.attachments?.data?.length) ? '[Attachment]' : '[Unavailable message]'),
    own: message.from?.id === ownId,
    createdTime: message.created_time,
  }
}

export async function loadInstagramConversations(token: string, accountId: string, after?: string) {
  const page = await getThreads(HOST, token, accountId, after)
  return {
    conversations: (page.data || []).map(thread => toInstagramConversation(thread, accountId)),
    nextCursor: page.paging?.next ? page.paging.cursors?.after || null : null,
  }
}

export async function loadInstagramHistory(token: string, accountId: string, conversationId: string) {
  const page = await getThreadMessages(HOST, token, conversationId)
  return (page.data || [])
    .map(message => toInstagramMessage(message, accountId))
    .sort((a, b) => (a.createdTime || '').localeCompare(b.createdTime || ''))
}

/** Never optimistically append a local message or retry an ambiguous Meta result. */
export async function sendInstagramConversationText(
  token: string,
  accountId: string,
  conversation: InstagramConversation,
  text: string,
) {
  if (!conversation.recipientId) {
    throw new Error('Instagram conversation has no eligible recipient ID. Reply is unavailable.')
  }
  const result = await sendInstagramText(token, accountId, conversation.recipientId, text)
  if (!result.message_id) {
    throw new Error('Meta did not return a message ID. Send outcome unknown; check Instagram before trying again.')
  }
  return { messageId: result.message_id }
}

