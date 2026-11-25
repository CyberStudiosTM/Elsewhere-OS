/** Batch 07C: empty, versioned asset vault. No artwork is bundled or imported. */
export const TREASURE_CATEGORIES = ['blinkies','buttons','stamps','glitter','gifs','graphics','dolls','dividers','companions','greetings'] as const
export type TreasureCategory = typeof TREASURE_CATEGORIES[number]
export type Approval = 'draft' | 'review' | 'approved' | 'rejected'
export type TreasureRecord = {
  id:string; title:string; category:TreasureCategory; tags:string[];
  creator:string; sourceUrl:string; license:string; attribution:string;
  fileName:string; mimeType:'image/png'|'image/jpeg'|'image/gif'|'image/webp';
  width:number; height:number; animated:boolean; approved:Approval;
  addedAt:string; checksum?:string; reducedMotionId?:string;
}
const DB='elsewhere-web-treasures-v1'
const VERSION=1
const STORES=['metadata','files','favorites','collections','packs'] as const
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function done(t:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error);t.onerror=()=>reject(t.error)})}
export function openTreasureVault():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
    const req=indexedDB.open(DB,VERSION)
    req.onupgradeneeded=()=>{
      const db=req.result
      for(const name of STORES){if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'})}
      const metadata=req.transaction?.objectStore('metadata')
      if(metadata&&!metadata.indexNames.contains('category'))metadata.createIndex('category','category',{unique:false})
      if(metadata&&!metadata.indexNames.contains('approved'))metadata.createIndex('approved','approved',{unique:false})
    }
    req.onsuccess=()=>resolve(req.result)
    req.onerror=()=>reject(req.error)
    req.onblocked=()=>reject(new Error('Please close other Messenger windows and retry the vault migration.'))
  })
}
export async function vaultStats(){const db=await openTreasureVault();try{const tx=db.transaction([...STORES],'readonly');const results=await Promise.all(STORES.map(s=>request(tx.objectStore(s).count())));await done(tx);return Object.fromEntries(STORES.map((s,i)=>[s,results[i]])) as Record<typeof STORES[number],number>}finally{db.close()}}
export function validateTreasure(x:TreasureRecord){
  if(!/^[a-z0-9_-]{1,80}$/i.test(x.id)||!x.title.trim()||x.title.length>120||!TREASURE_CATEGORIES.includes(x.category)||!Array.isArray(x.tags)||!x.tags.every(tag=>typeof tag==='string'&&tag.length<=40)||!x.creator.trim()||!x.sourceUrl.startsWith('https://')||!x.license.trim()||!x.attribution.trim()||!/^[-\w. ]+\.(png|jpe?g|webp|gif)$/i.test(x.fileName)||!['image/png','image/jpeg','image/gif','image/webp'].includes(x.mimeType)||!Number.isInteger(x.width)||!Number.isInteger(x.height)||x.width<1||x.height<1||x.width>4096||x.height>4096||!['draft','review','approved','rejected'].includes(x.approved))throw new Error('Invalid treasure record or missing attribution.')
}
export async function listTreasureRecords(category?:TreasureCategory,approval?:Approval){const db=await openTreasureVault();try{const tx=db.transaction('metadata','readonly');const rows=await request(tx.objectStore('metadata').getAll()) as TreasureRecord[];await done(tx);return rows.filter(row=>(!category||row.category===category)&&(!approval||row.approved===approval))}finally{db.close()}}
export async function saveTreasureRecord(record:TreasureRecord){validateTreasure(record);const db=await openTreasureVault();try{const tx=db.transaction('metadata','readwrite');const completed=done(tx);tx.objectStore('metadata').put(record);await completed}finally{db.close()}}
export async function saveTreasureFile(id:string,blob:Blob){if(!/^[a-z0-9_-]{1,80}$/i.test(id)||!blob.type.startsWith('image/')||blob.size>12*1024*1024)throw new Error('Invalid ID, media type, or oversized file.');const db=await openTreasureVault();try{const tx=db.transaction('files','readwrite');const completed=done(tx);tx.objectStore('files').put({id,blob});await completed}finally{db.close()}}
export async function getTreasureFile(id:string):Promise<Blob|null>{const db=await openTreasureVault();try{const tx=db.transaction('files','readonly');const row=await request(tx.objectStore('files').get(id)) as {id:string;blob:Blob}|undefined;await done(tx);return row?.blob??null}finally{db.close()}}
export async function setTreasureFavorite(account:string,id:string,yes:boolean){const db=await openTreasureVault();try{const key=account+':'+id;const tx=db.transaction('favorites','readwrite');const completed=done(tx);if(yes)tx.objectStore('favorites').put({id:key,account,treasureId:id});else tx.objectStore('favorites').delete(key);await completed}finally{db.close()}}
export async function listTreasureFavorites(account:string){const db=await openTreasureVault();try{const tx=db.transaction('favorites','readonly');const rows=await request(tx.objectStore('favorites').getAll()) as {id:string;account:string;treasureId:string}[];await done(tx);return rows.filter(x=>x.account===account).map(x=>x.treasureId)}finally{db.close()}}
