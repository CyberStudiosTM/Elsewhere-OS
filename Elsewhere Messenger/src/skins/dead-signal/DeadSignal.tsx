import { ELSEWHERE_BUDDY_PREFIX, type CloudProfile } from '../../services/connectedClient'
import { useReportChatFocus, useSocialUnread } from '../../services/socialUnread'
import { sendElsewhereTyping, useElsewhereLive } from '../../services/elsewhereLive'
import ElsewhereMediaMessage from '../../components/ElsewhereMediaMessage'
import StagedPhotoBar from '../../components/StagedPhotoBar'
import ActivitiesMenu from '../../components/ActivitiesMenu'
import { openInstagramContactSettings } from '../../components/InstagramContactSettings'
import InviteDialog from '../../components/InviteDialog'
import { GroupHeaderTools, GroupTranscript, groupChatTitle } from '../../components/GroupConversation'
import { ELSEWHERE_GROUP_PREFIX, elsewhereGroupId, useCloudGroupList } from '../../services/elsewhereGroups'
import { useElsewhereGroupChat } from '../../services/elsewhereNativeBridge'
import { openPhotoBooth } from '../../services/photoBooth'
import { OPEN_TOOLBAR_CONTACT } from '../../components/ToolbarDialogs'
import { NUDGE_LOCAL_ONLY, openWebTreasures, toolbarAction } from '../../services/toolbarActions'
import OwnProfilePhoto from '../../components/OwnProfilePhoto'
import { useDiscordProfilePhoto } from '../../services/discordConnection'
import InstagramAvatar from '../../components/InstagramAvatar'
import SpotifyProfileStatus from "../../components/SpotifyProfileStatus";
import DiscordMessageContent from '../../components/DiscordMessageContent'
import { usePinnedDiscordChannels, useDiscordMessages, discordChannelId, discordContactId, sendDiscordMessage } from '../../services/discordBot'
import SocialServiceFilter, { matchesSocialService, type SocialService } from '../../components/SocialServiceFilter'
import '../../components/WebTreasuresPanel.css'
import {useInstagramAppearance,contactAppearance,instagramRecentGroup,sortInstagramThreads} from '../../services/instagramContactPreferences'
import { INSTAGRAM_WINDOW_NOTICE, instagramLastPreview, instagramReplyWindowClosed, useNativeInstagram, instagramContactId, instagramThreadId, instagramContactName, instagramProfilePicture } from '../../services/instagramNativeBridge'
import InstagramMessageContent from '../../components/InstagramMessageContent'
import ExpressionLibraries from "../../components/ExpressionLibraries";
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
  type FormatToggle,
} from "../../services/messagingCore";

import MediaPicker from "../../components/MediaPicker";
import MediaAttachment from "../../components/MediaAttachment";

import {
  mediaLabel,
  type MediaRef,
  type MediaPickerState,
} from "../../services/messengerMedia";

import {
  useLocalSession,
  getLocalSession,
  setLocalSessionOptions,
  updateLocalPresence,
  type LocalPresence,
} from "../../services/localSession";
import { openSignupPage, signInMain, signOutMain } from "../../services/mainAccount";
import { elsewherePersonId, useElsewhereChat } from "../../services/elsewhereNativeBridge";
import { lastSavedAccountEmail } from "../../services/connectedClient";

import {
  AnchoredEmoticonPicker,
  renderClassicText,
} from "../../components/SharedEmoticons";


import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import deadSignalStyles from "./DeadSignal.css?inline";

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  emitTo,
  type UnlistenFn,
} from "@tauri-apps/api/event";

import {
  DEAD_SIGNAL_LABELS,
  deadSignalRole,
  openDeadSignalWindow,
  closeDeadSignalWindow,
  closeDeadSignalWindows,
} from "../../services/deadSignalWindows";

import ClassicMenuBar, {
  type EditAction,
} from "../../components/ClassicMenuBar";

import {
  useSoundPreferences,
  playTypingSound,
  playNotificationSound,
  prepareNotificationAudio,
} from "../../services/classicSounds";

import {
  reportNativeError,
} from "../../services/nativeWindows";

type MessengerSkin = "classic" | "dead-signal";

const ASSETS = "/approved/dead-signal";

type Presence = "online" | "away" | "busy" | "offline";
type WindowId = "login" | "contacts" | "chat";

function toLocalPresence(value: Presence): LocalPresence {
  if (value === "away") return "Away";
  if (value === "busy") return "Busy";
  if (value === "offline") return "Invisible";
  return "Online";
}

function fromLocalPresence(value: LocalPresence): Presence {
  if (value === "Away") return "away";
  if (value === "Busy") return "busy";
  if (value === "Invisible") return "offline";
  return "online";
}


const conversationTools = [
  ["toolbar-invite", "Invite"],
  ["toolbar-send-files", "Send Files"],
  ["toolbar-webcam", "Webcam"],
  ["toolbar-audio", "Audio"],
  ["toolbar-lightning", "Nudge"],
  ["toolbar-emoticons", "Emoticons"],
  ["toolbar-activities", "Activities"],
  ["toolbar-gift", "Web Treasures"],
];

const buddyTools = [
  ["buddy-add", "Add Contact"],
  ["toolbar-mail", "Mail"],
  ["toolbar-call", "Call"],
  ["buddy-webcam", "Webcam"],
  ["toolbar-gift", "Web Treasures"],
  ["toolbar-activities", "Activities"],
];


