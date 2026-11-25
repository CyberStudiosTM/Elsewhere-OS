import type { BodyTemplate, Item, Library, Part, Rect, SkinTone } from './dollModel'

// PLACEHOLDER parts only. Doll art comes from Cyber's asset library (see docs/pixel-doll/SPRITE_SPEC.md);
// until it arrives, the engine runs on plain grey-box shapes so every system can be built and tested.
// These are deliberately simple blocks, not a doll design, and are labeled "Placeholder" everywhere.

type Pose = 'stand' | 'sit'
/** Where the big body blocks sit in each pose (sprite pixels on the 128×256 canvas). */
const ANCHOR: Record<Pose, { up: number; legs: Rect[]; feet: Rect[]; thighs?: Rect[] }> = {
  stand: { up: 0, legs: [[50, 146, 12, 90], [66, 146, 12, 90]], feet: [[48, 236, 14, 8], [66, 236, 14, 8]] },
  sit: { up: 40, thighs: [[48, 186, 15, 16], [65, 186, 15, 16]], legs: [[50, 202, 12, 34], [66, 202, 12, 34]], feet: [[48, 236, 14, 8], [66, 236, 14, 8]] },
}
const shift = (rects: Rect[], dy: number): Rect[] => rects.map(([x, y, w, h]) => [x, y + dy, w, h])
const upper = (pose: Pose, rects: Rect[]) => shift(rects, ANCHOR[pose].up)
const POSES: Pose[] = ['stand', 'sit']
/** One part with a sprite per pose (built by `draw`), skipping poses where `draw` returns nothing. */
function part(band: Part['band'], draw: (pose: Pose) => Rect[] | null, color?: string): Part {
  const sprites: Part['sprites'] = {}
  for (const pose of POSES) {
    const rects = draw(pose)
    if (rects) sprites[`*/${pose}`] = { rects, ...(color ? { color } : {}) }
  }
  return { band, sprites }
}

// The grey-box body: colors "skin:0/1/2" are filled from the chosen skin tone (light, mid, shade).
const body: BodyTemplate = {
  id: 'standard', name: 'Placeholder body', poses: POSES, placeholder: true,
  parts: [
    part('body', pose => upper(pose, [[52, 28, 24, 30], [60, 58, 8, 8], [46, 66, 36, 64], [36, 68, 10, 70], [82, 68, 10, 70], [48, 130, 32, 16]]), 'skin:1'),
    part('body', pose => upper(pose, [[72, 30, 4, 26], [78, 66, 4, 64], [88, 70, 4, 66]]), 'skin:2'),
    part('body', pose => upper(pose, [[54, 30, 4, 10]]), 'skin:0'),
    part('body', pose => [...(ANCHOR[pose].thighs || []), ...ANCHOR[pose].legs, ...ANCHOR[pose].feet], 'skin:1'),
    part('body', pose => ANCHOR[pose].legs.map(([x, y, , h]) => [x + 9, y, 3, h] as Rect), 'skin:2'),
  ],
}

const skins: SkinTone[] = [
  { id: 'tone-1', name: 'Porcelain', ramp: ['#ffe9df', '#f6d3c4', '#dfae9c'] },
  { id: 'tone-2', name: 'Peach', ramp: ['#ffd9bf', '#efbc98', '#cf9773'] },
  { id: 'tone-3', name: 'Honey', ramp: ['#e9b98c', '#d29a68', '#ad764a'] },
  { id: 'tone-4', name: 'Caramel', ramp: ['#c98d5e', '#ad7146', '#8a5532'] },
  { id: 'tone-5', name: 'Cocoa', ramp: ['#9a6342', '#7e4c30', '#5f3621'] },
  { id: 'tone-6', name: 'Espresso', ramp: ['#6e4430', '#573222', '#3c2117'] },
]

const PALETTE = ['#2f2a3a', '#8a5cc2', '#e58fb4', '#6fb7e8', '#9ccf7c', '#f2d47a', '#f7f4ee']
const item = (id: string, name: string, category: Item['category'], parts: Part[], colors = PALETTE): Item =>
  ({ id: `ph-${id}`, name: `Placeholder ${name}`, category, parts, colors, placeholder: true })

