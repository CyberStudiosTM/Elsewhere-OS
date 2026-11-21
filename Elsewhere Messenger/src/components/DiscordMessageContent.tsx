import type { BotMessage } from '../services/discordBot'
import './DiscordMessageContent.css'

export default function DiscordMessageContent({ message, onReply }:{ message: BotMessage; onReply?: (target: BotMessage)=>void }) {
  const content = message.content?.trim()
  return <div className="ew-discord-message-content">
    {message.referenced_message && <div className="ew-discord-reply-preview">↩ {message.referenced_message.author?.global_name || message.referenced_message.author?.username || 'Message'}: {message.referenced_message.content || '[Attachment]'}</div>}
    {content && <div className="ew-discord-text" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{content}</div>}
    {message.embeds?.map((e,i)=><div className="ew-discord-embed" key={i}>
      {e.title&&<strong>{e.url?<a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>:e.title}</strong>}
      {e.description&&<p>{e.description}</p>}
      {e.thumbnail?.url&&<img src={e.thumbnail.url} alt="Embed thumbnail" loading="lazy"/>}
    </div>)}
    {message.attachments?.map(a=><div key={a.id} className="ew-discord-attachment">
      {a.content_type?.startsWith('image/')&&<a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.filename} loading="lazy"/></a>}
      {a.content_type?.startsWith('video/')&&<video src={a.url} controls preload="metadata" />}
      {a.content_type?.startsWith('audio/')&&<audio src={a.url} controls preload="metadata" />}
      <a href={a.url} target="_blank" rel="noreferrer">{a.filename}</a>
    </div>)}
    {message.sticker_items?.map(s=><span key={s.id} title={s.name}>[Sticker: {s.name}] </span>)}
    {message.reactions?.length ? <div className="ew-discord-reactions">{message.reactions.map((r,i)=><span key={i}>{r.emoji.name || '♡'} {r.count}</span>)}</div> : null}
    {!content && !message.attachments?.length && !message.embeds?.length && !message.sticker_items?.length && <span>[Content unavailable or unsupported by the bot's permissions]</span>}
    {onReply&&<button type="button" className="ew-discord-reply-button" onClick={()=>onReply(message)}>↩ Reply</button>}
  </div>
}
