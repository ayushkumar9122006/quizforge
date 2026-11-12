/**
 * "Practice my weak chapters" — builds a 15–20 question set from the student's
 * 3 weakest chapters; untimed, instant feedback, never counted in rank or trend.
 */
import { useEffect, useState } from 'react'
import { createWeakChapterPractice, getPracticeSet, listPracticeSets, answerPractice } from '../../services/notebookService.js'
import QuestionRunner from './QuestionRunner.jsx'
import { Panel, SubjectDot, Loading, ErrorBox, fmtDate } from '../Progress/ui.jsx'

export default function WeakChapterPractice({ onBack, onNotebook, autoStart = false }) {
  const [sets, setSets] = useState(null)
  const [active, setActive] = useState(null)
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadList = async () => {
    try { setSets(await listPracticeSets()) } catch { setSets([]) }
  }

  const create = async () => {
    setBusy(true); setError(null); setSummary(null)
    try { setActive(await createWeakChapterPractice()) } catch (e) { setError(e?.response?.data?.detail || 'Could not build a practice set.') } finally { setBusy(false) }
  }

  const open = async (id) => {
    setBusy(true); setError(null); setSummary(null)
    try { setActive(await getPracticeSet(id)) } catch (e) { setError(e?.response?.data?.detail || 'Could not open that set.') } finally { setBusy(false) }
  }

  useEffect(() => { loadList(); if (autoStart) create() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (active && !summary) return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <button className="btn-ghost" onClick={() => { setActive(null); loadList() }}>← Back</button>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 14px' }}>
        {active.chapters.map(c => (
          <span key={c.chapter} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 12, fontWeight: 700, color: '#9a3412' }}>
            <SubjectDot subject={c.subject} />{c.chapter}
          </span>
        ))}
        <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>Untimed · doesn't affect your rank or score trend</span>
      </div>
      <QuestionRunner
        title="Practice: weak chapters"
        items={active.items.map(it => ({ key: it.question.id, question: it.question, result: it.result }))}
        onCheck={(item, ans) => answerPractice(active.id, item.key, ans)}
        onFinish={results => {
          const vals = Object.values(results)
          setSummary({ total: vals.length, correct: vals.filter(r => r.kind === 'correct').length })
          loadList()
        }}
        renderMeta={(_, r) => r.kind !== 'correct' ? <span style={{ color: '#7f1d1d' }}>Added to your mistake notebook for revision.</span> : null}
      />
    </div>
  )

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: '#111827' }}>🎯 Practice my weak chapters</h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '3px 0 0' }}>15–20 questions from your 3 weakest chapters, taken from tests you've already finished. You see the answer straight after each question.</p>
        </div>
        <button className="btn-pri" disabled={busy} onClick={create}>{busy ? 'Building…' : '+ New practice set'}</button>
      </div>

      {error && <ErrorBox text={error} />}

      {summary && (
        <div role="status" style={{ padding: '16px 18px', borderRadius: 16, background: '#ecfdf5', border: '1px solid #a7f3d0', marginBottom: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#065f46' }}>Set complete: {summary.correct}/{summary.total} correct</div>
          <div style={{ fontSize: 13.5, color: '#065f46', marginTop: 4 }}>Wrong answers went to your mistake notebook and come back on a 3, 7, 21 day schedule.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-pri" onClick={create}>Another set</button>
            {onNotebook && <button className="btn-sec" onClick={onNotebook}>Open mistake notebook</button>}
          </div>
        </div>
      )}

      {busy && !active && <Loading text="Picking questions from your weak chapters…" />}

      <Panel title="Recent sets" icon="🗂️">
        {sets === null ? <Loading text="Loading…" /> : sets.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>No practice sets yet. Press <b>New practice set</b> to start.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {sets.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #eef2f7', borderRadius: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 14 }}>{s.chapters.map(c => c.chapter).join(' · ')}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(s.created_at)} · {s.answered}/{s.total} answered · {s.correct} correct</div>
                </div>
                <button className="btn-sec" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => open(s.id)}>{s.answered < s.total ? 'Continue →' : 'Review'}</button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
