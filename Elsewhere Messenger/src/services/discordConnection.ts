import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type DiscordIdentity = { id: string; username: string; global_name?: string | null; avatar?: string | null; discriminator?: string }
export type DiscordGuild = { id: string; name: string; icon?: string | null }

// OAuth state is memory-only. No Discord bearer token or verifier is written to disk.
let current: { identity: DiscordIdentity; guilds: DiscordGuild[]; token: string } | null = null
const EVENT = 'elsewhere:discord:connection-changed'
const PHOTO_REQUEST = 'elsewhere:discord:profile-photo-request'
const PHOTO_RESPONSE = 'elsewhere:discord:profile-photo'
const CHAT_WINDOWS = ['classic-chat', 'dead-signal-chat'] as const

function profilePhoto(identity?: DiscordIdentity) {
  if (!identity || !/^\d{15,25}$/.test(identity.id)) return undefined
  if (identity.avatar && /^(?:a_)?[a-f0-9]{32}$/i.test(identity.avatar)) {
    return `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png?size=128`
  }
  const legacy = identity.discriminator
  const index = legacy && /^\d{4}$/.test(legacy) && legacy !== '0000'
    ? Number(legacy) % 5
    : Number((BigInt(identity.id) >> 22n) % 6n)
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

function sendProfilePhoto(target: string) {
  return emitTo(target, PHOTO_RESPONSE, profilePhoto(current?.identity) ?? null)
}

function publishProfilePhoto() {
  if (isTauri()) for (const target of CHAT_WINDOWS) void sendProfilePhoto(target).catch(() => {})
}

export function useDiscordProfilePhotoBroker() {
  useEffect(() => {
    if (!isTauri() || getCurrentWindow().label !== 'main') return
    let stopped = false
    let unlisten: (() => void) | undefined
    void listen<string>(PHOTO_REQUEST, ({ payload }) => {
      const target = CHAT_WINDOWS.find(label => label === payload)
      if (target) void sendProfilePhoto(target).catch(console.error)
    }).then(stop => { if (stopped) stop(); else unlisten = stop }).catch(console.error)
    return () => { stopped = true; unlisten?.() }
  }, [])
}

export function useDiscordProfilePhoto() {
  const connection = useDiscordConnection()
  const [remote, setRemote] = useState<string>()
  useEffect(() => {
    if (!isTauri()) return
    const target = CHAT_WINDOWS.find(label => label === getCurrentWindow().label)
    if (!target) return
    let stopped = false
    let unlisten: (() => void) | undefined
    void listen<string | null>(PHOTO_RESPONSE, ({ payload }) => {
      setRemote(payload?.startsWith('https://cdn.discordapp.com/') ? payload : undefined)
    }).then(stop => {
      if (stopped) { stop(); return }
      unlisten = stop
      return emitTo('main', PHOTO_REQUEST, target)
    }).catch(console.error)
    return () => { stopped = true; unlisten?.() }
  }, [])
  return profilePhoto(connection?.identity) ?? remote
}
export function getDiscordConnection() { return current ? { identity: current.identity, guilds: current.guilds } : null }
export function setDiscordConnection(identity: DiscordIdentity, guilds: DiscordGuild[], token: string) {
  current = { identity, guilds, token }
  window.dispatchEvent(new Event(EVENT))
  publishProfilePhoto()
}
export function clearDiscordConnection() {
  current = null
  window.dispatchEvent(new Event(EVENT))
  publishProfilePhoto()
}
export function useDiscordConnection() {
  const [connection, setConnection] = useState(getDiscordConnection)
  useEffect(() => {
    const refresh = () => setConnection(getDiscordConnection())
    window.addEventListener(EVENT, refresh)
    refresh()
    return () => window.removeEventListener(EVENT, refresh)
  }, [])
  return connection
}
