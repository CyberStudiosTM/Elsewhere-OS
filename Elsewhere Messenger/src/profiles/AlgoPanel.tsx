import { useEffect, useMemo, useRef, useState } from 'react'
import { codeFrame } from './profileRender'
import { INSPIRATION, generate, type Generated } from './algo/generator'

// Profile Workshop · Algorithmic Intelligence: describe something in plain English and get editable
// HTML/CSS/JavaScript, previewed in the same locked sandbox visitors get. Nothing is published automatically.

type Code = { html: string; css: string; js: string }
const OUTCOME_TEXT = {
  understood: '✓ Got it',
  partial: '◐ Made what I understood',
  ambiguous: '? Tell me a little more',
  unsupported: '✕ Not something I can make yet',
} as const

export default function AlgoPanel({ sandboxUrl, onInsert, onClose }: { sandboxUrl?: string; onInsert: (code: Code, label: string) => void; onClose: () => void }) {
  const [request, setRequest] = useState('')
  const [result, setResult] = useState<Generated | null>(null)
  const [tab, setTab] = useState<keyof Code>('html')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [copied, setCopied] = useState('')
  const [variation, setVariation] = useState(0)
  const preview = useRef<HTMLDivElement>(null)

  const run = (text = request, salt = variation) => { if (text.trim()) setResult(generate(text, salt ? String(salt) : '')) }
  useEffect(() => {
    if (!preview.current) return
    preview.current.replaceChildren(result && result.made.length ? codeFrame(result, sandboxUrl || '') : document.createTextNode(''))
  }, [result, sandboxUrl, device])
  useEffect(() => { if (!copied) return; const t = window.setTimeout(() => setCopied(''), 1600); return () => window.clearTimeout(t) }, [copied])
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what) } catch { setCopied('Couldn’t copy') } }
  const all = useMemo(() => result ? `<!-- HTML -->\n${result.html}\n\n<style>\n${result.css}\n</style>\n\n<script>\n${result.js}\n</script>` : '', [result])

  return <div className="ce-backdrop" onPointerDown={e => e.stopPropagation()}>
    <section className="ai" role="dialog" aria-label="Algorithmic Intelligence">
      <header className="ce-head">
        <strong>🧠 Algorithmic Intelligence</strong><span className="ce-grow" />
        <button type="button" onClick={onClose}>Close</button>
      </header>
      <div className="ai-body">
        <div className="ai-left">
          <label htmlFor="ai-request">Describe what you want</label>
          <textarea id="ai-request" rows={3} maxLength={600} value={request} placeholder='e.g. sparkly pink heading that says "welcome ♡" and falling hearts'
            onChange={e => setRequest(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run() }} />
          <div className="ai-actions">
            <button type="button" className="is-primary" disabled={!request.trim()} onClick={() => { setVariation(0); run(request, 0) }}>✦ Generate Code</button>
            <button type="button" disabled={!result?.made.length} onClick={() => { const v = variation + 1; setVariation(v); run(request, v) }}>New ids</button>
            <button type="button" onClick={() => { setRequest(''); setResult(null) }}>Clear</button>
          </div>
          <p className="ai-label">Need ideas?</p>
          <div className="ai-ideas">{INSPIRATION.map(idea => <button key={idea} type="button" onClick={() => { setRequest(idea); setVariation(0); run(idea, 0) }}>{idea}</button>)}</div>
          {result && <div className={`ai-result ai-${result.outcome}`} role="status">
            <strong>{OUTCOME_TEXT[result.outcome]}</strong>
            {result.made.length > 0 && <p>Made: {result.made.join(' · ')}</p>}
            {result.corrections.length > 0 && <p>I read {result.corrections.map(([a, b]) => `“${a}” as “${b}”`).join(', ')}.</p>}
            {result.unknown.length > 0 && <p>I didn’t understand: {result.unknown.map(w => `“${w}”`).join(', ')}.</p>}
            {result.notes.map(note => <p key={note}>{note}</p>)}
            {result.problems.length > 0 && <p>⚠ {result.problems.join(' · ')}</p>}
          </div>}
          <p className="dz-credit">the elsewhere code generator runs on a rule-based algorithm designed by Cyber. no data sets, no AI generation, no generative slop. it runs right on your computer: just code, functions, and vibes ♡</p>
        </div>
        <div className="ai-right">
          <div className="ai-preview-head">
            <strong>Live preview</strong><span className="ce-grow" />
            <span className="dz-device"><button type="button" className={device === 'desktop' ? 'is-on' : ''} onClick={() => setDevice('desktop')}>🖥</button><button type="button" className={device === 'mobile' ? 'is-on' : ''} onClick={() => setDevice('mobile')}>📱</button></span>
          </div>
          <div className={`ai-preview is-${device}`} ref={preview} />
          <nav className="ce-tabs ai-tabs" role="tablist">{(['html', 'css', 'js'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>{t === 'js' ? 'JavaScript' : t.toUpperCase()}</button>)}
            <span className="ce-grow" />
            <button type="button" disabled={!result?.made.length} onClick={() => void copy(result![tab], 'Copied ' + (tab === 'js' ? 'JavaScript' : tab.toUpperCase()))}>Copy code</button>
            <button type="button" disabled={!result?.made.length} onClick={() => void copy(all, 'Copied all')}>Copy all</button>
          </nav>
          <pre className="ai-code"><code>{result?.made.length ? (result[tab] || '(nothing needed here)') : 'Your code shows up here.'}</code></pre>
          <div className="ai-insert">
            {copied && <span role="status">{copied} ✓</span>}<span className="ce-grow" />
            <button type="button" className="is-primary" disabled={!result?.made.length || result.problems.length > 0}
              onClick={() => { if (result) { onInsert({ html: result.html, css: result.css, js: result.js }, result.made.join(' + ')); onClose() } }}>Insert into profile</button>
          </div>
        </div>
      </div>
    </section>
  </div>
}
