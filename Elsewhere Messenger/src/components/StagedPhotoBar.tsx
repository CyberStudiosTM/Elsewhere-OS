import { useEffect, useState } from 'react'
import { readLocalImage, type MediaRef } from '../services/messengerMedia'
import { unstagePhoto, useStagedPhoto } from '../services/photoBooth'

/** A Booth photo waiting in this conversation. It only sends when the person presses Send. */
export default function StagedPhotoBar({ contactId, onSend }: { contactId: string | null | undefined; onSend: (media: MediaRef) => Promise<void> | void }) {
  const media = useStagedPhoto(contactId)
  const [thumb, setThumb] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!media || media.kind !== 'local') { setThumb(''); return }
    let url = ''
    let alive = true
    void readLocalImage(media.id).then(blob => { if (alive && blob) { url = URL.createObjectURL(blob); setThumb(url) } })
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [media])

  if (!media || !contactId) return null
  return <div className="ew-staged-photo" role="group" aria-label="Photo ready to send">
    {thumb && <img src={thumb} alt="Your photo" />}
    <span>Photo ready to send</span>
    <button type="button" disabled={busy} onClick={() => {
      setBusy(true)
      void Promise.resolve(onSend(media)).finally(() => { unstagePhoto(contactId); setBusy(false) })
    }}>Send photo</button>
    <button type="button" disabled={busy} onClick={() => unstagePhoto(contactId)} aria-label="Remove photo">Remove</button>
  </div>
}
