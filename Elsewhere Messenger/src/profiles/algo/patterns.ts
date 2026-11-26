import { AESTHETICS, type Aesthetic } from './vocabulary'
import type { Piece } from './parser'

// Algorithmic Intelligence · programming-pattern library. Hand-written, composable code patterns. Every pattern
// is scoped to its own unique id, honors reduced motion, keeps timers and particles bounded, and uses only
// standard HTML/CSS/JavaScript (no libraries, no network).

export type Code = { html: string; css: string; js: string; summary: string }
export type Palette = { ink: string; accent: string; accent2: string; bg: string; font: string; gloss: boolean }

export const paletteFor = (aesthetic?: Aesthetic): Palette => ({ ...(aesthetic ? AESTHETICS[aesthetic] : AESTHETICS['frutiger aero']) })
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const js = (value: unknown) => JSON.stringify(value)
const dur = (base: number, p: Piece) => `${Math.round((base / p.speed) * 100) / 100}s`
const still = (p: Piece) => p.no.has('animation')
const c1 = (p: Piece, pal: Palette) => p.colors[0] || pal.accent
/** Second color: the one asked for, or a lighter shade of the first so a single color stays one color. */
const c2 = (p: Piece, pal: Palette) => p.colors[1] || (p.colors[0] ? `color-mix(in srgb, ${p.colors[0]} 55%, white)` : pal.accent2)
const reduce = (id: string) => `@media (prefers-reduced-motion: reduce) { #${id}, #${id} * { animation: none !important; transition: none !important; } }`
const glossBg = (a: string, b: string) => `linear-gradient(180deg, color-mix(in srgb, ${a} 35%, white) 0%, ${a} 48%, color-mix(in srgb, ${a} 80%, black) 52%, ${b} 100%)`
const ANIM_CSS: Record<string, string> = {
  bounce: '0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}', spin: 'to{transform:rotate(360deg)}', float: '0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}',
  shake: '0%,100%{transform:translateX(0)}25%{transform:translateX(-4px) rotate(-2deg)}75%{transform:translateX(4px) rotate(2deg)}', pulse: '0%,100%{transform:scale(1)}50%{transform:scale(1.08)}',
  fade: '0%,100%{opacity:1}50%{opacity:.35}', flicker: '0%,19%,22%,62%,64%,100%{opacity:1}20%,21%,63%{opacity:.3}', glow: '0%,100%{filter:drop-shadow(0 0 2px currentColor)}50%{filter:drop-shadow(0 0 12px currentColor)}',
  wave: '0%,100%{transform:skewX(0)}50%{transform:skewX(-8deg)}',
}
const animDur: Record<string, number> = { bounce: 1.2, spin: 4, float: 3, shake: 0.6, pulse: 1.6, fade: 2.4, flicker: 3, glow: 2, wave: 2 }
function anims(id: string, p: Piece) {
  if (still(p) || !p.anims.length) return { css: '', value: '' }
  const list = [...new Set(p.anims)].slice(0, 2)
  return { css: list.map(a => `@keyframes ${id}-${a}{${ANIM_CSS[a]}}`).join('\n'), value: list.map(a => `${id}-${a} ${dur(animDur[a], p)} ease-in-out infinite`).join(', ') }
}

