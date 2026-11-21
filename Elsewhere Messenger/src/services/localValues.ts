import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type SetStateAction,
} from 'react'

const CHANGE = 'elsewhere:local-values'
const fallback = new Map<string, string>()

function read(key: string | null): string {
  if (!key) return ''

  if (fallback.has(key)) {
    return fallback.get(key) ?? ''
  }

  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function parse<T>(raw: string, initial: T): T {
  if (!raw) return initial

  try {
    return JSON.parse(raw) as T
  } catch {
    return initial
  }
}

function subscribe(notify: () => void) {
  window.addEventListener('storage', notify)
  window.addEventListener(CHANGE, notify)
  window.addEventListener('focus', notify)

  return () => {
    window.removeEventListener('storage', notify)
    window.removeEventListener(CHANGE, notify)
    window.removeEventListener('focus', notify)
  }
}

export function useStoredValue<T>(
  key: string | null,
  initial: T,
) {
  const getSnapshot = useCallback(
    () => read(key),
    [key],
  )

  const raw = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )

  const value = useMemo(
    () => parse(raw, initial),
    [raw, initial],
  )

  const setValue = useCallback(
    (update: SetStateAction<T>) => {
      if (!key) return

      const previous = parse(read(key), initial)

      const next = typeof update === 'function'
        ? (update as (value: T) => T)(previous)
        : update

      const serialized = JSON.stringify(next)

      try {
        localStorage.setItem(key, serialized)
        fallback.delete(key)
      } catch (error) {
        fallback.set(key, serialized)
        console.error(
          'Unable to persist local preferences.',
          error,
        )
      }

      window.dispatchEvent(new Event(CHANGE))
    },
    [key, initial],
  )

  return [value, setValue] as const
}