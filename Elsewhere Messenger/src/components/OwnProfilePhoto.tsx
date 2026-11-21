import { useRef, useState, type ReactNode } from 'react'
import { prepareProfilePhoto, PROFILE_PHOTOS, saveProfilePhoto, useProfilePhoto } from '../services/profilePhoto'
import InstagramAvatar from './InstagramAvatar'
import './OwnProfilePhoto.css'

export default function OwnProfilePhoto({ owner, service, remotePhoto, fallback, skin, size, className = '' }: {
  owner: string | null
  service: 'elsewhere' | 'instagram' | 'discord'
  remotePhoto?: string
  fallback: ReactNode
  skin: 'classic' | 'dead-signal'
  size?: number
  className?: string
}) {
  const choice = useProfilePhoto(owner)
  const dialog = useRef<HTMLDialogElement>(null)
  const pending = useRef(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const url = service === 'elsewhere' ? choice.url : remotePhoto
  const platform = service === 'discord' ? 'Discord' : service === 'instagram' ? 'Instagram' : 'Elsewhere'
  const picture = <InstagramAvatar url={url} alt={`Your ${platform} profile picture`} className="ew-own-photo-img" fallback={fallback} />
  const classes = `ew-own-photo ${className}`
  const style = size ? { width: size, height: size } : undefined

  function close() {
    pending.current += 1
    setBusy(false)
    dialog.current?.close()
  }

  function choose(value: string) {
    if (!owner) return
    try { saveProfilePhoto(owner, value); close() }
    catch { setError('Could not save your Elsewhere profile picture on this PC.') }
  }

  async function upload(file: File) {
    const request = ++pending.current
    setBusy(true)
    setError('')
    try {
      const value = await prepareProfilePhoto(file)
      if (request === pending.current && dialog.current?.open) choose(value)
    } catch (cause) {
      if (request === pending.current) setError(cause instanceof Error ? cause.message : 'Could not open that image.')
    } finally {
      if (request === pending.current) setBusy(false)
    }
  }

  if (service !== 'elsewhere' || !owner) return <div className={classes} style={style} title={url ? `Your ${platform} profile picture` : undefined}>{picture}</div>

  return <>
    <button type="button" className={classes} style={style} aria-label="Change Elsewhere profile picture"
      title="Change Elsewhere profile picture" onClick={() => { setError(''); dialog.current?.showModal() }}>
      {picture}
    </button>
    <dialog ref={dialog} className={`ew-photo-picker ew-photo-picker-${skin}`}
      aria-label="Elsewhere profile picture" onCancel={event => { event.preventDefault(); close() }}>
      <header><strong>Elsewhere profile picture</strong><button type="button" onClick={close} aria-label="Close">×</button></header>
      <div className="ew-photo-options">
        {PROFILE_PHOTOS.map(photo => <button key={photo.id} type="button" disabled={busy}
          aria-pressed={choice.value === photo.id} onClick={() => choose(photo.id)}>
          <img src={photo.url} alt="" /><span>{photo.label}</span>
        </button>)}
      </div>
      <label>Upload a picture
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy}
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void upload(file)
          }} />
      </label>
      <button type="button" disabled={busy || !choice.value} onClick={() => choose('')}>Use default</button>
      {error && <p role="alert">{error}</p>}
    </dialog>
  </>
}
