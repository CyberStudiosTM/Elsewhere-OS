import {useNativeInstagram,instagramContactName} from '../services/instagramNativeBridge'
import {useState} from 'react'
import {readInstagramAppearance,writeInstagramAppearance} from '../services/instagramContactPreferences'

/** Opens the indicator-color dialog for one Instagram contact (right-click the contact in the buddy list). */
export const INSTAGRAM_CONTACT_SETTINGS = 'elsewhere:instagram:settings'
export function openInstagramContactSettings(threadId: string) {
  window.dispatchEvent(new CustomEvent(INSTAGRAM_CONTACT_SETTINGS, { detail: { threadId } }))
}

export default function InstagramContactSettings({onClose,threadId}:{onClose:()=>void;threadId:string}){
 const [appearance,setAppearance]=useState(readInstagramAppearance)
 const ig=useNativeInstagram(null)
 const thread=ig.threads.find(item=>item.id===threadId)
 const name=thread?instagramContactName(thread,ig.account):'this contact'
 const [hex,setHex]=useState(appearance.contacts[threadId]?.color||appearance.defaultColor)
 const good=/^#[0-9a-fA-F]{6}$/.test(hex)
 const save=(next:typeof appearance)=>{writeInstagramAppearance(next);setAppearance(next)}
 const update=(value:string)=>{setHex(value);if(!/^#[0-9a-fA-F]{6}$/.test(value))return;save({...appearance,contacts:{...appearance.contacts,[threadId]:{color:value,favorite:appearance.contacts[threadId]?.favorite||false}}})}
 const useForAll=()=>{if(good)save({...appearance,defaultColor:hex})}
 return <div className="ew-ig-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="ew-ig-connection" role="dialog" aria-modal="true" aria-label={`Indicator color for ${name}`}>
   <header><strong>{name}</strong><button onClick={onClose} aria-label="Close">×</button></header>
   <p>Pick the indicator color for this Instagram contact. It's cosmetic: Instagram doesn't share real-time presence.</p>
   <label>Hex color<input value={hex} onChange={e=>update(e.target.value)} aria-invalid={!good} placeholder="#87E7C0" /></label>
   <label>Color picker<input type="color" value={good?hex:'#87E7C0'} onChange={e=>update(e.target.value)} /></label>
   <label><input type="checkbox" checked={appearance.contacts[threadId]?.favorite||false} onChange={event=>save({...appearance,contacts:{...appearance.contacts,[threadId]:{color:good?hex:appearance.defaultColor,favorite:event.target.checked}}})} /> Pin {name} to Buddies</label>
   <button type="button" className="ew-ig-secondary" disabled={!good} onClick={useForAll}>Use this color for all Instagram contacts</button>
   <p className="ew-ig-note">Mutual follows appear in Buddies only if Meta confirms both relationship fields.</p>
  </section>
 </div>
}
