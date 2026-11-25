import { useEffect, useMemo, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { compileTheme, declarationsToCss, nineSliceCss } from './compileTheme'
import { contrastFindings } from './contrast'
import MappedPreview, { type PreviewState, type PreviewWindow } from './MappedPreview'
import { loadSkinPackage } from './packageLoader'
import {
  SLOTS, SLOT_INDEX, resetProperty, resolve, validateManifest, validateTheme,
  type AssetRef, type Finding, type ScaleMode, type SkinTheme, type SlotStyle, type StyleProperty, type VisualState,
} from './schema'
import {
  ASSET_FOLDERS, TEMPLATES, deleteSkinProject, exportPackage, importAsset, listSkinProjects, makePatternAsset, newProject, newStarterProject, projectFromPackage,
  saveSkinProject, type AssetFolder, type ProjectAsset, type SkinProject,
} from './skinProject'
import SliceEditor from './SliceEditor'
import { PATTERNS, type PatternKind } from './patterns'
import { SKIN_FAMILIES, STARTER_SKINS } from './stationerySkins'
import './SkinMapper.css'

// SkinMapper editor (Phase 5 core): Welcome Hub + four-zone workspace.
// Left: SkinMap Explorer · Center: Live Preview (simulated) · Right: Properties · Bottom: Asset Tray.

const REGIONS: Record<number, string> = {
  1: 'Window chrome', 2: 'Profile', 3: 'Buddy toolbar', 4: 'Service filter', 5: 'Contact panel', 6: 'Group headings',
  7: 'Contact rows', 8: 'Menus', 9: 'Conversation', 10: 'Sign-in', 11: 'Dialogs', 12: 'Notifications',
}
const FONTS = ['Tahoma', 'Verdana', 'Segoe UI', 'Arial', 'Trebuchet MS', 'Georgia', 'Courier New', 'Comic Sans MS', 'Segoe Print', 'Lucida Console']
const LABELS: Partial<Record<StyleProperty, string>> = {
  background: 'Background', backgroundImage: 'Background image', textColor: 'Text color', mutedTextColor: 'Secondary text color',
  accentColor: 'Accent color', borderColor: 'Border color', borderWidth: 'Border width', borderRadius: 'Corner roundness', shadow: 'Shadow',
  opacity: 'Opacity', fontFamily: 'Font', fontSize: 'Text size', fontWeight: 'Text weight', textShadow: 'Text shadow', padding: 'Inside spacing',
  gap: 'Spacing between items', icon: 'Icon image',
}
type Mode = 'simple' | 'designer' | 'advanced'

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export default function SkinMapperApp() {
  const [project, setProject] = useState<SkinProject | null>(null)
  const [past, setPast] = useState<SkinTheme[]>([])
  const [future, setFuture] = useState<SkinTheme[]>([])
  const [dirty, setDirty] = useState(false)
  const [slotId, setSlotId] = useState<string>('window.titlebar')
  const [state, setState] = useState<VisualState>('active')
  const [view, setView] = useState<PreviewWindow>('buddy-list')
  const [sim, setSim] = useState<PreviewState>({})
  const [mode, setMode] = useState<Mode>('designer')
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [notice, setNotice] = useState('')
  const [menu, setMenu] = useState('')
  const assetInput = useRef<HTMLInputElement>(null)
  const [assetFolder, setAssetFolder] = useState<AssetFolder>('frames')
  const [patternOpen, setPatternOpen] = useState(false)
  const [pattern, setPattern] = useState<{ kind: PatternKind; base: string; ink: string; size: number }>({ kind: 'gingham', base: '#fff8ee', ink: '#f0668f', size: 32 })

  const urls = useMemo(() => {
    const map: Record<string, string> = {}
    for (const asset of project?.assets || []) map[asset.path] = URL.createObjectURL(new Blob([asset.bytes as BlobPart], { type: asset.type }))
    return map
  }, [project?.assets])
  useEffect(() => () => Object.values(urls).forEach(url => URL.revokeObjectURL(url)), [urls])

  const compiled = useMemo(() => project ? compileTheme(project.theme, asset => urls[asset.path]) : null, [project, urls])
  const css = compiled ? declarationsToCss(compiled) + nineSliceCss(compiled) : ''
  const slot = SLOT_INDEX[slotId]
  const stateOptions: VisualState[] = slot ? (slot.states.includes('normal') ? slot.states : ['normal', ...slot.states]) : ['normal']
  useEffect(() => { if (slot && !stateOptions.includes(state)) setState(stateOptions[0]) }, [slotId]) // eslint-disable-line react-hooks/exhaustive-deps

  function change(next: (theme: SkinTheme) => SkinTheme) {
    if (!project) return
    setPast(list => [...list.slice(-99), project.theme])
    setFuture([])
    setProject({ ...project, theme: next(project.theme) })
    setDirty(true)
    setFindings(null)
  }
  function setValue(property: StyleProperty, value: unknown) {
    change(theme => {
      const slots = { ...(theme.slots || {}) }
      const states = { ...(slots[slotId] || {}) }
      states[state] = { ...(states[state] || {}), [property]: value } as SlotStyle
      slots[slotId] = states
      return { ...theme, slots }
    })
  }
  const undo = () => { if (!project || !past.length) return; setFuture(f => [project.theme, ...f]); setProject({ ...project, theme: past[past.length - 1] }); setPast(p => p.slice(0, -1)); setDirty(true) }
  const redo = () => { if (!project || !future.length) return; setPast(p => [...p, project.theme]); setProject({ ...project, theme: future[0] }); setFuture(f => f.slice(1)); setDirty(true) }

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as Element | null
      if (typeof target?.closest === 'function' && target.closest('input, textarea, select')) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      else if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      else if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  async function save() {
    if (!project) return
    try { await saveSkinProject(project); setDirty(false); setNotice('Saved to My Skin Library on this PC.') }
    catch (cause) { setNotice((cause instanceof Error ? cause.message : 'Saving failed.') + ' Your work is still open.') }
  }
  function check() {
    if (!project) return []
    const manifest = { format: 'elsewhere-skin', formatVersion: '1.0.0', id: 'check-skin', name: project.name || 'x', author: project.author || 'x', skinMapVersion: '1.0', preview: 'assets/preview/cover.png' }
    const found = [...validateManifest(manifest), ...validateTheme(project.theme), ...contrastFindings(project.theme)]
    const used = JSON.stringify(project.theme)
    for (const asset of project.assets) if (!used.includes(`"${asset.path}"`)) found.push({ severity: 'info', message: `“${asset.name}” isn’t used yet (it won’t be packaged).` })
    for (const match of used.matchAll(/"path":"([^"]+)"/g)) if (!project.assets.some(asset => asset.path === match[1])) found.push({ severity: 'error', message: `The image “${match[1]}” is missing from this project.` })
    setFindings(found)
    return found
  }
  async function exportSkin() {
    if (!project) return
    const found = check()
    if (found.some(item => item.severity === 'error')) { setNotice('Fix the errors in Check Skin before exporting.'); return }
    try {
      const result = await exportPackage(project)
      if (!result.check.ok) { setFindings(result.check.findings); setNotice('The package didn’t pass the install check. See Check Skin.'); return }
      download(result.bytes, result.fileName)
      setNotice(`Exported ${result.fileName} to your Downloads folder.`)
    } catch (cause) { setNotice((cause instanceof Error ? cause.message : 'Export failed.') + ' Your project is unchanged.') }
  }
  async function addAssets(files: FileList | null) {
    if (!project || !files) return
    const added: ProjectAsset[] = []
    for (const file of Array.from(files)) {
      try { added.push(await importAsset({ ...project, assets: [...project.assets, ...added] }, file, assetFolder)) }
      catch (cause) { setNotice(cause instanceof Error ? cause.message : String(cause)) }
    }
    if (added.length) { setProject({ ...project, assets: [...project.assets, ...added] }); setDirty(true) }
  }
  function closeWindow() {
    if (dirty && !window.confirm('Close SkinMapper? Changes that aren’t saved will be lost.')) return
    if (isTauri()) void getCurrentWindow().close()
    else setProject(null)
  }

  if (!project) return <WelcomeHub onOpen={next => { setProject(next); setPast([]); setFuture([]); setDirty(false) }} onClose={closeWindow} />

  const value = (property: StyleProperty) => resolve(project.theme, slotId, property, state)
  const grouped = Object.entries(REGIONS).map(([region, label]) => ({ label, slots: SLOTS.filter(item => item.region === Number(region)) }))
  const simpleProps: StyleProperty[] = ['background', 'textColor', 'borderColor', 'borderRadius', 'icon', 'backgroundImage', 'fontFamily']
  const editable = (slot?.properties || []).filter(property => mode !== 'simple' || simpleProps.includes(property))

  return <div className="sm-app" onPointerDown={() => setMenu('')}>
    <div className="sm-app-titlebar" data-tauri-drag-region>
      <span data-tauri-drag-region>{project.name}{dirty ? ' •' : ''} · Elsewhere SkinMapper</span>
      <button type="button" className="sm-app-close" onClick={closeWindow} aria-label="Close SkinMapper">×</button>
    </div>
    <div className="sm-app-menubar" onPointerDown={event => event.stopPropagation()}>
      {([
        ['File', [['Save  (Ctrl+S)', () => void save()], ['Export .eskin…', () => void exportSkin()], ['Back to Welcome', () => { if (!dirty || window.confirm('Leave without saving?')) setProject(null) }], ['Close', closeWindow]]],
        ['Edit', [['Undo  (Ctrl+Z)', undo], ['Redo  (Ctrl+Y)', redo]]],
        ['View', [['Sign-In', () => setView('sign-in')], ['Buddy List', () => setView('buddy-list')], ['Conversation', () => setView('conversation')], ['Notification', () => setView('notification')]]],
        ['Tools', [['Check Skin', () => { check() }], ['Classic transcript', () => change(theme => ({ ...theme, transcript: 'classic' }))], ['Bubble transcript', () => change(theme => ({ ...theme, transcript: 'bubble' }))]]],
        ['Help', [['Click any part of the preview to edit it. Nothing in the preview sends messages.', () => {}]]],
      ] as [string, [string, () => void][]][]).map(([name, items]) => <div key={name} className="sm-app-menu">
        <button type="button" aria-expanded={menu === name} onClick={() => setMenu(menu === name ? '' : name)}>{name}</button>
        {menu === name && <div className="sm-app-dropdown" role="menu">{items.map(([label, action]) => <button key={label} type="button" role="menuitem" onClick={() => { setMenu(''); action() }}>{label}</button>)}</div>}
      </div>)}
      <div className="sm-app-quick">
        <label>Mode <select value={mode} onChange={event => setMode(event.target.value as Mode)}><option value="simple">Simple</option><option value="designer">Designer</option><option value="advanced">Advanced</option></select></label>
        <button type="button" onClick={undo} disabled={!past.length} title="Undo">↶</button>
        <button type="button" onClick={redo} disabled={!future.length} title="Redo">↷</button>
        <button type="button" onClick={() => void save()}>💾 Save</button>
        <button type="button" className="sm-app-primary" onClick={() => void exportSkin()}>Export</button>
      </div>
    </div>

    <div className="sm-app-body">
      <nav className="sm-explorer" aria-label="SkinMap Explorer">
        <strong>SkinMap Explorer</strong>
        {grouped.map(group => <details key={group.label} open={group.slots.some(item => item.id === slotId)}>
          <summary>{group.label}</summary>
          {group.slots.map(item => <button key={item.id} type="button" className={item.id === slotId ? 'is-active' : ''} onClick={() => setSlotId(item.id)}
            title={mode === 'advanced' ? item.id : item.name}>{mode === 'advanced' ? item.id : item.name}</button>)}
        </details>)}
      </nav>

      <main className="sm-stage">
        <div className="sm-stage-tabs" role="tablist">
          {(['sign-in', 'buddy-list', 'conversation', 'notification'] as PreviewWindow[]).map(name => <button key={name} type="button" role="tab" aria-selected={view === name}
            className={view === name ? 'is-active' : ''} onClick={() => setView(name)}>{name === 'sign-in' ? 'Sign-In' : name === 'buddy-list' ? 'Buddy List' : name === 'conversation' ? 'Conversation' : 'Notification'}</button>)}
        </div>
        <div className="sm-stage-canvas">
          <MappedPreview css={css} transcript={compiled?.transcript || 'classic'} window={view} picked={slotId} onPick={id => setSlotId(id)} state={sim} />
        </div>
        <div className="sm-simulator" aria-label="State simulator">
          <strong>Preview with:</strong>
          {([['longNames', 'Long names'], ['empty', 'Empty lists'], ['compact', 'Small window'], ['error', 'Sign-in error']] as [keyof PreviewState, string][]).map(([key, label]) =>
            <label key={key}><input type="checkbox" checked={Boolean(sim[key])} onChange={event => setSim({ ...sim, [key]: event.target.checked })} /> {label}</label>)}
        </div>
      </main>

      <aside className="sm-inspector" aria-label="Properties">
        <strong>{slot?.name || slotId}</strong>
        {mode === 'advanced' && <code>{slotId}</code>}
        {slot?.protected && <p className="sm-hint">This is a working control: you can restyle it, but it always stays visible and clickable.</p>}
        <label className="sm-field">State
          <select value={state} onChange={event => setState(event.target.value as VisualState)}>
            {stateOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select></label>
        {editable.map(property => {
          const current = value(property)
          return <div key={property} className="sm-prop">
            <div className="sm-prop-head"><span>{LABELS[property] || property}</span>
              <small className={'sm-origin is-' + current.origin}>{current.origin === 'slot' ? 'set here' : current.origin === 'inherited-slot' ? 'inherited' : current.origin === 'default' ? 'default' : `from ${current.origin}`}</small>
              {current.origin === 'slot' && <button type="button" onClick={() => change(theme => resetProperty(theme, slotId, state, property))} title="Reset to inherited">↺</button>}
            </div>
            <PropertyInput property={property} value={current.value} assets={project.assets} allowed={slot?.scaling || []}
              onChange={next => setValue(property, next)} urls={urls} />
          </div>
        })}
        {!editable.length && <p className="sm-hint">Switch to Designer mode for more options.</p>}
        {findings && <div className="sm-findings">
          <strong>Check Skin</strong>
          {!findings.length ? <p className="sm-hint">✓ No problems found.</p> : findings.map((item, index) => <button key={index} type="button" className={'is-' + item.severity}
            onClick={() => { if (item.slot && SLOT_INDEX[item.slot]) setSlotId(item.slot) }}>{item.severity === 'error' ? '⛔' : item.severity === 'warning' ? '⚠️' : 'ℹ️'} {item.message}</button>)}
        </div>}
      </aside>

      <section className="sm-tray" aria-label="Asset Tray">
        <div className="sm-tray-head">
          <strong>Asset Tray</strong>
          <label>Add to <select value={assetFolder} onChange={event => setAssetFolder(event.target.value as AssetFolder)}>{ASSET_FOLDERS.map(folder => <option key={folder}>{folder}</option>)}</select></label>
          <button type="button" onClick={() => assetInput.current?.click()}>+ Import images</button>
          <button type="button" aria-expanded={patternOpen} onClick={() => setPatternOpen(open => !open)}>✦ Make a pattern</button>
          <small>PNG, WebP or JPEG · up to 4096 px · copied into your project</small>
        </div>
        {patternOpen && <div className="sm-pattern-maker">
          <select value={pattern.kind} onChange={event => setPattern({ ...pattern, kind: event.target.value as PatternKind })}>
            {(Object.keys(PATTERNS) as PatternKind[]).map(kind => <option key={kind} value={kind}>{PATTERNS[kind]}</option>)}</select>
          <label>Paper <input type="color" value={pattern.base} onChange={event => setPattern({ ...pattern, base: event.target.value })} /></label>
          <label>Ink <input type="color" value={pattern.ink} onChange={event => setPattern({ ...pattern, ink: event.target.value })} /></label>
          <label>Size <select value={pattern.size} onChange={event => setPattern({ ...pattern, size: Number(event.target.value) })}>{[16, 24, 32, 48, 64].map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
          <button type="button" onClick={() => void makePatternAsset(project, pattern.kind, pattern.base, pattern.ink, pattern.size).then(asset => {
            setProject({ ...project, assets: [...project.assets, asset] }); setDirty(true); setNotice(`Added “${asset.name}” to your textures. Assign it as a background image in Properties (Tile).`)
          }, cause => setNotice(cause instanceof Error ? cause.message : String(cause)))}>Add pattern</button>
        </div>}
        <div className="sm-tray-items">
          {!project.assets.length && <span className="sm-hint">Import frames, buttons, icons and textures, then assign them in Properties.</span>}
          {project.assets.map(asset => <figure key={asset.path} title={`${asset.path} · ${asset.width}×${asset.height}`}>
            <img src={urls[asset.path]} alt="" />
            <figcaption>{asset.name}<small>{asset.width}×{asset.height}</small></figcaption>
            <button type="button" aria-label={`Remove ${asset.name}`} onClick={() => {
              const used = JSON.stringify(project.theme).includes(`"${asset.path}"`)
              if (used && !window.confirm(`“${asset.name}” is used by your skin. Remove it anyway? Those parts will go back to their defaults.`)) return
              setProject({ ...project, assets: project.assets.filter(item => item.path !== asset.path) }); setDirty(true)
            }}>×</button>
          </figure>)}
        </div>
      </section>
    </div>
    {notice && <div className="sm-toast-note" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
    <input ref={assetInput} type="file" hidden multiple accept="image/png,image/webp,image/jpeg" onChange={event => { void addAssets(event.target.files); event.target.value = '' }} />
  </div>
}

function PropertyInput({ property, value, assets, allowed, onChange, urls }: {
  property: StyleProperty; value: unknown; assets: SkinProject['assets']; allowed: ScaleMode[]; onChange: (value: unknown) => void; urls: Record<string, string>
}) {
  if (property === 'backgroundImage' || property === 'icon') {
    const ref = (value || {}) as Partial<AssetRef>
    return <div className="sm-image-prop">
      <select value={ref.path || ''} onChange={event => onChange(event.target.value ? { ...ref, path: event.target.value, scale: ref.scale || allowed[0] } : undefined)}>
        <option value="">None</option>
        {assets.map(asset => <option key={asset.path} value={asset.path}>{asset.name} ({asset.width}×{asset.height})</option>)}
      </select>
      {ref.path && allowed.length > 0 && <select value={ref.scale || allowed[0]} onChange={event => onChange({ ...ref, scale: event.target.value })}>
        {allowed.map(mode => <option key={mode} value={mode}>{mode}</option>)}
      </select>}
      {ref.path && ref.scale === 'nine-slice' && <div className="sm-slice">{(['Top', 'Right', 'Bottom', 'Left']).map((side, index) =>
        <label key={side}>{side}<input type="number" min={0} max={2048} value={ref.slice?.[index] ?? 8}
          onChange={event => { const slice = [...(ref.slice || [8, 8, 8, 8])] as [number, number, number, number]; slice[index] = Math.max(0, Math.min(2048, Math.round(Number(event.target.value) || 0))); onChange({ ...ref, slice }) }} /></label>)}</div>}
      {ref.path && ref.scale === 'nine-slice' && (() => { const asset = assets.find(item => item.path === ref.path); return asset && urls[asset.path]
        ? <SliceEditor url={urls[asset.path]} width={asset.width} height={asset.height} slice={(ref.slice || [8, 8, 8, 8]) as [number, number, number, number]} onChange={slice => onChange({ ...ref, slice })} /> : null })()}
      {ref.path && <label className="sm-check"><input type="checkbox" checked={Boolean(ref.pixelated)} onChange={event => onChange({ ...ref, pixelated: event.target.checked })} /> Crisp pixels</label>}
    </div>
  }
  const text = value === undefined ? '' : String(value)
  if (property.endsWith('Color') || property === 'background') {
    const hex = /^#[0-9a-f]{6}$/i.test(text) ? text : '#ffffff'
    return <div className="sm-color"><input type="color" value={hex} onChange={event => onChange(event.target.value)} />
      <input value={text} placeholder="#rrggbb" onChange={event => onChange(event.target.value)} /></div>
  }
  if (property === 'fontFamily') return <select value={text} onChange={event => onChange(event.target.value || undefined)}><option value="">(inherited)</option>{FONTS.map(font => <option key={font} style={{ fontFamily: font }}>{font}</option>)}</select>
  if (property === 'fontWeight') return <select value={text} onChange={event => onChange(event.target.value || undefined)}><option value="">(inherited)</option>{['400', '600', '700', '900'].map(weight => <option key={weight}>{weight}</option>)}</select>
  if (property === 'opacity') return <input type="range" min={0} max={100} value={Math.round((Number(value ?? 1)) * 100)} onChange={event => onChange(Number(event.target.value) / 100)} />
  return <input value={text} placeholder={property.includes('hadow') ? '0px 2px 4px #00000055' : 'e.g. 6px'} onChange={event => onChange(event.target.value || undefined)} />
}

function WelcomeHub({ onOpen, onClose }: { onOpen: (project: SkinProject) => void; onClose: () => void }) {
  const [step, setStep] = useState<'' | 'quick' | 'library'>('')
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [template, setTemplate] = useState('classic')
  const [library, setLibrary] = useState<SkinProject[] | null>(null)
  const [error, setError] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (step === 'library') void listSkinProjects().then(setLibrary, () => setLibrary([])) }, [step])

  async function importSkin(file: File | undefined) {
    if (!file) return
    setError('')
    if (file.size > 50 * 1024 * 1024) { setError('That file is larger than 50 MB.'); return }
    const result = loadSkinPackage(new Uint8Array(await file.arrayBuffer()))
    if (!result.ok) { setError('This skin can’t be opened: ' + (result.findings.find(item => item.severity === 'error')?.message || 'it isn’t a valid skin package.')); return }
    onOpen(projectFromPackage(result))
  }

  return <div className="sm-app sm-welcome">
    <div className="sm-app-titlebar" data-tauri-drag-region>
      <span data-tauri-drag-region>Elsewhere SkinMapper ✧</span>
      <button type="button" className="sm-app-close" onClick={onClose} aria-label="Close SkinMapper">×</button>
    </div>
    <div className="sm-welcome-body">
      <h1>Make your own Messenger skin</h1>
      {!step && <div className="sm-welcome-grid">
        <button type="button" onClick={() => setStep('quick')}><b>✨ Quick Create</b><small>Name it, pick a starting look, start designing.</small></button>
        <button type="button" onClick={() => onOpen(newProject('My Skin', '', 'classic'))}><b>🎨 Custom Design</b><small>Start from Classic and change anything.</small></button>
        <button type="button" onClick={() => importInput.current?.click()}><b>📦 Import a Skin</b><small>Open an .eskin file to edit it.</small></button>
        <button type="button" onClick={() => setStep('library')}><b>📚 My Skin Library</b><small>Skins you’ve saved on this PC.</small></button>
      </div>}
      {step === 'quick' && <form className="sm-quick" onSubmit={event => {
        event.preventDefault()
        if (STARTER_SKINS[template]) void newStarterProject(name, author, template).then(onOpen, cause => setError(cause instanceof Error ? cause.message : String(cause)))
        else onOpen(newProject(name, author, template))
      }}>
        <label className="sm-field">Skin name<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="CandyCall" required /></label>
        <label className="sm-field">Made by<input value={author} maxLength={80} onChange={event => setAuthor(event.target.value)} placeholder="your name or handle" /></label>
        <fieldset><legend>Starting look</legend>
          {Object.entries(TEMPLATES).map(([key, item]) => <label key={key} className="sm-check"><input type="radio" checked={template === key} onChange={() => setTemplate(key)} /> {item.label}</label>)}
        </fieldset>
        {SKIN_FAMILIES.map(({ family, name }) => <fieldset key={family}><legend>{name}</legend>
          {Object.entries(STARTER_SKINS).filter(([, item]) => item.family === family).map(([key, item]) =>
            <label key={key} className="sm-check"><input type="radio" checked={template === key} onChange={() => setTemplate(key)} /> {item.label}</label>)}
        </fieldset>)}
        <div className="sm-actions"><button type="button" onClick={() => setStep('')}>Back</button><button type="submit" className="sm-app-primary">Start designing</button></div>
      </form>}
      {step === 'library' && <div className="sm-library">
        {library === null ? <p>Loading…</p> : !library.length ? <p className="sm-hint">No saved skins yet. Use File → Save while designing.</p>
          : library.map(item => <div key={item.id} className="sm-library-row">
            <button type="button" onClick={() => onOpen(item)}><b>{item.name}</b><small>by {item.author} · {new Date(item.updatedAt).toLocaleString()}</small></button>
            <button type="button" onClick={() => { if (window.confirm(`Delete “${item.name}”? This can’t be undone.`)) void deleteSkinProject(item.id).then(() => setLibrary(list => (list || []).filter(entry => entry.id !== item.id))) }}>Delete</button>
          </div>)}
        <div className="sm-actions"><button type="button" onClick={() => setStep('')}>Back</button></div>
      </div>}
      {error && <p className="sm-error-note" role="alert">{error}</p>}
    </div>
    <input ref={importInput} type="file" hidden accept=".eskin,.elsewhereskin,application/zip" onChange={event => { void importSkin(event.target.files?.[0]); event.target.value = '' }} />
  </div>
}
