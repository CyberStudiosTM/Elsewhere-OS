import { useEffect, useState } from 'react'
import { cloud } from './connectedClient'

// Features still being built are greyed out ("coming soon") in the public app, and open for the
// studio's own accounts. This is a visibility switch, not a security boundary.

const STUDIO_HANDLES = new Set(['cyberthreed'])
const CACHE = 'elsewhere.previewFeatures.v1'

function cached() { try { return localStorage.getItem(CACHE) === '1' } catch { return false } }

/** True when the signed-in Elsewhere account belongs to the studio (unlocks in-progress features). */
export function useStudioPreview() {
  const [on, setOn] = useState(cached)
  useEffect(() => {
    if (!cloud) return
    let alive = true
    const check = async () => {
      const { data } = await cloud!.auth.getSession()
      const id = data.session?.user.id
      let ok = false
      if (id) {
        const { data: me } = await cloud!.from('elsewhere_profiles').select('handle').eq('id', id).maybeSingle()
        ok = STUDIO_HANDLES.has(String(me?.handle || '').toLowerCase())
      }
      try { localStorage.setItem(CACHE, ok ? '1' : '0') } catch { /* optional */ }
      if (alive) setOn(ok)
    }
    void check().catch(() => {})
    const { data: sub } = cloud.auth.onAuthStateChange(() => { void check().catch(() => {}) })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])
  return on
}
