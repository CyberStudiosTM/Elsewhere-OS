import { studioStickers } from './studioStickers'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { STUDIO_OPEN_PHOTO, type StudioOpen } from '../services/studioWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { saveLocalImage } from '../services/messengerMedia'
import { useTreasureRevision, loadTreasures, type Treasure } from '../services/webTreasures'
import {
  COLLAGE_LAYOUTS, FILTERS, FRAMES, STARTER_STICKERS, TEXT_STYLES, blankDoc, collageDoc, drawLayer, miniUiLayer, stationeryLayer, frameLayer, imageLayer, newId, stickerLayer, textLayer,
  type CollageLayout, type FilterName, type FrameStyle, type Layer, type StudioDoc, type StudioProject, type TextStyle,
} from './studioModel'
import { canvasToBlob, mediaUrl, renderDoc, textFont, thumbnail } from './studioRender'
import { MINI_UI, STATIONERY, drawMiniUi, drawStationery, drawStrokes, type MiniUiStyle, type StationeryStyle } from './studioDrawn'
import {
  addMyTreasure, clearRecovery, deleteProject, findDuplicateTreasure, listMyTreasures, listProjects, loadProject, loadRecovery,
  removeMyTreasure, saveProject, saveRecovery, watchMyTreasures, type MyTreasure,
} from './studioStore'
import GalleryDialog from './GalleryDialog'
import WardrobeDialog, { readWardrobe, writeWardrobe, type WardrobeLook } from './WardrobeDialog'
import { drawerSet, findSkin, motifUrl, skinStyle, type MotifSlot } from './studioSkins'
import { openSkinMapper } from '../services/skinMapperWindow'
import { saveToGallery } from './studioGallery'
import './Studio.css'

// Elsewhere Creative Studio (Phase 1b): Cloudscape workspace with the four approved zones.
// Left Toolbox · center Canvas · right Decoration Desk (Library / Edit / Layers) · bottom Quick Drawer.

type Category = 'stickers' | 'frames' | 'text' | 'stationery' | 'treasures' | 'filters' | 'mini-ui' | 'draw' | 'collage'
const CATEGORIES: { id: Category; label: string; icon: string; ready: boolean }[] = [
  { id: 'stickers', label: 'Stickers', icon: '🎀', ready: true },
  { id: 'frames', label: 'Frames', icon: '🖼️', ready: true },
  { id: 'text', label: 'Text', icon: '🔤', ready: true },
  { id: 'stationery', label: 'Stationery', icon: '📎', ready: true },
  { id: 'treasures', label: 'Web Treasures', icon: '🌐', ready: true },
  { id: 'filters', label: 'Overlays & Filters', icon: '✨', ready: true },
  { id: 'mini-ui', label: 'Mini-UI', icon: '💬', ready: true },
  { id: 'draw', label: 'Draw & Stamps', icon: '🖌️', ready: true },
  { id: 'collage', label: 'Collage', icon: '🧩', ready: true },
]
type DeskTab = 'library' | 'edit' | 'layers'
type Recent = { kind: 'sticker'; glyph: string } | { kind: 'treasure'; id: string; name: string } | { kind: 'frame'; style: FrameStyle }
  | { kind: 'photo' | 'studio-sticker'; id: string; name: string; w: number; h: number }
const RECENTS = 'elsewhere.studio.recent.v1'
const FAVORITES = 'elsewhere.studio.favorites.v1'
type DrawerTab = 'recent' | 'favorites' | 'set' | 'photos'
const sameItem = (a: Recent, b: Recent) => JSON.stringify(a) === JSON.stringify(b)
const DRAWER_EMPTY: Record<DrawerTab, string> = {
  recent: 'Stickers, frames and treasures you use show up here.',
  favorites: 'Tap the ♡ on anything in the drawer to keep it here.',
  set: 'This look has no sticker set yet.',
  photos: 'Photos you add to your projects show up here, ready to use again.',
}
const WORKSPACE = 'elsewhere.studio.workspace.v1'
const MAX_SIDE = 4096
const IMPORT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback } }
function writeJson(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* optional */ } }
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** Opens the editor window (or an in-page workspace in the browser). */
export function studioParams() {
  const params = new URLSearchParams(window.location.search)
  return { photo: params.get('photo'), photos: (params.get('photos') || '').split(',').filter(Boolean), layout: params.get('layout'), project: params.get('project'), source: params.get('source'), sourceName: params.get('sourceName') || undefined }
}

