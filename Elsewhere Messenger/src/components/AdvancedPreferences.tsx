import { useState } from 'react'

import {
  useAudioProfiles,
  setAudioMode,
  copyAudioProfile,
  type AudioProfile,
  type AudioSkin,
} from '../services/classicSounds'

import {
  useLocalSession,
  setLocalSessionOptions,
} from '../services/localSession'

import './AdvancedPreferences.css'

const names: Record<AudioProfile, string> = {
  shared: 'Shared',
  classic: 'Classic Messenger',
  'dead-signal': 'Dead Signal',
}

export function AudioProfileSettings({
  skin,
}: {
  skin: AudioSkin
}) {
  const store = useAudioProfiles()

  const current: AudioProfile =
    store.mode === 'shared'
      ? 'shared'
      : skin

  const [source, setSource] =
    useState<AudioProfile>('shared')

  return (
    <fieldset className="ew-advanced-preferences">
      <legend>Audio profiles</legend>

      <label className="em-sound-select-label">
        Profile mode

        <select
          value={store.mode}
          onChange={(event) =>
            setAudioMode(
              event.target.value === 'independent'
                ? 'independent'
                : 'shared'
            )
          }
        >
          <option value="shared">
            Shared across all skins
          </option>

          <option value="independent">
            Independent per skin
          </option>
        </select>
      </label>

      <p>
        Editing: <strong>{names[current]}</strong>
      </p>

      <label className="em-sound-select-label">
        Copy settings from

        <select
          value={source}
          onChange={(event) =>
            setSource(
              event.target.value as AudioProfile
            )
          }
        >
          {Object.entries(names).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={source === current}
        onClick={() => {
          if (!window.confirm(
            `Replace ${names[current]} settings with ${names[source]} settings?`
          )) return

          copyAudioProfile(source, current)
        }}
      >
        Copy into current profile
      </button>

      <small>
        Independent profiles retain their settings
        when you return to shared mode.
        Restore Defaults affects only the active profile.
      </small>
    </fieldset>
  )
}

export function ApplicationPreferences() {
  const session = useLocalSession()

  return (
    <fieldset className="ew-advanced-preferences">
      <legend>Startup and local session</legend>

      <label className="ew-pref-checkbox">
        <input
          type="checkbox"
          checked={session.remember}
          onChange={(event) =>
            setLocalSessionOptions({
              remember: event.target.checked,
            })
          }
        />

        Remember my local identity
      </label>

      <label className="ew-pref-checkbox">
        <input
          type="checkbox"
          disabled={!session.remember}
          checked={session.automatic}
          onChange={(event) =>
            setLocalSessionOptions({
              automatic: event.target.checked,
            })
          }
        />

        Sign me in automatically
      </label>

      <p>
        Current identity:{' '}
        <strong>
          {session.profile?.name ?? 'Not signed in'}
        </strong>
      </p>

      <small>
        Automatic sign-in restores only a local
        demonstration session. No passwords or
        server credentials are stored.
      </small>

      <p>
        Use File to sign out or switch the local account.
      </p>
    </fieldset>
  )
}