import { isTauri } from '@tauri-apps/api/core'
import {
  getCurrentWindow,
  Window as TauriWindow,
} from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

export const DEAD_SIGNAL_LABELS = {
  login: 'dead-signal-login',
  chat: 'dead-signal-chat',
} as const

export type DeadSignalChild = 'login' | 'chat'

export type DeadSignalRole =
  'main' | 'login' | 'chat' | 'preview'

export function deadSignalRole(): DeadSignalRole {
  if (!isTauri()) return 'preview'

  const label = getCurrentWindow().label

  if (label === DEAD_SIGNAL_LABELS.login) {
    return 'login'
  }

  if (label === DEAD_SIGNAL_LABELS.chat) {
    return 'chat'
  }

  return label === 'main'
    ? 'main'
    : 'preview'
}

export function isDeadSignalChild() {
  const role = deadSignalRole()

  return role === 'login' || role === 'chat'
}

// Serialize window creation and closing.
// Repeated menu clicks cannot create duplicates.

const queues = new Map<string, Promise<void>>()

function enqueue(
  label: string,
  operation: () => Promise<void>
) {
  const task = (
    queues.get(label) ?? Promise.resolve()
  ).then(operation)

  queues.set(
    label,
    task.catch(() => {})
  )

  return task
}

export function openDeadSignalWindow(
  kind: DeadSignalChild
): Promise<void> {
  if (deadSignalRole() !== 'main') {
    return Promise.resolve()
  }

  const label = DEAD_SIGNAL_LABELS[kind]

  return enqueue(label, async () => {
    const existing =
      await TauriWindow.getByLabel(label)

    if (existing) {
      await existing.unminimize()
      await existing.setFocus()
      return
    }

    const login = kind === 'login'

    const child = new WebviewWindow(label, {
      url: 'index.html',

      title: login
        ? 'Elsewhere Messenger - Sign In'
        : 'Elsewhere Messenger - Conversation',

      width: login ? 320 : 620,
      height: login ? 700 : 570,

      minWidth: login ? 290 : 560,
      minHeight: login ? 450 : 480,

      decorations: false,
      resizable: true,
      minimizable: true,
      maximizable: !login,
      closable: true,
      center: true,
      focus: true,
      skipTaskbar: false,
    })

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(
          new Error(
            `Timed out opening ${label}`
          )
        )
      }, 15000)

      function fail(error: unknown) {
        window.clearTimeout(timeout)
        reject(error)
      }

      void child.once(
        'tauri://created',
        () => {
          window.clearTimeout(timeout)
          resolve()
        }
      ).catch(fail)

      void child.once(
        'tauri://error',
        ({ payload }) => fail(
          new Error(String(payload))
        )
      ).catch(fail)
    })
  })
}

export function closeDeadSignalWindow(
  kind: DeadSignalChild
): Promise<void> {
  const label = DEAD_SIGNAL_LABELS[kind]

  return enqueue(label, async () => {
    const child =
      await TauriWindow.getByLabel(label)

    if (child) {
      await child.close()
    }
  })
}

export async function closeDeadSignalWindows() {
  await Promise.all([
    closeDeadSignalWindow('login'),
    closeDeadSignalWindow('chat'),
  ])
}