export default function StudioApp() {
  const params = useMemo(studioParams, [])
  const [project, setProject] = useState<StudioProject | null>(null)
  const [past, setPast] = useState<StudioDoc[]>([])
  const [future, setFuture] = useState<StudioDoc[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('stickers')
  const [tab, setTab] = useState<DeskTab>('library')
  const [zoom, setZoom] = useState(0)
  const [workspace, setWorkspace] = useState(() => readJson(WORKSPACE, { drawer: true }))
  const [recents, setRecents] = useState<Recent[]>(() => readJson(RECENTS, []))
  const [favorites, setFavorites] = useState<Recent[]>(() => readJson(FAVORITES, []))
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('recent')
  const [menu, setMenu] = useState('')
  const [dialog, setDialog] = useState<'' | 'finish' | 'open' | 'close' | 'export' | 'gallery' | 'wardrobe'>('')
  const [look, setLook] = useState<WardrobeLook>(readWardrobe)
  const [recovery, setRecovery] = useState<StudioProject | null>(null)
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const addImageInput = useRef<HTMLInputElement>(null)
  const treasureInput = useRef<HTMLInputElement>(null)
  const slotInput = useRef<HTMLInputElement>(null)
  const [pen, setPen] = useState<{ on: boolean; color: string; size: number }>({ on: false, color: '#e8578a', size: 12 })
  const penStroke = useRef<{ layerId: string; before: StudioDoc } | null>(null)
  const fillingSlot = useRef<string | null>(null)
  const stageWrap = useRef<HTMLDivElement>(null)

  const doc = project?.doc
  const layer = doc?.layers.find(item => item.id === selected) || null

  // Start: a photo from the Booth, a saved project, or the start screen (with recovery if any).
  useEffect(() => {
    let alive = true
    void (async () => {
      if (params.project) {
        const found = await loadProject(params.project)
        if (alive && found) { setProject(found); setSaved(true) }
        return
      }
      if (params.photos.length && params.layout) { startStrip(params.photos, params.layout); return }
      if (params.photo) { await startFromPhoto(params.photo, 'Booth photo'); return }
      const restore = await loadRecovery().catch(() => undefined)
      if (alive && restore) setRecovery(restore)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startFromPhoto(photoId: string, name: string) {
    const url = await mediaUrl(photoId, 'local')
    if (!url) { setNotice('That photo couldn’t be found on this PC. Import another one.'); return }
    const image = new Image()
    image.src = url
    await image.decode().catch(() => undefined)
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
    const next = blankDoc(Math.round((image.naturalWidth || 1200) * scale), Math.round((image.naturalHeight || 900) * scale))
    next.photoId = photoId
    const now = new Date().toISOString()
    setProject({ id: newId(), name, createdAt: now, updatedAt: now, doc: next, sourceContactId: params.source, sourceContactName: params.sourceName })
    setPast([]); setFuture([]); setSelected(null); setDirty(false); setSaved(false); setRecovery(null)
  }

  // Another Booth photo sent while Studio is already open.
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!isTauri()) return
    let stop: (() => void) | undefined
    let disposed = false
    void listen<StudioOpen>(STUDIO_OPEN_PHOTO, ({ payload }) => {
      if (!payload?.photo && !payload?.photos?.length) return
      if (dirtyRef.current && !window.confirm('Open your new photo? Changes to the current project that aren’t saved will be lost.')) return
      params.source = payload.source || null
      params.sourceName = payload.sourceName
      if (payload.photos?.length && payload.layout) startStrip(payload.photos, payload.layout)
      else if (payload.photo) void startFromPhoto(payload.photo, 'Booth photo')
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { disposed = true; stop?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave the session for recovery (debounced).
  useEffect(() => {
    if (!project || !dirty) return
    const timer = window.setTimeout(() => { void saveRecovery({ ...project, updatedAt: new Date().toISOString() }).catch(() => {}) }, 800)
    return () => window.clearTimeout(timer)
  }, [project, dirty])

  useEffect(() => writeJson(WORKSPACE, workspace), [workspace])

  const commit = useCallback((change: (current: StudioDoc) => StudioDoc) => {
    setProject(current => {
      if (!current) return current
      const next = change(current.doc)
      if (next === current.doc) return current
      setPast(list => [...list.slice(-79), current.doc])
      setFuture([])
      setDirty(true)
      return { ...current, doc: next }
    })
  }, [])
  /** Live update without a history step (used while dragging). */
  const preview = useCallback((change: (current: StudioDoc) => StudioDoc) => {
    setProject(current => current ? { ...current, doc: change(current.doc) } : current)
  }, [])
  const updateLayer = (id: string, patch: Partial<Layer>) => commit(current => ({ ...current, layers: current.layers.map(item => item.id === id ? { ...item, ...patch } as Layer : item) }))

  function undo() {
    if (!project || !past.length) return
    setFuture(list => [project.doc, ...list])
    setProject({ ...project, doc: past[past.length - 1] })
    setPast(list => list.slice(0, -1))
    setDirty(true)
  }
  function redo() {
    if (!project || !future.length) return
    setPast(list => [...list, project.doc])
    setProject({ ...project, doc: future[0] })
    setFuture(list => list.slice(1))
    setDirty(true)
  }

  function remember(item: Recent) {
    setRecents(list => {
      const key = JSON.stringify(item)
      const next = [item, ...list.filter(entry => JSON.stringify(entry) !== key)].slice(0, 16)
      writeJson(RECENTS, next)
      return next
    })
  }
  function toggleFavorite(item: Recent) {
    setFavorites(list => {
      const next = list.some(entry => sameItem(entry, item)) ? list.filter(entry => !sameItem(entry, item)) : [item, ...list].slice(0, 48)
      writeJson(FAVORITES, next)
      return next
    })
  }
  function useDrawerItem(item: Recent) {
    if (item.kind === 'sticker') addSticker(item.glyph)
    else if (item.kind === 'frame') addFrame(item.style)
    else if (item.kind === 'photo' || item.kind === 'studio-sticker') {
      if (doc) {
        const source = item.kind === 'photo' ? 'local' : 'studio-sticker'
        addLayer(imageLayer(doc, item.id, source, item.w, item.h, item.name))
        remember(item)
      }
    }
    else void loadTreasures().then(list => { const found = list.find(entry => entry.id === item.id); if (found) void addTreasure(found); else setNotice('That treasure is no longer in your library.') })
  }
  function addLayer(made: Layer) {
    commit(current => ({ ...current, layers: [...current.layers, made] }))
    setSelected(made.id)
    setTab('edit')
  }
  function addSticker(glyph: string) { if (doc) { addLayer(stickerLayer(doc, glyph)); remember({ kind: 'sticker', glyph }) } }
  function addFrame(style: FrameStyle) { if (doc) { addLayer(frameLayer(doc, style)); remember({ kind: 'frame', style }) } }
  function addText(style: TextStyle) { if (doc) { const made = textLayer(doc); made.style = style; addLayer(made) } }
  async function addTreasure(item: Treasure) {
    if (!doc) return
    addLayer({ ...imageLayer(doc, item.id, 'treasure', item.width || 200, item.height || 200, item.name), pixelated: /pixel|blinkie|8-?bit/i.test(item.tags.join(' ') + item.name) })
    remember({ kind: 'treasure', id: item.id, name: item.name })
  }
  async function addImageFiles(files: FileList | null) {
    if (!files || !doc) return
    for (const file of Array.from(files)) {
      if (!IMPORT_TYPES.includes(file.type)) { setNotice(`${file.name} isn’t a PNG, JPEG, WebP or GIF, so it was skipped.`); continue }
      try {
        const media = await saveLocalImage(file)
        if (media.kind !== 'local') continue
        const bitmap = await createImageBitmap(file)
        addLayer(imageLayer(doc, media.id, 'local', bitmap.width, bitmap.height, file.name.slice(0, 60)))
        remember({ kind: 'photo', id: media.id, name: file.name.slice(0, 60), w: bitmap.width, h: bitmap.height })
        bitmap.close()
      } catch (cause) { setNotice(`${file.name}: ${cause instanceof Error ? cause.message : 'couldn’t be added.'}`) }
    }
  }
  function startCollage(layout: CollageLayout) {
    if (dirty && !window.confirm('Start a new strip or collage? Unsaved changes to this project will be lost.')) return
    const now = new Date().toISOString()
    setProject({ id: newId(), name: layout.label.replace(' · ', ' '), createdAt: now, updatedAt: now, doc: collageDoc(layout), sourceContactId: params.source, sourceContactName: params.sourceName })
    setPast([]); setFuture([]); setSelected(null); setDirty(true); setSaved(false); setZoom(0)
  }
  /** A photo strip from the Booth's multi-shot tray: the layout with each spot filled in order. */
  function startStrip(photoIds: string[], layoutId: string) {
    const layout = COLLAGE_LAYOUTS.find(item => item.id === layoutId)
    if (!layout) return
    const fresh = collageDoc(layout)
    let index = 0
    fresh.layers = fresh.layers.map(item => item.type === 'slot' && index < photoIds.length
      ? { ...item, type: 'image' as const, mediaId: photoIds[index], mediaKind: 'local' as const, cover: true, name: `Shot ${++index}` }
      : item)
    const now = new Date().toISOString()
    setProject({ id: newId(), name: 'Booth photo strip', createdAt: now, updatedAt: now, doc: fresh, sourceContactId: params.source, sourceContactName: params.sourceName })
    setPast([]); setFuture([]); setSelected(null); setDirty(true); setSaved(false); setZoom(0); setRecovery(null)
  }
  function chooseSlotPhoto(slotId: string) { fillingSlot.current = slotId; slotInput.current?.click() }
  async function fillSlot(file: File | undefined) {
    const slotId = fillingSlot.current
    fillingSlot.current = null
    if (!file || !slotId || !doc) return
    if (!IMPORT_TYPES.includes(file.type)) { setNotice('Choose a PNG, JPEG, WebP or GIF image.'); return }
    try {
      const media = await saveLocalImage(file)
      if (media.kind !== 'local') return
      commit(current => ({ ...current, layers: current.layers.map(item => item.id === slotId && item.type === 'slot'
        ? { ...item, type: 'image' as const, mediaId: media.id, mediaKind: 'local' as const, cover: true, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) }
        : item) }))
      setSelected(slotId)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'That photo couldn’t be added.') }
  }

  /** Saves images to My Treasures (kept on this PC) without adding them to the photo. */
  async function uploadToMyTreasures(files: FileList | null) {
    if (!files) return
    let added = 0
    for (const file of Array.from(files)) {
      if (!IMPORT_TYPES.includes(file.type)) { setNotice(`${file.name} isn’t a PNG, JPEG, WebP or GIF, so it was skipped.`); continue }
      const duplicate = findDuplicateTreasure(file.name, file.size)
      if (duplicate && !window.confirm(`“${file.name}” is already in My Treasures. Keep both?`)) continue
      try {
        const media = await saveLocalImage(file)
        if (media.kind !== 'local') continue
        const bitmap = await createImageBitmap(file)
        addMyTreasure({ id: media.id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), width: bitmap.width, height: bitmap.height, size: file.size, addedAt: new Date().toISOString() })
        bitmap.close()
        added++
      } catch (cause) { setNotice(`${file.name}: ${cause instanceof Error ? cause.message : 'couldn’t be saved.'}`) }
    }
    if (added) setNotice(`Saved ${added} image${added === 1 ? '' : 's'} to My Treasures. Click one to add it to your photo.`)
  }
  function addMine(item: MyTreasure) {
    if (doc) { addLayer({ ...imageLayer(doc, item.id, 'local', item.width, item.height, item.name), pixelated: Math.max(item.width, item.height) <= 160 }); remember({ kind: 'photo', id: item.id, name: item.name, w: item.width, h: item.height }) }
  }

  async function importMainPhoto(file: File | undefined) {
    if (!file) return
    if (!IMPORT_TYPES.includes(file.type)) { setNotice('Import a PNG, JPEG, WebP or GIF image.'); return }
    try {
      const media = await saveLocalImage(file)
      if (media.kind === 'local') await startFromPhoto(media.id, file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'My photo')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'That photo couldn’t be opened.') }
  }

  function removeSelected() {
    if (!layer || layer.locked) return
    commit(current => ({ ...current, layers: current.layers.filter(item => item.id !== layer.id) }))
    setSelected(null)
  }
  function duplicateSelected() {
    if (!layer) return
    const copy = { ...layer, id: newId(), name: layer.name + ' copy', x: layer.x + 24, y: layer.y + 24, locked: false } as Layer
    commit(current => ({ ...current, layers: [...current.layers, copy] }))
    setSelected(copy.id)
  }
  function moveLayer(id: string, direction: 1 | -1) {
    commit(current => {
      const index = current.layers.findIndex(item => item.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.layers.length) return current
      const layers = [...current.layers]
      ;[layers[index], layers[target]] = [layers[target], layers[index]]
      return { ...current, layers }
    })
  }

  async function saveEditable(asCopy = false) {
    if (!project) return
    try {
      const now = new Date().toISOString()
      const next = { ...project, id: asCopy ? newId() : project.id, updatedAt: now, thumbnail: await thumbnail(project.doc).catch(() => undefined) }
      await saveProject(next)
      setProject(next)
      setDirty(false)
      setSaved(true)
      await clearRecovery().catch(() => {})
      setNotice('Project saved on this PC. Open it any time from File → Open Project.')
    } catch (cause) {
      setNotice((cause instanceof Error ? cause.message : 'Saving failed.') + ' Your work is still open. Try again, or Export Image to keep a copy.')
    }
  }

  async function exportImage(type: 'image/png' | 'image/jpeg', fill: string) {
    if (!project) return
    try {
      const canvas = await renderDoc(project.doc, type === 'image/jpeg' ? fill : undefined)
      const blob = await canvasToBlob(canvas, type, .93)
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.href = url
      link.download = `${project.name.replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'Elsewhere photo'}.${type === 'image/png' ? 'png' : 'jpg'}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      setNotice('Exported to your Downloads folder. Your project is still open.')
      setDialog('')
    } catch (cause) {
      setNotice((cause instanceof Error ? cause.message : 'Export failed.') + ' Your project is unchanged. Try again.')
    }
  }

  async function useInMessenger() {
    if (!project?.sourceContactId) return
    try {
      const canvas = await renderDoc(project.doc)
      let blob = await canvasToBlob(canvas, 'image/png')
      if (blob.size > 7.5 * 1024 * 1024) blob = await canvasToBlob(canvas, 'image/jpeg', .92)
      const media = await saveLocalImage(new File([blob], `${project.name}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type }))
      const detail = { contactId: project.sourceContactId, media }
      if (isTauri()) await emit('elsewhere:photo-booth:stage-remote', detail)
      else window.dispatchEvent(new CustomEvent('elsewhere:photo-booth:stage-remote', { detail }))
      setDialog('')
      setNotice(`Your photo is waiting in your chat with ${project.sourceContactName || 'your friend'}. Press Send photo there when you’re ready.`)
    } catch (cause) {
      setNotice((cause instanceof Error ? cause.message : 'That didn’t work.') + ' Your project is still open.')
    }
  }

  async function saveFinishedToGallery() {
    if (!project) return
    try {
      const canvas = await renderDoc(project.doc)
      const blob = await canvasToBlob(canvas, 'image/png')
      await saveToGallery(blob, project.name, project.doc.kind === 'strip' ? 'strip' : 'photo', project.id)
      setNotice('Saved to My Gallery. Find it under File → My Gallery.')
      setDialog('')
    } catch (cause) {
      setNotice((cause instanceof Error ? cause.message : 'Saving to the Gallery failed.') + ' Your project is still open.')
    }
  }
  /** Opens a Gallery photo as a new project (the gallery copy stays as it is). */
  async function editGalleryImage(blob: Blob, name: string) {
    try {
      const media = await saveLocalImage(new File([blob], name + '.png', { type: blob.type || 'image/png' }))
      if (media.kind === 'local') await startFromPhoto(media.id, name + ' (edit)')
      setDialog('')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'That photo couldn’t be opened.') }
  }

  async function useAsElsewherePicture() {
    if (!project) return
    try {
      const canvas = await renderDoc(project.doc)
      const blob = await canvasToBlob(canvas, 'image/png')
      const media = await saveLocalImage(new File([blob], 'elsewhere-picture.png', { type: 'image/png' }))
      if (media.kind !== 'local') return
      if (isTauri()) await emit('elsewhere:studio:profile-photo', { mediaId: media.id })
      else window.dispatchEvent(new CustomEvent('elsewhere:studio:profile-photo', { detail: { mediaId: media.id } }))
      setNotice('Sent to your Elsewhere picture. Check your buddy list.')
      setDialog('')
    } catch { setNotice('Your Elsewhere picture couldn’t be updated.') }
  }

  function closeWindow(force = false) {
    if (!force && dirty) { setDialog('close'); return }
    void clearRecovery().catch(() => {})
    if (isTauri()) void getCurrentWindow().close()
    else window.history.back()
  }

  // Keyboard shortcuts.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as Element | null
      const typing = typeof target?.closest === 'function' ? target.closest('input, textarea, select') : null
      if (event.key === 'Escape') { setMenu(''); if (dialog && dialog !== 'close') setDialog(''); return }
      if (typing) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); undo() }
      else if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) { event.preventDefault(); redo() }
      else if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void saveEditable() }
      else if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected() }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && layer) { event.preventDefault(); removeSelected() }
      else if (layer && !layer.locked && event.key.startsWith('Arrow')) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        updateLayer(layer.id, { x: layer.x + dx, y: layer.y + dy })
      } else if (mod && (event.key === '=' || event.key === '+')) { event.preventDefault(); setZoom(value => clamp((value || fitScale()) * 1.2, .1, 4)) }
      else if (mod && event.key === '-') { event.preventDefault(); setZoom(value => clamp((value || fitScale()) / 1.2, .1, 4)) }
      else if (mod && event.key === '0') { event.preventDefault(); setZoom(0) }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  // Fit-to-window zoom.
  const [, setResize] = useState(0)
  useEffect(() => {
    const observer = new ResizeObserver(() => setResize(value => value + 1))
    if (stageWrap.current) observer.observe(stageWrap.current)
    return () => observer.disconnect()
  }, [project?.id])
  function fitScale() {
    const box = stageWrap.current
    if (!box || !doc) return .5
    return clamp(Math.min((box.clientWidth - 48) / doc.width, (box.clientHeight - 48) / doc.height), .05, 2)
  }
  const scale = zoom || fitScale()

  // Dragging, resizing and rotating on the canvas.
  const drag = useRef<{ id: string; mode: 'move' | 'resize' | 'rotate'; startX: number; startY: number; origin: Layer; before: StudioDoc; centerX: number; centerY: number; moved: boolean } | null>(null)
  function startDrag(event: ReactPointerEvent, item: Layer, mode: 'move' | 'resize' | 'rotate') {
    event.stopPropagation()
    setSelected(item.id)
    if (item.locked || !doc) return
    const rect = (event.currentTarget as HTMLElement).closest('.ew-studio-layer')?.getBoundingClientRect()
    drag.current = { id: item.id, mode, startX: event.clientX, startY: event.clientY, origin: item, before: doc,
      centerX: rect ? rect.left + rect.width / 2 : event.clientX, centerY: rect ? rect.top + rect.height / 2 : event.clientY, moved: false }
    try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) } catch { /* dragging still works without capture */ }
  }
  function moveDrag(event: ReactPointerEvent) {
    const state = drag.current
    if (!state) return
    const dx = (event.clientX - state.startX) / scale
    const dy = (event.clientY - state.startY) / scale
    const o = state.origin
    let patch: Partial<Layer>
    if (state.mode === 'move') patch = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
    else if (state.mode === 'resize') {
      const keepRatio = o.type !== 'frame' && !event.shiftKey
      let w = Math.max(12, o.w + dx)
      let h = Math.max(12, o.h + dy)
      if (keepRatio) { const ratio = o.w / o.h; if (w / h > ratio) h = w / ratio; else w = h * ratio }
      patch = { w: Math.round(w), h: Math.round(h), ...(o.type === 'text' ? { size: Math.max(6, Math.round(o.size * (h / o.h))) } : {}) }
    } else {
      const angle = Math.atan2(event.clientY - state.centerY, event.clientX - state.centerX) * 180 / Math.PI + 90
      patch = { rotation: Math.round(event.shiftKey ? angle : Math.round(angle / 5) * 5) }
    }
    state.moved = true
    preview(current => ({ ...current, layers: current.layers.map(item => item.id === state.id ? { ...item, ...patch } as Layer : item) }))
  }
  function endDrag() {
    const state = drag.current
    drag.current = null
    if (!state || !state.moved) return
    setPast(list => [...list.slice(-79), state.before])
    setFuture([])
    setDirty(true)
  }

  const [treasures, setTreasures] = useState<Treasure[] | null>(null)
  const revision = useTreasureRevision()
  useEffect(() => {
    if (category !== 'treasures') return
    let active = true
    void loadTreasures().then(items => { if (active) setTreasures(items) }, () => { if (active) setTreasures([]) })
    return () => { active = false }
  }, [category, revision])

  // ---------- Start screen ----------
  if (!project || !doc) {
    return <div className="ew-studio ew-studio-start">
      <div className="ew-studio-titlebar" data-tauri-drag-region>
        <span className="ew-studio-title" data-tauri-drag-region>Elsewhere Creative Studio ✧</span>
        <button type="button" className="ew-studio-close" onClick={() => closeWindow(true)} aria-label="Close Creative Studio">×</button>
      </div>
      <div className="ew-studio-welcome">
        <h1>Let’s make something cute ♡</h1>
        {recovery && <div className="ew-studio-recovery" role="alert">
          <p>Creative Studio closed before you saved <strong>{recovery.name}</strong>. Want it back?</p>
          <button type="button" onClick={() => { setProject(recovery); setRecovery(null); setDirty(true) }}>Restore Session</button>
          <button type="button" onClick={() => { void clearRecovery(); setRecovery(null) }}>Discard Recovery</button>
        </div>}
        <div className="ew-studio-start-actions">
          <button type="button" className="ew-studio-big" onClick={() => { const now = new Date().toISOString(); setProject({ id: newId(), name: 'Untitled creation', createdAt: now, updatedAt: now, doc: blankDoc(), sourceContactId: params.source, sourceContactName: params.sourceName }) }}>🧁 Blank Canvas</button>
          <button type="button" className="ew-studio-big" onClick={() => importInput.current?.click()}>📷 Import Photo…</button>
          <button type="button" className="ew-studio-big" onClick={() => setDialog('open')}>📂 Open Project…</button>
          <button type="button" className="ew-studio-big" onClick={() => setDialog('gallery')}>🖼️ My Gallery…</button>
        </div>
        <p className="ew-studio-hint">Start with a blank canvas and make anything: collages, stationery, little graphics. Or take a photo with the Webcam button in a chat, then choose “Take photo to Creative Studio”.</p>
        {notice && <p className="ew-studio-notice" role="status">{notice}</p>}
      </div>
      <input ref={importInput} type="file" hidden accept={IMPORT_TYPES.join(',')} onChange={event => { void importMainPhoto(event.target.files?.[0]); event.target.value = '' }} />
      {dialog === 'open' && <OpenProject onClose={() => setDialog('')} onOpen={found => { setProject(found); setSaved(true); setDialog('') }} />}
      {dialog === 'gallery' && <GalleryDialog onClose={() => setDialog('')} onOpenProject={found => { setProject(found); setSaved(true); setDialog('') }}
        onEditImage={(blob, name) => void editGalleryImage(blob, name)} />}
    </div>
  }

  // ---------- Editor ----------
  const menus: Record<string, { label: string; action: () => void; disabled?: boolean }[]> = {
    File: [
      { label: 'Import Photo…', action: () => importInput.current?.click() },
      { label: 'Open Project…', action: () => setDialog('open') },
      { label: 'My Gallery…', action: () => setDialog('gallery') },
      { label: 'Save Project', action: () => void saveEditable() },
      { label: 'Save Project As Copy', action: () => void saveEditable(true) },
      { label: 'Export Image…', action: () => setDialog('export') },
      { label: 'Finish…', action: () => setDialog('finish') },
      { label: 'Close', action: () => closeWindow() },
    ],
    Edit: [
      { label: 'Undo  (Ctrl+Z)', action: undo, disabled: !past.length },
      { label: 'Redo  (Ctrl+Y)', action: redo, disabled: !future.length },
      { label: 'Duplicate  (Ctrl+D)', action: duplicateSelected, disabled: !layer },
      { label: 'Delete  (Del)', action: removeSelected, disabled: !layer || layer.locked },
    ],
    View: [
      { label: 'Zoom In  (Ctrl +)', action: () => setZoom(clamp(scale * 1.2, .05, 4)) },
      { label: 'Zoom Out  (Ctrl −)', action: () => setZoom(clamp(scale / 1.2, .05, 4)) },
      { label: 'Fit to Window  (Ctrl 0)', action: () => setZoom(0) },
      { label: workspace.drawer ? 'Hide Quick Drawer' : 'Show Quick Drawer', action: () => setWorkspace({ ...workspace, drawer: !workspace.drawer }) },
      { label: 'Reset Workspace', action: () => { setWorkspace({ drawer: true }); setZoom(0); setTab('library'); setCategory('stickers') } },
    ],
    Insert: [
      { label: 'Text', action: () => addText('bubble') },
      { label: 'Image from this PC…', action: () => addImageInput.current?.click() },
      { label: 'Sticker…', action: () => { setCategory('stickers'); setTab('library') } },
      { label: 'Frame…', action: () => { setCategory('frames'); setTab('library') } },
    ],
    Skins: [
      { label: 'Skin Wardrobe…', action: () => setDialog('wardrobe') },
      { label: 'SkinMapper: design a Messenger skin…', action: () => void openSkinMapper().catch(console.error) },
      { label: look === 'classic' ? '✓ Classic (default)' : 'Restore Classic', action: () => { setLook('classic'); writeWardrobe('classic') } },
    ],
    Help: [
      { label: 'Shortcuts: Ctrl+Z undo · Ctrl+Y redo · Ctrl+S save · Ctrl+D duplicate · Del delete · arrows nudge (Shift = 10px) · Shift while resizing = free shape', action: () => {}, disabled: true },
    ],
  }

  const skinSet = drawerSet(look)
  const drawerTabs: { id: DrawerTab; label: string }[] = [
    { id: 'recent', label: '🕘 Recent' }, { id: 'favorites', label: '♡ Favorites' },
    { id: 'set', label: skinSet.label }, { id: 'photos', label: '📷 Photo Tray' },
  ]
  const drawerItems: Recent[] = drawerTab === 'recent' ? recents.filter(item => item.kind !== 'photo')
    : drawerTab === 'favorites' ? favorites
      : drawerTab === 'set' ? skinSet.glyphs.map(glyph => ({ kind: 'sticker' as const, glyph }))
        : recents.filter(item => item.kind === 'photo')
  return <div className="ew-studio" data-wardrobe={look === 'classic' ? undefined : look} style={skinStyle(look) as CSSProperties} onPointerDown={() => setMenu('')}>
    <div className="ew-studio-titlebar" data-tauri-drag-region>
      <span className="ew-studio-title" data-tauri-drag-region>{project.name}{dirty ? ' •' : ''} · Elsewhere Creative Studio ✧</span>
      <SkinMotif skin={look} slot="title" />
      {project.sourceContactId && <span className="ew-studio-source" title="Use in Messenger goes back to this conversation">for {project.sourceContactName || 'your chat'}</span>}
      <button type="button" className="ew-studio-close" onClick={() => closeWindow()} aria-label="Close Creative Studio">×</button>
    </div>
    <div className="ew-studio-menubar" onPointerDown={event => event.stopPropagation()}>
      {Object.keys(menus).map(name => <div className="ew-studio-menu" key={name}>
        <button type="button" aria-expanded={menu === name} onClick={() => setMenu(menu === name ? '' : name)}>{name}</button>
        {menu === name && <div className="ew-studio-dropdown" role="menu">
          {menus[name].map(item => <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
            onClick={() => { setMenu(''); item.action() }}>{item.label}</button>)}
        </div>}
      </div>)}
      <div className="ew-studio-quick">
        <button type="button" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">↶</button>
        <button type="button" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)">↷</button>
        <button type="button" onClick={() => void saveEditable()} title="Save project (Ctrl+S)">💾 Save</button>
        <button type="button" className="ew-studio-finish" onClick={() => setDialog('finish')}>Finish ✧</button>
      </div>
    </div>

    <div className={'ew-studio-body' + (workspace.drawer ? '' : ' no-drawer')}>
      <nav className="ew-studio-toolbox" aria-label="Decorating tools">
        {CATEGORIES.map(item => <button key={item.id} type="button" className={category === item.id ? 'is-active' : ''}
          aria-pressed={category === item.id} title={item.ready ? item.label : item.label + ' (coming in Phase 2)'}
          onClick={() => { setCategory(item.id); setTab('library') }}>
          <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
        </button>)}
        <SkinMotif skin={look} slot="toolbox" />
      </nav>

      <main className="ew-studio-canvas-wrap" ref={stageWrap} onPointerDown={() => setSelected(null)}>
        <div className={'ew-studio-stage' + (doc.background === 'transparent' ? ' is-transparent' : '')}
          style={{ width: doc.width * scale, height: doc.height * scale, background: doc.background === 'transparent' ? undefined : doc.background }}>
          {doc.photoId && <StudioImage id={doc.photoId} kind="local" className="ew-studio-photo" style={{ filter: FILTERS[doc.filter].css(doc.filterStrength) }} />}
          {doc.layers.map(item => <div key={item.id}
            className={'ew-studio-layer' + (item.id === selected ? ' is-selected' : '') + (item.locked ? ' is-locked' : '') + (item.hidden ? ' is-hidden' : '')}
            style={{ left: item.x * scale, top: item.y * scale, width: item.w * scale, height: item.h * scale, opacity: item.opacity,
              transform: `rotate(${item.rotation}deg)` }}
            onPointerDown={event => startDrag(event, item, 'move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            onDoubleClick={() => item.type === 'slot' ? chooseSlotPhoto(item.id) : setTab('edit')}>
            <div className="ew-studio-layer-content" style={{ transform: item.flipX ? 'scaleX(-1)' : undefined, imageRendering: item.pixelated ? 'pixelated' : undefined }}>
              <LayerView layer={item} scale={scale} />
            </div>
            {item.id === selected && !item.locked && <>
              <span className="ew-studio-handle is-resize" onPointerDown={event => startDrag(event, item, 'resize')} onPointerMove={moveDrag} onPointerUp={endDrag} title="Drag to resize (Shift: free shape)" />
              <span className="ew-studio-handle is-rotate" onPointerDown={event => startDrag(event, item, 'rotate')} onPointerMove={moveDrag} onPointerUp={endDrag} title="Drag to rotate (Shift: free angle)" />
            </>}
          </div>)}
          {pen.on && <div className="ew-studio-pen-overlay"
          onPointerDown={event => {
            event.stopPropagation()
            try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) } catch { /* keep drawing without capture */ }
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
            const x = (event.clientX - rect.left) / scale, y = (event.clientY - rect.top) / scale
            const stroke = { points: [x, y], color: pen.color, size: pen.size }
            const existing = selected ? doc.layers.find(item => item.id === selected && item.type === 'draw') : undefined
            if (existing && existing.type === 'draw') {
              penStroke.current = { layerId: existing.id, before: doc }
              preview(current => ({ ...current, layers: current.layers.map(item => item.id === existing.id && item.type === 'draw' ? { ...item, strokes: [...item.strokes, { ...stroke, points: [x * item.baseW / item.w - item.x * item.baseW / item.w, y * item.baseH / item.h - item.y * item.baseH / item.h] }] } : item) }))
            } else {
              const made = drawLayer(doc)
              made.strokes = [stroke]
              penStroke.current = { layerId: made.id, before: doc }
              preview(current => ({ ...current, layers: [...current.layers, made] }))
              setSelected(made.id)
            }
          }}
          onPointerMove={event => {
            const state = penStroke.current
            if (!state) return
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
            const x = (event.clientX - rect.left) / scale, y = (event.clientY - rect.top) / scale
            preview(current => ({ ...current, layers: current.layers.map(item => {
              if (item.id !== state.layerId || item.type !== 'draw') return item
              const strokes = [...item.strokes]
              const last = strokes[strokes.length - 1]
              const lx = (x - item.x) * item.baseW / item.w, ly = (y - item.y) * item.baseH / item.h
              strokes[strokes.length - 1] = { ...last, points: [...last.points, Math.round(lx * 10) / 10, Math.round(ly * 10) / 10] }
              return { ...item, strokes }
            }) }))
          }}
          onPointerUp={() => {
            const state = penStroke.current
            penStroke.current = null
            if (!state) return
            setPast(list => [...list.slice(-79), state.before]); setFuture([]); setDirty(true)
          }} />}
        </div>
        <div className="ew-studio-zoom">{Math.round(scale * 100)}% · {doc.width}×{doc.height}px · dashed edge = what gets saved</div>
      </main>

      <aside className="ew-studio-desk" aria-label="Decoration Desk">
        <div className="ew-studio-tabs" role="tablist">
          {(['library', 'edit', 'layers'] as const).map(name => <button key={name} type="button" role="tab" aria-selected={tab === name}
            className={tab === name ? 'is-active' : ''} onClick={() => setTab(name)}>{name === 'library' ? 'Library' : name === 'edit' ? 'Edit' : 'Layers'}</button>)}
        </div>
        <div className="ew-studio-desk-body">
          {tab === 'library' && <Library category={category} doc={doc} treasures={treasures}
            onStudioSticker={useDrawerItem} onSticker={addSticker} onFrame={addFrame} onText={addText} onTreasure={item => void addTreasure(item)}
            onAddImage={() => addImageInput.current?.click()}
            onUploadMine={() => treasureInput.current?.click()} onMine={addMine} onCollage={startCollage}
            onStationery={style => doc && addLayer(stationeryLayer(doc, style))} onMiniUi={style => doc && addLayer(miniUiLayer(doc, style))}
            pen={pen} onPen={next => { setPen(next); if (next.on) setSelected(null) }}
            onFilter={(filter, strength) => commit(current => ({ ...current, filter, filterStrength: strength }))}
            onBackground={background => commit(current => ({ ...current, background }))} />}
          {tab === 'edit' && layer?.type === 'slot' && <div className="ew-studio-edit"><p className="ew-studio-hint">This is an empty photo spot.</p>
            <button type="button" className="ew-studio-add" onClick={() => chooseSlotPhoto(layer.id)}>📷 Choose a photo…</button></div>}
          {tab === 'edit' && layer?.type !== 'slot' && <EditPanel layer={layer} onChange={patch => layer && updateLayer(layer.id, patch)}
            onDuplicate={duplicateSelected} onDelete={removeSelected}
            onForward={() => layer && moveLayer(layer.id, 1)} onBackward={() => layer && moveLayer(layer.id, -1)} />}
          {tab === 'layers' && <LayersPanel doc={doc} selected={selected} onSelect={id => { setSelected(id); setTab('edit') }}
            onToggle={(id, key) => { const item = doc.layers.find(entry => entry.id === id); if (item) updateLayer(id, { [key]: !item[key] } as Partial<Layer>) }}
            onRename={(id, name) => updateLayer(id, { name })} onMove={moveLayer} />}
        </div>
      </aside>

      {workspace.drawer && <section className="ew-studio-drawer" aria-label="Quick Drawer">
        <div className="ew-studio-drawer-head">
          <div className="ew-studio-drawer-tabs" role="tablist" aria-label="Drawer">
            {drawerTabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={drawerTab === item.id} className={drawerTab === item.id ? 'is-active' : ''}
              onClick={() => setDrawerTab(item.id)}>{item.label}</button>)}
          </div>
          <button type="button" onClick={() => setWorkspace({ ...workspace, drawer: false })} aria-label="Hide Quick Drawer">▾ Hide</button></div>
        <div className="ew-studio-drawer-items" role="tabpanel">
          {!drawerItems.length && <span className="ew-studio-hint">{DRAWER_EMPTY[drawerTab]}</span>}
          {drawerItems.map((item, index) => <div key={index} className="ew-studio-chip-wrap">
            <button type="button" className="ew-studio-chip"
              title={item.kind === 'sticker' ? 'Sticker' : item.kind === 'frame' ? FRAMES[item.style] + ' frame' : item.name}
              onClick={() => useDrawerItem(item)}>
              {item.kind === 'sticker' ? item.glyph : item.kind === 'frame' ? '🖼️' : <StudioImage id={item.id} kind={item.kind === 'photo' ? 'local' : item.kind} className="ew-studio-chip-img" />}
            </button>
            <button type="button" className={'ew-studio-chip-fav' + (favorites.some(entry => sameItem(entry, item)) ? ' is-on' : '')}
              aria-pressed={favorites.some(entry => sameItem(entry, item))} aria-label={favorites.some(entry => sameItem(entry, item)) ? 'Remove from Favorites' : 'Add to Favorites'}
              onClick={() => toggleFavorite(item)}>♡</button>
          </div>)}
        </div>
        <SkinMotif skin={look} slot="drawer" />
      </section>}
      {!workspace.drawer && <button type="button" className="ew-studio-drawer-show" onClick={() => setWorkspace({ ...workspace, drawer: true })}>▴ Quick Drawer</button>}
    </div>

    {notice && <div className="ew-studio-toast" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

    <input ref={importInput} type="file" hidden accept={IMPORT_TYPES.join(',')} onChange={event => { void importMainPhoto(event.target.files?.[0]); event.target.value = '' }} />
    <input ref={addImageInput} type="file" hidden multiple accept={IMPORT_TYPES.join(',')} onChange={event => { void addImageFiles(event.target.files); event.target.value = '' }} />
    <input ref={slotInput} type="file" hidden accept={IMPORT_TYPES.join(',')} onChange={event => { void fillSlot(event.target.files?.[0]); event.target.value = '' }} />
    <input ref={treasureInput} type="file" hidden multiple accept={IMPORT_TYPES.join(',')} onChange={event => { void uploadToMyTreasures(event.target.files); event.target.value = '' }} />

    {dialog === 'open' && <OpenProject onClose={() => setDialog('')} onOpen={found => { setProject(found); setPast([]); setFuture([]); setSelected(null); setSaved(true); setDirty(false); setDialog('') }} />}
    {dialog === 'wardrobe' && <WardrobeDialog current={look} onPreview={setLook}
      onChoose={next => { setLook(next); writeWardrobe(next); setDialog('') }}
      onCancel={() => { setLook(readWardrobe()); setDialog('') }} />}
    {dialog === 'gallery' && <GalleryDialog onClose={() => setDialog('')}
      onOpenProject={found => { if (dirty && !window.confirm('Open this project? Unsaved changes to the current one will be lost.')) return; setProject(found); setPast([]); setFuture([]); setSelected(null); setSaved(true); setDirty(false); setDialog('') }}
      onEditImage={(blob, name) => { if (dirty && !window.confirm('Start a new project? Unsaved changes to the current one will be lost.')) return; void editGalleryImage(blob, name) }} />}
    {dialog === 'export' && <ExportDialog onClose={() => setDialog('')} onExport={(type, fill) => void exportImage(type, fill)}
      hasTransparency={doc.background === 'transparent'} />}
    {dialog === 'finish' && <div className="ew-studio-modal" role="dialog" aria-modal="true" aria-label="Finish">
      <div className="ew-studio-modal-box">
        <h2>All done? ♡</h2>
        <div className="ew-studio-finish-grid">
          <button type="button" onClick={() => void useInMessenger()} disabled={!project.sourceContactId}
            title={project.sourceContactId ? 'Adds it to your chat as an unsent photo' : 'Open Creative Studio from a chat’s Webcam button to send to that chat'}>
            💌 Use in Messenger{project.sourceContactName ? <small>to {project.sourceContactName}</small> : <small>open from a chat to use this</small>}</button>
          <button type="button" onClick={() => void saveFinishedToGallery()}>🖼️ Save to Gallery<small>a finished copy on this PC</small></button>
          <button type="button" onClick={() => void saveEditable()}>💾 Save Editable Project<small>{saved && !dirty ? 'saved' : 'keep editing later'}</small></button>
          <button type="button" onClick={() => setDialog('export')}>⬇️ Export Image<small>PNG or JPEG</small></button>
          <button type="button" onClick={() => void useAsElsewherePicture()}>🪞 Use as Elsewhere Picture<small>your buddy list photo</small></button>
          <button type="button" onClick={() => setDialog('')}>✏️ Continue Editing<small>back to your photo</small></button>
        </div>
        <p className="ew-studio-hint">Nothing is ever sent automatically. You choose when to send from Messenger.</p>
      </div>
    </div>}
    {dialog === 'close' && <div className="ew-studio-modal" role="dialog" aria-modal="true" aria-label="Unsaved changes">
      <div className="ew-studio-modal-box">
        <h2>Save your changes?</h2>
        <p>“{project.name}” has edits that aren’t saved as a project.</p>
        <div className="ew-studio-modal-actions">
          <button type="button" onClick={() => void saveEditable().then(() => closeWindow(true))}>Save</button>
          <button type="button" onClick={() => closeWindow(true)}>Discard</button>
          <button type="button" onClick={() => setDialog('')}>Cancel</button>
        </div>
      </div>
    </div>}
  </div>
}

