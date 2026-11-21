import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import { isTauri } from '@tauri-apps/api/core'

// Elsewhere · Unified Login diagnostic + test adapter.
// Intended for a system-user access token from Meta's Unified Login flow.
// Do not expose this token outside the local native window.
export type GraphHost = 'graph.facebook.com' | 'graph.instagram.com'
export type IGAccount = { id: string; username: string; photo?: string }
export type IGParticipant = { id: string; username?: string; name?: string; profile_pic?: string; profile_picture_url?: string; is_user_follow_business?: boolean; is_business_follow_user?: boolean }
export type IGThread = {
  id: string
  updated_time?: string
  participants?: { data?: IGParticipant[] }
  /** Newest message only, when Meta allows it in the conversation list. */
  messages?: { data?: IGMessage[] }
}
export type IGAttachment = {
  id?: string; type?: string; name?: string; file_url?: string; url?: string
  image_data?: { url?: string; render_as_sticker?: boolean }
  video_data?: { url?: string }
  audio_data?: { url?: string }
  payload?: { url?: string; title?: string; media_id?: string; ig_post_media_id?: string; video_id?: string }
}
export type IGShare = { id?: string; type?: string; name?: string; description?: string; url?: string; link?: string }
export type IGMessage = {
  id: string; message?: string; text?: string; created_time?: string
  from?: { id?: string; username?: string; name?: string }
  attachments?: { data?: IGAttachment[] } | IGAttachment[]
  shares?: IGShare[] | { data?: IGShare[] }
  story?: { id?: string; link?: string }[] | { id?: string; link?: string }
  reactions?: { data?: { reaction?: string; emoji?: string }[] } | { reaction?: string; emoji?: string }[]
  reply_to?: { mid?: string; id?: string; is_self_reply?: boolean }
  is_deleted?: boolean
  is_unsupported?: boolean
}
export type GraphPage<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }
type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; type?: string; fbtrace_id?: string } }
const ACCOUNT_OR_RECIPIENT_ID = /^\d{6,30}$/
// Conversation identifiers are opaque Graph API IDs, not guaranteed to be numeric.
// Only permit a single safe URL path segment, never a slash, query, or fragment.
const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,200}$/
const CURSOR = /^[\w\-+=/]{1,800}$/
const FACEBOOK_API = 'https://graph.facebook.com/v27.0'
const INSTAGRAM_API = 'https://graph.instagram.com/v27.0'
/** Tokens from "Connect Instagram" (Instagram Login) start with IG and use Instagram's own host. */
export const isInstagramLoginToken = (token: string) => /^IG/.test(token.trim())
const apiBase = (token: string) => isInstagramLoginToken(token) ? INSTAGRAM_API : FACEBOOK_API

// Rate protection for the main-window API broker. Never retry sends automatically.
const META_MIN_INTERVAL_MS = 1500
const META_LIMIT_COOLDOWN_MS = 30 * 60 * 1000
// A cooldown timestamp is not a credential. Persist it so app restarts do not
// immediately hit a throttled Meta endpoint again.
const RATE_LIMIT_KEY = 'elsewhere.instagram.rateLimitUntil.v1'
function savedPauseUntil(): number {
  try {
    const value = Number(localStorage.getItem(RATE_LIMIT_KEY) || 0)
    return Number.isFinite(value) && value > Date.now() && value < Date.now() + 24 * 60 * 60 * 1000 ? value : 0
  } catch { return 0 }
}
let metaPausedUntil = savedPauseUntil()
let nextMetaRequestAt = 0
let metaQueue: Promise<void> = Promise.resolve()

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function instagramRateLimitRemainingMs(): number {
  // Another Elsewhere webview may have observed a rate limit more recently.
  return Math.max(0, Math.max(metaPausedUntil, savedPauseUntil()) - Date.now())
}

export function instagramRateLimitMessage(): string {
  const minutes = Math.max(1, Math.ceil(instagramRateLimitRemainingMs() / 60000))
  return `Instagram is temporarily rate-limited by Meta. Automatic requests are paused for about ${minutes} more minute(s). Please avoid repeated refreshes; no new token is needed.`
}

function markMetaLimit(): void {
  metaPausedUntil = Math.max(metaPausedUntil, Date.now() + META_LIMIT_COOLDOWN_MS)
  try { localStorage.setItem(RATE_LIMIT_KEY, String(metaPausedUntil)) } catch { /* in-memory guard remains active */ }
}

