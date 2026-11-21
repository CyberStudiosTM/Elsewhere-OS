import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

const statuses = [
  'Online',
  'Away',
  'Busy',
  'Invisible',
] as const

type Status = (typeof statuses)[number]

type Props = {
  id?: string
  value: Status
  onChange: (status: Status) => void
  label?: string
  disabled?: boolean
}

function PresenceDot({
  status,
}: {
  status: Status
}) {
  return (
    <span
      className={
        `em-presence-dot em-presence-${status.toLowerCase()}`
      }
      aria-hidden="true"
    />
  )
}

export default function ClassicPresenceSelect({
  id,
  value,
  onChange,
  label = 'Presence',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)

  const container =
    useRef<HTMLDivElement>(null)

  const trigger =
    useRef<HTMLButtonElement>(null)

  const options =
    useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return

    options.current[
      Math.max(0, statuses.indexOf(value))
    ]?.focus()

    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', outside)

    return () => {
      document.removeEventListener('pointerdown', outside)
    }
  }, [open, value])

  function choose(status: Status) {
    onChange(status)
    setOpen(false)
    trigger.current?.focus()
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      trigger.current?.focus()
      return
    }

    if (event.key === 'Tab') {
      setOpen(false)
      return
    }

    if (
      !['ArrowDown', 'ArrowUp', 'Home', 'End']
        .includes(event.key)
    ) return

    event.preventDefault()

    if (!open) {
      setOpen(true)
      return
    }

    const current = options.current.findIndex(
      (button) => button === document.activeElement
    )

    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? statuses.length - 1
          : (
              current +
              statuses.length +
              (event.key === 'ArrowDown' ? 1 : -1)
            ) % statuses.length

    options.current[next]?.focus()
  }

  return (
    <div
      className="em-presence-select"
      ref={container}
      onKeyDown={keyboard}
    >
      <button
        id={id}
        ref={trigger}
        type="button"
        className="em-presence-trigger"
        aria-label={`${label}: ${value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() =>
          setOpen((previous) => !previous)
        }
      >
        <PresenceDot status={value} />
        <span>{value}</span>
        <span
          className="em-presence-arrow"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="em-presence-options"
          aria-label={label}
        >
          {statuses.map((status, index) => (
            <button
              type="button"
              role="option"
              key={status}
              ref={(node) => {
                options.current[index] = node
              }}
              aria-selected={value === status}
              onClick={() => choose(status)}
            >
              <PresenceDot status={status} />
              <span>{status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}