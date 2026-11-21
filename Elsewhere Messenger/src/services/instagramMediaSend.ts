import type { MediaRef } from './messengerMedia'
import { readLocalImage, resolveGiphy } from './messengerMedia'
import { getTreasureFile } from './treasureVaultDb'
import { getTreasure, treasureUrl } from './webTreasures'
import { sendInstagramImageBlob, sendInstagramImageUrl } from './instagramGraph'

/** Never treat locally picked media as an Instagram message unless Meta accepts it. */
export async function sendInstagramMediaRef(token:string, account:string, recipient:string, media:MediaRef) {
  if(media.kind==='giphy') {
    const item=await resolveGiphy(media.id)
    const url=item?.images?.original?.url
    if(!url)throw new Error('The GIF provider did not return a usable media URL.')
    const target=new URL(url)
    if(target.protocol!=='https:' || !/(^|\.)giphy\.com$/.test(target.hostname))throw new Error('Unexpected GIF provider URL.')
    return sendInstagramImageUrl(token,account,recipient,target.href)
  }
  let blob:Blob|undefined|null
  if(media.kind==='local') blob=await readLocalImage(media.id)
  else {
    blob=await getTreasureFile(media.id)
    if(!blob){
      const item=await getTreasure(media.id)
      if(item){const response=await fetch(treasureUrl(item));if(response.ok)blob=await response.blob()}
    }
  }
  if(!blob)throw new Error('This image is missing from the local library.')
  let name=media.name||'image.png'
  if(blob.type==='image/webp') {
    const image=await createImageBitmap(blob)
    try {
      const canvas=document.createElement('canvas')
      canvas.width=image.width;canvas.height=image.height
      const ctx=canvas.getContext('2d')
      if(!ctx)throw new Error('Cannot convert WebP for Instagram.')
      ctx.drawImage(image,0,0)
      blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('Image conversion failed.')),'image/png'))
      name=name.replace(/\.webp$/i,'.png')
    } finally { image.close() }
  }
  return sendInstagramImageBlob(token,account,recipient,blob,name)
}
