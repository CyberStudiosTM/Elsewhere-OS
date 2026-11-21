import {
  keyKind,
  playImportedKey,
  warmSoundPack,
} from './soundPacks'

import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'

export const typingSounds = [
  { id: 'off', label: 'Off' },
  { id: 'classic', label: 'Classic Keyboard' },
  { id: 'mechanical', label: 'Mechanical Keyboard' },
  { id: 'bubble', label: 'Soft Bubble' },
  { id: 'retro', label: 'Retro Computer' },
  { id: 'digital', label: 'Digital Beep' },

  // Vintage
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'phone', label: 'Vintage Phone Tap' },

  // Desktop keyboards
  { id: 'soft-keys', label: 'Soft Keyboard' },
  { id: 'clicky-keys', label: 'Clicky Keyboard' },

  // Mechanical keyboard ASMR
  { id: 'creamy', label: 'Creamy' },
  { id: 'thocky', label: 'Thocky' },
  { id: 'clacky', label: 'Clacky' },
  { id: 'marble', label: 'Marble' },

  // Sensory ASMR
  { id: 'bubble-wrap', label: 'Bubble Wrap' },
  { id: 'raindrop', label: 'Raindrop' },
  { id: 'crystal', label: 'Crystal' },
  { id: 'paper', label: 'Paper Tap' },

  // Original GX-inspired audio
  { id: 'cyber-soft', label: 'Cyber Soft' },
  { id: 'cyber-click', label: 'Cyber Click' },
  { id: 'cyber-terminal', label: 'Cyber Terminal' },
] as const

export type TypingSound =
  (typeof typingSounds)[number]['id']

export const notificationSounds = [
  { id: 'off', label: 'Off' },
  { id: 'chime', label: 'Classic Chime' },
  { id: 'pop', label: 'Soft Pop' },
  { id: 'glass', label: 'Glass Bell' },
  { id: 'ping', label: 'Digital Ping' },
  { id: 'knock', label: 'Gentle Knock' },
  { id: 'dream', label: 'Dream Shimmer' },
  { id: 'messenger-bell', label: 'Messenger Bell' },
  { id: 'message-drop', label: 'Message Drop' },
  { id: 'aqua', label: 'Aqua Chime' },
  { id: 'desktop-ding', label: 'Desktop Ding' },
  { id: 'retro-mail', label: 'Retro Mail' },
  { id: 'pixie', label: 'Pixie Sparkle' },
  { id: 'crt-alert', label: 'CRT Alert' },
  { id: 'signal-blip', label: 'Signal Blip' },
  { id: 'rubber-stamp', label: 'Rubber Stamp' },
  { id: 'vhs-click', label: 'VHS Click' },
  { id: 'glass-drop', label: 'Glass Droplet' },
  { id: 'tiny-typewriter', label: 'Tiny Typewriter' },
] as const

export type NotificationSound =
  (typeof notificationSounds)[number]['id']

export type NotificationChannel =
  'incoming' | 'outgoing' | 'contact'

export type SoundPreferences = {
  typing: TypingSound
  volume: number
  incoming: NotificationSound
  outgoing: NotificationSound
  contact: NotificationSound
  packId: string | null
  typewriterBell: boolean
  notificationClips: Record<
    NotificationChannel,
    string | null
  >
}

const STORAGE_KEY = 'elsewhere.sound.preferences'


const DEFAULTS: SoundPreferences = {
  typing: 'off',
  volume: 35,
  incoming: 'off',
  outgoing: 'off',
  contact: 'off',
  packId: null,
  typewriterBell: false,
  notificationClips: {
    incoming: null,
    outgoing: null,
    contact: null,
  },
}

