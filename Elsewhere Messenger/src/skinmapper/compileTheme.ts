import { SLOTS, resolve, type AssetRef, type SkinTheme, type SlotDefinition, type StyleProperty, type VisualState } from './schema'

// SkinMapper Phase 3 (renderer groundwork): turns a validated theme into CSS custom
// properties scoped to the mapped skin's root element. The mapped renderer's own
// stylesheet reads these variables; a skin never supplies CSS text, so it can change
// appearance but not layout, hit areas or behavior.

export const MAPPED_ROOT = '[data-elsewhere-skin="mapped"]'

/** CSS variable name for a slot property and state, e.g. --sm-chat-send-hover-background. */
export function variableName(slotId: string, property: StyleProperty, state: VisualState = 'normal') {
  const base = slotId.replace(/\./g, '-')
  return `--sm-${base}${state === 'normal' ? '' : '-' + state}-${property.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`
}

function cssValue(property: StyleProperty, value: unknown, urlFor: (asset: AssetRef) => string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined
  if (property === 'backgroundImage' || property === 'icon') {
    const url = urlFor(value as AssetRef)
    return url ? `url("${url.replace(/["\\\n]/g, '')}")` : undefined
  }
  if (property === 'opacity') return String(Math.min(1, Math.max(0, Number(value))))
  if (property === 'fontFamily') return `"${String(value).replace(/["\\]/g, '')}", "Segoe UI", sans-serif`
  if (typeof value === 'number' && ['borderWidth', 'borderRadius', 'fontSize', 'padding', 'gap'].includes(property)) return `${value}px`
  return String(value)
}

export type CompiledSkin = {
  /** `--sm-*: value;` declarations for the mapped root. */
  declarations: Record<string, string>
  /** Nine-slice data for frame slots that use it (the renderer builds border-image from it). */
  nineSlice: Record<string, { url: string; slice: [number, number, number, number]; repeat: 'stretch' | 'round' }>
  transcript: 'classic' | 'bubble'
}

/**
 * Compiles every slot × state × property the theme (or its inheritance chain) sets.
 * `urlFor` maps a package asset to a blob: URL created by the loader. Unknown assets are skipped.
 */
export function compileTheme(theme: SkinTheme, urlFor: (asset: AssetRef) => string | undefined): CompiledSkin {
  const declarations: Record<string, string> = {}
  const nineSlice: CompiledSkin['nineSlice'] = {}
  for (const slot of SLOTS) {
    for (const state of statesFor(slot)) {
      for (const property of slot.properties) {
        const { value, origin } = resolve(theme, slot.id, property, state)
        if (origin === 'default') continue
        const css = cssValue(property, value, urlFor)
        if (css === undefined) continue
        declarations[variableName(slot.id, property, state)] = css
        if (property === 'backgroundImage') {
          const asset = value as AssetRef
          const url = urlFor(asset)
          if (url && asset.scale === 'nine-slice' && asset.slice) {
            nineSlice[`${slot.id}${state === 'normal' ? '' : ':' + state}`] = { url, slice: asset.slice, repeat: 'stretch' }
          }
        }
      }
    }
  }
  return { declarations, nineSlice, transcript: theme.transcript === 'bubble' ? 'bubble' : 'classic' }
}

function statesFor(slot: SlotDefinition): VisualState[] {
  return slot.states.includes('normal') ? slot.states : ['normal', ...slot.states]
}

/** One CSS rule, scoped to the mapped root, ready for a <style> element. */
export function declarationsToCss(compiled: CompiledSkin) {
  const body = Object.entries(compiled.declarations).map(([name, value]) => `  ${name}: ${value};`).join('\n')
  return `${MAPPED_ROOT} {\n${body}\n}\n`
}

/** border-image rules for nine-slice frames, scoped to the mapped root and the slot. */
export function nineSliceCss(compiled: CompiledSkin) {
  let css = ''
  for (const [key, data] of Object.entries(compiled.nineSlice)) {
    const [slotId, state] = key.split(':')
    if (state && state !== 'active') continue // the preview and windows draw the active look
    const [top, right, bottom, left] = data.slice
    const url = data.url.replace(/["\\\n\r]/g, '')
    css += `${MAPPED_ROOT} [data-sm-slot="${slotId.replace(/[^a-z0-9.-]/g, '')}"] {\n` +
      `  border-style: solid;\n  border-width: ${top}px ${right}px ${bottom}px ${left}px;\n` +
      `  border-image: url("${url}") ${top} ${right} ${bottom} ${left} fill / ${top}px ${right}px ${bottom}px ${left}px ${data.repeat};\n` +
      `  background: transparent;\n}\n`
  }
  return css
}