function StudioImage({ id, kind, className, style }: { id: string; kind: 'local' | 'treasure' | 'studio-sticker'; className?: string; style?: React.CSSProperties }) {
  const revision = useTreasureRevision()
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => { let alive = true; void mediaUrl(id, kind).then(value => { if (alive) setUrl(value) }); return () => { alive = false } }, [id, kind, revision])
  if (url === null) return <span className={'ew-studio-missing ' + (className || '')} title="This image is missing from this PC">Missing image</span>
  if (!url) return null
  return <img src={url} alt="" className={className} style={style} draggable={false} />
}

function DrawnCanvas({ layer, scale }: { layer: Extract<Layer, { type: 'stationery' | 'mini-ui' | 'draw' }>; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(layer.w * scale * ratio))
    canvas.height = Math.max(1, Math.round(layer.h * scale * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0)
    ctx.clearRect(0, 0, layer.w, layer.h)
    if (layer.type === 'stationery') drawStationery(ctx, layer.w, layer.h, layer.style, layer.color)
    else if (layer.type === 'mini-ui') drawMiniUi(ctx, layer.w, layer.h, layer.style, layer.title, layer.lines)
    else { ctx.scale(layer.w / layer.baseW, layer.h / layer.baseH); drawStrokes(ctx, layer.strokes) }
  })
  return <canvas ref={ref} className="ew-studio-fill" />
}

