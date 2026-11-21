import { useEffect, useState } from 'react'
import type { IGMessage } from '../services/instagramGraph'
import { parseInstagramContent, type InstagramAsset } from '../services/instagramMedia'
import './InstagramMessageContent.css'

function Asset({ asset }: { asset: InstagramAsset }) {
  const url = asset.url
  const preview = url && (asset.kind === 'image' || asset.kind === 'gif' || asset.kind === 'sticker')
  return <div className="ig-asset">
    <strong>{asset.label}</strong>
    {asset.title && <span>{asset.title}</span>}
    {preview && <img src={url} alt={asset.label} loading="lazy" referrerPolicy="no-referrer" />}
    {url && asset.kind === 'video' && <video src={url} controls preload="none" />}
    {url && asset.kind === 'audio' && <audio src={url} controls preload="none" />}
    {url && <a href={url} target="_blank" rel="noopener noreferrer">Open attachment</a>}
    {!url && <small>Preview or link not supplied by Instagram</small>}
  </div>
}
export default function InstagramMessageContent({ message, allMessages=[], onReply }: { message: IGMessage; allMessages?: IGMessage[]; onReply?: (message: IGMessage) => void }) {
  const [shift,setShift]=useState(false)
  const [hover,setHover]=useState(false)
  useEffect(()=>{const down=(e:KeyboardEvent)=>{if(e.key==='Shift')setShift(true)};const up=(e:KeyboardEvent)=>{if(e.key==='Shift')setShift(false)};const blur=()=>setShift(false);window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur)}},[])
  const content = parseInstagramContent(message)
  const replyId=message.reply_to?.mid||message.reply_to?.id
  const original=replyId ? allMessages.find(item=>item.id===replyId):undefined
  const originalSummary=original?(original.message||original.text||parseInstagramContent(original).assets[0]?.label||'Media or unavailable content'):'Original message unavailable through Meta'
  const jump=()=>{if(!replyId||!original)return;const node=document.querySelectorAll('[data-instagram-message-id]');const target=Array.from(node).find(item=>item.getAttribute('data-instagram-message-id')===replyId);target?.scrollIntoView({behavior:'smooth',block:'center'});target?.classList.add('ew-reply-highlight');window.setTimeout(()=>target?.classList.remove('ew-reply-highlight'),1800)}
  return <div className="ig-content" data-instagram-message-id={message.id} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
    {replyId && <button type="button" className="ew-ig-reply-target" title={original?'Jump to original message':'Meta did not return the original message'} onClick={jump} disabled={!original}>↪ {originalSummary.slice(0,150)}</button>}
    {shift&&hover&&<div className="ew-ig-inspector" role="status"><strong>Message actions</strong>{onReply && <button type="button" onClick={() => onReply(message)}>↩ Reply to this message</button>}<button type="button" onClick={() => { void navigator.clipboard.writeText(content.text || content.assets[0]?.label || "").catch(() => {}) }}>Copy content</button><span>Sender: {message.from?.username||message.from?.name||message.from?.id||'Not provided'}</span><span>{message.created_time?new Date(message.created_time).toLocaleString():'Timestamp unavailable'}</span><span>{replyId ? `Replying to: ${originalSummary.slice(0,120)}` : 'No reply reference supplied'}</span><span>{message.id ? 'Message reference available' : ''}</span></div>}
    {content.text && <p>{content.text}</p>}
    {content.assets.map((asset, index) => <Asset key={`${message.id}-${index}`} asset={asset} />)}
    {content.fallback && <p className="ig-content-fallback">{content.fallback}</p>}
    {!!content.reactions.length && <small className="ig-content-reactions">{content.reactions.join(' ')}</small>}
  </div>
}
