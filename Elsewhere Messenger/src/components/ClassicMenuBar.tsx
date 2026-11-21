import { toolbarAction } from '../services/toolbarActions'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { emit, emitTo } from '@tauri-apps/api/event'
import { INSTAGRAM_OPEN } from '../services/instagramWindow'
import NotificationClipManager from './NotificationClipManager'
import { requestUpdateCheck } from './UpdateCheck'
import './ClassicMenuBar.css'

const HELP_URL = 'https://cyberthreed.github.io/CyberStudios/'

import {
  AudioProfileSettings,
  ApplicationPreferences,
} from './AdvancedPreferences'

import SoundPackManager from './SoundPackManager'
import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  typingSounds,
  notificationSounds,
  playTypingSound,
  playNotificationSound,
  type TypingSound,
  type NotificationSound,
  type SoundPreferences,
} from '../services/classicSounds'

export type EditAction =
  'cut' | 'copy' | 'paste' | 'select-all'

type MenuName =
  'File' |
  'Edit' |
  'Contacts' |
  'Actions' |
  'Tools' |
  'Web Treasures' |
  'Photo Studio' |
  'Skins' |
  'Help'

type MenuProps = {
  kind: 'buddy' | 'chat'
  skin?: 'classic' | 'dead-signal'
  onClassic?: () => void

  onSignIn: () => void
  onSignOut?: () => void
  onExit?: () => void
  onClose?: () => void

  contacts?: ReadonlyArray<{
    id: string
    name: string
  }>

  onContact?: (id: string) => void
  onExpand?: (expanded: boolean) => void
  onOpenSelected?: () => void
  onTestContact?: () => void

  onEdit?: (action: EditAction) => void
  onClearDraft?: () => void
  onSend?: () => void

  onDeadSignal: () => void

  preferences: SoundPreferences

  onSoundChange: (
    changes: Partial<SoundPreferences>
  ) => void
}

