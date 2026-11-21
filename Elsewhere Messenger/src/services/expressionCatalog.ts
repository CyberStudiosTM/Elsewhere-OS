import { bundledFonts } from './bundledFontCatalog'

export type LibraryKind = 'font' | 'color' | 'unicode' | 'kaomoji' | 'treasure'
export type Entry = { id: string; label: string; category: string; value: string; search?: string }

export const fontEntries: Entry[] = bundledFonts.map(f => ({
  id: f.family, label: f.family, value: f.family, category: f.category,
}))

export function normalizeHex(value: string): string | null {
  const s = value.trim().replace(/^#/, '')
  return /^[\da-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : null
}

export function rgbHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v || 0)))
    .toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function hexRgb(hex: string): [number, number, number] {
  const valid = normalizeHex(hex) ?? '#000000'
  return [parseInt(valid.slice(1, 3), 16), parseInt(valid.slice(3, 5), 16), parseInt(valid.slice(5, 7), 16)]
}

export function hslHex(hue: number, sat: number, light: number) {
  const h = ((hue % 360) + 360) % 360
  const s = Math.max(0, Math.min(100, sat)) / 100
  const l = Math.max(0, Math.min(100, light)) / 100
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return rgbHex(channel(0), channel(8), channel(4))
}

export function hexHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map(n => n / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const l = (max + min) / 2
  let h = 0
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
  }
  return [Math.round(((h * 60) + 360) % 360) % 360,
    Math.round(delta ? delta / (1 - Math.abs(2 * l - 1)) * 100 : 0), Math.round(l * 100)]
}

export function contrastRatio(hexA: string, hexB: string) {
  function lum(hex: string) {
    const [r,g,b] = hexRgb(hex).map(n => {
      const x = n / 255
      return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4
    })
    return .2126 * r + .7152 * g + .0722 * b
  }
  const a = lum(hexA), b = lum(hexB)
  return (Math.max(a,b) + .05) / (Math.min(a,b) + .05)
}

const namedPalettes: Record<string,string[]> = {
  Dreamscape: ['#F6B9DB','#BDA4E8','#91D8E6','#B4E5CB','#FFE2B7','#FFF1AD','#A3B6EF','#DECAEF'],
  'Classic Web': ['#FF0000','#FF00FF','#0000FF','#00AAAA','#008000','#FFA500','#800080','#000000'],
  'Dead Signal': ['#B93642','#74232D','#CC7E87','#879DAF','#526D83','#B0A58B','#9E8EAF','#DFD3CB'],
  Neon: ['#FF1493','#39FF14','#00FFFF','#FF00FF','#F7FF00','#FF5F1F','#BC13FE','#00A2FF'],
  'Frutiger Aero': ['#86D8F7','#53B8FF','#2879E0','#B8EDFF','#93D738','#66B82A','#E1F9FF','#FFFFFF'],
  'Y2K Chrome': ['#D6E3F2','#AAB6C4','#FFB4DE','#B890DA','#798BA1','#5A6477','#C4F6FF','#E8E9ED'],
  Moonlit: ['#ACB8DE','#9EA4C8','#D9D5F3','#7A86C8','#494A79','#1B2345','#C1D6F7','#7882A4'],
  Monochrome: ['#000000','#111111','#222222','#333333','#444444','#555555','#666666','#777777','#888888','#999999','#AAAAAA','#BBBBBB','#CCCCCC','#DDDDDD','#EEEEEE'],
}

const hueNames = ['Reds','Oranges','Yellows','Limes','Greens','Mints','Cyans','Skies','Blues','Violets','Magentas','Pinks']
const colors: Entry[] = []
for (const [category, values] of Object.entries(namedPalettes)) {
  for (const value of values) colors.push({id:value,label:value,value,category})
}
for (let hue = 0; hue < 12; hue++) {
  for (const saturation of [25,40,55,70,90]) {
    for (const lightness of [12,20,30,40,50,60,70,80,90]) {
      const value = hslHex(hue * 30, saturation, lightness)
      colors.push({id:value,label:value,value,category:hueNames[hue]})
    }
  }
}
export const colorEntries = [...new Map(colors.map(c => [c.id,c])).values()]