function normalize(
  value: unknown
): SoundPreferences {
  if (!value || typeof value !== 'object') {
    return DEFAULTS
  }

  const candidate =
    value as Partial<SoundPreferences>

  const typing = typingSounds.some(
    (sound) => sound.id === candidate.typing
  )
    ? candidate.typing!
    : DEFAULTS.typing

  const volume =
    typeof candidate.volume === 'number' &&
    Number.isFinite(candidate.volume)
      ? Math.min(
          100,
          Math.max(0, candidate.volume)
        )
      : DEFAULTS.volume

  function notification(
    value: unknown
  ): NotificationSound {
    return notificationSounds.some(
      (sound) => sound.id === value
    )
      ? value as NotificationSound
      : 'off'
  }

  return {
    typing,
    volume,
    incoming: notification(candidate.incoming),
    outgoing: notification(candidate.outgoing),
    contact: notification(candidate.contact),

    packId:
      typeof candidate.packId === 'string' &&
      candidate.packId.length <= 100
        ? candidate.packId
        : null,

    notificationClips: {
      incoming:
        typeof candidate.notificationClips?.incoming === 'string'
          ? candidate.notificationClips.incoming
          : null,
      outgoing:
        typeof candidate.notificationClips?.outgoing === 'string'
          ? candidate.notificationClips.outgoing
          : null,
      contact:
        typeof candidate.notificationClips?.contact === 'string'
          ? candidate.notificationClips.contact
          : null,
    },

    typewriterBell:
      candidate.typewriterBell === true,
  }
}

export type AudioSkin =
  'classic' | 'dead-signal'

export type AudioProfile =
  'shared' | AudioSkin

export type AudioMode =
  'shared' | 'independent'

type AudioProfiles = {
  mode: AudioMode
  profiles: Record<AudioProfile, SoundPreferences>
}

const PROFILE_KEY = 'elsewhere.sound.profiles.v1'
const PROFILE_EVENT = 'elsewhere:sound:profiles-changed'
const LOCAL_PROFILE_EVENT = 'elsewhere:sound:local-profiles'

function readLegacyPreferences() {
  try {
    return normalize(
      JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? 'null'
      )
    )
  } catch {
    return normalize(DEFAULTS)
  }
}

function migratedProfiles(): AudioProfiles {
  const previous = readLegacyPreferences()

  return {
    mode: 'shared',
    profiles: {
      shared: normalize(previous),
      classic: normalize(previous),
      'dead-signal': normalize(previous),
    },
  }
}

let fallback = migratedProfiles()

function readProfiles(): AudioProfiles {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)

    if (!raw) return fallback

    const parsed = JSON.parse(raw)

    if (!parsed?.profiles) return fallback

    return {
      mode:
        parsed.mode === 'independent'
          ? 'independent'
          : 'shared',

      profiles: {
        shared: normalize(parsed.profiles.shared),
        classic: normalize(parsed.profiles.classic),
        'dead-signal': normalize(
          parsed.profiles['dead-signal']
        ),
      },
    }
  } catch {
    return fallback
  }
}

function saveProfiles(next: AudioProfiles) {
  fallback = next

  try {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify(next)
    )
  } catch (error) {
    console.error('Cannot persist sound profiles:', error)
  }

  window.dispatchEvent(
    new Event(LOCAL_PROFILE_EVENT)
  )

  if (isTauri()) {
    void emit(PROFILE_EVENT).catch(console.error)
  }
}

/** Sound settings currently in effect (shared, or the active skin's own). */
export function currentSoundPreferences(): SoundPreferences {
  const store = readProfiles()
  if (store.mode === 'shared') return store.profiles.shared
  let skin: AudioSkin = 'classic'
  try { if (localStorage.getItem('elsewhere.messenger.skin') === 'dead-signal') skin = 'dead-signal' } catch { /* classic */ }
  return store.profiles[skin]
}

export function useAudioProfiles() {
  const [store, setStore] =
    useState(readProfiles)

  useEffect(() => {
    let disposed = false
    let remove: (() => void) | undefined

    function refresh() {
      if (!disposed) setStore(readProfiles())
    }

    function storage(event: StorageEvent) {
      if (event.key === PROFILE_KEY) refresh()
    }

    window.addEventListener(
      LOCAL_PROFILE_EVENT,
      refresh
    )

    window.addEventListener('storage', storage)

    if (isTauri()) {
      void listen(PROFILE_EVENT, refresh)
        .then((unlisten) => {
          if (disposed) unlisten()
          else remove = unlisten
        })
        .catch(console.error)
    }

    refresh()

    return () => {
      disposed = true

      window.removeEventListener(
        LOCAL_PROFILE_EVENT,
        refresh
      )

      window.removeEventListener(
        'storage',
        storage
      )

      remove?.()
    }
  }, [])

  return store
}

export function setAudioMode(mode: AudioMode) {
  const store = readProfiles()

  saveProfiles({
    ...store,
    mode,
  })
}

