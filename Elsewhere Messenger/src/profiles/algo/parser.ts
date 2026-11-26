import { AESTHETICS, ANIMS, CONCEPTS, NAMED_COLORS, NATIVE_ONLY, NEGATIONS, PARTICLES, SHAPES, SIZES, SPEEDS, FILLER, knownWords, type Aesthetic, type Concept } from './vocabulary'

// Algorithmic Intelligence · controlled-English interpretation. Steps: pull out quoted text, colors, links and
// numbers → normalize words (with typo fixing against the known vocabulary) → split into clauses → recognize
// phrases → apply modifiers and negation → normalized requirements with an honest outcome.

export type Piece = {
  concept: Concept
  effects: Concept[]           // text effects stacked on a text piece (sparkle, rainbow, typewriter…)
  text?: string
  colors: string[]
  speed: number
  size: number
  shape?: string
  particle?: string
  anims: string[]
  count?: number
  gloss: boolean
  url?: string
  date?: string
  no: Set<string>              // things the person said they don't want
}
export type Outcome = 'understood' | 'partial' | 'ambiguous' | 'unsupported'
export type Interpretation = {
  pieces: Piece[]
  aesthetic?: Aesthetic
  outcome: Outcome
  corrections: [string, string][]
  unknown: string[]
  notes: string[]
}

const TEXT_EFFECTS: Concept[] = ['sparkle', 'rainbow', 'typewriter', 'marquee', 'glowtext', 'blinkie']
const KNOWN = knownWords()

