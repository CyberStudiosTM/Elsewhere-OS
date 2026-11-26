// Builds a signed Elsewhere Messenger release and prepares the files for a GitHub Release.
//
//   node scripts/release.mjs "What's new in this version"
//
// Output goes to release/<version>/:
//   Elsewhere-Messenger_<version>_x64-setup.exe   the installer, for the Release tagged messenger-v<version>
//   latest.json                                  goes on the Release tagged messenger-updates (the app reads it there)
//
// The signing key lives outside the project at %USERPROFILE%\.tauri\elsewhere-messenger-updates.key.
// Never commit it or share it. If it's lost, installed copies can't accept new updates.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
// Keep the (large, rebuildable) Rust build cache out of OneDrive so it never syncs.
const targetDir = process.env.CARGO_TARGET_DIR || join(process.env.LOCALAPPDATA || homedir(), 'ElsewhereMessenger', 'cargo-target')
const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const version = config.version
const endpoint = config.plugins?.updater?.endpoints?.[0] || ''
const repo = /github\.com\/([^/]+\/[^/]+)\/releases/.exec(endpoint)?.[1]
if (!repo) throw new Error('tauri.conf.json has no GitHub updater endpoint.')

const keyPath = join(homedir(), '.tauri', 'elsewhere-messenger-updates.key')
if (!existsSync(keyPath)) throw new Error('Signing key not found at ' + keyPath)

const notes = process.argv.slice(2).join(' ').trim() || `Elsewhere Messenger ${version}`

execSync('npx tauri build', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CARGO_TARGET_DIR: targetDir, TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' },
})

const bundle = join(targetDir, 'release', 'bundle', 'nsis')
const built = join(bundle, `Elsewhere Messenger_${version}_x64-setup.exe`)
const signature = readFileSync(built + '.sig', 'utf8').trim()
// GitHub turns spaces in asset names into dots, so publish a name without spaces.
const asset = `Elsewhere-Messenger_${version}_x64-setup.exe`
const out = join(root, 'release', version)
mkdirSync(out, { recursive: true })
copyFileSync(built, join(out, asset))
writeFileSync(join(out, 'latest.json'), JSON.stringify({
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': { signature, url: `https://github.com/${repo}/releases/download/messenger-v${version}/${asset}` },
  },
}, null, 2) + '\n')

// A labeled copy of every batch build, plus LATEST.txt naming the newest one.
const stamp = new Date()
const pad = value => String(value).padStart(2, '0')
const when = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}${pad(stamp.getMinutes())}`
const label = (process.env.BUILD_LABEL || notes).replace(/[<>:"/\\|?*\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
const folder = `${version} - ${label} (${when})`
const builds = join(root, 'builds')
mkdirSync(join(builds, folder), { recursive: true })
copyFileSync(built, join(builds, folder, asset))
writeFileSync(join(builds, folder, 'WHATS-NEW.txt'), `Elsewhere Messenger ${version}\nBuilt ${when}\n\n${notes}\n`)
writeFileSync(join(builds, 'LATEST.txt'), `Newest build: ${version}\nBuilt: ${when}\nFolder: builds\\${folder}\nInstaller: ${asset}\n\n${notes}\n`)
console.log(`\nLabeled build: builds/${folder}/${asset}`)

console.log(`\nRelease files are in release/${version}.`)
console.log(`1. Create a GitHub Release tagged messenger-v${version} on ${repo} and upload ${asset}.`)
console.log('2. Replace latest.json on the release tagged messenger-updates with the new one.')
console.log('Installed copies offer the update on their next start.')
