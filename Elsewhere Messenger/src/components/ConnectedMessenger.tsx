import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { openUrl } from '@tauri-apps/plugin-opener'
import { isTauri } from '@tauri-apps/api/core'
import {
  ACCOUNT_SIGNUP_URL, ELSEWHERE_BUDDY_PREFIX, MIN_PASSWORD_LENGTH, acceptCloudTerms, answerCloudFriend, blockCloudAccount,
  canRememberAccount, cloud, cloudReady, cloudAccountStatus, currentCloudUser, setCloudPassword, forgetElsewhereAccount,
  getMyCloudProfile, listSavedAccounts, loadCloudBlocks, loadCloudFriends, lookupCloudProfiles, registerCloudHandle,
  removeCloudFriend, reportCloudAccount, requestCloudFriend, searchCloudContact, sendLoginCode, switchElsewhereAccount,
  verifyLoginCode, watchSavedAccounts, type CloudProfile,
} from '../services/connectedClient'
import { completeMainSignIn, deleteMainAccount, signOutMain } from '../services/mainAccount'
import { OPEN_TOOLBAR_CONTACT, ToolbarDialog } from './ToolbarDialogs'
import './ConnectedMessenger.css'

type Mode = 'accounts' | 'new-dm' | 'add-contact'
type Props = { onClose: () => void; skin: 'classic' | 'dead-signal'; mode?: Mode; personId?: string; resetPassword?: boolean }
type Run = (action: () => Promise<void>) => Promise<void>
function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}
/** Signs the main window in as the account now active in Accounts, once it is fully set up. */
async function syncMainWindow() {
  const user = await currentCloudUser()
  if (user) await completeMainSignIn(user)
}

export default function ConnectedMessenger({ onClose, skin, mode = 'accounts', resetPassword }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(cloudReady)
  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [accounts, setAccounts] = useState(listSavedAccounts)
  const [title, setTitle] = useState('Elsewhere Account')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!cloud) return
    let alive = true
    const update = (person: User | null) => {
      if (!alive) return
      setUser(person?.email_confirmed_at ? person : null)
      setChecking(false)
    }
    const { data } = cloud.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') update(session?.user ?? null)
    })
    const stop = watchSavedAccounts(() => setAccounts(listSavedAccounts()))
    void currentCloudUser().then(update).catch(cause => {
      if (!alive) return
      setError(errorText(cause))
      setChecking(false)
    })
    return () => { alive = false; data.subscription.unsubscribe(); stop() }
  }, [])

  const run: Run = async action => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await action() }
    catch (cause) { setError(errorText(cause)) }
    finally { busyRef.current = false; setBusy(false) }
  }

  const signingIn = !user || adding
  const shownTitle = !cloudReady ? 'Elsewhere Accounts'
    : checking ? 'Elsewhere Account'
      : needsPassword ? 'Choose Your Password'
        : deleting && user ? 'Delete Your Account'
        : signingIn ? (resetPassword && !user ? 'Reset Your Password' : 'Sign In to Elsewhere')
          : title

  return <ToolbarDialog title={shownTitle} skin={skin} onClose={onClose}>
    <div className="ew-account">
      {!cloudReady ? <p>This build was made without the Elsewhere Accounts settings, so signing in isn’t available.</p>
        : checking ? <p>Checking your sign-in…</p>
          : needsPassword ? <ChoosePassword busy={busy} run={run} onDone={() => { setNeedsPassword(false); setAdding(false); setChoosing(false) }} />
            : deleting && user ? <DeleteAccount busy={busy} run={run} email={user.email || ''} onCancel={() => setDeleting(false)} />
            : signingIn ? <SignIn busy={busy} run={run} resetPassword={resetPassword && !user}
              onVerified={() => setNeedsPassword(true)} onCancel={user ? () => setAdding(false) : undefined} />
              : <CloudInbox key={user.id} userId={user.id} mode={mode} run={run} busy={busy} setTitle={setTitle} onClose={onClose}
                accountBar={<div className="ew-account-bar">
                  <button type="button" disabled={busy} aria-expanded={choosing}
                    onClick={() => setChoosing(value => !value)}>Switch accounts</button>
                  <button type="button" disabled={busy} onClick={() => void run(() => signOutMain())}>Sign out</button>
                  <button type="button" className="ew-account-danger" disabled={busy} onClick={() => { setChoosing(false); setDeleting(true) }}>Delete account…</button>
                </div>} />}
      {cloudReady && !checking && !needsPassword && !deleting && choosing && <fieldset className="ew-account-list">
        <legend>Accounts on this PC</legend>
        {accounts.map(account => <div className="ew-account-row" key={account.id}>
          <button type="button" disabled={busy || user?.id === account.id} onClick={() => void run(async () => {
            await switchElsewhereAccount(account.id)
            setAdding(false)
            setChoosing(false)
            await syncMainWindow()
          })}>{account.email}{user?.id === account.id ? ' · Active' : ''}</button>
          {user?.id !== account.id && <button type="button" disabled={busy} aria-label={`Forget ${account.email}`}
            onClick={() => void run(() => forgetElsewhereAccount(account.id))}>Forget</button>}
        </div>)}
        <button type="button" disabled={busy} onClick={() => { setAdding(true); setChoosing(false) }}>Add another account…</button>
      </fieldset>}
      {error && <p className="ew-account-error" role="alert">{error}</p>}
    </div>
  </ToolbarDialog>
}