function levenshtein(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 9
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp }
  }
  return row[b.length]
}
/** Fixes small typos (one letter off, two for long words) against words the generator knows. */
function correct(word: string): string {
  if (KNOWN.has(word) || word.length < 4 || /\d/.test(word)) return word
  const limit = word.length >= 7 ? 2 : 1
  let best = word, bestD = limit + 1
  for (const known of KNOWN) { if (known.length < 3) continue; const d = levenshtein(word, known); if (d < bestD) { best = known; bestD = d } }
  return bestD <= limit ? best : word
}
/** Longest-first phrase lookup in a list of tokens; returns matches with their positions. */
function findPhrases<T>(tokens: string[], table: Record<string, T>): { at: number; len: number; key: string; value: T }[] {
  const keys = Object.keys(table).sort((a, b) => b.split(' ').length - a.split(' ').length)
  const used = new Array(tokens.length).fill(false)
  const out: { at: number; len: number; key: string; value: T }[] = []
  for (const key of keys) {
    const parts = key.split(' ')
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      if (parts.every((p, k) => tokens[i + k] === p) && !used.slice(i, i + parts.length).some(Boolean)) {
        out.push({ at: i, len: parts.length, key, value: table[key] }); for (let k = 0; k < parts.length; k++) used[i + k] = true
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}
const conceptTable: Record<string, Concept> = Object.fromEntries(Object.entries(CONCEPTS).flatMap(([concept, words]) => words.map(w => [w, concept as Concept])))

export function interpret(input: string): Interpretation {
  const notes: string[] = []
  let raw = input.slice(0, 600)
  // 1. Quoted text ("hello", “hello”, 'hello') becomes the content, never vocabulary.
  const quotes: string[] = []
  raw = raw.replace(/["“”]([^"“”]{1,200})["“”]|(?:^|\s)'([^']{1,200})'(?=[\s.,!?]|$)/g, (_m, a, b) => { quotes.push((a ?? b).trim()); return ' qqq ' })
  // 2. Links, hex colors, dates and numbers.
  const urls = [...raw.matchAll(/https:\/\/[^\s"'<>]+/gi)].map(m => m[0]); raw = raw.replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
  const hexes = [...raw.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(m => m[0].length === 4 ? '#' + [...m[1]].map(c => c + c).join('') : m[0].toLowerCase())
  raw = raw.replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi, ' hexcolor ')
  const dateMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(raw) || /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:,? \d{4})?)\b/i.exec(raw)
  const lowered = raw.toLowerCase().replace(/[’`]/g, "'").replace(/,/g, ' , ').replace(/[^a-z0-9#',\- ]+/g, ' ').replace(/-/g, ' ')
  // 3. Tokens with typo fixing.
  const corrections: [string, string][] = []
  const tokens = lowered.split(/\s+/).filter(Boolean).map(t => {
    if (t === ',' || t === 'qqq' || t === 'hexcolor') return t
    const fixed = correct(t); if (fixed !== t) corrections.push([t, fixed]); return fixed
  })
  // 4. Clauses: split on "and / then / plus / also / ,", then merge clauses that have nothing to build into a neighbour.
  const clauses: string[][] = [[]]
  for (const t of tokens) { if ([',', 'and', 'then', 'plus', 'also', 'with'].includes(t)) { if (clauses[clauses.length - 1].length) clauses.push([]) } else clauses[clauses.length - 1].push(t) }
  const hasConcept = (c: string[]) => findPhrases(c, conceptTable).length > 0
  const merged: string[][] = []
  for (const c of clauses.filter(c => c.length)) {
    if (!merged.length || hasConcept(c) && hasConcept(merged[merged.length - 1])) merged.push(c)
    else merged[merged.length - 1].push(...c)
  }
  // 5. Native-only requests are pointed at the real profile pieces.
  const joined = ' ' + tokens.join(' ') + ' '
  for (const [word, piece] of Object.entries(NATIVE_ONLY)) if (joined.includes(' ' + word + ' ')) notes.push(`${piece} come from your real Elsewhere data, so add the ${piece} piece in the Visual Designer instead of generating fake ones.`)
  const aestheticHit = findPhrases(tokens, AESTHETICS as Record<string, unknown>)[0]
  const aesthetic = aestheticHit?.key as Aesthetic | undefined

  const pieces: Piece[] = []
  const unknown = new Set<string>()
  let quoteIndex = 0, hexIndex = 0
  for (const clause of merged) {
    const concepts = findPhrases(clause, conceptTable)
    const negatedAt = new Set<number>()
    clause.forEach((t, i) => { if (NEGATIONS.includes(t)) for (let k = i + 1; k <= i + 3 && k < clause.length; k++) negatedAt.add(k) })
    const no = new Set<string>()
    const colors: string[] = []
    let speed = 1, size = 1, shape: string | undefined, particle: string | undefined, count: number | undefined, gloss = false
    const anims: string[] = []
    const consumed = new Set<number>()
    const mark = (at: number, len: number) => { for (let k = 0; k < len; k++) consumed.add(at + k) }
    for (const m of findPhrases(clause, NAMED_COLORS)) { mark(m.at, m.len); if (negatedAt.has(m.at)) no.add('color'); else colors.push(m.value) }
    clause.forEach((t, i) => { if (t === 'hexcolor') { mark(i, 1); if (hexes[hexIndex]) colors.push(hexes[hexIndex]); hexIndex++ } })
    for (const m of findPhrases(clause, SPEEDS)) { mark(m.at, m.len); speed = m.value }
    for (const m of findPhrases(clause, SIZES)) { mark(m.at, m.len); size = m.value }
    for (const m of findPhrases(clause, SHAPES as Record<string, string>)) { mark(m.at, m.len); shape = m.value }
    for (const m of findPhrases(clause, PARTICLES)) { mark(m.at, m.len); if (!negatedAt.has(m.at)) particle = m.value }
    for (const m of findPhrases(clause, ANIMS)) { mark(m.at, m.len); if (negatedAt.has(m.at)) no.add('animation'); else anims.push(m.value) }
    clause.forEach((t, i) => {
      if (/^\d{1,4}$/.test(t)) { mark(i, 1); count = Math.min(200, Number(t)) }
      if (t === 'glossy' || t === 'shiny' || t === 'aero') gloss = true
      if (['animation', 'animations', 'animated', 'moving', 'motion'].includes(t) && negatedAt.has(i)) no.add('animation')
      if (NEGATIONS.includes(t)) mark(i, 1)
    })
    const found = concepts.filter(c => !negatedAt.has(c.at))
    concepts.filter(c => negatedAt.has(c.at)).forEach(c => { no.add(c.value); mark(c.at, c.len) })
    found.forEach(c => mark(c.at, c.len))
    clause.forEach((t, i) => { if (!consumed.has(i) && !FILLER.has(t) && t !== 'qqq' && !KNOWN.has(t) && !/^\d/.test(t)) unknown.add(t) })
    const text = clause.includes('qqq') ? quotes[quoteIndex++] : undefined
    const base = { colors, speed, size, shape, particle, anims, count, gloss, no, text, url: urls[0], date: dateMatch?.[1] }

    // Resolve what to build from the concepts in this clause.
    const kinds = new Set(found.map(c => c.value))
    const effects = TEXT_EFFECTS.filter(e => kinds.has(e))
    if (kinds.has('falling') && !kinds.has('trail') || (particle && kinds.has('background') && anims.includes('float'))) pieces.push({ ...base, concept: 'falling', effects: [] })
    else if (kinds.has('trail') || (kinds.has('cursor') && kinds.has('falling'))) pieces.push({ ...base, concept: 'trail', effects: [] })
    for (const k of kinds) {
      if (['falling', 'trail', 'heading', ...TEXT_EFFECTS].includes(k)) continue
      if (k === 'cursor' && kinds.has('trail')) continue
      if (k === 'background' && pieces.some(p => p.concept === 'falling')) continue
      pieces.push({ ...base, concept: k, effects })
    }
    const builtSomething = [...kinds].some(k => !['heading', ...TEXT_EFFECTS].includes(k))
    if (!builtSomething && (kinds.has('heading') || effects.length)) pieces.push({ ...base, concept: kinds.has('blinkie') && !kinds.has('heading') ? 'blinkie' : 'heading', effects: effects.filter(e => e !== 'blinkie' || kinds.has('heading')) })
    if (!found.length && (colors.length || anims.length || text) && pieces.length) {
      // "make it pink" after something: apply to the previous piece.
      const last = pieces[pieces.length - 1]
      last.colors.push(...colors); last.anims.push(...anims); if (text && !last.text) last.text = text
    } else if (!found.length && text) pieces.push({ ...base, concept: 'heading', effects: [] })
  }
  if (quoteIndex < quotes.length && pieces.length) pieces.forEach(p => { if (!p.text && quoteIndex < quotes.length) p.text = quotes[quoteIndex++] })

  const unknownList = [...unknown].filter(w => w.length > 2)
  let outcome: Outcome = 'understood'
  if (!pieces.length) outcome = (tokens.some(t => NAMED_COLORS[t] || ANIMS[t] || SIZES[t]) ? 'ambiguous' : 'unsupported')
  else if (unknownList.length) outcome = 'partial'
  if (outcome === 'ambiguous') notes.push('I understood how it should look, but not what to make. Try adding a thing, like “a pink button” or “sparkly text”.')
  if (outcome === 'unsupported') notes.push('I couldn’t match that to anything I know how to build yet. Try one of the ideas below.')
  return { pieces: pieces.slice(0, 8), aesthetic, outcome, corrections, unknown: unknownList, notes }
}
