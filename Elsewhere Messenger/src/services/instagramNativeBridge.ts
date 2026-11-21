import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { IGMessage, IGThread } from './instagramGraph'
import type { MediaRef } from './messengerMedia'

/** The Instagram diagnostic window is the in-memory API broker.
 * Tokens never leave that window. Other native windows exchange only
 * conversation metadata, message contents and narrowly scoped actions.
 */
export const IG_BRIDGE_REQUEST = 'elsewhere:instagram:bridge-request'
export const IG_BRIDGE_RESPONSE = 'elsewhere:instagram:bridge-response'
export const IG_BRIDGE_CONNECTED = 'elsewhere:instagram:bridge-connected'
export const IG_BRIDGE_DISCONNECTED = 'elsewhere:instagram:bridge-disconnected'
/** Sent by the main window when Meta reports new Instagram activity (instant updates). */
export const IG_LIVE_ACTIVITY = 'elsewhere:instagram:live-activity'
export type IGBridgeOrigin = 'main' | 'classic-chat' | 'dead-signal-chat'
export type IGBridgeAction = 'threads' | 'messages' | 'send' | 'media'
export type IGBridgeRequest = { requestId: string; origin: IGBridgeOrigin; action: IGBridgeAction; threadId?: string; text?: string; media?:MediaRef; replyToMid?: string }
export type IGBridgeResponse = {requestId:string; ok:boolean; account?:string; accountPhoto?:string; threads?:IGThread[]; messages?:IGMessage[]; error?:string; acceptedId?:string}
export const IG_BRIDGE_ORIGINS: readonly IGBridgeOrigin[] = ['main','classic-chat','dead-signal-chat']
export const instagramContactId = (id:string) => 'instagram:' + id
export const instagramThreadId = (id:string) => id.startsWith('instagram:') ? id.slice('instagram:'.length) : null
/** Instagram lets apps reply only within 24 hours of the other person's last message.
 * True when the newest message from them is older than that (or none is visible). */
