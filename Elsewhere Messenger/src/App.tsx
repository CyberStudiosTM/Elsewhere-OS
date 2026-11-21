import { ELSEWHERE_BUDDY_PREFIX, type CloudProfile } from './services/connectedClient'
import { OPEN_TOOLBAR_CONTACT } from './components/ToolbarDialogs'
import { NUDGE_LOCAL_ONLY, openCamera, toolbarAction } from './services/toolbarActions'
import OwnProfilePhoto from './components/OwnProfilePhoto'
import { useDiscordProfilePhoto } from './services/discordConnection'
import InstagramAvatar from './components/InstagramAvatar'
import SpotifyProfileStatus from './components/SpotifyProfileStatus'
import DiscordMessageContent from './components/DiscordMessageContent'
import { usePinnedDiscordChannels, useDiscordMessages, discordChannelId, discordContactId, sendDiscordMessage } from './services/discordBot'
import SocialServiceFilter, { matchesSocialService, type SocialService } from './components/SocialServiceFilter'
import { useInstagramAppearance,contactAppearance,instagramRecentGroup,sortInstagramThreads } from './services/instagramContactPreferences'
import { INSTAGRAM_WINDOW_NOTICE, instagramLastPreview, instagramReplyWindowClosed, useNativeInstagram, instagramThreadId, instagramContactId, instagramContactName, instagramProfilePicture } from './services/instagramNativeBridge'
import InstagramMessageContent from './components/InstagramMessageContent'
import ExpressionLibraries from './components/ExpressionLibraries'
import {
  contactDirectory,
  accountKey,
  appendMessage,
  appendNudge,
  useCoreHistory,
  useConversationDraft,
  useConversationFormat,
  useConversationRead,
  unreadCount,
  formatStyle,
  type ContactGroup,
  type FormatToggle,
} from './services/messagingCore'

import MediaPicker from './components/MediaPicker'
import MediaAttachment from './components/MediaAttachment'

import {
  mediaLabel,
  type MediaRef,
  type MediaPickerState,
} from './services/messengerMedia'

import {
  useLocalSession,
  getLocalSession,
  setLocalSessionOptions,
  updateLocalPresence,
} from './services/localSession'
import { openSignupPage, signInMain, signOutMain } from './services/mainAccount'
import { elsewherePersonId, useElsewhereChat } from './services/elsewhereNativeBridge'
import { lastSavedAccountEmail } from './services/connectedClient'

import ClassicPresenceSelect from './components/ClassicPresenceSelect'
import {
  AnchoredEmoticonPicker,
  renderClassicText,
} from './components/SharedEmoticons'


import { useEffect, useRef, useState, type FormEvent } from 'react'
import classicStyles from './skins/classic/ClassicMessenger.css?inline'
import ClassicMenuBar, {
  type EditAction,
} from './components/ClassicMenuBar'
import {
  useSoundPreferences,
  playTypingSound,
  prepareNotificationAudio,
  playNotificationSound,
} from './services/classicSounds'

import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  emitTo,
  type UnlistenFn,
} from '@tauri-apps/api/event'
import {
  isNativeClassicChat,
  canOpenNativeChat,
  openNativeClassicChat,
  closeNativeClassicChat,
  isNativeClassicLogin,

  closeNativeClassicLogin,
  reportNativeError,
} from './services/nativeWindows'

type Status = 'Online' | 'Away' | 'Busy' | 'Invisible'

function WindowTitle({
  title,
  onClose,
  loginMode = false,
}: {
  title: string
  onClose?: () => void
  loginMode?: boolean
}) {
  const nativeChat = isNativeClassicChat()
  const nativeLogin = isNativeClassicLogin()
  const nativeBuddy = canOpenNativeChat() && !loginMode
  const nativeWindowControls = nativeChat || nativeLogin || canOpenNativeChat()

  function minimize() {
    void getCurrentWindow()
      .minimize()
      .catch(reportNativeError)
  }

  function maximize() {
    void getCurrentWindow()
      .toggleMaximize()
      .catch(reportNativeError)
  }

  function close() {
    if (nativeWindowControls) {
      void getCurrentWindow()
        .close()
        .catch(reportNativeError)

      return
    }

    onClose?.()
  }

  return (
    <header
      className="em-titlebar"
      onMouseDown={(event) => {
        if (
          !nativeWindowControls ||
          event.button !== 0
        ) return

        if (
          event.target instanceof Element &&
          event.target.closest('button')
        ) return

        const nativeWindow = getCurrentWindow()

        if (event.detail === 2 && (nativeChat || nativeBuddy)) {
          void nativeWindow
            .toggleMaximize()
            .catch(reportNativeError)
        } else {
          void nativeWindow
            .startDragging()
            .catch(reportNativeError)
        }
      }}
    >
      <span
        className="em-brand-icon"
        aria-hidden="true"
      />

      <span className="em-title">{title}{title === 'Elsewhere Messenger' && <span className="ew-beta-badge">Beta</span>}</span>

      <div className="em-window-controls">
        <button
          type="button"
          disabled={!nativeWindowControls}
          title="Minimize"
          aria-label="Minimize window"
          onClick={minimize}
        >
          _
        </button>

        <button
          type="button"
          disabled={!nativeChat && !nativeBuddy}
          title="Maximize or restore"
          aria-label="Maximize or restore window"
          onClick={maximize}
        >
          {'\u25A1'}
        </button>

        <button
          type="button"
          className="em-close"
          disabled={!nativeWindowControls && !onClose}
          onClick={close}
          aria-label={`Close ${title}`}
        >
          {'\u00D7'}
        </button>
      </div>
    </header>
  )
}



type ClassicLoginProfile = {
  name: string
  status: Status
}

const LOGIN_EVENTS = {
  request: 'elsewhere:login:request',
  profile: 'elsewhere:login:profile',
  submit: 'elsewhere:login:submit',
} as const

type ClassicSnapshot = {
  owner: string | null
  name: string
  status: Status
  activeId: string | null
}

const CLASSIC_EVENTS = {
  request: 'elsewhere:classic:request',
  snapshot: 'elsewhere:classic:snapshot',
} as const