function LayerView({ layer, scale }: { layer: Layer; scale: number }) {
  if (layer.type === 'stationery' || layer.type === 'mini-ui' || layer.type === 'draw') return <DrawnCanvas layer={layer} scale={scale} />
  if (layer.type === 'slot') return <span className="ew-studio-slot" style={{ fontSize: Math.max(10, Math.min(layer.w, layer.h) * scale * .08) }}>📷<br />Add a photo</span>
  if (layer.type === 'image') return <StudioImage id={layer.mediaId} kind={layer.mediaKind} className="ew-studio-fill" style={layer.cover ? { objectFit: 'cover' } : undefined} />
  if (layer.type === 'sticker') return <span className="ew-studio-sticker" style={{ fontSize: layer.h * scale * .86 }}>{layer.glyph}</span>
  if (layer.type === 'text') {
    const style = TEXT_STYLES[layer.style]
    return <span className="ew-studio-text" style={{ font: textFont({ ...layer, size: layer.size * scale }), fontWeight: style.weight, color: layer.color,
      textAlign: layer.align, WebkitTextStroke: layer.outline && layer.outline !== 'transparent' ? `${Math.max(1, layer.size * scale * .07)}px ${layer.outline}` : undefined,
      paintOrder: 'stroke fill', textShadow: layer.style === 'glitter' ? '0 0 8px #fff6ba' : undefined }}>{layer.text}</span>
  }
  return <FramePreview layer={layer} scale={scale} />
}