export function instagramReplyWindowClosed(messages: { from?: { id?: string }; created_time?: string }[], ownId: string, now = Date.now()) {
  if (!messages.length || !ownId) return false
  const theirs = messages.filter(message => message.from?.id && message.from.id !== ownId && message.created_time)
    .map(message => Date.parse(message.created_time!)).filter(Number.isFinite)
  if (!theirs.length) return true
  return now - Math.max(...theirs) > 24 * 60 * 60 * 1000
}
export const INSTAGRAM_WINDOW_NOTICE = 'Due to Instagram’s limitations, Elsewhere can only reply within 24 hours of the last message they sent you. Their last message was more than 24 hours ago, so send your next message in the Instagram app. Once they reply, come back to Elsewhere and keep chatting here.'
/** Short preview of a conversation's newest message for the contact list. */
export function instagramLastPreview(thread: IGThread, ownId: string): string {
  const newest = thread.messages?.data?.[0]
  if (!newest) return ''
  const attachments = Array.isArray(newest.attachments) ? newest.attachments : newest.attachments?.data
  const text = (newest.message || newest.text || (attachments?.length ? 'Sent an attachment' : '')).replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const short = text.length > 48 ? text.slice(0, 47) + '…' : text
  return newest.from?.id === ownId ? 'You: ' + short : short
}
export function instagramContactName(thread:IGThread, ownId:string):string {
  const other=thread.participants?.data?.find(p=>p.id!==ownId)
  return other?.username ? '@'+other.username : other?.name || (other?.id ? 'Instagram user '+other.id : 'Instagram conversation')
}
export function useNativeInstagram(selectedContact:string|null) {
  const [threads,setThreads]=useState<IGThread[]>([])
  const [account,setAccount]=useState('')
  const [accountPhoto, setAccountPhoto] = useState<string>()
  const [messages,setMessages]=useState<IGMessage[]>([])
  const [connected,setConnected]=useState(false)
  const [error,setError]=useState('')
  const [sending,setSending]=useState(false)
  const pending=useRef(new Map<string,{resolve:(result:IGBridgeResponse)=>void;reject:(reason:Error)=>void;timer:number}>())
  const messagesInFlight=useRef(false)
  const threadsRefreshInFlight=useRef(false)
  const origin=useRef<IGBridgeOrigin | null>(null)
  const selected=instagramThreadId(selectedContact||'')
  const mounted=useRef(true)
  useEffect(()=>{
    mounted.current=true
    if(!isTauri()) return ()=>{mounted.current=false}
    let stop:UnlistenFn|undefined
    let disposed=false
    void import('@tauri-apps/api/window').then(async({getCurrentWindow})=>{
      const label=getCurrentWindow().label
      if(!IG_BRIDGE_ORIGINS.includes(label as IGBridgeOrigin))return
      const unlisten=await listen<IGBridgeResponse>(IG_BRIDGE_RESPONSE,({payload})=>{
        const item=pending.current.get(payload.requestId)
        if(!item)return
        pending.current.delete(payload.requestId)
        window.clearTimeout(item.timer)
        item.resolve(payload)
      })
      if(disposed)unlisten();else {stop=unlisten;origin.current=label as IGBridgeOrigin}
    }).catch(()=>{})
    return ()=>{
      disposed=true;mounted.current=false;stop?.()
      for(const item of pending.current.values()) {window.clearTimeout(item.timer);item.reject(new Error('Instagram view closed'))}
      pending.current.clear()
    }
  },[])
  const request=useCallback(async(action:IGBridgeAction,threadId?:string,text?:string,media?:MediaRef,replyToMid?:string):Promise<IGBridgeResponse>=>{
    if(!isTauri()) throw new Error('Instagram is available in the native desktop app.')
    const from=origin.current
    if(!from) throw new Error('Instagram bridge is initializing. Try again.')
    const requestId=from+'-'+crypto.randomUUID()
    const response=new Promise<IGBridgeResponse>((resolve,reject)=>{
      const timer=window.setTimeout(()=>{
        pending.current.delete(requestId)
        reject(new Error('Instagram request timed out. If you were sending a message, check Instagram before retrying to avoid duplicates.'))
      },20000)
      pending.current.set(requestId,{resolve,reject,timer})
    })
    try {await emitTo('main',IG_BRIDGE_REQUEST,{requestId,origin:from,action,threadId,text,media,replyToMid} satisfies IGBridgeRequest)}
    catch {const item=pending.current.get(requestId);if(item){window.clearTimeout(item.timer);pending.current.delete(requestId)};throw new Error('Open Instagram Connection in Elsewhere Tools and authorize your account.')}
    const result=await response
    if(!result.ok) throw new Error(result.error||'Meta request failed')
    return result
  },[])
  const refreshThreads=useCallback(async()=>{
    if(threadsRefreshInFlight.current)return
    threadsRefreshInFlight.current=true
    try{
      const result=await request('threads')
      if(!mounted.current)return
      setAccount(result.account||'');setAccountPhoto(result.accountPhoto);setThreads(result.threads||[]);setConnected(true);setError('')
    }catch(e){if(mounted.current){setError(e instanceof Error?e.message:'Instagram unavailable')}}
    finally{threadsRefreshInFlight.current=false}
  },[request])
  // Messages shown instantly after sending, until Meta's own copy shows up in history.
  const localSends=useRef(new Map<string,{threadId:string;message:IGMessage;acceptedId?:string;at:number}>())
  const withLocalSends=useCallback((threadId:string,fetched:IGMessage[])=>{
    const now=Date.now()
    const kept:IGMessage[]=[]
    for(const [key,item] of localSends.current){
      const arrived=item.acceptedId?fetched.some(m=>m.id===item.acceptedId):false
      if(arrived||now-item.at>120000){localSends.current.delete(key);continue}
      if(item.threadId===threadId)kept.push(item.message)
    }
    return [...fetched,...kept].sort((a,b)=>(a.created_time||'').localeCompare(b.created_time||''))
  },[])
  const loadMessages=useCallback(async(threadId:string)=>{
    if(!threadId || messagesInFlight.current)return
    messagesInFlight.current=true
    try {
      const result=await request('messages',threadId)
      if(mounted.current){if(result.threads)setThreads(result.threads);setMessages(withLocalSends(threadId,result.messages||[]));setError('')}
    } finally { messagesInFlight.current=false }
  },[request,withLocalSends])
  const sendText=useCallback(async(threadId:string,text:string,replyToMid?:string)=>{
    if(!text.trim())return
    if(sending) return
    setSending(true)
    const key='local:'+crypto.randomUUID()
    const shown:IGMessage={id:key,message:text.trim(),from:{id:account},created_time:new Date().toISOString()}
    localSends.current.set(key,{threadId,message:shown,at:Date.now()})
    setMessages(previous=>[...previous,shown])
    try {
      const result=await request('send',threadId,text,undefined,replyToMid)
      const item=localSends.current.get(key)
      if(item)item.acceptedId=result.acceptedId
      // Meta may accept a send before it becomes visible in history.
      // Failure to refresh must not turn an accepted send into a retryable error.
      void loadMessages(threadId).catch(()=>{})
      return result.acceptedId
    }catch(e){
      localSends.current.delete(key)
      setMessages(previous=>previous.filter(m=>m.id!==key))
      setError(e instanceof Error?e.message:'Instagram send failed');throw e
    }
    finally{setSending(false)}
  },[request,loadMessages,sending,account])
  const sendMedia=useCallback(async(threadId:string,media:MediaRef)=>{
    if(sending)return
    setSending(true)
    try{
      const result=await request('media',threadId,undefined,media)
      void loadMessages(threadId).catch(()=>{})
      return result.acceptedId
    }catch(e){setError(e instanceof Error?e.message:'Instagram attachment send failed');throw e}
    finally{setSending(false)}
  },[request,loadMessages,sending])
  useEffect(()=>{
    if(!isTauri())return
    // Wait for the listener and origin to become ready before initial request.
    const timer=window.setInterval(()=>{if(origin.current){void refreshThreads();window.clearInterval(timer)}},500)
    const poll=window.setInterval(()=>{if(origin.current && !document.hidden) void refreshThreads()},180000)
    let stopConnected:UnlistenFn|undefined
    let stopDisconnected:UnlistenFn|undefined
    let disposed=false
    void listen(IG_BRIDGE_CONNECTED,()=>{void refreshThreads()}).then(unlisten=>{if(disposed)unlisten();else stopConnected=unlisten}).catch(()=>{})
    void listen(IG_BRIDGE_DISCONNECTED,()=>{setConnected(false);setThreads([]);setMessages([]);setAccount('');setAccountPhoto(undefined)}).then(unlisten=>{if(disposed)unlisten();else stopDisconnected=unlisten}).catch(()=>{})
    return ()=>{disposed=true;stopConnected?.();stopDisconnected?.();window.clearInterval(timer);window.clearInterval(poll)}
  },[refreshThreads])
  useEffect(()=>{setMessages([]);if(selected&&connected)void loadMessages(selected).catch(e=>setError(String(e)))},[selected,connected,loadMessages])
  useEffect(()=>{if(!selected||!connected)return;const timer=window.setInterval(()=>{if(!document.hidden)void loadMessages(selected).catch(()=>{})},180000);return()=>window.clearInterval(timer)},[selected,connected,loadMessages])
  // Instant updates: the main window relays Meta's "new message" signal. Reload now, and once more a few
  // seconds later in case Meta's history isn't updated yet when the signal arrives.
  useEffect(()=>{
    if(!isTauri())return
    let stop:UnlistenFn|undefined
    let disposed=false
    const timers:number[]=[]
    const reload=()=>{
      if(selected&&connected)void loadMessages(selected).catch(()=>{})
      else void refreshThreads()
    }
    void listen(IG_LIVE_ACTIVITY,()=>{reload();timers.push(window.setTimeout(reload,4000))})
      .then(unlisten=>{if(disposed)unlisten();else stop=unlisten}).catch(()=>{})
    return ()=>{disposed=true;stop?.();timers.forEach(timer=>window.clearTimeout(timer))}
  },[selected,connected,loadMessages,refreshThreads])
  return {account,accountPhoto,threads,messages,connected,error,sending,refreshThreads,loadMessages,sendText,sendMedia}
}

export function instagramOtherParticipant(thread:IGThread,owner:string){return thread.participants?.data?.find(p=>p.id!==owner)}
export function instagramProfilePicture(thread:IGThread,owner:string){
  const value=instagramOtherParticipant(thread,owner)?.profile_pic||instagramOtherParticipant(thread,owner)?.profile_picture_url
  if(!value)return undefined
  try{const u=new URL(value);return u.protocol==='https:'?u.href:undefined}catch{return undefined}
}