export function copyAudioProfile(
  from: AudioProfile,
  to: AudioProfile
) {
  if (from === to) return

  const store = readProfiles()

  saveProfiles({
    ...store,
    profiles: {
      ...store.profiles,
      [to]: normalize(store.profiles[from]),
    },
  })
}

export function clearSoundPackReferences(id: string) {
  const store = readProfiles()

  for (
    const key of [
      'shared',
      'classic',
      'dead-signal',
    ] as const
  ) {
    const profile = store.profiles[key]

    const notificationClips = {
      ...profile.notificationClips,
    }

    for (
      const channel of [
        'incoming',
        'outgoing',
        'contact',
      ] as const
    ) {
      if (notificationClips[channel] === id) {
        notificationClips[channel] = null
      }
    }

    store.profiles[key] = {
      ...profile,
      notificationClips,
      packId:
        profile.packId === id
          ? null
          : profile.packId,
    }
  }

  saveProfiles(store)
}

export function useSoundPreferences(
  skin: AudioSkin = 'classic'
) {
  const store = useAudioProfiles()

  const active: AudioProfile =
    store.mode === 'shared'
      ? 'shared'
      : skin

  const preferences = store.profiles[active]

  useEffect(() => {
    if (preferences.packId) {
      void warmSoundPack(
        preferences.packId
      ).catch(console.error)
    }

    for (
      const id of Object.values(
        preferences.notificationClips
      )
    ) {
      if (id) {
        void warmSoundPack(id)
          .catch(console.error)
      }
    }
  }, [preferences])

  function update(
    changes: Partial<SoundPreferences>
  ) {
    // Read the latest stored profile instead of
    // overwriting another window's newer state.

    const latest = readProfiles()

    const key: AudioProfile =
      latest.mode === 'shared'
        ? 'shared'
        : skin

    const previous = latest.profiles[key]

    const notificationClips = {
      ...previous.notificationClips,
      ...changes.notificationClips,
    }

    for (
      const channel of [
        'incoming',
        'outgoing',
        'contact',
      ] as const
    ) {
      if (
        changes[channel] !== undefined &&
        changes.notificationClips === undefined
      ) {
        notificationClips[channel] = null
      }
    }

    const next = normalize({
      ...previous,

      ...(
        changes.typing !== undefined &&
        changes.packId === undefined
          ? { packId: null }
          : {}
      ),

      ...changes,
      notificationClips,
    })

    saveProfiles({
      ...latest,
      profiles: {
        ...latest.profiles,
        [key]: next,
      },
    })
  }

  return {
    preferences,
    update,
  }
}
// Original synthesized audio.
// No external sound assets required.

let audio: AudioContext | undefined

async function getAudio() {
  audio ??= new AudioContext()

  if (audio.state === 'suspended') {
    await audio.resume()
  }

  return audio
}

function tone(
  context: AudioContext,
  type: OscillatorType,
  startFrequency: number,
  endFrequency: number,
  duration: number,
  volume: number,
  delay = 0
) {
  const start =
    context.currentTime + delay

  const oscillator =
    context.createOscillator()

  const gain =
    context.createGain()

  oscillator.type = type

  oscillator.frequency.setValueAtTime(
    startFrequency,
    start
  )

  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, endFrequency),
    start + duration
  )

  gain.gain.setValueAtTime(
    0.0001,
    start
  )

  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, volume),
    start + 0.003
  )

  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    start + duration
  )

  oscillator.connect(gain)
  gain.connect(context.destination)

  oscillator.start(start)
  oscillator.stop(start + duration + 0.01)
}

function noise(
  context: AudioContext,
  duration: number,
  frequency: number,
  volume: number,
  delay = 0
) {
  const count = Math.ceil(
    context.sampleRate * duration
  )

  const buffer = context.createBuffer(
    1,
    count,
    context.sampleRate
  )

  const samples =
    buffer.getChannelData(0)

  for (let i = 0; i < count; i++) {
    const envelope =
      Math.exp(-i / (count * 0.18))

    samples[i] =
      (Math.random() * 2 - 1) *
      envelope
  }

  const source =
    context.createBufferSource()

  const filter =
    context.createBiquadFilter()

  const gain =
    context.createGain()

  source.buffer = buffer

  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = 0.8

  gain.gain.value = volume

  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)

  source.start(
    context.currentTime + delay
  )
}

