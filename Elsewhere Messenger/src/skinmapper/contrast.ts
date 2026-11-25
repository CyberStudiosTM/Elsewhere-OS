import { SLOTS, resolve, type Finding, type SkinTheme, type VisualState } from './schema'

// SkinMapper Phase 7: readability checks. Warns (never blocks or recolors) when a part's
// text color is too close to its background. Targets from the handoff: 4.5:1 for normal
// text, 3:1 for large text. Image or gradient backgrounds can't be measured here, so they
// get an info note to check by eye in the preview.

type Rgb = [number, number, number]
const DEFAULT_TEXT = '#101a31'
const DEFAULT_BACKGROUND = '#f5f9ff'

export function parseColor(value: unknown): Rgb | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  let match = /^#([0-9a-f]{3})$/.exec(text)
  if (match) return match[1].split('').map(c => parseInt(c + c, 16)) as Rgb
  match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(text)
  if (match) return [0, 2, 4].map(i => parseInt(match![1].slice(i, i + 2), 16)) as Rgb
  match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(text)
  if (match) return [1, 2, 3].map(i => Math.min(255, Number(match![i]))) as Rgb
  return null
}

function luminance([r, g, b]: Rgb) {
  const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrastRatio(a: Rgb, b: Rgb) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** Readability findings for every part whose text and background are both known colors. */
export function contrastFindings(theme: SkinTheme): Finding[] {
  const out: Finding[] = []
  for (const slot of SLOTS) {
    if (!slot.properties.includes('textColor')) continue
    const states: VisualState[] = slot.states.includes('normal') ? slot.states : ['normal', ...slot.states]
    for (const state of states) {
      const text = resolve(theme, slot.id, 'textColor', state)
      const background = resolve(theme, slot.id, 'background', state)
      const image = resolve(theme, slot.id, 'backgroundImage', state)
      // Only judge parts this skin actually changed.
      if (text.origin === 'default' && background.origin === 'default') continue
      if (image.origin !== 'default' && image.value) {
        out.push({ severity: 'info', slot: slot.id, message: `${slot.name}${state === 'normal' ? '' : ` (${state})`} has an image behind its text. Check it’s easy to read in the preview.` })
        continue
      }
      const fg = parseColor(text.value ?? DEFAULT_TEXT)
      const bg = parseColor(background.value ?? DEFAULT_BACKGROUND)
      if (!fg || !bg) {
        if (typeof background.value === 'string' && /gradient/i.test(background.value)) out.push({ severity: 'info', slot: slot.id, message: `${slot.name} has a gradient behind its text. Check it’s easy to read in the preview.` })
        continue
      }
      const size = Number.parseFloat(String(resolve(theme, slot.id, 'fontSize', state).value ?? '13'))
      const bold = /^(700|800|900|bold)$/.test(String(resolve(theme, slot.id, 'fontWeight', state).value ?? ''))
      const large = size >= 24 || (bold && size >= 18.5)
      const ratio = contrastRatio(fg, bg)
      const target = large ? 3 : 4.5
      if (ratio < target) {
        out.push({
          severity: 'warning', slot: slot.id,
          message: `${slot.name}${state === 'normal' ? '' : ` (${state})`}: text and background are hard to tell apart (${ratio.toFixed(1)}:1, aim for ${target}:1). Try a darker or lighter text color.`,
        })
      }
    }
  }
  return out
}
