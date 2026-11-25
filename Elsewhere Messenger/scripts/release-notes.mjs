// Builds GitHub release notes in the CyberStudios style (modeled on Cy's own messenger-v0.2.21 release).
// Used by the publish step so no release is ever a plain one-liner.

const REPO = 'https://github.com/CyberStudiosTM/Elsewhere-OS'
const enc = text => encodeURIComponent(text.replace(/-/g, '--').replace(/_/g, '__'))
const badge = (label, value, color) =>
  `<img src="https://img.shields.io/badge/${enc(label)}-${enc(value)}-${color}?style=for-the-badge" alt="${label}: ${value}">`

const TAGLINES = [
  'A little update from elsewhere...', 'Fresh from the buddy list...', 'Something cute just signed on...',
  'A new little window just opened...', 'Your messenger got a makeover...', 'A tiny gift from cyberspace...',
]
const INTROS = [
  'a few new things have made their way into Elsewhere Messenger! ♡',
  'your little messenger just got a little bit cuter. ♡',
  'grab a snack and pull up a chair, there\'s something new to explore. ♡',
  'another step closer to the Elsewhere we\'re dreaming of. ♡',
]

/** Picks a friendly emoji for a change, by what it's about. */
function iconFor(text) {
  const t = text.toLowerCase()
  if (/skinmapper|\.eskin|skin file|my skins/.test(t)) return '💅'
  if (/creative studio|photo studio|\bstudio\b|wardrobe|sticker|collage|stationery|mini-ui|draw/.test(t)) return '🎨'
  if (/camera|booth|webcam|photo strip/.test(t)) return '📷'
  if (/group/.test(t)) return '👯'
  if (/instagram|meta|tester/.test(t)) return '📸'
  if (/web treasures|winks|treasure/.test(t)) return '🌐'
  if (/sign-up|sign in|password|account/.test(t)) return '🔐'
  if (/activities|toolbar|menu|emoticons/.test(t)) return '🧸'
  if (/status|typing|unread|notification/.test(t)) return '💬'
  if (/fix|fixed|waits until/.test(t)) return '🛠️'
  return '✧'
}

/** Splits the plain notes into separate changes (bullets, or sentences for one-paragraph notes). */
export function changesFrom(notes) {
  const lines = notes.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const bullets = lines.filter(line => line.startsWith('- ')).map(line => line.slice(2).trim())
  if (bullets.length) return bullets
  return lines.filter(line => !/^new in /i.test(line) && !/^includes everything/i.test(line))
    .join(' ').split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean)
}

/** A short title for one change: the part before a colon, or its first few words. */
function titleFor(change) {
  const colon = change.indexOf(':')
  if (colon > 0 && colon < 48) return change.slice(0, colon).trim()
  const words = change.replace(/[.,;].*$/, '').split(' ')
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '')
}
const sentence = text => { const t = text.trim(); return /[.!?♡)]$/.test(t) ? t : t + '.' }

export function releaseName(version) { return `Elsewhere Messenger ${version} (beta)` }

export function releaseBody(version, notes, { index = 0 } = {}) {
  const changes = changesFrom(notes)
  const asset = `Elsewhere-Messenger_${version}_x64-setup.exe`
  const download = `${REPO}/releases/download/messenger-v${version}/${asset}`
  const lead = changes[0] ? titleFor(changes[0]) : 'little improvements'
  const sections = changes.map(change => {
    const icon = iconFor(change)
    const colon = change.indexOf(':')
    const body = colon > 0 && colon < 48 ? change.slice(colon + 1).trim() : change
    return `### ${icon} ${titleFor(change).toLowerCase()}\n\n${sentence(body.charAt(0).toUpperCase() + body.slice(1))}`
  }).join('\n\n')
  const table = changes.map(change => `| ${iconFor(change)} ${titleFor(change)} | ${sentence(change.length > 110 ? change.slice(0, 107).trim() + '…' : change)} |`).join('\n')

  return `<div align="center">

# ☁️ Elsewhere Messenger v${version} ♡

---

### ${TAGLINES[index % TAGLINES.length]}

**${lead}, and a little more. ♡**

${badge('Version', `v${version}`, 'C6B6F3')}
${badge('Platform', 'Windows x64', 'AED8F5')}
${badge('Updates', 'Automatic', 'A8E8DC')}
${badge('Status', 'Beta', 'F4C8EA')}

*A little update from [CyberStudios™](https://github.com/CyberStudiosTM).*

[Download](#-download) · [What's New](#-whats-new) · [Installation](#-installation-notes) · [GitHub](${REPO})

</div>

---

## 💌 ୨୧ you've got an update!

${INTROS[index % INTROS.length]}

**v${version}** brings ${changes.length === 1 ? 'one little change' : `${changes.length} little changes`} to Elsewhere Messenger.

---

## 🫧 what's new?

${sections}

---

## 📥 download

### ୨୧ Elsewhere Messenger · Windows x64

**Version:** \`${version}\`
**Release type:** Beta
**Installer:** \`${asset}\`

[**☁️ Download Elsewhere Messenger v${version}**](${download})

you can also download the installer from the **Assets** section below this release.

---

## 💿 installation notes

### ♡ already on v0.2.21 or newer?

this update arrives **automatically**: Elsewhere Messenger offers it the next time it starts.

you can also check any time with \`Help → Check for Updates\`.

### ✧ new here, or on an older version?

1. Download the Windows x64 installer above.
2. Run the setup file and follow the installation prompts.
3. Open Elsewhere Messenger. Future updates will find you automatically. ♡

---

## 🛠️ beta notes

Elsewhere Messenger is still in active development, and this is a beta release.

| Feature | Update |
|:---|:---|
${table}

each release includes everything from the ones before it.

---

## 💌 a little note from cyberstudios

every update brings us a little closer to the Elsewhere we're dreaming of: buddy lists, glossy chat windows, and the internet we used to know.

thank you for being here while we build it. ♡

> the internet used to feel like a place. let's bring that feeling back.

---

<div align="center">

### ☁️ see you elsewhere ♡

*somewhere between a daydream and a computer screen.*

<br>

**made with love, nostalgia, and a little bit of cyberspace.**

♡ [CyberStudios™](https://github.com/CyberStudiosTM) · 2026 ♡

</div>
`
}
