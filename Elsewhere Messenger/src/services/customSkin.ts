import { useEffect, useState } from 'react'
import { CUSTOM_SKIN_ATTR, CUSTOM_SKIN_KEY, classicSkinCss } from '../skinmapper/classicOverlay'
import { mountDecorations } from '../skinmapper/decorations'
import { listSkinProjects, type SkinProject } from '../skinmapper/skinProject'
import { SKIN_FAMILIES, STARTER_SKINS } from '../skinmapper/stationerySkins'
import { patternPng } from '../skinmapper/patterns'
import type { SkinTheme } from '../skinmapper/schema'

// Which saved SkinMapper skin (if any) Classic is wearing. Stored in localStorage, so the buddy list,
// chat windows and pop-ups (all the same origin) wear it together and update when it changes.

const CHANGED = 'elsewhere:custom-skin-changed'
const STYLE_ID = 'ew-custom-skin'

export function readCustomSkin(): string | null {
  try { return localStorage.getItem(CUSTOM_SKIN_KEY) || null } catch { return null }
}
export function setCustomSkin(id: string | null) {
  try { if (id) localStorage.setItem(CUSTOM_SKIN_KEY, id); else localStorage.removeItem(CUSTOM_SKIN_KEY) } catch { /* this window only */ }
  window.dispatchEvent(new Event(CHANGED))
}

// Verified Elsewhere skins ship with the app: worn from the Skins menu as `builtin:<key>`,
// and also offered as SkinMapper quick starts (STARTER_SKINS is the single source for both).
export const BUILTIN_PREFIX = 'builtin:'
export const BUILTIN_COLLECTIONS = SKIN_FAMILIES
export function builtinSkins(family?: string) {
  return Object.entries(STARTER_SKINS)
    .filter(([, skin]) => !family || skin.family === family)
    .map(([key, skin]) => ({ id: BUILTIN_PREFIX + key, name: skin.label, family: skin.family }))
}

type Worn = { id: string; theme: SkinTheme; assets: { path: string; type: string; bytes: Uint8Array }[] }

/** Finds the skin to wear: a built-in one (patterns drawn on the fly) or a saved SkinMapper project. */
export async function loadWornSkin(id: string): Promise<Worn | null> {
  if (id.startsWith(BUILTIN_PREFIX)) {
    const recipe = STARTER_SKINS[id.slice(BUILTIN_PREFIX.length)]
    if (!recipe) return null
    const assets = await Promise.all(recipe.patterns.map(async pattern => {
      const tile = await patternPng(pattern.kind, pattern.base, pattern.ink, pattern.size)
      return { path: pattern.path, type: 'image/png', bytes: tile.bytes }
    }))
    return { id, theme: recipe.theme, assets }
  }
  const project = (await listSkinProjects()).find(item => item.id === id)
  return project ? { id: project.id, theme: project.theme, assets: project.assets } : null
}

/** Saved skins for the Skins menu, refreshed whenever the menu asks. */
export function useSavedSkins(open: boolean) {
  const [skins, setSkins] = useState<Pick<SkinProject, 'id' | 'name'>[]>([])
  useEffect(() => {
    if (!open) return
    let alive = true
    void listSkinProjects().then(list => { if (alive) setSkins(list.map(({ id, name }) => ({ id, name }))) }).catch(() => {})
    return () => { alive = false }
  }, [open])
  return skins
}

/** The chosen custom skin id, kept in sync across windows. */
export function useCustomSkinId() {
  const [id, setId] = useState(readCustomSkin)
  useEffect(() => {
    const update = () => setId(readCustomSkin())
    window.addEventListener(CHANGED, update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener(CHANGED, update); window.removeEventListener('storage', update) }
  }, [])
  return id
}

/** Dresses this window's Classic markup in the chosen skin (only while `enabled`, i.e. in Classic). */
export function useWearCustomSkin(enabled: boolean) {
  const id = useCustomSkinId()
  useEffect(() => {
    const root = document.documentElement
    let stopDecorations = () => {}
    const clear = () => { root.removeAttribute(CUSTOM_SKIN_ATTR); document.getElementById(STYLE_ID)?.remove(); stopDecorations() }
    if (!enabled || !id) { clear(); return }
    let alive = true
    const urls: string[] = []
    void loadWornSkin(id).then(project => {
      if (!alive) return
      if (!project) { clear(); return }
      const blobs = new Map<string, string>()
      for (const asset of project.assets) {
        const url = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.type }))
        blobs.set(asset.path, url); urls.push(url)
      }
      const css = classicSkinCss(project.theme, asset => blobs.get(asset.path))
      let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
      if (!style) { style = document.createElement('style'); style.id = STYLE_ID; document.head.appendChild(style) }
      style.textContent = css
      root.setAttribute(CUSTOM_SKIN_ATTR, project.id)
      stopDecorations = mountDecorations(project.theme.decorations, asset => blobs.get(asset.path))
    }).catch(clear)
    return () => { alive = false; stopDecorations(); urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [enabled, id])
}
