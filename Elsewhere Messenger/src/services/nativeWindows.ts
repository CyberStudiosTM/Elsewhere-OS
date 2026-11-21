import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

const CHAT_LABEL = 'classic-chat'

let openingChat = false

export function isNativeClassicChat() {
  return isTauri() &&
    getCurrentWindow().label === CHAT_LABEL
}

export function canOpenNativeChat() {
  return isTauri() &&
    getCurrentWindow().label === 'main'
}

export function reportNativeError(error: unknown) {
  console.error('[Elsewhere native windows]', error)

  const message = error instanceof Error
    ? error.message
    : String(error)

  window.alert(`Native window error: ${message}`)
}

export async function openNativeClassicChat() {
  if (!canOpenNativeChat() || openingChat) return

  openingChat = true

  try {
    const existing = await WebviewWindow.getByLabel(CHAT_LABEL)

    if (existing) {
      await existing.unminimize()
      await existing.setFocus()
      openingChat = false
      return
    }

    const chat = new WebviewWindow(CHAT_LABEL, {
      url: 'index.html',
      title: 'Elsewhere Messenger - Conversation',
      width: 600,
      height: 560,
      minWidth: 560,
      minHeight: 480,
      center: true,
      decorations: false,
      resizable: true,
      maximizable: true,
      minimizable: true,
      closable: true,
      skipTaskbar: false,
      focus: true,
    })

    await chat.once('tauri://created', () => {
      openingChat = false
      console.info('Classic native chat created')
    })

    await chat.once('tauri://error', (event) => {
      openingChat = false
      reportNativeError(event.payload)
    })
  } catch (error) {
    openingChat = false
    reportNativeError(error)
  }
}

export async function closeNativeClassicChat() {
  if (!canOpenNativeChat()) return

  if (openingChat) {
    throw new Error(
      'The conversation window is still opening. Try again once it appears.'
    )
  }

  const chat = await WebviewWindow.getByLabel(CHAT_LABEL)

  if (chat) {
    await chat.close()
  }
}

const LOGIN_LABEL = 'classic-login'

let openingLogin = false

export function isNativeClassicLogin() {
  return isTauri() &&
    getCurrentWindow().label === LOGIN_LABEL
}

export async function openNativeClassicLogin() {
  if (!canOpenNativeChat() || openingLogin) return

  openingLogin = true

  try {
    const existing =
      await WebviewWindow.getByLabel(LOGIN_LABEL)

    if (existing) {
      await existing.unminimize()
      await existing.setFocus()
      openingLogin = false
      return
    }

    const login = new WebviewWindow(LOGIN_LABEL, {
      url: 'index.html',
      title: 'Elsewhere Messenger - Sign In',
      width: 310,
      height: 700,
      minWidth: 285,
      minHeight: 450,
      center: true,
      decorations: false,
      resizable: true,
      maximizable: false,
      minimizable: true,
      closable: true,
      skipTaskbar: false,
      focus: true,
    })

    await Promise.all([
      login.once('tauri://created', () => {
        openingLogin = false
        console.info('Classic native sign-in created')
      }),

      login.once('tauri://error', (event) => {
        openingLogin = false
        reportNativeError(event.payload)
      }),
    ])
  } catch (error) {
    openingLogin = false
    reportNativeError(error)
  }
}

export async function closeNativeClassicLogin() {
  if (!canOpenNativeChat()) return

  if (openingLogin) {
    throw new Error(
      'The sign-in window is still opening. Try again once it appears.'
    )
  }

  const login =
    await WebviewWindow.getByLabel(LOGIN_LABEL)

  if (login) {
    await login.close()
  }
}

type MainWindowSkin = 'classic' | 'dead-signal'

let configuredMode: string | null = null

let mainWindowQueue: Promise<void> =
  Promise.resolve()

export function configureMainWindowForSkin(
  skin: MainWindowSkin,
  login = false
): Promise<void> {
  if (!canOpenNativeChat()) {
    return Promise.resolve()
  }

  const mode = `${skin}:${login ? 'login' : 'buddy'}`

  const task = mainWindowQueue.then(async () => {
    const nativeWindow = getCurrentWindow()

    if (configuredMode === mode) return

    if (await nativeWindow.isMaximized()) {
      await nativeWindow.unmaximize()
    }

    await nativeWindow.setMinSize(null)
    await nativeWindow.setDecorations(false)
    await nativeWindow.setMaximizable(!login)

    if (login) {
      await nativeWindow.setSize(
        new LogicalSize(
          skin === 'classic' ? 310 : 320,
          700
        )
      )

      await nativeWindow.setMinSize(
        new LogicalSize(285, 450)
      )
    } else {
      await nativeWindow.setSize(
        skin === 'classic'
          ? new LogicalSize(310, 540)
          : new LogicalSize(320, 570)
      )

      await nativeWindow.setMinSize(
        new LogicalSize(310, 420)
      )
    }

    await nativeWindow.center()
    await nativeWindow.show()
    await nativeWindow.setFocus()

    configuredMode = mode
  })

  mainWindowQueue = task.catch(() => {})

  return task
}