async function enterMetaQueue(): Promise<void> {
  // Serialize starts across threads, profiles, and messages in this webview.
  const previous = metaQueue
  let release!: () => void
  metaQueue = new Promise<void>(resolve => { release = resolve })
  await previous
  try {
    if (instagramRateLimitRemainingMs() > 0) throw new Error(instagramRateLimitMessage())
    const delay = Math.max(0, nextMetaRequestAt - Date.now())
    if (delay) await wait(delay)
    if (instagramRateLimitRemainingMs() > 0) throw new Error(instagramRateLimitMessage())
    nextMetaRequestAt = Date.now() + META_MIN_INTERVAL_MS
  } finally { release() }
}

function safeAccountOrRecipientId(id: string) {
  if (!ACCOUNT_OR_RECIPIENT_ID.test(id)) throw new Error('Expected a numeric Instagram account or recipient ID.')
  return id
}

function safeConversationId(id: string) {
  if (!CONVERSATION_ID.test(id)) throw new Error('Invalid Instagram conversation ID returned by Meta.')
  return id
}

async function graphRequest<T>(token: string, path: string, method: 'GET' | 'POST', params?: Record<string, string>, body?: unknown): Promise<T> {
  if (!isTauri()) throw new Error('Open Elsewhere in the native Tauri app for Meta API access.')
  if (!token.trim()) throw new Error('Connect Instagram first.')
  if (!/^\/[a-z0-9/_-]+$/i.test(path)) throw new Error('Unsupported Meta API path.')
  const url = new URL(apiBase(token) + path)
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value)
  await enterMetaQueue()
  const response = await nativeFetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
  let result: unknown = {}
  try { result = await response.json() } catch { /* avoid logging response bodies */ }
  const err = (result as GraphError)?.error
  if (!response.ok || err) {
    const code = err?.code ?? response.status
    if (code === 4 || code === 17 || response.status === 429) {
      markMetaLimit()
      throw new Error(instagramRateLimitMessage())
    }
    // Meta's messaging window: replies are only allowed within 24 hours of the person's last message.
    if ((code === 10 && err?.error_subcode === 2534022) || /outside of (the )?allowed window/i.test(err?.message || '')) {
      throw new Error('Instagram only lets apps reply within 24 hours of their last message. Reply in the Instagram app, or wait for them to message you.')
    }
    const sub = err?.error_subcode ? `/${err.error_subcode}` : ''
    const message = err?.message || `HTTP ${response.status}`
    // Never include request URLs, headers, token values, or raw response bodies in messages.
    throw new Error(`Meta ${code}${sub}: ${message}`)
  }
  return result as T
}

export function graphGet<T>(_host: GraphHost, token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  return graphRequest<T>(token, path, 'GET', params)
}

// For Unified Login, /me/accounts targets Pages and can be empty even when
// Instagram has been authorized. Assigned Instagram assets are a separate edge.
export async function identifyInstagramAccount(_host: GraphHost, token: string): Promise<IGAccount[]> {
  const list = await graphRequest<GraphPage<{id: string; username?: string}>>(token, '/me/assigned_instagram_accounts', 'GET', { limit: '100' })
  const ids = (list.data || []).filter(item => ACCOUNT_OR_RECIPIENT_ID.test(item.id))
  const results: IGAccount[] = []
  for (const item of ids) {
    try {
      const profile = await graphRequest<{id?: string; username?: string}>(token, `/${safeAccountOrRecipientId(item.id)}`, 'GET', { fields: 'id,username' })
      results.push({ id: item.id, username: profile.username || item.username || 'Instagram account' })
    } catch {
      results.push({ id: item.id, username: item.username || 'Instagram account (profile restricted)' })
    }
  }
  return results
}

/** The account behind an Instagram Login token. */
export async function identifyInstagramLogin(token: string): Promise<IGAccount> {
  const me = await graphRequest<{ user_id?: string | number; id?: string; username?: string; profile_picture_url?: string }>(
    token, '/me', 'GET', { fields: 'user_id,username,profile_picture_url' })
  const id = String(me.user_id ?? '')
  if (!ACCOUNT_OR_RECIPIENT_ID.test(id)) throw new Error('Instagram didn’t return an account for this sign-in.')
  let photo: string | undefined
  try { if (me.profile_picture_url && new URL(me.profile_picture_url).protocol === 'https:') photo = me.profile_picture_url } catch { /* default picture */ }
  return { id, username: me.username || 'Instagram account', photo }
}

