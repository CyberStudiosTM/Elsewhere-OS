import { invoke, isTauri } from '@tauri-apps/api/core'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

export type CloudProfile = { id: string; handle: string; display_name: string; created_at: string }
export type CloudMessage = { id: string; sender_id: string; recipient_id: string; client_id: string; kind?: 'message' | 'nudge' | 'image' | 'gif'; text_body: string; created_at: string }
export type CloudFriend = { user_a: string; user_b: string; requested_by: string; accepted_at: string | null }
export type SavedAccount = { id: string; email: string }

export const ACCOUNT_TERMS_VERSION = '2026-11-19-v1'
export const ACCOUNT_SIGNUP_URL = 'https://cyberthreed.github.io/CyberStudios/elsewhere-accounts/'
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || ''
const project = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url)?.[1] || ''
export const cloudReady = Boolean(project && publishableKey)
export const canRememberAccount = () => isTauri() && /Windows/.test(navigator.userAgent)
export const cloud: SupabaseClient | null = cloudReady ? createClient(url, publishableKey, {
  auth: { storageKey: 'elsewhere-active-account', persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
}) : null

const INDEX = 'elsewhere.accounts.v1.' + project
const ACCOUNT_EVENT = 'elsewhere:cloud-accounts'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let index: { active?: string; accounts: SavedAccount[] } = { accounts: [] }
let boot: Promise<void> | undefined
let credentialQueue: Promise<void> = Promise.resolve()

try {
  const saved = JSON.parse(localStorage.getItem(INDEX) || 'null')
  if (Array.isArray(saved?.accounts)) {
    const accounts = saved.accounts.filter((account: SavedAccount) =>
      account && UUID.test(account.id) && typeof account.email === 'string' && account.email.length <= 254)
    index = { accounts, active: accounts.some((item: SavedAccount) => item.id === saved.active) ? saved.active : undefined }
  }
} catch { /* Start with a fresh device index. */ }

function writeIndex(next: typeof index) {
  localStorage.setItem(INDEX, JSON.stringify(next))
  index = next
  window.dispatchEvent(new Event(ACCOUNT_EVENT))
}
export function listSavedAccounts() { return [...index.accounts] }
export function watchSavedAccounts(action: () => void) {
  window.addEventListener(ACCOUNT_EVENT, action)
  return () => window.removeEventListener(ACCOUNT_EVENT, action)
}
function required() {
  if (!cloud) throw new Error('Elsewhere Accounts are not configured.')
  return cloud
}

async function persist(session: Session, activate: boolean) {
  const account = { id: session.user.id, email: session.user.email || 'Elsewhere account' }
  await invoke('remember_elsewhere_account', { project, account: account.id, refreshToken: session.refresh_token })
  writeIndex({ active: activate ? account.id : index.active,
    accounts: [...index.accounts.filter(other => other.id !== account.id), account] })
}
function serialized(action: () => Promise<void>) {
  const next = credentialQueue.then(action)
  credentialQueue = next.catch(() => {})
  return next
}
cloud?.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' && session && canRememberAccount() &&
      index.accounts.some(item => item.id === session.user.id)) {
    void serialized(async () => {
      if (index.accounts.some(item => item.id === session.user.id)) await persist(session, false)
    }).catch(() => {
      window.dispatchEvent(new Event('elsewhere:credential-save-failed'))
    })
  }
})
async function restoreAccount(id: string) {
  if (!canRememberAccount() || !index.accounts.some(item => item.id === id)) {
    throw new Error('No saved session for this account.')
  }
  const refreshToken = await invoke<string | null>('read_elsewhere_account', { project, account: id })
  if (!refreshToken) throw new Error('Saved sign-in is missing. Request a new email code.')
  // Restore in isolation so an expired saved account cannot sign out the current one.
  const temporary = createClient(url, publishableKey, {
    auth: { storageKey: 'elsewhere-restore-' + id, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const refreshed = await temporary.auth.refreshSession({ refresh_token: refreshToken })
  const session = refreshed.data.session
  if (refreshed.error || !session || session.user.id !== id || !session.user.email_confirmed_at) {
    throw new Error(refreshed.error && refreshed.error.status && refreshed.error.status >= 500
      ? 'Could not reconnect. Try again when Elsewhere is reachable.'
      : 'Saved sign-in could not be restored. Request a new email code if it has expired.')
  }
  // Save the rotated token before setting the live session.
  await serialized(() => persist(session, true))
  const { error } = await required().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  if (error) throw error
}
export function bootElsewhereAccounts() {
  if (!boot) boot = cloudReady && canRememberAccount() && index.active
    ? restoreAccount(index.active)
    : Promise.resolve()
  return boot
}
/** Start signed out: saved accounts are restored only when the main window signs in. */
export function skipAccountRestore() {
  boot ??= Promise.resolve()
}
export async function switchElsewhereAccount(id: string) {
  await restoreAccount(id)
  boot = Promise.resolve()
}
export async function forgetElsewhereAccount(id: string) {
  await serialized(async () => {
    await invoke('forget_elsewhere_account', { project, account: id })
    writeIndex({ active: index.active === id ? undefined : index.active, accounts: index.accounts.filter(item => item.id !== id) })
  })
}
export async function sendLoginCode(email: string) {
  const { error } = await required().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
  if (error && !['otp_disabled', 'signup_disabled', 'user_not_found'].includes(error.code || '')) throw error
}
export async function verifyLoginCode(email: string, token: string, remember: boolean) {
  const { data, error } = await required().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' })
  if (error) throw error
  if (!data.session?.user.email_confirmed_at || await cloudAccountStatus() === 'not-admitted') {
    await required().auth.signOut({ scope: 'local' })
    throw new Error('Finish registration and verify your email before using Elsewhere Accounts.')
  }
  boot = Promise.resolve()
  if (!canRememberAccount()) return
  if (remember) await serialized(() => persist(data.session!, true))
  else {
    const id = data.session.user.id
    if (index.accounts.some(item => item.id === id)) await forgetElsewhereAccount(id)
    if (index.active) writeIndex({ accounts: index.accounts })
  }
}
export const MIN_PASSWORD_LENGTH = 8
export async function signInWithCloudPassword(email: string, password: string, remember: boolean) {
  const { data, error } = await required().auth.signInWithPassword({ email: email.trim(), password })
  if (error) {
    if (error.code === 'invalid_credentials') {
      throw new Error('Email or password is incorrect. New here? Use “Create an account” to verify your email and choose a password. Signed up before passwords existed? Use “Forgot your password?” to set one.')
    }
    throw error
  }
  if (!data.session?.user.email_confirmed_at || await cloudAccountStatus() === 'not-admitted') {
    await required().auth.signOut({ scope: 'local' })
    throw new Error('Finish registration and verify your email before signing in.')
  }
  boot = Promise.resolve()
  if (!canRememberAccount()) return data.session.user
  if (remember) await serialized(() => persist(data.session!, true))
  else if (index.accounts.some(item => item.id === data.session.user.id)) await forgetElsewhereAccount(data.session.user.id)
  return data.session.user
}
export async function setCloudPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  const { error } = await required().auth.updateUser({ password })
  if (error) {
    if (error.code === 'same_password') return
    if (error.code === 'weak_password') throw new Error('Choose a stronger password.')
    throw error
  }
}
export function lastSavedAccountEmail() {
  return index.accounts.find(item => item.id === index.active)?.email || index.accounts.at(-1)?.email || ''
}
export async function currentCloudUser() {
  await bootElsewhereAccounts()
  const { data } = await required().auth.getUser()
  return data.user?.email_confirmed_at ? data.user : null
}
export async function cloudSignOut() {
  const { data } = await required().auth.getSession()
  const id = data.session?.user.id
  const { error } = await required().auth.signOut({ scope: 'local' })
  if (error) throw error
  if (id && canRememberAccount() && index.accounts.some(item => item.id === id)) await forgetElsewhereAccount(id)
}
async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await required().rpc(name, args)
  if (error) throw error
  return data as T
}
export function cloudAccountStatus() {
  return rpc<'ready' | 'terms-required' | 'not-admitted'>('elsewhere_account_status')
}
export function acceptCloudTerms() { return rpc<void>('accept_elsewhere_terms', { terms_version: ACCOUNT_TERMS_VERSION }) }
export async function getMyCloudProfile(id: string) {
  const { data, error } = await required().from('elsewhere_profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as CloudProfile | null
}
export async function registerCloudHandle(handle: string, displayName: string) {
  const { data, error } = await required().from('elsewhere_profiles')
    .insert({ handle, display_name: displayName.trim() }).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('That handle is taken or your account already has a profile.')
    throw error
  }
  return data as CloudProfile
}
export function searchCloudContact(handle: string) {
  return rpc<CloudProfile[]>('find_elsewhere_account', { exact_handle: handle.trim().replace(/^@/, '').toLowerCase() })
}
export async function loadCloudFriends() {
  const { data, error } = await required().from('elsewhere_friendships').select('user_a,user_b,requested_by,accepted_at')
  if (error) throw error
  return data as CloudFriend[]
}
export async function loadCloudBlocks() {
  const { data, error } = await required().from('elsewhere_blocks').select('blocked_id')
  if (error) throw error
  return data.map(row => row.blocked_id as string)
}
export const requestCloudFriend = (person: string) => rpc<void>('request_elsewhere_friend', { person })
export const answerCloudFriend = (person: string, accept: boolean) => rpc<void>('answer_elsewhere_friend', { person, accept_request: accept })
export const removeCloudFriend = (person: string) => rpc<void>('remove_elsewhere_friend', { person })
export const blockCloudAccount = (person: string, block: boolean) => rpc<void>('block_elsewhere_account', { person, do_block: block })
export const reportCloudAccount = (person: string, explanation: string) => rpc<void>('report_elsewhere_account', { person, explanation })
export async function loadCloudHistory(userId: string, person: string) {
  const { data, error } = await required().from('elsewhere_messages').select('*')
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${person}),and(sender_id.eq.${person},recipient_id.eq.${userId})`)
    .order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data as CloudMessage[]).reverse()
}
export const sendCloudMessage = (person: string, body: string, requestId: string) =>
  rpc<CloudMessage>('send_elsewhere_message', { person, body, request_id: requestId })
export const sendCloudMedia = (person: string, kind: 'image' | 'gif', body: string, requestId: string) =>
  rpc<CloudMessage>('send_elsewhere_message', { person, body, request_id: requestId, message_kind: kind })
export const sendCloudNudge = (person: string, requestId: string) =>
  rpc<CloudMessage>('send_elsewhere_message', { person, body: 'Nudge', request_id: requestId, message_kind: 'nudge' })
export function watchCloudInbox(userId: string, onMessage: (message: CloudMessage) => void) {
  const client = required()
  const channel = client.channel('elsewhere-inbox-' + userId + '-' + crypto.randomUUID())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'elsewhere_messages', filter: `recipient_id=eq.${userId}` },
      event => onMessage(event.new as CloudMessage)).subscribe()
  return () => { void client.removeChannel(channel) }
}
export async function lookupCloudProfiles(ids: string[]) {
  const users: CloudProfile[] = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await required().from('elsewhere_profiles').select('*').in('id', ids.slice(offset, offset + 100))
    if (error) throw error
    users.push(...data as CloudProfile[])
  }
  return users
}

export const ELSEWHERE_BUDDY_PREFIX = 'elsewhere-user:'