function FramePreview({ layer, scale }: { layer: Extract<Layer, { type: 'frame' }>; scale: number }) {
  const unit = Math.min(layer.w, layer.h) * scale
  const c = layer.color
  if (layer.style === 'polaroid') return <div className="ew-studio-fill" style={{ borderStyle: 'solid', borderColor: c, borderWidth: `${unit * .05}px ${unit * .05}px ${unit * .18}px` }} />
  if (layer.style === 'dashed-stitch') return <div className="ew-studio-fill" style={{ outline: `${Math.max(1, unit * .008)}px dashed ${c}`, outlineOffset: -unit * .035 }} />
  if (layer.style === 'film-strip') return <div className="ew-studio-fill" style={{ borderTop: `${unit * .09}px solid ${c}`, borderBottom: `${unit * .09}px solid ${c}` }} />
  const width = unit * (layer.style === 'pink-bubble' ? .07 : .045)
  return <div className="ew-studio-fill" style={{ border: `${width}px solid ${c}`, borderRadius: unit * (layer.style === 'pink-bubble' ? .09 : .03),
    boxShadow: layer.style === 'sky-glass' ? `inset 0 0 0 ${width * .18}px rgba(255,255,255,.85)` : undefined }} />
}

function Library({ category, doc, treasures, onStudioSticker, onSticker, onFrame, onText, onTreasure, onAddImage, onFilter, onBackground, onUploadMine, onMine, onCollage, onStationery, onMiniUi, pen, onPen }: {
  category: Category; doc: StudioDoc; treasures: Treasure[] | null
  onStudioSticker: (item: { kind: 'studio-sticker'; id: string; name: string; w: number; h: number }) => void
  onSticker: (glyph: string) => void; onFrame: (style: FrameStyle) => void; onText: (style: TextStyle) => void
  onTreasure: (item: Treasure) => void; onAddImage: () => void; onFilter: (filter: FilterName, strength: number) => void; onBackground: (value: string) => void
  onUploadMine: () => void; onMine: (item: MyTreasure) => void; onCollage: (layout: CollageLayout) => void
  onStationery: (style: StationeryStyle) => void; onMiniUi: (style: MiniUiStyle) => void
  pen: { on: boolean; color: string; size: number }; onPen: (pen: { on: boolean; color: string; size: number }) => void
}) {
  const [mine, setMine] = useState<MyTreasure[]>(listMyTreasures)
  useEffect(() => watchMyTreasures(() => setMine(listMyTreasures())), [])
  const [search, setSearch] = useState('')
  const [thumb, setThumb] = useState(64)
  const info = CATEGORIES.find(item => item.id === category)!
  if (!info.ready) return <div className="ew-studio-empty"><span aria-hidden="true">{info.icon}</span>
    <p><strong>{info.label}</strong> is coming in Phase 2, along with your own asset packs.</p></div>
  if (category === 'stickers') {
    const list = STARTER_STICKERS.filter(glyph => !search || glyph.includes(search))
    return <>
      <input type="search" className="ew-studio-search" aria-label="Search stickers" placeholder="Search stickers or packs"
        value={search} onChange={event => setSearch(event.target.value)} />
      <div className="ew-studio-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumb}px, 1fr))` }}>
        {Array.from(studioStickers.values()).filter(art => (art.pack + ' ' + art.name).toLowerCase().includes(search.trim().toLowerCase())).map(art => (
          <button key={art.id} type="button" className="ew-studio-tile" style={{ height: thumb }}
            title={art.pack + ' / ' + art.name} aria-label={art.name} onClick={event => {
              const img = event.currentTarget.querySelector('img')
              if (img?.naturalWidth && img.naturalHeight) {
                onStudioSticker({ kind: 'studio-sticker', id: art.id, name: art.name, w: img.naturalWidth, h: img.naturalHeight })
              }
            }}>
            <img src={art.url} alt="" className="ew-studio-tile-img" draggable={false} />
          </button>
        ))}
        {list.map(glyph => <button key={glyph} type="button" className="ew-studio-tile" style={{ fontSize: thumb * .55, height: thumb }} onClick={() => onSticker(glyph)} title="Add sticker">{glyph}</button>)}
      </div>
      <label className="ew-studio-slider">Thumbnail size<input type="range" min={40} max={110} value={thumb} onChange={event => setThumb(Number(event.target.value))} /></label>
    </>
  }
  if (category === 'stationery') return <div className="ew-studio-list">
    <p className="ew-studio-hint">Drawn by Elsewhere. Your own stationery packs will appear here too once added. Change colors in Edit.</p>
    {(Object.keys(STATIONERY) as StationeryStyle[]).map(style => <button key={style} type="button" onClick={() => onStationery(style)}>📎 {STATIONERY[style]}</button>)}
  </div>
  if (category === 'mini-ui') return <div className="ew-studio-list">
    <p className="ew-studio-hint">Little pretend windows for your photo. You type every word in them. They never show your real chats.</p>
    {(Object.keys(MINI_UI) as MiniUiStyle[]).map(style => <button key={style} type="button" onClick={() => onMiniUi(style)}>💬 {MINI_UI[style]}</button>)}
  </div>
  if (category === 'draw') return <div className="ew-studio-list">
    <button type="button" className={pen.on ? 'is-active' : ''} aria-pressed={pen.on} onClick={() => onPen({ ...pen, on: !pen.on })}>🖌️ {pen.on ? 'Drawing… (click to stop)' : 'Draw on your photo'}</button>
    <label className="ew-studio-field">Pen color<input type="color" value={pen.color} onChange={event => onPen({ ...pen, color: event.target.value })} /></label>
    <label className="ew-studio-slider">Pen size {pen.size}px<input type="range" min={2} max={60} value={pen.size} onChange={event => onPen({ ...pen, size: Number(event.target.value) })} /></label>
    <p className="ew-studio-hint">Each drawing session becomes its own layer you can move, hide or delete. Stamps are in Stickers.</p>
  </div>
  if (category === 'collage') return <div className="ew-studio-list">
    <p className="ew-studio-hint">Start a strip or collage, then click each photo spot to fill it. Your current project stays saved if you saved it.</p>
    {COLLAGE_LAYOUTS.map(layout => <button key={layout.id} type="button" onClick={() => onCollage(layout)}>{layout.kind === 'strip' ? '🎞️' : '🧩'} {layout.label}</button>)}
  </div>
  if (category === 'frames') return <div className="ew-studio-list">
    {(Object.keys(FRAMES) as FrameStyle[]).map(style => <button key={style} type="button" onClick={() => onFrame(style)}>🖼️ {FRAMES[style]}</button>)}
  </div>
  if (category === 'text') return <div className="ew-studio-list">
    {(Object.keys(TEXT_STYLES) as TextStyle[]).map(style => <button key={style} type="button" onClick={() => onText(style)}
      style={{ fontFamily: TEXT_STYLES[style].font, fontWeight: TEXT_STYLES[style].weight }}>Add {TEXT_STYLES[style].label} text</button>)}
  </div>
  if (category === 'filters') return <div className="ew-studio-list">
    <p className="ew-studio-hint">Filters change how your photo looks without changing the original.</p>
    {(Object.keys(FILTERS) as FilterName[]).map(name => <button key={name} type="button" className={doc.filter === name ? 'is-active' : ''}
      onClick={() => onFilter(name, doc.filterStrength)}>{FILTERS[name].label}</button>)}
    <label className="ew-studio-slider">Strength {Math.round(doc.filterStrength * 100)}%
      <input type="range" min={0} max={100} value={Math.round(doc.filterStrength * 100)} onChange={event => onFilter(doc.filter, Number(event.target.value) / 100)} /></label>
    <label className="ew-studio-field">Background
      <select value={doc.background} onChange={event => onBackground(event.target.value)}>
        <option value="#ffffff">Pearl white</option><option value="#dff1ff">Sky</option><option value="#ffe3f0">Strawberry milk</option>
        <option value="#fff6df">Vanilla</option><option value="transparent">Transparent</option>
      </select></label>
  </div>
  // Web Treasures: the Elsewhere Collection (built in, credited) and My Treasures (the person's own uploads).
  const term = search.toLowerCase()
  const collection = (treasures || []).filter(item => !term || (item.name + ' ' + item.tags.join(' ') + ' ' + item.creator).toLowerCase().includes(term))
  const own = mine.filter(item => !term || item.name.toLowerCase().includes(term))
  const grid = { gridTemplateColumns: `repeat(auto-fill, minmax(${thumb}px, 1fr))` }
  return <>
    <input className="ew-studio-search" type="search" placeholder="Search Web Treasures" aria-label="Search Web Treasures" value={search} onChange={event => setSearch(event.target.value)} />

    <section className="ew-studio-section" aria-labelledby="ew-collection-heading">
      <h3 id="ew-collection-heading">Elsewhere Collection</h3>
      <p className="ew-studio-hint">Blinkies, stamps and graphics included with Elsewhere. All belong to their original creators.</p>
      {treasures === null ? <p className="ew-studio-hint">Loading…</p>
        : !collection.length ? <p className="ew-studio-empty-note">{treasures.length ? 'Nothing in the collection matches.' : 'The Elsewhere Collection is coming soon.'}</p>
          : <div className="ew-studio-grid" style={grid}>
            {collection.map(item => <button key={item.id} type="button" className="ew-studio-tile" style={{ height: thumb }}
              title={item.name + (item.creator ? ' · by ' + item.creator : '')} onClick={() => onTreasure(item)}>
              <StudioImage id={item.id} kind="treasure" className="ew-studio-tile-img" /></button>)}
          </div>}
    </section>

    <section className="ew-studio-section" aria-labelledby="ew-mine-heading">
      <h3 id="ew-mine-heading">My Treasures</h3>
      <p className="ew-studio-hint">Your own images, saved on this PC for any photo.</p>
      <button type="button" className="ew-studio-add" onClick={onUploadMine}>+ Upload to My Treasures</button>
      {!own.length ? <p className="ew-studio-empty-note">{mine.length ? 'None of your treasures match.' : 'Nothing here yet. Upload blinkies, stamps or any PNG, JPEG, GIF or WebP.'}</p>
        : <div className="ew-studio-grid" style={grid}>
          {own.map(item => <div key={item.id} className="ew-studio-tile-wrap">
            <button type="button" className="ew-studio-tile" style={{ height: thumb }} title={item.name} onClick={() => onMine(item)}>
              <StudioImage id={item.id} kind="local" className="ew-studio-tile-img" /></button>
            <button type="button" className="ew-studio-tile-remove" aria-label={`Remove ${item.name} from My Treasures`} title="Remove from My Treasures"
              onClick={() => { if (window.confirm(`Remove “${item.name}” from My Treasures? Photos that already use it keep it.`)) removeMyTreasure(item.id) }}>×</button>
          </div>)}
        </div>}
      <button type="button" className="ew-studio-link" onClick={onAddImage}>Use an image once without saving it</button>
    </section>

    <label className="ew-studio-slider">Thumbnail size<input type="range" min={40} max={110} value={thumb} onChange={event => setThumb(Number(event.target.value))} /></label>
  </>
}

