/**
 * Mistake notebook — every wrong / skipped question, grouped by chapter,
 * re-attempted on a 3 → 7 → 21 day schedule until right twice in a row.
 */
import { useEffect, useState } from 'react'
import { getNotebook, getDueMistakes, answerMistake } from '../../services/notebookService.js'
import QuestionRunner from './QuestionRunner.jsx'
import { StreakChip, useStreak } from '../Progress/Motivation.jsx'
import { Panel, StatCard, SubjectDot, Loading, ErrorBox, fmtDate } from '../Progress/ui.jsx'

function whenText(d) {
  if (!d) return ''
  const days = Math.round((new Date(d) - Date.now()) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days (${fmtDate(d)})`
}

export default function MistakeNotebook({ onBack, onPractice }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null) // { title, items }
  const [loadingSession, setLoadingSession] = useState(false)
  const [subject, setSubject] = useState('All')
  const [streak, refreshStreak] = useStreak()

  const load = async () => {
    setError(null)
    try { setSummary(await getNotebook()) } catch (e) { setError(e?.response?.data?.detail || 'Could not load your notebook.') }
  }
  useEffect(() => { load() }, [])

  const start = async (chapter = null, upcoming = false) => {
    setLoadingSession(true); setError(null)
    try {
      const due = await getDueMistakes({ chapter, includeUpcoming: upcoming, limit: 20 })
      if (!due.length) { setError(upcoming ? 'Nothing left in this chapter.' : 'Nothing is due right now. Come back on the date shown.'); return }
      setSession({
        title: chapter
          ? `Revising: ${chapter}`
          : (summary?.due || 0) > due.length
            ? `Revising ${due.length} of ${summary.due} due (oldest first)`
            : `Revising ${due.length} due question${due.length !== 1 ? 's' : ''}`,
        items: due.map(d => ({
          key: d.item_id,
          question: d.question,
          meta: <span style={{ color: d.origin === 'skipped' ? '#64748b' : '#b91c1c', fontWeight: 700 }}>· {d.origin === 'skipped' ? 'you skipped this' : 'you got this wrong'} · right {d.times_right}/{d.needed}</span>,
        })),
      })
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load questions.')
    } finally { setLoadingSession(false) }
  }

  if (session) return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={() => { setSession(null); load(); refreshStreak() }}>← Back to notebook</button>
        <StreakChip streak={streak} compact />
      </div>
      <div style={{ marginTop: 12 }}>
        <QuestionRunner
          title={session.title}
          items={session.items}
          onCheck={async (item, ans) => { const r = await answerMistake(item.key, ans); refreshStreak(); return r }}
          onFinish={() => { setSession(null); load() }}
          renderMeta={(_, r) => r.status === 'mastered'
            ? <span style={{ color: '#047857', fontWeight: 800 }}>🎉 Mastered: right twice in a row. Removed from your revision list.</span>
            : r.kind === 'correct'
              ? <span style={{ color: '#065f46' }}>Right {r.times_right}/{r.needed}. Comes back {whenText(r.next_due_at)} to make it stick.</span>
              : <span style={{ color: '#7f1d1d' }}>Back in your list {whenText(r.next_due_at)}. Re-read the concept before then.</span>}
        />
      </div>
    </div>
  )

  if (error && !summary) return <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1.5rem' }}><button className="btn-ghost" onClick={onBack}>← Back</button><div style={{ marginTop: 12 }}><ErrorBox text={error} onRetry={load} /></div></div>
  if (!summary) return <Loading text="Opening your mistake notebook…" />

  const subjects = ['All', ...Array.from(new Set(summary.chapters.map(c => c.subject)))]
  const chapters = summary.chapters.filter(c => subject === 'All' || c.subject === subject)
  const empty = summary.open + summary.mastered === 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: '#111827' }}>📒 Mistake Notebook</h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '3px 0 0' }}>
            Every question you got wrong or skipped. Each one comes back after {summary.schedule_days.join(', ')} days until you get it right {summary.mastery_streak} times in a row.
          </p>
        </div>
        <button className="btn-pri" disabled={!summary.due || loadingSession} onClick={() => start()}>
          {loadingSession ? 'Loading…' : summary.due ? `▶ Revise ${summary.due} due now` : 'Nothing due today'}
        </button>
      </div>

      {streak && <div style={{ marginBottom: 14 }}><StreakChip streak={streak} /></div>}

      {error && <ErrorBox text={error} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="Due today" value={summary.due} color="#b45309" accent="#f59e0b" sub={summary.next_due_at && !summary.due ? `Next ${whenText(summary.next_due_at)}` : null} />
        <StatCard label="In revision" value={summary.open} accent="#6366f1" />
        <StatCard label="Mastered" value={summary.mastered} color="#047857" accent="#10b981" />
      </div>

      {empty ? (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: '#fff', borderRadius: 20, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📒</div>
          <p style={{ fontWeight: 800, fontSize: 17, margin: '0 0 6px', color: '#111827' }}>Your notebook is empty</p>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>After your next test, every wrong or skipped question is added here automatically.</p>
        </div>
      ) : (
        <Panel
          title="By chapter"
          icon="📚"
          right={
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {subjects.map(s => (
                <button key={s} onClick={() => setSubject(s)} style={{ padding: '5px 12px', borderRadius: 20, border: '1.5px solid', borderColor: subject === s ? '#6366f1' : '#e2e8f0', background: subject === s ? '#eef2ff' : '#fff', color: subject === s ? '#4338ca' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          }
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {chapters.map(c => {
              const total = c.open + c.mastered
              return (
                <div key={c.subject + c.chapter} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px auto', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid #eef2f7', borderRadius: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, color: '#1e293b' }}><SubjectDot subject={c.subject} />{c.chapter}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {c.wrong} wrong · {c.skipped} skipped · {c.mastered} mastered
                    </div>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden', display: 'flex' }} title={`${c.mastered} of ${total} mastered`}>
                    <div style={{ width: `${total ? (c.mastered / total) * 100 : 0}%`, background: '#10b981' }} />
                    <div style={{ width: `${total ? (c.due / total) * 100 : 0}%`, background: '#f59e0b' }} />
                  </div>
                  <button className={c.due ? 'btn-pri' : 'btn-sec'} style={{ fontSize: 12, padding: '6px 12px' }} disabled={!c.open || loadingSession}
                    onClick={() => start(c.chapter, !c.due)}>
                    {c.due ? `Revise ${c.due}` : c.open ? 'Practise early' : 'Done ✓'}
                  </button>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b', marginTop: 10, flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#10b981', borderRadius: 2, marginRight: 4 }} />mastered</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#f59e0b', borderRadius: 2, marginRight: 4 }} />due now</span>
          </div>
        </Panel>
      )}

      {onPractice && (
        <div onClick={onPractice} role="button" style={{ cursor: 'pointer', padding: '14px 18px', borderRadius: 16, background: 'linear-gradient(135deg,#fff7ed,#fffbeb)', border: '1px solid #fed7aa', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 26 }} aria-hidden>🎯</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#7c2d12' }}>Practice my weak chapters</div>
            <div style={{ fontSize: 13, color: '#9a3412' }}>A fresh 15–20 question set from your 3 weakest chapters, with instant feedback.</div>
          </div>
          <span style={{ fontWeight: 800, color: '#c2410c' }}>→</span>
        </div>
      )}
    </div>
  )
}