function DeleteAccount({ busy, run, email, onCancel }: { busy: boolean; run: Run; email: string; onCancel: () => void }) {
  const [password, setPassword] = useState('')
  const [sure, setSure] = useState(false)
  return <form className="ew-account-form" onSubmit={event => {
    event.preventDefault()
    void run(() => deleteMainAccount(password))
  }}>
    <p>This permanently deletes <strong>{email}</strong> from Elsewhere: your handle, contacts, blocks and every Elsewhere message you sent or received. Your Instagram and Discord sign-ins saved on this PC are removed too.</p>
    <p>It can’t be undone. Your Instagram and Discord accounts themselves aren’t touched.</p>
    <label>Password: <input type="password" autoComplete="current-password" maxLength={72}
      value={password} onChange={event => setPassword(event.target.value)} required /></label>
    <label className="ew-account-check"><input type="checkbox" checked={sure} onChange={event => setSure(event.target.checked)} /> I understand this can’t be undone</label>
    <div className="ew-account-actions">
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="submit" className="ew-account-danger" disabled={busy || !sure || !password}>Delete my account</button>
    </div>
  </form>
}

function ChoosePassword({ busy, run, onDone }: { busy: boolean; run: Run; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  return <form className="ew-account-form" onSubmit={event => {
    event.preventDefault()
    void run(async () => {
      if (password !== confirm) throw new Error('The passwords don’t match.')
      await setCloudPassword(password)
      setPassword('')
      setConfirm('')
      onDone()
      await syncMainWindow()
    })
  }}>
    <p>You’ll use your email and this password to sign in to Elsewhere Messenger.</p>
    <label>New password: <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72}
      value={password} onChange={event => setPassword(event.target.value)} required /></label>
    <label>Confirm password: <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72}
      value={confirm} onChange={event => setConfirm(event.target.value)} required /></label>
    <div className="ew-account-actions"><button type="submit" disabled={busy}>Save password</button></div>
  </form>
}