/** Extends an Instagram Login token for another 60 days. Needs no app secret. */
export async function refreshInstagramLoginToken(token: string): Promise<string | null> {
  if (!isInstagramLoginToken(token) || !isTauri()) return null
  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', token.trim())
  const response = await nativeFetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } })
  const body = await response.json().catch(() => ({})) as { access_token?: string }
  return response.ok && typeof body.access_token === 'string' && body.access_token ? body.access_token : null
}

export async function checkInstagramAccount(token: string, id: string): Promise<IGAccount> {
  if (isInstagramLoginToken(token)) {
    const own = await identifyInstagramLogin(token)
    if (own.id !== id) throw new Error('This Instagram sign-in belongs to a different account.')
    return own
  }
  const path = `/${safeAccountOrRecipientId(id)}`
  type AccountProfile = { id?: string; username?: string; profile_picture_url?: string }
  const profile = await graphRequest<AccountProfile>(token, path, 'GET', { fields: 'id,username,profile_picture_url' })
    .catch(error => {
      if (!(error instanceof Error) || !/^Meta 100(?:\/\d+)?:/i.test(error.message) ||
          !/profile_picture_url/i.test(error.message)) throw error
      return graphRequest<AccountProfile>(token, path, 'GET', { fields: 'id,username' })
    })
  if (profile.id !== id) throw new Error('Meta returned a different Instagram account ID than requested.')
  let photo: string | undefined
  if (profile.profile_picture_url) {
    try {
      const url = new URL(profile.profile_picture_url)
      if (url.protocol === 'https:') photo = url.href
    } catch { /* Keep using the default picture. */ }
  }
  return { id, username: profile.username || 'Instagram account', photo }
}

// Ask for each conversation's newest message alongside the list; drop it if Meta refuses the field.
const THREAD_FIELDS_WITH_PREVIEW = 'id,updated_time,participants,messages.limit(1){id,message,from,created_time,attachments}'
let threadPreviewsAllowed = true
export async function getThreads(_host: GraphHost, token: string, account: string, after?: string) {
  if (threadPreviewsAllowed) {
    try {
      return await getThreadsWith(token, account, THREAD_FIELDS_WITH_PREVIEW, after)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      if (!/^Meta 100(?:\/\d+)?:/i.test(message)) throw cause
      threadPreviewsAllowed = false
    }
  }
  return getThreadsWith(token, account, 'id,updated_time,participants', after)
}
async function getThreadsWith(token: string, account: string, fields: string, after?: string) {
  const params: Record<string,string> = { platform: 'instagram', fields, limit: '30' }
  if (after) { if (!CURSOR.test(after)) throw new Error('Invalid page cursor.'); params.after = after }
  const path = `/${safeAccountOrRecipientId(account)}/conversations`
  try {
    return await graphRequest<GraphPage<IGThread>>(token, path, 'GET', params)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    if (!isInstagramLoginToken(token) || !/^Meta 100(?:\/\d+)?:/i.test(message)) throw cause
    return graphRequest<GraphPage<IGThread>>(token, '/me/conversations', 'GET', params)
  }
}

// Expanded Graph fields are feature/permission dependent. Fall back only when
// Meta rejects a field; preserve the proven text path and existing send behavior.
const MESSAGE_FIELDS = [
  'id,message,from,created_time,attachments,shares{id,name,description,type,url},story,reactions,reply_to',
  'id,message,from,created_time,attachments,shares,story,reactions,reply_to',
  'id,message,from,created_time,attachments,shares,story,reactions,is_unsupported',
  'id,message,from,created_time,attachments,shares',
  'id,message,from,created_time,attachments',
  'id,message,from,created_time',
] as const
let acceptedMessageFieldIndex = 0
export async function getThreadMessages(_host: GraphHost, token: string, threadId: string) {
  const path = `/${safeConversationId(threadId)}/messages`
  for (let index = acceptedMessageFieldIndex; index < MESSAGE_FIELDS.length; index += 1) {
    try {
      const page = await graphRequest<GraphPage<IGMessage>>(token, path, 'GET', {
        fields: MESSAGE_FIELDS[index], limit: '50',
      })
      acceptedMessageFieldIndex = index
      return page
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      // Do not swallow authentication, permission, rate-limit, or transport failures.
      if (isInstagramLoginToken(token) && /^Meta 100(?:\/\d+)?:/i.test(message)) break
      if (index === MESSAGE_FIELDS.length - 1 || !/^Meta 100(?:\/\d+)?:/i.test(message) ||
          !/(field|nonexisting|non-existent|unknown)/i.test(message)) throw cause
    }
  }
  if (isInstagramLoginToken(token)) {
    // Instagram Login documents messages as a conversation field (newest 20 readable).
    const conversation = await graphRequest<{ messages?: GraphPage<IGMessage> }>(token, `/${safeConversationId(threadId)}`, 'GET', {
      fields: 'messages{id,created_time,from,to,message,attachments,reply_to}',
    })
    return conversation.messages || { data: [] }
  }
  throw new Error('Unable to retrieve Instagram messages.')
}