function Icon({
  name,
  size = 24,
}: {
  name: string;
  size?: number;
}) {
  return (
    <img
      className="ds-icon"
      src={`${ASSETS}/icons/${name}.png`}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}

function Status({ status }: { status: Presence }) {
  return (
    <img
      className="ds-presence"
      src={`${ASSETS}/icons/presence-${status}.png`}
      alt={status}
      title={status}
      width={16}
      height={16}
    />
  );
}

function Fish() {
  return (
    <img
      className="ds-fish"
      src={`${ASSETS}/branding/skeletal-fish-48.png`}
      alt=""
      draggable={false}
    />
  );
}

function Avatar({
  name,
  size = 96,
}: {
  name: string;
  size?: number;
}) {
  return (
    <div
      className="ds-avatar"
      style={{ width: size, height: size }}
    >
      <img
        src={`${ASSETS}/avatars/${name}.png`}
        alt={`${name.replaceAll("-", " ")} display picture`}
        draggable={false}
      />
    </div>
  );
}

function WindowFrame({
  title,
  children,
  className = "",
  active,
  onActivate,
  onClose,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const role = deadSignalRole();

  const native = role !== "preview";

  const loginFrame =
    role === "login" ||
    className === "ds-login-window";

  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      maximized ||
      (event.target as HTMLElement).closest("button")
    ) {
      return;
    }

    onActivate();

    if (native) {
      void getCurrentWindow()
        .startDragging()
        .catch(reportNativeError);

      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    setPosition((previous) => ({
      x: previous.x + event.movementX,
      y: previous.y + event.movementY,
    }));
  }

  return (
    <section
      className={[
        "ds-window",
        className,
        minimized ? "ds-minimized" : "",
        maximized ? "ds-maximized" : "",
        active ? "ds-active" : "",
      ].join(" ")}
      style={
          native || maximized
            ? undefined
          : { transform: `translate(${position.x}px, ${position.y}px)` }
      }
      onPointerDown={onActivate}
    >
      <div
        className="ds-titlebar"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onDoubleClick={(event) => {
          if (
            (event.target as Element).closest("button")
          ) return;

          if (native) {
            if (!loginFrame) {
              void getCurrentWindow()
                .toggleMaximize()
                .catch(reportNativeError);
            }

            return;
          }

          setMinimized(false);
          setMaximized((value) => !value);
        }}
      >
        <Fish />
        <span className="ds-title">{title}{title === "Elsewhere Messenger" && <span className="ew-beta-badge">Beta</span>}</span>

        <div className="ds-window-controls">
          <button
            title={minimized ? "Restore" : "Minimize"}
            aria-label={minimized ? "Restore" : "Minimize"}
            onClick={() => {
              if (native) {
                void getCurrentWindow()
                  .minimize()
                  .catch(reportNativeError);

                return;
              }

              setMaximized(false);
              setMinimized((value) => !value);
            }}
          >
            {minimized ? "□" : "—"}
          </button>

          <button
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
            disabled={native && loginFrame}
            onClick={() => {
              if (native) {
                void getCurrentWindow()
                  .toggleMaximize()
                  .catch(reportNativeError);

                return;
              }

              setMinimized(false);
              setMaximized((value) => !value);
            }}
          >
            {maximized ? "❐" : "□"}
          </button>

          <button
            className="ds-close"
            title="Close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="ds-window-content">{children}</div>
          <div className="ds-hardware-trim" aria-hidden="true">
            <span className="ds-screw" />
            <span className="ds-signal-light" />
            <span className="ds-hazard" />
          </div>
        </>
      )}
    </section>
  );
}

