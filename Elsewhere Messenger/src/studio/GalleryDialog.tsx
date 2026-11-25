import { useEffect, useMemo, useState } from 'react'
import type { StudioProject } from './studioModel'
import { deleteProjectForever, listProjects, restoreProject, saveProject, trashProject } from './studioStore'
import {
  deleteGalleryItemForever, duplicateGalleryItem, favoriteGalleryItem, listGallery, renameGalleryItem, restoreGalleryItem, trashGalleryItem,
  type GalleryItem,
} from './studioGallery'

// My Gallery: Recent · Editable Projects · Finished Photos · Photo Strips · Trash.
// Deleting moves things to Trash first; only "Delete forever" removes them.

type Tab = 'recent' | 'projects' | 'photos' | 'strips' | 'trash'
type Card = { key: string; name: string; date: string; thumbnail?: string; favorite: boolean; editable: boolean; deleted: boolean; project?: StudioProject; item?: GalleryItem }

export default function GalleryDialog({ onClose, onOpenProject, onEditImage }: {
  onClose: () => void
  onOpenProject: (project: StudioProject) => void
  onEditImage: (blob: Blob, name: string) => void
}) {
  const [tab, setTab] = useState<Tab>('recent')
  const [projects, setProjects] = useState<StudioProject[] | null>(null)
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<GalleryItem | null>(null)
  const [viewUrl, setViewUrl] = useState('')
  const refresh = () => {
    void listProjects(true).then(setProjects, () => setProjects([]))
    void listGallery().then(setItems, () => setItems([]))
  }
  useEffect(refresh, [])
  useEffect(() => {
    if (!viewing) { setViewUrl(''); return }
    const url = URL.createObjectURL(viewing.blob)
    setViewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [viewing])

  const cards: Card[] = useMemo(() => [
    ...(projects || []).map(project => ({ key: 'p:' + project.id, name: project.name, date: project.updatedAt, thumbnail: project.thumbnail, favorite: false, editable: true, deleted: Boolean(project.deletedAt), project })),
    ...(items || []).map(item => ({ key: 'g:' + item.id, name: item.name, date: item.createdAt, thumbnail: item.thumbnail, favorite: item.favorite, editable: false, deleted: Boolean(item.deletedAt), item })),
  ].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.date.localeCompare(a.date)), [projects, items])
  const term = search.toLowerCase()
  const shown = cards.filter(card => (tab === 'trash' ? card.deleted : !card.deleted) && (!term || card.name.toLowerCase().includes(term)) && (
    tab === 'recent' || tab === 'trash' ? true : tab === 'projects' ? card.editable : tab === 'photos' ? card.item?.kind === 'photo' : card.item?.kind === 'strip'))
    .slice(0, tab === 'recent' ? 30 : undefined)

  async function act(card: Card, action: 'open' | 'rename' | 'duplicate' | 'favorite' | 'trash' | 'restore' | 'forever') {
    try {
      if (action === 'open') { if (card.project) onOpenProject(card.project); else if (card.item) setViewing(card.item); return }
      if (action === 'rename') {
        const name = window.prompt('New name', card.name)?.trim()
        if (!name) return
        if (card.project) await saveProject({ ...card.project, name: name.slice(0, 80) })
        else if (card.item) await renameGalleryItem(card.item.id, name)
      }
      if (action === 'duplicate') {
        if (card.project) await saveProject({ ...card.project, id: crypto.randomUUID(), name: card.project.name + ' copy', updatedAt: new Date().toISOString() })
        else if (card.item) await duplicateGalleryItem(card.item.id)
      }
      if (action === 'favorite' && card.item) await favoriteGalleryItem(card.item.id, !card.item.favorite)
      if (action === 'trash') { if (card.project) await trashProject(card.project.id); else if (card.item) await trashGalleryItem(card.item.id) }
      if (action === 'restore') { if (card.project) await restoreProject(card.project.id); else if (card.item) await restoreGalleryItem(card.item.id) }
      if (action === 'forever') {
        if (!window.confirm(`Delete “${card.name}” forever? This can’t be undone.`)) return
        if (card.project) await deleteProjectForever(card.project.id); else if (card.item) await deleteGalleryItemForever(card.item.id)
      }
      refresh()
    } catch (cause) { window.alert(cause instanceof Error ? cause.message : String(cause)) }
  }
  async function emptyTrash() {
    const trashed = cards.filter(card => card.deleted)
    if (!trashed.length || !window.confirm(`Delete ${trashed.length} item${trashed.length === 1 ? '' : 's'} in Trash forever? This can’t be undone.`)) return
    for (const card of trashed) {
      if (card.project) await deleteProjectForever(card.project.id).catch(() => {})
      else if (card.item) await deleteGalleryItemForever(card.item.id).catch(() => {})
    }
    refresh()
  }

  const loading = projects === null || items === null
  return <div className="ew-studio-modal" role="dialog" aria-modal="true" aria-label="My Gallery">
    <div className="ew-studio-modal-box ew-gallery">
      <div className="ew-gallery-head"><h2>My Gallery ♡</h2><button type="button" onClick={onClose} aria-label="Close Gallery">×</button></div>
      <div className="ew-gallery-tabs" role="tablist">
        {([['recent', 'Recent'], ['projects', 'Editable Projects'], ['photos', 'Finished Photos'], ['strips', 'Photo Strips'], ['trash', 'Trash']] as [Tab, string][]).map(([key, label]) =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <div className="ew-gallery-tools">
        <input type="search" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search gallery" />
        {tab === 'trash' && <button type="button" onClick={() => void emptyTrash()}>Empty Trash</button>}
      </div>
      {loading ? <p className="ew-studio-hint">Loading…</p> : !shown.length ? <div className="ew-studio-empty">
        <p>{tab === 'trash' ? 'Trash is empty.' : tab === 'strips' ? 'No photo strips yet. They’re coming with Collage Layouts.' : tab === 'projects' ? 'No editable projects yet. Use File → Save Project while editing.' : 'Nothing here yet. Use Finish → Save to Gallery when your photo is ready.'}</p>
      </div> : <div className="ew-gallery-grid">
        {shown.map(card => <div key={card.key} className="ew-gallery-card">
          <button type="button" className="ew-gallery-open" onClick={() => void act(card, card.deleted ? 'restore' : 'open')} title={card.deleted ? 'Restore' : card.editable ? 'Open to edit' : 'View'}>
            {card.thumbnail ? <img src={card.thumbnail} alt="" /> : <span className="ew-studio-missing">No preview</span>}
            <span className={'ew-gallery-badge' + (card.editable ? ' is-editable' : '')}>{card.editable ? 'Editable' : card.item?.kind === 'strip' ? 'Strip' : 'Photo'}</span>
            {card.favorite && <span className="ew-gallery-star" aria-label="Favorite">★</span>}
          </button>
          <strong title={card.name}>{card.name}</strong>
          <small>{new Date(card.date).toLocaleDateString()}</small>
          <div className="ew-gallery-actions">
            {card.deleted ? <>
              <button type="button" onClick={() => void act(card, 'restore')}>Restore</button>
              <button type="button" className="ew-studio-danger" onClick={() => void act(card, 'forever')}>Delete forever</button>
            </> : <>
              <button type="button" onClick={() => void act(card, 'rename')}>Rename</button>
              <button type="button" onClick={() => void act(card, 'duplicate')}>Duplicate</button>
              {card.item && <button type="button" onClick={() => void act(card, 'favorite')}>{card.item.favorite ? 'Unfavorite' : 'Favorite'}</button>}
              <button type="button" onClick={() => void act(card, 'trash')}>Trash</button>
            </>}
          </div>
        </div>)}
      </div>}
      {viewing && viewUrl && <div className="ew-gallery-viewer" role="dialog" aria-label={viewing.name}>
        <img src={viewUrl} alt={viewing.name} />
        <div className="ew-studio-modal-actions">
          <button type="button" onClick={() => { onEditImage(viewing.blob, viewing.name); setViewing(null) }}>Start a new project from this</button>
          <button type="button" onClick={() => { const link = document.createElement('a'); link.href = viewUrl; link.download = viewing.name + '.png'; link.click() }}>Save a copy</button>
          <button type="button" onClick={() => setViewing(null)}>Close</button>
        </div>
      </div>}
    </div>
  </div>
}
