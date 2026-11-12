/**
 * AttemptReport — the "Performance Report" tab on the results screen.
 * One test: rank + percentile, subject-wise rank vs topper/average, where the
 * marks were lost (by chapter), and — for the student — how this test fits
 * into their history (score curve + chapter mistake % across all tests).
 */
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import { getAttemptReport, getMyProgress, SUBJECT_COLORS } from '../../services/progressService.js'
import { Panel, PctBar, SubjectDot, StatCard, TrendBadge, Loading, ErrorBox, shortTitle, fmtDate } from './ui.jsx'
import { TimeStrategyPanel, DifficultyPanel, TargetPanel } from './StrategyPanels.jsx'

export default function AttemptReport({ attemptId, showHistory = true, onOpenProgress }) {
  const [report, setReport] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!attemptId) return
    setLoading(true)
    setError(null)
    try {
      const [rep, prog] = await Promise.all([
        getAttemptReport(attemptId),
        showHistory ? getMyProgress().catch(() => null) : Promise.resolve(null),
      ])
      setReport(rep)
      setProgress(prog)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load the performance report.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [attemptId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!attemptId) return <ErrorBox text="This result has no attempt id, so the report is unavailable." />
  if (loading) return <Loading text="Building your performance report…" />
  if (error) return <ErrorBox text={error} onRetry={load} />
  if (!report) return null

  const r = report
  const m = r.mistakes
  const lost = m.marks_lost_to_wrong + m.marks_left_in_skipped
  const tagged = r.chapters.filter(c => c.chapter !== 'Untagged')
  const lossRows = tagged.filter(c => c.marks_lost > 0).slice(0, 10)
  const timeline = progress?.timeline || []
  const curve = timeline.map(t => ({ name: shortTitle(t.quiz_title), score_pct: t.score_pct, percentile: t.percentile, id: t.attempt_id, full: t.quiz_title }))
  const thisPoint = curve.find(p => p.id === r.attempt_id)

  return (
    <div>
      {/* Standing */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="Rank" value={r.rank ? `#${r.rank}` : '—'} sub={`of ${r.participants} student${r.participants !== 1 ? 's' : ''}`} accent="#6366f1" color="#4338ca" />
        <StatCard label="Percentile" value={r.percentile ?? '—'} sub="scored at or below you" accent="#10b981" color="#047857" />
        <StatCard label="Your score" value={`${r.score}/${r.total_marks}`} sub={`${r.score_pct}% · accuracy ${r.accuracy}%`} accent="#0ea5e9" />
        <StatCard label="Topper / Average" value={`${r.topper_score} / ${r.average_score}`} sub={Math.abs(r.score - r.average_score) < 0.05 ? 'Equal to the average' : r.score > r.average_score ? `You're ${(r.score - r.average_score).toFixed(1)} above average` : `${(r.average_score - r.score).toFixed(1)} below average`} accent="#f59e0b" />
      </div>

      {/* Subject-wise standing */}
      <Panel title="Subject-wise rank" icon="🏅">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #f1f5f9', color: '#64748b', fontSize: 11 }}>
                <th style={{ textAlign: 'left', padding: '9px 8px' }}>SUBJECT</th>
                <th>SCORE</th><th>RANK</th><th>PERCENTILE</th><th>TOPPER</th><th>AVERAGE</th><th>✓ / ✗ / –</th><th>−VE</th>
              </tr>
            </thead>
            <tbody>
              {r.subjects.map(s => (
                <tr key={s.subject} style={{ borderBottom: '1px solid #f8fafc', textAlign: 'center' }}>
                  <td style={{ textAlign: 'left', padding: '11px 8px', fontWeight: 800, color: '#1e293b' }}>
                    <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><SubjectDot subject={s.subject} size={10} />{s.subject}</span>
                  </td>
                  <td style={{ fontWeight: 800, color: SUBJECT_COLORS[s.subject] || '#111827' }}>{s.score}/{s.max}</td>
                  <td style={{ fontWeight: 800 }}>{s.rank}<span style={{ color: '#94a3b8', fontWeight: 600 }}>/{r.participants}</span></td>
                  <td style={{ color: '#047857', fontWeight: 700 }}>{s.percentile}</td>
                  <td>{s.topper_score}</td>
                  <td>{s.average_score}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#059669', fontWeight: 700 }}>{s.correct}</span> / <span style={{ color: '#dc2626', fontWeight: 700 }}>{s.wrong + s.partial}</span> / <span style={{ color: '#64748b' }}>{s.skipped}</span></td>
                  <td style={{ color: '#b91c1c', fontWeight: 700 }}>{s.negative ? `−${s.negative}` : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Mistake breakdown */}
      <Panel title="Where your marks went" icon="🔍">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#991b1b' }}>WRONG ANSWERS</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#b91c1c' }}>{r.counts.wrong + r.counts.partial}</div>
            <div style={{ fontSize: 12, color: '#7f1d1d' }}>cost {m.marks_lost_to_wrong} marks (incl. −{m.negative_marks} negative)</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>SKIPPED</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#334155' }}>{r.counts.skipped}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{m.marks_left_in_skipped} marks left on the table</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#065f46' }}>CORRECT</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#047857' }}>{r.counts.correct}</div>
            <div style={{ fontSize: 12, color: '#065f46' }}>of {r.counts.questions} questions</div>
          </div>
        </div>
        {lost > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 12, display: 'flex', borderRadius: 6, overflow: 'hidden', background: '#f1f5f9' }} role="img" aria-label={`Marks lost: ${m.marks_lost_to_wrong} to wrong answers, ${m.marks_left_in_skipped} to skipped questions`}>
              <div style={{ width: `${(m.marks_lost_to_wrong / lost) * 100}%`, background: '#ef4444' }} />
              <div style={{ width: `${(m.marks_left_in_skipped / lost) * 100}%`, background: '#94a3b8' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', marginTop: 6, flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#ef4444', marginRight: 5 }} />Lost to wrong answers ({Math.round((m.marks_lost_to_wrong / lost) * 100)}%)</span>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#94a3b8', marginRight: 5 }} />Left in skipped questions ({Math.round((m.marks_left_in_skipped / lost) * 100)}%)</span>
            </div>
          </div>
        )}

        {lossRows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9', color: '#64748b', fontSize: 11 }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>CHAPTER (most marks lost first)</th>
                  <th>QS</th><th>✓ / ✗ / –</th><th>MARKS LOST</th><th style={{ minWidth: 150 }}>BATCH ACCURACY</th><th>WHAT IT MEANS</th>
                </tr>
              </thead>
              <tbody>
                {lossRows.map(c => {
                  const mine = c.attempted ? (c.correct / c.attempted) * 100 : 0
                  const hardForAll = c.batch_accuracy < 40
                  const meaning = c.wrong + c.partial === 0 && c.skipped > 0
                    ? (c.batch_accuracy >= 60 ? 'Skipped (most got it)' : 'Skipped')
                    : hardForAll ? 'Hard for everyone' : (mine + 25 < c.batch_accuracy ? 'Your weak spot' : 'Below target')
                  const color = (meaning === 'Your weak spot' || meaning === 'Skipped (most got it)') ? '#b91c1c' : meaning === 'Hard for everyone' ? '#92400e' : '#475569'
                  return (
                    <tr key={c.subject + c.chapter} style={{ borderBottom: '1px solid #f8fafc', textAlign: 'center' }}>
                      <td style={{ textAlign: 'left', padding: '9px 8px', fontWeight: 700, color: '#1e293b' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><SubjectDot subject={c.subject} />{c.chapter}</span>
                      </td>
                      <td>{c.questions}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#059669', fontWeight: 700 }}>{c.correct}</span> / <span style={{ color: '#dc2626', fontWeight: 700 }}>{c.wrong + c.partial}</span> / {c.skipped}</td>
                      <td style={{ color: '#b91c1c', fontWeight: 800 }}>−{c.marks_lost}</td>
                      <td style={{ padding: '0 8px' }}><PctBar value={c.batch_accuracy} color="#6366f1" /></td>
                      <td style={{ fontWeight: 700, color, fontSize: 12, whiteSpace: 'nowrap' }}>{meaning}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{tagged.length ? 'No marks lost in tagged chapters. Excellent.' : 'Chapter breakdown appears once the admin tags questions with chapters.'}</p>
        )}
        {r.untagged_questions > 0 && <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>{r.untagged_questions} question{r.untagged_questions !== 1 ? 's' : ''} in this test {r.untagged_questions !== 1 ? 'have' : 'has'} no chapter tag yet.</p>}
      </Panel>

      <TargetPanel target={r.target} compact editable={showHistory} onSaved={load} />
      <DifficultyPanel d={r.difficulty} />
      <TimeStrategyPanel ts={r.time_strategy} />

      {/* History context */}
      {showHistory && progress && progress.tests_taken > 0 && (
        <Panel
          title="Your journey so far"
          icon="🧗"
          right={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><TrendBadge label={progress.summary?.trend?.label} />{onOpenProgress && <button className="btn-sec" style={{ fontSize: 12, padding: '5px 12px' }} onClick={onOpenProgress}>Full progress →</button>}</div>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 6 }}>SCORE % IN EVERY TEST ({progress.tests_taken})</div>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={curve} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} labelFormatter={(l, p) => p?.[0]?.payload?.full || l} />
                  <Line isAnimationActive={false} type="monotone" dataKey="score_pct" name="Score %" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3.5 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="percentile" name="Percentile" stroke="#10b981" strokeWidth={1.8} strokeDasharray="5 4" dot={false} />
                  {thisPoint && <ReferenceDot x={thisPoint.name} y={thisPoint.score_pct} r={7} fill="#f97316" stroke="#fff" strokeWidth={2} />}
                </LineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11, color: '#94a3b8' }}><span style={{ color: '#f97316' }}>●</span> this test · <span style={{ color: '#10b981' }}>- -</span> percentile</div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>MISTAKE % PER CHAPTER, ALL TESTS (TOP 8)</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(progress.chapters || []).filter(c => c.attempted > 0).slice().sort((a, b) => b.mistake_pct - a.mistake_pct || b.questions - a.questions).slice(0, 8).map(c => (
                  <div key={c.subject + c.chapter} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 140px', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }} title={`${c.chapter} · wrong in ${c.tests_with_mistakes}/${c.tests_appeared} tests`}>
                      <SubjectDot subject={c.subject} />{c.chapter}{c.recurring ? ' 🔁' : ''}
                    </div>
                    <PctBar value={c.mistake_pct} color={c.mistake_pct >= 50 ? '#ef4444' : c.mistake_pct >= 30 ? '#f59e0b' : '#22c55e'} />
                  </div>
                ))}
              </div>
              {progress.study_plan?.[0] && (
                <div style={{ marginTop: 14, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, fontSize: 13, color: '#7c2d12', lineHeight: 1.5 }}>
                  <b>Revise first: {progress.study_plan[0].chapter}.</b> {progress.study_plan[0].action}
                </div>
              )}
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0' }}>Report generated {fmtDate(new Date())} · 🔁 = wrong in at least half of the tests the chapter appeared in.</p>
        </Panel>
      )}
    </div>
  )
}
