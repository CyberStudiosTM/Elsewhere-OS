import { useEffect, useState } from 'react'

export type LocalPresence =
  'Online' | 'Away' | 'Busy' | 'Invisible'

export type LocalProfile = {
  name: string
  presence: LocalPresence
}

export type LocalSession = {
  signedIn: boolean
  remember: boolean
  automatic: boolean
  profile: LocalProfile | null
}

const KEY = 'elsewhere.local-session.v1'
const EVENT = 'elsewhere:local-session-changed'

const defaults: LocalSession = {
  signedIn: false,
  remember: true,
  automatic: false,
  profile: null,
}

function readSession(): LocalSession {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(KEY) ?? 'null'
    )

    if (!parsed || typeof parsed !== 'object') {
      return { ...defaults }
    }

    const remember = parsed.remember === true

    const automatic =
      remember && parsed.automatic === true

    const candidate = parsed.profile

    const valid =
      remember &&
      candidate &&
      typeof candidate.name === 'string' &&
      candidate.name.trim().length > 0 &&
      candidate.name.length <= 40 &&
      ['Online', 'Away', 'Busy', 'Invisible']
        .includes(candidate.presence)

    const profile: LocalProfile | null = valid
      ? {
          name: candidate.name,
          presence: candidate.presence,
        }
      : null

    return {
      remember,
      automatic,
      profile,
      signedIn: Boolean(
        automatic &&
        profile &&
        parsed.resume === true
      ),
    }
  } catch {
    return { ...defaults }
  }
}

let current = readSession()

export function getLocalSession() {
  return current
}

function save(next: LocalSession) {
  current = next

  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        remember: next.remember,
        automatic: next.automatic,
        profile: next.remember
          ? next.profile
          : null,
        resume:
          next.signedIn &&
          next.remember &&
          next.automatic,
      })
    )
  } catch (error) {
    console.error('Cannot persist local session:', error)
  }

  window.dispatchEvent(new Event(EVENT))
}

export function setLocalSessionOptions(
  changes: Partial<
    Pick<LocalSession, 'remember' | 'automatic'>
  >
) {
  const next = {
    ...current,
    ...changes,
  }

  if (!next.remember) {
    next.automatic = false
  }

  save(next)
}

export function completeLocalSignIn(
  name: string,
  presence: LocalPresence
) {
  const cleaned = name.trim().slice(0, 40)

  if (!cleaned) {
    throw new Error('Enter a local display name.')
  }

  save({
    ...current,
    signedIn: true,
    profile: {
      name: cleaned,
      presence,
    },
  })
}

export function updateLocalPresence(
  presence: LocalPresence
) {
  if (!current.signedIn || !current.profile) return

  save({
    ...current,
    profile: {
      ...current.profile,
      presence,
    },
  })
}

export function endLocalSession(
  switchAccount = false
) {
  save({
    ...current,
    signedIn: false,
    profile:
      current.remember && !switchAccount
        ? current.profile
        : null,
  })
}

export function useLocalSession() {
  const [session, setSession] =
    useState(getLocalSession)

  useEffect(() => {
    function refresh() {
      setSession(getLocalSession())
    }

    window.addEventListener(EVENT, refresh)
    refresh()

    return () =>
      window.removeEventListener(EVENT, refresh)
  }, [])

  return session
}