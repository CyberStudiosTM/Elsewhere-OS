import { useState, type ReactNode } from 'react'

export default function InstagramAvatar({ url, className, alt = '', fallback = null }: {
  url?: string
  className: string
  alt?: string
  fallback?: ReactNode
}) {
  const [unavailable, setUnavailable] = useState<string>()
  return url && unavailable !== url
    ? <img src={url} className={className} alt={alt} referrerPolicy="no-referrer" onError={() => setUnavailable(url)} />
    : fallback
}