export default function ClassicMenuBar(
  props: MenuProps
) {
  const [open, setOpen] =
    useState<MenuName | null>(null)

  const [about, setAbout] =
    useState(false)
  const [helpError, setHelpError] = useState('')

  const [settingsTab, setSettingsTab] =
    useState<'sound' | 'general'>('sound')

  const [soundSettings, setSoundSettings] =
    useState(false)

  const container =
    useRef<HTMLDivElement>(null)

  const names: MenuName[] =
    props.kind === 'buddy'
      ? [
          'File',
          'Contacts',
          'Actions',
          'Web Treasures',
          // The buddy window is narrow: Photo Studio and Skins live under Tools here.
          'Tools',
          'Help',
        ]
      : [
          'File',
          'Edit',
          'Actions',
          'Web Treasures',
          'Photo Studio',
          'Skins',
          'Tools',
          'Help',
        ]

  useEffect(() => {
    function outside(
      event: PointerEvent
    ) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(
          event.target
        )
      ) {
        setOpen(null)
        setAbout(false)
        setSoundSettings(false)
      }
    }

    function escape(
      event: KeyboardEvent
    ) {
      if (event.key === 'Escape') {
        setOpen(null)
        setAbout(false)
        setSoundSettings(false)
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
  }, [])

  function run(action?: () => void) {
    setOpen(null)
    action?.()
  }

  // Skin switcher: its own menu in conversation windows, a submenu of Tools in the buddy window.
  const skinChoices = (
    <>

                <button
                  type="button"
                  onClick={() => run(props.onClassic)}
                >
                  <span className="em-menu-check">
                    {props.skin !== 'dead-signal'
                      ? '\u2713'
                      : ''}
                  </span>

                  Classic Messenger
                </button>

                <button
                  type="button"
                  onClick={() =>
                    run(props.onDeadSignal)
                  }
                >
                  <span className="em-menu-check">
                    {props.skin === 'dead-signal'
                      ? '\u2713'
                      : ''}
                  </span>

                  Dead Signal
                </button>
    </>
  )

  return (
    <div
      className={
        props.skin === 'dead-signal'
          ? 'ds-menu em-functional-menu'
          : 'em-menubar em-functional-menu'
      }
      ref={container}
    >
      {names.map((name) => (
        <button
          key={name}
          type="button"
          className={
            'em-menu-top' +
            (open === name
              ? ' em-menu-selected'
              : '')
          }
          aria-expanded={open === name}
          onClick={() => {
            setAbout(false)
            setSoundSettings(false)

            setOpen(
              open === name ? null : name
            )
          }}
        >
          {name}
        </button>
      ))}

      {open && (
        <div
          className={
            'em-menu-popup' +
            (
              open === 'Tools' ||
              open === 'Help'
                ? ' em-menu-align-right'
                : ''
            ) + (open === 'Tools' ? ' ew-tools-menu' : '')
          }
          aria-label={`${open} menu`}
        >
          {open === 'File' && (
            <>
              <button
                type="button"
                onClick={() =>
                  run(props.onSignIn)
                }
              >
                {props.onSignOut
                  ? 'Switch Account...'
                  : 'Sign-in...'}
              </button>

              {props.onSignOut && (
                <button
                  type="button"
                  onClick={() => run(props.onSignOut)}
                >
                  Sign Out
                </button>
              )}

              {props.onClose && (
                <button
                  type="button"
                  onClick={() =>
                    run(props.onClose)
                  }
                >
                  Close Conversation
                </button>
              )}

              {props.onExit && (
                <>
                  <hr />

                  <button
                    type="button"
                    onClick={() =>
                      run(props.onExit)
                    }
                  >
                    Exit Messenger
                  </button>
                </>
              )}
            </>
          )}

          {open === 'Edit' && (
            <>
              {([
                ['Cut', 'cut', 'Ctrl+X'],
                ['Copy', 'copy', 'Ctrl+C'],
                ['Paste', 'paste', 'Ctrl+V'],
                [
                  'Select All',
                  'select-all',
                  'Ctrl+A',
                ],
              ] as const).map(
                ([label, action, shortcut]) => (
                  <button
                    key={action}
                    type="button"
                    onMouseDown={(event) =>
                      event.preventDefault()
                    }
                    onClick={() =>
                      run(() =>
                        props.onEdit?.(action)
                      )
                    }
                  >
                    {label}

                    <small>{shortcut}</small>
                  </button>
                )
              )}
            </>
          )}

          {open === 'Contacts' && (
            <>
              <button type="button" onClick={() => run(() => toolbarAction({ kind: 'add-contact' }))}>Add Contact...</button>
              <hr />
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    props.onExpand?.(true)
                  )
                }
              >
                Expand All Groups
              </button>

              <button
                type="button"
                onClick={() =>
                  run(() =>
                    props.onExpand?.(false)
                  )
                }
              >
                Collapse All Groups
              </button>

              <hr />

              <details>
                <summary>
                  Open Conversation
                </summary>

                {props.contacts?.map(
                  (contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      className="em-menu-indented"
                      onClick={() =>
                        run(() =>
                          props.onContact?.(
                            contact.id
                          )
                        )
                      }
                    >
                      {contact.name}
                    </button>
                  )
                )}
              </details>

              <hr />

              <button
                type="button"
                disabled
                title="Account connections are not implemented."
              >
                Add a Contact...
              </button>
            </>
          )}

          {open === 'Actions' && (
            <>
              {props.kind === 'buddy' ? (
                <button
                  type="button"
                  disabled={!props.onOpenSelected}
                  onClick={() =>
                    run(props.onOpenSelected)
                  }
                >
                  Open Selected Conversation
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      run(props.onSend)
                    }
                  >
                    Send Message
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      run(props.onClearDraft)
                    }
                  >
                    Clear Message Draft
                  </button>
                </>
              )}

              <hr />

              {props.onTestContact && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      run(props.onTestContact)
                    }
                  >
                    Test Contact Notification
                  </button>

                  <hr />
                </>
              )}

              <button type="button" onClick={() => run(() => toolbarAction({ kind: 'call' }))}>Start Voice Call</button>
              <button type="button" onClick={() => run(() => toolbarAction({ kind: 'call', video: true }))}>Start Video Call</button>
            </>
          )}

          {open === 'Web Treasures' && (
            <button type="button" onClick={() => {
              setOpen(null)
              if(isTauri()) void emit('elsewhere:web-treasures:open').catch(console.error)
              else window.dispatchEvent(new Event('elsewhere:web-treasures:open'))
            }}>Open Web Treasures...</button>
          )}

          {open === 'Photo Studio' && (
            <button type="button" onClick={() => run(() => toolbarAction({ kind: 'photo' }))}>Open Photo Studio...</button>
          )}

          {open === 'Skins' && skinChoices}

          {open === 'Tools' && props.kind === 'buddy' && (
            <>
              <button type="button" onClick={() => run(() => toolbarAction({ kind: 'photo' }))}>Photo Studio...</button>
              <details>
                <summary>Skins</summary>
                {skinChoices}
              </details>
              <hr />
            </>
          )}

          {open === 'Tools' && (
            <>
              <div className="ew-tools-label">Accounts</div>
              <button type="button" onClick={() => run(() => toolbarAction({ kind: 'accounts' }))}>Elsewhere Accounts &amp; Messages...</button>
              <details>
                <summary>Social Accounts &amp; Settings</summary>
                <button className="em-menu-indented" type="button" onClick={() => run(() => {
                  if (isTauri()) void emitTo('main', 'elsewhere:discord:open').catch(console.error)
                  else window.dispatchEvent(new Event('elsewhere:discord:open'))
                })}>Manage Discord...</button>
                <button className="em-menu-indented" type="button" onClick={() => run(() => {
                  if (isTauri()) void emit(INSTAGRAM_OPEN).catch(console.error)
                  else window.dispatchEvent(new Event(INSTAGRAM_OPEN))
                })}>Instagram Connection...</button>
                <button className="em-menu-indented" type="button" onClick={() => run(() => {
                  if (isTauri()) void emitTo('main', 'elsewhere:instagram:settings').catch(console.error)
                  else window.dispatchEvent(new Event('elsewhere:instagram:settings'))
                })}>Instagram Contact Appearance...</button>
                <button className="em-menu-indented" type="button" onClick={() => run(() => {
                  if (isTauri()) void emitTo('main', 'elsewhere:x:open').catch(console.error)
                  else window.dispatchEvent(new Event('elsewhere:x:open'))
                })}>X Direct Messages...</button>
                <button className="em-menu-indented" type="button" onClick={() => run(() => {
                  if (isTauri()) void emitTo('main', 'elsewhere:social:adopt').catch(console.error)
                  else window.dispatchEvent(new Event('elsewhere:social:adopt'))
                })}>Move Older Connections to This Account...</button>
              </details>

              <hr />
              <div className="ew-tools-label">Preferences</div>
              <button type="button" onClick={() => run(() => {
                if (isTauri()) void emitTo('main', 'elsewhere:notifications:open').catch(console.error)
                else window.dispatchEvent(new Event('elsewhere:notifications:open'))
              })}>Desktop Notifications...</button>

              <hr />

              <button
                type="button"
                onClick={() => {
                  setOpen(null)
                  setSettingsTab('sound')
                  setSoundSettings(true)
                }}
              >
                Sound Settings...
              </button>

              {props.kind === 'buddy' && props.onSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(null)
                    setSettingsTab('general')
                    setSoundSettings(true)
                  }}
                >
                  Application Preferences...
                </button>
              )}

              <details>
                <summary>Sound Library</summary>

                <div className="em-menu-heading">
                  Typing Sounds
                </div>

                <div className="em-typing-sound-list">
                {typingSounds.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    aria-pressed={
                      (!props.preferences.packId && props.preferences.typing === sound.id)
                    }
                    onClick={() => {
                      props.onSoundChange({
                        typing: sound.id,
                      })
                    }}
                  >
                    <span className="em-menu-check">
                      {
                        (!props.preferences.packId && props.preferences.typing === sound.id)
                          ? '\u2713'
                          : ''
                      }
                    </span>

                    {sound.label}
                  </button>
                ))}
                </div>

                <hr />

                <div className="em-menu-volume">
                  <label>
                    Volume

                    <span>
                      {props.preferences.volume}%
                    </span>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={
                        props.preferences.volume
                      }
                      onChange={(event) =>
                        props.onSoundChange({
                          volume: Number(
                            event.target.value
                          ),
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="em-menu-preview"
                    disabled={
                      !props.preferences.packId &&
                      props.preferences.typing === 'off'
                    }
                    onClick={() =>
                      playTypingSound(
                        props.preferences
                      )
                    }
                  >
                    Preview Sound
                  </button>
                </div>
              </details>
              <hr />
              <div className="ew-tools-label">App</div>
              <button type="button" disabled={!isTauri()} onClick={() => run(() => {
                void invoke('reveal_elsewhere_executable').catch(error => {
                  window.alert(`Could not open the Elsewhere EXE location. ${String(error)}`)
                })
              })}>Open EXE Location</button>
            </>
          )}

          {open === 'Help' && (
            <button type="button" onClick={() => { setOpen(null); requestUpdateCheck() }}>
              Check for Updates...
            </button>
          )}
          {open === 'Help' && (
            <button
              type="button"
              onClick={() => {
                setOpen(null)
                setHelpError('')
                setAbout(true)
              }}
            >
              About Elsewhere Messenger
            </button>
          )}
        </div>
      )}

      {soundSettings && (
        <div
          className="em-sound-settings"
          role="dialog"
          aria-label={
            settingsTab === 'general'
              ? 'Application Preferences'
              : 'Sound Settings'
          }
        >
          <div className="em-sound-settings-title">
            <span>
              {settingsTab === 'general'
                ? 'Application Preferences'
                : 'Sound Settings'}
            </span>

            <button
              type="button"
              aria-label="Close sound settings"
              onClick={() =>
                setSoundSettings(false)
              }
            >
              {'\u00D7'}
            </button>
          </div>

          <div className="em-sound-settings-body">
            {settingsTab === 'general' ? (
              <>
                <ApplicationPreferences />

                <div className="em-sound-settings-footer">
                  <button
                    type="button"
                    onClick={() => setSoundSettings(false)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <AudioProfileSettings
                  skin={props.skin ?? 'classic'}
                />
            <fieldset>
              <legend>Typing</legend>

              <label
                className="em-sound-select-label"
              >
                Typing sound

                <select
                  value={props.preferences.typing}
                  onChange={(event) =>
                    props.onSoundChange({
                      typing: event.target.value as TypingSound,
                    })
                  }
                >
                  {typingSounds.map((sound) => (
                    <option
                      key={sound.id}
                      value={sound.id}
                    >
                      {sound.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="em-sound-preview-button"
                disabled={
                      !props.preferences.packId &&
                      props.preferences.typing === 'off'
                    }
                onClick={() =>
                  playTypingSound(
                    props.preferences
                  )
                }
              >
                Preview
              </button>
            </fieldset>

            <fieldset>
              <legend>Message and contact sounds</legend>

              {([
                {
                  id: 'outgoing',
                  label: 'Outgoing message',
                },
                {
                  id: 'incoming',
                  label: 'Incoming message',
                },
                {
                  id: 'contact',
                  label: 'Contact notification',
                },
              ] as const).map((channel) => (
                <div
                  key={channel.id}
                  className="em-sound-channel"
                >
                  <label
                    className="em-sound-select-label"
                  >
                    {channel.label}

                    <select
                      value={
                        props.preferences.notificationClips[channel.id]
                          ? '__custom'
                          : props.preferences[channel.id]
                      }
                      onChange={(event) => {
                        const selected =
                          event.target.value as NotificationSound

                        props.onSoundChange({
                          [channel.id]: selected,
                        })
                      }}
                    >
                      {props.preferences.notificationClips[channel.id] && (
                        <option value="__custom" disabled>
                          Custom recording active
                        </option>
                      )}

                      {notificationSounds.map(
                        (sound) => (
                          <option
                            key={sound.id}
                            value={sound.id}
                          >
                            {sound.label}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="em-sound-preview-button"
                    disabled={
                      !props.preferences.notificationClips[channel.id] &&
                      props.preferences[channel.id] === 'off'
                    }
                    onClick={() =>
                      playNotificationSound(
                        channel.id,
                        props.preferences
                      )
                    }
                  >
                    Preview
                  </button>
                </div>
              ))}
            </fieldset>

            <NotificationClipManager
              preferences={props.preferences}
              onChange={props.onSoundChange}
            />

            <SoundPackManager
              preferences={props.preferences}
              onChange={props.onSoundChange}
            />

            <fieldset>
              <legend>Master volume</legend>

              <label className="em-sound-master-volume">
                <span>
                  {props.preferences.volume}%
                </span>

                <input
                  type="range"
                  aria-label="Master sound volume"
                  min={0}
                  max={100}
                  step={5}
                  value={props.preferences.volume}
                  onChange={(event) =>
                    props.onSoundChange({
                      volume: Number(
                        event.target.value
                      ),
                    })
                  }
                />
              </label>
            </fieldset>

            <p className="em-sound-settings-note">
              Changes are saved automatically.
              Incoming and contact sounds can
              be previewed until live services
              are connected.
            </p>

            <div className="em-sound-settings-footer">
              <button
                type="button"
                onClick={() =>
                  props.onSoundChange({
                    typing: 'off',
                    outgoing: 'off',
                    incoming: 'off',
                    contact: 'off',
                    packId: null,
                    typewriterBell: false,
                    notificationClips: {
                      incoming: null,
                      outgoing: null,
                      contact: null,
                    },
                    volume: 35,
                  })
                }
              >
                Restore Defaults
              </button>

              <button
                type="button"
                onClick={() =>
                  setSoundSettings(false)
                }
              >
                Done
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {about && (
        <div
          className="em-menu-about"
          role="dialog"
          aria-label="About Elsewhere Messenger"
        >
          <div className="em-menu-about-title">
            About Elsewhere Messenger
          </div>

          <div className="em-menu-about-content">
            <span
              className="em-menu-about-logo"
              aria-hidden="true"
            />

            <strong>Elsewhere Messenger</strong>

            <p>
              {props.skin === 'dead-signal'
                ? 'Dead Signal Edition'
                : 'Classic Edition'}
            </p>

            <p>
              By CyberStudios
            </p>

            <p className="em-menu-about-description">
              A messenger inspired by the early internet and the glossy Aero era, with all
              your conversations in one buddy list, wrapped in the skin you love.
              Chat with friends on Elsewhere, reply to your Instagram DMs and keep up
              with your Discord servers, right from your desktop.
            </p>

            <p className="em-menu-about-help">
              <strong>Help:</strong>{' '}
              <a href={HELP_URL} target="_blank" rel="noopener noreferrer" onClick={event => {
                if (!isTauri()) return
                event.preventDefault()
                setHelpError('')
                void openUrl(HELP_URL).catch(() => {
                  setHelpError('Could not open the help site. Copy the link to open it in your browser.')
                })
              }}>CyberStudios</a>
            </p>
            {helpError && <small role="alert">{helpError}</small>}

            <button
              type="button"
              onClick={() => setAbout(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}