function EditPanel({ layer, onChange, onDuplicate, onDelete, onForward, onBackward }: {
  layer: Layer | null; onChange: (patch: Partial<Layer>) => void; onDuplicate: () => void; onDelete: () => void; onForward: () => void; onBackward: () => void
}) {
  if (!layer) return <div className="ew-studio-empty"><p>Select something on your photo to edit it, or add a sticker, frame or text from the Library.</p></div>
  return <div className="ew-studio-edit">
    <label className="ew-studio-field">Name<input value={layer.name} maxLength={60} onChange={event => onChange({ name: event.target.value })} /></label>
    {layer.type === 'text' && <>
      <label className="ew-studio-field">Text<textarea rows={3} value={layer.text} maxLength={400} onChange={event => onChange({ text: event.target.value })} /></label>
      <label className="ew-studio-field">Style<select value={layer.style} onChange={event => onChange({ style: event.target.value as TextStyle })}>
        {(Object.keys(TEXT_STYLES) as TextStyle[]).map(style => <option key={style} value={style}>{TEXT_STYLES[style].label}</option>)}</select></label>
      <div className="ew-studio-row">
        <label className="ew-studio-field">Color<input type="color" value={layer.color} onChange={event => onChange({ color: event.target.value })} /></label>
        <label className="ew-studio-field">Outline<input type="color" value={layer.outline === 'transparent' ? '#ffffff' : layer.outline} onChange={event => onChange({ outline: event.target.value })} /></label>
        <label className="ew-studio-field">Align<select value={layer.align} onChange={event => onChange({ align: event.target.value as 'left' | 'center' | 'right' })}>
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      </div>
      <label className="ew-studio-check"><input type="checkbox" checked={layer.outline === 'transparent'} onChange={event => onChange({ outline: event.target.checked ? 'transparent' : '#e8578a' })} /> No outline</label>
    </>}
    {layer.type === 'stationery' && <label className="ew-studio-field">Color<input type="color" value={layer.color} onChange={event => onChange({ color: event.target.value })} /></label>}
    {layer.type === 'mini-ui' && <>
      <label className="ew-studio-field">Window title<input value={layer.title} maxLength={60} onChange={event => onChange({ title: event.target.value })} /></label>
      <label className="ew-studio-field">{layer.style === 'chat' ? 'Messages (one per line, like “name: message”)' : layer.style === 'player' ? 'Song, then artist (one per line)' : 'Message'}
        <textarea rows={4} maxLength={600} value={layer.lines.join('\n')} onChange={event => onChange({ lines: event.target.value.split('\n').slice(0, 8) })} /></label>
      <p className="ew-studio-hint">Pretend text only. Elsewhere never fills this from your real chats.</p>
    </>}
    {layer.type === 'frame' && <label className="ew-studio-field">Frame color<input type="color" value={layer.color} onChange={event => onChange({ color: event.target.value })} /></label>}
    <label className="ew-studio-slider">Opacity {Math.round(layer.opacity * 100)}%<input type="range" min={5} max={100} value={Math.round(layer.opacity * 100)} onChange={event => onChange({ opacity: Number(event.target.value) / 100 })} /></label>
    <label className="ew-studio-slider">Rotation {layer.rotation}°<input type="range" min={-180} max={180} value={layer.rotation} onChange={event => onChange({ rotation: Number(event.target.value) })} /></label>
    <div className="ew-studio-row">
      <label className="ew-studio-check"><input type="checkbox" checked={layer.flipX} onChange={event => onChange({ flipX: event.target.checked })} /> Flip</label>
      <label className="ew-studio-check"><input type="checkbox" checked={layer.locked} onChange={event => onChange({ locked: event.target.checked })} /> Lock</label>
      <label className="ew-studio-check"><input type="checkbox" checked={layer.hidden} onChange={event => onChange({ hidden: event.target.checked })} /> Hide</label>
    </div>
    {layer.type === 'image' && <label className="ew-studio-check" title="Keeps pixel art crisp when you resize it"><input type="checkbox" checked={layer.pixelated} onChange={event => onChange({ pixelated: event.target.checked })} /> Crisp pixels (no blur)</label>}
    <div className="ew-studio-row">
      <button type="button" onClick={onForward}>Bring forward</button>
      <button type="button" onClick={onBackward}>Send backward</button>
    </div>
    <div className="ew-studio-row">
      <button type="button" onClick={onDuplicate}>Duplicate</button>
      <button type="button" onClick={onDelete} disabled={layer.locked} className="ew-studio-danger">Delete</button>
    </div>
  </div>
}

