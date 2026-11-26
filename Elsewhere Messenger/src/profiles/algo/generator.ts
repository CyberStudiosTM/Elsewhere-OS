import { interpret, type Interpretation, type Outcome } from './parser'
import { ANIMATES_ITSELF, PATTERNS, paletteFor, withAnimation } from './patterns'

// Algorithmic Intelligence · the engine. Plain English in → interpretation → hand-written patterns composed
// into one HTML/CSS/JavaScript snippet → validation. Deterministic: the same request always gives the same code.

export type Generated = {
  outcome: Outcome
  html: string
  css: string
  js: string
  made: string[]
  notes: string[]
  corrections: [string, string][]
  unknown: string[]
  problems: string[]
}

/** Stable short id from the request text, so output is reproducible and ids don't clash between snippets. */
function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36).slice(0, 5)
}

/** Checks the composed code before it's shown or inserted. */
export function validate(html: string, css: string, js: string): string[] {
  const problems: string[] = []
  if (js.trim()) { try { new Function(js) } catch (error) { problems.push('JavaScript: ' + (error instanceof Error ? error.message : String(error))) } }
  let depth = 0
  for (const ch of css.replace(/"[^"]*"|'[^']*'/g, '')) { if (ch === '{') depth++; if (ch === '}') depth--; if (depth < 0) break }
  if (depth !== 0) problems.push('CSS: unbalanced braces')
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length) problems.push('Duplicate ids: ' + [...new Set(dup)].join(', '))
  if (/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|document\.cookie|eval)\b/.test(js)) problems.push('Uses something the sandbox blocks (network, storage or eval)')
  const timers = (js.match(/setInterval/g) || []).length
  if (timers > 6) problems.push('Too many timers')
  return problems
}

export function generate(request: string, salt = ''): Generated & { interpretation: Interpretation } {
  const interpretation = interpret(request)
  const palette = paletteFor(interpretation.aesthetic)
  const base = 'ea' + hash(request.trim().toLowerCase() + salt)
  const html: string[] = [], css: string[] = [], js: string[] = [], made: string[] = []
  interpretation.pieces.forEach((piece, i) => {
    const pattern = PATTERNS[piece.concept]
    if (!pattern) return
    const raw = pattern(`${base}-${i}`, piece, palette)
    const out = ANIMATES_ITSELF.has(piece.concept) ? raw : withAnimation(`${base}-${i}`, piece, raw)
    html.push(out.html); if (out.css.trim()) css.push(`/* ${out.summary} */\n` + out.css.trim()); if (out.js.trim()) js.push(`// ${out.summary}\n` + out.js.trim()); made.push(out.summary)
  })
  const wrap = (body: string) => html.length > 1 ? `<div class="${base}-stack">\n${body}\n</div>` : body
  const finalCss = (html.length > 1 ? `.${base}-stack { display: flex; flex-direction: column; gap: 8px; }\n` : '') + css.join('\n\n')
  const finalHtml = wrap(html.join('\n'))
  const finalJs = js.join('\n\n')
  return {
    interpretation, outcome: interpretation.outcome, html: finalHtml, css: finalCss, js: finalJs, made,
    notes: interpretation.notes, corrections: interpretation.corrections, unknown: interpretation.unknown, problems: made.length ? validate(finalHtml, finalCss, finalJs) : [],
  }
}

/** Ideas shown in the panel (all supported). */
export const INSPIRATION = [
  'sparkly pink heading that says "welcome to my page"',
  'glossy blue button that links to https://example.com',
  'falling hearts in pink and lavender',
  'star cursor trail',
  'digital clock in neon green, cybercore',
  'typewriter text "hi i\'m new here"',
  'retro window called "about_me.txt"',
  'dropdown menu and dark mode switch',
  'rainbow marquee that says "thanks for visiting"',
  'bouncing polaroid photo frame',
  'progress bar at 80 percent, kawaii',
  'click to open box that says "secret ♡"',
  'snow falling slowly, gothic',
  'draggable butterfly stickers',
]
