import { useCallback, useEffect, useRef, useState } from 'react'
import { saveLocalImage } from '../services/messengerMedia'
import { listenForStudioPhotos, stagePhoto, watchPhotoBoothOpen, type BoothSource } from '../services/photoBooth'
import { toolbarAction } from '../services/toolbarActions'
import './PhotoBooth.css'

// Elsewhere Camera Booth ♡ and the "Your Photo ♡" preview (Studio Phase 1a).
// Captures stay on this PC. Use Photo only prepares an unsent attachment in the
// conversation the Booth was opened from.

type Ratio = '1:1' | '4:3' | '3:4' | '16:9'
type Timer = 0 | 3 | 10
const RATIOS: Ratio[] = ['1:1', '4:3', '3:4', '16:9']
const TIMERS: Timer[] = [0, 3, 10]
const IMPORT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_SIDE = 4096
const ratioValue = (ratio: Ratio) => { const [w, h] = ratio.split(':').map(Number); return w / h }
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function cameraProblem(cause: unknown) {
  const code = cause instanceof DOMException ? cause.name : ''
  return code === 'NotAllowedError' ? 'Camera access is off for Elsewhere. Turn it on in Windows Settings → Privacy & security → Camera, or import a photo instead.'
    : code === 'NotFoundError' || code === 'OverconstrainedError' ? 'No camera was found. You can import a photo instead.'
      : code === 'NotReadableError' ? 'Your camera is busy. Close other apps using it and try again, or import a photo.'
        : 'The camera couldn’t start. Try again, or import a photo.'
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The photo couldn’t be saved.')), type, quality))
}

/** Renders the Booth when something in this window opens it. */
export default function PhotoBoothHost() {
  const [source, setSource] = useState<BoothSource | null>(null)
  useEffect(() => watchPhotoBoothOpen(setSource), [])
  useEffect(() => listenForStudioPhotos(), [])
  if (!source) return null
  return <PhotoBooth source={source} onClose={() => setSource(null)} />
}

