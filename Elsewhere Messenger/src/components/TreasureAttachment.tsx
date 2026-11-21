import { useEffect, useState } from 'react'
import { getTreasure, treasureUrl, type Treasure } from '../services/webTreasures'

export default function TreasureAttachment({ id, name }: { id: string; name: string }) {
  const [item, setItem] = useState<Treasure | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setItem(null)
    setError('')
    void getTreasure(id).then(found => {
      if (cancelled) return
      if (found) setItem(found)
      else setError('Treasure unavailable in this installation.')
    }).catch(() => { if (!cancelled) setError('Treasure manifest unavailable.') })
    return () => { cancelled = true }
  }, [id])

  if (!item) return <span className="ew-treasure-unavailable">{name}: {error || 'Loading...'}</span>
  return (
    <div className="ew-treasure-message">
      <img
        src={treasureUrl(item)} alt={item.name} loading="lazy"
        style={{ maxWidth: '100%', maxHeight: 240, width: 'auto', height: 'auto' }}
        onError={() => setError('Treasure image unavailable.')}
      />
      <small>{item.name} · {item.creator} · {item.license}</small>
      {error && <small>{error}</small>}
    </div>
  )
}