function Toolbar({
  tools,
  compact = false,
  onAction,
  nudgeLocalOnly = false,
}: {
  tools: string[][];
  compact?: boolean;
  nudgeLocalOnly?: boolean;
  onAction: (action: string, anchor: HTMLButtonElement) => void;
}) {
  return (
    <div className={`ds-toolbar ${compact ? "ds-compact-toolbar" : ""}`}>
      {tools.map(([icon, label]) => (
        <button
          key={icon}
          title={label === 'Nudge' && nudgeLocalOnly ? NUDGE_LOCAL_ONLY : label}
          aria-label={label}
          aria-disabled={label === 'Nudge' && nudgeLocalOnly}
          data-media-trigger={
            label === "Send Files" ? true : undefined
          }
          data-emoticon-trigger={
            label === "Emoticons" ? true : undefined
          }
          onClick={(event) =>
            (label !== 'Nudge' || !nudgeLocalOnly) && onAction(label, event.currentTarget)
          }
        >
          {label === 'Web Treasures' ? <span className="ds-icon ew-treasure-shortcut" style={{width: compact ? 24 : 32, height: compact ? 24 : 32,display:'inline-flex',fontSize:compact?20:24,alignItems:'center',justifyContent:'center'}} aria-hidden="true">🌐</span> : <Icon name={icon} size={compact ? 24 : 32} />}
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: Presence;
  onChange: (value: Presence) => void;
}) {
  return (
    <div className="ds-status-select">
      <Status status={value} />
      <select
        aria-label="Presence"
        value={value}
        onChange={(event) => onChange(event.target.value as Presence)}
      >
        <option value="online">Online</option>
        <option value="away">Away</option>
        <option value="busy">Busy</option>
        <option value="offline">Offline</option>
      </select>
    </div>
  );
}

type DeadSignalSnapshot = {
  owner: string | null;
  identity: string;
  presence: Presence;
  selected: string;
  signedIn: boolean;
};

type DeadSignalCommand =
  | {
      kind: "request";
      child: "login" | "chat";
    }
  | {
      kind: "sign-in";
      presence: Presence;
    }
  | {
      kind: "open-login";
    }
  | {
      kind: "classic";
    }
  | {
      kind: "sign-out";
    };

const DS_COMMAND =
  "elsewhere:dead-signal:command";

const DS_SNAPSHOT =
  "elsewhere:dead-signal:snapshot";

async function sendCommand(
  payload: DeadSignalCommand
) {
  await emitTo(
    "main",
    DS_COMMAND,
    payload
  );
}

function publishSnapshot(
  child: "login" | "chat",
  snapshot: DeadSignalSnapshot
) {
  return emitTo(
    DEAD_SIGNAL_LABELS[child],
    DS_SNAPSHOT,
    snapshot
  );
}

function DeadSignalView({
  onChangeSkin,
  activeSkin,
  buddies,
}: {
  onChangeSkin: (skin: MessengerSkin) => void;
  buddies?: CloudProfile[]
  activeSkin: boolean;
}) {
  const role = deadSignalRole();

  const nativeMain = role === "main";

  const nativeChild =
    role === "login" || role === "chat";

  const nativeLayout =
    role !== "preview";

  const [ready, setReady] = useState(
    !nativeChild
  );

  const session = useLocalSession();

  const loginMain =
    nativeMain && !session.signedIn;

  const leavingSession = useRef(false);

  const [nativeOwner, setNativeOwner] =
    useState<string | null>(null);

  const [identity, setIdentity] =
    useState(session.profile?.name ?? "2.grotesque");
  const [loginEmail, setLoginEmail] = useState(lastSavedAccountEmail);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const switching =
    useRef(false);

  const loginSubmitting =
    useRef(false);

  const {
    preferences,
    update: updateSounds,
  } = useSoundPreferences("dead-signal");

  const composerRef =
    useRef<HTMLTextAreaElement>(null);
  const [presence, setPresence] = useState<Presence>("online");
  const [selected, setSelected] = useState("");

  const [mediaPicker, setMediaPicker] =
    useState<MediaPickerState | null>(null);

  useEffect(() => {
    setMediaPicker(null);
  }, [selected]);

  function openMedia(
    anchor: HTMLButtonElement,
    tab: "local" | "gifs" | "stickers"
  ) {
    setEmoticonAnchor(null);

    setMediaPicker((previous) =>
      previous?.anchor === anchor
        ? null
        : { anchor, tab }
    );
  }

  const [emoticonAnchor, setEmoticonAnchor] =
    useState<HTMLButtonElement | null>(null);

  function openEmoticons(button: HTMLButtonElement) {
    setEmoticonAnchor((previous) =>
      previous === button ? null : button
    );
  }

  useEffect(() => {
    setEmoticonAnchor(null);
  }, [selected]);

  function insertEmoticon(code: string) {
    setDraft((previous) =>
      previous +
      (
        previous.length > 0 &&
        !previous.endsWith(" ")
          ? " "
          : ""
      ) +
      code
    );

    setEmoticonAnchor(null);
    composerRef.current?.focus();
  }
  const coreOwner = nativeMain
    ? accountKey(
        session.signedIn
          ? session.profile?.name
          : null
      )
    : role === "chat"
      ? ready
        ? nativeOwner
        : null
      : role === "login"
        ? null
        : accountKey(identity);

  const [socialService, setSocialService] = useState<SocialService>('all');
  const appearance=useInstagramAppearance();
  const ig = useNativeInstagram(selected);
  const igThreadId = instagramThreadId(selected);
  const discordId = discordChannelId(selected);
  // Elsewhere friends chat in the native chat window, which reaches the account through main.
  const cloudPerson = nativeMain ? null : elsewherePersonId(selected);
  const cloudChat = useElsewhereChat(cloudPerson);
  const cloudGroup = nativeMain ? null : elsewhereGroupId(selected);
  const groupChat = useElsewhereGroupChat(cloudGroup);
  const groupList = useCloudGroupList();
  const [inviteOpen, setInviteOpen] = useState(false);
  const discordPhoto = useDiscordProfilePhoto()
  const headerService = socialService === 'all' ? 'elsewhere' : socialService
  const chatService = igThreadId ? 'instagram' : discordId ? 'discord' : 'elsewhere'
  const remotePhoto = (service: string) => service === 'instagram' ? ig.accountPhoto : service === 'discord' ? discordPhoto : undefined
  const pinnedDiscord = usePinnedDiscordChannels();
  const discordChat = useDiscordMessages(discordId);
  const [discordReply,setDiscordReply]=useState<{id:string;summary:string}|null>(null);
  useEffect(()=>setDiscordReply(null),[discordId]);
  const history = useCoreHistory(coreOwner);
  const live = useElsewhereLive();

  const contacts = [
    ...contactDirectory(history, coreOwner).map(contact=>({...contact,avatarUrl:undefined as string|undefined})),
    ...(buddies || []).map(profile => ({
      id: ELSEWHERE_BUDDY_PREFIX + profile.id, name: '@' + profile.handle,
      group: 'Buddies' as const, status: live.status[profile.id] || 'offline', avatar: 'red-sunset-palm',
      avatarUrl: undefined, online: (live.status[profile.id] || 'offline') !== 'offline',
    })),
    ...sortInstagramThreads(ig.threads, appearance).map(thread => ({
      id: instagramContactId(thread.id),
      name: instagramContactName(thread,ig.account),
      group: instagramRecentGroup(thread, appearance),
      status: 'offline' as const,
      avatar: 'red-sunset-palm',
      avatarUrl: instagramProfilePicture(thread,ig.account),
      preview: instagramLastPreview(thread, ig.account),
    })),
    ...pinnedDiscord.map(channel=>({
      id: discordContactId(channel.id), name: `#${channel.name}`,
      group: 'Other Contacts' as const, status: 'offline' as const,
      avatar: 'red-sunset-palm', avatarUrl: undefined as string|undefined,
    })),
    ...groupList.groups.map(group => ({
      id: ELSEWHERE_GROUP_PREFIX + group.id, name: groupList.titles[group.id] || 'Group chat',
      group: 'Buddies' as const,
      status: (group.members.some(id => id !== groupList.me && (live.status[id] || 'offline') !== 'offline') ? 'online' : 'offline') as 'online' | 'offline',
      avatar: 'red-sunset-palm', avatarUrl: undefined as string|undefined,
    })),
  ];

  const visibleContacts = contacts.filter(contact => matchesSocialService(contact.id, socialService));

  const [draft, setDraft] =
    useConversationDraft(coreOwner, selected);
  const [igReply, setIgReply] = useState<{ id: string; summary: string } | null>(null);
  useEffect(() => { setIgReply(null); }, [selected]);

  const [format, setFormat] =
    useConversationFormat(coreOwner, selected);

  const sendingRef = useRef(false);

  useConversationRead(
    coreOwner,
    selected,
    history,
    activeSkin && (
      role === "chat" || role === "preview"
    ),
  );
  useReportChatFocus(selected, activeSkin && (role === "chat" || role === "preview"));
  const socialUnread = useSocialUnread();

  const [active, setActive] = useState<WindowId>(
    role === "main"
      ? "contacts"
      : role === "login"
        ? "login"
        : "chat"
  );
  const [closed, setClosed] = useState<WindowId[]>([]);
  const [groups, setGroups] = useState([true, true, true]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!nativeMain) return;

    setIdentity(
      session.profile?.name ?? "2.grotesque"
    );

    setPresence(
      fromLocalPresence(
        session.profile?.presence ?? "Online"
      )
    );

    setSignedIn(session.signedIn);

    setActive(
      session.signedIn ? "contacts" : "login"
    );
  }, [
    nativeMain,
    session.profile,
    session.signedIn,
  ]);

  async function leaveSession(
    switchAccount = false
  ) {
    if (!nativeMain || leavingSession.current) return;

    leavingSession.current = true;

    try {
      await closeDeadSignalWindows();

      setEmoticonAnchor(null);
      setNotification("");

      await signOutMain(switchAccount);
    } catch (error) {
      reportNativeError(error);
    } finally {
      leavingSession.current = false;
    }
  }

  function signOut() {
    if (nativeChild) {
      void sendCommand({
        kind: "sign-out",
      }).catch(reportNativeError);
    } else {
      void leaveSession(false);
    }
  }
  const [notification, setNotification] = useState(
    nativeLayout
      ? ""
      : ""
  );

  const snapshotRef =
    useRef<DeadSignalSnapshot>({
      owner: coreOwner,
      identity,
      presence,
      selected,
      signedIn,
    });

  useEffect(() => {
    if (!nativeMain || !activeSkin) return;

    const snapshot: DeadSignalSnapshot = {
      owner: coreOwner,
      identity: session.profile?.name ?? identity,
      presence,
      selected,
      signedIn,
    };

    snapshotRef.current = snapshot;

    void publishSnapshot(
      "login",
      snapshot
    ).catch(() => {});

    void publishSnapshot(
      "chat",
      snapshot
    ).catch(() => {});
  }, [
    nativeMain,
    activeSkin,
    identity,
    presence,
    selected,
    signedIn,
    coreOwner,
    session.profile,
  ]);

  // Only the buddy-list window owns the
  // authoritative profile and message history.

  useEffect(() => {
    if (!nativeMain || !activeSkin) return;

    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    void getCurrentWindow()
      .listen<DeadSignalCommand>(
        DS_COMMAND,
        ({ payload }) => {
          if (disposed) return;

          switch (payload.kind) {
            case "request":
              void publishSnapshot(
                payload.child,
                {
                  ...snapshotRef.current,
                  owner: accountKey(
                    getLocalSession().signedIn
                      ? getLocalSession().profile?.name
                      : null
                  ),
                  identity:
                    getLocalSession().profile?.name ??
                    snapshotRef.current.identity,
                  signedIn: getLocalSession().signedIn,
                }
              ).catch(console.error);
              break;

            case "open-login":
              void leaveSession(true);
              break;

            case "sign-out":
              void leaveSession(false);
              break;

            case "sign-in":
              setPresence(payload.presence);
              setSignedIn(true);

              void closeDeadSignalWindow(
                "login"
              ).catch(reportNativeError);
              break;

            case "classic":
              void switchToClassic();
              break;
          }
        }
      )
      .then((remove) => {
        if (disposed) {
          remove();
          return;
        }

        unlisten = remove;

      })
      .catch(reportNativeError);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    nativeMain,
    activeSkin,
    onChangeSkin,
  ]);

  // Secondary windows request a snapshot
  // after their event listener is ready.

  useEffect(() => {
    if (
      role !== "login" &&
      role !== "chat"
    ) return;

    const child = role;

    let disposed = false;
    let received = false;

    let unlisten: UnlistenFn | undefined;
    let timer: number | undefined;

    function requestSnapshot() {
      if (disposed || received) return;

      void sendCommand({
        kind: "request",
        child,
      }).catch(console.error);
    }

    void getCurrentWindow()
      .listen<DeadSignalSnapshot>(
        DS_SNAPSHOT,
        ({ payload }) => {
          if (disposed) return;

          received = true;

          if (timer !== undefined) {
            window.clearInterval(timer);
          }

          setPresence(payload.presence);
          setIdentity(payload.identity);
          setNativeOwner(payload.owner ?? null);
          setSelected(payload.selected);
          setSignedIn(payload.signedIn);
          setReady(true);
        }
      )
      .then((remove) => {
        if (disposed) {
          remove();
          return;
        }

        unlisten = remove;

        requestSnapshot();

        timer = window.setInterval(
          requestSnapshot,
          500
        );
      })
      .catch(reportNativeError);

    return () => {
      disposed = true;

      if (timer !== undefined) {
        window.clearInterval(timer);
      }

      unlisten?.();
    };
  }, [role]);

  // Update the OS taskbar title when a new
  // contact is selected in the buddy list.

  useEffect(() => {
    if (role !== "chat" || !ready) return;

    void getCurrentWindow()
      .setTitle(`${instagramThreadId(selected) ? 'Instagram' : selected} - Conversation`)
      .catch(reportNativeError);
  }, [role, ready, selected]);

  async function switchToClassic() {
    if (switching.current) return;

    if (nativeChild) {
      try {
        await sendCommand({
          kind: "classic",
        });
      } catch (error) {
        reportNativeError(error);
      }

      return;
    }

    switching.current = true;

    try {
      if (nativeMain) {
        await closeDeadSignalWindows();
      }

      onChangeSkin("classic");
    } catch (error) {
      reportNativeError(error);
    } finally {
      switching.current = false;
    }
  }

  const contact = contacts.find(
    item => item.name === selected || item.id === selected
  ) ?? {
    id: selected,
    name: cloudGroup ? (groupChat.group ? groupChatTitle(groupChat) : 'Group chat') : cloudPerson ? (cloudChat.profile ? '@' + cloudChat.profile.handle : 'Elsewhere friend') : selected,
    group: "Other Contacts" as const,
    status: "offline" as const,
    avatar: "red-sunset-palm",
    avatarUrl: undefined as string|undefined,
  };

  function closeWindow(id: WindowId) {
    if (nativeLayout) {
      void getCurrentWindow()
        .close()
        .catch(reportNativeError);

      return;
    }
    setClosed((previous) =>
      previous.includes(id) ? previous : [...previous, id]
    );
  }

  function openWindow(id: WindowId) {
    if (nativeMain) {
      if (id === "login") {
        void leaveSession(true);
      } else if (
        id === "chat" &&
        getLocalSession().signedIn
      ) {
        void openDeadSignalWindow("chat")
          .catch(reportNativeError);
      }

      return;
    }

    if (nativeChild) {
      if (id === "login") {
        void sendCommand({
          kind: "open-login",
        }).catch(reportNativeError);
      }

      return;
    }
    setClosed((previous) => previous.filter((item) => item !== id));
    setActive(id);
  }

  useEffect(() => {
    if (!activeSkin || nativeChild) return
    const open = (event: Event) => {
      const contact = (event as CustomEvent<string>).detail
      if (!contact.startsWith('instagram:') && !contact.startsWith('discord:') && !contact.startsWith(ELSEWHERE_BUDDY_PREFIX) && !contact.startsWith(ELSEWHERE_GROUP_PREFIX)) return
      setSelected(contact)
      if (nativeMain) {
        if (getLocalSession().signedIn) void openDeadSignalWindow('chat').catch(reportNativeError)
      } else {
        setClosed(items => items.filter(item => item !== 'chat'))
        setActive('chat')
      }
    }
    window.addEventListener(OPEN_TOOLBAR_CONTACT, open)
    return () => window.removeEventListener(OPEN_TOOLBAR_CONTACT, open)
  }, [activeSkin, nativeChild, nativeMain])

  const externalBuddy = (socialService === 'instagram' || socialService === 'discord') ||
    (socialService === 'all' && chatService !== 'elsewhere')
  function nudgeSelected() {
    if (cloudGroup) {
      void groupChat.send('Nudge', 'nudge').then(() => playNotificationSound('outgoing', preferences))
        .catch(error => setNotification(error instanceof Error ? error.message : String(error)));
      return;
    }
    if (cloudPerson) {
      void cloudChat.nudge().then(() => playNotificationSound('outgoing', preferences))
        .catch(error => setNotification(error instanceof Error ? error.message : String(error)));
      return;
    }
    if (!coreOwner || !selected || chatService !== 'elsewhere' || !contacts.some(contact => contact.id === selected)) return
    void appendNudge(coreOwner, selected, identity)
      .then(() => playNotificationSound('outgoing', preferences))
      .catch(error => setNotification(error instanceof Error ? error.message : String(error)))
  }

  function chooseContact(id: string) {
    setSelected(id)
    openWindow('chat')
  }

  const [activitiesAnchor, setActivitiesAnchor] = useState<HTMLElement | null>(null);

  function previewAction(action: string, anchor?: HTMLButtonElement) {
    if (action === "Send Files" && anchor) {
      openMedia(anchor, "local");
      return;
    }

    if (action === "Emoticons") {
      setMediaPicker(null);
      if (anchor) openEmoticons(anchor);
      return;
    }

    setNotification(`${action}: unavailable.`);
  }

  const [buddyActivities, setBuddyActivities] = useState<HTMLElement | null>(null);
  function buddyAction(action: string, anchor?: HTMLElement) {
    switch (action) {
      case 'Activities': setBuddyActivities(previous => previous ? null : anchor || null); break
      case 'Add Contact': toolbarAction({ kind: 'add-contact' }); break
      case 'Mail': toolbarAction({ kind: 'mail' }); break
      case 'Call': toolbarAction({ kind: 'call' }); break
      case 'Webcam': openPhotoBooth({ contactId: null }); break
      case 'Nudge': nudgeSelected(); break
      case 'Web Treasures': window.dispatchEvent(new Event('elsewhere:web-treasures:open')); break
    }
  }

  async function editConversation(
    action: EditAction
  ) {
    const current = composerRef.current;

    if (!current) return;

    const input: HTMLTextAreaElement = current;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const original = input.value;

    if (action === "select-all") {
      input.focus();
      input.select();
      return;
    }

    function replaceSelection(text: string) {
      if (input.value !== original) return;

      const position = start + text.length;

      setDraft(
        original.slice(0, start) +
        text +
        original.slice(end)
      );

      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(
          position,
          position
        );
      });
    }

    try {
      if (
        action === "copy" ||
        action === "cut"
      ) {
        const selectedText =
          original.slice(start, end);

        if (!selectedText) {
          input.focus();
          return;
        }

        await navigator.clipboard.writeText(
          selectedText
        );

        if (action === "cut") {
          replaceSelection("");
        } else {
          input.focus();
          input.setSelectionRange(start, end);
        }

        return;
      }

      if (action === "paste") {
        const text =
          await navigator.clipboard.readText();

        replaceSelection(text);
      }
    } catch (error) {
      console.error(error);

      window.alert(
        "Clipboard access was unavailable. " +
        "Try the keyboard shortcut directly."
      );
    }
  }

  async function sendMessage(media?: MediaRef) {
    if (cloudGroup) {
      if (media) {
        if (sendingRef.current) return;
        sendingRef.current = true;
        try { await groupChat.sendMedia(media); playNotificationSound('outgoing', preferences); }
        catch (error) { reportNativeError(error); }
        finally { sendingRef.current = false; }
        return;
      }
      if (!draft.trim() || sendingRef.current) return;
      sendingRef.current = true;
      setDraft(previous => previous === draft ? '' : previous);
      try {
        await groupChat.send(draft.trim());
        playNotificationSound('outgoing', preferences);
      } catch (error) { setDraft(previous => previous || draft); reportNativeError(error); }
      finally { sendingRef.current = false; }
      return;
    }
    if (cloudPerson) {
      if (media) {
        if (sendingRef.current) return;
        sendingRef.current = true;
        try { await cloudChat.sendMedia(media); playNotificationSound('outgoing', preferences); }
        catch (error) { reportNativeError(error); }
        finally { sendingRef.current = false; }
        return;
      }
      if (!draft.trim() || sendingRef.current) return;
      sendingRef.current = true;
      setDraft(previous => previous === draft ? '' : previous);
      try {
        await cloudChat.send(draft.trim());
        playNotificationSound('outgoing', preferences);
      } catch (error) { setDraft(previous => previous || draft); reportNativeError(error); }
      finally { sendingRef.current = false; }
      return;
    }
    if (discordId) {
      if (media) { reportNativeError(new Error('Discord media uploads are not enabled in this build.')); return; }
      if (!draft.trim() || sendingRef.current) return;
      sendingRef.current=true;
      try { await sendDiscordMessage(discordId,draft.trim(),discordReply?.id); setDiscordReply(null); setDraft(previous=>previous===draft?'':previous); }
      catch(error){reportNativeError(error);} finally{sendingRef.current=false;}
      return;
    }
    if (igThreadId) {
      if (media) {
        if (sendingRef.current) return;
        sendingRef.current=true;
        try { await ig.sendMedia(igThreadId,media); playNotificationSound('outgoing',preferences); }
        catch(error) { reportNativeError(error); }
        finally { sendingRef.current=false; }
        return;
      }
      if (!draft.trim() || sendingRef.current) return;
      sendingRef.current = true;
      setDraft(previous => previous === draft ? '' : previous);
      try {
        await ig.sendText(igThreadId, draft.trim(), igReply?.id);
        setIgReply(null);
        playNotificationSound('outgoing', preferences);
      } catch(error) { setDraft(previous => previous || draft); reportNativeError(error); }
      finally { sendingRef.current = false; }
      return;
    }
    if (
      !coreOwner ||
      !ready ||
      sendingRef.current ||
      (!media && !draft.trim())
    ) return;

    sendingRef.current = true;

    const text = media
      ? mediaLabel(media)
      : draft.trim();

    prepareNotificationAudio(preferences);

    try {
      await appendMessage(
        coreOwner,
        selected,
        text,
        format,
        media,
      );

      if (!media) {
        setDraft(previous =>
          previous === draft ? "" : previous
        );
      }

      playNotificationSound(
        "outgoing",
        preferences,
      );
    } catch (error) {
      reportNativeError(error);
    } finally {
      sendingRef.current = false;
    }
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loginMain) {
      if (loginBusy) return;
      setLoginBusy(true);
      setLoginError("");
      void signInMain(loginEmail, loginPassword, toLocalPresence(presence), session.remember)
        .then(() => setLoginPassword(""))
        .catch((error) => setLoginError(error instanceof Error ? error.message : String(error)))
        .finally(() => setLoginBusy(false));

      return;
    }

    if (role === "login") {
      if (!ready || loginSubmitting.current) {
        return;
      }

      loginSubmitting.current = true;

      void sendCommand({
        kind: "sign-in",
        presence,
      }).catch((error) => {
        loginSubmitting.current = false;
        reportNativeError(error);
      });

      return;
    }
    setSignedIn(true);
    openWindow("contacts");
    setNotification("Signed in to your local profile.");
  }

  return (
    <main
      className={
        nativeLayout
          ? `ds-desktop ds-native ds-native-${loginMain ? "login" : role}`
          : "ds-desktop"
      }
    >
      {!nativeLayout && (
        <header className="ds-preview-header">
        <img
          src={`${ASSETS}/branding/dead-signal-wordmark.png`}
          alt="Dead Signal"
        />
        <div>
          <span>ELSEWHERE MESSENGER</span>
          <small>Frutiger Evil edition · CyberStudios</small>
        </div>
        </header>
      )}

      <div className="ds-workspace">
        {(
          loginMain || role === "login" ||
          (!nativeLayout &&
            !closed.includes("login"))
        ) && (
          <WindowFrame
            title="Elsewhere Messenger"
            className="ds-login-window"
            active={active === "login"}
            onActivate={() => setActive("login")}
            onClose={() => closeWindow("login")}
          >
            <form className="ds-login" onSubmit={signIn}>
              <div className="ds-brand">
                <img
                  src={`${ASSETS}/branding/skeletal-fish.png`}
                  alt="Skeletal fish"
                />
                <div>
                  Elsewhere
                  <br />
                  Messenger<sup>™</sup>
                </div>
              </div>

              <div className="ds-login-picture">
                <Avatar name="transmission-tower" size={120} />
              </div>

              {loginMain ? <>
              <label className="ds-field">
                Email address:
                <input
                  type="email"
                  value={loginEmail}
                  maxLength={254}
                  required
                  disabled={loginBusy}
                  onChange={(event) =>
                    setLoginEmail(event.target.value)
                  }
                  autoComplete="email"
                  aria-label="Email address"
                />
              </label>

              <label className="ds-field">
                Password:
                <input
                  type="password"
                  value={loginPassword}
                  maxLength={72}
                  required
                  disabled={loginBusy}
                  onChange={(event) =>
                    setLoginPassword(event.target.value)
                  }
                  autoComplete="current-password"
                  aria-label="Password"
                />
              </label>
              </> : <>
              <label className="ds-field">
                Local display name:
                <input
                  value={identity}
                  maxLength={40}
                  required
                  onChange={(event) =>
                    setIdentity(event.target.value)
                  }
                  autoComplete="off"
                  aria-label="Local display name"
                />
              </label>
              </>}

              <div className="ds-login-status">
                <span>Sign in as:</span>
                <StatusSelect value={presence} onChange={setPresence} />
              </div>

              <div className="ds-checkboxes">
                <label>
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
                <label>
                  <input type="checkbox" disabled />
                  Remember my password
                </label>
                <label>
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
                className="ds-red-button ds-signin"
                type="submit"
                disabled={!ready || loginBusy}
              >
                {loginBusy ? "Signing in…" : !loginMain && signedIn ? "Signed In" : "Sign In"}
              </button>

              {loginMain && loginError && (
                <p className="ds-login-error" role="alert">{loginError}</p>
              )}

              <div className="ds-login-links">
                <button
                  type="button"
                  onClick={() => toolbarAction({ kind: 'accounts', purpose: 'reset-password' })}
                >
                  Forgot your password?
                </button>

                <button
                  type="button"
                  onClick={openSignupPage}
                >
                  Create a new account
                </button>
              </div>

              <small className="ds-login-note">
                {loginMain ? "Sign in with your Elsewhere account." : "Local profile. No password needed."}
              </small>
            </form>
          </WindowFrame>
        )}

        {(
          (nativeMain && !loginMain) ||
          (!nativeLayout &&
            !closed.includes("contacts"))
        ) && (
          <WindowFrame
            title="Elsewhere Messenger"
            className="ds-buddy-window"
            active={active === "contacts"}
            onActivate={() => setActive("contacts")}
            onClose={() => closeWindow("contacts")}
          >
            <ClassicMenuBar
              kind="buddy"
              skin="dead-signal"
              onSignIn={() =>
                openWindow("login")
              }
              onSignOut={
                nativeLayout ? signOut : undefined
              }
              onExit={
                isTauri()
                  ? () => {
                      void getCurrentWindow()
                        .close()
                        .catch(reportNativeError);
                    }
                  : undefined
              }
              contacts={contacts.map((member) => ({
                id: member.id,
                name: member.name,
              }))}
              onContact={chooseContact}
              onExpand={(expanded) =>
                setGroups([expanded, expanded, expanded])
              }
              onOpenSelected={() =>
                openWindow("chat")
              }
              onTestContact={() => {
                setNotification(
                  "Test: cyber is now online."
                );

                playNotificationSound(
                  "contact",
                  preferences
                );
              }}
              onClassic={() => {
                void switchToClassic();
              }}
              onDeadSignal={() => {}}
              preferences={preferences}
              onSoundChange={updateSounds}
            />

            <div className="ds-profile">
              <OwnProfilePhoto owner={coreOwner} service={headerService} remotePhoto={remotePhoto(headerService)}
                skin="dead-signal" size={72} fallback={<Avatar name="crt-skull" size={72} />} />

              <div className="ds-profile-info">
                <strong>{identity}</strong>

                <StatusSelect
                  value={presence}
                  onChange={(next) => {
                    setPresence(next);

                    if (nativeMain) {
                      updateLocalPresence(
                        toLocalPresence(next)
                      );
                    }
                  }}
                />
                <span className="ds-music"><SpotifyProfileStatus fallback="listening to: carrier.wav" /></span>
              </div>
            </div>

            <Toolbar
              tools={buddyTools}
              compact
              nudgeLocalOnly={externalBuddy}
              onAction={buddyAction}
            />
            <ActivitiesMenu anchor={buddyActivities} skin="dead-signal" onClose={() => setBuddyActivities(null)} />

            <SocialServiceFilter value={socialService} onChange={setSocialService} instagramConnected={ig.connected} />
            <div className="ds-contact-panel ds-crt">
              {[
                { title: "Buddies", members: visibleContacts.filter(c => c.group === "Buddies") },
                { title: "Other Contacts", members: visibleContacts.filter(c => c.group === "Other Contacts") },
                { title: "Instagram Chats", members: visibleContacts.filter(c => c.group === "Instagram Chats") },
              ].filter(group => group.title !== "Instagram Chats" || group.members.length).map((group, index) => (
                <div className="ds-group" key={group.title}>
                  <button
                    className="ds-group-heading"
                    onClick={() =>
                      setGroups((previous) =>
                        previous.map((value, i) =>
                          i === index ? !value : value
                        )
                      )
                    }
                    aria-expanded={groups[index]}
                  >
                    <span>{groups[index] ? "▼" : "▶"}</span>
                    {group.title} ({group.members.filter(
                      (member) => member.status !== "offline"
                    ).length}/{group.members.length})
                  </button>

                  {groups[index] &&
                    group.members.map((member) => (
                      <button
                        key={member.id}
                        className={`ds-contact ${
                          (selected === member.name || selected === member.id) ? "ds-selected" : ""
                        }`}
                        onClick={() => chooseContact(member.id)}
                        onContextMenu={member.id.startsWith('instagram:') ? event => { event.preventDefault(); openInstagramContactSettings(member.id.slice('instagram:'.length)) } : undefined}
                      >
                        {member.id.startsWith('instagram:') ? <span className="ew-ig-contact-indicator" style={{backgroundColor:contactAppearance(appearance,member.id.slice('instagram:'.length)).color}} title="Instagram contact · right-click to change its color" /> : <Status status={member.status} />}
                        <InstagramAvatar url={member.avatarUrl} className="ew-ig-contact-avatar" />
                        <span>{member.name}</span>
                        {'preview' in member && member.preview && <small className="ew-contact-preview" title={member.preview}>{member.preview}</small>}
                        {unreadCount(history[member.id]) + (socialUnread[member.id] || 0) > 0 && (
                          <span className="ew-unread">
                            {unreadCount(history[member.id]) + (socialUnread[member.id] || 0)}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </WindowFrame>
        )}

        {(
          role === "chat" ||
          (!nativeLayout &&
            !closed.includes("chat"))
        ) && (
          <WindowFrame
            title={`${contact.name} - Conversation`}
            className="ds-chat-window"
            active={active === "chat"}
            onActivate={() => setActive("chat")}
            onClose={() => closeWindow("chat")}
          >
            <ClassicMenuBar
              kind="chat"
              skin="dead-signal"
              onSignIn={() =>
                openWindow("login")
              }
              onSignOut={
                nativeLayout ? signOut : undefined
              }
              onClose={() =>
                closeWindow("chat")
              }
              onEdit={(action) => {
                void editConversation(action);
              }}
              onClearDraft={() => {
                setDraft("");
                composerRef.current?.focus();
              }}
              onSend={() => sendMessage()}
              onClassic={() => {
                void switchToClassic();
              }}
              onDeadSignal={() => {}}
              preferences={preferences}
              onSoundChange={updateSounds}
            />

            <div className="ds-emoticon-anchor">
              <Toolbar
                tools={conversationTools}
                nudgeLocalOnly={chatService !== 'elsewhere'}
                onAction={(action, anchor) => {
                  if (action === 'Webcam') openPhotoBooth({ contactId: selected || null, contactName: contact?.name, useUnavailable: cloudPerson || cloudGroup ? undefined : 'Sending Booth photos works in chats with Elsewhere friends for now. You can still save the photo.' })
                  else if (action === 'Audio') toolbarAction({ kind: 'call' })
                  else if (action === 'Web Treasures') openWebTreasures()
                  else if (action === 'Activities') setActivitiesAnchor(previous => previous ? null : anchor || null)
                  else if (action === 'Invite' && (cloudPerson || cloudGroup)) setInviteOpen(true)
                  else if (action === 'Nudge') nudgeSelected()
                  else previewAction(action, anchor)
                }}
              />

<MediaPicker
                picker={mediaPicker}
                skin="dead-signal"
                onSend={(media) => sendMessage(media)}
                onClose={() => setMediaPicker(null)}
              />
              <AnchoredEmoticonPicker
                anchor={emoticonAnchor}
                skin="dead-signal"
                onPick={insertEmoticon}
                onClose={() => setEmoticonAnchor(null)}
              />
            </div>

            <div className="ds-chat-layout">
              <div className="ds-chat-main">
                <div className="ds-recipient">
                  To: <strong>{contact.name}</strong>
                  {cloudGroup && <GroupHeaderTools chat={groupChat} onInvite={() => setInviteOpen(true)} />}
                  {inviteOpen && (cloudPerson || cloudGroup) && <InviteDialog skin="dead-signal" onClose={() => setInviteOpen(false)}
                    withPerson={cloudPerson ? { id: cloudPerson, name: contact.name } : undefined}
                    group={cloudGroup && groupChat.group ? { id: cloudGroup, members: groupChat.group.members, add: groupChat.add } : undefined} />}
                  <span>{cloudGroup ? ' · Elsewhere group' : cloudPerson ? ' · Elsewhere' : discordId ? ' · Discord bot channel' : igThreadId ? ' · Instagram' : ` <${selected}@elsewhere.net>`}</span>
                </div>

                <div
                  className="ds-transcript ds-crt"
                  aria-live="polite"
                  ref={(node) => {
                    if (node) node.scrollTop = node.scrollHeight;
                  }}
                >
                  {!ready && (
                    <span className="ds-muted">
                      Connecting to Messenger...
                    </span>
                  )}

                  {cloudGroup ? <GroupTranscript chat={groupChat} skin="dead-signal" /> : cloudPerson ? <>
                    {cloudChat.error && <span role="alert" className="ds-muted">{cloudChat.error}</span>}
                    {!cloudChat.messages.length && !cloudChat.error && <span className="ds-muted">No messages yet.</span>}
                    {cloudChat.messages.map(message => message.kind === 'nudge' ? (
                      <p key={message.id} className="ew-nudge-event">{message.sender_id === cloudChat.userId ? 'You sent a nudge.' : `${contact.name} sent you a nudge!`}</p>
                    ) : (
                      <div className="ds-message" key={message.id}>
                        <div className="ds-message-heading">
                          <strong className={message.sender_id === cloudChat.userId ? 'ds-sender-own' : 'ds-sender-other'}>
                            {message.sender_id === cloudChat.userId ? identity : contact.name}
                          </strong>
                          <span> says ({new Date(message.created_at).toLocaleString()}):</span>
                        </div>
                        {message.kind === 'image' || message.kind === 'gif'
                          ? <ElsewhereMediaMessage message={message} mediaUrl={cloudChat.mediaUrl} />
                          : <div className="ds-message-text">{message.text_body}</div>}
                      </div>
                    ))}
                    {live.typing[cloudPerson] && <p className="ew-typing ds-muted" role="status">{contact.name} is typing…</p>}
                  </> : discordId ? <>
                    {discordChat.error && <span role="alert" className="ds-muted">{discordChat.error}</span>}
                    {discordChat.messages.map(message=><div className="ds-message" key={message.id}>
                      <div className="ds-message-heading"><strong>{message.author?.global_name||message.author?.username||'Discord user'}</strong><span> says ({new Date(message.timestamp).toLocaleString()}):</span></div>
                      <DiscordMessageContent message={message} onReply={target=>{setDiscordReply({id:target.id,summary:(target.content||'[Discord media]').slice(0,100)});composerRef.current?.focus()}} />
                    </div>)}
                  </> : igThreadId ? <>
                    {ig.error && <span role="alert" className="ds-muted">{ig.error}</span>}
                    {!ig.connected && <span className="ds-muted">Connect Instagram through Tools to load this conversation.</span>}
                    {ig.connected && ig.messages.length === 0 && <span className="ds-muted">No messages returned by Meta.</span>}
                    {ig.messages.map(message => <div className="ds-message" key={message.id}>
                      <div className="ds-message-heading">
                        <strong className={message.from?.id === ig.account ? 'ds-sender-own' : 'ds-sender-other'}>{message.from?.id === ig.account ? identity : contact.name}</strong>
                        <span> says ({message.created_time ? new Date(message.created_time).toLocaleString() : ''}):</span>
                      </div>
                      <InstagramMessageContent message={message} allMessages={ig.messages} onReply={target => {setIgReply({id:target.id,summary:(target.message || target.text || "[Instagram media]").slice(0,160)});composerRef.current?.focus()}} />
                    </div>)}
                  </> : <>
                  {ready && (history[selected] ?? []).length === 0 && (
                    <span className="ds-muted">No local messages yet.</span>
                  )}

                  {ready && (history[selected] ?? []).map((message) => message.kind === 'nudge' ? (
                    <p key={message.id} className="ew-nudge-event">{message.own ? 'You sent a nudge.' : message.text}</p>
                  ) : (
                    <div className="ds-message" key={message.id}>
                      <div className="ds-message-heading">
                        <strong
                          className={
                            message.own ? "ds-sender-own" : "ds-sender-other"
                          }
                        >
                          {message.own ? identity : selected}
                        </strong>
                        <span> says ({message.time}):</span>
                      </div>

                      <div
                        className="ds-message-text"
                        style={formatStyle(message.format)}
                      >
                        {message.media ? (
                          <MediaAttachment
                            media={message.media}
                            skin="dead-signal"
                          />
                        ) : (
                          renderClassicText(message.text)
                        )}
                      </div>
                    </div>
                  ))}
                  </>}
                </div>

                <div className="ds-composer">
                  <div className="ds-formatting">
                    <ExpressionLibraries
                      key={JSON.stringify([coreOwner, selected])}
                      skin="dead-signal"
                      owner={coreOwner}
                      draft={draft}
                      format={format}
                      setDraft={setDraft}
                      setFormat={setFormat}
                      composerRef={composerRef}
                      onSend={media => sendMessage(media)}
                    />
                    <button
                      title="Font"
                      onClick={() => previewAction("Font selection")}
                    >
                      A ▾
                    </button>

                    <span className="ds-separator" />

                    {([
                      ["bold", "B", { fontWeight: "bold" }],
                      ["italic", "I", { fontStyle: "italic" }],
                      ["underline", "U", { textDecoration: "underline" }],
                    ] as [FormatToggle, string, CSSProperties][]).map(
                      ([key, label, style]) => (
                        <button
                          key={key}
                          title={key}
                          aria-pressed={format[key]}
                          className={format[key] ? "ds-format-active" : ""}
                          style={style}
                          onClick={() =>
                            setFormat((previous) => ({
                              ...previous,
                              [key]: !previous[key],
                            }))
                          }
                        >
                          {label}
                        </button>
                      )
                    )}

                    <button
                      className="ds-font-color"
                      title="Font color"
                      onClick={() => previewAction("Font color")}
                    >
                      A
                    </button>

                    <span className="ds-separator" />

                    <button
                      title="Emoticons"
                      data-emoticon-trigger
                      onClick={(event) =>
                        openEmoticons(event.currentTarget)
                      }
                    >
                      <Icon name="composer-emoticon" size={16} />
                    </button>

                    <button
                      title="Insert picture"
                      data-media-trigger
                      onClick={(event) =>
                        openMedia(event.currentTarget, "local")
                      }
                    >
                      <Icon name="composer-picture" size={16} />
                    </button>

                    <button
                      className="ew-gif-trigger"
                      title="GIFs and stickers"
                      aria-label="GIFs and stickers"
                      data-media-trigger
                      onClick={(event) =>
                        openMedia(event.currentTarget, "gifs")
                      }
                    >
                      GIF
                    </button>

                    <button
                      title="Gift"
                      onClick={() => previewAction("Gift")}
                    >
                      <Icon name="composer-gift" size={16} />
                    </button>
                  </div>

                  {discordId && discordReply && <div className="ew-ig-compose-reply"><span>↩ Reply to Discord: {discordReply.summary}</span><button type="button" onClick={()=>setDiscordReply(null)}>✕</button></div>}
                  {igThreadId && instagramReplyWindowClosed(ig.messages, ig.account) && <div className="ew-ig-window-notice" role="note">{INSTAGRAM_WINDOW_NOTICE}</div>}
                  {igThreadId && igReply && <div className="ew-ig-compose-reply"><span>↩ Replying to: {igReply.summary}</span><button type="button" onClick={()=>setIgReply(null)} aria-label="Cancel reply">✕</button></div>}
                  <StagedPhotoBar contactId={selected} onSend={media => sendMessage(media)} />
                  <ActivitiesMenu anchor={activitiesAnchor} skin="dead-signal" onClose={() => setActivitiesAnchor(null)} />
                  <div className="ds-compose-row">
                    <textarea
                      ref={composerRef}
                      disabled={!ready}
                      aria-label="Message"
                      value={draft}
                      style={formatStyle(format)}
                      onChange={(event) => { setDraft(event.target.value); if (cloudPerson && event.target.value.trim()) sendElsewhereTyping(cloudPerson) }}
                      onKeyDown={(event) => {
                        if (
                          !event.ctrlKey &&
                          !event.metaKey &&
                          !event.altKey &&
                          !event.nativeEvent.isComposing &&
                          (
                            event.key.length === 1 ||
                            event.key === "Backspace" ||
                            event.key === "Delete" ||
                            event.key === "Enter"
                          )
                        ) {
                          playTypingSound(
                            preferences,
                            event.key,
                            event.key === "Enter" && !event.shiftKey
                          );
                        }

                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage();
                        }

                        if (event.ctrlKey) {
                          const key = event.key.toLowerCase();
                          const property =
                            key === "b"
                              ? "bold"
                              : key === "i"
                                ? "italic"
                                : key === "u"
                                  ? "underline"
                                  : null;

                          if (property) {
                            event.preventDefault();
                            setFormat((previous) => ({
                              ...previous,
                              [property]: !previous[property],
                            }));
                          }
                        }
                      }}
                    />

                    <button
                      className="ds-red-button ds-send"
                      onClick={() => sendMessage()}
                      disabled={!ready}
                    >
                      Send
                    </button>
                  </div>
                </div>

                <div className="ds-chat-footer">
                  <span aria-hidden="true">♧</span>{' '}
                  {cloudPerson ? 'Elsewhere · Online messages aren’t end-to-end encrypted'
                    : discordId ? 'Discord channel · Messages sent as the Elsewhere bot'
                    : igThreadId ? 'Instagram conversation' : 'Local conversation'}
                  <span className="ew-beta-badge">Beta</span>
                </div>
              </div>

              <aside className="ds-chat-avatars">
                <InstagramAvatar url={contact.avatarUrl} className="ew-ig-chat-avatar" alt={`${contact.name} Instagram profile picture`} fallback={<Avatar name={contact.avatar} size={96} />} />

                <div className="ds-avatar-label">
                  {igThreadId?<span className="ew-ig-contact-indicator" style={{backgroundColor:contactAppearance(appearance,igThreadId).color}} title="Instagram presence unavailable" />:<Status status={contact.status} />}
                  <span>{contact.name}</span>
                </div>

                <small>({igThreadId?'Instagram · presence unavailable':contact.status})</small>

                <div className="ds-own-avatar">
                  <OwnProfilePhoto owner={coreOwner} service={chatService} remotePhoto={remotePhoto(chatService)}
                    skin="dead-signal" size={96} fallback={<Avatar name="crt-skull" size={96} />} />
                </div>
              </aside>
            </div>
          </WindowFrame>
        )}
      </div>

      {notification && (
        <aside className="ds-notification">
          <div className="ds-titlebar">
            <Fish />
            <span className="ds-title">Elsewhere Messenger</span>
            <button
              className="ds-close"
              aria-label="Dismiss notification"
              onClick={() => setNotification("")}
            >
              ×
            </button>
          </div>

          <div className="ds-notification-content">
            <Avatar name="red-sunset-palm" size={54} />
            <Status status="online" />
            <span>{notification}</span>
          </div>
        </aside>
      )}

      {!nativeLayout && (
        <footer className="ds-preview-dock">
        <Fish />
        <strong>Dead Signal</strong>

        {([
          ["login", "Sign In"],
          ["contacts", "Contacts"],
          ["chat", "Conversation"],
        ] as [WindowId, string][]).map(([id, label]) => (
          <button key={id} onClick={() => openWindow(id)}>
            {label}
          </button>
        ))}

        <button
          onClick={() => {
            setNotification("cyber is now online.");

            playNotificationSound(
              "contact",
              preferences
            );
          }}
        >
          Test notification
        </button>
        </footer>
      )}
    </main>
  );
}


export default function DeadSignal({
  active = true,
  buddies,
  onChangeSkin = () => {
    window.alert(
      "Skin switching is available in the main Messenger window."
    );
  },
}: {
  active?: boolean;
  buddies?: CloudProfile[];
  onChangeSkin?: (skin: MessengerSkin) => void;
}) {
  return (
    <>
      {active && <style>{deadSignalStyles}</style>}
      <DeadSignalView
        onChangeSkin={onChangeSkin}
        activeSkin={active}
        buddies={buddies}
      />
    </>
  )
}