function playBuiltInTypingSound(
  preferences: SoundPreferences
) {
  if (
    preferences.typing === 'off' ||
    preferences.volume === 0
  ) return

  void getAudio().then((context) => {
    const volume =
      preferences.volume / 100

    // Vary each new keystroke slightly.
    // Existing sound presets are unchanged.

    const variation =
      0.94 + Math.random() * 0.12

    const intensity =
      volume * (0.85 + Math.random() * 0.15)

    function hit(
      duration: number,
      frequency: number,
      level: number,
      delay = 0
    ) {
      noise(
        context,
        duration,
        frequency * variation,
        intensity * level,
        delay
      )
    }

    function ring(
      type: OscillatorType,
      from: number,
      to: number,
      duration: number,
      level: number,
      delay = 0
    ) {
      tone(
        context,
        type,
        from * variation,
        to * variation,
        duration,
        intensity * level,
        delay
      )
    }

    switch (preferences.typing) {
      case 'classic':
        noise(
          context,
          0.045,
          1900,
          volume * 0.22
        )

        tone(
          context,
          'triangle',
          150,
          70,
          0.025,
          volume * 0.025
        )
        break

      case 'mechanical':
        noise(
          context,
          0.065,
          2800,
          volume * 0.30
        )

        noise(
          context,
          0.035,
          800,
          volume * 0.17,
          0.025
        )
        break

      case 'bubble':
        tone(
          context,
          'sine',
          500,
          1050,
          0.085,
          volume * 0.09
        )
        break

      case 'retro':
        tone(
          context,
          'triangle',
          420,
          280,
          0.055,
          volume * 0.07
        )

        noise(
          context,
          0.025,
          1200,
          volume * 0.12
        )
        break

      // TYPEWRITER
      // Metallic impact and mechanical rebound.

      case 'typewriter':
        hit(0.022, 3500, 0.30)
        hit(0.065, 1100, 0.23, 0.004)

        ring(
          'triangle',
          310,
          110,
          0.045,
          0.09
        )

        hit(0.020, 4300, 0.13, 0.045)
        break

      // VINTAGE PHONE
      // Original early touchscreen-inspired tap.

      case 'phone':
        hit(0.012, 2400, 0.09)

        ring(
          'sine',
          1150,
          720,
          0.024,
          0.085
        )

        ring(
          'triangle',
          2000,
          1150,
          0.010,
          0.023
        )
        break

      // SOFT KEYBOARD
      // Muted, low-impact laptop-style typing.

      case 'soft-keys':
        hit(0.026, 1400, 0.15)

        ring(
          'sine',
          170,
          85,
          0.025,
          0.045
        )

        hit(0.015, 900, 0.05, 0.014)
        break

      // CLICKY KEYBOARD
      // A crisp switch click and subtle release.

      case 'clicky-keys':
        hit(0.018, 4600, 0.30)
        hit(0.028, 2300, 0.13, 0.006)
        hit(0.012, 3900, 0.09, 0.027)
        break

      // CREAMY
      // Rounded, smooth mechanical switch.

      case 'creamy':
        hit(0.044, 850, 0.20)

        ring(
          'sine',
          260,
          135,
          0.043,
          0.075
        )

        hit(0.016, 1600, 0.065, 0.020)
        break

      // THOCKY
      // Deep, hollow keyboard bottom-out.

      case 'thocky':
        hit(0.055, 520, 0.25)

        ring(
          'triangle',
          160,
          65,
          0.060,
          0.085
        )

        hit(0.025, 950, 0.08, 0.023)
        break

      // CLACKY
      // Bright plastic keycap impact.

      case 'clacky':
        hit(0.022, 3900, 0.27)

        ring(
          'triangle',
          680,
          390,
          0.025,
          0.045
        )

        hit(0.022, 2400, 0.14, 0.018)
        break

      // MARBLE
      // Smooth, hollow stone-like tapping.

      case 'marble':
        hit(0.018, 1800, 0.12)

        ring(
          'sine',
          740,
          440,
          0.052,
          0.08
        )

        ring(
          'sine',
          1480,
          900,
          0.026,
          0.026
        )
        break

      // BUBBLE WRAP
      // Short, satisfying air-pocket pop.

      case 'bubble-wrap':
        hit(0.018, 2900, 0.23)

        ring(
          'sine',
          460,
          140,
          0.045,
          0.075
        )
        break

      // RAINDROP
      // A soft water-like droplet.

      case 'raindrop':
        ring(
          'sine',
          470,
          1500,
          0.075,
          0.065
        )

        hit(0.018, 1600, 0.04)
        break

      // CRYSTAL
      // Delicate, glassy resonance.

      case 'crystal':
        ring(
          'sine',
          1900,
          1650,
          0.070,
          0.045
        )

        ring(
          'sine',
          2850,
          2500,
          0.039,
          0.020
        )

        hit(0.010, 3500, 0.055)
        break

      // PAPER TAP
      // Soft rustle and muted tactile impact.

      case 'paper':
        hit(0.075, 950, 0.16)
        hit(0.028, 2200, 0.08, 0.008)
        break

      // CYBER SOFT
      // Subtle futuristic UI feedback.

      case 'cyber-soft':
        ring(
          'sine',
          520,
          980,
          0.045,
          0.055
        )

        hit(0.017, 1800, 0.07)
        break

      // CYBER CLICK
      // Sharp, futuristic computer interface.

      case 'cyber-click':
        hit(0.018, 3300, 0.17)

        ring(
          'triangle',
          1450,
          800,
          0.027,
          0.045
        )

        ring(
          'sine',
          650,
          450,
          0.025,
          0.025,
          0.012
        )
        break

      // CYBER TERMINAL
      // A miniature science-fiction CRT terminal.

      case 'cyber-terminal':
        ring(
          'square',
          480,
          380,
          0.025,
          0.022
        )

        ring(
          'triangle',
          960,
          720,
          0.033,
          0.025,
          0.018
        )

        hit(0.015, 1900, 0.07)
        break

      case 'digital':
        tone(
          context,
          'square',
          880,
          880,
          0.035,
          volume * 0.035
        )
        break
    }
  }).catch(console.error)
}