const items: Item[] = [
  item('long-hair', 'long hair', 'hair', [
    part('back-hair', pose => upper(pose, [[48, 26, 32, 70]])),
    part('front-hair', pose => upper(pose, [[50, 22, 28, 10], [50, 30, 6, 22], [72, 30, 6, 22]])),
  ], ['#3b2a2a', '#6b4a3a', '#8a5cc2', '#e8c07a', '#d94f7c']),
  item('bob', 'bob', 'hair', [
    part('back-hair', pose => upper(pose, [[48, 26, 32, 38]])),
    part('front-hair', pose => upper(pose, [[50, 22, 28, 9], [50, 30, 5, 14], [73, 30, 5, 14]])),
  ], ['#3b2a2a', '#8a5cc2', '#f2d47a', '#6fb7e8']),
  item('eyes', 'eyes', 'eyes', [part('face', pose => upper(pose, [[57, 40, 4, 4], [67, 40, 4, 4]]))], ['#2f2a3a', '#6b8f3a', '#4a7fc0', '#8a5cc2']),
  item('blush', 'blush', 'makeup', [part('makeup', pose => upper(pose, [[55, 47, 5, 2], [68, 47, 5, 2]]))], ['#ef9aa8', '#e58fb4', '#f4b38a']),
  item('lip', 'lip color', 'makeup', [part('makeup', pose => upper(pose, [[61, 51, 6, 2]]))], ['#c0405a', '#8a3a6a', '#e58fb4']),
  item('arm-tattoo', 'arm tattoo', 'tattoos', [part('tattoo', pose => upper(pose, [[38, 96, 6, 2], [38, 100, 6, 2], [39, 104, 4, 2]]))], ['#2f2a3a', '#3a4a8a']),
  item('tee', 'tee', 'tops', [part('tops', pose => upper(pose, [[44, 64, 40, 50], [34, 66, 12, 18], [82, 66, 12, 18]]))]),
  item('corset', 'corset', 'tops', [part('tops', pose => upper(pose, [[46, 80, 36, 40]]))]),
  item('skirt', 'skirt', 'bottoms', [part('bottoms', pose => pose === 'stand' ? [[46, 126, 36, 12], [42, 138, 44, 22]] : [[46, 166, 36, 12], [42, 178, 44, 22]])]),
  item('pants', 'pants (standing only)', 'bottoms', [part('bottoms', pose => pose === 'stand' ? [[46, 126, 36, 20], [48, 146, 15, 80], [65, 146, 15, 80]] : null)]),
  item('dress', 'dress', 'dresses', [part('dresses', pose => pose === 'stand' ? [[44, 64, 40, 62], [40, 126, 48, 44]] : [[44, 104, 40, 62], [40, 166, 48, 32]])]),
  item('tights', 'tights', 'legwear', [part('legwear', pose => [...(ANCHOR[pose].thighs || []), ...ANCHOR[pose].legs])], ['#2f2a3a', '#f7f4ee', '#e58fb4']),
  item('boots', 'boots', 'shoes', [part('shoes', pose => [...ANCHOR[pose].legs.map(([x, , w]) => [x - 1, 214, w + 2, 22] as Rect), ...ANCHOR[pose].feet])], ['#2f2a3a', '#6b4a3a', '#f7f4ee', '#8a5cc2']),
  item('cape', 'cape', 'outerwear', [
    part('back-wear', pose => upper(pose, [[30, 62, 68, 100]])),
    part('outerwear', pose => upper(pose, [[44, 60, 40, 8]])),
  ]),
  item('bow', 'hair bow', 'accessories', [part('hair-accessories', pose => upper(pose, [[66, 18, 6, 6], [72, 20, 4, 3], [62, 20, 4, 3]]))], ['#e58fb4', '#2f2a3a', '#f7f4ee', '#c0405a']),
  item('bag', 'bag', 'accessories', [part('handheld', pose => upper(pose, [[88, 128, 14, 12], [90, 120, 10, 2]]))]),
]

export const PLACEHOLDER_LIBRARY: Library = {
  bodies: [body],
  poses: [{ id: 'stand', name: 'Standing' }, { id: 'sit', name: 'Sitting' }],
  skins, items, source: 'placeholder',
}
