/**
 * QuestionRunner — one question at a time with instant feedback.
 * Shared by the mistake notebook and "practice my weak chapters".
 *
 * props:
 *   items      [{ key, question, result?, meta? }]   question = student-safe payload
 *   onCheck    async (item, answer) => result         answer = { selected_option, response_text }
 *   onFinish   (results) => void
 *   title      heading
 *   renderMeta (item, result) => node                 extra line under the feedback (e.g. schedule)
 */
import { useMemo, useState } from 'react'
import { SubjectDot } from '../Progress/ui.jsx'
import Lightbox from '../Common/Lightbox.jsx'

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

function letterList(raw) {
  return String(raw || '').toUpperCase().match(/[A-F]/g) || []
}

function CorrectAnswer({ q, result }) {
  if (!result) return null
  const t = q.question_type
  if (t === 'numerical') return <span><b>{result.raw_answer ?? '—'}</b></span>
  if (t === 'multi_correct') {
    const ls = letterList(result.raw_answer)
    return <span><b>{ls.length ? ls.join(', ') : (result.correct_answer != null ? LABELS[result.correct_answer] : '—')}</b></span>
  }
  const idx = result.correct_answer ?? (letterList(result.raw_answer)[0] ? LABELS.indexOf(letterList(result.raw_answer)[0]) : null)
  if (idx == null || idx < 0) return <span>—</span>
  const opt = q.options?.[idx]
  return <span><b>{LABELS[idx]}</b>{opt?.text ? ` · ${opt.text}` : ''}</span>
}