// Actual Unicode alphabets, accents, and decorative frames, not merely font names.
const alphabetMap: { name:string; upper:number; lower:number; digits?:number; exceptions?:Record<string,string> }[] = [
  {name:'Bold', upper:0x1d400,lower:0x1d41a,digits:0x1d7ce},
  {name:'Italic', upper:0x1d434,lower:0x1d44e,exceptions:{h:'ℎ'}},
  {name:'Bold Italic',upper:0x1d468,lower:0x1d482},
  {name:'Script',upper:0x1d49c,lower:0x1d4b6,exceptions:{B:'ℬ',E:'ℰ',F:'ℱ',H:'ℋ',I:'ℐ',L:'ℒ',M:'ℳ',R:'ℛ',e:'ℯ',g:'ℊ',o:'ℴ'}},
  {name:'Bold Script',upper:0x1d4d0,lower:0x1d4ea},
  {name:'Fraktur',upper:0x1d504,lower:0x1d51e,exceptions:{C:'ℭ',H:'ℌ',I:'ℑ',R:'ℜ',Z:'ℨ'}},
  {name:'Double Struck',upper:0x1d538,lower:0x1d552,digits:0x1d7d8,exceptions:{C:'ℂ',H:'ℍ',N:'ℕ',P:'ℙ',Q:'ℚ',R:'ℝ',Z:'ℤ'}},
  {name:'Bold Fraktur',upper:0x1d56c,lower:0x1d586},
  {name:'Sans Serif',upper:0x1d5a0,lower:0x1d5ba,digits:0x1d7e2},
  {name:'Sans Bold',upper:0x1d5d4,lower:0x1d5ee,digits:0x1d7ec},
  {name:'Sans Italic',upper:0x1d608,lower:0x1d622},
  {name:'Sans Bold Italic',upper:0x1d63c,lower:0x1d656},
  {name:'Monospace',upper:0x1d670,lower:0x1d68a,digits:0x1d7f6},
  {name:'Fullwidth',upper:0xff21,lower:0xff41,digits:0xff10},
  {name:'Circled',upper:0x24b6,lower:0x24d0},
]
const frames: [string,string,string][] = [
  ['Dreamscape','₊˚⊹ ',' ♡'], ['Starlight','✧･ﾟ: *','*:･ﾟ✧'], ['Moonbeam','☾ ⋆｡ ',' °✩'],
  ['Cloud nine','☁︎ ',' ☁︎'], ['Celestial','⋆⁺₊⋆ ',' ⋆⁺₊⋆'], ['Magic','✦˚ ',' ˚✦'],
  ['Affection','♡ ',' ♡'], ['Lovelace','୨୧ ',' ୨୧'], ['Ribbon','౨ৎ ',' ౨ৎ'],
  ['Garden','❀ ',' ❀'], ['Sakura','✿ ',' ✿'], ['Butterfly','ʚ ',' ɞ'],
  ['Fairy wings','꒰ঌ ',' ໒꒱'], ['Bunny','₍ᐢ. .ᐢ₎ ',' ♡'], ['Ocean','𓇼 ',' 𓇼'],
  ['Raindrops','·.¸¸.· ',' ·.¸¸.·'], ['Pearls','◦•● ',' ●•◦'], ['Diamonds','◇◆ ',' ◆◇'],
  ['Glitter','｡･:*:･ﾟ ',' ﾟ･:*:･｡'], ['Gothic','† ',' †'], ['Dark star','✶ ',' ✶'],
  ['Vampire','♰ ',' ♰'], ['Moon ritual','☽ ',' ☾'], ['Chains','⛓ ',' ⛓'],
  ['Cyber brackets','[ ', ' ]'], ['Terminal','> ',' _'], ['Signal','⟦ ',' ⟧'],
  ['Data packet','{ ',' }'], ['Transmission',':: ',' ::'], ['Pixel frame','▪▫ ',' ▫▪'],
  ['Retro web','°º¤ø ',' ø¤º°'], ['Music','♫ ',' ♫'], ['Music box','♪ ♬ ',' ♬ ♪'],
  ['Royal','♔ ',' ♔'], ['Ornamental','꧁ ',' ꧂'], ['Vintage frame','「 ',' 」'],
  ['Soft frame','꒰ ',' ꒱'], ['Sparkle trail','⋆˙⟡ ',' ⟡˙⋆'], ['Angelic','ଘ ',' ଓ'],
  ['Candy','🍬 ',' 🍬'], ['Arcade','▌║ ',' ║▐'], ['Crystal','◈ ',' ◈'],
  ['Rose garden','❦ ',' ❦'], ['Divider','──── ',' ────'], ['Neon pixels','▰▱ ',' ▱▰'],
]
const marks: [string,string][] = [['Underline','\u0332'],['Double underline','\u0333'],['Strikethrough','\u0336'],['Overline','\u0305'],['Dot above','\u0307']]
export const unicodeEntries: Entry[] = [
  ...alphabetMap.map((v,i)=>({id:`alphabet-${i}`,label:v.name,category:'Unicode alphabets',value:v.name})),
  ...frames.map(([name],i)=>({id:`frame-${i}`,label:name,category:'Decorative frames',value:name})),
  ...marks.map(([name],i)=>({id:`mark-${i}`,label:name,category:'Letter effects',value:name})),
  ...[['uppercase','All caps'],['spaced','Spaced lettering'],['smallcaps','Small capitals'],['superscript','Superscript'],['square','Squared letters']].map(([id,label])=>({id,label,category:'Text layouts',value:label})),
]

