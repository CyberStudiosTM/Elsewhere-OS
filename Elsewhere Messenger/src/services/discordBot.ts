import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'

export type BotGuild = { id: string; name: string; icon?: string | null }
export type BotChannel = { id: string; guild_id: string; name: string; type: number; parent_id?: string | null; position?: number }
export type BotMessage = { id: string; channel_id: string; content: string; timestamp: string; author: { id: string; username: string; global_name?: string; avatar?: string | null; bot?: boolean }; attachments?: Array<{id:string;filename:string;url:string;content_type?:string}>; embeds?: Array<{title?:string;description?:string;url?:string;thumbnail?:{url:string}}>; sticker_items?: Array<{id:string;name:string}>; reactions?: Array<{emoji:{name:string|null};count:number}>; referenced_message?: BotMessage | null }
export type GatewayMessage = {kind: 'MESSAGE_CREATE' | 'MESSAGE_UPDATE' | 'MESSAGE_DELETE'; message: BotMessage}

export function discordChannelId(contact: string | null) { return contact?.startsWith('discord:') ? contact.slice(8) : null }
export function discordContactId(channelId: string) { return `discord:${channelId}` }
export type BotIdentity = { id: string; username: string }
export async function connectDiscordBot(token: string, remember: boolean) {
  return invoke<BotIdentity>('discord_bot_connect', { botToken: token, remember })
}
export async function restoreDiscordBot() {
  return invoke<BotIdentity | null>('restore_discord_bot')
}
export async function disconnectDiscordBot() { return invoke<void>('discord_bot_disconnect') }
export async function getDiscordGuilds() { return invoke<BotGuild[]>('discord_bot_guilds') }
export async function getDiscordChannels(guildId: string) { return invoke<BotChannel[]>('discord_bot_channels',{guildId}) }
export async function getDiscordMessages(channelId: string) { return invoke<BotMessage[]>('discord_bot_messages',{channelId}) }
export async function sendDiscordMessage(channelId: string, content: string, replyId?: string) { return invoke<BotMessage>('discord_bot_send',{channelId,content,replyId:replyId||null}) }

// The source of truth is Rust, not per-window browser storage. No token is stored in TS state.
const EVENT = 'elsewhere:discord:channels-updated'
let available: Array<BotChannel & { guildName: string }> = []
export function setAvailableDiscordChannels(channels: typeof available) {
  available = channels
  window.dispatchEvent(new Event(EVENT))
}
export function getAvailableDiscordChannels() { return available }
export function useAvailableDiscordChannels() {
  const [channels,setChannels] = useState(getAvailableDiscordChannels)
  useEffect(()=>{ const refresh=()=>setChannels([...getAvailableDiscordChannels()]); window.addEventListener(EVENT,refresh); return ()=>window.removeEventListener(EVENT,refresh) },[])
  return channels
}
export function useDiscordMessages(channelId: string | null) {
  const [messages,setMessages]=useState<BotMessage[]>([])
  const [error,setError]=useState('')
  useEffect(()=>{
    setMessages([]); setError('')
    if(!channelId||!isTauri()) return
    let alive=true
    const reload = () => {void getDiscordMessages(channelId).then(items=>{if(alive){setMessages([...items].reverse());setError('')}}).catch(e=>{if(alive)setError(String(e))})}
    reload()
    let stop:undefined|(()=>void)
    let stopBot:undefined|(()=>void)
    void listen('elsewhere:discord:bot-connected',reload).then(fn=>{if(alive)stopBot=fn;else fn()}).catch(()=>{})
    void listen<GatewayMessage>('elsewhere:discord:gateway-message',ev=>{
      if(ev.payload.message?.channel_id!==channelId) return
      const {kind,message}=ev.payload
      setMessages(old=>kind==='MESSAGE_DELETE' ? old.filter(item=>item.id!==message.id) :
        [...old.filter(item=>item.id!==message.id),message].sort((a,b)=>a.id.localeCompare(b.id)))
    }).then(fn=>{if(alive)stop=fn;else fn()}).catch(()=>{})
    return ()=>{alive=false;stop?.();stopBot?.()}
  },[channelId])
  return {messages,error}
}

// Non-sensitive channel pins are shared across Classic and Dead Signal.
// They never grant access: all requests are checked by Discord against the bot's permissions.
import { emit } from '@tauri-apps/api/event'
export type PinnedDiscordChannel = { id: string; guildId: string; guildName: string; name: string }
const PINS_KEY = 'elsewhere.discord.pinned-channels.v1'
const PINS_EVENT = 'elsewhere:discord:pins-changed'
export function getPinnedDiscordChannels(): PinnedDiscordChannel[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(PINS_KEY) || '[]')
    if (!Array.isArray(data)) return []
    return data.filter((c): c is PinnedDiscordChannel => Boolean(c && typeof c.id === 'string' && /^\d{15,25}$/.test(c.id) && typeof c.guildId === 'string' && typeof c.name === 'string' && typeof c.guildName === 'string')).slice(0,100)
  } catch { return [] }
}
export function pinDiscordChannel(channel: PinnedDiscordChannel) {
  const items = getPinnedDiscordChannels().filter(c=>c.id!==channel.id)
  items.push(channel)
  try {localStorage.setItem(PINS_KEY,JSON.stringify(items.slice(-100)))} catch { /* optional */ }
  window.dispatchEvent(new Event(PINS_EVENT))
  if(isTauri())void emit(PINS_EVENT).catch(()=>{})
}
export function unpinDiscordChannel(channelId: string) {
  try{localStorage.setItem(PINS_KEY,JSON.stringify(getPinnedDiscordChannels().filter(c=>c.id!==channelId)))}catch{/* optional */}
  window.dispatchEvent(new Event(PINS_EVENT))
  if(isTauri())void emit(PINS_EVENT).catch(()=>{})
}
export function usePinnedDiscordChannels(){
  const [items,setItems]=useState(getPinnedDiscordChannels)
  useEffect(()=>{
    const update=()=>setItems(getPinnedDiscordChannels())
    window.addEventListener(PINS_EVENT,update)
    let stop:undefined|(()=>void);let alive=true
    if(isTauri())void listen(PINS_EVENT,update).then(fn=>{if(alive)stop=fn;else fn()}).catch(()=>{})
    return()=>{alive=false;stop?.();window.removeEventListener(PINS_EVENT,update)}
  },[])
  return items
}
