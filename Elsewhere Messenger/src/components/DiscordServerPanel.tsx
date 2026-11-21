import { openUrl } from '@tauri-apps/plugin-opener'
import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { connectDiscordBot, restoreDiscordBot, disconnectDiscordBot, getDiscordGuilds, getDiscordChannels, getDiscordMessages, sendDiscordMessage, type BotGuild, type BotChannel, type BotMessage, pinDiscordChannel, unpinDiscordChannel, usePinnedDiscordChannels } from '../services/discordBot'
import './DiscordServerPanel.css'

export default function DiscordServerPanel({clientId}:{clientId:string}) {
  const pins=usePinnedDiscordChannels()
  const [token,setToken]=useState('')
  const [remember, setRemember] = useState(() => /Windows/.test(navigator.userAgent))
  const [restoreFailed, setRestoreFailed] = useState(false)
  const restored = useRef(false)
  const [bot,setBot]=useState<{id:string;username:string}|null>(null)
  const [guilds,setGuilds]=useState<BotGuild[]>([])
  const [guild,setGuild]=useState('')
  const [channels,setChannels]=useState<BotChannel[]>([])
  const [channel,setChannel]=useState('')
  const [messages,setMessages]=useState<BotMessage[]>([])
  const [draft,setDraft]=useState('')
  const [reply,setReply]=useState<BotMessage|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [gateway,setGateway]=useState('disconnected')
  const invite = /^\d{15,25}$/.test(clientId) ? `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=68608` : ''

  useEffect(()=>{
    let disposed=false
    let unlisten:(()=>void)|undefined
    void listen<string>('elsewhere:discord:gateway-status',e=>{if(!disposed)setGateway(e.payload)}).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{})
    return ()=>{disposed=true;unlisten?.()}
  },[])
  useEffect(()=>{
    if(!channel)return
    let disposed=false;let unlisten:(()=>void)|undefined
    void listen<{kind:string;message:BotMessage}>('elsewhere:discord:gateway-message',e=>{
      if(e.payload.message?.channel_id!==channel)return
      const {kind,message}=e.payload
      setMessages(prev=>kind==='MESSAGE_DELETE'?prev.filter(m=>m.id!==message.id):[...prev.filter(m=>m.id!==message.id),message].sort((a,b)=>a.id.localeCompare(b.id)))
    }).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{})
    return()=>{disposed=true;unlisten?.()}
  },[channel])

  async function run(action:()=>Promise<void>) {setBusy(true);setError('');try{await action()}catch(e){setError(String(e))}finally{setBusy(false)}}
  const restore = () => run(async () => {
    setRestoreFailed(false)
    try {
      const identity = await restoreDiscordBot()
      if (!identity) return
      setBot(identity)
      setGuilds(await getDiscordGuilds())
    } catch (cause) {
      setRestoreFailed(true)
      throw cause
    }
  })
  useEffect(() => {
    if (!isTauri() || restored.current) return
    restored.current = true
    void restore()
  }, [])

  const join = () => run(async () => {
    const identity = await connectDiscordBot(token, remember)
    setToken('')
    setRestoreFailed(false)
    setBot(identity)
    setGuilds(await getDiscordGuilds())
  })
  const chooseGuild=(id:string)=>run(async()=>{setGuild(id);setChannel('');setMessages([]);setChannels((await getDiscordChannels(id)).filter(c=>c.type===0||c.type===5).sort((a,b)=>(a.position||0)-(b.position||0)))})
  const chooseChannel=(id:string)=>run(async()=>{setChannel(id);setReply(null);setMessages((await getDiscordMessages(id)).reverse())})
  const send=()=>run(async()=>{if(!channel||!draft.trim())return;const result=await sendDiscordMessage(channel,draft,reply?.id);setMessages(old=>[...old.filter(m=>m.id!==result.id),result]);setDraft('');setReply(null)})
  return <section className="ew-discord-server" aria-label="Discord server chat">
    <h3>Discord server messages</h3>
    <p>Messages in this section are sent as the <strong>Elsewhere bot</strong>, not from your personal account. Personal DMs and friends are not available through this connection.</p>
    {invite&&<p><a href={invite} onClick={e=>{e.preventDefault();void openUrl(invite).catch(err=>setError(String(err)))}}>Install the Elsewhere bot in a server you manage</a> · requires server management permission</p>}
    {!bot ? <div className="ew-discord-bot-login"><label htmlFor="ew-bot-token">Bot token</label><input id="ew-bot-token" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/>
      {/Windows/.test(navigator.userAgent) && <label><input type="checkbox" checked={remember}
        onChange={event => setRemember(event.target.checked)} /> Remember this bot on this PC</label>}
      {restoreFailed && <button type="button" disabled={busy} onClick={() => void restore()}>Retry saved bot</button>}
      {restoreFailed && <button type="button" disabled={busy} onClick={() => void run(async () => {
        await disconnectDiscordBot()
        setRestoreFailed(false)
      })}>Forget saved bot</button>}
      <button disabled={busy||!token.trim()} onClick={()=>void join()}>Connect bot</button></div> : <>
      <p>Bot connected: <strong>{bot.username}</strong> · Gateway: {gateway}</p>
      <button disabled={busy} onClick={()=>void run(async()=>{await disconnectDiscordBot();setBot(null);setGuilds([]);setGuild('');setChannels([]);setChannel('');setMessages([]);setRestoreFailed(false)})}>Disconnect bot</button>
      <label>Server <select value={guild} disabled={busy} onChange={e=>void chooseGuild(e.target.value)}><option value="">Choose a server</option>{guilds.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select></label>
      <label>Channel <select value={channel} disabled={busy||!guild} onChange={e=>void chooseChannel(e.target.value)}><option value="">Choose a channel</option>{channels.map(c=><option value={c.id} key={c.id}># {c.name}</option>)}</select></label>
      {channel&&<><div><button type="button" onClick={()=>{ const selected=channels.find(c=>c.id===channel);const owner=guilds.find(g=>g.id===guild); if(selected&&owner)pinDiscordChannel({id:selected.id,guildId:owner.id,guildName:owner.name,name:selected.name}) }}>Pin #channel to Messenger contacts</button> {pins.some(c=>c.id===channel)&&<button type="button" onClick={()=>unpinDiscordChannel(channel)}>Unpin</button>}</div><div className="ew-discord-history" aria-live="polite">{messages.map(m=><div key={m.id} className="ew-discord-msg"><b>{m.author?.global_name||m.author?.username||'Unknown'}:</b> {m.content||'[Message content unavailable: verify bot permissions and Message Content intent]'}{m.attachments?.map(a=><a key={a.id} href={a.url} rel="noreferrer" target="_blank"> {a.filename}</a>)}<button type="button" onClick={()=>setReply(m)}>Reply</button></div>)}</div>{reply&&<div>Replying to {reply.author?.username}: {reply.content.slice(0,80)} <button onClick={()=>setReply(null)}>×</button></div>}<form onSubmit={e=>{e.preventDefault();void send()}}><textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} aria-label="Discord message"/><button disabled={busy||!draft.trim()} type="submit">Send as Elsewhere bot</button></form></>}
    </>}
    {error&&<p role="alert" className="ew-discord-error">{error}</p>}
  </section>
}
