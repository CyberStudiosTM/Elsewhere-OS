import {useEffect,useState} from 'react'
import {emit,listen} from '@tauri-apps/api/event'
import {isTauri} from '@tauri-apps/api/core'
const STORE='elsewhere.instagram.contact-appearance.v1'
export const APPEARANCE_CHANGED='elsewhere:instagram:appearance-changed'
export type ContactLook={color:string;favorite:boolean}
export type Appearance={defaultColor:string;contacts:Record<string,ContactLook>}
const initial:Appearance={defaultColor:'#87E7C0',contacts:{}}
function color(value:unknown):value is string{return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)}
export function readInstagramAppearance():Appearance{
 try{const raw=JSON.parse(localStorage.getItem(STORE)||'{}') as Partial<Appearance>;const contacts:Record<string,ContactLook>={};for(const [id,look] of Object.entries(raw.contacts||{})){if(/^[A-Za-z0-9_-]{1,200}$/.test(id)&&color(look?.color))contacts[id]={color:look.color,favorite:look.favorite===true}}return {defaultColor:color(raw.defaultColor)?raw.defaultColor:initial.defaultColor,contacts}}catch{return initial}
}
export function writeInstagramAppearance(next:Appearance){localStorage.setItem(STORE,JSON.stringify(next));window.dispatchEvent(new Event(APPEARANCE_CHANGED));if(isTauri())void emit(APPEARANCE_CHANGED).catch(()=>{})}
export function useInstagramAppearance(){const [appearance,setAppearance]=useState(readInstagramAppearance);useEffect(()=>{const refresh=()=>setAppearance(readInstagramAppearance());window.addEventListener('storage',refresh);window.addEventListener(APPEARANCE_CHANGED,refresh);let stop:(()=>void)|undefined;let disposed=false;if(isTauri())void listen(APPEARANCE_CHANGED,refresh).then(fn=>{if(disposed)fn();else stop=fn}).catch(()=>{});return()=>{disposed=true;stop?.();window.removeEventListener('storage',refresh);window.removeEventListener(APPEARANCE_CHANGED,refresh)}},[]);return appearance}
export const contactAppearance=(appearance:Appearance,id:string)=>appearance.contacts[id]||{color:appearance.defaultColor,favorite:false}
const RECENT_MS = 7 * 24 * 60 * 60 * 1000
/** Buddies: chats active in the last 7 days, plus starred people. Everyone else: Other Contacts. */
export function instagramRecentGroup(thread: { id: string; updated_time?: string }, appearance: Appearance, now = Date.now()): 'Buddies' | 'Other Contacts' {
  if (contactAppearance(appearance, thread.id).favorite) return 'Buddies'
  const updated = Date.parse(thread.updated_time || '')
  return Number.isFinite(updated) && now - updated <= RECENT_MS ? 'Buddies' : 'Other Contacts'
}
/** Newest conversation first; starred people stay on top. */
export function sortInstagramThreads<T extends { id: string; updated_time?: string }>(threads: T[], appearance: Appearance): T[] {
  return [...threads].sort((a, b) =>
    Number(contactAppearance(appearance, b.id).favorite) - Number(contactAppearance(appearance, a.id).favorite) ||
    (Date.parse(b.updated_time || '') || 0) - (Date.parse(a.updated_time || '') || 0))
}
export function instagramContactGroup(contact?: {
  is_user_follow_business?: boolean
  is_business_follow_user?: boolean
}): 'Buddies' | 'Other Contacts' | 'Instagram Chats' {
  if (contact?.is_user_follow_business === false || contact?.is_business_follow_user === false) return 'Other Contacts'
  if (contact?.is_user_follow_business === true && contact?.is_business_follow_user === true) return 'Buddies'
  return 'Instagram Chats'
}
