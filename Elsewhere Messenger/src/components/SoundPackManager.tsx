import {
  clearSoundPackReferences,
} from '../services/classicSounds'

import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'

import {
  keyKinds,
  keyLabels,
  listSoundPacks,
  importCustomPack,
  importGXPack,
  renameSoundPack,
  deleteSoundPack,
  PACK_REVISION,
  type SoundPack,
  type SelectedFiles,
} from '../services/soundPacks'

import {
  playTypingSound,
  type SoundPreferences,
} from '../services/classicSounds'

type Props = {
  preferences: SoundPreferences
  onChange: (
    preferences: Partial<SoundPreferences>
  ) => void
}

const LIBRARY_EVENT =
  'elsewhere:sound:library-changed'

const testKeys = {
  letter: 'a',
  space: ' ',
  enter: 'Enter',
  backspace: 'Backspace',
}

export default function SoundPackManager({
  preferences,
  onChange,
}: Props) {
  const [packs, setPacks] = useState<SoundPack[]>([])
  const [name, setName] = useState('')
  const [rename, setRename] = useState('')
  const [files, setFiles] = useState<SelectedFiles>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [formKey, setFormKey] = useState(0)

  async function refresh() {
    try {
      setPacks(
        (await listSoundPacks()).filter(
          (pack) => pack.source !== 'notification'
        )
      )
    } catch (error) {
      setNotice(String(error))
    }
  }

  useEffect(() => {
    void refresh()

    let disposed = false
    let remove: (() => void) | undefined

    function changed(event: StorageEvent) {
      if (event.key === PACK_REVISION) {
        void refresh()
      }
    }

    window.addEventListener('storage', changed)

    if (isTauri()) {
      void listen(
        LIBRARY_EVENT,
        () => {
          if (!disposed) void refresh()
        }
      ).then((unlisten) => {
        if (disposed) unlisten()
        else remove = unlisten
      }).catch(console.error)
    }

    return () => {
      disposed = true
      window.removeEventListener('storage', changed)
      remove?.()
    }
  }, [])

  async function announce() {
    await refresh()

    if (isTauri()) {
      await emit(LIBRARY_EVENT).catch(console.error)
    }
  }

  const selected = packs.find(
    (pack) => pack.id === preferences.packId
  )

  useEffect(() => {
    setRename(selected?.name ?? '')
  }, [selected?.id, selected?.name])

  async function perform(
    operation: () => Promise<void>
  ) {
    if (busy) return

    setBusy(true)
    setNotice('')

    try {
      await operation()
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
    <fieldset className="ew-sound-pack-manager">
      <legend>Custom typing sound packs</legend>

      <label className="em-sound-select-label">
        Active sound pack

        <select
          value={preferences.packId ?? ''}
          disabled={busy}
          onChange={(event) => {
            onChange({
              packId: event.target.value || null,
            })
          }}
        >
          <option value="">Built-in typing presets</option>

          {packs.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.name}
              {pack.source === 'gx' ? ' (GX)' : ''}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="ew-pack-selected">
          <label className="em-sound-select-label">
            Rename pack

            <input
              type="text"
              maxLength={64}
              value={rename}
              onChange={(event) =>
                setRename(event.target.value)
              }
              disabled={busy}
            />
          </label>

          <div className="ew-pack-buttons">
            <button
              type="button"
              disabled={busy || !rename.trim()}
              onClick={() => {
                void perform(async () => {
                  await renameSoundPack(selected, rename)
                  await announce()
                  setNotice('Sound pack renamed.')
                })
              }}
            >
              Rename
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(
                  `Remove "${selected.name}" from the local sound library?`
                )) return

                void perform(async () => {
                  await deleteSoundPack(selected.id)
                  clearSoundPackReferences(selected.id)
                  await announce()
                  setNotice('Sound pack removed.')
                })
              }}
            >
              Delete pack
            </button>
          </div>

          <div className="ew-pack-previews">
            {keyKinds.map((key) => (
              <button
                type="button"
                key={key}
                disabled={busy}
                onClick={() =>
                  playTypingSound(
                    preferences,
                    testKeys[key]
                  )
                }
              >
                {key === 'letter' ? 'Letter' : key}
              </button>
            ))}
          </div>

          <small>
            Preview individual keys using the current volume.
          </small>
        </div>
      )}

      <details className="ew-pack-section">
        <summary>Create custom pack</summary>

        <div key={formKey} className="ew-pack-form">
          <label className="em-sound-select-label">
            Pack name

            <input
              type="text"
              value={name}
              maxLength={64}
              disabled={busy}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="My dreamy keyboard"
            />
          </label>

          {keyKinds.map((key) => (
            <label
              className="em-sound-select-label"
              key={key}
            >
              {keyLabels[key]}

              <input
                type="file"
                accept=".wav,.mp3,.ogg"
                multiple
                disabled={busy}
                onChange={(event) => {
                  const selectedFiles = Array.from(
                    event.currentTarget.files ?? []
                  )

                  setFiles((previous) => ({
                    ...previous,
                    [key]: selectedFiles,
                  }))
                }}
              />

              <small>
                {files[key]?.length ?? 0} clips selected
              </small>
            </label>
          ))}

          <button
            type="button"
            disabled={
              busy ||
              !name.trim() ||
              !Object.values(files).some(
                (group) => group.length > 0
              )
            }
            onClick={() => {
              void perform(async () => {
                const groups: SelectedFiles = {}

                for (const key of keyKinds) {
                  if (files[key]?.length) {
                    groups[key] = files[key]
                  }
                }

                const pack = await importCustomPack(
                  name,
                  groups
                )

                onChange({ packId: pack.id })

                setName('')
                setFiles({})
                setFormKey((previous) => previous + 1)

                await announce()

                setNotice('Custom sound pack activated.')
              })
            }}
          >
            Save and activate pack
          </button>

          <small>
            WAV, MP3 or OGG. Maximum 32 clips,
            2 MB per clip, five seconds per clip
            and 16 MB per pack.
          </small>
        </div>
      </details>

      <details className="ew-pack-section">
        <summary>Import Opera GX mod</summary>

        <p>
          Choose an unpacked GX mod folder containing
          manifest.json. Only keyboard audio is imported.
        </p>

        <input
          type="file"
          ref={(node) => {
            node?.setAttribute('webkitdirectory', '')
          }}
          multiple
          disabled={busy}
          aria-label="Choose unpacked GX mod folder"
          onChange={(event) => {
            const folder = Array.from(
              event.currentTarget.files ?? []
            )

            event.currentTarget.value = ''

            if (!folder.length) return

            void perform(async () => {
              const pack = await importGXPack(folder)

              onChange({ packId: pack.id })

              await announce()

              setNotice('GX sound pack activated.')
            })
          }}
        />

        <small>
          Import only audio you have permission to use.
          ZIP and CRX files must be unpacked first.
        </small>
      </details>

      <label className="ew-pack-checkbox">
        <input
          type="checkbox"
          checked={preferences.typewriterBell}
          onChange={(event) =>
            onChange({
              typewriterBell: event.target.checked,
            })
          }
        />

        Typewriter carriage-return bell
      </label>

      <small>
        The bell plays on Enter when the built-in
        Typewriter preset is active.
        Selecting a built-in sound disables the custom pack.
      </small>

      {busy && (
        <p role="status">Validating audio...</p>
      )}

      {notice && (
        <p className="ew-pack-notice" role="status">
          {notice}
        </p>
      )}
    </fieldset>
  )
}