export async function sendInstagramText(token: string, account: string, recipient: string, text: string, replyToMid?: string) {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 1000) throw new Error('Message must contain 1–1,000 characters.')
  if (replyToMid && !/^[A-Za-z0-9_.:-]{1,300}$/.test(replyToMid)) throw new Error('Invalid Instagram reply reference.')
  return graphRequest<{ message_id?: string; recipient_id?: string }>(token, `/${safeAccountOrRecipientId(account)}/messages`, 'POST', undefined, {
    recipient: { id: safeAccountOrRecipientId(recipient) },
    message: { text: trimmed },
    ...(replyToMid ? { reply_to: { mid: replyToMid } } : {}),
  })
}

// Media send is separate from text. Meta may restrict individual formats or
// accounts; callers must surface API errors rather than saving a fake message.
export async function sendInstagramImageUrl(token:string, account:string, recipient:string, imageUrl:string) {
  const u=new URL(imageUrl)
  if(u.protocol!=='https:' || !u.hostname)throw new Error('Image must have a public HTTPS URL.')
  return graphRequest<{message_id?:string;recipient_id?:string}>(token,`/${safeAccountOrRecipientId(account)}/messages`,'POST',undefined,{
    recipient:{id:safeAccountOrRecipientId(recipient)},
    message:{attachment:{type:'image',payload:{url:u.href}}},
  })
}

export async function sendInstagramImageBlob(token:string, account:string, recipient:string, file:Blob, filename:string) {
  if(!isTauri())throw new Error('Media upload requires the native desktop app.')
  if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type))throw new Error('Unsupported image format for this upload.')
  if(file.size<1 || file.size>8*1024*1024)throw new Error('Images must be smaller than 8 MB.')
  const form=new FormData()
  form.append('message',JSON.stringify({attachment:{type:'image',payload:{is_reusable:true}}}))
  form.append('filedata',file,filename.replace(/[^a-z0-9_.-]/gi,'_').slice(0,120)||'image.png')
  await enterMetaQueue()
  const response=await nativeFetch(`${apiBase(token)}/${safeAccountOrRecipientId(account)}/message_attachments?platform=instagram`,{
    method:'POST',headers:{Authorization:`Bearer ${token.trim()}`,Accept:'application/json'},body:form,
  })
  let result:unknown={}
  try{result=await response.json()}catch{/* no raw payload in errors */}
  const data=result as {attachment_id?:string;error?:{message?:string;code?:number}}
  if(data.error?.code === 4 || data.error?.code === 17 || response.status === 429) { markMetaLimit(); throw new Error(instagramRateLimitMessage()) }
  if(!response.ok || data.error)throw new Error(`Meta media upload ${data.error?.code??response.status}: ${data.error?.message||'Upload failed'}`)
  if(!data.attachment_id || !/^\d{6,30}$/.test(data.attachment_id))throw new Error('Meta did not return a usable attachment ID.')
  return graphRequest<{message_id?:string;recipient_id?:string}>(token,`/${safeAccountOrRecipientId(account)}/messages`,'POST',undefined,{
    recipient:{id:safeAccountOrRecipientId(recipient)},
    message:{attachment:{type:'image',payload:{attachment_id:data.attachment_id}}},
  })
}

/** Profile metadata is permission dependent; NEVER infer follow status on errors. */
export async function lookupInstagramContact(token:string, id:string):Promise<Partial<IGParticipant>> {
  const userId=safeAccountOrRecipientId(id)
  for (const fields of [
    'id,username,name,profile_pic,is_user_follow_business,is_business_follow_user',
    'id,username,profile_pic,is_user_follow_business,is_business_follow_user',
    'id,username,profile_picture_url,is_user_follow_business,is_business_follow_user',
    'id,username,profile_pic',
    'id,username,profile_picture_url',
    'id,username',
  ]) {
    try {
      return await graphRequest<IGParticipant>(token, `/${userId}`, 'GET', {fields})
    } catch (error) {
      const message=error instanceof Error?error.message:''
      // Only downgrade unsupported-field errors, never conceal auth failures.
      if(!/^Meta 100(?:\/\d+)?:/i.test(message) || !/(field|nonexisting|non-existent|unknown)/i.test(message)) break
    }
  }
  return {}
}
