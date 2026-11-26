import { useEffect, useMemo, useRef, useState } from 'react'
import { useTreasureRevision, loadTreasures, treasureCategories, treasureUrl, type Treasure, type TreasureCategory } from '../services/webTreasures'
import { getTreasureFile, listTreasureRecords, type TreasureRecord } from '../services/treasureVaultDb'
import { readLocalImage, saveLocalImage } from '../services/messengerMedia'
import { addMyTreasure, findDuplicateTreasure, listMyTreasures, removeMyTreasure, watchMyTreasures, type MyTreasure } from '../studio/studioStore'
import { requestTreasureRemoval } from '../services/toolbarActions'
import './WebTreasuresPanel.css'

// Web Treasures: a little archive of old-web graphics. Two shelves: the Elsewhere Collection
// (built in, credited to the original creators) and My Treasures (the person's own uploads).

type Shelf = 'collection' | 'mine'
type Category = TreasureCategory | 'all'
type Item = { key: string; name: string; url: string; category?: TreasureCategory; creator?: string; source?: string; license?: string; width?: number; height?: number; mine?: MyTreasure }
const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export default function WebTreasuresPanel({ skin, onClose }: { skin: 'classic' | 'dead-signal'; onClose: () => void }) {
  const [shelf, setShelf] = useState<Shelf>('collection')
  const [category, setCategory] = useState<Category>('all')
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState<Treasure[]>([])
  const [vault, setVault] = useState<TreasureRecord[]>([])
  const [vaultUrls, setVaultUrls] = useState<Record<string, string>>({})
  const [mine, setMine] = useState<MyTreasure[]>(listMyTreasures)
  const revision = useTreasureRevision()
  const [mineUrls, setMineUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Item | null>(null)
  const [notice, setNotice] = useState('')
  const upload = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    const urls: string[] = []
    void Promise.allSettled([loadTreasures(), listTreasureRecords(undefined, 'approved')]).then(async ([manifest, records]) => {
      if (!alive) return
      if (manifest.status === 'fulfilled') setEntries(manifest.value)
      if (records.status === 'fulfilled') {
        setVault(records.value)
        const found: Record<string, string> = {}
        for (const record of records.value) {
          const blob = await getTreasureFile(record.id).catch(() => null)
          if (blob) { const url = URL.createObjectURL(blob); urls.push(url); found[record.id] = url }
        }
        if (alive) setVaultUrls(found)
      }
      if (alive) setLoading(false)
    })
    return () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [revision])

  useEffect(() => watchMyTreasures(() => setMine(listMyTreasures())), [])
  useEffect(() => {
    let alive = true
    const urls: string[] = []
    void (async () => {
      const found: Record<string, string> = {}
      for (const item of mine) {
        const blob = await readLocalImage(item.id).catch(() => undefined)
        if (blob) { const url = URL.createObjectURL(blob); urls.push(url); found[item.id] = url }
      }
      if (alive) setMineUrls(found)
    })()
    return () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [mine])

  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (selected) setSelected(null); else onClose() } }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose, selected])

  const term = search.trim().toLowerCase()
  const collection: Item[] = useMemo(() => [
    ...entries.map(item => ({ key: 'c:' + item.id, name: item.name, url: treasureUrl(item), category: item.category, creator: item.creator, source: item.source, license: item.license, width: item.width, height: item.height })),
    ...vault.filter(item => vaultUrls[item.id]).map(item => ({ key: 'v:' + item.id, name: item.title, url: vaultUrls[item.id], category: item.category as TreasureCategory, creator: item.creator, source: item.sourceUrl, license: item.license, width: item.width, height: item.height })),
  ], [entries, vault, vaultUrls])
  const own: Item[] = mine.filter(item => mineUrls[item.id]).map(item => ({ key: 'm:' + item.id, name: item.name, url: mineUrls[item.id], width: item.width, height: item.height, mine: item }))
  const shown = (shelf === 'collection' ? collection : own).filter(item =>
    (shelf === 'mine' || category === 'all' || item.category === category) &&
    (!term || [item.name, item.creator || ''].some(value => value.toLowerCase().includes(term))))
  const counts: Partial<Record<Category, number>> = { all: collection.length }
  for (const item of collection) if (item.category) counts[item.category] = (counts[item.category] || 0) + 1

  async function uploadFiles(files: FileList | null) {
    if (!files) return
    let added = 0
    for (const file of Array.from(files)) {
      if (!TYPES.includes(file.type)) { setNotice(`One file isn’t a PNG, JPEG, GIF or WebP, so it was skipped.`); continue }
      if (findDuplicateTreasure(file.name, file.size) && !window.confirm('This one is already in My Treasures. Keep both?')) continue
      try {
        const media = await saveLocalImage(file)
        if (media.kind !== 'local') continue
        const bitmap = await createImageBitmap(file)
        addMyTreasure({ id: media.id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), width: bitmap.width, height: bitmap.height, size: file.size, addedAt: new Date().toISOString() })
        bitmap.close()
        added++
      } catch (cause) { setNotice(`A file couldn’t be added: ${cause instanceof Error ? cause.message : 'couldn’t be saved.'}`) }
    }
    if (added) setNotice(`Added ${added} treasure${added === 1 ? '' : 's'} ♡`)
  }

  return <div className={'ew-treasures-backdrop' + (skin === 'dead-signal' ? ' ew-treasures-dead' : '')} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="ew-treasures-window" role="dialog" aria-modal="true" aria-label="Web Treasures">
      <header className="ew-treasures-titlebar">
        <span className="ew-treasure-shortcut" aria-hidden="true" />
        <strong>Web Treasures</strong>
        <button type="button" className="ew-treasures-close" onClick={onClose} aria-label="Close Web Treasures">×</button>
      </header>
      <div className="ew-treasures-banner" aria-hidden="true">✦ ・ a little archive of old-web treasures ・ ✦</div>

      <nav className="ew-treasures-shelves" role="tablist" aria-label="Shelves">
        <button type="button" role="tab" aria-selected={shelf === 'collection'} className={shelf === 'collection' ? 'is-active' : ''}
          onClick={() => { setShelf('collection'); setSelected(null) }}>Elsewhere Collection</button>
        <button type="button" role="tab" aria-selected={shelf === 'mine'} className={shelf === 'mine' ? 'is-active' : ''}
          onClick={() => { setShelf('mine'); setSelected(null) }}>My Treasures{mine.length ? ` (${mine.length})` : ''}</button>
      </nav>

      <div className="ew-treasures-body">
        {shelf === 'collection' && <aside className="ew-treasures-categories" aria-label="Categories">
          {(['all', ...Object.keys(treasureCategories)] as Category[]).map(key => <button key={key} type="button"
            className={category === key ? 'is-active' : ''} aria-pressed={category === key} onClick={() => setCategory(key)}>
            {key === 'all' ? 'Everything' : treasureCategories[key as TreasureCategory]}
            {counts[key] ? <small>{counts[key]}</small> : null}
          </button>)}
        </aside>}

        <div className="ew-treasures-main">
          <div className="ew-treasures-tools">
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={shelf === 'mine' ? 'Search my treasures' : 'Search the collection'} aria-label="Search" />
            {shelf === 'mine' && <button type="button" className="ew-treasures-upload" onClick={() => upload.current?.click()}>+ Add treasures</button>}
          </div>

          <div className="ew-treasures-grid" aria-live="polite">
            {shelf === 'collection' && loading ? <p className="ew-treasures-empty">Opening the archive…</p>
              : !shown.length ? <div className="ew-treasures-empty">
                {shelf === 'collection'
                  ? (collection.length ? <p>Nothing matches. Try another category or word.</p>
                    : <><p><strong>The Elsewhere Collection is on its way ✧</strong></p><p>Blinkies, stamps, dividers and more are being gathered. Check back soon!</p></>)
                  : (mine.length ? <p>None of your treasures match.</p>
                    : <><p><strong>Your shelf is empty</strong></p><p>Add your own blinkies, buttons, stamps and PNGs. They stay on this PC and show up in Creative Studio too.</p>
                      <button type="button" className="ew-treasures-upload" onClick={() => upload.current?.click()}>+ Add treasures</button></>)}
              </div>
                : shown.map(item => <button key={item.key} type="button" className={'ew-treasures-tile' + (selected?.key === item.key ? ' is-selected' : '')}
                  onClick={() => setSelected(item)} title={item.creator ? `by ${item.creator}` : undefined} aria-label="Treasure">
                  <span className="ew-treasures-thumb"><img src={item.url} alt="" loading="lazy" draggable={false}
                    style={{ imageRendering: (item.width || 999) <= 160 ? 'pixelated' : undefined }} /></span>
                </button>)}
          </div>
        </div>

        {selected && <aside className="ew-treasures-detail" aria-label="Treasure details">
          <span className="ew-treasures-detail-img"><img src={selected.url} alt="" style={{ imageRendering: (selected.width || 999) <= 160 ? 'pixelated' : undefined }} /></span>
          {selected.width && <small>{selected.width}×{selected.height}</small>}
          {selected.mine ? <>
            <small>Added {new Date(selected.mine.addedAt).toLocaleDateString()} · on this PC</small>
            <button type="button" onClick={() => {
              if (!selected.mine || !window.confirm('Remove this from My Treasures? Photos that already use it keep it.')) return
              removeMyTreasure(selected.mine.id); setSelected(null)
            }}>Remove from My Treasures</button>
          </> : <>
            {selected.category && <small>{treasureCategories[selected.category]}</small>}
            <small>By <strong>{selected.creator || 'unknown creator'}</strong></small>
            {selected.license && <small>{selected.license}</small>}
            {selected.source?.startsWith('https://') && <a href={selected.source} target="_blank" rel="noopener noreferrer">Visit the original</a>}
            <button type="button" className="ew-treasures-link" onClick={() => void requestTreasureRemoval(selected.name).catch(() => {})}>Is this yours? Credit or remove</button>
          </>}
          <button type="button" onClick={() => setSelected(null)}>Close</button>
        </aside>}
      </div>

      {notice && <p className="ew-treasures-notice" role="status">{notice}</p>}
      <footer className="ew-treasures-footer">
        All graphics belong to their original creators ♡ Made one of these?{' '}
        <button type="button" className="ew-treasures-link" onClick={() => void requestTreasureRemoval().catch(() => window.alert('Email elsewhere.os.info@gmail.com to have a resource credited or removed.'))}>
          Click here to have a resource credited or removed</button>.
      </footer>
      <input ref={upload} type="file" hidden multiple accept={TYPES.join(',')} onChange={event => { void uploadFiles(event.target.files); event.target.value = '' }} />
    </section>
  </div>
}
