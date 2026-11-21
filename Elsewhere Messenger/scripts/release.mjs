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
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' },
})

const bundle = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
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

console.log(`\nRelease files are in release/${version}.`)
console.log(`1. Create a GitHub Release tagged messenger-v${version} on ${repo} and upload ${asset}.`)
console.log('2. Replace latest.json on the release tagged messenger-updates with the new one.')
console.log('Installed copies offer the update on their next start.')