function PhotoBooth({ source, onClose }: { source: BoothSource; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const attempt = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting')
  const [problem, setProblem] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [ratio, setRatio] = useState<Ratio>('4:3')
  const [timer, setTimer] = useState<Timer>(0)
  const [shots, setShots] = useState<1 | 2 | 4>(1)
  const [tray, setTray] = useState<{ blob: Blob; url: string }[]>([])
  const trayRef = useRef<{ blob: Blob; url: string }[]>([])
  const [mirror, setMirror] = useState(true)
  const [grid, setGrid] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [flash, setFlash] = useState(false)
  const [menu, setMenu] = useState<'' | 'File' | 'Camera' | 'Effects'>('')
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const countdownTimer = useRef<number | undefined>(undefined)

  const stopCamera = useCallback(() => {
    attempt.current++
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
  }, [])

  const startCamera = useCallback(async (id: string) => {
    stopCamera()
    const mine = ++attempt.current
    setCamera('starting')
    setProblem('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
      const active = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      if (mine !== attempt.current) { active.getTracks().forEach(track => track.stop()); return }
      stream.current = active
      // If Windows turns the camera off (or it's unplugged), say so honestly.
      active.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (stream.current === active) { stream.current = null; setCamera('off'); setProblem('The camera stopped. Try again, or import a photo.') }
      }))
      if (video.current) { video.current.srcObject = active; await video.current.play().catch(() => {}) }
      setCamera('on')
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput')
      setDevices(list)
      const current = active.getVideoTracks()[0]?.getSettings().deviceId
      if (current) setDeviceId(current)
    } catch (cause) {
      if (mine !== attempt.current) return
      setCamera('off')
      setProblem(cameraProblem(cause))
    }
  }, [stopCamera])

  // Start on open; always release the camera on close.
  useEffect(() => {
    const start = window.setTimeout(() => void startCamera(''), 0)
    return () => { window.clearTimeout(start); window.clearInterval(countdownTimer.current); stopCamera() }
  }, [startCamera, stopCamera])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); if (menu) setMenu(''); else close() }
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  })

  function close() {
    if (busy) return
    stopCamera()
    onClose()
  }

  async function keep(canvas: HTMLCanvasElement, name: string) {
    const blob = await canvasBlob(canvas, 'image/png')
    // PNG keeps the capture exactly; switch to high-quality JPEG only if it would be too big to send.
    const final = blob.size <= 7.5 * 1024 * 1024 ? blob : await canvasBlob(canvas, 'image/jpeg', 0.95)
    setPhoto({ blob: final, url: URL.createObjectURL(final), name: name + (final.type === 'image/png' ? '.png' : '.jpg') })
    setNotice('')
    stopCamera()
  }

  function snap() {
    const element = video.current
    if (!element || !element.videoWidth) return
    const sourceWidth = element.videoWidth
    const sourceHeight = element.videoHeight
    const wanted = ratioValue(ratio)
    let width = sourceWidth
    let height = Math.round(sourceWidth / wanted)
    if (height > sourceHeight) { height = sourceHeight; width = Math.round(sourceHeight * wanted) }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (mirror) { ctx.translate(width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(element, (sourceWidth - width) / 2, (sourceHeight - height) / 2, width, height, 0, 0, width, height)
    if (!reducedMotion()) { setFlash(true); window.setTimeout(() => setFlash(false), 450) }
    const stamp = new Date()
    if (shots > 1) {
      // Multi-shot strip: add to the tray, then count down for the next pose.
      void canvasBlob(canvas, 'image/jpeg', 0.95).then(blob => {
        const next = [...trayRef.current, { blob, url: URL.createObjectURL(blob) }]
        trayRef.current = next
        setTray(next)
        if (next.length < shots) window.setTimeout(() => startCountdown(3), 700)
        else stopCamera()
      })
      return
    }
    void keep(canvas, `Elsewhere Booth ${stamp.toISOString().slice(0, 19).replace(/[T:]/g, '-')}`)
  }

  function startCountdown(seconds: number) {
    setCountdown(seconds)
    countdownTimer.current = window.setInterval(() => {
      setCountdown(value => {
        if (value <= 1) { window.clearInterval(countdownTimer.current); snap(); return 0 }
        return value - 1
      })
    }, 1000)
  }

  function clearTray() {
    for (const shot of trayRef.current) URL.revokeObjectURL(shot.url)
    trayRef.current = []
    setTray([])
  }

  async function makeStrip() {
    if (!trayRef.current.length) return
    setBusy(true)
    try {
      const ids: string[] = []
      for (const [index, shot] of trayRef.current.entries()) {
        const media = await saveLocalImage(new File([shot.blob], `Booth strip shot ${index + 1}.jpg`, { type: 'image/jpeg' }))
        if (media.kind === 'local') ids.push(media.id)
      }
      const canSend = Boolean(source.contactId && !source.useUnavailable)
      toolbarAction({ kind: 'photo', mediaIds: ids, layout: shots === 4 ? 'strip-4' : 'strip-2', sourceId: canSend ? source.contactId || undefined : undefined, sourceName: canSend ? source.contactName : undefined })
      clearTray()
      onClose()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Your strip couldn’t be made.')
    } finally { setBusy(false) }
  }

  function capture() {
    if (camera !== 'on' || countdown) return
    if (shots > 1) { clearTray(); startCountdown(timer || 3); return }
    if (!timer) { snap(); return }
    startCountdown(timer)
  }

  async function importPhoto(file: File | undefined) {
    if (!file) return
    setNotice('')
    if (!IMPORT_TYPES.includes(file.type)) { setNotice('Import a PNG, JPEG, WebP or GIF image.'); return }
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        await keep(canvas, file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Imported photo')
      } finally { bitmap.close() }
    } catch { setNotice('That image couldn’t be opened. Try another file.') }
  }

  function retake() {
    setPhoto(null)
    setNotice('')
    void startCamera(deviceId)
  }

  async function usePhoto() {
    if (!photo || !source.contactId || source.useUnavailable) return
    setBusy(true)
    try {
      const media = await saveLocalImage(new File([photo.blob], photo.name, { type: photo.blob.type }))
      stagePhoto({ contactId: source.contactId, media })
      onClose()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'The photo couldn’t be attached.')
    } finally { setBusy(false) }
  }

  async function toPhotoStudio() {
    if (!photo) return
    setBusy(true)
    try {
      const media = await saveLocalImage(new File([photo.blob], photo.name, { type: photo.blob.type }))
      if (media.kind !== 'local') throw new Error('The photo couldn’t be prepared.')
      const canSend = Boolean(source.contactId && !source.useUnavailable)
      toolbarAction({ kind: 'photo', mediaId: media.id, sourceId: canSend ? source.contactId || undefined : undefined, sourceName: canSend ? source.contactName : undefined })
      onClose()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'The photo couldn’t be opened in Creative Studio.')
    } finally { setBusy(false) }
  }

  function savePhoto() {
    if (!photo) return
    const link = document.createElement('a')
    link.href = photo.url
    link.download = photo.name
    link.click()
    setNotice('Saved to your Downloads folder.')
  }

  const useDisabledReason = !source.contactId ? 'Open a conversation with an Elsewhere friend, then use the Webcam button there to send a photo.'
    : source.useUnavailable || ''

  return <div className="ew-booth-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section className="ew-booth" role="dialog" aria-modal="true" aria-label={photo ? 'Your Photo' : 'Elsewhere Camera Booth'}>
      <header className="ew-booth-titlebar">
        <span className="ew-booth-title">{photo ? 'Your Photo ♡' : 'Elsewhere Camera Booth ♡'}</span>
        {source.contactName && <span className="ew-booth-source" title="The conversation this photo is for">for {source.contactName}</span>}
        <button type="button" className="ew-booth-close" onClick={close} aria-label="Close Camera Booth">×</button>
      </header>

      {!photo && <nav className="ew-booth-menubar" aria-label="Camera Booth menu">
        {(['File', 'Camera', 'Effects'] as const).map(name => <div key={name} className="ew-booth-menu">
          <button type="button" aria-expanded={menu === name} onClick={() => setMenu(menu === name ? '' : name)}>{name}</button>
          {menu === name && <div className="ew-booth-dropdown" role="menu" onClick={() => setMenu('')}>
            {name === 'File' && <>
              <button type="button" role="menuitem" onClick={close}>Close</button>
            </>}
            {name === 'Camera' && <>
              {devices.length > 1 ? devices.map((device, index) => <button key={device.deviceId} type="button" role="menuitemradio"
                aria-checked={device.deviceId === deviceId} onClick={() => { setDeviceId(device.deviceId); void startCamera(device.deviceId) }}>
                {device.deviceId === deviceId ? '● ' : ''}{device.label || `Camera ${index + 1}`}</button>)
                : <span className="ew-booth-menu-note">{devices.length === 1 ? (devices[0].label || 'Your camera') : 'No other cameras'}</span>}
              <button type="button" role="menuitem" onClick={() => void startCamera(deviceId)}>Restart camera</button>
            </>}
            {name === 'Effects' && <>
              <button type="button" role="menuitemcheckbox" aria-checked={mirror} onClick={() => setMirror(value => !value)}>{mirror ? '✓ ' : ''}Mirror</button>
              <button type="button" role="menuitemcheckbox" aria-checked={grid} onClick={() => setGrid(value => !value)}>{grid ? '✓ ' : ''}Grid</button>
              <span className="ew-booth-menu-note">Filters, frames and stickers are in Creative Studio.</span>
            </>}
          </div>}
        </div>)}
      </nav>}

      <input ref={fileInput} type="file" accept={IMPORT_TYPES.join(',')} hidden
        onChange={event => { void importPhoto(event.target.files?.[0]); event.target.value = '' }} />

      {tray.length > 0 && tray.length >= shots && shots > 1 ? <div className="ew-booth-preview">
        <div className="ew-booth-strip" aria-label="Your photo strip">{tray.map((shot, index) => <img key={shot.url} src={shot.url} alt={`Shot ${index + 1}`} />)}</div>
        <div className="ew-booth-choices">
          <button type="button" onClick={() => { clearTray(); void startCamera(deviceId) }} disabled={busy}>Retake all</button>
          <button type="button" className="ew-booth-primary" onClick={() => void makeStrip()} disabled={busy}>Make my photo strip ✧</button>
          <button type="button" onClick={() => { tray.forEach((shot, index) => { const link = document.createElement('a'); link.href = shot.url; link.download = `Elsewhere Booth shot ${index + 1}.jpg`; link.click() }) }} disabled={busy}>Save shots</button>
        </div>
      </div> : photo ? <div className="ew-booth-preview">
        <figure className="ew-booth-polaroid">
          <img src={photo.url} alt="Your photo" />
          <figcaption>looking cute! ♡</figcaption>
        </figure>
        <div className="ew-booth-choices">
          <button type="button" onClick={retake} disabled={busy}>Retake</button>
          <button type="button" className="ew-booth-primary" onClick={() => void usePhoto()} disabled={busy || Boolean(useDisabledReason)}
            title={useDisabledReason || 'Add this photo to your message. You choose when to send it.'}>Use Photo</button>
          <button type="button" className="ew-booth-studio" onClick={() => void toPhotoStudio()} disabled={busy}
            title="Decorate this photo with filters, frames and stickers.">
            <span className="ew-booth-berry" aria-hidden="true">🍓</span> Take photo to Creative Studio ✧</button>
        </div>
        {useDisabledReason && <p className="ew-booth-hint">{useDisabledReason}</p>}
        <div className="ew-booth-secondary"><button type="button" onClick={savePhoto} disabled={busy}>Save Photo</button></div>
      </div> : <div className="ew-booth-stage">
        <div className="ew-booth-viewport" style={{ aspectRatio: ratio.replace(':', ' / ') }}>
          <video ref={video} muted playsInline className={mirror ? 'is-mirrored' : ''} aria-label="Camera preview" />
          {grid && camera === 'on' && <div className="ew-booth-grid" aria-hidden="true" />}
          {camera === 'on' && <span className="ew-booth-live" role="status"><span aria-hidden="true">●</span> Camera on</span>}
          {shots > 1 && camera === 'on' && <span className="ew-booth-shotcount" role="status">{tray.length} / {shots}</span>}
          {countdown > 0 && <div className={'ew-booth-countdown' + (reducedMotion() ? '' : ' is-animated')} key={countdown} aria-live="assertive">{countdown}</div>}
          {flash && <div className="ew-booth-flash" aria-hidden="true" />}
          {camera !== 'on' && <div className="ew-booth-message">
            {camera === 'starting' ? <p>Starting your camera…</p> : <>
              <p>{problem}</p>
              <div><button type="button" onClick={() => void startCamera(deviceId)}>Try again</button>
                <button type="button" onClick={() => fileInput.current?.click()}>Import Photo…</button></div>
            </>}
          </div>}
        </div>
        <div className="ew-booth-controls">
          <label className="ew-booth-control">Timer
            <select value={timer} onChange={event => setTimer(Number(event.target.value) as Timer)}>
              {TIMERS.map(value => <option key={value} value={value}>{value ? `${value}s` : 'Off'}</option>)}
            </select>
          </label>
          <button type="button" className="ew-booth-shutter" onClick={capture} disabled={camera !== 'on' || countdown > 0} aria-label="Take photo" title="Take photo" />
          <label className="ew-booth-control">Shots
            <select value={shots} onChange={event => { setShots(Number(event.target.value) as 1 | 2 | 4); clearTray() }}>
              <option value={1}>Single photo</option><option value={2}>2-shot strip</option><option value={4}>4-shot strip</option>
            </select>
          </label>
          <label className="ew-booth-control">Shape
            <select value={ratio} onChange={event => setRatio(event.target.value as Ratio)}>
              {RATIOS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </div>}

      {notice && <p className="ew-booth-notice" role="status">{notice}</p>}
    </section>
  </div>
}
