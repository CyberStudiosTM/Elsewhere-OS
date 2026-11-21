import TreasureAttachment from './TreasureAttachment'
import { useEffect, useState } from 'react'
import { Gif } from '@giphy/react-components'

import {
  readLocalImage,
  resolveGiphy,
  type MediaRef,
  type GiphyItem,
} from '../services/messengerMedia'

import './MessengerMedia.css'

function ProviderMediaAttachment({
  media,
  skin,
}: {
  media: Exclude<MediaRef, { kind: 'treasure' }>
  skin: 'classic' | 'dead-signal'
}) {
  const [url, setUrl] = useState('')
  const [item, setItem] =
    useState<GiphyItem | null>(null)

  const [error, setError] = useState('')

  const id = media.id
  const kind = media.kind

  useEffect(() => {
    const controller = new AbortController()

    let disposed = false
    let objectUrl = ''

    setUrl('')
    setItem(null)
    setError('')

    async function load() {
      try {
        if (kind === 'local') {
          const blob = await readLocalImage(id)

          if (disposed) return

          if (!blob) {
            throw new Error(
              'This local image is unavailable.'
            )
          }

          objectUrl = URL.createObjectURL(blob)

          setUrl(objectUrl)
        } else {
          const result = await resolveGiphy(
            id,
            controller.signal
          )

          if (disposed) return

          if (!result) {
            throw new Error(
              'This GIPHY attachment is unavailable.'
            )
          }

          setItem(result)
        }
      } catch (error) {
        if (!disposed) {
          setError(
            error instanceof Error
              ? error.message
              : String(error)
          )
        }
      }
    }

    void load()

    return () => {
      disposed = true
      controller.abort()

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [id, kind])

  return (
    <div className="ew-message-media">
      {error ? (
        <span className="ew-media-error">
          {error}
        </span>
      ) : media.kind === 'local' && url ? (
        <img
          src={url}
          alt={media.name}
          title={media.name}
          draggable={false}
          onError={() =>
            setError(
              'Unable to display this image.'
            )
          }
        />
      ) : item ? (
        <div className="ew-sdk-message">
          <Gif
            gif={item}
            width={
              media.kind === 'giphy' &&
              media.mediaType === 'emoji'
                ? 96
                : 220
            }
            noLink={true}
            borderRadius={2}
          />
        </div>
      ) : (
        <span>Loading attachment...</span>
      )}

      {media.kind === 'giphy' && (
        <img
          className="ew-giphy-mark ew-giphy-inline-mark"
          src={
            skin === 'dead-signal'
              ? '/approved/giphy-powered-dark-small.png'
              : '/approved/giphy-powered-light-small.png'
          }
          alt="Powered by GIPHY"
        />
      )}

      {media.kind === 'local' && (
        <small>{media.name}</small>
      )}
    </div>
  )
}
export default function MediaAttachment({
  media,
  skin,
}: {
  media: MediaRef
  skin: 'classic' | 'dead-signal'
}) {
  if (media.kind === 'treasure') {
    return <TreasureAttachment id={media.id} name={media.name} />
  }
  return <ProviderMediaAttachment media={media} skin={skin} />
}