function LayersPanel({ doc, selected, onSelect, onToggle, onRename, onMove }: {
  doc: StudioDoc; selected: string | null; onSelect: (id: string) => void
  onToggle: (id: string, key: 'hidden' | 'locked') => void; onRename: (id: string, name: string) => void; onMove: (id: string, direction: 1 | -1) => void
}) {
  if (!doc.layers.length) return <div className="ew-studio-empty"><p>No layers yet. Your photo is the bottom layer and is never changed.</p></div>
  return <ol className="ew-studio-layers" reversed>
    {[...doc.layers].reverse().map(item => <li key={item.id} className={item.id === selected ? 'is-active' : ''}>
      <button type="button" className="ew-studio-layer-name" onClick={() => onSelect(item.id)} title="Select">{item.name}</button>
      <button type="button" onClick={() => onToggle(item.id, 'hidden')} aria-pressed={!item.hidden} title={item.hidden ? 'Show' : 'Hide'}>{item.hidden ? '🙈' : '👁️'}</button>
      <button type="button" onClick={() => onToggle(item.id, 'locked')} aria-pressed={item.locked} title={item.locked ? 'Unlock' : 'Lock'}>{item.locked ? '🔒' : '🔓'}</button>
      <button type="button" onClick={() => onMove(item.id, 1)} title="Move up">▲</button>
      <button type="button" onClick={() => onMove(item.id, -1)} title="Move down">▼</button>
      <button type="button" onClick={() => { const name = window.prompt('Layer name', item.name); if (name) onRename(item.id, name.slice(0, 60)) }} title="Rename">✎</button>
    </li>)}
    <li className="ew-studio-base-layer">📷 Photo (original, never changed)</li>
  </ol>
}

