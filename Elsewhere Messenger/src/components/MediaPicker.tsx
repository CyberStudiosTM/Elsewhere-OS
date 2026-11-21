import { Gif } from '@giphy/react-components'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { createPortal } from 'react-dom'

import {
  validateImage,
  saveLocalImage,
  searchGiphy,
  getGiphyItems,
  relatedGiphy,
  emojiVariations,
  readGiphyKey,
  saveGiphyKey,
  removeGiphyKey,
  watchGiphyKey,
  readCollection,
  toggleFavorite,
  rememberRecent,
  registerGiphyAction,
  type GiphyItem,
  type MediaRef,
  type MediaTab,
  type MediaPickerState,
} from '../services/messengerMedia'

import './MessengerMedia.css'

type Props = {
  picker: MediaPickerState | null
  skin: 'classic' | 'dead-signal'
  onSend: (media: MediaRef) => void
  onClose: () => void
}

type CollectionView =
  'search' | 'favorites' | 'recents' | 'related' | 'variations'

function PickerContent({
  picker,
  skin,
  onSend,
  onClose,
}: Props & { picker: MediaPickerState }) {
  const [tab, setTab] =
    useState<MediaTab>(picker.tab)

  const [view, setView] =
    useState<CollectionView>('search')

  const [relatedId, setRelatedId] =
    useState('')

  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)

  const [key, setKey] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [keyStatus, setKeyStatus] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  const [markReady, setMarkReady] = useState(false)

  const [results, setResults] =
    useState<GiphyItem[]>([])

  const [selected, setSelected] =
    useState<GiphyItem | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')

  const [favorites, setFavorites] =
    useState(() => readCollection('favorites'))

  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState('')

  const panel = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const sendingLock = useRef(false)
  const fileRequest = useRef(0)

  useEffect(() => {
    alive.current = true

    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (tab === 'local') return
    let disposed = false
    let request = 0
    const refresh = () => {
      const sequence = ++request
      void readGiphyKey().then(value => {
        if (!disposed && sequence === request) {
          setKey(value)
          setKeyStatus('')
        }
      }).catch(error => {
        if (!disposed && sequence === request) setKeyStatus(String(error))
      })
    }
    const stop = watchGiphyKey(refresh)
    refresh()
    return () => { disposed = true; stop() }
  }, [tab])

  async function changeKey(action: 'save' | 'remove') {
    setSavingKey(true)
    setKeyStatus('')
    try {
      if (action === 'save') await saveGiphyKey(keyDraft)
      else await removeGiphyKey()
      if (alive.current) {
        setKey(await readGiphyKey())
        setKeyDraft('')
      }
    } catch (error) {
      if (alive.current) setKeyStatus(String(error))
    } finally {
      if (alive.current) setSavingKey(false)
    }
  }

  useEffect(() => {
    setTab(picker.tab)
    setSelected(null)
    setNotice('')
  }, [picker])

  useLayoutEffect(() => {
    const popup = panel.current

    if (!popup) return

    const anchor = picker.anchor
    const element: HTMLDivElement = popup

    function position() {
      const rect = anchor.getBoundingClientRect()

      const margin = 8

      const width = Math.min(
        340,
        window.innerWidth - margin * 2
      )

      const available = Math.max(
        rect.top,
        window.innerHeight - rect.bottom
      )

      const height = Math.max(
        160,
        Math.min(
          400,
          available - margin * 2
        )
      )

      element.style.width = `${width}px`
      element.style.maxHeight = `${height}px`

      const actualHeight =
        Math.min(element.offsetHeight, height)

      const above = rect.top >=
        window.innerHeight - rect.bottom

      const desiredTop = above
        ? rect.top - actualHeight - 5
        : rect.bottom + 5

      const top = Math.max(
        margin,
        Math.min(
          desiredTop,
          window.innerHeight - actualHeight - margin
        )
      )

      const left = Math.max(
        margin,
        Math.min(
          rect.left,
          window.innerWidth - width - margin
        )
      )

      element.style.top = `${top}px`
      element.style.left = `${left}px`
      element.style.visibility = 'visible'
    }

    position()

    const observer = new ResizeObserver(position)

    observer.observe(element)

    window.addEventListener('resize', position)

    return () => {
      observer.disconnect()

      window.removeEventListener(
        'resize',
        position
      )
    }
  }, [picker.anchor])

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (sendingLock.current) return

      const target = event.target

      if (!(target instanceof Element)) return

      if (
        panel.current?.contains(target) ||
        target.closest('[data-media-trigger]')
      ) return

      onClose()
    }

    function escape(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !sendingLock.current
      ) {
        onClose()
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
  }, [onClose])

  useEffect(() => {
    if (!file) {
      setPreview('')
      return
    }

    const url = URL.createObjectURL(file)

    setPreview(url)

    return () => URL.revokeObjectURL(url)
  }, [file])

  // Fetch fresh results as needed. No persistent
  // caching of GIPHY responses or media URLs.

  useEffect(() => {
    setResults([])
    setSelected(null)
    setNotice('')

    if (
      tab === 'local' ||
      !key ||
      !markReady
    ) {
      setLoading(false)
      return
    }

    const controller = new AbortController()

    let disposed = false

    setLoading(true)

    async function load() {
      try {
        if (tab === 'local') return

        let items: GiphyItem[]

        if (
          view === 'related' &&
          tab !== 'emoji'
        ) {
          items = await relatedGiphy(
            relatedId,
            tab,
            page * 20,
            controller.signal
          )
        } else if (view === 'variations') {
          items = await emojiVariations(
            relatedId,
            controller.signal
          )
        } else if (
          view === 'favorites' ||
          view === 'recents'
        ) {
          const ids = readCollection(view)
            .filter(
              (item) => item.mediaType === tab
            )
            .slice(page * 20, page * 20 + 20)
            .map((item) => item.id)

          items = await getGiphyItems(
            ids,
            controller.signal
          )
        } else {
          items = await searchGiphy(
            tab,
            submitted,
            page * 20,
            controller.signal
          )
        }

        if (!disposed) {
          setResults(items)
        }
      } catch (error) {
        if (!disposed) {
          setNotice(
            error instanceof Error
              ? error.message
              : String(error)
          )
        }
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [
    tab,
    view,
    submitted,
    page,
    key,
    markReady,
    revision,
    relatedId,
  ])

  function switchTab(next: MediaTab) {
    setTab(next)
    setView('search')
    setPage(0)
    setSelected(null)
    setNotice('')
  }

  async function chooseFile(next: File) {
    const request = ++fileRequest.current

    setChecking(true)
    setFile(null)
    setNotice('')

    try {
      await validateImage(next)

      if (
        alive.current &&
        request === fileRequest.current
      ) {
        setFile(next)
      }
    } catch (error) {
      if (
        alive.current &&
        request === fileRequest.current
      ) {
        setNotice(
          error instanceof Error
            ? error.message
            : 'This image could not be decoded.'
        )
      }
    } finally {
      if (
        alive.current &&
        request === fileRequest.current
      ) {
        setChecking(false)
      }
    }
  }

  async function send() {
    if (sendingLock.current) return

    sendingLock.current = true
    setSending(true)
    setNotice('')

    try {
      let media: MediaRef

      if (tab === 'local' && file) {
        media = await saveLocalImage(file)
      } else if (
        tab !== 'local' &&
        selected
      ) {
        media = {
          kind: 'giphy',
          id: String(selected.id),
          mediaType: tab,
        }

        rememberRecent(String(selected.id), tab)

        registerGiphyAction(
          selected,
          'onsent'
        )
      } else {
        return
      }

      if (alive.current) {
        onSend(media)
        onClose()
      }
    } catch (error) {
      if (alive.current) {
        setNotice(
          error instanceof Error
            ? error.message
            : String(error)
        )
      }
    } finally {
      sendingLock.current = false

      if (alive.current) {
        setSending(false)
      }
    }
  }

  const host = picker.anchor.closest(
    '.em-app, .ds-desktop'
  )

  if (!host) return null

  return createPortal(
    <div
      className={`ew-media-picker ew-media-${skin}`}
      ref={panel}
      style={{ visibility: 'hidden' }}
      role="dialog"
      aria-label="Messenger media picker"
    >
      <header className="ew-media-header">
        <strong>Media Library</strong>

        <button
          type="button"
          disabled={sending}
          aria-label="Close media picker"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="ew-media-body">
        <div className="ew-media-tabs">
          <button
            type="button"
            disabled={sending}
            aria-pressed={tab === 'local'}
            onClick={() => switchTab('local')}
          >
            Images
          </button>

          <button
            type="button"
            disabled={sending}
            aria-pressed={tab === 'gifs'}
            onClick={() => switchTab('gifs')}
          >
            GIFs
          </button>

          <button
            type="button"
            disabled={sending}
            aria-pressed={tab === 'stickers'}
            onClick={() => switchTab('stickers')}
          >
            Stickers
          </button>

          <button
            type="button"
            disabled={sending}
            aria-pressed={tab === 'emoji'}
            onClick={() => switchTab('emoji')}
          >
            Emoji
          </button>
        </div>

        {tab === 'local' ? (
          <div className="ew-local-image">
            <label>
              Choose an image
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                disabled={sending}
                onChange={(event) => {
                  const next =
                    event.currentTarget.files?.[0]

                  event.currentTarget.value = ''

                  if (next) void chooseFile(next)
                }}
              />
            </label>

            <small>
              PNG, JPEG, animated GIF or WebP.
              Up to 8 MB.
            </small>

            {checking && (
              <p>Checking image...</p>
            )}

            {file && preview && (
              <div className="ew-media-confirmation">
                <img
                  src={preview}
                  alt={file.name}
                />

                <span>{file.name}</span>

                <button
                  type="button"
                  disabled={sending}
                  onClick={() => setFile(null)}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <img
              className="ew-giphy-mark ew-giphy-picker-mark"
              src={
                skin === 'dead-signal'
                  ? '/approved/giphy-mark-dark.png'
                  : '/approved/giphy-powered-light.png'
              }
              alt="Powered by GIPHY"
              onLoad={() => setMarkReady(true)}
              onError={() => setMarkReady(false)}
            />

            {!markReady && (
              <small>
                Install the official Powered by GIPHY
                attribution image to enable online media.
              </small>
            )}

            <details open={!key}>
              <summary>GIPHY settings</summary>

              <label>
                GIPHY Web SDK key

                <input
                  type="password"
                  value={keyDraft}
                  autoComplete="off"
                  placeholder={key ? "Key saved. Enter a new key to replace it." : "Enter your GIPHY Web SDK key"}
                  onChange={(event) =>
                    setKeyDraft(event.target.value)
                  }
                />
              </label>

              <button
                type="button"
                disabled={savingKey || !keyDraft.trim()}
                onClick={() => void changeKey('save')}
              >
                Save key
              </button>
              {key && <button type="button" disabled={savingKey} onClick={() => void changeKey('remove')}>Remove key</button>}
              {keyStatus && <small role="alert">{keyStatus}</small>}

              <small>
                Search requests and GIF loads connect
                directly to GIPHY. Your local images
                are not uploaded.
              </small>
            </details>

            {key && markReady && (
              <>
                {tab !== 'emoji' && (
                <div className="ew-media-search">
                  <input
                    value={query}
                    maxLength={50}
                    aria-label="Search GIPHY"
                    placeholder="Find a reaction..."
                    onChange={(event) =>
                      setQuery(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()

                        setView('search')
                        setSubmitted(query)
                        setPage(0)
                        setRevision((value) => value + 1)
                      }
                    }}
                  />

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setView('search')
                      setSubmitted(query)
                      setPage(0)
                      setRevision((value) => value + 1)
                    }}
                  >
                    Search
                  </button>
                </div>
                )}

                <div className="ew-media-tabs">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setQuery('')
                      setSubmitted('')
                      setView('search')
                      setPage(0)
                      setRevision((value) => value + 1)
                    }}
                  >
                    {tab === 'emoji'
                      ? 'Browse Emoji'
                      : 'Trending'}
                  </button>

                  <button
                    type="button"
                    aria-pressed={view === 'favorites'}
                    onClick={() => {
                      setPage(0)
                      setView('favorites')
                      setRevision((value) => value + 1)
                    }}
                  >
                    Favorites
                  </button>

                  <button
                    type="button"
                    aria-pressed={view === 'recents'}
                    onClick={() => {
                      setPage(0)
                      setView('recents')
                      setRevision((value) => value + 1)
                    }}
                  >
                    Recents
                  </button>
                </div>

                {(view === 'related' ||
                  view === 'variations') && (
                  <p>
                    {view === 'variations'
                      ? 'Emoji variations'
                      : 'Related reactions'}

                    {' '}

                    <button
                      type="button"
                      onClick={() => {
                        setView('search')
                        setPage(0)
                        setRevision(
                          (value) => value + 1
                        )
                      }}
                    >
                      Back
                    </button>
                  </p>
                )}

                {loading ? (
                  <p>Loading media...</p>
                ) : (
                  <div className="ew-media-grid">
                    {results.map((item) => {


                      const favorite = favorites.some(
                        (entry) =>
                          entry.id === String(item.id) &&
                          entry.mediaType === tab
                      )

                      return (
                        <div
                          key={item.id}
                          className="ew-media-tile"
                        >
                          <div className="ew-sdk-thumbnail">
                            <Gif
                              gif={item}
                              width={135}
                              noLink={true}
                              borderRadius={2}
                              onGifClick={() =>
                                setSelected(item)
                              }
                            />

                            <button
                              type="button"
                              className="ew-sdk-select"
                              aria-pressed={
                                String(selected?.id ?? '') ===
                                String(item.id)
                              }
                              onClick={() =>
                                setSelected(item)
                              }
                            >
                              Select
                            </button>
                          </div>

                          <button
                            type="button"
                            className="ew-media-favorite"
                            title="Toggle favorite"
                            aria-label="Toggle favorite"
                            aria-pressed={favorite}
                            onClick={() => {
                              toggleFavorite(String(item.id), tab)

                              setFavorites(
                                readCollection('favorites')
                              )

                              if (view === 'favorites') {
                                setRevision(
                                  (value) => value + 1
                                )
                              }
                            }}
                          >
                            {favorite ? '♥' : '♡'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {!loading &&
                  !notice &&
                  results.length === 0 && (
                    <small>No media found.</small>
                  )}

                {view !== 'variations' && (
                  <div className="ew-media-pagination">
                    <button
                      type="button"
                      disabled={page === 0 || loading}
                      onClick={() =>
                        setPage((value) => value - 1)
                      }
                    >
                      Previous
                    </button>

                    <span>Page {page + 1}</span>

                    <button
                      type="button"
                      disabled={
                        loading ||
                        results.length < 20 ||
                        page >= 24
                      }
                      onClick={() =>
                        setPage((value) => value + 1)
                      }
                    >
                      Next
                    </button>
                  </div>
                )}

                {selected && (
                  <div className="ew-media-confirmation">
                    <Gif
                      gif={selected}
                      width={220}
                      noLink={true}
                      borderRadius={2}
                    />

                    <span>{selected.title}</span>

                    {selected.username && (
                      <small>
                        By {selected.username}
                      </small>
                    )}

                    <div className="ew-media-tabs">
                      <button
                        type="button"
                        onClick={() => {
                          setRelatedId(
                            String(selected.id)
                          )

                          setView(
                            tab === 'emoji'
                              ? 'variations'
                              : 'related'
                          )

                          setPage(0)
                          setRevision(
                            (value) => value + 1
                          )
                        }}
                      >
                        {tab === 'emoji'
                          ? 'Emoji variations'
                          : 'Related media'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSelected(null)
                        }
                      >
                        Cancel selection
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {notice && (
          <p
            className="ew-media-error"
            role="status"
          >
            {notice}
          </p>
        )}

      </div>

      <div className="ew-media-fixed-footer">
        {(
          tab === 'local'
            ? file !== null
            : selected !== null
        ) ? (
          <div className="ew-media-selection-summary">
            <div className="ew-media-selection-info">
              <small>Selected attachment</small>

              <strong
                title={
                  tab === 'local'
                    ? file?.name
                    : selected?.title
                }
              >
                {tab === 'local'
                  ? file?.name
                  : selected?.title ||
                    'Selected animation'}
              </strong>
            </div>

            <button
              type="button"
              disabled={sending}
              aria-label="Clear selected attachment"
              title="Clear selection"
              onClick={() => {
                if (tab === 'local') {
                  setFile(null)
                } else {
                  setSelected(null)
                }
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <small className="ew-media-selection-hint">
            Choose an attachment to send.
          </small>
        )}

        <div className="ew-media-footer">
          <button
            type="button"
            className="ew-media-send-button"
            disabled={
              sending ||
              checking ||
              (
                tab === 'local'
                  ? !file
                  : !selected
              )
            }
            onClick={() => void send()}
          >
            {sending
              ? 'Sending...'
              : 'Send attachment'}
          </button>

          <button
            type="button"
            disabled={sending}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    host
  )
}

export default function MediaPicker(
  props: Props
) {
  if (!props.picker) return null

  return (
    <PickerContent
      {...props}
      picker={props.picker}
    />
  )
}