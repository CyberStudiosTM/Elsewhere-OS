import { useEffect, useLayoutEffect, useRef, useState,
  type Dispatch, type RefObject, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { useStoredValue } from '../services/localValues'
import type { MessageFormat } from '../services/messagingCore'
import type { MediaRef } from '../services/messengerMedia'
import {
  fontEntries, colorEntries, unicodeEntries, kaomojiEntries,
  catalogCounts, decorate, normalizeHex, hexRgb, hexHsl, rgbHex,
  hslHex, contrastRatio, type LibraryKind, type Entry,
} from '../services/expressionCatalog'
import {
  treasureCategories, treasureUrl, loadTreasures, type Treasure,
} from '../services/webTreasures'
import './ExpressionLibraries.css'

type Skin = 'classic' | 'dead-signal'
type Preferences = {
  favorites: Partial<Record<LibraryKind, string[]>>
  recents: Partial<Record<LibraryKind, string[]>>
  collections: Partial<Record<LibraryKind, Record<string, string[]>>>
  custom: Entry[]
}
const EMPTY_PREFERENCES: Preferences = {
  favorites: {}, recents: {}, collections: {}, custom: [],
}
const tools: readonly [LibraryKind, string, string][] = [
  ['font','Aa','Font library'],
  ['color','A̲','Text Color Studio'],
  ['unicode','𝓐','Decorative text'],
  ['kaomoji','(ツ)','Kaomoji & symbols'],
  ['treasure','✦','Web Treasures'],
]

type Props = {
  skin: Skin
  owner: string | null
  draft: string
  format: MessageFormat
  setDraft: Dispatch<SetStateAction<string>>
  setFormat: Dispatch<SetStateAction<MessageFormat>>
  composerRef: RefObject<HTMLTextAreaElement | null>
  onSend: (media: MediaRef) => void | Promise<void | boolean>
}
type Opening = {
  kind: LibraryKind
  anchor: HTMLButtonElement
  original: string
  start: number
  end: number
}

export default function ExpressionLibraries(props: Props) {
  const [opening, setOpening] = useState<Opening | null>(null)

  return <>
    {tools.map(([kind,glyph,label]) => <button
      key={kind} type="button"
      className={`ew-expression-trigger ew-expression-${kind}`}
      title={label} aria-label={label} aria-haspopup="dialog"
      aria-expanded={opening?.kind === kind}
      disabled={!props.owner}
      onMouseDown={event => event.preventDefault()}
      onClick={event => {
        if (opening?.kind === kind) { setOpening(null); return }
        const input = props.composerRef.current
        setOpening({ kind, anchor: event.currentTarget, original: props.draft,
          start: input?.selectionStart ?? props.draft.length,
          end: input?.selectionEnd ?? props.draft.length })
      }}
    >{glyph}</button>)}
    {opening && props.owner && <Panel key={opening.kind} {...props}
      opening={opening} onClose={() => setOpening(null)} />}
  </>
}

function Panel({ skin, owner, draft, format, setDraft, setFormat,
  composerRef, onSend, opening, onClose }: Props & {
  opening: Opening; onClose: () => void
}) {
  const {kind,anchor} = opening
  const [preferences,setPreferences] = useStoredValue<Preferences>(
    owner ? `elsewhere.expression-suite.v1:${owner}` : null, EMPTY_PREFERENCES)
  const [query,setQuery] = useState('')
  const [category,setCategory] = useState('All')
  const [view,setView] = useState('All')
  const [page,setPage] = useState(0)
  const [selectedId,setSelectedId] = useState(
    kind === 'font' ? format.fontFamily ?? '' : '')
  const [fontSize,setFontSize] = useState(format.fontSize ?? 13)
  const [hex,setHex] = useState(normalizeHex(format.color ?? '') ??
    (skin === 'classic' ? '#000000' : '#E5EDF2'))
  const [transformInput,setTransformInput] = useState(
    opening.start === opening.end ? opening.original :
      opening.original.slice(opening.start,opening.end))
  const [custom,setCustom] = useState('')
  const [collectionName,setCollectionName] = useState('')
  const [notice,setNotice] = useState('')
  const [treasures,setTreasures] = useState<Treasure[]>([])
  const [loading,setLoading] = useState(kind === 'treasure')
  const [sending,setSending] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const sendLock = useRef(false)

  useEffect(() => {
    if (kind !== 'treasure') return
    let closed = false
    void loadTreasures().then(items => {
      if (!closed) { setTreasures(items); setLoading(false) }
    }).catch(error => {
      if (!closed) { setNotice(String(error)); setLoading(false) }
    })
    return () => { closed = true }
  },[kind])

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    function position() {
      if (!box || !anchor.isConnected) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.max(240,Math.min(420,window.innerWidth-16))
      const height = Math.max(180,Math.min(485,window.innerHeight-16))
      const above = rect.top
      const below = window.innerHeight - rect.bottom
      const top = above >= below
        ? rect.top - Math.min(height,above-8) - 4
        : rect.bottom + 4
      box.style.width = `${width}px`
      box.style.maxHeight = `${height}px`
      box.style.top = `${Math.max(8,Math.min(top,window.innerHeight-height-8))}px`
      box.style.left = `${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`
      box.style.visibility = 'visible'
    }
    position()
    window.addEventListener('resize',position)
    return () => window.removeEventListener('resize',position)
  },[anchor])

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (sendLock.current || !(event.target instanceof Element)) return
      if (boxRef.current?.contains(event.target) ||
        event.target.closest('.ew-expression-trigger')) return
      onClose()
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !sendLock.current) {
        event.stopPropagation(); onClose(); anchor.focus()
      }
    }
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',escape)
    return () => {
      document.removeEventListener('pointerdown',outside)
      document.removeEventListener('keydown',escape)
    }
  },[anchor,onClose])

  const entries: Entry[] = kind === 'font' ? fontEntries :
    kind === 'color' ? colorEntries : kind === 'unicode' ? unicodeEntries :
    kind === 'kaomoji' ? [...kaomojiEntries,...preferences.custom] :
    treasures.map(t=>({id:t.id,label:t.name,value:treasureUrl(t),
      category:treasureCategories[t.category],search:[t.creator,...t.tags,t.license].join(' ')}))

  const favorites = preferences.favorites[kind] ?? []
  const recents = preferences.recents[kind] ?? []
  const collections = preferences.collections[kind] ?? {}
  const categories = ['All',...(kind === 'treasure'
    ? Object.values(treasureCategories) : [...new Set(entries.map(e=>e.category))])]
  const ids = view === 'Favorites' ? favorites : view === 'Recents' ? recents :
    view.startsWith('collection:') ? collections[view.slice('collection:'.length)] ?? [] : null
  const byId = new Map(entries.map(e=>[e.id,e]))
  const available = ids ? ids.flatMap(id => {
    const item = byId.get(id)
    if (item) return [item]
    if (kind === 'color' && normalizeHex(id)) return [{id,label:id,value:id,category:'Custom'}]
    return []
  }) : entries
  const needle = query.trim().toLowerCase()
  const filtered = available.filter(item =>
    (category === 'All' || item.category === category) &&
    (!needle || [item.label,item.category,item.value,item.search ?? ''].join(' ').toLowerCase().includes(needle)))
  const pageCount = Math.max(1,Math.ceil(filtered.length / 30))
  const currentPage = Math.min(page,pageCount-1)
  const pageItems = filtered.slice(currentPage*30,(currentPage+1)*30)
  const validHex = normalizeHex(hex)
  const chosen: Entry | null = kind === 'color' ? validHex
    ? {id:validHex,label:validHex,value:validHex,category:'Custom'} : null
    : byId.get(selectedId) ?? null
  const selectedTreasure = kind === 'treasure' ? treasures.find(t=>t.id===selectedId) : undefined
  const total = kind === 'treasure' ? treasures.length :
    kind === 'font' ? catalogCounts.fonts : kind === 'color' ? catalogCounts.colors :
    kind === 'unicode' ? catalogCounts.unicode : catalogCounts.kaomoji

  function remember(id: string) {
    setPreferences(old=>({...old,recents:{...old.recents,
      [kind]:[id,...(old.recents[kind] ?? []).filter(x=>x!==id)].slice(0,100)}}))
  }
  function favorite(id: string) {
    setPreferences(old=>{
      const saved = old.favorites[kind] ?? []
      return {...old,favorites:{...old.favorites,
        [kind]:saved.includes(id) ? saved.filter(x=>x!==id) : [...saved,id]}}
    })
  }
  function choose(item: Entry) {
    setSelectedId(item.id)
    if (kind === 'color') setHex(item.value)
    setNotice('')
  }
  function saveCollection() {
    if (!chosen) return
    const name = collectionName.trim().slice(0,50)
    if (!name || !/^[\p{L}\p{N} _-]+$/u.test(name) ||
      ['constructor','__proto__','prototype'].includes(name)) {
      setNotice('Use a name with letters, numbers, spaces or hyphens.');return
    }
    setPreferences(old=>{
      const groups = old.collections[kind] ?? {}
      return {...old,collections:{...old.collections,[kind]:{
        ...groups,[name]:[...new Set([...(groups[name] ?? []),chosen.id])]}}}
    })
    setNotice(`Saved to ${name}.`)
  }
  function deleteCollection() {
    if (!view.startsWith('collection:')) return
    const name = view.slice('collection:'.length)
    if (!confirm(`Delete collection "${name}"?`)) return
    setPreferences(old=>{
      const groups = {...(old.collections[kind] ?? {})}
      delete groups[name]
      return {...old,collections:{...old.collections,[kind]:groups}}
    })
    setView('All');setPage(0)
  }
  function insert(value: string, entire: boolean) {
    if (draft !== opening.original) {
      setNotice('Draft changed. Close and reopen this library.');return false
    }
    const start = entire ? 0 : opening.start
    const end = entire ? draft.length : opening.end
    const next = draft.slice(0,start)+value+draft.slice(end)
    if (next.length > 16000) {setNotice('Message is too long.');return false}
    setDraft(next)
    requestAnimationFrame(()=>{
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(start+value.length,start+value.length)
    })
    return true
  }
  async function copy() {
    if (!chosen) return
    const value = kind === 'unicode' ? decorate(chosen.id,transformInput) : chosen.value
    try {await navigator.clipboard.writeText(value);remember(chosen.id);setNotice('Copied.')}
    catch {setNotice('Clipboard access unavailable.')}
  }
  async function apply() {
    if (!chosen || sendLock.current) return
    if (kind === 'font') setFormat(old=>({...old,fontFamily:chosen.value,
      fontSize:Math.max(8,Math.min(48,Math.round(fontSize)||13))}))
    else if (kind === 'color') setFormat(old=>({...old,color:chosen.value}))
    else if (kind === 'unicode') {
      if (!transformInput || !insert(decorate(chosen.id,transformInput),
        opening.start===opening.end)) return
    } else if (kind === 'kaomoji') {
      if (!insert(chosen.value,false)) return
    } else if (kind === 'treasure' && selectedTreasure) {
      sendLock.current = true;setSending(true)
      try {
        const result = await onSend({kind:'treasure',id:selectedTreasure.id,name:selectedTreasure.name})
        if (result === false) {setNotice('Message was not sent.');return}
      } catch (error) {setNotice(String(error));return}
      finally {sendLock.current = false;setSending(false)}
    } else return
    remember(chosen.id);onClose()
    if (kind === 'font' || kind === 'color') composerRef.current?.focus()
  }
  function saveCustom() {
    const text = custom.trim()
    if (!text || text.length > 160) return
    const item: Entry = {id:`custom-${crypto.randomUUID()}`,label:text,value:text,category:'Custom'}
    setPreferences(old=>({...old,custom:[...old.custom,item]}))
    setCustom('');setSelectedId(item.id);setView('All');setCategory('All');setPage(0)
  }
  function deleteCustom() {
    if (!chosen?.id.startsWith('custom-')) return
    const id = chosen.id
    setPreferences(old=>({...old,custom:old.custom.filter(x=>x.id!==id),
      favorites:{...old.favorites,kaomoji:(old.favorites.kaomoji ?? []).filter(x=>x!==id)},
      recents:{...old.recents,kaomoji:(old.recents.kaomoji ?? []).filter(x=>x!==id)}}))
    setSelectedId('')
  }

  return createPortal(<div ref={boxRef}
    className={`ew-expression-panel ew-expression-panel-${skin}`}
    role="dialog" aria-label={tools.find(t=>t[0]===kind)?.[2]}
    style={{visibility:'hidden'}}>
    <header className="ew-expression-head">
      <strong>{tools.find(t=>t[0]===kind)?.[2]}</strong>
      <button type="button" onClick={onClose} disabled={sending} aria-label="Close library">×</button>
    </header>
    <section className="ew-expression-body">
      <input aria-label="Search library" placeholder="Search the collection..."
        value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}} />
      <div className="ew-expression-controls">
        <select aria-label="Library view" value={view} onChange={event=>{
          setView(event.target.value);setCategory('All');setPage(0)}}>
          <option>All</option><option>Favorites</option><option>Recents</option>
          {Object.keys(collections).map(c=><option key={c} value={`collection:${c}`}>{c}</option>)}
        </select>
        <select aria-label="Category" value={category} onChange={event=>{
          setCategory(event.target.value);setPage(0)}}>
          {categories.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      {kind === 'font' && <div className="ew-expression-controls">
        <label>Size <input type="number" min={8} max={48} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} /></label>
        <button type="button" onClick={()=>{
          setFormat(old=>({...old,fontFamily:undefined,fontSize:undefined}));onClose()}}>Default font</button>
      </div>}
      {kind === 'color' && <div className="ew-color-editor">
        <div className="ew-expression-controls">
          <input type="color" aria-label="Custom color picker" value={validHex ?? '#000000'} onChange={e=>setHex(e.target.value.toUpperCase())}/>
          <label>HEX <input aria-invalid={!validHex} maxLength={7} value={hex} onChange={e=>setHex(e.target.value)}/></label>
          <button type="button" disabled={!validHex} onClick={()=>validHex&&favorite(validHex)}>{validHex&&favorites.includes(validHex)?'Unsave':'Save'}</button>
        </div>
        {validHex && <>
          <div className="ew-color-numbers">{(['R','G','B'] as const).map((letter,index)=><label key={letter}>{letter}
            <input type="number" min={0} max={255} value={hexRgb(validHex)[index]} onChange={e=>{
              const rgb = hexRgb(validHex);rgb[index]=Number(e.target.value)
              setHex(rgbHex(rgb[0],rgb[1],rgb[2]))}} /></label>)}</div>
          <div className="ew-color-numbers">{(['H','S','L'] as const).map((letter,index)=><label key={letter}>{letter}
            <input type="number" min={0} max={index===0?359:100} value={hexHsl(validHex)[index]} onChange={e=>{
              const hsl=hexHsl(validHex);hsl[index]=Number(e.target.value)
              setHex(hslHex(hsl[0],hsl[1],hsl[2]))}} /></label>)}</div>
          <div className="ew-color-preview">
            {['#FFFFFF','#111A21'].map(bg=><div key={bg} style={{background:bg,color:validHex}}>
              {draft.slice(0,60)||'hello elsewhere ♡'}
              <small style={{color:bg==='#FFFFFF'?'#222':'#EEE'}}>{contrastRatio(validHex,bg).toFixed(1)}:1</small>
            </div>)}
          </div>
          {(contrastRatio(validHex,'#FFFFFF')<4.5||contrastRatio(validHex,'#111A21')<4.5) &&
            <small>Contrast warning: this color may be difficult to read.</small>}
        </>}
        <button type="button" onClick={()=>{setFormat(old=>({...old,color:undefined}));onClose()}}>Default color</button>
      </div>}
      {kind==='unicode' && <label>Text to transform
        <textarea rows={2} maxLength={16000} value={transformInput} onChange={e=>setTransformInput(e.target.value)}/>
        <small>These characters are visually decorative and may be harder for screen readers.</small>
      </label>}
      {kind==='kaomoji' && <div className="ew-expression-controls">
        <input aria-label="Custom kaomoji" placeholder="Save your own..." maxLength={160} value={custom} onChange={e=>setCustom(e.target.value)}/>
        <button type="button" disabled={!custom.trim()} onClick={saveCustom}>Add</button>
      </div>}
      {kind==='treasure' && <small>CyberStudios' curated graphics. No assets are included until you approve them.</small>}
      <small>{filtered.length.toLocaleString()} matching · {total.toLocaleString()} built-in entries</small>
      {loading ? <p>Loading...</p> : filtered.length===0 ?
        <div className="ew-expression-empty"><strong>{kind==='treasure' && treasures.length===0?'The treasure chest is empty.':'No results.'}</strong>
          <small>{kind==='treasure' && treasures.length===0?'Approved graphics will appear when added to the manifest.':'Try another search or category.'}</small></div>
        : <div className={kind==='color'?'ew-expression-swatches':'ew-expression-entries'}>
          {pageItems.map(item=><div className="ew-expression-entry" key={item.id}>
            <button className="ew-expression-choice" type="button" title={item.label}
              aria-pressed={selectedId===item.id || (kind==='color'&&hex===item.id)}
              onClick={()=>choose(item)}>
              {kind==='color'?<><i style={{background:item.value}}/><small>{item.value}</small></>:
               kind==='font'?<><span style={{fontFamily:`${JSON.stringify(item.value)},sans-serif`}}>{draft.slice(0,55)||'dreaming in pixels ♡'}</span><small>{item.label}</small></>:
               kind==='unicode'?<><span>{decorate(item.id,transformInput.slice(0,70)||'elsewhere')}</span><small>{item.label}</small></>:
               kind==='treasure'?<><img src={item.value} alt={item.label} loading="lazy"/><small>{item.label}</small></>:
               <><span>{item.value}</span><small>{item.category}</small></>}
            </button>
            <button type="button" className="ew-expression-favorite" title="Favorite"
              aria-pressed={favorites.includes(item.id)} onClick={()=>favorite(item.id)}>
              {favorites.includes(item.id)?'♥':'♡'}</button>
          </div>)}
        </div>}
      {pageCount>1 && <div className="ew-expression-pages">
        <button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button>
        <span>{currentPage+1} / {pageCount}</span>
        <button type="button" disabled={currentPage===pageCount-1} onClick={()=>setPage(currentPage+1)}>Next</button>
      </div>}
      {selectedTreasure && <div className="ew-expression-credit">
        <img src={treasureUrl(selectedTreasure)} alt={selectedTreasure.name}/>
        <span>{selectedTreasure.name} · {selectedTreasure.creator}</span>
        <small>{selectedTreasure.license}</small>
        <button type="button" onClick={()=>void navigator.clipboard.writeText(selectedTreasure.source).then(()=>setNotice('Source copied.')).catch(()=>setNotice('Clipboard unavailable.'))}>Copy source</button>
      </div>}
      <details><summary>My collections</summary>
        <div className="ew-expression-controls">
          <input placeholder={kind==='color'?'Palette name':'Collection name'} maxLength={50} value={collectionName} onChange={e=>setCollectionName(e.target.value)}/>
          <button type="button" onClick={saveCollection} disabled={!chosen || !collectionName.trim()}>Save selection</button>
        </div>
        {view.startsWith('collection:')&&<button type="button" onClick={deleteCollection}>Delete collection</button>}
      </details>
    </section>
    <footer className="ew-expression-footer">
      {notice && <small role="status">{notice}</small>}
      <div className="ew-expression-chosen">
        <small>Selected</small> <strong>{chosen ? kind==='unicode'?decorate(chosen.id,transformInput.slice(0,60)||'elsewhere') : chosen.label : 'None'}</strong>
      </div>
      <div className="ew-expression-actions">
        <button type="button" disabled={!chosen || sending || (kind==='unicode'&&!transformInput)}
          onClick={()=>void apply()}>{sending?'Sending...':kind==='treasure'?'Send treasure':kind==='kaomoji'?'Insert':kind==='unicode'?'Apply text':'Apply'}</button>
        {(kind==='color'||kind==='unicode'||kind==='kaomoji')&&<button type="button" disabled={!chosen} onClick={()=>void copy()}>Copy</button>}
        {kind==='kaomoji'&&chosen?.id.startsWith('custom-')&&<button type="button" onClick={deleteCustom}>Delete</button>}
        <button type="button" disabled={sending} onClick={onClose}>Cancel</button>
      </div>
    </footer>
  </div>,document.body)
}
