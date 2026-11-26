// Algorithmic Intelligence · vocabulary. Every word the generator understands is listed here by hand:
// concepts (things to make), modifiers (how they look/behave) and aesthetics. No trained models.

/** Things the generator can build. Each maps from many everyday words. */
export const CONCEPTS = {
  sparkle: ['sparkle', 'sparkles', 'sparkly', 'sparkling', 'glitter', 'glittery', 'shimmer', 'shimmery', 'twinkle', 'twinkly'],
  rainbow: ['rainbow', 'rainbows', 'colorful', 'colourful', 'multicolor', 'multicolored'],
  typewriter: ['typewriter', 'typing', 'typed', 'type out', 'types out'],
  marquee: ['marquee', 'scrolling', 'scroll across', 'ticker', 'slides across'],
  glowtext: ['neon', 'glowing', 'glow'],
  heading: ['heading', 'title', 'header', 'headline', 'name', 'text', 'words', 'message', 'quote', 'banner'],
  button: ['button', 'buttons', 'btn'],
  clock: ['clock', 'time', 'watch'],
  countdown: ['countdown', 'count down', 'timer until', 'days until', 'days till'],
  progress: ['progress', 'progress bar', 'loading bar', 'meter', 'bar'],
  accordion: ['accordion', 'expand', 'expandable', 'collapse', 'collapsible', 'reveal', 'spoiler', 'show more', 'read more', 'hidden text', 'click to open'],
  tabs: ['tabs', 'tab', 'tabbed'],
  dropdown: ['dropdown', 'drop down', 'drop-down', 'menu', 'nav', 'navigation'],
  cursor: ['cursor', 'mouse', 'pointer'],
  trail: ['trail', 'trails', 'follow', 'follows', 'following'],
  falling: ['falling', 'fall', 'snow', 'snowing', 'snowflakes', 'rain', 'raining', 'confetti', 'floating up', 'petals', 'bubbles'],
  window: ['window', 'popup window', 'xp window', 'retro window', 'dialog'],
  card: ['card', 'box', 'panel', 'container'],
  frame: ['frame', 'photo frame', 'picture frame', 'polaroid'],
  blinkie: ['blinkie', 'blinky', 'blinking', 'blink', 'flashing'],
  player: ['music player', 'player', 'song', 'music', 'playlist'],
  background: ['background', 'backdrop', 'bg'],
  toggle: ['dark mode', 'light switch', 'toggle', 'switch'],
  sticker: ['sticker', 'draggable', 'drag', 'stamp'],
  counter: ['counter', 'click counter', 'like button', 'heart button', 'clicker'],
  divider: ['divider', 'separator', 'line'],
} as const
export type Concept = keyof typeof CONCEPTS

/** Requests that need real Elsewhere data: the generator must not fake them (use the profile pieces instead). */
export const NATIVE_ONLY: Record<string, string> = {
  guestbook: 'Guestbook', 'top friends': 'Top Friends', friends: 'Top Friends', bulletin: 'Bulletins', bulletins: 'Bulletins',
  'visitor counter': 'visitor counts', visitors: 'visitor counts', followers: 'follower counts', comments: 'comments',
}

