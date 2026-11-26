import type { WidgetPackage } from './profileRender'

// Official Elsewhere starter widgets. Each is a normal widget package: declared properties (which become friendly
// controls in the Inspector) plus HTML/CSS/JavaScript that runs in the locked profile sandbox. Creators can use
// them as-is, change the settings, or remix them into their own.

const base = { author: 'Elsewhere', version: '1.0.0', remix: true }
const calm = "const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;\n"

export const OFFICIAL_WIDGETS: WidgetPackage[] = [
  {
    ...base, id: 'pocket-pet', name: 'Pocket Pet', category: 'Adoptables & Pets', minW: 200, minH: 220,
    description: 'A little pet with moods. Feed it, pet it and tuck it in for a nap.',
    props: [
      { key: 'name', label: 'Pet name', type: 'text', default: 'Mochi', group: 'Pet' },
      { key: 'face', label: 'Pet', type: 'select', options: ['🐰', '🐱', '🐻', '👻', '🐸', '🐹', '🦊', '🐧'], default: '🐰', group: 'Pet' },
      { key: 'color', label: 'Bubble color', type: 'color', default: '#ffd1e6', group: 'Appearance' },
      { key: 'accent', label: 'Button color', type: 'color', default: '#ff5fa2', group: 'Appearance' },
      { key: 'size', label: 'Pet size', type: 'number', min: 40, max: 120, default: 72, group: 'Appearance' },
    ],
    code: {
      html: '<div class="pet"><div class="home"><span class="face" role="img" aria-label="{{name}}">{{face}}</span><span class="mood" aria-live="polite"></span></div><strong>{{name}}</strong><div class="meter" aria-label="energy"><i></i></div><div class="acts"><button type="button" data-a="feed">🍓 feed</button><button type="button" data-a="pet">♡ pet</button><button type="button" data-a="nap">☾ nap</button></div></div>',
      css: 'body{margin:0;font-family:"Trebuchet MS",sans-serif}.pet{display:grid;justify-items:center;gap:6px;padding:10px}.home{position:relative;display:grid;place-items:center;width:{{size}}px;height:{{size}}px;padding:16px;border-radius:50%;background:{{color}};box-shadow:inset 0 -6px 12px #0001,0 6px 14px #0002}.face{font-size:{{size}}px;line-height:1;transition:transform .3s}.mood{position:absolute;top:-6px;right:-6px;font-size:22px}.meter{width:140px;height:8px;border-radius:9px;background:#0001;overflow:hidden}.meter i{display:block;height:100%;width:60%;background:{{accent}};transition:width .4s}.acts{display:flex;gap:4px}.acts button{padding:5px 10px;border:0;border-radius:999px;color:#fff;font:bold 12px inherit;background:{{accent}};cursor:pointer}.happy .face{animation:hop .5s 2}.sleeping .face{transform:rotate(-12deg);opacity:.75}@keyframes hop{50%{transform:translateY(-10px)}}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}',
      js: calm + "const pet = document.querySelector('.pet'), mood = pet.querySelector('.mood'), bar = pet.querySelector('.meter i');\nconst states = { idle: '', happy: '♡', eating: '🍓', sleeping: 'z' };\nlet energy = 60, state = 'idle', timer = 0;\nfunction set(next, ms) {\n  state = next; pet.className = 'pet ' + next; mood.textContent = states[next];\n  bar.style.width = Math.max(5, Math.min(100, energy)) + '%';\n  clearTimeout(timer); if (ms) timer = setTimeout(() => set('idle'), ms);\n}\npet.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {\n  const a = b.dataset.a;\n  if (a === 'feed') { energy += 20; set('eating', 1600); }\n  if (a === 'pet') { energy += 5; set('happy', 1400); }\n  if (a === 'nap') { energy = 100; set('sleeping', 4000); }\n}));\nsetInterval(() => { if (state === 'idle') { energy -= 2; set(energy < 25 ? 'idle' : 'idle'); mood.textContent = energy < 25 ? '…' : ''; } }, 4000);\nset('idle');",
    },
  },
  {
    ...base, id: 'music-player', name: 'Glossy Music Player', category: 'Music Players', minW: 260, minH: 90,
    description: 'Your profile song in a shiny player. Plays an https .mp3 link; never auto-plays.',
    props: [
      { key: 'title', label: 'Song title', type: 'text', default: 'my profile song', group: 'Song' },
      { key: 'artist', label: 'Artist', type: 'text', default: '', group: 'Song' },
      { key: 'url', label: 'Song link (https .mp3)', type: 'text', default: '', group: 'Song', help: 'Leave empty for a player that only looks the part.' },
      { key: 'color', label: 'Player color', type: 'color', default: '#2d84e6', group: 'Appearance' },
    ],
    code: {
      html: '<div class="pl"><button type="button" aria-label="Play or pause">▶</button><div class="info"><strong>{{title}}</strong><small>{{artist}}</small><div class="bar"><i></i></div></div></div>',
      css: 'body{margin:0;font-family:"Segoe UI",sans-serif}.pl{display:flex;align-items:center;gap:10px;margin:6px;padding:10px 14px;border-radius:18px;color:#fff;background:linear-gradient(180deg,color-mix(in srgb,{{color}} 40%,white),{{color}} 48%,color-mix(in srgb,{{color}} 75%,black) 52%,{{color}});box-shadow:inset 0 1px 0 #fff8,0 6px 16px #0003}.pl button{width:40px;height:40px;border:0;border-radius:50%;color:{{color}};font-size:16px;background:#fff;cursor:pointer}.info{display:grid;flex:1;text-shadow:0 1px 1px #0005}.bar{height:6px;margin-top:4px;border-radius:9px;background:#ffffff55}.bar i{display:block;width:0;height:100%;border-radius:inherit;background:#fff}',
      js: "const btn = document.querySelector('.pl button'), fill = document.querySelector('.bar i');\nconst ok = /^https:\\/\\/.+\\.(mp3|ogg|wav|m4a)(\\?.*)?$/i.test(props.url);\nconst audio = ok ? new Audio(props.url) : null;\nbtn.addEventListener('click', () => {\n  if (!audio) { btn.textContent = btn.textContent === '▶' ? '❚❚' : '▶'; return; }\n  if (audio.paused) audio.play(); else audio.pause();\n});\nif (audio) {\n  audio.addEventListener('play', () => { btn.textContent = '❚❚'; });\n  audio.addEventListener('pause', () => { btn.textContent = '▶'; });\n  audio.addEventListener('timeupdate', () => { fill.style.width = (audio.currentTime / (audio.duration || 1) * 100) + '%'; });\n}",
    },
  },
  {
    ...base, id: 'quote-machine', name: 'Quote Machine', category: 'Old-Web Classics', minW: 220, minH: 120,
    description: 'Shows a random quote or lyric from your list each time someone clicks.',
    props: [
      { key: 'quotes', label: 'Quotes (one per line, use | between them)', type: 'text', default: 'stay soft ♡|the internet used to feel like a place|be the main character|drink water, babe', group: 'Content' },
      { key: 'color', label: 'Card color', type: 'color', default: '#fff4fa', group: 'Appearance' },
      { key: 'ink', label: 'Text color', type: 'color', default: '#8a2a63', group: 'Appearance' },
    ],
    code: {
      html: '<button type="button" class="q"><span class="t"></span><small>click for another ✦</small></button>',
      css: 'body{margin:0}.q{display:grid;gap:6px;width:calc(100% - 12px);margin:6px;padding:16px;border:1px dashed {{ink}};border-radius:14px;color:{{ink}};font:italic 16px Georgia,serif;text-align:center;background:{{color}};cursor:pointer}.q small{font:11px "Trebuchet MS",sans-serif;opacity:.7}',
      js: "const list = props.quotes.split('|').map(s => s.trim()).filter(Boolean);\nconst out = document.querySelector('.q .t');\nlet last = -1;\nconst next = () => { if (!list.length) { out.textContent = '♡'; return; } let i; do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === last); last = i; out.textContent = '“' + list[i] + '”'; };\ndocument.querySelector('.q').addEventListener('click', next);\nnext();",
    },
  },
  {
    ...base, id: 'catch-the-star', name: 'Catch the Star', category: 'Mini-Games', minW: 260, minH: 220,
    description: 'A tiny game: click the star before it moves. Score resets every visit.',
    props: [
      { key: 'emoji', label: 'Thing to catch', type: 'select', options: ['⭐', '🍓', '🦋', '💖', '👻', '🍄'], default: '⭐', group: 'Game' },
      { key: 'speed', label: 'Speed (ms)', type: 'number', min: 400, max: 3000, default: 1100, group: 'Game' },
      { key: 'bg', label: 'Background', type: 'color', default: '#e9f7ff', group: 'Appearance' },
    ],
    code: {
      html: '<div class="game"><p>score: <b class="s">0</b> · best: <b class="b">0</b></p><button type="button" class="star" aria-label="catch it">{{emoji}}</button></div>',
      css: 'body{margin:0;font-family:"Trebuchet MS",sans-serif}.game{position:relative;height:100vh;min-height:200px;border-radius:14px;overflow:hidden;background:{{bg}}}.game p{margin:0;padding:8px 10px;color:#2b5677}.star{position:absolute;padding:0;border:0;font-size:34px;background:none;cursor:pointer;transition:left .15s,top .15s}',
      js: "const star = document.querySelector('.star'), s = document.querySelector('.s'), b = document.querySelector('.b');\nlet score = 0, best = 0, t = 0;\nconst move = () => { star.style.left = (5 + Math.random() * 75) + '%'; star.style.top = (20 + Math.random() * 60) + '%'; };\nconst loop = () => { move(); clearTimeout(t); t = setTimeout(() => { score = 0; s.textContent = 0; loop(); }, Math.max(400, props.speed)); };\nstar.addEventListener('click', () => { score++; best = Math.max(best, score); s.textContent = score; b.textContent = best; loop(); });\nloop();",
    },
  },
  {
    ...base, id: 'countdown', name: 'Countdown', category: 'Old-Web Classics', minW: 220, minH: 100,
    description: 'Counts down to your birthday, a release, a holiday… anything.',
    props: [
      { key: 'label', label: 'What it’s counting to', type: 'text', default: 'my birthday ♡', group: 'Countdown' },
      { key: 'date', label: 'Date (YYYY-MM-DD)', type: 'text', default: '2027-01-01', group: 'Countdown' },
      { key: 'color', label: 'Number color', type: 'color', default: '#ff5fa2', group: 'Appearance' },
    ],
    code: {
      html: '<div class="cd"><b class="n">…</b><span>until {{label}}</span></div>',
      css: 'body{margin:0;font-family:"Segoe UI",sans-serif}.cd{display:grid;place-items:center;gap:2px;padding:12px;text-align:center;color:#2b2b40}.n{font:bold 28px "Lucida Console",monospace;color:{{color}}}',
      js: "const el = document.querySelector('.n');\nconst target = new Date(props.date + 'T00:00:00');\nconst tick = () => {\n  if (isNaN(target)) { el.textContent = 'pick a date'; return; }\n  let s = Math.max(0, Math.floor((target - Date.now()) / 1000));\n  const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;\n  el.textContent = s + d + h + m === 0 ? 'today! ✦' : d + 'd ' + h + 'h ' + m + 'm ' + s + 's';\n};\ntick(); setInterval(tick, 1000);",
    },
  },
  {
    ...base, id: 'magic-8', name: 'Magic Ball', category: 'Randomizers', minW: 200, minH: 200,
    description: 'Ask a question, shake the ball, get a very wise answer.',
    props: [
      { key: 'answers', label: 'Answers (use | between them)', type: 'text', default: 'yes ♡|no|ask again later|absolutely|the stars say maybe|not today|100%|outlook glittery', group: 'Content' },
      { key: 'ball', label: 'Ball color', type: 'color', default: '#1d1b3a', group: 'Appearance' },
      { key: 'glow', label: 'Glow color', type: 'color', default: '#9b7bff', group: 'Appearance' },
    ],
    code: {
      html: '<button type="button" class="ball" aria-label="Shake for an answer"><span class="win" aria-live="polite">8</span></button>',
      css: 'body{margin:0;display:grid;place-items:center;height:100vh}.ball{display:grid;place-items:center;width:150px;height:150px;border:0;border-radius:50%;cursor:pointer;background:radial-gradient(circle at 35% 30%,#ffffff55,{{ball}} 45%);box-shadow:0 0 24px {{glow}}}.win{display:grid;place-items:center;width:78px;height:78px;padding:6px;border-radius:50%;color:#fff;font:bold 11px "Trebuchet MS",sans-serif;text-align:center;background:{{glow}}}.shake{animation:sh .5s}@keyframes sh{25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}@media (prefers-reduced-motion:reduce){.shake{animation:none}}',
      js: "const list = props.answers.split('|').map(s => s.trim()).filter(Boolean), ball = document.querySelector('.ball'), win = ball.querySelector('.win');\nball.addEventListener('click', () => { ball.classList.remove('shake'); void ball.offsetWidth; ball.classList.add('shake'); setTimeout(() => { win.textContent = list[Math.floor(Math.random() * list.length)] || '♡'; }, 450); });",
    },
  },
  {
    ...base, id: 'flip-frame', name: 'Flip Photo Frame', category: 'Interactive Frames', minW: 200, minH: 220,
    description: 'A polaroid that flips over to show a secret note on the back.',
    props: [
      { key: 'photo', label: 'Photo link (https)', type: 'text', default: '', group: 'Photo', help: 'An https image link. Empty shows a cute placeholder.' },
      { key: 'caption', label: 'Caption', type: 'text', default: 'memories ♡', group: 'Photo' },
      { key: 'back', label: 'Secret note on the back', type: 'text', default: 'you found the secret ✦', group: 'Photo' },
      { key: 'tilt', label: 'Tilt (degrees)', type: 'number', min: -15, max: 15, default: -3, group: 'Appearance' },
    ],
    code: {
      html: '<button type="button" class="card" aria-label="Flip the photo"><div class="in"><div class="front"><div class="pic"></div><span>{{caption}}</span></div><div class="back">{{back}}</div></div></button>',
      css: 'body{margin:0;display:grid;place-items:center;height:100vh}.card{width:180px;height:210px;padding:0;border:0;background:none;cursor:pointer;perspective:800px;transform:rotate({{tilt}}deg)}.in{position:relative;width:100%;height:100%;transition:transform .6s;transform-style:preserve-3d}.flipped .in{transform:rotateY(180deg)}.front,.back{position:absolute;inset:0;display:grid;gap:6px;padding:10px 10px 8px;background:#fff;box-shadow:0 6px 16px #0003;backface-visibility:hidden;font:14px "Trebuchet MS",sans-serif;color:#4a3a5c}.pic{background:repeating-linear-gradient(45deg,#e9f7ff 0 10px,#ffe3f0 10px 20px) center/cover}.back{place-items:center;transform:rotateY(180deg);font-style:italic}@media (prefers-reduced-motion:reduce){.in{transition:none}}',
      js: "const card = document.querySelector('.card'), pic = document.querySelector('.pic');\nif (/^https:\\/\\//.test(props.photo)) pic.style.backgroundImage = 'url(\"' + props.photo.replace(/\"/g, '') + '\")';\ncard.addEventListener('click', () => card.classList.toggle('flipped'));",
    },
  },
  {
    ...base, id: 'living-terrarium', name: 'Living Terrarium', category: 'Living Terrariums', minW: 240, minH: 200,
    description: 'A tiny aquarium with fish that swim around. Click to drop food.',
    props: [
      { key: 'fish', label: 'Fish', type: 'select', options: ['🐠', '🐟', '🐡', '🦐', '🐙', '🫧'], default: '🐠', group: 'Tank' },
      { key: 'count', label: 'How many', type: 'number', min: 1, max: 8, default: 4, group: 'Tank' },
      { key: 'water', label: 'Water color', type: 'color', default: '#7cc9f3', group: 'Appearance' },
    ],
    code: {
      html: '<div class="tank" role="img" aria-label="A small aquarium"></div>',
      css: 'body{margin:0}.tank{position:relative;height:100vh;min-height:180px;overflow:hidden;border-radius:16px;background:linear-gradient({{water}},color-mix(in srgb,{{water}} 60%,#0b2a4a));cursor:pointer}.f{position:absolute;font-size:26px;transition:left 3s linear,top 3s ease-in-out}.food{position:absolute;font-size:10px;animation:sink 3s linear forwards}@keyframes sink{to{transform:translateY(220px);opacity:0}}@media (prefers-reduced-motion:reduce){.f{transition:none}.food{animation:none}}',
      js: calm + "const tank = document.querySelector('.tank'), fish = [];\nfor (let i = 0; i < Math.min(8, props.count); i++) { const f = document.createElement('span'); f.className = 'f'; f.textContent = props.fish; tank.appendChild(f); fish.push(f); }\nconst swim = (f, x, y) => { const goRight = x > parseFloat(f.style.left || 0); f.style.transform = goRight ? 'scaleX(-1)' : ''; f.style.left = x + '%'; f.style.top = y + '%'; };\nconst wander = () => fish.forEach(f => swim(f, 5 + Math.random() * 80, 10 + Math.random() * 70));\nwander(); if (!calm) setInterval(wander, 3200);\ntank.addEventListener('click', e => { const r = tank.getBoundingClientRect(); const d = document.createElement('span'); d.className = 'food'; d.textContent = '•'; d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px'; tank.appendChild(d); setTimeout(() => d.remove(), 3000); fish.forEach(f => swim(f, (e.clientX - r.left) / r.width * 90, (e.clientY - r.top) / r.height * 80)); });",
    },
  },
]
