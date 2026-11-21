import { useCallback, useEffect, useRef, useState } from 'react'
import { accountKey } from '../services/messagingCore'
import { prepareProfilePhoto, saveProfilePhoto } from '../services/profilePhoto'
import { ToolbarDialog, type ToolbarSkin } from './ToolbarDialogs'

const looks = {
  Original: 'none',
  'Dream Glow': 'brightness(1.12) saturate(1.28) contrast(.92)',
  'Rose Tint': 'sepia(.23) saturate(1.55) hue-rotate(330deg)',
  'Blue Glass': 'sepia(.25) hue-rotate(155deg) brightness(1.06) saturate(1.2)',
  'Soft Monochrome': 'grayscale(1) contrast(.88)',
}
const frames = { None: null, Lilac: '#bea1eb', Aqua: '#8ae7df', Pink: '#f6afd6' }
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export default function PhotoStudio({ skin, onClose, owner }: { skin: ToolbarSkin; onClose: () => void; owner?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const request = useRef(0)
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off')
  const [cameraReady, setCameraReady] = useState(false)
  const [photo, setPhoto] = useState<HTMLCanvasElement>()
  const [look, setLook] = useState<keyof typeof looks>('Original')
  const [frame, setFrame] = useState<keyof typeof frames>('None')
  const [stamp, setStamp] = useState<'None' | 'Hearts' | 'Stars'>('None')
  const [mirror, setMirror] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (stream.current && video.current) video.current.srcObject = stream.current
  }, [camera])

  const enableCamera = useCallback(async () => {
    const id = ++request.current
    setNotice('')
    setCameraReady(false)
    setCamera('starting')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this window.')
      const active = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' }, audio: false,
      })
      if (id !== request.current) { active.getTracks().forEach(track => track.stop()); return }
      stream.current = active
      setCamera('on')
    } catch (cause) {
      if (id !== request.current) return
      setCamera('off')
      const code = cause instanceof DOMException ? cause.name : ''
      setNotice(code === 'NotAllowedError' ? 'Camera access was denied. Check your Windows camera permissions or choose a photo.'
        : code === 'NotFoundError' ? 'No camera was detected. You can still choose a photo.'
        : code === 'NotReadableError' ? 'The camera couldn’t start. Close other apps using it and try again.'
        : 'The camera couldn’t start. You can still choose a photo.')
    }
  }, [])
  useEffect(() => {
    const starting = window.setTimeout(() => void enableCamera(), 0)
    return () => {
      window.clearTimeout(starting)
      request.current++
      stream.current?.getTracks().forEach(track => track.stop())
    }
  }, [enableCamera])

  function stopCamera() {
    request.current++
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    setCamera('off')
  }
  function loadPhoto(source: CanvasImageSource, width: number, height: number) {
    if (!width || !height) return
    const ratio = Math.min(1, 1600 / Math.max(width, height))
    const snapshot = document.createElement('canvas')
    snapshot.width = Math.max(1, Math.round(width * ratio))
    snapshot.height = Math.max(1, Math.round(height * ratio))
    const ctx = snapshot.getContext('2d')
    if (!ctx) return
    ctx.drawImage(source, 0, 0, snapshot.width, snapshot.height)
    stopCamera()
    setNotice('')
    setPhoto(snapshot)
  }
  async function openPhoto(file?: File) {
    if (!file) return
    if (!imageTypes.includes(file.type) || file.size > 16 * 1024 * 1024) {
      setNotice('Choose a PNG, JPEG, WebP, or GIF up to 16 MB.')
      return
    }
    const id = request.current
    try {
      const image = await createImageBitmap(file)
      try { if (id === request.current) loadPhoto(image, image.width, image.height) }
      finally { image.close() }
    } catch { if (id === request.current) setNotice('This photo could not be opened.') }
  }

  useEffect(() => {
    if (!photo || !canvas.current) return
    const target = canvas.current
    const ctx = target.getContext('2d')
    if (!ctx) return
    const { width, height } = photo
    const unit = Math.min(width, height)
    target.width = width
    target.height = height
    ctx.save()
    ctx.filter = looks[look]
    if (mirror) { ctx.translate(width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(photo, 0, 0)
    ctx.restore()
    if (frames[frame]) {
      ctx.lineWidth = Math.max(2, unit * .065)
      ctx.strokeStyle = frames[frame]
      ctx.strokeRect(0, 0, width, height)
    }
    if (stamp !== 'None') {
      const glyph = stamp === 'Stars' ? '✦' : '♥'
      ctx.fillStyle = stamp === 'Stars' ? '#fff6ba' : '#ffacd8'
      ctx.shadowColor = '#211631'
      ctx.shadowBlur = unit * .025
      ctx.font = `bold ${Math.max(8, unit * .13)}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(glyph, width * .08, height * .06)
      ctx.textAlign = 'right'
      ctx.fillText(glyph, width * .92, height * .76)
    }
  }, [photo, camera, look, frame, stamp, mirror])

  function download() {
    if (!canvas.current) return
    const link = document.createElement('a')
    link.href = canvas.current.toDataURL('image/png')
    link.download = 'elsewhere-photo.png'
    link.click()
  }
  async function useAsProfilePhoto() {
    const key = accountKey(owner)
    const edited = canvas.current
    if (!key || !edited) return
    try {
      const blob = await new Promise<Blob | null>(resolve => edited.toBlob(resolve, 'image/webp', .90))
      if (!blob) throw new Error()
      saveProfilePhoto(key, await prepareProfilePhoto(new File([blob], 'elsewhere-photo.webp', { type: blob.type })))
      setNotice('Your Elsewhere profile picture was updated.')
    } catch { setNotice('Could not save your profile picture.') }
  }

  return <ToolbarDialog title="Photo Studio" skin={skin} onClose={onClose}>
    <div className="ew-studio-stage">
      <video hidden={camera !== 'on'} ref={video} autoPlay playsInline muted onLoadedData={() => setCameraReady(true)} />
      {photo && camera === 'off' && <canvas ref={canvas} aria-label="Edited photo" />}
      {!photo && camera !== 'on' && <span>Take a photo or open one to edit.</span>}
    </div>
    <div className="ew-toolbar-options">
      {camera === 'on' ? <>
        <button type="button" disabled={!cameraReady} onClick={() => {
          const input = video.current
          if (input?.videoWidth) loadPhoto(input, input.videoWidth, input.videoHeight)
        }}>Take Photo</button>
        <button type="button" onClick={stopCamera}>Turn camera off</button>
      </> : <button type="button" disabled={camera === 'starting'} onClick={() => void enableCamera()}>
        {camera === 'starting' ? 'Requesting camera…' : photo ? 'Use Camera Again' : 'Use Camera'}
      </button>}
      <label>Open Photo<input className="ew-studio-file" type="file" accept={imageTypes.join(',')} onChange={event => {
        void openPhoto(event.target.files?.[0])
        event.target.value = ''
      }} /></label>
    </div>
    {photo && camera === 'off' && <>
      <div className="ew-studio-edit">
        <label>Filter<select value={look} onChange={event => setLook(event.target.value as keyof typeof looks)}>
          {Object.keys(looks).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Frame<select value={frame} onChange={event => setFrame(event.target.value as keyof typeof frames)}>
          {Object.keys(frames).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Stickers<select value={stamp} onChange={event => setStamp(event.target.value as typeof stamp)}>
          <option>None</option><option>Hearts</option><option>Stars</option>
        </select></label>
        <label><span><input type="checkbox" checked={mirror} onChange={event => setMirror(event.target.checked)} /> Mirror</span></label>
      </div>
      <div className="ew-toolbar-options">
        <button type="button" onClick={download}>Save Photo</button>
        {owner && <button type="button" onClick={() => void useAsProfilePhoto()}>Set Elsewhere Picture</button>}
      </div>
    </>}
    {notice && <p role="status">{notice}</p>}
  </ToolbarDialog>
}
