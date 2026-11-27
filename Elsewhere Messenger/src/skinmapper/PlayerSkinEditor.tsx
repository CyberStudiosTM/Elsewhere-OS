import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { MUSIC_SKINS, type Control, type DisplayStyle } from '../media/mediaSkins'
import { VIDEO_SKINS } from '../media/videoSkins'
import {
  ALL_CONTROLS, CONTROL_NAMES, REQUIRED_CONTROLS, announcePlayerSkins, checkPlayerSkin, exportPlayerSkin, fromTemplate, replaceArt, savePlayerSkin,
  type PlayerSkinRecord, type PlayerTarget,
} from '../media/playerSkins'

// SkinMapper · Media Player skins. Start from a layout template (Cyber's five official players),
// swap in your own art, then drag the song display, visualizer and every control into place.

type Part = { kind: 'display' } | { kind: 'visualizer' } | { kind: 'window' } | { kind: 'control'; control: Control } | { kind: 'volume' }
const same = (a: Part | null, b: Part) => !!a && a.kind === b.kind && (a.kind !== 'control' || (b.kind === 'control' && a.control === b.control))

export function PlayerTemplatePicker({ onOpen, onBack }: { onOpen: (record: PlayerSkinRecord) => void; onBack: () => void }) {
  const [target, setTarget] = useState<PlayerTarget>('music')
  const [template, setTemplate] = useState('bubble')
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState('')
  const list = target === 'music' ? MUSIC_SKINS : VIDEO_SKINS
  return <form className="sm-quick sm-player-pick" onSubmit={event => {
    event.preventDefault()
    void fromTemplate(target, template, name, author).then(onOpen, cause => setError(cause instanceof Error ? cause.message : String(cause)))
  }}>
    <div className="sm-picker-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={target === 'music'} className={target === 'music' ? 'is-active' : ''} onClick={() => setTarget('music')}>♫ Music player</button>
      <button type="button" role="tab" aria-selected={target === 'video'} className={target === 'video' ? 'is-active' : ''} onClick={() => setTarget('video')}>▶ Video player</button>
    </div>
    <fieldset><legend>Layout template</legend>
      <div className="sm-template-grid">
        {list.map(skin => <label key={skin.id} className={'sm-template' + (template === skin.id ? ' is-active' : '')}>
          <input type="radio" name="template" checked={template === skin.id} onChange={() => setTemplate(skin.id)} />
          <img src={skin.art} alt="" /><span>{skin.name}</span></label>)}
      </div>
      <p className="sm-hint">You’ll swap in your own art and move every part. The template just gives you a head start.</p>
    </fieldset>
    <label className="sm-field">Skin name<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="My Player" /></label>
    <label className="sm-field">Made by<input value={author} maxLength={80} onChange={event => setAuthor(event.target.value)} placeholder="your name or handle" /></label>
    {error && <p className="sm-error-note" role="alert">{error}</p>}
    <div className="sm-actions"><button type="button" onClick={onBack}>Back</button><button type="submit" className="sm-app-primary">Start designing</button></div>
  </form>
}