/** Patterns that already apply the requested animation themselves. */
export const ANIMATES_ITSELF = new Set(['heading', 'button', 'card', 'sparkle', 'rainbow', 'typewriter', 'marquee', 'glowtext'])
const ING: Record<string, string> = { bounce: 'bouncing', spin: 'spinning', float: 'floating', shake: 'wiggling', pulse: 'pulsing', fade: 'fading', flicker: 'flickering', glow: 'glowing', wave: 'wavy' }
/** Wraps any other pattern so a "bouncing clock" or "spinning sticker" moves too. */
export function withAnimation(id: string, p: Piece, out: Code): Code {
  const a = anims(id + '-m', p)
  if (!a.value) return out
  return { ...out, html: `<div id="${id}-m" style="display:flex;justify-content:center">${out.html}</div>`, css: `${out.css}\n${a.css}\n#${id}-m > * { animation: ${a.value}; }\n${reduce(id + '-m')}`, summary: `${ING[p.anims[0]] || p.anims[0]} ${out.summary}` }
}
export const PATTERNS: Record<string, (id: string, p: Piece, pal: Palette) => Code> = {
  heading(id, p, pal) {
    const text = p.text || 'welcome to my page ♡'
    const size = Math.round(34 * p.size)
    const a = anims(id, p)
    let css = `#${id} { font: bold ${size}px/1.2 ${pal.font}; color: ${c1(p, pal)}; text-align: center; margin: 0; padding: 8px; }`
    let html = `<h2 id="${id}">${esc(text)}</h2>`, script = '', summary = 'text'
    const fx = new Set(p.effects)
    if (fx.has('rainbow')) {
      css += `\n#${id} { background: linear-gradient(90deg, #ff4d6d, #ffb347, #ffe66d, #6ee36e, #4dc3ff, #9b6bff, #ff4d6d); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;${still(p) ? '' : ` animation: ${id}-rainbow ${dur(6, p)} linear infinite;`} }\n@keyframes ${id}-rainbow { to { background-position: 300% 0; } }`
      summary = 'rainbow text'
    }
    if (fx.has('glowtext')) { css += `\n#${id} { text-shadow: 0 0 6px ${c1(p, pal)}, 0 0 14px ${c1(p, pal)}, 0 0 28px ${c2(p, pal)}; color: #fff; }`; summary = 'neon glowing text' }
    if (fx.has('sparkle')) {
      html = `<div id="${id}" class="wrap"><h2>${esc(text)}</h2></div>`
      css = `#${id} { position: relative; text-align: center; padding: 10px; }\n#${id} h2 { margin: 0; font: bold ${size}px/1.2 ${pal.font}; color: ${c1(p, pal)}; ${fx.has('rainbow') ? '' : `text-shadow: 0 0 8px color-mix(in srgb, ${c1(p, pal)} 50%, white);`} }` +
        (fx.has('rainbow') ? `\n#${id} h2 { background: linear-gradient(90deg, #ff4d6d, #ffb347, #ffe66d, #6ee36e, #4dc3ff, #9b6bff); -webkit-background-clip: text; background-clip: text; color: transparent; }` : '') +
        `\n#${id} .sp { position: absolute; pointer-events: none; color: ${c2(p, pal)}; font-size: 14px; animation: ${id}-tw ${dur(1.4, p)} ease-in-out forwards; }\n@keyframes ${id}-tw { 0% { transform: scale(0) rotate(0); opacity: 0; } 50% { transform: scale(1.2) rotate(90deg); opacity: 1; } 100% { transform: scale(0) rotate(180deg); opacity: 0; } }`
      if (!still(p)) script = `(() => {\n  const box = document.getElementById(${js(id)});\n  if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;\n  const glyphs = ['✦', '✧', '⋆', '♡'];\n  setInterval(() => {\n    if (box.querySelectorAll('.sp').length > 18) return;\n    const s = document.createElement('span');\n    s.className = 'sp';\n    s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];\n    s.style.left = Math.random() * 100 + '%';\n    s.style.top = Math.random() * 100 + '%';\n    box.appendChild(s);\n    setTimeout(() => s.remove(), 1500);\n  }, ${Math.max(80, Math.round(180 / p.speed))});\n})();`
      summary = (fx.has('rainbow') ? 'rainbow ' : '') + 'sparkling text'
    }
    if (fx.has('typewriter')) {
      html = `<h2 id="${id}" aria-label="${esc(text)}"><span class="t"></span><span class="caret">|</span></h2>`
      css += `\n#${id} .caret { animation: ${id}-blink 1s steps(1) infinite; margin-left: 2px; }\n@keyframes ${id}-blink { 50% { opacity: 0; } }`
      script = `(() => {\n  const el = document.querySelector('#${id} .t');\n  const text = ${js(text)};\n  if (!el) return;\n  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }\n  let i = 0;\n  const step = () => {\n    el.textContent = text.slice(0, ++i);\n    if (i < text.length) setTimeout(step, ${Math.round(90 / p.speed)});\n    else setTimeout(() => { i = 0; step(); }, 2600);\n  };\n  step();\n})();`
      summary = 'typewriter text'
    }
    if (fx.has('marquee')) {
      html = `<div id="${id}" role="marquee" aria-label="${esc(text)}"><span>${esc(text)}</span></div>`
      const rainbowText = fx.has('rainbow') ? ' background: linear-gradient(90deg, #ff4d6d, #ffb347, #ffe66d, #6ee36e, #4dc3ff, #9b6bff, #ff4d6d); -webkit-background-clip: text; background-clip: text; color: transparent;' : ''
      css = `#${id} { overflow: hidden; white-space: nowrap; font: bold ${size}px/1.4 ${pal.font}; color: ${c1(p, pal)}; }\n#${id} span { display: inline-block;${still(p) ? '' : ' padding-left: 100%;'}${rainbowText}${still(p) ? '' : ` animation: ${id}-mq ${dur(10, p)} linear infinite;`} }\n@keyframes ${id}-mq { to { transform: translateX(-100%); } }`
      summary = (fx.has('rainbow') ? 'rainbow ' : '') + 'scrolling marquee text'
    }
    if (fx.has('blinkie')) { css += `\n#${id} { animation: ${id}-bl ${dur(1, p)} steps(1) infinite; }\n@keyframes ${id}-bl { 50% { opacity: .2; } }`; summary = 'blinking text' }
    if (a.value) { css += `\n${a.css}\n#${id} { display: inline-block; animation: ${a.value}; }`; css = `#${id}-outer { text-align: center; }\n` + css; html = `<div id="${id}-outer">${html}</div>` }
    return { html, css: css + '\n' + reduce(id), js: script, summary }
  },
  button(id, p, pal) {
    const a = c1(p, pal), b = c2(p, pal)
    const radius = p.shape === 'square' ? '4px' : p.shape === 'circle' ? '50%' : '999px'
    const label = p.text || (p.url ? 'visit ♡' : 'click me ♡')
    const tag = p.url ? `<a id="${id}" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : `<button id="${id}" type="button">${esc(label)}</button>`
    const an = anims(id, p)
    const css = `#${id} { display: inline-block; padding: ${Math.round(10 * p.size)}px ${Math.round(24 * p.size)}px; border: 1px solid color-mix(in srgb, ${a} 70%, black); border-radius: ${radius}; ${p.shape === 'circle' ? `width: ${Math.round(90 * p.size)}px; height: ${Math.round(90 * p.size)}px; padding: 0;` : ''}
  color: #fff; font: bold ${Math.round(16 * p.size)}px ${pal.font}; text-decoration: none; text-shadow: 0 1px 1px #0005; cursor: pointer;
  background: ${p.gloss || pal.gloss ? glossBg(a, b) : `linear-gradient(${a}, color-mix(in srgb, ${a} 75%, black))`}; box-shadow: inset 0 1px 0 #fff8, 0 3px 8px #0003; transition: transform .15s, filter .15s; ${an.value ? `animation: ${an.value};` : ''} }
#${id}:hover { transform: translateY(-2px) scale(1.04); filter: brightness(1.08); }
#${id}:active { transform: translateY(1px); }
#${id}:focus-visible { outline: 3px solid ${b}; outline-offset: 3px; }
${an.css}
${reduce(id)}`
    return { html: `<div style="text-align:center;padding:10px">${tag}</div>`, css, js: '', summary: `${p.gloss || pal.gloss ? 'glossy ' : ''}button${p.url ? ' link' : ''}` }
  },
  clock(id, p, pal) {
    const css = `#${id} { display: inline-block; padding: 10px 18px; border-radius: 12px; font: bold ${Math.round(32 * p.size)}px "Lucida Console", "Courier New", monospace; letter-spacing: 2px;
  color: ${c1(p, pal)}; background: ${pal.bg}; border: 2px solid ${c2(p, pal)}; text-shadow: 0 0 6px color-mix(in srgb, ${c1(p, pal)} 60%, transparent); }`
    const script = `(() => {\n  const el = document.getElementById(${js(id)});\n  if (!el) return;\n  const tick = () => { el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };\n  tick();\n  setInterval(tick, 1000);\n})();`
    return { html: `<div style="text-align:center;padding:10px"><time id="${id}" aria-live="off">--:--:--</time></div>`, css, js: script, summary: 'digital clock' }
  },
  countdown(id, p, pal) {
    const target = p.date ? new Date(p.date) : null
    const valid = target && !isNaN(target.getTime())
    const label = p.text || (valid ? 'counting down ♡' : 'until the new year ✦')
    const css = `#${id} { text-align: center; font: ${pal.font.includes('mono') ? '' : 'bold '}${Math.round(18 * p.size)}px ${pal.font}; color: ${c1(p, pal)}; padding: 10px; }\n#${id} .n { display: block; font-size: 1.8em; color: ${c2(p, pal)}; }`
    const script = `(() => {\n  const el = document.querySelector('#${id} .n');\n  const target = ${valid ? `new Date(${js(target!.toISOString())})` : 'new Date(new Date().getFullYear() + 1, 0, 1)'};\n  const tick = () => {\n    let s = Math.max(0, Math.floor((target - Date.now()) / 1000));\n    const d = Math.floor(s / 86400); s %= 86400;\n    const h = Math.floor(s / 3600); s %= 3600;\n    const m = Math.floor(s / 60); s %= 60;\n    el.textContent = d + 'd ' + h + 'h ' + m + 'm ' + s + 's';\n  };\n  tick();\n  setInterval(tick, 1000);\n})();`
    return { html: `<div id="${id}"><span class="n">…</span>${esc(label)}</div>`, css, js: script, summary: valid ? 'countdown to your date' : 'countdown to the new year' }
  },
  progress(id, p, pal) {
    const value = Math.min(100, p.count ?? 72)
    const css = `#${id} { padding: 10px; font: 14px ${pal.font}; color: ${pal.ink}; }\n#${id} .track { height: ${Math.round(22 * p.size)}px; border-radius: 999px; background: color-mix(in srgb, ${c1(p, pal)} 18%, white); border: 1px solid color-mix(in srgb, ${c1(p, pal)} 60%, black); overflow: hidden; }
#${id} .fill { height: 100%; width: ${value}%; border-radius: inherit; background: ${pal.gloss || p.gloss ? glossBg(c1(p, pal), c2(p, pal)) : c1(p, pal)};${still(p) ? '' : ` background-size: 40px 40px; background-image: linear-gradient(45deg, #ffffff40 25%, transparent 25% 50%, #ffffff40 50% 75%, transparent 75%), ${glossBg(c1(p, pal), c2(p, pal))}; animation: ${id}-move ${dur(1.2, p)} linear infinite;`} }
@keyframes ${id}-move { to { background-position: 40px 0, 0 0; } }\n${reduce(id)}`
    return { html: `<div id="${id}"><div>${esc(p.text || 'loading my vibes…')} ${value}%</div><div class="track" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div></div>`, css, js: '', summary: 'progress bar' }
  },
  accordion(id, p, pal) {
    const title = p.text || 'click to open ♡'
    const css = `#${id} { margin: 8px; border: 1px solid ${c1(p, pal)}; border-radius: 10px; overflow: hidden; font: 14px ${pal.font}; color: ${pal.ink}; background: ${pal.bg}; }
#${id} summary { padding: 10px 14px; cursor: pointer; font-weight: bold; color: #fff; background: ${pal.gloss ? glossBg(c1(p, pal), c2(p, pal)) : c1(p, pal)}; list-style: none; }
#${id} summary::before { content: '▸ '; display: inline-block; transition: transform .2s; }
#${id}[open] summary::before { transform: rotate(90deg); }
#${id} .body { padding: 10px 14px; }\n${reduce(id)}`
    return { html: `<details id="${id}"><summary>${esc(title)}</summary><div class="body">write your hidden message here ✦</div></details>`, css, js: '', summary: 'click-to-open reveal' }
  },
  tabs(id, p, pal) {
    const names = ['about', 'faves', 'links']
    const css = `#${id} { margin: 8px; font: 14px ${pal.font}; color: ${pal.ink}; }\n#${id} [role=tablist] { display: flex; gap: 4px; }
#${id} [role=tab] { padding: 6px 14px; border: 1px solid ${c1(p, pal)}; border-bottom: 0; border-radius: 10px 10px 0 0; cursor: pointer; font: inherit; color: ${c1(p, pal)}; background: ${pal.bg}; }
#${id} [role=tab][aria-selected=true] { color: #fff; background: ${pal.gloss ? glossBg(c1(p, pal), c2(p, pal)) : c1(p, pal)}; }
#${id} [role=tabpanel] { padding: 12px; border: 1px solid ${c1(p, pal)}; border-radius: 0 10px 10px 10px; background: ${pal.bg}; }`
    const script = `(() => {\n  const root = document.getElementById(${js(id)});\n  const tabs = [...root.querySelectorAll('[role=tab]')];\n  const show = (i) => tabs.forEach((t, k) => {\n    t.setAttribute('aria-selected', String(k === i));\n    t.tabIndex = k === i ? 0 : -1;\n    document.getElementById(t.getAttribute('aria-controls')).hidden = k !== i;\n  });\n  tabs.forEach((t, i) => {\n    t.addEventListener('click', () => show(i));\n    t.addEventListener('keydown', (e) => {\n      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {\n        const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;\n        show(n);\n        tabs[n].focus();\n      }\n    });\n  });\n  show(0);\n})();`
    return { html: `<div id="${id}"><div role="tablist">${names.map((n, i) => `<button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}">${n}</button>`).join('')}</div>${names.map((n, i) => `<div role="tabpanel" id="${id}-p${i}" aria-labelledby="${id}-t${i}">your ${n} go here ♡</div>`).join('')}</div>`, css, js: script, summary: 'tabs' }
  },
  dropdown(id, p, pal) {
    const items = ['home', 'about me', 'music', 'friends']
    const css = `#${id} { position: relative; display: inline-block; margin: 8px; font: 14px ${pal.font}; }
#${id} > button { padding: 8px 16px; border: 1px solid ${c1(p, pal)}; border-radius: 10px; color: #fff; font: bold 14px ${pal.font}; cursor: pointer; background: ${pal.gloss ? glossBg(c1(p, pal), c2(p, pal)) : c1(p, pal)}; }
#${id} ul { position: absolute; left: 0; top: 100%; z-index: 5; min-width: 160px; margin: 4px 0 0; padding: 4px; list-style: none; border: 1px solid ${c1(p, pal)}; border-radius: 10px; background: ${pal.bg}; box-shadow: 0 8px 20px #0003; }
#${id} a { display: block; padding: 6px 10px; border-radius: 6px; color: ${pal.ink}; text-decoration: none; }\n#${id} a:hover, #${id} a:focus { background: color-mix(in srgb, ${c1(p, pal)} 20%, transparent); }`
    const script = `(() => {\n  const root = document.getElementById(${js(id)});\n  const btn = root.querySelector('button');\n  const list = root.querySelector('ul');\n  const set = (open) => { list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };\n  btn.addEventListener('click', () => set(list.hidden));\n  document.addEventListener('click', (e) => { if (!root.contains(e.target)) set(false); });\n  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { set(false); btn.focus(); } });\n  set(false);\n})();`
    return { html: `<nav id="${id}"><button type="button" aria-haspopup="true" aria-expanded="false">${esc(p.text || 'menu ▾')}</button><ul>${items.map(i => `<li><a href="#${id}-${i.replace(' ', '-')}">${i}</a></li>`).join('')}</ul></nav>`, css, js: script, summary: 'dropdown menu' }
  },
  cursor(id, p, pal) {
    const glyph = p.particle || '♥'
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><text y='24' font-size='24' fill='${c1(p, pal)}'>${glyph}</text></svg>`
    const url = `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}") 4 4, auto`
    return { html: `<div id="${id}" style="padding:20px;text-align:center;font:14px ${pal.font};color:${pal.ink}">hover here to see the ${glyph} cursor</div>`, css: `html, body, #${id} { cursor: ${url}; }`, js: '', summary: `${glyph} cursor` }
  },
  trail(id, p, pal) {
    const glyph = p.particle || '✦'
    const css = `.${id}-dot { position: fixed; pointer-events: none; z-index: 99; color: ${c1(p, pal)}; font-size: ${Math.round(14 * p.size)}px; animation: ${id}-fade ${dur(0.9, p)} ease-out forwards; }\n@keyframes ${id}-fade { to { transform: translateY(14px) scale(.3); opacity: 0; } }\n${reduce(id)}`
    const script = `(() => {\n  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;\n  const colors = ${js(p.colors.length ? p.colors : [pal.accent, pal.accent2])};\n  let last = 0, live = 0;\n  document.addEventListener('pointermove', (e) => {\n    const now = performance.now();\n    if (now - last < 40 || live > 30) return;\n    last = now; live++;\n    const d = document.createElement('span');\n    d.className = ${js(id + '-dot')};\n    d.textContent = ${js(glyph)};\n    d.style.left = e.clientX + 'px';\n    d.style.top = e.clientY + 'px';\n    d.style.color = colors[live % colors.length];\n    document.body.appendChild(d);\n    setTimeout(() => { d.remove(); live--; }, 1000);\n  });\n})();`
    return { html: `<div id="${id}" style="padding:20px;text-align:center;font:14px ${pal.font};color:${pal.ink}">move your mouse ${glyph}</div>`, css, js: script, summary: `${glyph} cursor trail` }
  },
  falling(id, p, pal) {
    const glyph = p.particle || '❄'
    const n = Math.min(40, p.count ?? 18)
    const up = glyph === '◯' || p.anims.includes('float')
    const css = `#${id} { position: relative; height: 100%; min-height: 220px; overflow: hidden; }\n#${id} span { position: absolute; top: ${up ? '105%' : '-10%'}; color: ${c1(p, pal)}; user-select: none; pointer-events: none; animation: ${id}-fall linear infinite; }
@keyframes ${id}-fall { to { transform: translateY(${up ? '-120vh' : '120vh'}) rotate(${glyph === '■' ? 540 : 120}deg); } }\n${reduce(id)}`
    const script = `(() => {\n  const box = document.getElementById(${js(id)});\n  if (!box) return;\n  const colors = ${js(p.colors.length ? p.colors : [pal.accent, pal.accent2, '#ffffff'])};\n  const glyph = ${js(glyph)};\n  for (let i = 0; i < ${n}; i++) {\n    const s = document.createElement('span');\n    s.textContent = glyph;\n    s.style.left = Math.random() * 100 + '%';\n    s.style.fontSize = (10 + Math.random() * ${Math.round(18 * p.size)}) + 'px';\n    s.style.color = colors[i % colors.length];\n    s.style.opacity = String(0.5 + Math.random() * 0.5);\n    s.style.animationDuration = (${(6 / p.speed).toFixed(2)} + Math.random() * 6) + 's';\n    s.style.animationDelay = (-Math.random() * 10) + 's';\n    box.appendChild(s);\n  }\n})();`
    const name = { '❄': 'snow', '♥': 'hearts', '★': 'stars', '◯': 'bubbles', '■': 'confetti', '✿': 'petals', '✦': 'sparkles', '│': 'rain' }[glyph] || glyph
    return { html: `<div id="${id}" aria-hidden="true"></div>`, css, js: script, summary: `${up ? 'floating' : 'falling'} ${name} (${n})` }
  },
  window(id, p, pal) {
    const a = c1(p, pal)
    const css = `#${id} { margin: 8px; border: 1px solid color-mix(in srgb, ${a} 70%, black); border-radius: 8px 8px 4px 4px; overflow: hidden; background: ${pal.bg}; box-shadow: 0 8px 24px #0003; font: 14px ${pal.font}; color: ${pal.ink}; }
#${id} .bar { display: flex; align-items: center; gap: 6px; padding: 5px 8px; color: #fff; font-weight: bold; text-shadow: 0 1px 1px #0006; background: ${glossBg(a, c2(p, pal))}; }
#${id} .bar span { flex: 1; }\n#${id} .bar button { width: 20px; height: 18px; padding: 0; border: 1px solid #fff9; border-radius: 3px; color: #fff; font: bold 11px Tahoma; background: #ffffff33; cursor: pointer; }
#${id} .body { padding: 12px; }`
    const script = `(() => {\n  const root = document.getElementById(${js(id)});\n  root.querySelector('.min').addEventListener('click', () => { const b = root.querySelector('.body'); b.hidden = !b.hidden; });\n  root.querySelector('.close').addEventListener('click', () => { root.hidden = true; });\n})();`
    return { html: `<section id="${id}" aria-label="${esc(p.text || 'my window')}"><div class="bar"><span>${esc(p.text || 'my_window.exe')}</span><button type="button" class="min" aria-label="Minimize">_</button><button type="button" class="close" aria-label="Close">×</button></div><div class="body">type anything in here ♡</div></section>`, css, js: script, summary: 'retro window' }
  },
  card(id, p, pal) {
    const an = anims(id, p)
    const css = `#${id} { margin: 8px; padding: 16px; border-radius: ${p.shape === 'square' ? 4 : 16}px; font: 14px ${pal.font}; color: ${pal.ink}; background: ${p.colors.length > 1 ? `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` : p.colors[0] || pal.bg};
  border: 1px solid #ffffffcc; box-shadow: 0 8px 22px #0002, inset 0 1px 0 #fff; ${an.value ? `animation: ${an.value};` : ''} }\n#${id} h3 { margin: 0 0 6px; color: ${pal.accent}; }\n${an.css}\n${reduce(id)}`
    return { html: `<article id="${id}"><h3>${esc(p.text || 'a little card ♡')}</h3><p>write something sweet here.</p></article>`, css, js: '', summary: 'card' }
  },
  frame(id, p, pal) {
    const css = `#${id} { display: inline-block; margin: 10px; padding: 10px 10px 34px; background: #fff; box-shadow: 0 6px 18px #0003; transform: rotate(-3deg); transition: transform .2s; font: 15px ${pal.font}; color: ${pal.ink}; text-align: center; }
#${id}:hover { transform: rotate(0) scale(1.03); }\n#${id} .pic { display: grid; place-items: center; width: ${Math.round(180 * p.size)}px; height: ${Math.round(160 * p.size)}px; color: #6a86a8; background: repeating-linear-gradient(45deg, ${pal.bg} 0 10px, color-mix(in srgb, ${c1(p, pal)} 20%, white) 10px 20px); }
#${id} img { width: 100%; height: 100%; object-fit: cover; }\n${reduce(id)}`
    const pic = p.url && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(p.url) ? `<img src="${esc(p.url)}" alt="">` : 'your picture here'
    return { html: `<div style="text-align:center"><figure id="${id}"><div class="pic">${pic}</div><figcaption>${esc(p.text || 'memories ♡')}</figcaption></figure></div>`, css, js: '', summary: 'polaroid photo frame' }
  },
  blinkie(id, p, pal) {
    const css = `#${id} { display: inline-block; padding: 2px 8px; border: 1px solid ${c1(p, pal)}; font: bold 12px "Lucida Console", monospace; color: ${c1(p, pal)}; background: #000;${still(p) ? '' : ` animation: ${id}-b ${dur(0.8, p)} steps(1) infinite;`} }
@keyframes ${id}-b { 50% { color: ${c2(p, pal)}; border-color: ${c2(p, pal)}; } }\n${reduce(id)}`
    return { html: `<div style="text-align:center;padding:8px"><span id="${id}">${esc(p.text || '♥ i ♥ the old web ♥')}</span></div>`, css, js: '', summary: 'blinkie' }
  },
  player(id, p, pal) {
    const a = c1(p, pal)
    const audio = p.url && /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(p.url) ? p.url : ''
    const css = `#${id} { display: flex; align-items: center; gap: 10px; margin: 8px; padding: 10px 14px; border-radius: 18px; font: 14px ${pal.font}; color: #fff; background: ${glossBg(a, c2(p, pal))}; box-shadow: 0 6px 18px #0003; }
#${id} button { width: 38px; height: 38px; border: 1px solid #fff9; border-radius: 50%; color: ${a}; font-size: 16px; background: #fff; cursor: pointer; }\n#${id} .info { flex: 1; text-shadow: 0 1px 1px #0005; }\n#${id} .bar { height: 6px; margin-top: 4px; border-radius: 9px; background: #ffffff55; }\n#${id} .bar i { display: block; width: 0; height: 100%; border-radius: inherit; background: #fff; }`
    const script = audio ? `(() => {\n  const root = document.getElementById(${js(id)});\n  const audio = new Audio(${js(audio)});\n  const btn = root.querySelector('button');\n  const fill = root.querySelector('.bar i');\n  btn.addEventListener('click', () => { if (audio.paused) audio.play(); else audio.pause(); });\n  audio.addEventListener('play', () => { btn.textContent = '❚❚'; });\n  audio.addEventListener('pause', () => { btn.textContent = '▶'; });\n  audio.addEventListener('timeupdate', () => { fill.style.width = (audio.currentTime / (audio.duration || 1) * 100) + '%'; });\n})();`
      : `(() => {\n  const root = document.getElementById(${js(id)});\n  const btn = root.querySelector('button');\n  btn.addEventListener('click', () => { btn.textContent = btn.textContent === '▶' ? '❚❚' : '▶'; });\n})();`
    return { html: `<div id="${id}"><button type="button" aria-label="Play or pause">▶</button><div class="info"><strong>${esc(p.text || 'my profile song')}</strong><div class="bar"><i></i></div></div></div>`, css, js: script,
      summary: audio ? 'music player (plays your link)' : 'music player design (add an https .mp3 link to make it play)' }
  },
  background(id, p, pal) {
    const a = c1(p, pal), b = c2(p, pal)
    const css = `#${id} { position: relative; min-height: 220px; height: 100%; border-radius: 12px; background: linear-gradient(135deg, ${a}, ${b}, ${p.colors[2] || pal.bg}); background-size: 300% 300%;${still(p) ? '' : ` animation: ${id}-bg ${dur(12, p)} ease infinite;`} }
@keyframes ${id}-bg { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }\n${reduce(id)}`
    return { html: `<div id="${id}" aria-hidden="true"></div>`, css, js: '', summary: `${still(p) ? '' : 'animated '}gradient background` }
  },
  toggle(id, p, pal) {
    const css = `#${id} { padding: 16px; border-radius: 12px; font: 14px ${pal.font}; color: ${pal.ink}; background: ${pal.bg}; transition: background .3s, color .3s; }
#${id}.dark { color: #f0f0ff; background: #15152a; }\n#${id} button { padding: 6px 14px; border: 1px solid ${c1(p, pal)}; border-radius: 999px; color: #fff; font: bold 13px ${pal.font}; background: ${c1(p, pal)}; cursor: pointer; }`
    const script = `(() => {\n  const root = document.getElementById(${js(id)});\n  const btn = root.querySelector('button');\n  btn.addEventListener('click', () => {\n    const dark = root.classList.toggle('dark');\n    btn.textContent = dark ? '☀ light mode' : '☾ dark mode';\n    btn.setAttribute('aria-pressed', String(dark));\n  });\n})();`
    return { html: `<div id="${id}"><button type="button" aria-pressed="false">☾ dark mode</button><p>${esc(p.text || 'flip the switch ✦')}</p></div>`, css, js: script, summary: 'dark mode switch' }
  },
  sticker(id, p, pal) {
    const glyph = p.text || p.particle || '🦋'
    const n = Math.min(12, p.count ?? 3)
    const css = `#${id} { position: relative; height: 100%; min-height: 200px; }\n#${id} .st { position: absolute; font-size: ${Math.round(40 * p.size)}px; cursor: grab; user-select: none; touch-action: none; color: ${c1(p, pal)}; }\n#${id} .st:active { cursor: grabbing; }`
    const script = `(() => {\n  const root = document.getElementById(${js(id)});\n  for (let i = 0; i < ${n}; i++) {\n    const s = document.createElement('span');\n    s.className = 'st';\n    s.textContent = ${js(glyph)};\n    s.tabIndex = 0;\n    s.setAttribute('role', 'img');\n    s.setAttribute('aria-label', 'draggable sticker');\n    s.style.left = (10 + Math.random() * 70) + '%';\n    s.style.top = (10 + Math.random() * 60) + '%';\n    s.addEventListener('pointerdown', (e) => {\n      s.setPointerCapture(e.pointerId);\n      const box = root.getBoundingClientRect();\n      const move = (ev) => { s.style.left = (ev.clientX - box.left - 20) + 'px'; s.style.top = (ev.clientY - box.top - 20) + 'px'; };\n      s.addEventListener('pointermove', move);\n      s.addEventListener('pointerup', () => s.removeEventListener('pointermove', move), { once: true });\n    });\n    root.appendChild(s);\n  }\n})();`
    return { html: `<div id="${id}"></div>`, css, js: script, summary: `${n} draggable stickers` }
  },
  counter(id, p, pal) {
    const css = `#${id} { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid ${c1(p, pal)}; border-radius: 999px; font: bold 16px ${pal.font}; color: ${c1(p, pal)}; background: ${pal.bg}; cursor: pointer; transition: transform .1s; }\n#${id}:active { transform: scale(.94); }`
    const script = `(() => {\n  const btn = document.getElementById(${js(id)});\n  const out = btn.querySelector('.n');\n  let n = 0;\n  btn.addEventListener('click', () => { out.textContent = String(++n); });\n})();`
    return { html: `<div style="text-align:center;padding:10px"><button id="${id}" type="button">${esc(p.particle || '♥')} <span class="n">0</span></button></div>`, css, js: script, summary: 'click counter (counts this visit only)' }
  },
  divider(id, p, pal) {
    const glyph = p.particle || '✦'
    const css = `#${id} { display: flex; align-items: center; gap: 10px; margin: 10px; color: ${c1(p, pal)}; }\n#${id}::before, #${id}::after { content: ''; flex: 1; height: 2px; border-radius: 2px; background: linear-gradient(90deg, transparent, ${c1(p, pal)}, transparent); }`
    return { html: `<div id="${id}" role="separator" aria-hidden="true">${glyph} ${glyph} ${glyph}</div>`, css, js: '', summary: 'decorated divider' }
  },
  sparkle: (id, p, pal) => PATTERNS.heading(id, { ...p, effects: ['sparkle'] }, pal),
  rainbow: (id, p, pal) => PATTERNS.heading(id, { ...p, effects: ['rainbow'] }, pal),
  typewriter: (id, p, pal) => PATTERNS.heading(id, { ...p, effects: ['typewriter'] }, pal),
  marquee: (id, p, pal) => PATTERNS.heading(id, { ...p, effects: ['marquee'] }, pal),
  glowtext: (id, p, pal) => PATTERNS.heading(id, { ...p, effects: ['glowtext'] }, pal),
}
