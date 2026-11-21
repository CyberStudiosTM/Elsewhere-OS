import { fetch } from '@tauri-apps/plugin-http'

export const X_CALLBACK = 'http://127.0.0.1:8767/x/callback'
export type XUser = { id: string; username: string; name: string }
export type XMessage = {
  id: string
  dm_conversation_id: string
  sender_id?: string
  participant_ids?: string[]
  text?: string
  event_type: string
  created_at?: string
}
export type InboxPage = {
  data?: XMessage[]
  includes?: { users?: XUser[] }
  meta?: { next_token?: string }
}
type Token = { access_token: string; refresh_token?: string; expires_in: number }
const API = 'https://api.x.com/2'
const snowflake = /^\d{1,25}$/

async function readResponse<T>(response: Awaited<ReturnType<typeof fetch>>): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  const detail = await response.json().catch(() => null) as { detail?: string; title?: string; error_description?: string } | null
  throw new Error(`X API (${response.status}). ${detail?.detail || detail?.error_description || detail?.title ||
    'Check app permissions and API access.'}`)
}

async function exchange(data: Record<string, string>) {
  return readResponse<Token>(await fetch(API + '/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  }))
}

export async function xAuthorization(clientId: string) {
  const random = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
  const verifier = random(48)
  const state = random(24)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: X_CALLBACK, response_type: 'code', state,
    code_challenge: challenge, code_challenge_method: 'S256',
    scope: 'dm.read dm.write tweet.read users.read offline.access',
  })
  return { clientId, state, verifier, url: 'https://x.com/i/oauth2/authorize?' + params }
}

export async function connectX(clientId: string, code: string, verifier: string) {
  let token = await exchange({ client_id: clientId, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: X_CALLBACK })
  let expires = Date.now() + token.expires_in * 1000
  let refreshing: Promise<void> | undefined
  async function request<T>(path: string, body?: { text: string }) {
    if (Date.now() >= expires - 30000) {
      if (!token.refresh_token) throw new Error('Reconnect X to continue.')
      refreshing ??= exchange({ client_id: clientId, grant_type: 'refresh_token', refresh_token: token.refresh_token })
        .then(value => {
          token = { ...value, refresh_token: value.refresh_token ?? token.refresh_token }
          expires = Date.now() + value.expires_in * 1000
        }).finally(() => { refreshing = undefined })
      await refreshing
    }
    return readResponse<T>(await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }))
  }
  const account = (await request<{ data: XUser }>('/users/me')).data
  function list(pagination?: string) {
    const fields = new URLSearchParams({
      'dm_event.fields': 'id,text,event_type,created_at,dm_conversation_id,sender_id,participant_ids',
      expansions: 'sender_id,participant_ids', 'user.fields': 'id,name,username', max_results: '50',
    })
    if (pagination) fields.set('pagination_token', pagination)
    return request<InboxPage>('/dm_events?' + fields)
  }
  async function send(text: string, recipient: { conversation: string } | { handle: string }) {
    if (!text.trim() || text.length > 10000) throw new Error('Enter an X message up to 10,000 characters.')
    let path: string
    if ('conversation' in recipient) {
      if (!/^[\d-]{1,51}$/.test(recipient.conversation)) throw new Error('Invalid X conversation ID.')
      path = '/dm_conversations/' + recipient.conversation + '/messages'
    } else {
      const handle = recipient.handle.trim().replace(/^@/, '')
      if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('Enter an X username.')
      const user = (await request<{ data: XUser }>('/users/by/username/' + handle)).data
      if (!snowflake.test(user.id)) throw new Error('X did not return a valid recipient.')
      path = '/dm_conversations/with/' + user.id + '/messages'
    }
    return request<{ data: { dm_conversation_id: string; dm_event_id: string } }>(path, { text: text.trim() })
  }
  return { account, list, send }
}
