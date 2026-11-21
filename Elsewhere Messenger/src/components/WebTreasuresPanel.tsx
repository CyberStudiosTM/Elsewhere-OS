import { useEffect, useState } from 'react'
import { loadTreasures, treasureCategories, treasureUrl, type Treasure, type TreasureCategory } from '../services/webTreasures'
import { getTreasureFile, listTreasureRecords, type TreasureRecord } from '../services/treasureVaultDb'
import './WebTreasuresPanel.css'

type Category = TreasureCategory | 'all'

export default function WebTreasuresPanel({skin, onClose}: {skin:'classic'|'dead-signal';onClose:()=>void}) {
  const [entries,setEntries] = useState<Treasure[]>([])
  const [vault,setVault] = useState<TreasureRecord[]>([])
  const [vaultUrls,setVaultUrls] = useState<Record<string,string>>({})
  const [category,setCategory] = useState<Category>('all')
  const [search,setSearch] = useState('')
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)

  useEffect(()=>{
    let alive=true
    const urls:string[]=[]
    void Promise.allSettled([loadTreasures(),listTreasureRecords(undefined,'approved')]).then(async results=>{
      if(!alive)return
      const [manifest, records]=results
      if(manifest.status==='fulfilled')setEntries(manifest.value)
      else setError('Curated catalog unavailable; showing accessible vault records.')
      if(records.status==='fulfilled') {
        setVault(records.value)
        const imageUrls:Record<string,string>={}
        for(const record of records.value){
          try {
            const blob=await getTreasureFile(record.id)
            if(blob){const url=URL.createObjectURL(blob);urls.push(url);imageUrls[record.id]=url}
          } catch { /* A missing file should not hide the metadata. */ }
        }
        if(alive)setVaultUrls(imageUrls)
      }else setError('The Web Treasures vault could not be opened.')
      if(alive)setLoading(false)
    })
    return()=>{alive=false;urls.forEach(url=>URL.revokeObjectURL(url))}
  },[])
  useEffect(()=>{
    const esc=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()}
    document.addEventListener('keydown',esc)
    return ()=>document.removeEventListener('keydown',esc)
  },[onClose])
  const q=search.trim().toLowerCase()
  const filtered=entries.filter(item=>(category==='all'||item.category===category)&&
    [item.name,...item.tags,item.creator].some(v=>v.toLowerCase().includes(q)))
  const filteredVault=vault.filter(item=>(category==='all'||item.category===category)&&
    [item.title,...item.tags,item.creator].some(v=>v.toLowerCase().includes(q)))
  return <div className={'ew-treasures-backdrop '+(skin==='dead-signal'?'ew-treasures-dead':'')} onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="ew-treasures-window" role="dialog" aria-modal="true" aria-label="Web Treasures">
      <header><strong>✦ Web Treasures</strong><button type="button" onClick={onClose} aria-label="Close Web Treasures">×</button></header>
      <div className="ew-treasures-controls">
        <label>Explore <select value={category} onChange={event=>setCategory(event.target.value as Category)}><option value="all">All treasures</option>{Object.entries(treasureCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Find <input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search treasures..." /></label>
      </div>
      <p className="ew-treasures-count">{loading ? 'Reading catalog...' : `${entries.length} curated assets · ${vault.length} approved vault records`}</p>
      {error && <p role="status">{error}</p>}
      <div className="ew-treasures-grid">
        {filtered.map(item=><article key={'curated:'+item.id}>
          <div className="ew-treasures-thumb"><img src={treasureUrl(item)} alt={item.name} loading="lazy" /></div>
          <strong>{item.name}</strong><small>{treasureCategories[item.category]} · {item.creator}</small>
          <a href={treasureUrl(item)} target="_blank" rel="noopener noreferrer">View asset</a>
          <small>{item.license}</small>
        </article>)}
        {filteredVault.map(item=><article key={'vault:'+item.id}>
          <div className="ew-treasures-thumb">{vaultUrls[item.id] ? <img src={vaultUrls[item.id]} alt={item.title} loading="lazy" /> : <span>Image unavailable</span>}</div>
          <strong>{item.title}</strong><small>{treasureCategories[item.category]} · {item.creator}</small>
          {vaultUrls[item.id] && <a href={vaultUrls[item.id]} target="_blank" rel="noopener noreferrer">View vault asset</a>}
          <small>{item.license}</small>
        </article>)}
        {!loading && !filtered.length && !filteredVault.length && <p>There are no matching treasures yet. Your vault data has not been changed.</p>}
      </div>
      <footer>Curated catalog + approved vault items · Existing collections and favorites are preserved.</footer>
    </section>
  </div>
}