function SignIn({ busy, run, onVerified, onCancel, resetPassword }: {
  busy: boolean; run: Run; onVerified: () => void; onCancel?: () => void; resetPassword?: boolean
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeMode, setCodeMode] = useState(false)
  const [remember, setRemember] = useState(canRememberAccount)
  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (!codeMode) {
        await sendLoginCode(email)
        setCodeMode(true)
      } else {
        await verifyLoginCode(email, code, remember)
        setCode('')
        // The parent shows the password step even after it switches to the signed-in view.
        onVerified()
      }
    })
  }
  return <form className="ew-account-form" onSubmit={submit}>
    <p>{resetPassword
      ? 'Enter your account’s email and we’ll send you a code. After the code, you’ll choose a new password. First time here? This is also how you set your password.'
      : 'Enter the email you registered with. We’ll send you a code, then you’ll choose a password for signing in.'}</p>
    <label>Email address: <input type="email" autoComplete="email" value={email}
      onChange={event => setEmail(event.target.value)} maxLength={254} required /></label>
    {codeMode && <>
      <label>Code from your email: <input inputMode="numeric" autoComplete="one-time-code" maxLength={12}
        value={code} onChange={event => setCode(event.target.value)} required /></label>
      {canRememberAccount() && <label className="ew-account-check"><input type="checkbox" checked={remember}
        onChange={event => setRemember(event.target.checked)} /> Remember this account on this PC</label>}
    </>}
    <div className="ew-account-actions">
      <button type="submit" disabled={busy}>{codeMode ? 'Verify code' : resetPassword ? 'Email me a reset code' : 'Send code'}</button>
      {!codeMode && <button type="button" disabled={busy} onClick={() => setCodeMode(true)}>I have a code</button>}
      {codeMode && <button type="button" disabled={busy || !email} onClick={() => void run(() => sendLoginCode(email))}>Resend code</button>}
      {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
    </div>
    <p className="ew-account-links">New to Elsewhere? <ExternalLink url={ACCOUNT_SIGNUP_URL}>Create an account</ExternalLink></p>
  </form>
}

function ExternalLink({ url, children }: { url: string; children: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" onClick={event => {
    if (!isTauri()) return
    event.preventDefault()
    void openUrl(url).catch(cause => window.alert(errorText(cause)))
  }}>{children}</a>
}
const PolicyLink = ({ file, children }: { file: 'terms.html' | 'privacy.html' | 'license.html'; children: string }) =>
  <ExternalLink url={ACCOUNT_SIGNUP_URL + file}>{children}</ExternalLink>