export function decorate(id: string, text: string): string {
  if (id === 'uppercase') return text.toUpperCase()
  if (id === 'spaced') return Array.from(text).join(' ')
  if (id === 'smallcaps' || id === 'superscript') {
    const glyphs = Array.from(id === 'smallcaps' ? 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ' : 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ')
    return text.replace(/[a-z]/gi, c => glyphs[c.toLowerCase().charCodeAt(0) - 97] ?? c)
  }
  if (id === 'square') return text.replace(/[a-z]/gi, c => String.fromCodePoint(0x1f130 + c.toUpperCase().charCodeAt(0) - 65))
  const index = Number(id.split('-')[1])
  if (id.startsWith('frame-')) {
    const item = frames[index]
    return item ? item[1]+text+item[2] : text
  }
  if (id.startsWith('mark-')) {
    const mark = marks[index]?.[1]
    return mark ? text.replace(/[a-z0-9]/gi, c => c + mark) : text
  }
  if (!id.startsWith('alphabet-')) return text
  const item = alphabetMap[index]
  if (!item) return text
  return Array.from(text).map(c => {
    if (item.exceptions?.[c]) return item.exceptions[c]
    const n = c.codePointAt(0)!
    if (n>=65 && n<=90) return String.fromCodePoint(item.upper+n-65)
    if (n>=97 && n<=122) return String.fromCodePoint(item.lower+n-97)
    if (n>=48 && n<=57 && item.digits) return String.fromCodePoint(item.digits+n-48)
    return c
  }).join('')
}