function ExportDialog({ onClose, onExport, hasTransparency }: { onClose: () => void; onExport: (type: 'image/png' | 'image/jpeg', fill: string) => void; hasTransparency: boolean }) {
  const [type, setType] = useState<'image/png' | 'image/jpeg'>('image/png')
  const [fill, setFill] = useState('#ffffff')
  return <div className="ew-studio-modal" role="dialog" aria-modal="true" aria-label="Export Image">
    <div className="ew-studio-modal-box">
      <h2>Export Image</h2>
      <label className="ew-studio-check"><input type="radio" checked={type === 'image/png'} onChange={() => setType('image/png')} /> PNG (keeps transparency, best quality)</label>
      <label className="ew-studio-check"><input type="radio" checked={type === 'image/jpeg'} onChange={() => setType('image/jpeg')} /> JPEG (smaller file)</label>
      {type === 'image/jpeg' && hasTransparency && <label className="ew-studio-field">JPEG can’t be transparent. Fill empty areas with<input type="color" value={fill} onChange={event => setFill(event.target.value)} /></label>}
      <p className="ew-studio-hint">Saves to your Downloads folder. No “Made in Elsewhere” mark is added.</p>
      <div className="ew-studio-modal-actions">
        <button type="button" onClick={() => onExport(type, fill)}>Export</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  </div>
}

function OpenProject({ onClose, onOpen }: { onClose: () => void; onOpen: (project: StudioProject) => void }) {
  const [list, setList] = useState<StudioProject[] | null>(null)
  useEffect(() => { void listProjects().then(setList, () => setList([])) }, [])
  return <div className="ew-studio-modal" role="dialog" aria-modal="true" aria-label="Open Project">
    <div className="ew-studio-modal-box ew-studio-open">
      <h2>Your projects</h2>
      {list === null ? <p>Loading…</p> : !list.length ? <p className="ew-studio-hint">No saved projects yet. Use File → Save Project while editing.</p>
        : <div className="ew-studio-project-grid">{list.map(item => <div key={item.id} className="ew-studio-project">
          <button type="button" onClick={() => onOpen(item)}>
            {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span className="ew-studio-missing">No preview</span>}
            <strong>{item.name}</strong><small>{new Date(item.updatedAt).toLocaleString()}</small>
          </button>
          <button type="button" className="ew-studio-danger" onClick={() => {
            if (window.confirm(`Move “${item.name}” to Trash? You can restore it from My Gallery → Trash.`))
              void deleteProject(item.id).then(() => setList(current => (current || []).filter(entry => entry.id !== item.id)))
          }}>Trash</button>
        </div>)}</div>}
      <div className="ew-studio-modal-actions"><button type="button" onClick={onClose}>Close</button></div>
    </div>
  </div>
}

/** A skin's mascot / motif art for one safe spot. Decorative only: hidden from screen readers, lets clicks through,
 *  and shows nothing until its art file exists in public/studio-skins/. */
function SkinMotif({ skin, slot }: { skin: string; slot: MotifSlot }) {
  const motif = findSkin(skin).motifs?.find(item => item.slot === slot)
  const [missing, setMissing] = useState('')
  if (!motif || missing === motif.file) return null
  return <img className={`ew-studio-motif is-${slot}`} src={motifUrl(motif.file)} alt="" aria-hidden="true" draggable={false}
    decoding="async" data-motif={motif.file} onError={() => setMissing(motif.file)} />
}