type Contact = { profile: CloudProfile; state: 'friend' | 'incoming' | 'outgoing' | 'blocked' }
type InboxProps = {
  userId: string; mode: Mode; run: Run; busy: boolean; accountBar: React.ReactNode
  setTitle: (title: string) => void; onClose: () => void
}
function openChat(person: CloudProfile) {
  window.dispatchEvent(new CustomEvent(OPEN_TOOLBAR_CONTACT, { detail: ELSEWHERE_BUDDY_PREFIX + person.id }))
}
function CloudInbox({ userId, mode, run, busy, accountBar, setTitle, onClose }: InboxProps) {
  const [profile, setProfile] = useState<CloudProfile | null>(null)
  const [accountStatus, setAccountStatus] = useState<Awaited<ReturnType<typeof cloudAccountStatus>>>()
  const [agreed, setAgreed] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<CloudProfile | null>(null)
  const [info, setInfo] = useState('')
  const [reporting, setReporting] = useState<CloudProfile | null>(null)
  const [report, setReport] = useState('')
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)

  const refreshContacts = useCallback(async () => {
    const [friends, blocked] = await Promise.all([loadCloudFriends(), loadCloudBlocks()])
    const peers = friends.map(row => ({
      id: row.user_a === userId ? row.user_b : row.user_a,
      state: (row.accepted_at ? 'friend' : row.requested_by === userId ? 'outgoing' : 'incoming') as Contact['state'],
    }))
    for (const id of blocked) peers.push({ id, state: 'blocked' })
    const profiles = new Map((await lookupCloudProfiles([...new Set(peers.map(item => item.id))])).map(item => [item.id, item]))
    setContacts(peers.flatMap(item => {
      const found = profiles.get(item.id)
      return found ? [{ profile: found, state: item.state }] : []
    }))
  }, [userId])
  useEffect(() => {
    let alive = true
    void cloudAccountStatus().then(async status => {
      if (!alive) return
      const found = status === 'ready' ? await getMyCloudProfile(userId) : null
      if (alive) { setAccountStatus(status); setProfile(found) }
    }).catch(cause => { if (alive) setSetupError(errorText(cause)) })
    return () => { alive = false }
  }, [userId])
  useEffect(() => {
    if (!profile) return
    let alive = true
    const check = () => { void refreshContacts().catch(cause => { if (alive) setInfo(errorText(cause)) }) }
    check()
    const timer = window.setInterval(check, 30000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [profile, refreshContacts])
  useEffect(() => { if (mode !== 'accounts' && profile) searchInput.current?.focus() }, [mode, profile])
  useEffect(() => {
    setTitle(accountStatus === 'terms-required' ? 'Activate Your Account'
      : accountStatus === 'ready' && !profile ? 'Choose Your Handle'
        : mode === 'accounts' ? 'Elsewhere Account' : mode === 'new-dm' ? 'New Elsewhere DM' : 'Add a Contact')
  }, [accountStatus, profile, mode, setTitle])

  function changeContact(action: () => Promise<unknown>, message?: string) {
    void run(async () => {
      await action()
      await refreshContacts()
      if (message) setInfo(message)
    })
  }
  function message(person: CloudProfile) {
    openChat(person)
    onClose()
  }

  if (setupError) return <p role="alert">{setupError}</p>
  if (accountStatus === undefined) return <p>Checking your Elsewhere account…</p>
  if (accountStatus === 'not-admitted') return <p>This sign-in isn’t an active Elsewhere account. Complete signup and verify your email.</p>
  if (accountStatus === 'terms-required') return <form className="ew-account-form" onSubmit={event => {
    event.preventDefault()
    if (!agreed) return
    void run(async () => {
      await acceptCloudTerms()
      setProfile(await getMyCloudProfile(userId))
      setAccountStatus('ready')
      await syncMainWindow()
    })
  }}>
    <p>Your email is verified. Review the Terms before continuing.</p>
    <label className="ew-account-check"><input type="checkbox" checked={agreed} required onChange={event => setAgreed(event.target.checked)} />
      <span>I agree to the <PolicyLink file="terms.html">Terms and Conditions</PolicyLink></span>
    </label>
    <div className="ew-account-actions"><button type="submit" disabled={busy || !agreed}>Agree and continue</button></div>
    <p className="ew-account-links"><PolicyLink file="privacy.html">Privacy Policy</PolicyLink> · <PolicyLink file="license.html">License information</PolicyLink></p>
  </form>
  if (!profile) return <form className="ew-account-form" onSubmit={event => {
    event.preventDefault()
    void run(async () => {
      setProfile(await registerCloudHandle(handle, displayName))
      await syncMainWindow()
    })
  }}>
    <p>Your handle is how friends find you. It can’t be changed later.</p>
    <label>Unique handle: <input value={handle} onChange={event => setHandle(event.target.value.toLowerCase())}
      pattern="[a-z0-9_.]{3,30}" minLength={3} maxLength={30} required placeholder="letters, numbers, _ and ." /></label>
    <label>Display name: <input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={60} required /></label>
    <div className="ew-account-actions"><button type="submit" disabled={busy}>Create profile</button></div>
  </form>

  const resultState = contacts.find(item => item.profile.id === result?.id)?.state
  const requests = contacts.filter(item => item.state === 'incoming')
  const pendingOut = contacts.filter(item => item.state === 'outgoing')
  const friends = contacts.filter(item => item.state === 'friend')
  const blocked = contacts.filter(item => item.state === 'blocked')

  return <>
    <div className="ew-account-signed">
      <span>Signed in as <strong>@{profile.handle}</strong></span>
      {accountBar}
    </div>

    <form className="ew-account-search" onSubmit={event => { event.preventDefault(); void run(async () => {
      setInfo('')
      const [match] = await searchCloudContact(query)
      setResult(match && match.id !== userId ? match : null)
      if (!match) setInfo('No one has that handle.')
      else if (match.id === userId) setInfo('That’s you!')
    }) }}>
      <label>{mode === 'new-dm' ? 'Message someone:' : 'Add a contact:'}
        <input ref={searchInput} aria-label="Exact Elsewhere handle" placeholder="@handle" value={query} maxLength={31}
          onChange={event => { setQuery(event.target.value); setResult(null) }} required /></label>
      <button type="submit" disabled={busy}>Find</button>
    </form>
    {result && <div className="ew-account-row ew-account-found">
      <strong>@{result.handle}</strong><span className="ew-account-name">{result.display_name}</span>
      {resultState === 'friend' ? <button type="button" onClick={() => message(result)}>Send message</button>
        : !resultState ? <button type="button" disabled={busy} onClick={() => changeContact(
          () => requestCloudFriend(result.id), 'Request sent. You can message once they accept.')}>Add contact</button>
          : <span>{resultState === 'incoming' ? 'Wants to add you (see below)' : resultState === 'blocked' ? 'Blocked' : 'Request sent'}</span>}
    </div>}

    {requests.length > 0 && <fieldset className="ew-account-list">
      <legend>Contact requests ({requests.length})</legend>
      {requests.map(({ profile: person }) => <div className="ew-account-row" key={person.id}>
        <strong>@{person.handle}</strong><span className="ew-account-name">wants to add you</span>
        <button type="button" disabled={busy} onClick={() => changeContact(() => answerCloudFriend(person.id, true), `@${person.handle} is now a contact.`)}>Accept</button>
        <button type="button" disabled={busy} onClick={() => changeContact(() => answerCloudFriend(person.id, false))}>Decline</button>
      </div>)}
    </fieldset>}

    <fieldset className="ew-account-list">
      <legend>Elsewhere contacts ({friends.length})</legend>
      {!friends.length && <p className="ew-account-muted">No contacts yet. Find someone by their exact handle.</p>}
      {friends.map(({ profile: person }) => <div className="ew-account-row" key={person.id}>
        <button type="button" className="ew-account-person" onClick={() => message(person)} title="Open conversation">@{person.handle}</button>
        <button type="button" disabled={busy} onClick={() => changeContact(() => removeCloudFriend(person.id), 'Contact removed.')}>Remove</button>
        <button type="button" disabled={busy} onClick={() => changeContact(() => blockCloudAccount(person.id, true), 'Blocked.')}>Block</button>
        <button type="button" onClick={() => { setReporting(person); setReport('') }}>Report</button>
      </div>)}
    </fieldset>

    {(pendingOut.length > 0 || blocked.length > 0) && <fieldset className="ew-account-list">
      <legend>Sent and blocked</legend>
      {pendingOut.map(({ profile: person }) => <div className="ew-account-row" key={person.id}>
        <strong>@{person.handle}</strong><span className="ew-account-name">request sent</span>
        <button type="button" disabled={busy} onClick={() => changeContact(() => removeCloudFriend(person.id))}>Cancel</button>
      </div>)}
      {blocked.map(({ profile: person }) => <div className="ew-account-row" key={person.id}>
        <strong>@{person.handle}</strong><span className="ew-account-name">blocked</span>
        <button type="button" disabled={busy} onClick={() => changeContact(() => blockCloudAccount(person.id, false))}>Unblock</button>
      </div>)}
    </fieldset>}

    {reporting && <form className="ew-account-form" onSubmit={event => { event.preventDefault(); void run(async () => {
      await reportCloudAccount(reporting.id, report)
      setReporting(null)
      setReport('')
      setInfo('Report submitted. Thank you.')
    }) }}>
      <label>What happened with @{reporting.handle}?
        <textarea value={report} onChange={event => setReport(event.target.value)} maxLength={500} required rows={3} /></label>
      <div className="ew-account-actions">
        <button type="submit" disabled={busy || !report.trim()}>Submit report</button>
        <button type="button" onClick={() => setReporting(null)}>Cancel</button>
      </div>
    </form>}

    <div className="ew-account-footer">
      <button type="button" disabled={busy} onClick={() => void run(refreshContacts)}>Refresh</button>
      {info && <span role="status">{info}</span>}
    </div>
  </>
}
