import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'

import {
  listSoundPacks,
  importNotificationClip,
  deleteSoundPack,
  PACK_REVISION,
  type SoundPack,
} from '../services/soundPacks'

import {
  clearSoundPackReferences,
  playNotificationSound,
  type NotificationChannel,
  type SoundPreferences,
} from '../services/classicSounds'

type Props = {
  preferences: SoundPreferences
  onChange: (
    changes: Partial<SoundPreferences>
  ) => void
}

const channels = [
  ['incoming', 'Incoming messages'],
  ['outgoing', 'Outgoing messages'],
  ['contact', 'Contact notifications'],
] as const

export default function NotificationClipManager({
  preferences,
  onChange,
}: Props) {
  const [library, setLibrary] =
    useState<SoundPack[]>([])

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function refresh() {
    try {
      setLibrary(
        (await listSoundPacks()).filter(
          (pack) => pack.source === 'notification'
        )
      )
    } catch (error) {
      setNotice(String(error))
    }
  }

  useEffect(() => {
    let disposed = false
    let remove: (() => void) | undefined

    function storage(event: StorageEvent) {
      if (
        !disposed &&
        event.key === PACK_REVISION
      ) {
        void refresh()
      }
    }

    window.addEventListener('storage', storage)

    if (isTauri()) {
      void listen(
        'elsewhere:sound:library-changed',
        () => {
          if (!disposed) void refresh()
        }
      ).then((unlisten) => {
        if (disposed) unlisten()
        else remove = unlisten
      }).catch(console.error)
    }

    void refresh()

    return () => {
      disposed = true

      window.removeEventListener(
        'storage',
        storage
      )

      remove?.()
    }
  }, [])

  function select(
    channel: NotificationChannel,
    id: string | null
  ) {
    onChange({
      notificationClips: {
        ...preferences.notificationClips,
        [channel]: id,
      },
    })
  }

  async function announce() {
    await refresh()

    if (isTauri()) {
      await emit(
        'elsewhere:sound:library-changed'
      ).catch(console.error)
    }
  }

  async function perform(
    action: () => Promise<void>
  ) {
    if (busy) return

    setBusy(true)
    setNotice('')

    try {
      await action()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : String(error)
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="ew-advanced-preferences">
      <legend>Custom notification recordings</legend>

      {channels.map(([channel, label]) => {
        const selected =
          preferences.notificationClips[channel]

        return (
          <div key={channel} className="ew-pref-section">
            <label className="em-sound-select-label">
              {label}

              <select
                value={selected ?? ''}
                disabled={busy}
                onChange={(event) =>
                  select(
                    channel,
                    event.target.value || null
                  )
                }
              >
                <option value="">
                  Use built-in notification
                </option>

                {library.map((clip) => (
                  <option
                    value={clip.id}
                    key={clip.id}
                  >
                    {clip.name}
                  </option>
                ))}
              </select>
            </label>

            <input
              type="file"
              accept=".wav,.mp3,.ogg"
              aria-label={`Import ${label} sound`}
              disabled={busy}
              onChange={(event) => {
                const file =
                  event.currentTarget.files?.[0]

                event.currentTarget.value = ''

                if (!file) return

                void perform(async () => {
                  const clip =
                    await importNotificationClip(file)

                  select(channel, clip.id)

                  await announce()

                  setNotice(
                    'Notification audio imported.'
                  )
                })
              }}
            />

            <div className="ew-pref-buttons">
              <button
                type="button"
                disabled={!selected || busy}
                onClick={() =>
                  playNotificationSound(
                    channel,
                    preferences
                  )
                }
              >
                Preview custom
              </button>

              <button
                type="button"
                disabled={!selected || busy}
                onClick={() => {
                  if (!selected) return

                  if (!window.confirm(
                    'Delete this recording from all audio profiles?'
                  )) return

                  void perform(async () => {
                    await deleteSoundPack(selected)

                    clearSoundPackReferences(selected)

                    await announce()

                    setNotice('Recording removed.')
                  })
                }}
              >
                Delete recording
              </button>
            </div>
          </div>
        )
      })}

      <small>
        WAV, MP3 and OGG. Up to 2 MB and
        five seconds per recording.
        Recordings stay on this computer.
      </small>

      {busy && (
        <p role="status">Validating recording...</p>
      )}

      {notice && (
        <p role="status">{notice}</p>
      )}
    </fieldset>
  )
}