import { SLOTS, resolve, type AssetRef, type SkinTheme, type StyleProperty, type VisualState } from './schema'

// Wearing a saved SkinMapper skin in the real Classic windows. The skin is drawn on top of Classic:
// a rule is written only for the parts and properties the skin actually changes, so everything else
// stays exactly Classic. Layout, sizes and hit areas never change. Only colors, borders, corners,
// shadows, fonts and images do.

export const CUSTOM_SKIN_KEY = 'elsewhere.messenger.customSkin.v1'
export const CUSTOM_SKIN_ATTR = 'data-elsewhere-custom-skin'
const ROOT = `html[${CUSTOM_SKIN_ATTR}]`

/** Which real Classic elements each skin part dresses. `selected` / `unread` give the selector for those states. */
type Target = { selector: string; selected?: string; unread?: string; muted?: string; text?: string }
export const CLASSIC_TARGETS: Partial<Record<string, Target>> = {
  'window.frame': { selector: '.em-window' },
  'window.titlebar': { selector: '.em-titlebar, .em-menu-about-title, .ew-treasures-titlebar, .ew-media-header, .ew-expression-head, .ew-toolbar-dialog > header', text: '.em-titlebar .em-title, .ew-treasures-titlebar strong, .ew-media-header strong, .ew-expression-head strong, .ew-toolbar-dialog > header strong' },
  'window.titlebar.text': { selector: '.em-titlebar .em-title' },
  'window.controls.minimize': { selector: '.em-window-controls button' },
  'window.controls.close': { selector: '.em-window-controls .em-close, .ew-treasures-close' },
  'buddy.profile': { selector: '.em-buddy-window .em-profile' },
  'buddy.profile.avatar': { selector: '.em-buddy-window .em-profile .em-photo-frame' },
  'buddy.profile.name': { selector: '.em-buddy-window .em-profile-heading', text: '.em-buddy-window .em-profile-heading strong' },
  'buddy.profile.status': { selector: '.em-buddy-window .em-profile-info p button > span' },
  'buddy.services': { selector: '.ew-social-services, .ew-treasures-shelves, .ew-media-fixed-footer, .ew-expression-footer' },
  'buddy.services.button': { selector: '.ew-social-services .ew-social-service, .em-menu-about-content button, .ew-feedback-kinds label, .ew-treasures-shelves button, .ew-media-picker.ew-media-classic button, .ew-expression-panel-classic button, .ew-photo-picker-classic button, .ew-toolbar-classic .ew-toolbar-dialog button', selected: '.ew-social-services .ew-social-service.is-selected, .ew-feedback-kinds label.is-on, .ew-treasures-shelves button.is-active, .ew-media-picker.ew-media-classic button.is-active, .ew-expression-panel-classic button.is-active, .ew-photo-picker-classic button.is-active, .ew-toolbar-classic .ew-toolbar-dialog button.is-active, .ew-media-picker.ew-media-classic button[aria-pressed="true"], .ew-expression-panel-classic button[aria-pressed="true"], .ew-photo-picker-classic button[aria-pressed="true"], .ew-toolbar-classic .ew-toolbar-dialog button[aria-pressed="true"], .ew-media-picker.ew-media-classic button[aria-selected="true"], .ew-expression-panel-classic button[aria-selected="true"], .ew-photo-picker-classic button[aria-selected="true"], .ew-toolbar-classic .ew-toolbar-dialog button[aria-selected="true"]' },
  'buddy.toolbar': { selector: '.em-buddy-tools' },
  'buddy.toolbar.button': { selector: '.em-buddy-tools button' },
  'buddy.contacts': { selector: '.em-groups, .ew-treasures-categories' },
  'buddy.group.heading': { selector: '.em-group-heading', text: '.em-group-heading span' },
  'buddy.contact.row': { selector: '.em-contact, .ew-treasures-categories button', selected: '.em-contact.em-contact-selected, .ew-treasures-categories button.is-active', muted: '.em-contact .em-contact-state' },
  'buddy.contact.unread': { selector: '.em-contact .ew-unread' },
  'menu.bar': { selector: '.em-menubar', text: '.em-menubar .em-menu-top' },
  'menu.dropdown': { selector: '.em-menu-popup, .em-emoticon-menu, .ew-activities-classic, .em-font-picker' },
  'menu.item': { selector: '.em-menu-popup button, .em-menu-popup summary, .ew-activities-classic button, .em-font-picker button' },
  'chat.toolbar': { selector: '.em-chat-tools', text: '.em-chat-tools button, .em-chat-tools small' },
  'chat.transcript': { selector: '.em-history' },
  'chat.message.own': { selector: '.em-message:has(> .em-sender-me)', text: '.em-message:has(> .em-sender-me) p, .em-sender-me, .em-message:has(> .em-sender-me) .ew-core-message-text[style*="color: rgb(0, 0, 0)"], .em-message:has(> .em-sender-me) .ew-core-message-text:not([style*="color"])' },
  'chat.message.incoming': { selector: '.em-message:has(> .em-sender-them)', text: '.em-message:has(> .em-sender-them) p, .em-sender-them, .em-message:has(> .em-sender-them) .ew-core-message-text[style*="color: rgb(0, 0, 0)"], .em-message:has(> .em-sender-them) .ew-core-message-text:not([style*="color"])' },
  'chat.notice': { selector: '.em-chat-window .em-recipient, .em-chat-window .em-chat-footer, .ew-treasures-banner, .ew-treasures-empty, .ew-treasures-footer', text: '.ew-treasures-empty strong, .ew-treasures-empty p, .ew-treasures-link' },
  'chat.composer': { selector: '.em-compose textarea, .em-chat-window .em-composer-frame', text: '.em-composer-frame .em-formatting button' },
  'chat.send': { selector: '.em-compose button[type="submit"]' },
  'signin.field': { selector: '.em-login-form input:not([type="checkbox"]), .em-presence-trigger, .ew-treasures-window input, .ew-media-picker.ew-media-classic input:not([type="checkbox"]):not([type="color"]):not([type="range"]), .ew-expression-panel-classic input:not([type="checkbox"]):not([type="color"]):not([type="range"]), .ew-photo-picker-classic input:not([type="checkbox"]):not([type="color"]):not([type="range"]), .ew-toolbar-classic .ew-toolbar-dialog input:not([type="checkbox"]):not([type="color"]):not([type="range"]), .ew-media-picker.ew-media-classic select, .ew-expression-panel-classic select, .ew-photo-picker-classic select, .ew-toolbar-classic .ew-toolbar-dialog select, .ew-media-picker.ew-media-classic textarea, .ew-expression-panel-classic textarea, .ew-photo-picker-classic textarea, .ew-toolbar-classic .ew-toolbar-dialog textarea' },
  'signin.header': { selector: '.em-login-window .em-login-brand, .em-login-window .em-login-wave', text: '.em-login-window .em-login-brand-wordmark, .em-login-window .em-login-brand-wordmark strong' },
  'signin.button': { selector: '.em-signin-button' },
  'toast.frame': { selector: '.ew-toast' },
  'dialog.frame': { selector: '.em-menu-about, .em-menu-about-content, .ew-media-picker.ew-media-classic, .ew-expression-panel-classic, .ew-photo-picker-classic, .ew-toolbar-classic .ew-toolbar-dialog, .ew-treasures-window', text: '.em-menu-about-content strong, .em-menu-about-content p, .em-menu-about-content small, .em-menu-about-help a, .ew-media-picker.ew-media-classic label, .ew-expression-panel-classic label, .ew-photo-picker-classic label, .ew-toolbar-classic .ew-toolbar-dialog label, .ew-media-picker.ew-media-classic small, .ew-expression-panel-classic small, .ew-photo-picker-classic small, .ew-toolbar-classic .ew-toolbar-dialog small, .ew-media-picker.ew-media-classic summary, .ew-expression-panel-classic summary, .ew-photo-picker-classic summary, .ew-toolbar-classic .ew-toolbar-dialog summary, .ew-media-picker.ew-media-classic p, .ew-expression-panel-classic p, .ew-photo-picker-classic p, .ew-toolbar-classic .ew-toolbar-dialog p' },
}