function App({
  onChangeSkin,
  activeSkin,
  buddies,
}: {
  onChangeSkin?: (skin: "classic" | "dead-signal") => void
  buddies?: CloudProfile[]
  activeSkin: boolean
}) {
  const session = useLocalSession()
  const [name, setName] = useState('cyber')
  const [loginEmail, setLoginEmail] = useState(lastSavedAccountEmail)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const [nativeOwner, setNativeOwner] =
    useState<string | null>(null)
  const [status, setStatus] = useState<Status>('Online')
  const [showLogin, setShowLogin] = useState(true)
  const [showNotice, setShowNotice] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const { preferences, update: updateSounds } =
    useSoundPreferences('classic')

  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const [emoticonAnchor, setEmoticonAnchor] =
    useState<HTMLButtonElement | null>(null)

  function openEmoticons(button: HTMLButtonElement) {
    setEmoticonAnchor((previous) =>
      previous === button ? null : button
    )
  }

  useEffect(() => {
    setEmoticonAnchor(null)
  }, [activeId])

  const [mediaPicker, setMediaPicker] =
    useState<MediaPickerState | null>(null)

  useEffect(() => {
    setMediaPicker(null)
  }, [activeId])

  function openMedia(
    anchor: HTMLButtonElement,
    tab: 'local' | 'gifs' | 'stickers'
  ) {
    setEmoticonAnchor(null)

    setMediaPicker((previous) =>
      previous?.anchor === anchor
        ? null
        : { anchor, tab }
    )
  }

  const [expanded, setExpanded] = useState<Record<ContactGroup, boolean>>({
    Buddies: true,
    'Other Contacts': true,
    'Instagram Chats': true,
  })


  const nativeChat = isNativeClassicChat()
  const nativeMain = canOpenNativeChat()
  const nativeLogin = isNativeClassicLogin()

  const loginMain = nativeMain && !session.signedIn

  const coreOwner = nativeMain
    ? accountKey(
        session.signedIn
          ? session.profile?.name
          : null
      )
    : nativeChat
      ? activeId
        ? nativeOwner
        : null
      : nativeLogin
        ? null
        : accountKey(name)

  const [socialService, setSocialService] = useState<SocialService>('all')
  const appearance=useInstagramAppearance()
  const ig = useNativeInstagram(activeId)
  const igThreadId = instagramThreadId(activeId || '')
  const discordId = discordChannelId(activeId)
  // Elsewhere friends chat in the native chat window, which reaches the account through main.
  const cloudPerson = nativeMain ? null : elsewherePersonId(activeId)
  const cloudChat = useElsewhereChat(cloudPerson)
  const discordPhoto = useDiscordProfilePhoto()
  const headerService = socialService === 'all' ? 'elsewhere' : socialService
  const chatService = igThreadId ? 'instagram' : discordId ? 'discord' : 'elsewhere'
  const remotePhoto = (service: string) => service === 'instagram' ? ig.accountPhoto : service === 'discord' ? discordPhoto : undefined
  const pinnedDiscord = usePinnedDiscordChannels()
  const discordChat = useDiscordMessages(discordId)
  const [discordReply,setDiscordReply]=useState<{id:string;summary:string}|null>(null)
  useEffect(()=>setDiscordReply(null),[discordId])
  const messages = useCoreHistory(coreOwner)

  const contacts = [
    ...contactDirectory(messages, coreOwner).map(contact => ({
      ...contact, online: contact.status !== 'offline', avatarUrl: undefined as string|undefined,
    })),
    ...(buddies || []).map(profile => ({
      id: ELSEWHERE_BUDDY_PREFIX + profile.id, name: '@' + profile.handle,
      group: 'Buddies' as const, status: 'offline' as const, avatar: 'red-sunset-palm',
      avatarUrl: undefined, note: '', online: false,
    })),
    ...sortInstagramThreads(ig.threads, appearance).map(thread => ({
      id: instagramContactId(thread.id),
      name: instagramContactName(thread,ig.account),
      group: instagramRecentGroup(thread, appearance),
      status: 'offline' as const,
      avatar: 'red-sunset-palm',
      avatarUrl: instagramProfilePicture(thread,ig.account),
      note: '',
      preview: instagramLastPreview(thread, ig.account),
      online: false,
    })),
    ...pinnedDiscord.map(channel => ({
      id: discordContactId(channel.id),
      name: `#${channel.name}`, group: 'Other Contacts' as const,
      status: 'offline' as const, avatar: 'red-sunset-palm', avatarUrl: undefined as string|undefined,
      note: ` · ${channel.guildName}`, online: false,
    })),
  ]

  const visibleContacts = contacts.filter(contact => matchesSocialService(contact.id, socialService))

  const activeContact = contacts.find(
    contact => contact.id === activeId
  ) ?? (cloudPerson && cloudChat.profile ? {
    id: activeId!, name: '@' + cloudChat.profile.handle, group: 'Buddies' as const,
    status: 'offline' as const, avatar: 'red-sunset-palm', avatarUrl: undefined, note: '', online: false,
  } : undefined)

  const activeMessages =
    activeId ? (messages[activeId] ?? []) : []

  const [draft, setDraft] =
    useConversationDraft(coreOwner, activeId)
  const [igReply, setIgReply] = useState<{ id: string; summary: string } | null>(null)
  useEffect(() => { setIgReply(null) }, [activeId])

  const [formatting, setFormatting] =
    useConversationFormat(coreOwner, activeId)

  useConversationRead(
    coreOwner,
    activeId,
    messages,
    activeSkin && !nativeMain && !nativeLogin,
  )

  const leavingSession = useRef(false)

  useEffect(() => {
    if (!nativeMain) return

    setName(session.profile?.name ?? 'cyber')
    setStatus(session.profile?.presence ?? 'Online')
  }, [nativeMain, session.profile])

  async function leaveSession(
    switchAccount = false
  ) {
    if (!nativeMain || leavingSession.current) return

    leavingSession.current = true

    try {
      await closeNativeClassicLogin()
      await closeNativeClassicChat()

      setEmoticonAnchor(null)

      await signOutMain(switchAccount)
    } catch (error) {
      reportNativeError(error)
    } finally {
      leavingSession.current = false
    }
  }
  const loginSubmitting = useRef(false)

  const [loginReady, setLoginReady] =
    useState(!nativeLogin)

  const sendingRef = useRef(false)

  const snapshotRef = useRef<ClassicSnapshot>({
    owner: coreOwner,
    name,
    status,
    activeId,
  })

  // Publish the authoritative Classic state.

  useEffect(() => {
    if (!nativeMain) return

    const snapshot: ClassicSnapshot = {
      owner: coreOwner,
      name: session.profile?.name ?? name,
      status,
      activeId,
    }

    snapshotRef.current = snapshot

    void emitTo(
      'classic-chat',
      CLASSIC_EVENTS.snapshot,
      snapshot
    ).catch(console.error)
  }, [nativeMain, name, status, activeId, coreOwner, session.profile])

  // Install role-specific event listeners.

  useEffect(() => {
    if ((!nativeMain && !nativeChat) || (nativeMain && !activeSkin)) return

    let disposed = false
    let retryTimer: number | undefined
    let receivedSnapshot = false

    const removers: UnlistenFn[] = []
    const currentWindow = getCurrentWindow()

    async function keep(
      listener: Promise<UnlistenFn>
    ) {
      const remove = await listener

      if (disposed) {
        remove()
      } else {
        removers.push(remove)
      }
    }

    function requestSnapshot() {
      if (disposed || receivedSnapshot) return

      void emitTo(
        'main',
        CLASSIC_EVENTS.request
      ).catch(console.error)
    }

    async function connect() {
      if (nativeMain) {
        await keep(
          currentWindow.listen(
            CLASSIC_EVENTS.request,
            () => {
              if (disposed) return

              void emitTo(
                'classic-chat',
                CLASSIC_EVENTS.snapshot,
                {
                  ...snapshotRef.current,
                  owner: accountKey(
                    getLocalSession().signedIn
                      ? getLocalSession().profile?.name
                      : null
                  ),
                  name:
                    getLocalSession().profile?.name ??
                    snapshotRef.current.name,
                  status:
                    getLocalSession().profile?.presence ??
                    snapshotRef.current.status,
                }
              ).catch(console.error)
            }
          )
        )
      }

      if (nativeChat) {
        await keep(
          currentWindow.listen<ClassicSnapshot>(
            CLASSIC_EVENTS.snapshot,
            ({ payload }) => {
              if (disposed) return

              receivedSnapshot = true

              if (retryTimer !== undefined) {
                window.clearInterval(retryTimer)
              }

              setName(payload.name)
              setStatus(payload.status)
              setNativeOwner(payload.owner ?? null)
              setActiveId(payload.activeId)
            }
          )
        )

        if (disposed) return

        requestSnapshot()

        if (!receivedSnapshot) {
          retryTimer = window.setInterval(
            requestSnapshot,
            500
          )
        }
      }
    }

    void connect().catch((error) => {
      if (!disposed) reportNativeError(error)
    })

    return () => {
      disposed = true

      if (retryTimer !== undefined) {
        window.clearInterval(retryTimer)
      }

      removers.forEach((remove) => remove())
    }
  }, [nativeMain, nativeChat, activeSkin])

  // Update the real Windows taskbar title.

  const contactName = activeContact?.name

  useEffect(() => {
    if (!nativeChat || !contactName) return

    void getCurrentWindow()
      .setTitle(`${contactName} - Conversation`)
      .catch(reportNativeError)
  }, [nativeChat, contactName])

  // Close Classic's conversation before switching skins.

  async function switchToDeadSignal() {
    try {
      await closeNativeClassicLogin()
      await closeNativeClassicChat()
      onChangeSkin?.('dead-signal')
    } catch (error) {
      reportNativeError(error)
    }
  }

  useEffect(() => {
    if ((!nativeMain && !nativeLogin) || (nativeMain && !activeSkin)) return

    let disposed = false
    let receivedProfile = false
    let retryTimer: number | undefined

    const removers: UnlistenFn[] = []
    const currentWindow = getCurrentWindow()

    async function keep(
      listener: Promise<UnlistenFn>
    ) {
      const remove = await listener

      if (disposed) {
        remove()
      } else {
        removers.push(remove)
      }
    }

    function requestProfile() {
      if (disposed || receivedProfile) return

      void emitTo(
        'main',
        LOGIN_EVENTS.request
      ).catch(console.error)
    }

    async function connect() {
      if (nativeMain) {
        await keep(
          currentWindow.listen(
            LOGIN_EVENTS.request,
            () => {
              if (disposed) return

              const profile: ClassicLoginProfile = {
                name: snapshotRef.current.name,
                status: snapshotRef.current.status,
              }

              void emitTo(
                'classic-login',
                LOGIN_EVENTS.profile,
                profile
              ).catch(console.error)
            }
          )
        )

        if (disposed) return

        await keep(
          currentWindow.listen<ClassicLoginProfile>(
            LOGIN_EVENTS.submit,
            ({ payload }) => {
              if (disposed) return

              if (
                typeof payload.name !== 'string' ||
                !payload.name.trim() ||
                payload.name.length > 40
              ) return

              if (
                !['Online', 'Away', 'Busy', 'Invisible']
                  .includes(payload.status)
              ) return

              setName(payload.name)
              setStatus(payload.status)

              void closeNativeClassicLogin()
                .catch(reportNativeError)
            }
          )
        )

      }

      if (nativeLogin) {
        await keep(
          currentWindow.listen<ClassicLoginProfile>(
            LOGIN_EVENTS.profile,
            ({ payload }) => {
              if (disposed || receivedProfile) return

              receivedProfile = true

              if (retryTimer !== undefined) {
                window.clearInterval(retryTimer)
              }

              setName(payload.name)
              setStatus(payload.status)
              setLoginReady(true)
            }
          )
        )

        if (disposed) return

        requestProfile()

        if (!receivedProfile) {
          retryTimer = window.setInterval(
            requestProfile,
            500
          )
        }
      }
    }

    void connect().catch((error) => {
      if (!disposed) reportNativeError(error)
    })

    return () => {
      disposed = true

      if (retryTimer !== undefined) {
        window.clearInterval(retryTimer)
      }

      removers.forEach((remove) => remove())
    }
  }, [nativeMain, nativeLogin, activeSkin])

  function openLogin() {
    if (nativeMain) {
      void leaveSession(true)
    } else {
      setShowLogin(true)
    }
  }

  const MENU_EVENT = 'elsewhere:classic:menu-command'

  useEffect(() => {
    if (!nativeMain) return

    let disposed = false
    let remove: UnlistenFn | undefined

    if (!activeSkin) return

    void getCurrentWindow().listen<string>(
      'elsewhere:classic:menu-command',
      ({ payload }) => {
        if (disposed) return

        if (payload === 'sign-in') {
          void leaveSession(true)
        }

        if (payload === 'sign-out') {
          void leaveSession(false)
        }

        if (payload === 'dead-signal') {
          void (async () => {
            try {
              await closeNativeClassicLogin()
              await closeNativeClassicChat()

              if (!disposed) {
                onChangeSkin?.('dead-signal')
              }
            } catch (error) {
              reportNativeError(error)
            }
          })()
        }
      }
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
      } else {
        remove = unlisten
      }
    }).catch(console.error)

    return () => {
      disposed = true
      remove?.()
    }
  }, [nativeMain, onChangeSkin, activeSkin])

  function requestMenuAction(
    action: 'sign-in' | 'sign-out' | 'dead-signal'
  ) {
    if (nativeChat) {
      void emitTo(
        'main',
        MENU_EVENT,
        action
      ).catch(reportNativeError)

      return
    }

    if (action === 'sign-out') {
      void leaveSession(false)
    } else if (action === 'sign-in') {
      openLogin()
    } else {
      void switchToDeadSignal()
    }
  }

  async function editConversation(
    action: EditAction
  ) {
    const input = composerRef.current

    if (!input) return

    const start = input.selectionStart
    const end = input.selectionEnd

    if (action === 'select-all') {
      input.focus()
      input.select()
      return
    }

    try {
      if (
        action === 'copy' ||
        action === 'cut'
      ) {
        const selected =
          input.value.slice(start, end)

        if (!selected) {
          input.focus()
          return
        }

        await navigator.clipboard.writeText(
          selected
        )

        if (action === 'cut') {
          setDraft(
            input.value.slice(0, start) +
            input.value.slice(end)
          )

          requestAnimationFrame(() => {
            input.focus()

            input.setSelectionRange(
              start,
              start
            )
          })
        }

        return
      }

      if (action === 'paste') {
        const text =
          await navigator.clipboard.readText()

        const position =
          start + text.length

        setDraft(
          input.value.slice(0, start) +
          text +
          input.value.slice(end)
        )

        requestAnimationFrame(() => {
          input.focus()

          input.setSelectionRange(
            position,
            position
          )
        })
      }
    } catch (error) {
      console.error(error)

      window.alert(
        'Clipboard access was unavailable. ' +
        'Try Ctrl+X, Ctrl+C or Ctrl+V ' +
        'directly in the message box.'
      )
    }
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loginMain) {
      if (loginBusy) return
      setLoginBusy(true)
      setLoginError('')
      void signInMain(loginEmail, loginPassword, status, session.remember)
        .then(() => setLoginPassword(''))
        .catch(error => setLoginError(error instanceof Error ? error.message : String(error)))
        .finally(() => setLoginBusy(false))

      return
    }

    if (nativeLogin) {
      if (!loginReady || loginSubmitting.current) return

      loginSubmitting.current = true

      const profile: ClassicLoginProfile = {
        name,
        status,
      }

      void emitTo(
        'main',
        LOGIN_EVENTS.submit,
        profile
      ).catch((error) => {
        loginSubmitting.current = false
        reportNativeError(error)
      })

      return
    }

    setShowLogin(false)
  }

  function openContact(id: string) {
    if (
      nativeMain &&
      !getLocalSession().signedIn
    ) return

    setActiveId(id)

    if (canOpenNativeChat()) {
      void openNativeClassicChat()
    }
  }

  useEffect(() => {
    if (!activeSkin || nativeChat || nativeLogin) return
    const open = (event: Event) => {
      const contact = (event as CustomEvent<string>).detail
      if (contact.startsWith('instagram:') || contact.startsWith('discord:') || contact.startsWith(ELSEWHERE_BUDDY_PREFIX)) openContact(contact)
    }
    window.addEventListener(OPEN_TOOLBAR_CONTACT, open)
    return () => window.removeEventListener(OPEN_TOOLBAR_CONTACT, open)
  }, [activeSkin, nativeChat, nativeLogin, nativeMain])

  const externalBuddy = (socialService === 'instagram' || socialService === 'discord') ||
    (socialService === 'all' && chatService !== 'elsewhere')
  function nudgeSelected() {
    if (cloudPerson) {
      void cloudChat.nudge().then(() => playNotificationSound('outgoing', preferences)).catch(reportNativeError)
      return
    }
    if (!coreOwner || !activeId || chatService !== 'elsewhere') return
    void appendNudge(coreOwner, activeId, session.profile?.name || name)
      .then(() => playNotificationSound('outgoing', preferences)).catch(reportNativeError)
  }

  function toggleFormatting(key: FormatToggle) {
    setFormatting((previous) => ({
      ...previous,
      [key]: !previous[key],
    }))
  }

