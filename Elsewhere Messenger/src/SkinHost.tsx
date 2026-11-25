import ToolbarDialogs from './components/ToolbarDialogs'
import { openStudio } from './services/studioWindow'
import { openSkinMapper } from './services/skinMapperWindow'
import { openPixelDoll } from './services/pixelDollWindow'
import { openProfile } from './services/profiles'
import { readLocalImage } from './services/messengerMedia'
import { prepareProfilePhoto, saveProfilePhoto } from './services/profilePhoto'
import UpdateCheck from './components/UpdateCheck'
import FeedbackDialog from './components/FeedbackDialog'
import WelcomeDialog from './components/WelcomeDialog'
import { bumpSocialUnread, useChatFocusReceiver } from './services/socialUnread'
import { useElsewhereLiveHost } from './services/elsewhereLive'
import { useElsewhereGroupHost } from './services/elsewhereGroupHost'
import { elsewhereMessageSummary } from './services/elsewhereMedia'
import { TOOLBAR_ACTION, openDefaultMail, type ToolbarRequest } from './services/toolbarActions'
import { accountKey, nudgeMessage, useCoreHistory } from './services/messagingCore'
import { cloud, lookupCloudProfiles, loadCloudFriends, watchCloudInbox, type CloudProfile } from './services/connectedClient'
import { useDiscordProfilePhotoBroker } from './services/discordConnection'
import XMessagesPanel from './components/XMessagesPanel'
import { desktopNotice, desktopNotificationsEnabled, notificationPreviewsEnabled, setDesktopNotifications, setNotificationPreviews } from './services/desktopNotifications'
import { getPinnedDiscordChannels, type GatewayMessage } from './services/discordBot'
import DiscordConnectionPanel from './components/DiscordConnectionPanel'
import SpotifyConnectionPanel from './components/SpotifyConnectionPanel'
import WebTreasuresPanel from './components/WebTreasuresPanel'
import InstagramInbox from './components/InstagramInbox'
import InstagramContactSettings, { INSTAGRAM_CONTACT_SETTINGS } from './components/InstagramContactSettings'
import './components/InstagramContactSettings.css'
import { listen } from '@tauri-apps/api/event'
import { INSTAGRAM_OPEN } from './services/instagramWindow'
import ConnectedMessenger from './components/ConnectedMessenger'
import { openTreasureVault } from './services/treasureVaultDb'
import { useLocalSession } from './services/localSession'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Fragment, useEffect, useState } from "react"
import { forwardElsewhereMessage, useElsewhereBridgeHost } from './services/elsewhereNativeBridge'
import { TOAST_OPEN, notificationStyle, setNotificationStyle, type NotificationStyle } from './services/toastWindow'
import { OPEN_TOOLBAR_CONTACT } from './components/ToolbarDialogs'
import { discordContactId } from './services/discordBot'
import { ELSEWHERE_BUDDY_PREFIX } from './services/connectedClient'
import { getSocialAccount, hasOldSocialConnections, moveOldSocialConnections, restoreMainAccount, watchSocialAccount } from './services/mainAccount'
import Classic from "./App"
import DeadSignal from "./skins/dead-signal/DeadSignal"
import "./SkinHost.css"
import {
  configureMainWindowForSkin,
  reportNativeError,
} from "./services/nativeWindows"

type Skin = "classic" | "dead-signal"

const STORAGE_KEY = "elsewhere.messenger.skin"

function readSkin(): Skin {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dead-signal"
      ? "dead-signal"
      : "classic"
  } catch {
    return "classic"
  }
}