export function prepareNotificationAudio(
  preferences: SoundPreferences
) {
  if (
    (
      preferences.outgoing === 'off' &&
      !preferences.notificationClips.outgoing
    ) ||
    preferences.volume === 0
  ) return

  void getAudio().catch(console.error)
}

function playBuiltInNotificationSound(
  channel: NotificationChannel,
  preferences: SoundPreferences
) {
  const selected = preferences[channel]

  if (
    selected === 'off' ||
    preferences.volume === 0
  ) return

  void getAudio().then((context) => {
    const volume =
      preferences.volume / 100

    switch (selected) {
      case 'chime':
        tone(
          context, 'sine',
          659.25, 659.25,
          0.15, volume * 0.10
        )

        tone(
          context, 'sine',
          880, 880,
          0.20, volume * 0.09,
          0.10
        )
        break

      case 'pop':
        tone(
          context, 'sine',
          680, 300,
          0.09, volume * 0.11
        )

        noise(
          context,
          0.025, 1600,
          volume * 0.04
        )
        break

      case 'glass':
        tone(
          context, 'sine',
          1318, 1318,
          0.25, volume * 0.055
        )

        tone(
          context, 'sine',
          1977, 1977,
          0.17, volume * 0.025
        )
        break

      case 'ping':
        tone(
          context, 'triangle',
          1046, 1046,
          0.075, volume * 0.065
        )

        tone(
          context, 'sine',
          1568, 1568,
          0.10, volume * 0.045,
          0.065
        )
        break

      case 'knock':
        noise(
          context,
          0.055, 650,
          volume * 0.18
        )

        tone(
          context, 'sine',
          190, 70,
          0.09, volume * 0.08
        )
        break

      case 'messenger-bell':
        tone(context, 'sine', 784, 784, 0.14, volume * 0.09)
        tone(context, 'triangle', 1046, 1046, 0.20, volume * 0.055, 0.11)
        break

      case 'message-drop':
        tone(context, 'sine', 1000, 260, 0.13, volume * 0.10)
        noise(context, 0.020, 1700, volume * 0.05)
        break

      case 'aqua':
        tone(context, 'sine', 400, 920, 0.13, volume * 0.07)
        tone(context, 'sine', 960, 1440, 0.19, volume * 0.045, 0.10)
        break

      case 'desktop-ding':
        tone(context, 'triangle', 1175, 1175, 0.22, volume * 0.065)
        tone(context, 'sine', 2350, 2350, 0.11, volume * 0.025)
        break

      case 'retro-mail':
        tone(context, 'triangle', 440, 440, 0.07, volume * 0.07)
        tone(context, 'triangle', 659, 659, 0.07, volume * 0.07, 0.08)
        tone(context, 'sine', 880, 880, 0.18, volume * 0.07, 0.16)
        break

      case 'pixie':
        tone(context, 'sine', 1318, 1318, 0.12, volume * 0.045)
        tone(context, 'sine', 1760, 1760, 0.16, volume * 0.045, 0.06)
        tone(context, 'sine', 2637, 2637, 0.20, volume * 0.030, 0.12)
        break

      case 'crt-alert':
        tone(context, 'square', 390, 390, 0.07, volume * 0.025)
        tone(context, 'square', 520, 520, 0.07, volume * 0.025, 0.11)
        noise(context, 0.025, 1400, volume * 0.08, 0.18)
        break

      case 'signal-blip':
        tone(context, 'triangle', 720, 980, 0.08, volume * 0.08)
        tone(context, 'sine', 1250, 920, 0.06, volume * 0.055, 0.10)
        break

      case 'rubber-stamp':
        noise(context, 0.05, 530, volume * 0.20)
        tone(context, 'sine', 190, 80, 0.10, volume * 0.10)
        noise(context, 0.025, 850, volume * 0.06, 0.055)
        break

      case 'vhs-click':
        noise(context, 0.055, 920, volume * 0.15)
        noise(context, 0.018, 3100, volume * 0.15, 0.04)
        tone(context, 'triangle', 260, 110, 0.05, volume * 0.05)
        break

      case 'glass-drop':
        tone(context, 'sine', 1700, 1250, 0.20, volume * 0.06)
        tone(context, 'sine', 2550, 1875, 0.11, volume * 0.025)
        noise(context, 0.02, 2300, volume * 0.05)
        break

      case 'tiny-typewriter':
        noise(context, 0.020, 3200, volume * 0.22)
        noise(context, 0.045, 1000, volume * 0.15, 0.02)
        tone(context, 'sine', 1600, 1600, 0.19, volume * 0.04, 0.075)
        break

      case 'dream':
        tone(
          context, 'sine',
          523.25, 523.25,
          0.30, volume * 0.055
        )

        tone(
          context, 'sine',
          783.99, 783.99,
          0.32, volume * 0.045,
          0.075
        )

        tone(
          context, 'sine',
          1046.50, 1046.50,
          0.35, volume * 0.035,
          0.15
        )
        break
    }
  }).catch(console.error)
}

