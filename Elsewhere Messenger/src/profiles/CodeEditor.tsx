import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { CODE_LIMIT, codeFrame } from './profileRender'

// Profile Workshop · Advanced Code Editor: HTML, CSS and JavaScript for a code block, with a live preview that
// runs in the same isolated sandbox visitors get.

type Code = { html: string; css: string; js: string }
type Tab = keyof Code

/** Reports JavaScript syntax errors without running anything (the Function constructor only parses here). */
const jsLinter = linter(view => {
  const source = view.state.doc.toString()
  if (!source.trim()) return []
  try { new Function(source); return [] } catch (error) {
    if (!(error instanceof SyntaxError)) return []
    return [{ from: 0, to: Math.min(source.length, view.state.doc.line(1).length), severity: 'error', message: error.message } satisfies Diagnostic]
  }
})

export default function CodeEditor({ code, sandboxUrl, onChange, onClose }: { code: Code; sandboxUrl?: string; onChange: (next: Code) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('html')
  const [draft, setDraft] = useState(code)
  const draftRef = useRef(draft)
  const holder = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLDivElement>(null)

  useEffect(() => { draftRef.current = draft }, [draft])
  // One CodeMirror view per tab.
  useEffect(() => {
    if (!holder.current) return
    const lang = tab === 'html' ? htmlLang() : tab === 'css' ? cssLang() : [javascript(), jsLinter, lintGutter()]
    const view = new EditorView({
      parent: holder.current,
      doc: draftRef.current[tab],
      extensions: [basicSetup, lang, EditorView.lineWrapping,
        EditorView.updateListener.of(update => { if (update.docChanged) setDraft(d => ({ ...d, [tab]: update.state.doc.toString().slice(0, CODE_LIMIT) })) })],
    })
    view.focus()
    return () => view.destroy()
  }, [tab])
  // Live preview (debounced) in the real sandbox.
  useEffect(() => {
    const t = window.setTimeout(() => { if (preview.current) preview.current.replaceChildren(codeFrame(draft, sandboxUrl || '')) }, 500)
    return () => window.clearTimeout(t)
  }, [draft, sandboxUrl])

  const sizes = { html: draft.html.length, css: draft.css.length, js: draft.js.length }
  return <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}>
    <section className="ce" role="dialog" aria-label="Code editor">
      <header className="ce-head">
        <strong>{'</>'} Code block</strong>
        <nav className="ce-tabs" role="tablist">{(['html', 'css', 'js'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>{t === 'js' ? 'JavaScript' : t.toUpperCase()}</button>)}</nav>
        <span className="ce-grow" />
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="is-primary" onClick={() => { onChange(draft); onClose() }}>Done</button>
      </header>
      <div className="ce-body">
        <div className="ce-code"><div ref={holder} className="ce-editor" key={tab} /><small>{sizes[tab].toLocaleString()} / {CODE_LIMIT.toLocaleString()} characters</small></div>
        <div className="ce-preview"><p>Live preview</p><div ref={preview} className="ce-frame" /></div>
      </div>
      <footer className="ce-note">Your code runs in a locked sandbox: it can draw, animate and react to clicks, but it can’t reach Elsewhere sign-ins, messages, the internet or anyone’s data. Pictures and fonts can load from https links.</footer>
    </section>
  </div>
}