function insertEmoticon(code: string) {
  setDraft((previous) => {
    const spacing =
      previous.length > 0 && !previous.endsWith(' ')
        ? ' '
        : ''

    return previous + spacing + code
  })

  setEmoticonAnchor(null)
  composerRef.current?.focus()
}

  async function sendMessage(
    event: FormEvent<HTMLFormElement> | null,
    media?: MediaRef
  ) {
    event?.preventDefault()

    if (
      !coreOwner ||
      !activeId ||
      sendingRef.current
    ) return

    const text = media ? mediaLabel(media) : draft.trim()
    if (!text) return
    if (cloudPerson) {
      if (media) { reportNativeError(new Error('Photos and files can’t be sent to Elsewhere friends yet.')); return }
      sendingRef.current = true
      setDraft(previous => previous === draft ? '' : previous)
      try {
        await cloudChat.send(text)
        playNotificationSound('outgoing', preferences)
      } catch (error) { setDraft(previous => previous || draft); reportNativeError(error) }
      finally { sendingRef.current = false }
      return
    }
    if (discordId) {
      if (media) { reportNativeError(new Error('Discord media uploads are not enabled in this build.')); return }
      sendingRef.current = true
      try {
        await sendDiscordMessage(discordId,text,discordReply?.id)
        setDiscordReply(null)
        setDraft(previous => previous === draft ? '' : previous)
      } catch(error) { reportNativeError(error) }
      finally {sendingRef.current=false}
      return
    }
    if (igThreadId) {
      if (media) {
        sendingRef.current = true
        try { await ig.sendMedia(igThreadId,media); playNotificationSound('outgoing',preferences) }
        catch(error) { reportNativeError(error) }
        finally { sendingRef.current=false }
        return
      }
      sendingRef.current = true
      setDraft(previous => previous === draft ? '' : previous)
      try {
        await ig.sendText(igThreadId,text,igReply?.id)
        setIgReply(null)
        playNotificationSound('outgoing',preferences)
      } catch(error) { setDraft(previous => previous || draft); reportNativeError(error) }
      finally { sendingRef.current=false }
      return
    }

    sendingRef.current = true
    prepareNotificationAudio(preferences)

    try {
      await appendMessage(
        coreOwner,
        activeId,
        text,
        formatting,
        media,
      )

      if (!media) {
        setDraft(previous =>
          previous === draft ? '' : previous
        )
      }

      playNotificationSound(
        'outgoing',
        preferences,
      )
    } catch (error) {
      reportNativeError(error)
    } finally {
      sendingRef.current = false
    }
  }

  return (
    <div className={
      nativeLogin || loginMain
        ? "em-app em-native-login"
        : nativeChat
          ? "em-app em-native-chat"
          : nativeMain
            ? "em-app em-native-buddy"
            : "em-app"
    }>
      <div className="em-dev-strip">
        <strong>Elsewhere Messenger</strong>
        <span>Classic Edition</span>
        <button type="button" onClick={openLogin}>
          Sign In
        </button>
        <button type="button" onClick={() => setShowNotice(true)}>
          Test notification
        </button>
      </div>

      <main className="em-desktop-preview">
        {(loginMain || (showLogin && !nativeMain && !nativeChat)) && (
          <section
            className="em-window em-login-window"
            aria-label="Sign-in window"
          >
            <WindowTitle
              title="Elsewhere Messenger"
              loginMode={true}
              onClose={() => setShowLogin(false)}
            />

            <div className="em-login-brand">
              <span
                className="em-login-brand-icon"
                aria-hidden="true"
              />

              <div className="em-login-brand-wordmark">
                <strong>Elsewhere</strong>
                <strong>Messenger</strong>
              </div>

              <div
                className="em-login-header-wave"
                aria-hidden="true"
              />
            </div>

            <div className="em-login-content">
              <div
                className="em-login-photo"
                aria-label="Cloud display picture"
              />

              <form
                className="em-login-form"
                onSubmit={signIn}
              >
                {loginMain ? <>
                <label htmlFor="em-account-email">
                  Email address:
                </label>

                <input
                  id="em-account-email"
                  type="email"
                  disabled={loginBusy}
                  value={loginEmail}
                  maxLength={254}
                  onChange={(event) =>
                    setLoginEmail(event.target.value)
                  }
                  autoComplete="email"
                  required
                />

                <label htmlFor="em-account-password">
                  Password:
                </label>

                <input
                  id="em-account-password"
                  type="password"
                  disabled={loginBusy}
                  value={loginPassword}
                  maxLength={72}
                  onChange={(event) =>
                    setLoginPassword(event.target.value)
                  }
                  autoComplete="current-password"
                  required
                />
                </> : <>
                <label htmlFor="em-display-name">
                  Display name:
                </label>

                <input
                  id="em-display-name"
                  disabled={!loginReady}
                  value={name}
                  maxLength={40}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  autoComplete="off"
                  required
                />
                </>}

                <div className="em-login-status-row">
                  <label htmlFor="em-login-status">
                    Sign in as:
                  </label>

                  <ClassicPresenceSelect
                    id="em-login-status"
                    label="Sign-in presence"
                    value={status}
                    onChange={setStatus}
                  />
                </div>

                <div className="em-login-checks">
                  <label className="em-check-label">
                    <input
                      type="checkbox"
                      checked={session.remember}
                      onChange={(event) =>
                        setLocalSessionOptions({
                          remember: event.target.checked,
                        })
                      }
                    />
                    Remember me
                  </label>

                  <label className="em-check-label">
                    <input type="checkbox" disabled />
                    Remember my password
                  </label>

                  <label className="em-check-label">
                    <input
                      type="checkbox"
                      checked={session.automatic}
                      disabled={!session.remember}
                      onChange={(event) =>
                        setLocalSessionOptions({
                          automatic: event.target.checked,
                        })
                      }
                    />
                    Sign me in automatically
                  </label>
                </div>

                <button
                  className="em-signin-button"
                  disabled={!loginReady || loginBusy}
                  type="submit"
                >
                  {loginBusy ? 'Signing in…' : 'Sign In'}
                </button>

                {loginMain && loginError && (
                  <p className="em-login-error" role="alert">{loginError}</p>
                )}

                <div className="em-login-account-links">
                  <button
                    type="button"
                    onClick={() => toolbarAction({ kind: 'accounts', purpose: 'reset-password' })}
                    title="Get an email code, then choose a new password."
                  >
                    Forgot your password?
                  </button>

                  <button
                    type="button"
                    onClick={openSignupPage}
                  >
                    Create an account
                  </button>
                </div>
              </form>

              <p className="em-login-note">
                {loginMain ? 'Sign in with your Elsewhere account.' : 'Local profile. No password needed.'}
              </p>
            </div>

            <div
              className="em-login-wave"
              aria-hidden="true"
            >
              <span className="em-login-footer-butterfly" />
            </div>
          </section>
        )}

        {!loginMain && (
        <section className="em-window em-buddy-window" aria-label="Buddy list">
          <WindowTitle title="Elsewhere Messenger" />

          <ClassicMenuBar
  kind="buddy"
  onSignIn={() =>
    requestMenuAction('sign-in')
  }
  onSignOut={
    nativeMain || nativeChat
      ? () => requestMenuAction('sign-out')
      : undefined
  }
  onExit={
    nativeMain
      ? () => {
          void getCurrentWindow()
            .close()
            .catch(reportNativeError)
        }
      : undefined
  }
  contacts={contacts}
  onContact={openContact}
  onExpand={(expanded) =>
    setExpanded({
      Buddies: expanded,
      'Other Contacts': expanded,
      'Instagram Chats': expanded,
    })
  }
  onOpenSelected={
    activeId
      ? () => openContact(activeId)
      : undefined
  }
  onDeadSignal={() =>
    requestMenuAction('dead-signal')
  }
  preferences={preferences}
  onSoundChange={updateSounds}
/>

          <div className="em-profile">
            <OwnProfilePhoto owner={coreOwner} service={headerService} remotePhoto={remotePhoto(headerService)}
              skin="classic" className="em-avatar" fallback={<div className="em-avatar-self" />} />

            <div className="em-profile-info">
              <div className="em-profile-heading">
                <strong>{name || 'you'}</strong>
                <ClassicPresenceSelect
                  label="Your status"
                  value={status}
                  onChange={(next) => {
                    setStatus(next)

                    if (nativeMain) {
                      updateLocalPresence(next)
                    }
                  }}
                />
              </div>

              <p><SpotifyProfileStatus fallback="listening to: daydream.mp3" /></p>
            </div>
          </div>

          

<div className="em-buddy-tools" aria-label="Buddy actions">
  {[
    { id: 'invite', label: 'Add contact', action: () => toolbarAction({ kind: 'add-contact' }) },
    { id: 'mail', label: 'Mail', action: () => toolbarAction({ kind: 'mail' }) },
    { id: 'call', label: 'Call', action: () => toolbarAction({ kind: 'call' }) },
    { id: 'webcam', label: 'Webcam', action: () => { void openCamera().catch(() => window.alert('Couldn’t open the Windows Camera app. Check that a camera is connected.')) } },
    { id: 'nudge', label: 'Nudge', action: nudgeSelected, blocked: externalBuddy || !activeContact },
    { id: 'gift', label: 'Web Treasures', action: () => window.dispatchEvent(new Event('elsewhere:web-treasures:open')) },
  ].map(tool => (
    <button key={tool.id} type="button" aria-disabled={tool.blocked}
      onClick={tool.blocked ? undefined : tool.action}
      title={tool.id === 'nudge' && externalBuddy ? NUDGE_LOCAL_ONLY : tool.label} aria-label={tool.label}>
      {tool.id === 'gift' ? <span className="em-buddy-tool-icon ew-treasure-shortcut" aria-hidden="true" /> :
        <img src={tool.id === 'nudge' ? '/approved/dead-signal/icons/toolbar-lightning.png' : `/approved/classic-icons/toolbar-${tool.id}.png`}
          alt="" className="em-buddy-tool-icon" draggable={false} />}
    </button>
  ))}
</div>

          <SocialServiceFilter value={socialService} onChange={setSocialService} instagramConnected={ig.connected} />
          <div className="em-groups">
            {(['Buddies', 'Other Contacts', 'Instagram Chats'] as ContactGroup[]).map((group) => {
              const members = visibleContacts.filter((contact) => contact.group === group)
              if (group === 'Instagram Chats' && !members.length) return null
              const onlineCount = members.filter((contact) => contact.online).length

              return (
                <section className="em-group" key={group}>
                  <button
                    type="button"
                    className="em-group-heading"
                    aria-expanded={expanded[group]}
                    onClick={() =>
                      setExpanded((previous) => ({
                        ...previous,
                        [group]: !previous[group],
                      }))
                    }
                  >
                    <span>{expanded[group] ? '▾' : '▸'}</span>
                    <strong>{group} ({onlineCount}/{members.length})</strong>
                  </button>

                  {expanded[group] && (
                    <div className="em-group-members">
                      {members.map((contact) => (
                        <button
                          type="button"
                          key={contact.id}
                          className={
                            'em-contact' +
                            (activeId === contact.id ? ' em-contact-selected' : '')
                          }
                          onClick={() => openContact(contact.id)}
                        >
                          {instagramThreadId(contact.id) ? <span className="ew-ig-contact-indicator" style={{backgroundColor:contactAppearance(appearance,instagramThreadId(contact.id)!).color}} title="Instagram contact · live presence unavailable" aria-label="Instagram contact, live presence unavailable" /> : <span
                            className={
                              'em-presence ' +
                              (contact.online ? 'em-online' : 'em-offline')
                            }
                            aria-hidden="true"
                          />}
                          <InstagramAvatar url={contact.avatarUrl} className="ew-ig-contact-avatar" />
                          <span className="em-contact-name">
                            {contact.name}
                            {contact.note && <span> {contact.note}</span>}
                            {'preview' in contact && typeof contact.preview === 'string' && contact.preview && <span className="ew-contact-preview" title={contact.preview}>{contact.preview}</span>}
                            {unreadCount(messages[contact.id]) > 0 && (
                              <span className="ew-unread">
                                {unreadCount(messages[contact.id])}
                              </span>
                            )}
                          </span>
                          <span className="em-contact-state">
                            {discordChannelId(contact.id)?'Discord bot channel':instagramThreadId(contact.id)?'Instagram':contact.status[0].toUpperCase() + contact.status.slice(1)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <footer className="em-buddy-footer">
            <span>{contacts.filter((contact) => contact.online).length} online</span>
          </footer>
        </section>

                )}

        {nativeChat && !activeContact && (
          <section
            className="em-window em-chat-window"
            aria-label="Connecting conversation"
          >
            <WindowTitle
              title="Elsewhere Messenger"
            />

            <p style={{ padding: 16 }}>
              Connecting to Messenger...
            </p>
          </section>
        )}

        {activeContact && !nativeMain && (
          <section className="em-window em-chat-window" aria-label="Conversation window">
            <WindowTitle
              title={`${activeContact.name} - Conversation`}
              onClose={() => setActiveId(null)}
            />

            <ClassicMenuBar
  kind="chat"
  onSignIn={() =>
    requestMenuAction('sign-in')
  }
  onSignOut={
    nativeMain || nativeChat
      ? () => requestMenuAction('sign-out')
      : undefined
  }
  onClose={() => {
    if (nativeChat) {
      void getCurrentWindow()
        .close()
        .catch(reportNativeError)
    } else {
      setActiveId(null)
    }
  }}
  onEdit={(action) => {
    void editConversation(action)
  }}
  onClearDraft={() => {
    setDraft('')
    composerRef.current?.focus()
  }}
  onSend={() =>
    composerRef.current?.form?.requestSubmit()
  }
  onDeadSignal={() =>
    requestMenuAction('dead-signal')
  }
  preferences={preferences}
  onSoundChange={updateSounds}
/>

            
<div className="em-chat-tools">
  {[
    { id: 'invite', label: 'Invite', menu: false },
    { id: 'send-files', label: 'Send Files', menu: false },
    { id: 'webcam', label: 'Webcam', menu: false },
    { id: 'audio', label: 'Audio', menu: false },
    { id: 'nudge', label: 'Nudge', menu: false },
    { id: 'activities', label: 'Activities', menu: true },
    { id: 'emoticons', label: 'Emoticons', menu: true },
    { id: 'winks', label: 'Winks', menu: true },
  ].map((tool) => (
    <button
      type="button"
      key={tool.id}
      disabled={!['emoticons', 'send-files', 'webcam', 'audio', 'nudge'].includes(tool.id)}
      aria-disabled={tool.id === 'nudge' && chatService !== 'elsewhere'}
      data-emoticon-trigger={tool.id === 'emoticons'}
      data-media-trigger={tool.id === 'send-files'}
      onClick={(event) => {
        if (tool.id === 'send-files') {
          openMedia(event.currentTarget, 'local')
        } else if (tool.id === 'webcam') {
          void openCamera().catch(() => window.alert('Couldn’t open the Windows Camera app. Check that a camera is connected.'))
        } else if (tool.id === 'audio') {
          toolbarAction({ kind: 'call' })
        } else if (tool.id === 'nudge') {
          nudgeSelected()
        } else if (tool.id === 'emoticons') {
          setMediaPicker(null)
          openEmoticons(event.currentTarget)
        }
      }}
      title={tool.id === 'nudge' && chatService !== 'elsewhere' ? NUDGE_LOCAL_ONLY : tool.label}
    >
      <img
        src={tool.id === 'nudge' ? '/approved/dead-signal/icons/toolbar-lightning.png' : `/approved/classic-icons/toolbar-${tool.id}.png`}
        alt=""
        className="em-tool-icon"
      />
      <small>
        {tool.label}
        {tool.menu && <span> ▾</span>}
      </small>
    </button>
  ))}

<MediaPicker
    picker={mediaPicker}
    skin="classic"
    onSend={(media) => sendMessage(null, media)}
    onClose={() => setMediaPicker(null)}
  />
  <AnchoredEmoticonPicker
    anchor={emoticonAnchor}
    skin="classic"
    onPick={insertEmoticon}
    onClose={() => setEmoticonAnchor(null)}
  />
</div>


            <div className="em-chat-content">
              <div className="em-message-column">
                <div className="em-recipient">
                  To: <strong>{activeContact.name}</strong>
                </div>

                <div className="em-history" role="log" aria-live="polite">
                  {cloudPerson ? <>
                    {cloudChat.error && <p role="alert">{cloudChat.error}</p>}
                    {!cloudChat.messages.length && !cloudChat.error && <p className="em-empty">Start a conversation.</p>}
                    {cloudChat.messages.map(message => message.kind === 'nudge' ? (
                      <p key={message.id} className="ew-nudge-event">{message.sender_id === cloudChat.userId ? 'You sent a nudge.' : `${activeContact.name} sent you a nudge!`}</p>
                    ) : (
                      <div className="em-message" key={message.id}>
                        <div className={message.sender_id === cloudChat.userId ? 'em-sender-me' : 'em-sender-them'}>
                          <strong>{message.sender_id === cloudChat.userId ? name || 'you' : activeContact.name}</strong>
                          <span> says ({new Date(message.created_at).toLocaleString()}):</span>
                        </div>
                        <div className="ew-core-message-text">{renderClassicText(message.text_body)}</div>
                      </div>
                    ))}
                  </> : discordId ? <>
                    {discordChat.error && <p role="alert">{discordChat.error}</p>}
                    {!discordChat.messages.length && <p className="em-empty">No Discord messages available. Check the bot's channel permissions and Message Content intent.</p>}
                    {discordChat.messages.map(message => <div className="em-message" key={message.id}>
                      <div className={message.author?.bot ? 'em-sender-me' : 'em-sender-them'}>
                        <strong>{message.author?.global_name || message.author?.username || 'Discord user'}</strong>
                        <span> says ({new Date(message.timestamp).toLocaleString()}):</span>
                      </div>
                      <DiscordMessageContent message={message} onReply={target=>{setDiscordReply({id:target.id,summary:(target.content||'[Discord media]').slice(0,100)});composerRef.current?.focus()}} />
                    </div>)}
                  </> : igThreadId ? <>
                    {ig.error && <p role="alert">{ig.error}</p>}
                    {!ig.connected && <p className="em-empty">Open Instagram through Tools and connect the account to load this conversation.</p>}
                    {ig.connected && !ig.messages.length && <p className="em-empty">No messages returned by Meta for this conversation.</p>}
                    {ig.messages.map(message => <div className="em-message" key={message.id}>
                      <div className={message.from?.id === ig.account ? 'em-sender-me' : 'em-sender-them'}>
                        <strong>{message.from?.id === ig.account ? name : activeContact.name}</strong>
                        <span> says ({message.created_time ? new Date(message.created_time).toLocaleString() : ''}):</span>
                      </div>
                      <InstagramMessageContent message={message} allMessages={ig.messages} onReply={target => {setIgReply({id:target.id,summary:(target.message || target.text || "[Instagram media]").slice(0,160)});composerRef.current?.focus()}} />
                    </div>)}
                  </> : <>
                  {activeMessages.length === 0 && (
                    <p className="em-empty">Start a conversation.</p>
                  )}
                  {activeMessages.map((message) => message.kind === 'nudge' ? (
                    <p key={message.id} className="ew-nudge-event">{message.own ? 'You sent a nudge.' : message.text}</p>
                  ) : (
                    <div className="em-message" key={message.id}>
                      <div className={message.own ? 'em-sender-me' : 'em-sender-them'}>
                        <strong>{message.own ? name || 'you' : activeContact.name}</strong>
                        <span> says ({message.time}):</span>
                      </div>
                      <div
                        className="ew-core-message-text"
                        style={formatStyle(message.format)}
                      >
                        {message.media ? (
                          <MediaAttachment
                            media={message.media}
                            skin="classic"
                          />
                        ) : (
                          renderClassicText(message.text)
                        )}
                      </div>
                    </div>
                  ))}
                  </>}
                </div>

                
                <div className="em-composer-frame">
  <div
    className="em-formatting"
    role="toolbar"
    aria-label="Message formatting"
  >
  <ExpressionLibraries
    key={JSON.stringify([coreOwner, activeId])}
    skin="classic"
    owner={coreOwner}
    draft={draft}
    format={formatting}
    setDraft={setDraft}
    setFormat={setFormatting}
    composerRef={composerRef}
    onSend={media => sendMessage(null, media)}
  />
  <button
    type="button"
    className="em-font-picker"
    disabled
    title="Font selection is not implemented yet"
  >
    A <span>▾</span>
  </button>

  <span
    className="em-format-separator"
    aria-hidden="true"
  />

  <button
    type="button"
    className={formatting.bold ? 'em-format-active' : ''}
    aria-label="Bold"
    aria-pressed={formatting.bold}
    onClick={() => toggleFormatting('bold')}
  >
    <strong>B</strong>
  </button>

  <button
    type="button"
    className={formatting.italic ? 'em-format-active' : ''}
    aria-label="Italic"
    aria-pressed={formatting.italic}
    onClick={() => toggleFormatting('italic')}
  >
    <em>I</em>
  </button>

  <button
    type="button"
    className={formatting.underline ? 'em-format-active' : ''}
    aria-label="Underline"
    aria-pressed={formatting.underline}
    onClick={() => toggleFormatting('underline')}
  >
    <u>U</u>
  </button>

  <button
    type="button"
    disabled
    title="Font color is not implemented yet"
    aria-label="Font color"
  >
    <span className="em-font-color-icon">A</span>
  </button>

  <span
    className="em-format-separator"
    aria-hidden="true"
  />

  <button
    type="button"
    title="Choose a classic emoticon"
    aria-label="Choose an emoticon"
    data-emoticon-trigger
      onClick={(event) =>
        openEmoticons(event.currentTarget)
      }
  >
    <img
      src="/approved/classic-icons/toolbar-emoticons.png"
      alt=""
      className="em-composer-tool-icon"
      draggable={false}
    />
  </button>

  <button
    type="button"
    title="Insert picture"
    aria-label="Insert picture"
    data-media-trigger
    onClick={(event) =>
      openMedia(event.currentTarget, 'local')
    }
  >
    <img
      src="/approved/classic-icons/toolbar-picture.png"
      alt=""
      className="em-composer-tool-icon"
      draggable={false}
    />
  </button>

  <button
    type="button"
    className="ew-gif-trigger"
    title="GIFs and stickers"
    aria-label="GIFs and stickers"
    data-media-trigger
    onClick={(event) =>
      openMedia(event.currentTarget, 'gifs')
    }
  >
    GIF
  </button>

  <button
    type="button"
    disabled
    title="Gifts are not implemented yet"
    aria-label="Send gift"
  >
    <img
      src="/approved/classic-icons/toolbar-gift.png"
      alt=""
      className="em-composer-tool-icon"
      draggable={false}
    />
  </button>
</div>

                  {discordId && discordReply && <div className="ew-ig-compose-reply"><span>↩ Reply to Discord: {discordReply.summary}</span><button type="button" onClick={()=>setDiscordReply(null)}>✕</button></div>}
                  {igThreadId && instagramReplyWindowClosed(ig.messages, ig.account) && <div className="ew-ig-window-notice" role="note">{INSTAGRAM_WINDOW_NOTICE}</div>}
                  {igThreadId && igReply && <div className="ew-ig-compose-reply"><span>↩ Replying to: {igReply.summary}</span><button type="button" onClick={()=>setIgReply(null)} aria-label="Cancel reply">✕</button></div>}
                  <form className="em-compose" onSubmit={sendMessage}>
                    <textarea
                      ref={composerRef}
                      aria-label="Write a message"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      style={formatStyle(formatting)}
                      onKeyDown={(event) => {
                        if (
                          !event.ctrlKey &&
                          !event.metaKey &&
                          !event.altKey &&
                          (
                            event.key.length === 1 ||
                            event.key === 'Backspace' ||
                            event.key === 'Delete' ||
                            event.key === 'Enter'
                          )
                        ) {
                          playTypingSound(
                            preferences,
                            event.key,
                            event.key === 'Enter' && !event.shiftKey
                          )
                        }

                        if (event.ctrlKey || event.metaKey) {
                          const shortcuts: Record<string, FormatToggle> = {
                            b: 'bold',
                            i: 'italic',
                            u: 'underline',
                          }

                          const action = shortcuts[event.key.toLowerCase()]

                          if (action) {
                            event.preventDefault()
                            toggleFormatting(action)
                            return
                          }
                        }

                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          event.currentTarget.form?.requestSubmit()
                        }
                      }}
                      placeholder="Type a message..."
                      rows={3}
                    />

                    <button type="submit" disabled={!draft.trim()}>
                      Send
                    </button>
                  </form>
                </div>
              </div>

              <aside
                className="em-chat-sidebar"
                aria-label="Display pictures"
              >
                <div className="em-photo-frame">
                  <InstagramAvatar url={activeContact.avatarUrl} className="ew-ig-chat-avatar"
                    alt={`${activeContact.name} Instagram profile picture`} fallback={activeContact.id === 'sunny_day' ? (
                    <div className="em-avatar-sunny" />
                  ) : (
                    <div className="em-avatar-unknown">
                      {activeContact.name.replace(/^@/, '').charAt(0).toUpperCase()}
                    </div>
                  )} />
                </div>

                <strong>{activeContact.name}</strong>
                <small>
                  {discordId?'Discord · bot channel':igThreadId?'Instagram · presence unavailable':activeContact.status[0].toUpperCase() + activeContact.status.slice(1)}
                </small>

                <div className="em-photo-frame em-my-photo">
                  <OwnProfilePhoto owner={coreOwner} service={chatService} remotePhoto={remotePhoto(chatService)}
                    skin="classic" fallback={<div className="em-avatar-self" />} />
                </div>

                <strong>{name || 'you'}</strong>
              </aside>
            </div>

            <footer className="em-chat-footer">
              <span
                className="em-status-bubble"
                aria-hidden="true"
              />
              <span>{cloudPerson ? 'Elsewhere · online messages aren’t end-to-end encrypted' : discordId ? 'Discord channel · messages sent as Elsewhere bot' : igThreadId ? 'Instagram via Meta API · A successful API send is not delivery confirmation' : 'Local conversation'}<span className="ew-beta-badge">Beta</span></span>
            </footer>

          </section>
        )}

        {showNotice && (
          <aside className="em-toast" role="status">
            <div className="em-toast-title">
              <span className="em-brand-icon" />
              Elsewhere Messenger
              <button type="button" onClick={() => setShowNotice(false)}>×</button>
            </div>

            <div className="em-toast-body">
              <div className="em-toast-avatar" />
              <span><strong>sunny_day</strong> is now online.</span>
            </div>
            <small>Example notification</small>
          </aside>
        )}
      </main>
    </div>
  )
}

type ClassicSkinProps = {
  buddies?: CloudProfile[]
  active?: boolean
  onChangeSkin?: (skin: "classic" | "dead-signal") => void
}

export default function ClassicSkin({
  active = true,
  onChangeSkin,
  buddies,
}: ClassicSkinProps) {
  return (
    <>
      {active && <style>{classicStyles}</style>}
      <App onChangeSkin={onChangeSkin} activeSkin={active} buddies={buddies} />
    </>
  )
}