/** Classic text that sits directly on the window background. */
const WINDOW_TEXT = '.em-login-form label, .em-login-status-row label, .em-check-label, .em-login-account-links button, .em-login-note, .em-chat-sidebar, .em-chat-sidebar small'

/** Skin property → CSS declarations. Properties without a safe Classic mapping are skipped. */
function declarations(property: StyleProperty, css: string, asset?: AssetRef): string[] {
  switch (property) {
    case 'background': return [`background: ${css}`]
    case 'backgroundImage': {
      const fit = asset?.scale === 'tile' ? 'auto' : asset?.scale === 'cover' ? 'cover' : asset?.scale === 'contain' ? 'contain' : '100% 100%'
      return [`background-image: ${css}`, `background-size: ${fit}`, `background-repeat: ${asset?.scale === 'tile' ? 'repeat' : 'no-repeat'}`]
    }
    case 'borderColor': return [`border-color: ${css}`]
    case 'borderWidth': return [`border-width: ${css}`, 'border-style: solid']
    case 'borderRadius': return [`border-radius: ${css}`]
    case 'shadow': return [`box-shadow: ${css}`]
    case 'opacity': return [`opacity: ${css}`]
    case 'textColor': return [`color: ${css}`]
    case 'fontFamily': return [`font-family: ${css}`]
    case 'fontSize': return [`font-size: ${css}`]
    case 'fontWeight': return [`font-weight: ${css}`]
    case 'textShadow': return [`text-shadow: ${css}`]
    default: return []
  }
}

