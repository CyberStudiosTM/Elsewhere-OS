import { toolbarAction } from '../services/toolbarActions'
import './SocialServiceFilter.css'

export type SocialService = 'all' | 'elsewhere' | 'instagram' | 'discord'

export function serviceForContact(id: string): 'elsewhere' | 'instagram' | 'discord' {
  return id.startsWith('instagram:') ? 'instagram' : id.startsWith('discord:') ? 'discord' : 'elsewhere'
}

export function matchesSocialService(id: string, active: SocialService): boolean {
  return active === 'all' || serviceForContact(id) === active
}

export default function SocialServiceFilter({
  value,
  onChange,
  instagramConnected,
}: {
  value: SocialService
  onChange: (value: SocialService) => void
  instagramConnected: boolean
}) {
  return (
    <nav className="ew-social-services" aria-label="Filter contacts by messaging service">
      {([
        ['all', 'All'],
        ['elsewhere', 'Elsewhere'],
        ['instagram', 'Instagram'],
        ['discord', 'Discord'],
      ] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={'ew-social-service' + (value === key ? ' is-selected' : '')}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          title={key === 'instagram' && !instagramConnected
            ? 'Instagram is not connected. Open Tools → Social Accounts & Settings → Instagram Connection.'
            : `Show ${label} contacts`}
        >
          {label}
        </button>
      ))}
      <button type="button" className={'ew-social-service' + (value === 'instagram' ? ' is-unavailable' : '')}
        aria-disabled={value === 'instagram'}
        title={value === 'instagram'
          ? 'Start new Instagram DMs in the Instagram app. Once they message you, the chat shows up here and you can reply from Elsewhere (Instagram allows replies within 24 hours of their last message).'
          : 'Start a direct message'}
        onClick={() => { if (value !== 'instagram') toolbarAction({ kind: 'new-dm', service: value }) }}>New DM</button>
    </nav>
  )
}
