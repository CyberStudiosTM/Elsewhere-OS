import { useState } from 'react'
import { INSTAGRAM_OPEN } from '../services/instagramWindow'
import { toolbarAction } from '../services/toolbarActions'
import { ToolbarDialog, type ToolbarSkin } from './ToolbarDialogs'
import { openFeedback } from './FeedbackDialog'

const SEEN = 'elsewhere.welcome-seen.v1'
function seen() { try { return localStorage.getItem(SEEN) === 'yes' } catch { return true } }
function markSeen() { try { localStorage.setItem(SEEN, 'yes') } catch { /* shows again next time */ } }

/** Shown once on this PC, the first time someone signs in to the main window. */
export default function WelcomeDialog({ skin, signedIn }: { skin: ToolbarSkin; signedIn: boolean }) {
  const [open, setOpen] = useState(() => !seen())
  if (!open || !signedIn) return null
  const close = () => { markSeen(); setOpen(false) }
  const go = (action: () => void) => { close(); action() }
  return <ToolbarDialog title="Welcome to Elsewhere ♡" skin={skin} onClose={close}>
    <div className="ew-welcome">
      <p><strong>Welcome in!</strong> Elsewhere keeps your conversations in one buddy list. Here’s how to set it up. You can come back to any of this later from the <strong>Tools</strong> menu.</p>
      <ol>
        <li>
          <strong>Add your Elsewhere friends.</strong> Search for someone’s handle and send a contact request.
          <div><button type="button" onClick={() => go(() => toolbarAction({ kind: 'add-contact' }))}>Add a contact…</button></div>
        </li>
        <li>
          <strong>Connect Instagram</strong> to read and reply to your DMs here. It needs a Business or Creator account, and Instagram only allows replies within 24 hours of someone’s last message.
          <div><button type="button" onClick={() => go(() => window.dispatchEvent(new Event(INSTAGRAM_OPEN)))}>Connect Instagram…</button></div>
        </li>
        <li>
          <strong>Connect Discord</strong> to show your Discord name and servers.
          <div><button type="button" onClick={() => go(() => window.dispatchEvent(new Event('elsewhere:discord:open')))}>Connect Discord…</button></div>
        </li>
        <li><strong>Make it yours.</strong> Change the look under <strong>Tools → Skins</strong>, and pick sounds and notifications under <strong>Tools</strong>.</li>
      </ol>
      <p className="ew-feedback-note">Elsewhere Messenger is in beta. If something breaks or you have an idea, use <strong>Help → Send Feedback</strong>.</p>
      <div className="ew-toolbar-actions">
        <button type="button" onClick={() => go(openFeedback)}>Send feedback</button>
        <button type="button" onClick={close}>Let’s go!</button>
      </div>
    </div>
  </ToolbarDialog>
}
