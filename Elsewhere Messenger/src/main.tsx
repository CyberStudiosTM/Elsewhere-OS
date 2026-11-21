import { invoke, isTauri } from '@tauri-apps/api/core'
import InstagramInbox from './components/InstagramInbox'
import DeadSignal from './skins/dead-signal/DeadSignal'
import { isDeadSignalChild } from './services/deadSignalWindows'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SkinHost from './SkinHost.tsx'
import Classic from './App.tsx'
import { isNativeClassicChat, isNativeClassicLogin } from './services/nativeWindows'
import ToastPopup from './components/ToastPopup'
import { isToastWindow } from './services/toastWindow'

if (isTauri() && !isToastWindow()) void invoke('apply_elsewhere_window_icon').catch(console.error)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isToastWindow() ? <ToastPopup /> : new URLSearchParams(window.location.search).has('instagram-inbox') ? <InstagramInbox /> : isNativeClassicChat() || isNativeClassicLogin() ? <Classic /> : (isDeadSignalChild() ? <DeadSignal /> : <SkinHost />)}
  </StrictMode>,
)