function cssValue(property: StyleProperty, value: unknown, urlFor: (asset: AssetRef) => string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined
  if (property === 'backgroundImage') {
    const url = urlFor(value as AssetRef)
    return url ? `url("${url.replace(/["\\\n\r]/g, '')}")` : undefined
  }
  if (property === 'opacity') return String(Math.min(1, Math.max(0, Number(value))))
  if (property === 'fontFamily') return `"${String(value).replace(/["\\]/g, '')}", "Segoe UI", sans-serif`
  if (typeof value === 'number' && ['borderWidth', 'borderRadius', 'fontSize'].includes(property)) return `${value}px`
  // Values were validated by SkinMapper's schema; still refuse anything that could end a CSS rule.
  const text = String(value)
  return /[;{}<>]|\/\*|@import|expression\(|javascript:/i.test(text) ? undefined : text
}

function stateSelector(target: Target, state: VisualState): string | undefined {
  switch (state) {
    case 'normal': case 'active': return target.selector
    case 'hover': return target.selector.split(',').map(s => `${s.trim()}:hover`).join(', ')
    case 'focus': return target.selector.split(',').map(s => `${s.trim()}:focus-visible`).join(', ')
    case 'disabled': return target.selector.split(',').map(s => `${s.trim()}:disabled`).join(', ')
    case 'selected': return target.selected
    case 'unread': return target.unread
    default: return undefined
  }
}

/** The stylesheet that dresses Classic in a skin. Every rule is scoped to html[data-elsewhere-custom-skin]. */
export function classicSkinCss(theme: SkinTheme, urlFor: (asset: AssetRef) => string | undefined): string {
  const rules: string[] = []
  for (const slot of SLOTS) {
    const target = CLASSIC_TARGETS[slot.id]
    if (!target) continue
    const states: VisualState[] = slot.states.includes('normal') ? slot.states : ['normal', ...slot.states]
    for (const state of states) {
      const selector = stateSelector(target, state)
      if (!selector) continue
      const lines: string[] = []
      for (const property of slot.properties) {
        const { value, origin } = resolve(theme, slot.id, property, state)
        if (origin === 'default') continue
        if (property === 'mutedTextColor') {
          const css = cssValue('textColor', value, urlFor)
          if (css && target.muted && state === 'normal') rules.push(`${scope(target.muted)} { color: ${css} !important; }`)
          continue
        }
        const css = cssValue(property, value, urlFor)
        if (css === undefined) continue
        for (const line of declarations(property, css, property === 'backgroundImage' ? value as AssetRef : undefined)) lines.push(`  ${line} !important;`)
      }
      // A re-colored part drops Classic's own text glow (e.g. the title's blurred dark-blue shadow), unless the skin sets one.
      if (lines.some(line => /^\s*color:/.test(line)) && !lines.some(line => /^\s*text-shadow:/.test(line))) lines.push('  text-shadow: none !important;')
      if (lines.length) rules.push(`${scope(selector)} {\n${lines.join('\n')}\n}`)
      // Some Classic parts keep their text in a child with its own color: give the text there too.
      const textLines = lines.filter(line => /^\s*(color|text-shadow):/.test(line))
      // Parts without their own text color (like the conversation toolbar) use the skin's main text color.
      if (target.text && !textLines.length && lines.length && typeof theme.tokens?.textColor === 'string') {
        const ink = cssValue('textColor', theme.tokens.textColor, urlFor)
        if (ink) textLines.push(`  color: ${ink} !important;`)
      }
      if (target.text && state === 'normal' && textLines.length) rules.push(`${scope(target.text)} {\n${textLines.join('\n')}\n}`)
    }
  }
  // The skin's main text color goes on Classic's plain window text (sign-in labels and links), which sits
  // straight on the window background, but only when the skin repaints that background too.
  const ink = theme.tokens?.textColor
  const frame = resolve(theme, 'window.frame', 'background', 'active')
  if (typeof ink === 'string' && frame.origin !== 'default') {
    const css = cssValue('textColor', ink, () => undefined)
    if (css) rules.push(`${scope(WINDOW_TEXT)} { color: ${css} !important; }`)
  }
  // Classic's white swooshes (sign-in header wave, footer wave) are cut-outs of the window paper:
  // they take the skin's window background and edge so the header blends in instead of staying blue.
  if (frame.origin !== 'default') {
    const paper = cssValue('background', frame.value, () => undefined)
    const edge = resolve(theme, 'window.frame', 'borderColor', 'active')
    const line = edge.origin !== 'default' ? cssValue('borderColor', edge.value, () => undefined) : undefined
    if (paper) rules.push(`${scope('.em-login-window .em-login-header-wave, .em-login-window .em-login-wave::before')} { background: ${paper} !important;${line ? ` border-color: ${line} !important;` : ''} }`)
    if (line) rules.push(`${scope('.em-login-window .em-login-header-wave::before')} { border-color: ${line} !important; opacity: .6; }`)
    // Scrollbars follow the skin: thumb in the edge color, track in the window color.
    const solid = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined
    const thumb = solid(edge.value), track = solid(frame.value)
    if (thumb && track) rules.push(`${scope('.em-window, .em-window *, .ew-treasures-window, .ew-treasures-window *, .ew-toolbar-dialog, .ew-toolbar-dialog *')} { scrollbar-color: ${thumb} ${track}; }`)
    // Dialogs and pop-up windows use the skin's window edge.
    if (line) rules.push(`${scope('.em-menu-about, .ew-toolbar-dialog, .ew-treasures-window, .ew-media-picker.ew-media-classic, .ew-expression-panel-classic')} { border-color: ${line} !important; }`)
    // The conversation window's body behind the history, composer and pictures.
    if (paper) rules.push(`${scope('.em-chat-window .em-chat-content')} { background: ${paper} !important; }`)
  }
  // Fonts set on the whole skin reach every Classic window.
  const font = theme.tokens?.fontFamily
  if (typeof font === 'string' && /^[\w .'-]{1,60}$/.test(font)) rules.unshift(`${scope('.em-window')} { font-family: "${font}", "Segoe UI", sans-serif !important; }`)
  return rules.join('\n')
}

function scope(selector: string) {
  return splitSelectors(selector).map(part => `${ROOT} ${part.trim()}`).join(', ')
}

/** Splits a selector list on top-level commas only (not inside brackets or quotes). */
function splitSelectors(list: string): string[] {
  const parts: string[] = []
  let depth = 0, quote = '', start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (quote) { if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1 }
  }
  parts.push(list.slice(start))
  return parts.filter(part => part.trim())
}
