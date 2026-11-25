import { useEffect, useState } from 'react'
import type { CloudMessage } from '../services/connectedClient'

/** A photo or GIF in an Elsewhere conversation. Photos load through short-lived private links. */
export default function ElsewhereMediaMessage({ message, mediaUrl }: {
  message: CloudMessage
  mediaUrl: (path: string) => Promise<string>
}) {
  const isGif = message.kind === 'gif'
  const [url, setUrl] = useState(isGif ? message.text_body : '')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (isGif) return
    let alive = true
    setFailed(false)
    mediaUrl(message.text_body).then(link => { if (alive) setUrl(link) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [isGif, message.text_body, mediaUrl])

  if (failed) return <p className="ew-dm-media-missing">Photo unavailable.</p>
  if (!url) return <p className="ew-dm-media-missing">Loading photo…</p>
  return <a className="ew-dm-media" href={url} target="_blank" rel="noreferrer" title={isGif ? 'Open GIF' : 'Open photo'}>
    <img src={url} alt={isGif ? 'GIF' : 'Photo'} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    {isGif && <span className="ew-dm-media-credit">via GIPHY</span>}
  </a>
}
