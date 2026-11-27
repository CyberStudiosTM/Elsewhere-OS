import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { ACCEPT, addMedia, formatTime, listMedia, mediaBlob, removeMedia, type MediaItem, type MediaKind } from './mediaLibrary'
import { CLASSIC, MUSIC_SKINS, findMusicSkin, type Control, type MusicSkin } from './mediaSkins'
import { VIDEO_SKINS, findVideoSkin, type VideoSkin } from './videoSkins'
import Visualizer from './Visualizer'
import { PLAYER_SKINS_CHANGED, listPlayerSkins, toMusicSkin, toVideoSkin } from './playerSkins'
import './MediaPlayer.css'

// Elsewhere Media Player: one app with Music and Video modes (Cyber, 2026-11-27).
// Songs and videos are copied into a library on this PC; nothing is uploaded or shared.

type Mode = 'music' | 'video'
type Repeat = 'off' | 'all' | 'one'
const PREFS = 'elsewhere.media.prefs.v1'
type Prefs = { mode: Mode; musicSkin: string; videoSkin: string; volume: number; muted: boolean; shuffle: boolean; repeat: Repeat; scale: number; liked: string[] }
const DEFAULTS: Prefs = { mode: 'music', musicSkin: 'bubble', videoSkin: CLASSIC, volume: 0.8, muted: false, shuffle: false, repeat: 'off', scale: 1, liked: [] }
function readPrefs(): Prefs { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) || '{}') } } catch { return DEFAULTS } }

const ICONS: Record<string, ReactNode> = {
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M7 5h4v14H7zM13 5h4v14h-4z" />,
  prev: <path d="M6 5h2v14H6zM9.5 12 19 5v14z" />,
  next: <path d="M16 5h2v14h-2zM14.5 12 5 19V5z" />,
  stop: <path d="M6 6h12v12H6z" />,
  shuffle: <path d="M17 4l3 3-3 3V8h-2.2l-6 8H4v-2h3.8l6-8H17zM4 8h3.8l1.6 2.1-1.2 1.6L6.8 10H4zm11.8 6.4 1.2-1.6L17 14v-2l3 3-3 3v-2h-2.2z" />,
  repeat: <path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z" />,
  library: <path d="M4 6h12v2H4zm0 5h12v2H4zm0 5h8v2H4zm14-2V6h3v2h-1v8.5a2.5 2.5 0 1 1-2-2.45z" />,
  volume: <path d="M4 9v6h4l5 4V5L8 9zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM13 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" />,
  full: <path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z" />,
  rewind: <path d="M11 6v12L3 12zm9 0v12l-8-6z" />,
  forward: <path d="M13 6v12l8-6zM4 6v12l8-6z" />,
  heart: <path d="M12 20s-7-4.4-9-8.6C1.6 8.4 3.6 5 7 5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.4 0 5.4 3.4 4 6.4C19 15.6 12 20 12 20z" />,
}
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">{ICONS[name]}</svg>
}

