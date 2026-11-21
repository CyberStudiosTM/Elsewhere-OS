import {
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'

import { createPortal } from 'react-dom'

function ExtendedEmoticon({
  code,
}: {
  code: string
}) {
  const symbol =
    code === '(L)' ||
    code === '(U)' ||
    code === '(K)'

  const sleepy = code === '-_-'
  const happy = code === '^_^'
  const angry = code === '>:('
  const cool = code === '(H)'
  const crying = code === ":'("
  const blush = code === ':$'

  return (
    <span
      className={
        'em-classic-emoticon' +
        (symbol ? ' em-symbol-emoticon' : '')
      }
      role="img"
      aria-label={`${emoticonNames[code]} emoticon`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {symbol ? (
          code === '(K)' ? (
            <>
              <path
                d="M2 12 L8 7 Q11 7 12 9 Q13 7 16 7 L22 12 Q17 19 12 18 Q7 19 2 12Z"
                fill="#e74a78"
                stroke="#912b45"
                strokeWidth="1"
              />
              <path
                d="M3 12 Q12 15 21 12"
                fill="none"
                stroke="#95233e"
                strokeWidth="1"
              />
              <path
                d="M7 10 L10 9"
                stroke="#ffd1dd"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <path
                d="M12 21 L3.7 12.5 C-3 4 8 -1 12 6 C16 -1 27 4 20.3 12.5 Z"
                fill="#e74865"
                stroke="#98283e"
                strokeWidth="1"
              />

              <path
                d="M5 8 Q6 4 9 6"
                fill="none"
                stroke="#ffc3d0"
                strokeWidth="1.5"
                strokeLinecap="round"
              />

              {code === '(U)' && (
                <path
                  d="M12 5 L9 10 L14 12 L10 16 L12 21"
                  fill="none"
                  stroke="#fff2ec"
                  strokeWidth="1.7"
                />
              )}
            </>
          )
        ) : (
          <>
            {cool ? (
              <>
                <path
                  d="M3 7 H21 L20 11 Q17 14 13 10 H11 Q7 14 4 11Z"
                  fill="#27313f"
                  stroke="#18202b"
                />

                <path
                  d="M5 8 L8 10 M15 8 L18 10"
                  stroke="#e5f1ff"
                  strokeWidth="1"
                />
              </>
            ) : happy ? (
              <path
                d="M5.5 10 Q8 5 10.5 10 M13.5 10 Q16 5 18.5 10"
                fill="none"
                stroke="#382516"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ) : sleepy ? (
              <path
                d="M5 9 H10 M14 9 H19"
                stroke="#382516"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            ) : (
              <>
                <ellipse
                  cx="8"
                  cy="9"
                  rx="1.3"
                  ry="2"
                  fill="#382516"
                />

                <ellipse
                  cx="16"
                  cy="9"
                  rx="1.3"
                  ry="2"
                  fill="#382516"
                />
              </>
            )}

            {angry && (
              <path
                d="M5 5 L10 7 M19 5 L14 7"
                stroke="#73291d"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            )}

            {blush && (
              <>
                <ellipse
                  cx="5.8"
                  cy="12"
                  rx="2.5"
                  ry="1.7"
                  fill="#ee8291"
                />

                <ellipse
                  cx="18.2"
                  cy="12"
                  rx="2.5"
                  ry="1.7"
                  fill="#ee8291"
                />
              </>
            )}

            {code === ':O' ? (
              <ellipse
                cx="12"
                cy="16"
                rx="3"
                ry="3.7"
                fill="#81411d"
              />
            ) : (
              <path
                d={
                  angry || crying
                    ? 'M7 18 Q12 11 17 18'
                    : code === ':/'
                      ? 'M8 17 L16 14'
                      : code === ':|'
                        ? 'M8 15 H16'
                        : sleepy
                          ? 'M10 16 Q12 14 14 16'
                          : 'M7 14 Q12 20 17 14'
                }
                fill="none"
                stroke="#663a16"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            )}

            {crying && (
              <path
                d="M6 10 Q2 15 5 16 Q8 16 6 10Z"
                fill="#6ed5ff"
                stroke="#3989bc"
                strokeWidth=".6"
              />
            )}
          </>
        )}
      </svg>
    </span>
  )
}

export const emoticonNames: Record<string, string> = {
  ':)': 'Smile',
  ':(': 'Sad',
  ';)': 'Wink',
  ':D': 'Grin',
  ':P': 'Tongue',
  ':O': 'Surprised',
  ':/': 'Unsure',
  ':|': 'Neutral',
  ":'(": 'Crying',
  '>:(': 'Angry',
  '(H)': 'Cool',
  ':$': 'Blushing',
  '^_^': 'Happy Eyes',
  '-_-': 'Sleepy',
  '(L)': 'Heart',
  '(U)': 'Broken Heart',
  '(K)': 'Kiss',
}

export function ClassicEmoticon({ code }: { code: string }) {
  if (![':)', ':(', ';)', ':D', ':P'].includes(code)) {
    return <ExtendedEmoticon code={code} />
  }

  const isWink = code === ';)'
  const isSad = code === ':('
  const isGrin = code === ':D'
  const isTongue = code === ':P'

  return (
    <span
      className="em-classic-emoticon"
      role="img"
      aria-label={`${emoticonNames[code] ?? 'Classic'} emoticon`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {isWink ? (
          <path
            d="M6.5 9.5 H10"
            stroke="#382516"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        ) : (
          <ellipse cx="8" cy="9" rx="1.3" ry="2" fill="#382516" />
        )}

        <ellipse cx="16" cy="9" rx="1.3" ry="2" fill="#382516" />

        {isSad ? (
          <path
            d="M6.5 18 Q12 11 17.5 18"
            fill="none"
            stroke="#663a16"
            strokeWidth="1.7"
          />
        ) : isGrin ? (
          <path
            d="M6 13 Q12 21 18 13 Z"
            fill="white"
            stroke="#663a16"
            strokeWidth="1"
          />
        ) : isTongue ? (
          <>
            <path
              d="M7 14 Q12 18 17 14"
              fill="none"
              stroke="#663a16"
              strokeWidth="1.7"
            />
            <ellipse
              cx="12"
              cy="18"
              rx="3"
              ry="3.2"
              fill="#ed6485"
            />
          </>
        ) : (
          <path
            d="M6.5 14 Q12 21 17.5 14"
            fill="none"
            stroke="#663a16"
            strokeWidth="1.7"
          />
        )}
      </svg>
    </span>
  )
}

const emoticonPattern = new RegExp(
  '(' +
    Object.keys(emoticonNames)
      .sort((a, b) => b.length - a.length)
      .map((code) =>
        code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      .join('|') +
  ')',
  'g'
)

export function renderClassicText(text: string) {
  return text.split(emoticonPattern).map((part, index) => {
    if (
      Object.prototype.hasOwnProperty.call(
        emoticonNames,
        part
      )
    ) {
      return (
        <ClassicEmoticon
          key={index}
          code={part}
        />
      )
    }

    return part
  })
}

type PickerProps = {
  anchor: HTMLButtonElement | null
  skin: 'classic' | 'dead-signal'
  onPick: (code: string) => void
  onClose: () => void
}

export function AnchoredEmoticonPicker({
  anchor,
  skin,
  onPick,
  onClose,
}: PickerProps) {
  const panelRef =
    useRef<HTMLDivElement>(null)

  const host = anchor?.closest(
    '.em-app, .ds-desktop'
  )

  useLayoutEffect(() => {
    if (!anchor) return

    const panel = panelRef.current

    if (!panel) return

    const button: HTMLButtonElement = anchor
    const popup: HTMLDivElement = panel

    function position() {
      if (!button.isConnected) return

      const rect =
        button.getBoundingClientRect()

      const margin = 6
      const gap = 5

      const width = Math.min(
        210,
        window.innerWidth - margin * 2
      )

      popup.style.width = `${width}px`
      popup.style.maxHeight = 'none'

      const desiredHeight = Math.min(
        152,
        popup.scrollHeight + 2
      )

      const above = Math.max(
        0,
        rect.top - margin - gap
      )

      const below = Math.max(
        0,
        window.innerHeight -
        rect.bottom -
        margin -
        gap
      )

      // Composer: prefer opening upward.
      // Main toolbar: prefer opening downward.

      const preferAbove = Boolean(
        button.closest(
          '.em-formatting, .ds-formatting'
        )
      )

      const useAbove = preferAbove
        ? above >= desiredHeight || above >= below
        : below < desiredHeight && above > below

      const available =
        useAbove ? above : below

      const height = Math.min(
        desiredHeight,
        available
      )

      const left = Math.max(
        margin,
        Math.min(
          rect.left + rect.width / 2 - width / 2,
          window.innerWidth - width - margin
        )
      )

      const top = useAbove
        ? rect.top - gap - height
        : rect.bottom + gap

      popup.style.left = `${left}px`
      popup.style.top = `${Math.max(margin, top)}px`
      popup.style.maxHeight = `${height}px`
      popup.style.visibility = 'visible'
    }

    position()

    window.addEventListener(
      'resize',
      position
    )

    window.addEventListener(
      'scroll',
      position,
      true
    )

    return () => {
      window.removeEventListener(
        'resize',
        position
      )

      window.removeEventListener(
        'scroll',
        position,
        true
      )
    }
  }, [anchor])

  useEffect(() => {
    if (!anchor) return

    function outside(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Element)) return

      if (
        panelRef.current?.contains(target) ||
        target.closest('[data-emoticon-trigger]')
      ) return

      onClose()
    }

    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        anchor?.focus()
      }
    }

    document.addEventListener(
      'pointerdown',
      outside
    )

    document.addEventListener(
      'keydown',
      escape
    )

    return () => {
      document.removeEventListener(
        'pointerdown',
        outside
      )

      document.removeEventListener(
        'keydown',
        escape
      )
    }
  }, [anchor, onClose])

  if (!anchor || !host) return null

  return createPortal(
    <div
      ref={panelRef}
      className={
        'em-anchored-emoticons ' +
        (
          skin === 'classic'
            ? 'em-emoticon-menu'
            : 'ds-emoticon-picker'
        )
      }
      style={{ visibility: 'hidden' }}
      aria-label="Choose an emoticon"
    >
      {Object.entries(emoticonNames).map(
        ([code, label]) => (
          <button
            key={code}
            type="button"
            title={`${label} ${code}`}
            aria-label={label}
            onClick={() => onPick(code)}
          >
            <ClassicEmoticon code={code} />
          </button>
        )
      )}
    </div>,
    host
  )
}