export default function PlayerSkinEditor({ initial, onClose }: { initial: PlayerSkinRecord; onClose: () => void }) {
  const [skin, setSkin] = useState(initial)
  const [past, setPast] = useState<PlayerSkinRecord[]>([])
  const [part, setPart] = useState<Part | null>(initial.target === 'music' ? { kind: 'display' } : { kind: 'window' })
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const artInput = useRef<HTMLInputElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [stageWidth, setStageWidth] = useState(700)
  const art = useMemo(() => URL.createObjectURL(skin.art), [skin.art])
  useEffect(() => () => URL.revokeObjectURL(art), [art])
  useEffect(() => {
    const box = stage.current
    if (!box) return
    const observer = new ResizeObserver(() => setStageWidth(box.clientWidth))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(2, Math.max(0.4, (stageWidth - 40) / skin.width))
  const problems = checkPlayerSkin(skin)

  const change = (next: PlayerSkinRecord, history = true) => { if (history) setPast(list => [...list.slice(-49), skin]); setSkin(next); setDirty(true) }
  const music = skin.music, video = skin.video
  const setMusic = (patch: Partial<NonNullable<PlayerSkinRecord['music']>>, history = true) => music && change({ ...skin, music: { ...music, ...patch } }, history)

  // Dragging parts on the preview (move; Shift or the corner handle resizes).
  const drag = useRef<{ part: Part; mode: 'move' | 'size'; x: number; y: number; start: PlayerSkinRecord } | null>(null)
  function begin(event: PointerEvent, target: Part, mode: 'move' | 'size' = 'move') {
    event.stopPropagation(); event.preventDefault()
    setPart(target)
    drag.current = { part: target, mode: event.shiftKey ? 'size' : mode, x: event.clientX, y: event.clientY, start: skin }
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  function move(event: PointerEvent) {
    const state = drag.current
    if (!state) return
    const dx = Math.round((event.clientX - state.x) / scale), dy = Math.round((event.clientY - state.y) / scale)
    const s = state.start
    const clampX = (v: number) => Math.max(0, Math.min(s.width, v)), clampY = (v: number) => Math.max(0, Math.min(s.height, v))
    const p = state.part
    if (p.kind === 'window' && s.video) {
      const w = s.video.window
      const window = state.mode === 'size' ? { ...w, w: Math.max(240, w.w + dx), h: Math.max(160, w.h + dy) } : { ...w, x: clampX(w.x + dx), y: clampY(w.y + dy) }
      setSkin({ ...s, video: { ...s.video, window } })
    } else if (s.music) {
      const m = s.music
      if (p.kind === 'display' || p.kind === 'visualizer') {
        const b = m[p.kind]
        const next = state.mode === 'size' ? { ...b, w: Math.max(30, b.w + dx), h: Math.max(16, b.h + dy) } : { ...b, x: clampX(b.x + dx), y: clampY(b.y + dy) }
        setSkin({ ...s, music: { ...m, [p.kind]: next } })
      } else if (p.kind === 'volume' && m.volume) setSkin({ ...s, music: { ...m, volume: { ...m.volume, x: clampX(m.volume.x + dx), y: clampY(m.volume.y + dy) } } })
      else if (p.kind === 'control') {
        setSkin({ ...s, music: { ...m, hotspots: m.hotspots.map(spot => spot.control !== p.control ? spot
          : state.mode === 'size' ? { ...spot, r: Math.max(8, Math.min(120, spot.r + Math.round((dx + dy) / 2))) } : { ...spot, x: clampX(spot.x + dx), y: clampY(spot.y + dy) }) } })
      }
    }
  }
  function end() {
    const state = drag.current
    drag.current = null
    if (state && state.start !== skin) { setPast(list => [...list.slice(-49), state.start]); setDirty(true) }
  }

  async function save(wear = false) {
    if (problems.length) { setNotice('Fix the problems listed under Check before saving.'); return }
    try {
      await savePlayerSkin(skin); announcePlayerSkins(); setDirty(false)
      if (wear) {
        const key = 'elsewhere.media.prefs.v1'
        const prefs = JSON.parse(localStorage.getItem(key) || '{}')
        localStorage.setItem(key, JSON.stringify({ ...prefs, mode: skin.target, [skin.target === 'music' ? 'musicSkin' : 'videoSkin']: 'custom:' + skin.id }))
        announcePlayerSkins()
        setNotice('Saved and worn ♡ Open the Media Player (Activities → Media Player) to see it.')
      } else setNotice('Saved to My Player Skins on this PC. Pick it in the Media Player’s 🎨 Skins menu.')
    } catch (cause) { setNotice((cause instanceof Error ? cause.message : 'Saving failed.') + ' Your work is still open.') }
  }
  async function exportSkin() {
    if (problems.length) { setNotice('Fix the problems listed under Check before exporting.'); return }
    try {
      const result = await exportPlayerSkin(skin)
      if (!result.check.ok) { setNotice('The package didn’t pass the install check: ' + (result.check.findings.find(item => item.severity === 'error')?.message || 'unknown problem')); return }
      const url = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: 'application/zip' }))
      const link = document.createElement('a'); link.href = url; link.download = result.fileName; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      setNotice(`Exported ${result.fileName} to your Downloads folder.`)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Export failed.') }
  }

  const px = (v: number) => v * scale
  const selectedSpot = part?.kind === 'control' ? music?.hotspots.find(spot => spot.control === part.control) : undefined
  const missing = ALL_CONTROLS.filter(control => !music?.hotspots.some(spot => spot.control === control))

  return <div className="sm-app sm-player-editor">
    <div className="sm-app-titlebar" data-tauri-drag-region>
      <span data-tauri-drag-region>{skin.name}{dirty ? ' •' : ''} · {skin.target === 'music' ? 'Music' : 'Video'} Player skin · Elsewhere SkinMapper</span>
      <button type="button" className="sm-app-close" onClick={() => { if (!dirty || window.confirm('Leave without saving?')) onClose() }} aria-label="Back to SkinMapper">×</button>
    </div>
    <div className="sm-app-menubar">
      <div className="sm-app-quick">
        <button type="button" onClick={() => { if (past.length) { setSkin(past[past.length - 1]); setPast(list => list.slice(0, -1)); setDirty(true) } }} disabled={!past.length}>↶ Undo</button>
        <button type="button" onClick={() => artInput.current?.click()}>🖼️ Replace art…</button>
        <button type="button" onClick={() => void save()}>💾 Save</button>
        <button type="button" onClick={() => void save(true)}>✨ Save &amp; wear</button>
        <button type="button" className="sm-app-primary" onClick={() => void exportSkin()}>Export .eskin</button>
      </div>
    </div>
    <div className="sm-player-body">
      <nav className="sm-explorer" aria-label="Player parts">
        <strong>Parts</strong>
        {skin.target === 'video' ? <button type="button" className={same(part, { kind: 'window' }) ? 'is-active' : ''} onClick={() => setPart({ kind: 'window' })}>Video window</button> : <>
          <button type="button" className={same(part, { kind: 'display' }) ? 'is-active' : ''} onClick={() => setPart({ kind: 'display' })}>Song display</button>
          <button type="button" className={same(part, { kind: 'visualizer' }) ? 'is-active' : ''} onClick={() => setPart({ kind: 'visualizer' })}>Visualizer</button>
          {music?.volume && <button type="button" className={same(part, { kind: 'volume' }) ? 'is-active' : ''} onClick={() => setPart({ kind: 'volume' })}>Volume slider</button>}
          <strong>Controls</strong>
          {music?.hotspots.map(spot => <button key={spot.control} type="button" className={same(part, { kind: 'control', control: spot.control }) ? 'is-active' : ''}
            onClick={() => setPart({ kind: 'control', control: spot.control })}>{CONTROL_NAMES[spot.control]}</button>)}
          {missing.length > 0 && <label className="sm-field">Add a control
            <select value="" onChange={event => {
              const control = event.target.value as Control
              if (!control || !music) return
              setMusic({ hotspots: [...music.hotspots, { control, x: Math.round(skin.width / 2), y: Math.round(skin.height / 2), r: 16 }] })
              setPart({ kind: 'control', control })
            }}><option value="">Choose…</option>{missing.map(control => <option key={control} value={control}>{CONTROL_NAMES[control]}</option>)}</select></label>}
        </>}
      </nav>
      <main className="sm-stage">
        <div ref={stage} className="sm-player-stage" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <div className="sm-player-art" style={{ width: px(skin.width), height: px(skin.height) }}>
            <img src={art} alt="" draggable={false} />
            {video && <div className={'sm-part is-window' + (same(part, { kind: 'window' }) ? ' is-picked' : '')} style={{ left: px(video.window.x), top: px(video.window.y), width: px(video.window.w), height: px(video.window.h) }}
              onPointerDown={event => begin(event, { kind: 'window' })}><span>Video window</span><i onPointerDown={event => begin(event, { kind: 'window' }, 'size')} /></div>}
            {music && (['display', 'visualizer'] as const).map(kind => <div key={kind} className={'sm-part is-' + kind + (same(part, { kind }) ? ' is-picked' : '')}
              style={{ left: px(music[kind].x), top: px(music[kind].y), width: px(music[kind].w), height: px(music[kind].h), borderRadius: kind === 'display' ? px(music.display.radius) : 6 }}
              onPointerDown={event => begin(event, { kind })}><span>{kind === 'display' ? 'Song display' : 'Visualizer'}</span><i onPointerDown={event => begin(event, { kind }, 'size')} /></div>)}
            {music?.volume && <div className={'sm-part is-volume' + (same(part, { kind: 'volume' }) ? ' is-picked' : '')} style={{ left: px(music.volume.x), top: px(music.volume.y - 7), width: px(music.volume.w), height: px(14) }}
              onPointerDown={event => begin(event, { kind: 'volume' })} title="Volume slider" />}
            {music?.hotspots.map(spot => <div key={spot.control} className={'sm-part is-control' + (same(part, { kind: 'control', control: spot.control }) ? ' is-picked' : '')}
              style={{ left: px(spot.x - spot.r), top: px(spot.y - spot.r), width: px(spot.r * 2), height: px(spot.r * 2) } as CSSProperties}
              onPointerDown={event => begin(event, { kind: 'control', control: spot.control })} title={CONTROL_NAMES[spot.control]}>
              <span>{CONTROL_NAMES[spot.control].split(' ')[0]}</span></div>)}
          </div>
        </div>
        <p className="sm-hint">Drag a part to move it. Drag its corner (or hold Shift while dragging) to resize. Controls always stay clickable on the real player.</p>
      </main>
      <aside className="sm-inspector" aria-label="Properties">
        <label className="sm-field">Skin name<input value={skin.name} maxLength={60} onChange={event => change({ ...skin, name: event.target.value }, false)} /></label>
        <label className="sm-field">Made by<input value={skin.author} maxLength={80} onChange={event => change({ ...skin, author: event.target.value }, false)} /></label>
        <label className="sm-field">Glow color<input type="color" value={(music || video)!.accent} onChange={event => music ? setMusic({ accent: event.target.value }, false) : video && change({ ...skin, video: { ...video, accent: event.target.value } }, false)} /></label>
        {music && <>
          <label className="sm-field">Song display style<select value={music.display.style} onChange={event => setMusic({ display: { ...music.display, style: event.target.value as DisplayStyle } })}>
            <option value="stack">Stacked (cover on top)</option><option value="row">Side by side</option><option value="lcd">LCD screen</option></select></label>
          <label className="sm-field">Visualizer<select value={music.visualizer.style} onChange={event => setMusic({ visualizer: { ...music.visualizer, style: event.target.value as 'bars' | 'wave' | 'bubbles' } })}>
            <option value="bars">Bars</option><option value="wave">Wave</option><option value="bubbles">Bubbles</option></select></label>
          <label className="sm-check"><input type="checkbox" checked={Boolean(music.visualizer.behind)} onChange={event => setMusic({ visualizer: { ...music.visualizer, behind: event.target.checked } })} /> Visualizer behind the art</label>
          <label className="sm-check"><input type="checkbox" checked={Boolean(music.spin)} onChange={event => setMusic({ spin: event.target.checked ? { x: Math.round(skin.width / 2), y: Math.round(skin.height / 3), rx: Math.round(skin.width / 4), ry: Math.round(skin.height / 8) } : undefined })} /> Spinning shine while playing</label>
        </>}
        {part && <div className="sm-decor-edit">
          <strong>{part.kind === 'control' ? CONTROL_NAMES[part.control] : part.kind === 'display' ? 'Song display' : part.kind === 'visualizer' ? 'Visualizer' : part.kind === 'window' ? 'Video window' : 'Volume slider'}</strong>
          {selectedSpot && <>
            <div className="sm-row-fields">
              <label>X<input type="number" value={selectedSpot.x} onChange={event => setMusic({ hotspots: music!.hotspots.map(spot => spot === selectedSpot ? { ...spot, x: Number(event.target.value) } : spot) })} /></label>
              <label>Y<input type="number" value={selectedSpot.y} onChange={event => setMusic({ hotspots: music!.hotspots.map(spot => spot === selectedSpot ? { ...spot, y: Number(event.target.value) } : spot) })} /></label>
              <label>Size<input type="number" min={8} max={120} value={selectedSpot.r} onChange={event => setMusic({ hotspots: music!.hotspots.map(spot => spot === selectedSpot ? { ...spot, r: Number(event.target.value) } : spot) })} /></label>
            </div>
            {REQUIRED_CONTROLS.includes(selectedSpot.control) ? <p className="sm-hint">Every player keeps this control.</p>
              : <button type="button" className="sm-danger" onClick={() => { setMusic({ hotspots: music!.hotspots.filter(spot => spot !== selectedSpot) }); setPart({ kind: 'display' }) }}>Remove this control</button>}
          </>}
        </div>}
        <div className="sm-findings"><strong>Check</strong>
          {!problems.length ? <p className="sm-hint">✓ Ready to save and share.</p> : problems.map(problem => <p key={problem} className="is-error">⛔ {problem}</p>)}</div>
        {notice && <p className="sm-hint" role="status">{notice}</p>}
      </aside>
    </div>
    <input ref={artInput} type="file" hidden accept="image/png,image/webp,image/jpeg,image/gif" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (file) void replaceArt(skin, file).then(next => { change(next); setNotice('New art in ♡ Parts were moved to match its size; drag them into place.') }, cause => setNotice(cause instanceof Error ? cause.message : String(cause)))
    }} />
  </div>
}