export default function SkinHost() {
  useDiscordProfilePhotoBroker()
  const [authReady, setAuthReady] = useState(false)
  const [socialAccount, setSocialAccount] = useState(getSocialAccount)
  useEffect(() => {
    const stop = watchSocialAccount(() => setSocialAccount(getSocialAccount()))
    void restoreMainAccount().catch(console.error).finally(() => setAuthReady(true))
    return stop
  }, [])
  useEffect(() => {
    const adopt = () => void (async () => {
      if (!getSocialAccount()) { window.alert('Sign in to your Elsewhere account first.'); return }
      if (!await hasOldSocialConnections()) { window.alert('There are no older saved connections on this PC.'); return }
      if (!window.confirm('Move the Discord and Instagram connections saved on this PC before accounts existed into the account you’re signed in to? Other accounts won’t see them.')) return
      const moved = await moveOldSocialConnections()
      window.alert(moved.length ? 'Moved. Elsewhere will reload to connect them.' : 'This account already had its own connections, so nothing was replaced. The older copies were removed.')
      window.location.reload()
    })().catch(error => window.alert(error instanceof Error ? error.message : String(error)))
    window.addEventListener('elsewhere:social:adopt', adopt)
    let disposed = false
    let stopListen: (() => void) | undefined
    if (isTauri()) void listen('elsewhere:social:adopt', adopt).then(fn => { if (disposed) fn(); else stopListen = fn }).catch(console.error)
    return () => { disposed = true; stopListen?.(); window.removeEventListener('elsewhere:social:adopt', adopt) }
  }, [])
  useEffect(()=>{
    let disposed=false
    let stop:undefined|(()=>void)
    const open=()=>window.dispatchEvent(new Event('elsewhere:instagram:manage'))
    window.addEventListener(INSTAGRAM_OPEN,open)
    if(isTauri()){
      void listen(INSTAGRAM_OPEN,open).then(unlisten=>{
        if(disposed)unlisten()
        else stop=unlisten
      }).catch(console.error)
    }
    return ()=>{disposed=true;window.removeEventListener(INSTAGRAM_OPEN,open);stop?.()}
  },[])
  const [xOpen, setXOpen] = useState(false)
  useEffect(() => {
    const open = () => setXOpen(true)
    window.addEventListener('elsewhere:x:open', open)
    let stop: (() => void) | undefined
    let disposed = false
    if (isTauri()) void listen('elsewhere:x:open', open)
      .then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { disposed = true; stop?.(); window.removeEventListener('elsewhere:x:open', open) }
  }, [])
  useEffect(() => {
    if (!isTauri()) return
    let stop: (() => void) | undefined
    let disposed = false
    void listen<string>(TOAST_OPEN, ({ payload }) => {
      void getCurrentWindow().unminimize().then(() => getCurrentWindow().setFocus()).catch(console.error)
      if (payload) window.dispatchEvent(new CustomEvent(OPEN_TOOLBAR_CONTACT, { detail: payload }))
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { disposed = true; stop?.() }
  }, [])
  const [popupStyle, setPopupStyle] = useState<NotificationStyle>(notificationStyle)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(desktopNotificationsEnabled)
  const [notificationStatus, setNotificationStatus] = useState('')
  const [notificationPreviews, setPreviews] = useState(notificationPreviewsEnabled)
  useEffect(() => {
    const open = () => setNotificationsOpen(true)
    window.addEventListener('elsewhere:notifications:open', open)
    let disposed = false
    let stop: (() => void) | undefined
    let stopOpen: (() => void) | undefined
    if (isTauri()) void listen('elsewhere:notifications:open', open)
      .then(unlisten => { if (disposed) unlisten(); else stopOpen = unlisten }).catch(console.error)
    if (isTauri()) void listen<GatewayMessage>('elsewhere:discord:gateway-message', ({ payload }) => {
      const message = payload.message
      if (payload.kind === 'MESSAGE_CREATE' && message?.author && !message.author.bot &&
        getPinnedDiscordChannels().some(channel => channel.id === message.channel_id)) {
        bumpSocialUnread(discordContactId(message.channel_id))
        void desktopNotice('discord', {
          contactId: discordContactId(message.channel_id),
          sender: message.author.global_name || message.author.username,
          preview: message.content || (message.attachments?.length ? 'Sent an attachment' : undefined),
        }).catch(console.error)
      }
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { disposed = true; stop?.(); stopOpen?.(); window.removeEventListener('elsewhere:notifications:open', open) }
  }, [])
  useEffect(() => {
    if (!cloud) return
    let current = ''
    let stopInbox: (() => void) | undefined
    let disposed = false
    const bind = (next: string) => {
      if (disposed || next === current) return
      current = next
      setCloudUserId(next)
      setNudge(previous => previous?.localOwner ? previous : undefined)
      stopInbox?.()
      stopInbox = next ? watchCloudInbox(next, row => {
        forwardElsewhereMessage(row)
        if (row.sender_id !== next) bumpSocialUnread(ELSEWHERE_BUDDY_PREFIX + row.sender_id)
        const previews = notificationPreviewsEnabled()
        if (!desktopNotificationsEnabled() && row.kind !== 'nudge') return
        if (!previews && row.kind !== 'nudge') {
          void desktopNotice('elsewhere').catch(console.error)
          return
        }
        void lookupCloudProfiles([row.sender_id]).catch(() => []).then(([sender]) => {
          if (disposed || current !== next) return
          const username = sender?.handle || 'An Elsewhere friend'
          const preview = row.kind === 'nudge' ? nudgeMessage(username) : elsewhereMessageSummary(row)
          if (row.kind === 'nudge') setNudge({ id: row.id, text: preview })
          if (desktopNotificationsEnabled()) void desktopNotice('elsewhere', {
            contactId: ELSEWHERE_BUDDY_PREFIX + row.sender_id,
            sender: sender?.display_name || sender?.handle,
            preview,
          }).catch(console.error)
        })
      }) : undefined
    }
    const client = cloud
    const { data } = client.auth.onAuthStateChange((_event, session) => bind(session?.user.email_confirmed_at ? session.user.id : ''))
    return () => { disposed = true; data.subscription.unsubscribe(); stopInbox?.() }
  }, [])
  const [discordOpen, setDiscordOpen] = useState(false)
  const [spotifyOpen, setSpotifyOpen] = useState(false)
  useEffect(() => {
    const open = () => setSpotifyOpen(true)
    window.addEventListener('elsewhere:spotify:open', open)
    return () => window.removeEventListener('elsewhere:spotify:open', open)
  }, [])
  useEffect(() => {
    const open = () => setDiscordOpen(true)
    window.addEventListener('elsewhere:discord:open', open)
    let disposed = false
    let stop: undefined | (() => void)
    if (isTauri()) void listen('elsewhere:discord:open', open).then(fn => { if(disposed) fn(); else stop = fn }).catch(console.error)
    return () => { disposed = true; stop?.(); window.removeEventListener('elsewhere:discord:open', open) }
  }, [])
  const [treasuresOpen, setTreasuresOpen] = useState(false)
  // Per-contact Instagram indicator color: opened by right-clicking an Instagram contact.
  const [instagramSettingsFor,setInstagramSettingsFor]=useState<string|null>(null)
  useEffect(()=>{const pick=(detail:unknown)=>{const id=(detail as {threadId?:unknown}|null)?.threadId;if(typeof id==='string'&&id)setInstagramSettingsFor(id)};const open=(event:Event)=>pick((event as CustomEvent).detail);window.addEventListener(INSTAGRAM_CONTACT_SETTINGS,open);let stop:(()=>void)|undefined;let disposed=false;if(isTauri())void listen(INSTAGRAM_CONTACT_SETTINGS,event=>pick(event.payload)).then(fn=>{if(disposed)fn();else stop=fn}).catch(()=>{});return()=>{disposed=true;stop?.();window.removeEventListener(INSTAGRAM_CONTACT_SETTINGS,open)}},[])
  useEffect(() => {
    const open = () => {
      setTreasuresOpen(true)
      if(isTauri()) void getCurrentWindow().setFocus().catch(console.error)
    }
    window.addEventListener('elsewhere:web-treasures:open', open)
    let disposed=false
    let stop:undefined|(()=>void)
    if(isTauri())void listen('elsewhere:web-treasures:open',open).then(unlisten=>{
      if(disposed)unlisten();else stop=unlisten
    }).catch(console.error)
    return () => {disposed=true;stop?.();window.removeEventListener('elsewhere:web-treasures:open', open)}
  }, [])
  const [accountPanel, setAccountPanel] = useState<{ mode: 'accounts' | 'new-dm' | 'add-contact'; personId?: string; resetPassword?: boolean }>()
  const [toolbarRequest, setToolbarRequest] = useState<ToolbarRequest>()
  const [cloudUserId, setCloudUserId] = useState('')
  const [cloudContacts, setCloudContacts] = useState<{ userId: string; profiles: CloudProfile[] }>()
  const buddies = cloudContacts?.userId === cloudUserId ? cloudContacts.profiles : undefined
  useElsewhereBridgeHost(cloudUserId)
  useElsewhereGroupHost(cloudUserId, buddies)
  useEffect(() => {
    if (!cloudUserId) return
    let current = true
    async function refresh() {
      try {
        const following = await loadCloudFriends()
        const ids = following.filter(row => row.accepted_at)
          .map(row => row.user_a === cloudUserId ? row.user_b : row.user_a)
        const profiles = await lookupCloudProfiles(ids)
        if (current) setCloudContacts({ userId: cloudUserId, profiles })
      } catch (cause) {
        if (current) console.error('Elsewhere contacts:', cause)
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => { current = false; window.clearInterval(timer) }
  }, [cloudUserId, accountPanel])
  const [nudge, setNudge] = useState<{ text: string; id: string; localOwner?: string }>()
  function openInbox(mode: 'accounts' | 'new-dm' | 'add-contact', personId?: string, resetPassword?: boolean) {
    setToolbarRequest(undefined)
    setAccountPanel({ mode, personId, resetPassword })
  }
  useEffect(() => {
    const handle = (request: ToolbarRequest) => {
      if (request.kind === 'mail') {
        void openDefaultMail().catch(() => window.alert('Could not open your default email app. Check your Windows default apps.'))
        return
      }
      if (request.kind === 'accounts' || request.kind === 'add-contact') openInbox(request.kind, request.personId, request.purpose === 'reset-password')
      else if (request.kind === 'new-dm' && request.service === 'elsewhere') openInbox('new-dm')
      else {
        if (request.kind === 'skinmapper') { void openSkinMapper().catch(console.error); return }
        if (request.kind === 'pixel-doll') { void openPixelDoll().catch(console.error); return }
        if (request.kind === 'profile') { void openProfile(request.handle || 'me', Boolean(request.edit)).catch(console.error); return }
        if (request.kind === 'open-contact' && request.personId) { window.dispatchEvent(new CustomEvent(OPEN_TOOLBAR_CONTACT, { detail: request.personId })); return }
        if (request.kind === 'photo') {
          // Studio has its own window.
          void openStudio({ photo: request.mediaId, photos: request.mediaIds, layout: request.layout, source: request.sourceId, sourceName: request.sourceName }).catch(console.error)
          return
        }
        setAccountPanel(undefined)
        setToolbarRequest(request)
      }
    }
    const local = (event: Event) => handle((event as CustomEvent<ToolbarRequest>).detail)
    const open = () => openInbox('accounts')
    window.addEventListener(TOOLBAR_ACTION, local)
    window.addEventListener('elsewhere:open-connected', open)
    let disposed = false
    let stop: (() => void) | undefined
    if (isTauri()) void listen<ToolbarRequest>(TOOLBAR_ACTION, ({ payload }) => {
      handle(payload)
      void getCurrentWindow().unminimize().then(() => getCurrentWindow().setFocus()).catch(console.error)
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    void openTreasureVault().then(db => db.close()).catch(error => console.error('Treasure vault:', error))
    return () => {
      disposed = true
      stop?.()
      window.removeEventListener(TOOLBAR_ACTION, local)
      window.removeEventListener('elsewhere:open-connected', open)
    }
  }, [])
  useChatFocusReceiver()
  const [skin, setSkin] = useState<Skin>(readSkin)
  const session = useLocalSession()
  const owner = session.signedIn ? session.profile?.name : undefined
  useElsewhereLiveHost(cloudUserId, (buddies || []).map(profile => profile.id), session.signedIn ? session.profile?.presence : undefined)
  const localHistory = useCoreHistory(accountKey(owner))
  // Studio → Finish → Use as Elsewhere Picture.
  useEffect(() => {
    const apply = (mediaId: string) => {
      const key = accountKey(owner)
      if (!key || !mediaId) return
      void readLocalImage(mediaId).then(async blob => {
        if (!blob) return
        saveProfilePhoto(key, await prepareProfilePhoto(new File([blob], 'elsewhere-picture.png', { type: blob.type })))
      }).catch(console.error)
    }
    const local = (event: Event) => apply((event as CustomEvent<{ mediaId: string }>).detail?.mediaId)
    window.addEventListener('elsewhere:studio:profile-photo', local)
    let stop: (() => void) | undefined
    let disposed = false
    if (isTauri()) void listen<{ mediaId: string }>('elsewhere:studio:profile-photo', ({ payload }) => apply(payload?.mediaId))
      .then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { disposed = true; stop?.(); window.removeEventListener('elsewhere:studio:profile-photo', local) }
  }, [owner])
  const newestNudge = Object.values(localHistory).flat().reduce<(typeof localHistory)[string][number] | undefined>(
    (latest, message) => message.kind === 'nudge' && !message.own && !message.read &&
      (!latest || message.createdAt > latest.createdAt) ? message : latest, undefined,
  )
  const localNudgeId = newestNudge?.id
  const localNudgeText = newestNudge?.text
  useEffect(() => {
    if (localNudgeId && localNudgeText) setNudge({ text: localNudgeText, id: localNudgeId, localOwner: owner })
  }, [localNudgeId, localNudgeText, owner])

  const [loaded, setLoaded] = useState<Record<Skin, boolean>>(
    () => ({
      classic: skin === "classic",
      "dead-signal": skin === "dead-signal",
    })
  )

  useEffect(() => {
    void configureMainWindowForSkin(
      skin,
      !session.signedIn
    ).catch(async (error) => {
      // Never leave an unusable hidden window
      // if configuration fails.

      if (isTauri()) {
        await getCurrentWindow()
          .show()
          .catch(console.error)
      }

      reportNativeError(error)
    })
  }, [skin, session.signedIn])

  function changeSkin(next: Skin) {
    setLoaded((previous) => ({
      ...previous,
      [next]: true,
    }))

    setSkin(next)

    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Switching remains available without persistent storage.
    }
  }

  return (
    <>
      {socialAccount && <Fragment key={socialAccount}>
        <InstagramInbox integrated />
        <XMessagesPanel open={xOpen} close={() => setXOpen(false)} />
        <DiscordConnectionPanel open={discordOpen} onClose={() => setDiscordOpen(false)} />
        <SpotifyConnectionPanel open={spotifyOpen} onClose={() => setSpotifyOpen(false)} />
      </Fragment>}
      {notificationsOpen && <div className="ew-ig-backdrop">
        <section className="ew-ig-connection" role="dialog" aria-modal="true" aria-label="Desktop notifications">
          <header><strong>Desktop notifications</strong><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close">×</button></header>
          <label><input type="checkbox" checked={notificationsEnabled} onChange={event => {
            setDesktopNotifications(event.target.checked)
            setNotificationsEnabled(event.target.checked)
            setNotificationStatus('')
          }} /> Show desktop notifications for new messages</label>
          <label><input type="checkbox" checked={notificationPreviews} onChange={event => {
            setNotificationPreviews(event.target.checked)
            setPreviews(event.target.checked)
          }} /> Show sender and message preview</label>
          <fieldset className="ew-notification-style">
            <legend>Pop-up style</legend>
            <label><input type="radio" name="ew-popup-style" checked={popupStyle === 'elsewhere'} onChange={() => {
              setNotificationStyle('elsewhere'); setPopupStyle('elsewhere')
            }} /> Elsewhere pop-up (matches your skin)</label>
            <label><input type="radio" name="ew-popup-style" checked={popupStyle === 'windows'} onChange={() => {
              setNotificationStyle('windows'); setPopupStyle('windows')
            }} /> Windows notification</label>
          </fieldset>
          <button type="button" disabled={!notificationsEnabled || !isTauri()} onClick={() => {
            void desktopNotice('test', { sender: 'Elsewhere Messenger', preview: 'Your notification preview is enabled.' }).then(() => setNotificationStatus('Test sent.')).catch(error => setNotificationStatus(String(error)))
          }}>Send test notification</button>
          {notificationStatus && <p role="status">{notificationStatus}</p>}
        </section>
      </div>}
      {instagramSettingsFor && <InstagramContactSettings key={instagramSettingsFor} threadId={instagramSettingsFor} onClose={()=>setInstagramSettingsFor(null)} />}
      <UpdateCheck skin={skin} />
      <FeedbackDialog skin={skin} />
      <WelcomeDialog skin={skin} signedIn={Boolean(socialAccount && session.signedIn)} />
      {treasuresOpen && <WebTreasuresPanel skin={skin} onClose={() => setTreasuresOpen(false)} />}
      {accountPanel && <ConnectedMessenger key={accountPanel.resetPassword ? 'reset' : 'accounts'} skin={skin} mode={accountPanel.mode} personId={accountPanel.personId} resetPassword={accountPanel.resetPassword} onClose={() => setAccountPanel(undefined)} />}
      {toolbarRequest && <ToolbarDialogs key={toolbarRequest.kind + toolbarRequest.service}
        request={toolbarRequest} skin={skin} onClose={() => setToolbarRequest(undefined)} onElsewhere={() => openInbox('new-dm')} />}
      {nudge && (!nudge.localOwner || nudge.localOwner === owner) && <div key={nudge.id} className="ew-nudge-banner" role="status">
        {nudge.text}<button type="button" onClick={() => setNudge(undefined)} aria-label="Dismiss nudge">×</button>
      </div>}
      {authReady && loaded.classic && (
        <div
          style={{
            display: skin === "classic" ? "contents" : "none",
          }}
        >
          <Classic
            active={skin === "classic"}
            onChangeSkin={changeSkin}
            buddies={buddies}
          />
        </div>
      )}

      {authReady && loaded["dead-signal"] && (
        <div
          style={{
            display: skin === "dead-signal" ? "contents" : "none",
          }}
        >
          <DeadSignal
            active={skin === "dead-signal"}
            onChangeSkin={changeSkin}
            buddies={buddies}
          />
        </div>
      )}

    </>
  )
}