export default function QuestionRunner({ items = [], onCheck, onFinish, title, renderMeta, emptyText = 'Nothing to revise right now.' }) {
  const [idx, setIdx] = useState(() => Math.max(0, items.findIndex(i => !i.result)))
  const [answers, setAnswers] = useState({})       // key → selected value
  const [results, setResults] = useState(() => Object.fromEntries(items.filter(i => i.result).map(i => [i.key, i.result])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const done = Object.keys(results).length
  const correct = Object.values(results).filter(r => r.kind === 'correct').length
  const item = items[idx]
  const q = item?.question
  const result = item ? results[item.key] : null
  const value = item ? answers[item.key] : undefined

  const correctSet = useMemo(() => {
    if (!q || !result) return new Set()
    if (q.question_type === 'multi_correct') return new Set(letterList(result.raw_answer).map(l => LABELS.indexOf(l)))
    const i = result.correct_answer ?? (letterList(result.raw_answer)[0] ? LABELS.indexOf(letterList(result.raw_answer)[0]) : null)
    return new Set(i != null && i >= 0 ? [i] : [])
  }, [q, result])

  if (!items.length) return <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>{emptyText}</p>

  const set = v => { if (!result) setAnswers(a => ({ ...a, [item.key]: v })) }
  const toggle = i => {
    const cur = Array.isArray(value) ? value : []
    set(cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort())
  }

  const check = async () => {
    setBusy(true); setError(null)
    try {
      const t = q.question_type
      const ans = t === 'numerical'
        ? { selected_option: null, response_text: value != null && String(value).trim() !== '' ? String(value).trim() : null }
        : t === 'multi_correct'
          ? { selected_option: null, response_text: Array.isArray(value) && value.length ? JSON.stringify(value) : null }
          : { selected_option: typeof value === 'number' ? value : null, response_text: null }
      const res = await onCheck(item, ans)
      setResults(r => ({ ...r, [item.key]: res }))
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not check the answer. Try again.')
    } finally { setBusy(false) }
  }

  const next = () => {
    const after = items.findIndex((it, i) => i > idx && !results[it.key])
    const any = items.findIndex(it => !results[it.key])
    const target = after >= 0 ? after : any
    if (target >= 0) setIdx(target)
    else onFinish?.(results)
  }

  const kindStyle = {
    correct: { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#065f46', t: '✓ Correct' },
    partial: { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', t: '◐ Partly correct' },
    wrong: { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', t: '✗ Not quite' },
    skipped: { bg: '#f8fafc', bd: '#e2e8f0', fg: '#475569', t: '— Skipped' },
  }[result?.kind] || null

  return (
    <div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {title && <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#111827', flex: 1 }}>{title}</h3>}
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>{done}/{items.length} done · {correct} correct</span>
      </div>
      <div style={{ height: 6, background: '#eef2ff', borderRadius: 4, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ width: `${(done / items.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16 }}>
        {items.map((it, i) => {
          const r = results[it.key]
          const bg = r ? (r.kind === 'correct' ? '#d1fae5' : r.kind === 'partial' ? '#fef3c7' : '#fee2e2') : '#fff'
          return (
            <button key={it.key} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}`}
              style={{ width: 30, height: 30, borderRadius: 8, border: `1.5px solid ${i === idx ? '#6366f1' : '#e5e7eb'}`, background: i === idx ? '#ede9fe' : bg, fontSize: 11, fontWeight: 800, color: '#475569', cursor: 'pointer' }}>
              {i + 1}
            </button>
          )
        })}
      </div>

      <div className="card" style={{ padding: '1.3rem 1.4rem', borderRadius: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
          <span style={{ fontWeight: 800, color: '#4f46e5' }}>Q{idx + 1}</span>
          {q.subject && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><SubjectDot subject={q.subject} />{q.subject}</span>}
          {q.chapter && <span>· {q.chapter}</span>}
          <span className="tag tag-purple" style={{ fontSize: 10 }}>{(q.question_type || 'single_correct').replace('_', ' ')}</span>
          {item.meta}
        </div>
        {q.text && <div style={{ fontSize: 16, lineHeight: 1.6, color: '#0f172a', whiteSpace: 'pre-wrap', marginBottom: 12, fontWeight: 600 }}>{q.text}</div>}
        {q.question_image && <img src={q.question_image} alt="Question" onClick={() => setLightbox(q.question_image)} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 12, cursor: 'zoom-in' }} />}
        {q.diagram && <img src={q.diagram} alt="Diagram" onClick={() => setLightbox(q.diagram)} style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 12, cursor: 'zoom-in' }} />}

        {q.question_type === 'numerical' ? (
          <input className="inp" inputMode="decimal" placeholder="Your answer (up to 2 decimals)" value={value ?? ''} disabled={!!result}
            onChange={e => set(e.target.value)} style={{ maxWidth: 280, fontSize: 16 }} aria-label="Numerical answer" />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {(q.options || []).map((o, i) => {
              const multi = q.question_type === 'multi_correct'
              const chosen = multi ? (Array.isArray(value) && value.includes(i)) : value === i
              const isRight = result && correctSet.has(i)
              const isWrongPick = result && chosen && !correctSet.has(i)
              return (
                <button key={i} type="button" className={`opt${chosen && !result ? ' sel' : ''}`} disabled={!!result}
                  onClick={() => (multi ? toggle(i) : set(i))}
                  style={{ ...(isRight ? { borderColor: '#34d399', background: '#ecfdf5' } : isWrongPick ? { borderColor: '#fca5a5', background: '#fef2f2' } : {}), cursor: result ? 'default' : 'pointer' }}>
                  <span className="obadge">{multi ? (chosen ? '☑' : '☐') : LABELS[i]}</span>
                  <span className="olabel" style={{ flex: 1 }}>
                    {o.text}
                    {o.image && <img src={o.image} alt={`Option ${LABELS[i]}`} style={{ display: 'block', maxHeight: 90, maxWidth: '100%', marginTop: o.text ? 6 : 0 }} />}
                  </span>
                  {isRight && <span style={{ color: '#059669', fontWeight: 800 }}>✓</span>}
                  {isWrongPick && <span style={{ color: '#dc2626', fontWeight: 800 }}>✗</span>}
                </button>
              )
            })}
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}

        {result && kindStyle && (
          <div role="status" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: kindStyle.bg, border: `1px solid ${kindStyle.bd}`, color: kindStyle.fg }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{kindStyle.t}</div>
            {result.kind !== 'correct' && <div style={{ fontSize: 13.5, marginTop: 4, color: '#1f2937' }}>Correct answer: <CorrectAnswer q={q} result={result} /></div>}
            {result.explanation && <div style={{ fontSize: 13, marginTop: 6, color: '#374151', whiteSpace: 'pre-wrap' }}>{result.explanation}</div>}
            {renderMeta && <div style={{ fontSize: 12.5, marginTop: 6 }}>{renderMeta(item, result)}</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="navarr" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>← Prev</button>
          {!result ? (
            <button className="btn-pri" style={{ flex: 1 }} disabled={busy} onClick={check}>
              {busy ? 'Checking…' : (value === undefined || value === '' || (Array.isArray(value) && !value.length)) ? "Skip and show answer" : 'Check answer'}
            </button>
          ) : (
            <button className="btn-pri" style={{ flex: 1 }} onClick={next}>
              {done >= items.length ? 'Finish →' : 'Next question →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