const faces: Record<string,string[]> = {
  Happy: ['(˶ᵔ ᵕ ᵔ˶)','(≧▽≦)','(⌒‿⌒)','(＾▽＾)','(◕‿◕)','(´｡• ᵕ •｡`)','(✿◠‿◠)','(•ᴗ•)','(´꒳`)','(｡･ω･｡)'],
  Affection: ['(づ ᴗ _ᴗ)づ♡','(♡˙︶˙♡)','(˶˃ ᵕ ˂˶)','(っ˘з(˘⌣˘ )','(｡♥‿♥｡)','( ˘ ³˘)♥','(´♡‿♡`)','(つ≧▽≦)つ','( ˘͈ ᵕ ˘͈♡)','(っ˘ω˘ς )'],
  Excited: ['٩(ˊᗜˋ*)و','ヽ(・∀・)ﾉ','(ﾉ◕ヮ◕)ﾉ','ヾ(≧▽≦*)o','ヽ(>∀<☆)ノ','(☆▽☆)','＼(＾▽＾)／','٩(◕‿◕｡)۶','(ﾉ´ヮ`)ﾉ','ヽ(o＾▽＾o)ノ'],
  Shy: ['(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)','(〃▽〃)','(⁄ ⁄•⁄ω⁄•⁄ ⁄)','(*/ω＼*)','(„ಡωಡ„)','(„• ֊ •„)','(*/▽＼*)','(｡･･｡)','(⁄ ⁄-⁄ω⁄-⁄ ⁄)','(˶ˊᵕˋ˵)'],
  Sad: ['(╥﹏╥)','(｡•́︿•̀｡)','(つ﹏⊂)','(ಥ﹏ಥ)','(இ﹏இ)','(｡•́ - •̀｡)','(´；ω；`)','(◞‸◟)','(╯︵╰,)','(っ- ‸ - ς)'],
  Angry: ['(｀Д´)','(＃｀д´)ﾉ','(ಠ_ಠ)','(ง •̀_•́)ง','(｀皿´＃)','(ノಠ益ಠ)ノ','(＃`Д´)','(；｀ヘ´)','(＞ｍ＜)','(눈_눈)'],
  Confused: ['(・・?)','(・_・ヾ','(゜-゜)','(・・;)ゞ','(￣ω￣;)','(⊙_☉)','(°ロ°)','(•ิ_•ิ)?','(・・ )?','(＠_＠)'],
  Sleepy: ['(－_－) zzZ','(∪｡∪)｡｡｡zzz','(ᴗ˳ᴗ)','(－ω－) zzZ','(´～`)','(－.－)...zzz','(ᴗ_ᴗ)','(。-ω-)zzz','(˘ω˘)','(∪.∪ )...zzz'],
  Cats: ['ฅ^•ﻌ•^ฅ','(=^･ω･^=)','(=｀ω´=)','ฅ(•ㅅ•❀)ฅ','(=^‥^=)','(=^-ω-^=)','ฅ(^•ﻌ•^)ฅ','(^・ω・^ )','(ФωФ)','ฅ(＾・ω・＾ฅ)'],
  Bears: ['ʕ•ᴥ•ʔ','ʕ´•ᴥ•`ʔ','ʕง•ᴥ•ʔง','ʕっ•ᴥ•ʔっ','ʕ•̀ω•́ʔ','ʕ ꈍᴥꈍʔ','ʕ – ㉨ – ʔ','ʕ◉ᴥ◉ʔ','ʕ•́ᴥ•̀ʔ','ʕ´• ᴥ •`ʔ'],
  Bunnies: ['₍ᐢ. .ᐢ₎','₍ᐢᐢ₎','₍ᐢ.ˬ.ᐢ₎','₍ᐢ•ﻌ•ᐢ₎','₍ᐢ. ̫.ᐢ₎','₍ᐢ- ̫-ᐢ₎','₍ᐢ._.ᐢ₎','₍ᐢ ᴗ͈ˬᴗ͈ᐢ₎','₍ᐢ•༝•ᐢ₎','₍ᐢᵔ.ᵔᐢ₎'],
  Dogs: ['U・ﻌ・U','U＾ェ＾U','U ´ᴥ` U','U・ᴥ・U','૮ ˶ᵔ ᵕ ᵔ˶ ა','૮₍ ˃ ⤙ ˂ ₎ა','૮₍ ˶• ༝ •˶ ₎ა','૮₍´｡ᵔ ꈊ ᵔ｡`₎ა','ᐡ ᴗ ̫ ᴗ ᐡ','U^ｪ^U'],
  Greetings: ['(｡･ω･)ﾉﾞ','( ´ ▽ ` )ﾉ','ヾ(＾∇＾)','(｡•̀ᴗ-)✧','ヽ(・ω・)ﾉ','(￣▽￣)ノ','( ´ ▽ ` )/','(◕‿◕✿)ﾉ','(´• ω •`)ﾉ','( ´ ω ` )ノﾞ'],
  Reactions: ['(¬_¬)','(￢_￢)','(°ー°〃)','(•̀⤙•́)','(￣_￣)','(¬‿¬)','(⊙_⊙)','(・д・)','(•_•)','(¬､¬)'],
  Actions: ['ヽ(•‿•)ノ','ᕕ( ᐛ )ᕗ','ᕦ(ò_óˇ)ᕤ','(ง ᵕωᵕ)ว','ヾ(⌐■_■)ノ','(〜￣▽￣)〜','┗(＾0＾)┓','┌(˘⌣˘)ʃ','ᕙ(⇀‸↼‶)ᕗ','(っ´ω`)ﾉ'],
}
const ornaments: [string,string][] = [['',''],['♡ ',''],['',' ♡'],['✧ ',' ✧'],['⋆｡° ',' °｡⋆'],['₊˚⊹ ',''],['',' ୨୧'],['꒰ ',' ꒱'],['୨୧ ',''],['',' ☆']]
export const kaomojiEntries: Entry[] = []
const unique = new Set<string>()
for (const [category, values] of Object.entries(faces)) {
  values.forEach((face, i) => ornaments.forEach(([before,after],j) => {
    const value = before + face + after
    if (unique.has(value)) return
    unique.add(value)
    kaomojiEntries.push({ id:`k-${category}-${i}-${j}`,label:value,category,value,search:`${category} expression` })
  }))
}
for (const [category, values] of Object.entries({
  Hearts:['♡','♥','❥','❣','ღ','ෆ','୨୧','౨ৎ','ᥫ᭡','ᰔ'],
  Celestial:['✧','✦','⋆','☆','★','☾','☽','☁','✷','⟡'],
  Nature:['❀','✿','❁','𓇼','❃','✾','❦','❧','ꕤ','☘'],
  Music:['♫','♪','♬','♩','♭','♯','♮'],
  Gothic:['♰','†','⛓','♔','♚','⚝','◇','◆','◈'],
  Arrows:['→','←','↑','↓','↳','↱','➜','➳','➵','↝'],
  Dividers:['────୨ৎ────','════ ⋆★⋆ ════','✦ ────── ✦','♡ ────── ♡','════════════'],
})) values.forEach((value,i)=>kaomojiEntries.push({id:`s-${category}-${i}`,label:value,category:`Symbols: ${category}`,value}))

export const catalogCounts = {
  fonts: fontEntries.length,
  colors: colorEntries.length,
  unicode: unicodeEntries.length,
  kaomoji: kaomojiEntries.length,
}
