import { useState } from 'react'
import Designer from './Designer'
import { blankDoc, renderProfile, type ProfileData, type ProfileDoc } from './profileRender'
import './profileRender.css'
import './ProfileApp.css'

// Development only (vite dev server, ?designer-harness): the Visual Designer with sample data, no account needed.
// Never included in the app build.

const sample: ProfileData = {
  status: 'ok', access: 'owner', handle: 'sample', display_name: 'Sample Person', published: true, guestbook_mode: 'everyone', can_sign: false, signed_in: true,
  top_friends: [{ handle: 'sunny_day', display_name: 'sunny' }, { handle: 'poolside', display_name: 'poolside.exe' }],
  guestbook: [{ id: 'g1', body: 'love your page!!', created_at: '2026-11-20T10:00:00Z', handle: 'sunny_day', display_name: 'sunny', mine: false }],
  bulletins: [{ id: 'b1', body: 'new song on my page ♫', created_at: '2026-11-22T10:00:00Z' }],
}

export default function DesignerHarness() {
  const [doc, setDoc] = useState<ProfileDoc>(() => ({ ...blankDoc('original'), headline: 'somewhere between a daydream and a computer screen', about: 'hi! this is a test page.', mood: 'dreamy ☁' }))
  const [view, setView] = useState(false)
  return <div className="pa-app" style={{ gridTemplateRows: 'auto 1fr' }}>
    <div className="pa-titlebar"><span>Designer harness (dev only)</span><button type="button" style={{ width: 'auto' }} onClick={() => setView(v => !v)}>{view ? 'Edit' : 'View as visitor'}</button></div>
    {view
      ? <div key="view" style={{ overflow: 'auto' }} ref={el => { if (el) renderProfile(el, { ...sample, doc }, { profileHref: () => '#' }) }} />
      : <div key="edit" className="pa-body pa-designer"><Designer doc={doc} data={{ ...sample, doc }} dirty onDoc={setDoc} onSave={() => {}} onLeave={() => {}} onError={console.error}
          pickImage={file => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(file) })} /></div>}
  </div>
}