export default function MediaPlayerApp() {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const update = useCallback((patch: Partial<Prefs>) => setPrefs(current => { const next = { ...current, ...patch }; try { localStorage.setItem(PREFS, JSON.stringify(next)) } catch { /* optional */ } return next }), [])
  const [items, setItems] = useState<MediaItem[]>([])
  const [currentId, setCurrentId] = useState<Record<Mode, string | null>>({ music: null, video: null })
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showLibrary, setShowLibrary] = useState(false)
  const [skinMenu, setSkinMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [full, setFull] = useState(false)
  const [subtitles, setSubtitles] = useState<string | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const subtitleInput = useRef<HTMLInputElement>(null)
  const objectUrl = useRef<string | null>(null)
  const audioGraph = useRef<{ context: AudioContext; analyser: AnalyserNode } | null>(null)
  const shell = useRef<HTMLDivElement>(null)
  // My player skins from SkinMapper, kept in sync when they're saved or worn.
  const [mine, setMine] = useState<{ music: MusicSkin[]; video: VideoSkin[] }>({ music: [], video: [] })
  useEffect(() => {
    let urls: string[] = []
    let alive = true
    const load = () => void listPlayerSkins().then(list => {
      if (!alive) return
      urls.forEach(url => URL.revokeObjectURL(url))
      urls = []
      const art = (blob: Blob) => { const url = URL.createObjectURL(blob); urls.push(url); return url }
      setMine({ music: list.filter(item => item.target === 'music' && item.music).map(item => toMusicSkin(item, art(item.art))), video: list.filter(item => item.target === 'video' && item.video).map(item => toVideoSkin(item, art(item.art))) })
    }).catch(() => {})
    load()
    const changed = (event: StorageEvent) => { if (event.key === PLAYER_SKINS_CHANGED) { load(); setPrefs(readPrefs()) } }
    window.addEventListener('storage', changed)
    return () => { alive = false; window.removeEventListener('storage', changed); urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [])

  const mode = prefs.mode
  const kind: MediaKind = mode === 'music' ? 'audio' : 'video'
  const queue = useMemo(() => items.filter(item => item.kind === kind), [items, kind])
  const current = queue.find(item => item.id === currentId[mode]) || null
  const element = () => (mode === 'music' ? audio.current : video.current)

  useEffect(() => { void listMedia().then(setItems).catch(() => setNotice('Your media library couldn’t be opened.')) }, [])
  useEffect(() => { document.title = current ? `${current.title} · Elsewhere Media Player` : 'Elsewhere Media Player' }, [current])

  // Load the chosen song or video into the right player.
  useEffect(() => {
    const media = element()
    if (!media) return
    let alive = true
    if (!current) { media.removeAttribute('src'); media.load(); setTime(0); setDuration(0); return }
    void mediaBlob(current.id).then(blob => {
      if (!alive || !blob) return
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = URL.createObjectURL(blob)
      media.src = objectUrl.current
      media.load()
      if (playing) void media.play().catch(() => setPlaying(false))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, mode])

  useEffect(() => {
    for (const media of [audio.current, video.current]) if (media) { media.volume = prefs.volume; media.muted = prefs.muted }
  }, [prefs.volume, prefs.muted])

  // Pause the other mode's player when switching.
  useEffect(() => { (mode === 'music' ? video.current : audio.current)?.pause() }, [mode])

  function ensureGraph() {
    if (audioGraph.current || !audio.current) return
    try {
      const context = new AudioContext()
      const source = context.createMediaElementSource(audio.current)
      const node = context.createAnalyser()
      node.fftSize = 256
      node.smoothingTimeConstant = 0.8
      source.connect(node)
      node.connect(context.destination)
      audioGraph.current = { context, analyser: node }
      setAnalyser(node)
    } catch { /* plays without a visualizer */ }
  }

  function playItem(item: MediaItem) {
    setCurrentId(ids => ({ ...ids, [item.kind === 'audio' ? 'music' : 'video']: item.id }))
    setPlaying(true)
    if (item.kind === 'audio') { ensureGraph(); void audioGraph.current?.context.resume() }
    const media = item.kind === 'audio' ? audio.current : video.current
    if (item.id === current?.id && media) void media.play().catch(() => setPlaying(false))
  }
  function toggle() {
    const media = element()
    if (!media) return
    if (!current) { if (queue[0]) playItem(queue[0]); else fileInput.current?.click(); return }
    if (media.paused) {
      if (mode === 'music') { ensureGraph(); void audioGraph.current?.context.resume() }
      void media.play().then(() => setPlaying(true)).catch(() => setNotice('That file couldn’t be played. It may be a format Windows can’t open.'))
    } else { media.pause(); setPlaying(false) }
  }
  function stop() { const media = element(); if (!media) return; media.pause(); media.currentTime = 0; setPlaying(false) }
  function step(direction: 1 | -1) {
    if (!queue.length) return
    const media = element()
    if (direction === -1 && media && media.currentTime > 3) { media.currentTime = 0; return }
    const index = queue.findIndex(item => item.id === current?.id)
    let next: number
    if (prefs.shuffle && queue.length > 1) { do next = Math.floor(Math.random() * queue.length); while (next === index) }
    else next = index + direction
    if (next >= queue.length) { if (prefs.repeat === 'all') next = 0; else { stop(); return } }
    if (next < 0) next = prefs.repeat === 'all' ? queue.length - 1 : 0
    playItem(queue[next])
  }
  function ended() {
    const media = element()
    if (prefs.repeat === 'one' && media) { media.currentTime = 0; void media.play(); return }
    step(1)
  }
  function seek(seconds: number) { const media = element(); if (media && Number.isFinite(seconds)) media.currentTime = Math.max(0, Math.min(duration || 0, seconds)) }
  const like = current && prefs.liked.includes(current.id)

  async function addFiles(files: FileList | File[] | null) {
    if (!files || !('length' in files) || !files.length) return
    setNotice('Adding to your library…')
    const { added, skipped } = await addMedia(Array.from(files))
    setItems(list => [...list, ...added])
    const songs = added.filter(item => item.kind === 'audio').length, videos = added.length - songs
    const parts = [songs && `${songs} song${songs === 1 ? '' : 's'}`, videos && `${videos} video${videos === 1 ? '' : 's'}`].filter(Boolean).join(' and ')
    setNotice([parts && `Added ${parts} ♡`, ...skipped].filter(Boolean).join(' '))
    if (added.length && !current) {
      const first = added.find(item => item.kind === kind) || added[0]
      if (first.kind !== kind) update({ mode: first.kind === 'audio' ? 'music' : 'video' })
      setCurrentId(ids => ({ ...ids, [first.kind === 'audio' ? 'music' : 'video']: first.id }))
    }
  }
  async function remove(item: MediaItem) {
    if (!window.confirm(`Remove “${item.title}” from your Elsewhere library? The original file on your PC isn’t touched.`)) return
    await removeMedia(item.id)
    setItems(list => list.filter(entry => entry.id !== item.id))
    if (item.id === current?.id) { stop(); setCurrentId(ids => ({ ...ids, [mode]: null })) }
  }

  async function loadSubtitles(file: File | undefined) {
    if (!file) return
    let text = await file.text()
    if (/\.srt$/i.test(file.name) || !/^WEBVTT/.test(text.trim())) text = 'WEBVTT\n\n' + text.replace(/\r/g, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')
    if (subtitles) URL.revokeObjectURL(subtitles)
    setSubtitles(URL.createObjectURL(new Blob([text], { type: 'text/vtt' })))
    setNotice('Subtitles on.')
  }
  async function toggleFull() {
    const next = !full
    setFull(next)
    if (isTauri()) await getCurrentWindow().setFullscreen(next).catch(() => {})
    else if (next) await document.documentElement.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  }

  const close = () => { if (isTauri()) void getCurrentWindow().close(); else window.close() }
  const minimize = () => { if (isTauri()) void getCurrentWindow().minimize() }
  const act = (control: Control) => {
    if (control === 'play') toggle()
    else if (control === 'prev') step(-1)
    else if (control === 'next') step(1)
    else if (control === 'stop') stop()
    else if (control === 'shuffle') update({ shuffle: !prefs.shuffle })
    else if (control === 'repeat') update({ repeat: prefs.repeat === 'off' ? 'all' : prefs.repeat === 'all' ? 'one' : 'off' })
    else if (control === 'library') setShowLibrary(open => !open)
    else if (control === 'like' && current) update({ liked: like ? prefs.liked.filter(id => id !== current.id) : [...prefs.liked, current.id] })
    else if (control === 'mute') update({ muted: !prefs.muted })
    else if (control === 'minimize') minimize()
    else if (control === 'close') close()
  }

  // Keyboard: Space play/pause · ←/→ seek · ↑/↓ volume · N/P next/previous.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest?.('input, textarea, select')) return
      if (event.key === ' ') { event.preventDefault(); toggle() }
      else if (event.key === 'ArrowRight') seek(time + 5)
      else if (event.key === 'ArrowLeft') seek(time - 5)
      else if (event.key === 'ArrowUp') update({ volume: Math.min(1, prefs.volume + 0.05), muted: false })
      else if (event.key === 'ArrowDown') update({ volume: Math.max(0, prefs.volume - 0.05) })
      else if (event.key.toLowerCase() === 'n') step(1)
      else if (event.key.toLowerCase() === 'p') step(-1)
      else if (event.key === 'Escape' && full) void toggleFull()
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  // The window hugs the player in Music mode, so shaped skins float on the desktop.
  useEffect(() => {
    if (!isTauri() || mode !== 'music' || !shell.current) return
    const box = shell.current
    const fit = () => { void getCurrentWindow().setSize(new LogicalSize(Math.ceil(box.offsetWidth) + 4, Math.ceil(box.offsetHeight) + 4)).catch(() => {}) }
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    fit()
    return () => observer.disconnect()
  }, [mode, prefs.musicSkin, prefs.scale, showLibrary])

  const musicSkin = findMusicSkin(prefs.musicSkin) || mine.music.find(skin => skin.id === prefs.musicSkin)
  const videoSkin = findVideoSkin(prefs.videoSkin) || mine.video.find(skin => skin.id === prefs.videoSkin)
  const state = { current, playing, time, duration, prefs, like: Boolean(like), analyser }

  const toolbar = <div className="mp-toolbar" role="toolbar" aria-label="Media Player">
    <div className="mp-modes" role="tablist">
      <button type="button" role="tab" aria-selected={mode === 'music'} className={mode === 'music' ? 'is-on' : ''} onClick={() => { update({ mode: 'music' }); setPlaying(false) }}>♫ Music</button>
      <button type="button" role="tab" aria-selected={mode === 'video'} className={mode === 'video' ? 'is-on' : ''} onClick={() => { update({ mode: 'video' }); setPlaying(false) }}>▶ Video</button>
    </div>
    <button type="button" onClick={() => fileInput.current?.click()} title="Add songs or videos from this PC">＋ Add</button>
    <button type="button" aria-pressed={showLibrary} onClick={() => setShowLibrary(open => !open)} title="Library">☰</button>
    <div className="mp-skin-pick">
      <button type="button" aria-expanded={skinMenu} onClick={() => setSkinMenu(open => !open)} title="Skins">🎨 Skins</button>
      {skinMenu && <div className="mp-menu" role="menu">
        {(mode === 'music' ? [{ id: CLASSIC, name: 'Elsewhere Classic' }, ...MUSIC_SKINS, ...mine.music] : [{ id: CLASSIC, name: 'Elsewhere Classic' }, ...VIDEO_SKINS, ...mine.video]).map(skin =>
          <button key={skin.id} type="button" role="menuitemradio" aria-checked={(mode === 'music' ? prefs.musicSkin : prefs.videoSkin) === skin.id}
            onClick={() => { update(mode === 'music' ? { musicSkin: skin.id } : { videoSkin: skin.id }); setSkinMenu(false) }}>
            {(mode === 'music' ? prefs.musicSkin : prefs.videoSkin) === skin.id ? '✓ ' : ''}{skin.name}</button>)}
        {mode === 'music' && <label className="mp-size">Size <select value={prefs.scale} onChange={event => update({ scale: Number(event.target.value) })}>
          {[0.75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label>}
      </div>}
    </div>
    {mode === 'video' && <button type="button" onClick={() => subtitleInput.current?.click()} disabled={!current} title="Add subtitles (.vtt or .srt)">CC</button>}
    <span className="mp-toolbar-drag" data-tauri-drag-region />
    <button type="button" onClick={minimize} title="Minimize" aria-label="Minimize">–</button>
    <button type="button" onClick={close} title="Close" aria-label="Close" className="mp-x">×</button>
  </div>

  return <div className={'mp-app' + (dragOver ? ' is-drop' : '') + (full ? ' is-full' : '')} onPointerDown={() => setSkinMenu(false)}
    onDragOver={event => { event.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
    onDrop={event => { event.preventDefault(); setDragOver(false); void addFiles(event.dataTransfer.files) }}>
    <div ref={shell} className={'mp-shell is-' + mode} onPointerDown={event => event.stopPropagation()}>
      {!full && toolbar}
      {mode === 'music'
        ? (musicSkin ? <SkinnedMusic skin={musicSkin} scale={prefs.scale} state={state} act={act} seek={seek} setVolume={volume => update({ volume, muted: false })} />
          : <ClassicMusic state={state} act={act} seek={seek} setVolume={volume => update({ volume, muted: false })} onAdd={() => fileInput.current?.click()} />)
        : <VideoPlayer skin={videoSkin} state={state} act={act} seek={seek} setVolume={volume => update({ volume, muted: false })} queue={queue}
          onPick={playItem} full={full} onFull={() => void toggleFull()} onAdd={() => fileInput.current?.click()} video={video} subtitles={subtitles}
          onEnded={ended} onTime={setTime} onDuration={setDuration} onPlaying={setPlaying} />}
      {showLibrary && !full && <Library items={queue} kind={kind} current={current} playing={playing} onPick={playItem} onRemove={item => void remove(item)} onAdd={() => fileInput.current?.click()} liked={prefs.liked} />}
      {notice && !full && <div className="mp-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
    </div>
    <audio ref={audio} preload="metadata" onEnded={ended} onTimeUpdate={event => mode === 'music' && setTime(event.currentTarget.currentTime)}
      onLoadedMetadata={event => mode === 'music' && setDuration(event.currentTarget.duration)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onError={() => current && mode === 'music' && setNotice('That song couldn’t be played. It may be a format Windows can’t open.')} />
    <input ref={fileInput} type="file" hidden multiple accept={ACCEPT} onChange={event => { void addFiles(event.target.files); event.target.value = '' }} />
    <input ref={subtitleInput} type="file" hidden accept=".vtt,.srt,text/vtt" onChange={event => { void loadSubtitles(event.target.files?.[0]); event.target.value = '' }} />
  </div>
}

type PlayerState = { current: MediaItem | null; playing: boolean; time: number; duration: number; prefs: Prefs; like: boolean; analyser: AnalyserNode | null }

function useCover(item: MediaItem | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!item?.cover) { setUrl(null); return }
    const made = URL.createObjectURL(item.cover)
    setUrl(made)
    return () => URL.revokeObjectURL(made)
  }, [item?.id, item?.cover])
  return url
}
function Cover({ item, className }: { item: MediaItem | null; className?: string }) {
  const url = useCover(item)
  return <span className={'mp-cover ' + (className || '')} style={url ? { backgroundImage: `url("${url}")` } : undefined} aria-hidden="true">{!url && '♫'}</span>
}
function Seek({ state, seek, className }: { state: PlayerState; seek: (s: number) => void; className?: string }) {
  return <input type="range" className={'mp-seek ' + (className || '')} min={0} max={Math.max(1, state.duration || 0)} step={0.1} value={Math.min(state.time, state.duration || 0)}
    onChange={event => seek(Number(event.target.value))} aria-label="Seek" style={{ '--mp-progress': `${state.duration ? (state.time / state.duration) * 100 : 0}%` } as CSSProperties} />
}

function SkinnedMusic({ skin, scale, state, act, seek, setVolume }: { skin: MusicSkin; scale: number; state: PlayerState; act: (c: Control) => void; seek: (s: number) => void; setVolume: (v: number) => void }) {
  const s = scale
  const box = (b: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: b.x * s, top: b.y * s, width: b.w * s, height: b.h * s })
  const { current, playing, time, duration, prefs } = state
  const d = skin.display
  return <div className={'mp-skin is-' + skin.id + (playing ? ' is-playing' : '')} style={{ width: skin.width * s, height: skin.height * s, '--mp-accent': skin.accent, '--s': s } as CSSProperties}
    onWheel={event => setVolume(Math.max(0, Math.min(1, prefs.volume - Math.sign(event.deltaY) * 0.05)))}>
    {skin.visualizer.behind && <Visualizer className="mp-viz is-behind" analyser={state.analyser} playing={playing} style={skin.visualizer.style} accent={skin.accent} />}
    <img className="mp-art" src={skin.art} alt="" draggable={false} data-tauri-drag-region />
    {skin.spin && <span className="mp-spin" aria-hidden="true" style={{ left: (skin.spin.x - skin.spin.rx) * s, top: (skin.spin.y - skin.spin.ry) * s, width: skin.spin.rx * 2 * s, height: skin.spin.ry * 2 * s }} />}
    <div className={'mp-display is-' + d.style} style={{ ...box(d), borderRadius: d.radius * s, fontSize: 12 * s }} data-tauri-drag-region>
      <Cover item={current} />
      <div className="mp-meta">
        <strong>{current?.title || 'Elsewhere'}</strong>
        <small>{current ? current.artist || 'Unknown artist' : 'Add songs with ＋ Add'}</small>
        <span className="mp-time">{playing ? '▶' : '❚❚'} {formatTime(time)} / {formatTime(duration || current?.duration)}</span>
        <Seek state={state} seek={seek} />
      </div>
    </div>
    {!skin.visualizer.behind && <Visualizer className="mp-viz" analyser={state.analyser} playing={playing} style={skin.visualizer.style} accent={skin.accent} />}
    <style>{`.mp-skin.is-${skin.id} .mp-viz { left: ${skin.visualizer.x * s}px; top: ${skin.visualizer.y * s}px; width: ${skin.visualizer.w * s}px; height: ${skin.visualizer.h * s}px; }`}</style>
    {skin.hotspots.map(spot => {
      const active = (spot.control === 'shuffle' && prefs.shuffle) || (spot.control === 'repeat' && prefs.repeat !== 'off') || (spot.control === 'mute' && prefs.muted) || (spot.control === 'like' && state.like)
      const label = spot.control === 'play' ? (playing ? 'Pause' : 'Play') : spot.control === 'repeat' ? `Repeat: ${prefs.repeat}` : spot.control[0].toUpperCase() + spot.control.slice(1)
      return <button key={spot.control} type="button" className={'mp-hot is-' + spot.control + (active ? ' is-active' : '')} aria-label={label} title={label}
        style={{ left: (spot.x - spot.r) * s, top: (spot.y - spot.r) * s, width: spot.r * 2 * s, height: spot.r * 2 * s }} onClick={() => act(spot.control)}>
        {spot.control === 'play' && <span className="mp-play-face"><Icon name={playing ? 'pause' : 'play'} size={spot.r * 1.05 * s} /></span>}
        {spot.control === 'repeat' && prefs.repeat === 'one' && <span className="mp-one">1</span>}
      </button>
    })}
    {skin.volume && <input type="range" className="mp-art-volume" min={0} max={1} step={0.01} value={prefs.muted ? 0 : prefs.volume} aria-label="Volume"
      onChange={event => setVolume(Number(event.target.value))} style={{ left: skin.volume.x * s, top: (skin.volume.y - 8) * s, width: skin.volume.w * s, height: 16 * s }} />}
    {!skin.hotspots.some(spot => spot.control === 'close') && <div className="mp-chips"><button type="button" onClick={() => act('minimize')} aria-label="Minimize">–</button><button type="button" onClick={() => act('close')} aria-label="Close">×</button></div>}
  </div>
}

function Controls({ state, act, setVolume, extra }: { state: PlayerState; act: (c: Control) => void; setVolume: (v: number) => void; extra?: ReactNode }) {
  const { playing, prefs } = state
  return <div className="mp-controls">
    <button type="button" className={'mp-btn is-small' + (prefs.shuffle ? ' is-active' : '')} onClick={() => act('shuffle')} aria-label="Shuffle" title="Shuffle"><Icon name="shuffle" /></button>
    <button type="button" className="mp-btn" onClick={() => act('stop')} aria-label="Stop" title="Stop"><Icon name="stop" /></button>
    <button type="button" className="mp-btn" onClick={() => act('prev')} aria-label="Previous" title="Previous"><Icon name="prev" /></button>
    <button type="button" className="mp-btn is-play" onClick={() => act('play')} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={26} /></button>
    <button type="button" className="mp-btn" onClick={() => act('next')} aria-label="Next" title="Next"><Icon name="next" /></button>
    <button type="button" className={'mp-btn is-small' + (prefs.repeat !== 'off' ? ' is-active' : '')} onClick={() => act('repeat')} aria-label={`Repeat: ${prefs.repeat}`} title={`Repeat: ${prefs.repeat}`}>
      <Icon name="repeat" />{prefs.repeat === 'one' && <span className="mp-one">1</span>}</button>
    <span className="mp-volume">
      <button type="button" className="mp-btn is-small" onClick={() => act('mute')} aria-label={prefs.muted ? 'Unmute' : 'Mute'}><Icon name={prefs.muted ? 'mute' : 'volume'} /></button>
      <input type="range" min={0} max={1} step={0.01} value={prefs.muted ? 0 : prefs.volume} onChange={event => setVolume(Number(event.target.value))} aria-label="Volume"
        style={{ '--mp-progress': `${(prefs.muted ? 0 : prefs.volume) * 100}%` } as CSSProperties} />
    </span>
    {extra}
  </div>
}

function ClassicMusic({ state, act, seek, setVolume, onAdd }: { state: PlayerState; act: (c: Control) => void; seek: (s: number) => void; setVolume: (v: number) => void; onAdd: () => void }) {
  const { current, playing, time, duration } = state
  return <div className="mp-classic">
    <div className="mp-classic-title" data-tauri-drag-region><span aria-hidden="true">🦋</span> Elsewhere Media Player</div>
    <div className="mp-classic-body">
      <Cover item={current} className="is-big" />
      <div className="mp-meta">
        <strong>{current?.title || 'Your music lives here ♡'}</strong>
        <small>{current ? [current.artist, current.album].filter(Boolean).join(' · ') || 'Unknown artist' : <button type="button" className="mp-link" onClick={onAdd}>Add songs from this PC</button>}</small>
        <Visualizer className="mp-viz is-inline" analyser={state.analyser} playing={playing} style="bars" accent="#7fe0ff" />
        <div className="mp-timeline"><span>{formatTime(time)}</span><Seek state={state} seek={seek} /><span>{formatTime(duration || current?.duration)}</span></div>
      </div>
    </div>
    <Controls state={state} act={act} setVolume={setVolume} extra={<button type="button" className={'mp-btn is-small' + (state.like ? ' is-active' : '')} onClick={() => act('like')} disabled={!current} aria-label="Like" title="Like"><Icon name="heart" /></button>} />
  </div>
}

function VideoPlayer({ skin, state, act, seek, setVolume, queue, onPick, full, onFull, onAdd, video, subtitles, onEnded, onTime, onDuration, onPlaying }: {
  skin?: VideoSkin; state: PlayerState; act: (c: Control) => void; seek: (s: number) => void; setVolume: (v: number) => void; queue: MediaItem[]; onPick: (item: MediaItem) => void
  full: boolean; onFull: () => void; onAdd: () => void; video: React.RefObject<HTMLVideoElement | null>; subtitles: string | null
  onEnded: () => void; onTime: (t: number) => void; onDuration: (d: number) => void; onPlaying: (p: boolean) => void
}) {
  const { current, time, duration } = state
  const [tab, setTab] = useState<'playlist' | 'library'>('playlist')
  const pct = (value: number, of: number) => `${(value / of) * 100}%`
  const placed: CSSProperties | undefined = skin && !full
    ? { left: pct(skin.window.x, skin.width), top: pct(skin.window.y, skin.height), width: pct(skin.window.w, skin.width), height: pct(skin.window.h, skin.height) }
    : undefined
  return <div className={'mp-video' + (skin ? ' is-' + skin.id : ' is-classic') + (full ? ' is-full' : '')}
    style={skin ? { '--mp-accent': skin.accent, '--ar': String(skin.width / skin.height) } as CSSProperties : undefined}>
    {skin && !full && <img className="mp-video-frame" src={skin.art} alt="" draggable={false} data-tauri-drag-region />}
    <div className="mp-video-window" style={placed}>
      {!full && <div className="mp-video-title" data-tauri-drag-region><span aria-hidden="true">{skin?.icon || '🎬'}</span> {current ? current.title : 'Elsewhere Video Player'}</div>}
      <div className="mp-video-main">
        <div className="mp-screen" onDoubleClick={onFull} onClick={() => act('play')}>
          <video ref={video} preload="metadata" playsInline onEnded={onEnded} onTimeUpdate={event => onTime(event.currentTarget.currentTime)}
            onLoadedMetadata={event => onDuration(event.currentTarget.duration)} onPlay={() => onPlaying(true)} onPause={() => onPlaying(false)}>
            {subtitles && <track kind="subtitles" src={subtitles} default label="Subtitles" />}
          </video>
          {!current && <button type="button" className="mp-empty" onClick={event => { event.stopPropagation(); onAdd() }}>▶ Add a video (MP4 or WebM)</button>}
        </div>
        {!full && <aside className="mp-video-list">
          <div className="mp-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'playlist'} className={tab === 'playlist' ? 'is-on' : ''} onClick={() => setTab('playlist')}>🎞 Playlist</button>
            <button type="button" role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'is-on' : ''} onClick={() => setTab('library')}>📁 Library</button>
          </div>
          {!queue.length ? <p className="mp-hint">No videos yet. <button type="button" className="mp-link" onClick={onAdd}>Add some</button></p>
            : <ol className="mp-rows">{(tab === 'playlist' ? queue : [...queue].sort((a, b) => a.title.localeCompare(b.title))).map(item =>
              <li key={item.id}><button type="button" className={item.id === current?.id ? 'is-on' : ''} onClick={() => onPick(item)}>
                <span className="mp-thumb" aria-hidden="true">▶</span><span>{item.title}</span><small>{formatTime(item.duration)}</small></button></li>)}</ol>}
        </aside>}
      </div>
      <div className="mp-timeline"><span>{formatTime(time)} / {formatTime(duration || current?.duration)}</span><Seek state={state} seek={seek} /></div>
      <Controls state={state} act={act} setVolume={setVolume} extra={<button type="button" className="mp-btn is-small" onClick={onFull} aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen (Esc)' : 'Full screen'}><Icon name="full" /></button>} />
    </div>
  </div>
}

function Library({ items, kind, current, playing, onPick, onRemove, onAdd, liked }: {
  items: MediaItem[]; kind: MediaKind; current: MediaItem | null; playing: boolean; onPick: (item: MediaItem) => void; onRemove: (item: MediaItem) => void; onAdd: () => void; liked: string[]
}) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const shown = items.filter(item => !term || (item.title + ' ' + (item.artist || '') + ' ' + (item.album || '')).toLowerCase().includes(term))
  return <section className="mp-library" aria-label="Library">
    <div className="mp-library-head">
      <strong>{kind === 'audio' ? '♫ My Music' : '▶ My Videos'} <small>({items.length})</small></strong>
      <input type="search" placeholder="Search" aria-label="Search library" value={search} onChange={event => setSearch(event.target.value)} />
      <button type="button" onClick={onAdd}>＋ Add</button>
    </div>
    {!items.length ? <p className="mp-hint">Drag {kind === 'audio' ? 'MP3s' : 'MP4s'} here, or press ＋ Add. They’re copied into Elsewhere on this PC and never uploaded.</p>
      : <ol className="mp-rows">{shown.map(item => <li key={item.id}>
        <button type="button" className={item.id === current?.id ? 'is-on' : ''} onClick={() => onPick(item)}>
          <span className="mp-row-state" aria-hidden="true">{item.id === current?.id ? (playing ? '▶' : '❚❚') : liked.includes(item.id) ? '♥' : '♪'}</span>
          <span>{item.title}{item.artist && <small> · {item.artist}</small>}</span>
          <small>{formatTime(item.duration)}</small>
        </button>
        <button type="button" className="mp-row-x" onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`} title="Remove from library">×</button>
      </li>)}</ol>}
  </section>
}