export const NAMED_COLORS: Record<string, string> = {
  pink: '#ff5fa2', 'hot pink': '#ff1f8f', 'baby pink': '#ffc2dd', 'pastel pink': '#ffc8e1', red: '#e8344e', crimson: '#b0122f', rose: '#ff7aa8',
  orange: '#ff8a2a', peach: '#ffb48a', coral: '#ff7f6a', yellow: '#ffd23a', gold: '#f2b705', lemon: '#fff27a', cream: '#fff6dc',
  green: '#3fbf4f', lime: '#8fe020', mint: '#9ff0c8', 'mint green': '#9ff0c8', sage: '#a8c69f', teal: '#14a3a3', aqua: '#3fd6e8', cyan: '#2fd2f0',
  blue: '#2d84e6', 'sky blue': '#7cc9f3', 'baby blue': '#a9d8ff', navy: '#14285c', cobalt: '#0b5fd0', periwinkle: '#9aa8ff',
  purple: '#8e4fd8', lavender: '#c9b3ff', lilac: '#d7b8f3', violet: '#7b3fe4', magenta: '#e21fb8',
  black: '#111111', white: '#ffffff', grey: '#8a8f99', gray: '#8a8f99', silver: '#c7ccd6', brown: '#8a5a3c', chocolate: '#5b3624', beige: '#e8d7b8',
}
export const SPEEDS: Record<string, number> = { 'super slow': 0.4, 'very slow': 0.5, slow: 0.7, slowly: 0.7, gentle: 0.8, fast: 1.6, quick: 1.6, quickly: 1.6, 'very fast': 2.2, 'super fast': 2.4 }
export const SIZES: Record<string, number> = { tiny: 0.6, small: 0.8, little: 0.85, medium: 1, big: 1.3, large: 1.3, huge: 1.7, giant: 1.9 }
export const SHAPES = { round: 'round', rounded: 'round', circle: 'circle', circular: 'circle', pill: 'pill', square: 'square', heart: 'heart', star: 'star' } as const
export const PARTICLES: Record<string, string> = {
  heart: '♥', hearts: '♥', star: '★', stars: '★', sparkle: '✦', sparkles: '✦', snow: '❄', snowflake: '❄', snowflakes: '❄', snowing: '❄',
  bubble: '◯', bubbles: '◯', flower: '✿', flowers: '✿', petals: '✿', butterfly: '🦋', butterflies: '🦋', confetti: '■', rain: '│', raining: '│', cloud: '☁', clouds: '☁', moon: '☾', skull: '☠', bat: '🦇', bats: '🦇', cherry: '🍒', strawberry: '🍓',
}
export const ANIMS: Record<string, string> = {
  bounce: 'bounce', bouncing: 'bounce', bouncy: 'bounce', spin: 'spin', spinning: 'spin', rotate: 'spin', rotating: 'spin', float: 'float', floating: 'float', floaty: 'float',
  shake: 'shake', shaking: 'shake', wiggle: 'shake', wiggly: 'shake', pulse: 'pulse', pulsing: 'pulse', beating: 'pulse', fade: 'fade', fading: 'fade', flicker: 'flicker', flickering: 'flicker',
  glow: 'glow', glowing: 'glow', wave: 'wave', wavy: 'wave',
}
export const AESTHETICS = {
  'frutiger aero': { ink: '#0b2a4a', accent: '#2fb6e8', accent2: '#62c23d', bg: '#e9f7ff', font: '"Segoe UI", Tahoma, sans-serif', gloss: true },
  aero: { ink: '#0b2a4a', accent: '#2fb6e8', accent2: '#62c23d', bg: '#e9f7ff', font: '"Segoe UI", Tahoma, sans-serif', gloss: true },
  y2k: { ink: '#3b1f5c', accent: '#ff5fd8', accent2: '#5fd8ff', bg: '#f6eaff', font: '"Trebuchet MS", Verdana, sans-serif', gloss: true },
  kawaii: { ink: '#5a2142', accent: '#ff7ab8', accent2: '#ffd1e6', bg: '#fff4fa', font: '"Comic Sans MS", "Trebuchet MS", sans-serif', gloss: false },
  gothic: { ink: '#e8dce8', accent: '#9c1f3c', accent2: '#5a2a6e', bg: '#140b14', font: 'Georgia, serif', gloss: false },
  goth: { ink: '#e8dce8', accent: '#9c1f3c', accent2: '#5a2a6e', bg: '#140b14', font: 'Georgia, serif', gloss: false },
  scene: { ink: '#f2f2f2', accent: '#ff2e8a', accent2: '#39ff14', bg: '#111111', font: 'Verdana, sans-serif', gloss: false },
  emo: { ink: '#f2f2f2', accent: '#ff2e8a', accent2: '#39ff14', bg: '#111111', font: 'Verdana, sans-serif', gloss: false },
  cybercore: { ink: '#d9fbff', accent: '#00e5ff', accent2: '#ff3ec8', bg: '#05060f', font: '"Lucida Console", "Courier New", monospace', gloss: false },
  'retro web': { ink: '#000080', accent: '#ff00ff', accent2: '#00ffff', bg: '#c0c0c0', font: 'Tahoma, Verdana, sans-serif', gloss: false },
  retro: { ink: '#000080', accent: '#ff00ff', accent2: '#00ffff', bg: '#c0c0c0', font: 'Tahoma, Verdana, sans-serif', gloss: false },
  neapolitan: { ink: '#5b3624', accent: '#ff9fc4', accent2: '#8a5a3c', bg: '#fff6dc', font: '"Trebuchet MS", sans-serif', gloss: true },
  pastel: { ink: '#4a3a5c', accent: '#ffb3d9', accent2: '#b3e5ff', bg: '#fffafd', font: '"Trebuchet MS", sans-serif', gloss: false },
} as const
export type Aesthetic = keyof typeof AESTHETICS

export const NEGATIONS = ['no', 'without', 'not', "don't", 'dont', 'never', 'none', 'minus', 'except']
/** Words that carry no meaning for the generator (never reported as "unknown"). */
export const FILLER = new Set(('a an the some my me i want wanna need make makes made create add put give get have has with that this it its it\'s is are be to for of on in at by ' +
  'and or but so very really super kinda kind sort like please can could would you u something thing things one ones which who when where while ' +
  'little cute pretty nice cool aesthetic vibe vibes style styled styling look looking looks feel page profile site website my own also too then plus ' +
  'everything all any every just only maybe pls plz from into onto over under up down around').split(/\s+/))
/** Every known single word (for typo correction). */
export function knownWords(): Set<string> {
  const words = new Set<string>(FILLER)
  const addPhrase = (phrase: string) => phrase.split(/\s+/).forEach(w => words.add(w))
  Object.values(CONCEPTS).forEach(list => list.forEach(addPhrase))
  ;[NAMED_COLORS, SPEEDS, SIZES, SHAPES, PARTICLES, ANIMS, AESTHETICS, NATIVE_ONLY].forEach(map => Object.keys(map).forEach(addPhrase))
  NEGATIONS.forEach(w => words.add(w))
  ;['glossy', 'shiny', 'link', 'links', 'to', 'say', 'says', 'saying', 'called', 'named', 'until', 'till', 'seconds', 'minutes', 'percent', 'hover', 'hovering',
    'click', 'clicked', 'clicking', 'items', 'pages', 'sections', 'gradient', 'animated', 'animation', 'animations', 'moving', 'transparent', 'see-through',
    'border', 'shadow', 'outline', 'italic', 'bold', 'center', 'centered', 'left', 'right', 'emoji', 'picture', 'photo', 'image', 'gif', 'url'].forEach(w => words.add(w))
  return words
}