export function playTypingSound(
  preferences: SoundPreferences,
  key = 'a',
  sendEnter = false
) {
  if (preferences.volume <= 0) return

  if (preferences.packId) {
    const id = preferences.packId

    void getAudio().then(async (context) => {
      let handled = false

      try {
        handled = await playImportedKey(
          context,
          id,
          keyKind(key),
          preferences.volume / 100
        )
      } catch (error) {
        console.error('Custom typing sound failed:', error)
      }

      if (!handled && !sendEnter) {
        playBuiltInTypingSound(preferences)
      }
    }).catch(console.error)

    return
  }

  // Preserve original built-in typing behavior.
  // Sending a message was previously silent for typing.

  if (!sendEnter) {
    playBuiltInTypingSound(preferences)
  }

  if (
    key === 'Enter' &&
    preferences.typing === 'typewriter' &&
    preferences.typewriterBell
  ) {
    void getAudio().then((context) => {
      const volume = preferences.volume / 100

      tone(
        context,
        'sine',
        1760,
        1760,
        0.18,
        volume * 0.055
      )

      tone(
        context,
        'triangle',
        2640,
        2640,
        0.10,
        volume * 0.025
      )
    }).catch(console.error)
  }
}
export function playNotificationSound(
  channel: NotificationChannel,
  preferences: SoundPreferences
) {
  if (preferences.volume <= 0) return

  const custom =
    preferences.notificationClips[channel]

  if (!custom) {
    playBuiltInNotificationSound(
      channel,
      preferences
    )

    return
  }

  void getAudio().then(async (context) => {
    try {
      const handled = await playImportedKey(
        context,
        custom,
        'letter',
        preferences.volume / 100
      )

      if (!handled) {
        playBuiltInNotificationSound(
          channel,
          preferences
        )
      }
    } catch (error) {
      console.error('Custom notification failed:', error)

      playBuiltInNotificationSound(
        channel,
        preferences
      )
    }
  }).catch(console.error)
}