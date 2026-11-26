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
import PhotoBoothHost from './components/PhotoBooth'
import StudioApp from './studio/StudioApp'
import { isStudioWindow } from './services/studioWindow'
import SkinMapperApp from './skinmapper/SkinMapperApp'
import { isSkinMapperWindow } from './services/skinMapperWindow'
import PixelDollApp from './pixeldoll/PixelDollApp'
import ProfileApp from './profiles/ProfileApp'
import { isProfileWindow } from './services/profiles'
import { isPixelDollWindow } from './services/pixelDollWindow'

if (isTauri() && !isToastWindow()) void invoke('apply_elsewhere_window_icon').catch(console.error)

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('designer-harness')) {
  void import('./profiles/DesignerHarness').then(({ default: Harness }) => createRoot(document.getElementById('root')!).render(<Harness />))
} else createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {!isToastWindow() && !isStudioWindow() && !isSkinMapperWindow() && !isPixelDollWindow() && !isProfileWindow() && <PhotoBoothHost />}
    {isProfileWindow() ? <ProfileApp /> : isPixelDollWindow() ? <PixelDollApp /> : isSkinMapperWindow() ? <SkinMapperApp /> : isStudioWindow() ? <StudioApp /> : isToastWindow() ? <ToastPopup /> : new URLSearchParams(window.location.search).has('instagram-inbox') ? <InstagramInbox /> : isNativeClassicChat() || isNativeClassicLogin() ? <Classic /> : (isDeadSignalChild() ? <DeadSignal /> : <SkinHost />)}
  </StrictMode>,
)
