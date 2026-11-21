import type { IGMessage } from './instagramGraph'

/** Optional, local, unencrypted history cache. No Meta access tokens stored. */
const DATABASE='elsewhere-instagram-history-v1'
const STORE='messages'
const PREFIX='elsewhere.instagram.cache-enabled'
export function historyCacheEnabled() { try{return localStorage.getItem(PREFIX)==='yes'}catch{return false} }
export function setHistoryCacheEnabled(enabled:boolean) {try{localStorage.setItem(PREFIX,enabled?'yes':'no')}catch{/* user can still use in-session view */}}

type Row={key:string;thread:string;message:IGMessage}
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DATABASE,1)
    req.onupgradeneeded=()=>{
      const db=req.result
      if(!db.objectStoreNames.contains(STORE)){
        const store=db.createObjectStore(STORE,{keyPath:'key'})
        store.createIndex('thread','thread',{unique:false})
      }
    }
    req.onsuccess=()=>resolve(req.result)
    req.onerror=()=>reject(new Error('Cannot open local Instagram history cache.'))
  })
}
function finish(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Local history transaction failed'))
  tx.onabort=()=>reject(tx.error||new Error('Local history transaction cancelled'))
})}
const threadKey=(account:string,threadId:string)=>account+':'+threadId
export async function readCachedHistory(account:string,threadId:string):Promise<IGMessage[]>{
  const db=await openDb()
  try{
    const tx=db.transaction(STORE,'readonly')
    const completed=finish(tx)
    const request=tx.objectStore(STORE).index('thread').getAll(threadKey(account,threadId))
    const rows=await new Promise<Row[]>((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result as Row[])
      request.onerror=()=>reject(request.error)
    })
    await completed
    return rows.map(item=>item.message).sort((a,b)=>(a.created_time||'').localeCompare(b.created_time||''))
  }finally{db.close()}
}
export async function mergeCachedHistory(account:string,threadId:string,received:IGMessage[]):Promise<IGMessage[]>{
  if(!account||!threadId)return received
  const existing=await readCachedHistory(account,threadId)
  const merged=new Map(existing.map(m=>[m.id,m]))
  for(const message of received){
    if(!message.id)continue
    const old=merged.get(message.id)
    // Keep richer previously available attachment data if Meta later omits it.
    merged.set(message.id,{...old,...message,
      attachments:message.attachments||old?.attachments,
      shares:message.shares||old?.shares,
      story:message.story||old?.story,
      reactions:message.reactions||old?.reactions})
  }
  const db=await openDb()
  try{
    const tx=db.transaction(STORE,'readwrite')
    const complete=finish(tx)
    const store=tx.objectStore(STORE)
    for(const message of merged.values())store.put({key:threadKey(account,threadId)+':'+message.id,thread:threadKey(account,threadId),message} satisfies Row)
    await complete
  }finally{db.close()}
  return [...merged.values()].sort((a,b)=>(a.created_time||'').localeCompare(b.created_time||''))
}
export async function clearCachedHistory(){
  const db=await openDb()
  try{const tx=db.transaction(STORE,'readwrite');const completed=finish(tx);tx.objectStore(STORE).clear();await completed}
  finally{db.close()}
}
