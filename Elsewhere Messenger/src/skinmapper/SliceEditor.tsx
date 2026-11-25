import { useRef, type PointerEvent } from 'react'

// Nine-slice editor: drag the four guide lines (or type exact numbers) to mark the
// corners and edges of a frame image that must keep their shape when the window resizes.

type Slice = [number, number, number, number] // top, right, bottom, left (source pixels)

export function validSlice(slice: Slice, width: number, height: number) {
  const [top, right, bottom, left] = slice
  return slice.every(n => Number.isInteger(n) && n >= 0) && left + right < width && top + bottom < height
}

export default function SliceEditor({ url, width, height, slice, onChange }: {
  url: string; width: number; height: number; slice: Slice; onChange: (slice: Slice) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const scale = Math.min(1, 240 / Math.max(width, height)) * (Math.max(width, height) < 120 ? 2 : 1)
  const shownW = Math.round(width * scale)
  const shownH = Math.round(height * scale)
  const [top, right, bottom, left] = slice
  const drag = useRef<number | null>(null)

  function move(event: PointerEvent) {
    if (drag.current === null || !box.current) return
    const rect = box.current.getBoundingClientRect()
    const x = Math.round((event.clientX - rect.left) / scale)
    const y = Math.round((event.clientY - rect.top) / scale)
    const next = [...slice] as Slice
    if (drag.current === 0) next[0] = Math.max(0, Math.min(height - bottom - 1, y))
    if (drag.current === 1) next[1] = Math.max(0, Math.min(width - left - 1, width - x))
    if (drag.current === 2) next[2] = Math.max(0, Math.min(height - top - 1, height - y))
    if (drag.current === 3) next[3] = Math.max(0, Math.min(width - right - 1, x))
    onChange(next)
  }
  const handle = (index: number) => ({
    onPointerDown: (event: PointerEvent) => { drag.current = index; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) },
    onPointerMove: move,
    onPointerUp: () => { drag.current = null },
  })
  const ok = validSlice(slice, width, height)

  return <div className="sm-slice-editor">
    <div ref={box} className="sm-slice-box" style={{ width: shownW, height: shownH, backgroundImage: `url("${url}")` }}>
      <span className="sm-slice-line is-h" style={{ top: top * scale }} {...handle(0)} title="Top edge" />
      <span className="sm-slice-line is-v" style={{ left: shownW - right * scale }} {...handle(1)} title="Right edge" />
      <span className="sm-slice-line is-h" style={{ top: shownH - bottom * scale }} {...handle(2)} title="Bottom edge" />
      <span className="sm-slice-line is-v" style={{ left: left * scale }} {...handle(3)} title="Left edge" />
    </div>
    <small className={ok ? 'sm-hint' : 'sm-error-note'}>{ok
      ? 'Corners outside the lines keep their shape; the middle stretches.'
      : 'The lines overlap. Make the edges smaller than the image.'}</small>
  </div>
}
