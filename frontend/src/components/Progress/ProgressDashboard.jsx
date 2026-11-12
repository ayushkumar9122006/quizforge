/**
 * ProgressDashboard — a student's preparation across all full-syllabus tests.
 * Used by the student ("My Progress") and by admins (per-student drilldown).
 *
 * props:
 *   data      — response of GET /progress/me or /progress/students/{id}
 *   title     — heading
 *   onBack    — back handler
 *   adminView — wording tweaks for the admin ("this student" vs "you")
 */
import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { SUBJECT_COLORS } from '../../services/progressService.js'
import {
  TrendBadge, StatCard, Panel, PctBar, SubjectDot, fmtDate, shortTitle, QTYPE_LABELS,
} from './ui.jsx'
import { TargetPanel, TimeStrategySummary, DifficultySummary } from './StrategyPanels.jsx'
import MotivationSection from './Motivation.jsx'

const DIAG_LABEL = {
  avoiding: { text: 'Avoiding', color: '#92400e', bg: '#fef3c7' },
  concept_gap: { text: 'Concept gap', color: '#991b1b', bg: '#fee2e2' },
  repeat_errors: { text: 'Repeat errors', color: '#9a3412', bg: '#ffedd5' },
  guessing: { text: 'Guessing', color: '#6b21a8', bg: '#f3e8ff' },
  low_accuracy: { text: 'Low accuracy', color: '#1e40af', bg: '#dbeafe' },
}

function metricText(trend, adminView) {
  if (!trend || trend.label === 'not_enough_data') return `Take at least 2 tests to see a trend.`
  const m = trend.metric === 'percentile' ? 'percentile' : 'score %'
  const d = trend.last_vs_prev
  const who = adminView ? 'Last test' : 'Your last test'
  if (d == null) return `Based on ${m}.`
  return `${who} was ${Math.abs(d)} ${trend.metric === 'percentile' ? 'percentile pts' : 'pts'} ${d >= 0 ? 'above' : 'below'} the previous average (by ${m}).`
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 6px 20px rgba(0,0,0,.08)' }}>
      <div style={{ fontWeight: 800, color: '#111827', marginBottom: 4 }}>{p.full || label}</div>
      {p.date && <div style={{ color: '#94a3b8', marginBottom: 4 }}>{p.date}</div>}
      {payload.map(e => (
        <div key={e.dataKey} style={{ color: e.color, fontWeight: 700 }}>{e.name}: {e.value}{e.dataKey === 'percentile' ? '' : '%'}</div>
      ))}
      {p.rank && <div style={{ color: '#475569', marginTop: 4 }}>Rank {p.rank} of {p.participants}</div>}
    </div>
  )
}

function Heatmap({ chapters, timeline }) {
  const [subject, setSubject] = useState('All')
  const subjects = ['All', ...Array.from(new Set(chapters.map(c => c.subject)))]
  const rows = chapters
    .filter(c => subject === 'All' || c.subject === subject)
    .slice()
    .sort((a, b) => (b.tests_with_mistakes - a.tests_with_mistakes) || (b.mistake_pct - a.mistake_pct))
    .slice(0, 18)
  const cols = timeline.slice(-8)

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {subjects.map(s => (
          <button key={s} onClick={() => setSubject(s)} style={{ padding: '5px 12px', borderRadius: 20, border: '1.5px solid', borderColor: subject === s ? '#6366f1' : '#e2e8f0', background: subject === s ? '#eef2ff' : '#fff', color: subject === s ? '#4338ca' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{s}</button>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 4, fontSize: 12, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: '#64748b', fontWeight: 800, padding: '0 8px 4px 0', minWidth: 210 }}>CHAPTER</th>
              {cols.map(t => (
                <th key={t.attempt_id} title={t.quiz_title} style={{ color: '#64748b', fontWeight: 700, minWidth: 54, fontSize: 11 }}>{shortTitle(t.quiz_title, 10)}</th>
              ))}
              <th style={{ color: '#64748b', fontWeight: 800, minWidth: 70 }}>WRONG IN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const byAttempt = Object.fromEntries((c.history || []).map(h => [h.attempt_id, h]))
              return (
                <tr key={c.subject + c.chapter}>
                  <td style={{ padding: '2px 8px 2px 0', fontWeight: 700, color: '#1e293b' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><SubjectDot subject={c.subject} />{c.chapter}</span>
                  </td>
                  {cols.map(t => {
                    const h = byAttempt[t.attempt_id]
                    if (!h) return <td key={t.attempt_id} style={{ background: '#f8fafc', borderRadius: 6, height: 30 }} title="Not in this test" />
                    const wrongShare = h.questions ? (h.wrong + h.partial * 0.5) / h.questions : 0
                    const allRight = h.correct === h.questions
                    const onlySkipped = h.skipped === h.questions
                    const bg = allRight ? '#bbf7d0' : onlySkipped ? '#e2e8f0' : h.wrong === 0 ? '#fef08a' : wrongShare >= 0.67 ? '#f87171' : wrongShare >= 0.34 ? '#fca5a5' : '#fecaca'
                    const fg = wrongShare >= 0.67 && !allRight ? '#fff' : '#1e293b'
                    return (
                      <td key={t.attempt_id} title={`${t.quiz_title}: ${h.correct} correct, ${h.wrong} wrong, ${h.skipped} skipped of ${h.questions}`}
                        style={{ background: bg, color: fg, borderRadius: 6, textAlign: 'center', fontWeight: 800, height: 30, fontVariantNumeric: 'tabular-nums' }}>
                        {allRight ? '✓' : h.wrong > 0 ? `✗${h.wrong}` : onlySkipped ? '–' : `${h.correct}/${h.questions}`}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'center', fontWeight: 800, color: c.recurring ? '#b91c1c' : '#475569' }}>
                    {c.tests_with_mistakes}/{c.tests_appeared}{c.recurring ? ' 🔁' : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 11, color: '#64748b' }}>
        <span><b style={{ color: '#15803d' }}>✓</b> all correct</span>
        <span><b style={{ color: '#b91c1c' }}>✗n</b> n wrong (darker = larger share wrong)</span>
        <span><b>–</b> all skipped</span>
        <span>🔁 wrong in at least half the tests it appeared in</span>
      </div>
    </>
  )
}

function ChapterTable({ chapters }) {
  const [subject, setSubject] = useState('All')
  const [sort, setSort] = useState('mistake_pct')
  const [showAll, setShowAll] = useState(false)
  const subjects = ['All', ...Array.from(new Set(chapters.map(c => c.subject)))]
  const rows = chapters
    .filter(c => subject === 'All' || c.subject === subject)
    .slice()
    .sort((a, b) => (b[sort] - a[sort]) || (b.questions - a.questions))
  const visible = showAll ? rows : rows.slice(0, 12)
  const th = (key, label, align = 'center') => (
    <th onClick={key ? () => setSort(key) : undefined} style={{ textAlign: align, padding: '9px 8px', color: sort === key ? '#4338ca' : '#64748b', fontSize: 11, fontWeight: 800, cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
      {label}{sort === key ? ' ▾' : ''}
    </th>
  )
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {subjects.map(s => (
          <button key={s} onClick={() => setSubject(s)} style={{ padding: '5px 12px', borderRadius: 20, border: '1.5px solid', borderColor: subject === s ? '#6366f1' : '#e2e8f0', background: subject === s ? '#eef2ff' : '#fff', color: subject === s ? '#4338ca' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{s}</button>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
              {th(null, 'CHAPTER', 'left')}
              {th('questions', 'QS')}
              {th('mistake_pct', 'MISTAKE % (of attempted)')}
              {th('skip_pct', 'SKIPPED %')}
              {th('accuracy', 'ACCURACY')}
              {th('marks_lost', 'MARKS LOST')}
              {th('tests_with_mistakes', 'WRONG IN')}
              {th(null, 'RECENT')}
            </tr>
          </thead>
          <tbody>
            {visible.map(c => (
              <tr key={c.subject + c.chapter} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '9px 8px', fontWeight: 700, color: '#1e293b' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><SubjectDot subject={c.subject} />{c.chapter}</span>
                </td>
                <td style={{ textAlign: 'center', color: '#475569' }}>{c.questions}</td>
                <td style={{ padding: '0 8px' }}><PctBar value={c.mistake_pct} color={c.mistake_pct >= 50 ? '#ef4444' : c.mistake_pct >= 30 ? '#f59e0b' : '#22c55e'} /></td>
                <td style={{ padding: '0 8px' }}><PctBar value={c.skip_pct} color="#94a3b8" width={90} /></td>
                <td style={{ textAlign: 'center', fontWeight: 800, color: c.accuracy >= 70 ? '#059669' : c.accuracy >= 40 ? '#d97706' : '#dc2626' }}>{c.accuracy}%</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#b91c1c' }}>−{c.marks_lost}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: c.recurring ? '#b91c1c' : '#475569' }}>{c.tests_with_mistakes}/{c.tests_appeared}</td>
                <td style={{ textAlign: 'center' }}>{['improving', 'worsening', 'steady'].includes(c.trend) ? <TrendBadge label={c.trend} size={11} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <button className="btn-ghost" style={{ marginTop: 10, color: '#4f46e5', fontWeight: 700 }} onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Show top 12' : `Show all ${rows.length} chapters`}
        </button>
      )}
    </>
  )
}

export default function ProgressDashboard({ data, title = 'My Progress', onBack, adminView = false, onReload, onPractice, onNotebook }) {
  const timeline = data?.timeline || []
  const chartData = useMemo(() => timeline.map((t, i) => ({
    name: shortTitle(t.quiz_title) || `Test ${i + 1}`,
    full: t.quiz_title,
    date: fmtDate(t.date),
    score_pct: t.score_pct,
    percentile: t.percentile,
    rank: t.rank,
    participants: t.participants,
    ...Object.fromEntries(Object.entries(t.subjects || {}).map(([k, v]) => [k, v.score_pct])),
  })), [timeline])

  if (!data) return null
  const s = data.summary || {}
  const trend = s.trend || {}
  const subjects = (data.subject_trends || []).map(x => x.subject)
  const you = adminView ? 'this student' : 'you'

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {onBack && <button className="btn-ghost" onClick={onBack}>← Back</button>}
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: '#111827' }}>{title}</h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '3px 0 0' }}>
            {adminView && data.student?.name ? `${data.student.name}${data.student.email ? ' · ' + data.student.email : ''} · ` : ''}
            Performance across every full-syllabus test, and the chapters where marks keep slipping.
          </p>
        </div>
        {data.tests_taken > 0 && <TrendBadge label={trend.label} size={13} title={metricText(trend, adminView)} />}
      </div>

      {data.tests_taken === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#fff', borderRadius: 20, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>📈</div>
          <p style={{ fontWeight: 800, fontSize: 18, margin: '0 0 6px', color: '#111827' }}>No completed tests yet</p>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>After the first full-syllabus test, the score curve and chapter weaknesses will appear here.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
            <StatCard label="Tests taken" value={data.tests_taken} sub={s.last ? `Last: ${fmtDate(s.last.date)}` : null} accent="#6366f1" />
            <StatCard label="Average score" value={`${s.average_score_pct}%`} sub={s.best ? `Best ${s.best.score_pct}% · ${shortTitle(s.best.quiz_title)}` : null} accent="#0ea5e9" />
            <StatCard label="Average percentile" value={s.average_percentile ?? '—'} sub="share of batch at or below the score" accent="#8b5cf6" />
            <StatCard label="Last test" value={s.last ? `${s.last.score}/${s.last.total_marks}` : '—'} sub={s.last ? `Rank ${s.last.rank} of ${s.last.participants} · ${s.last.percentile} %ile` : null} accent="#f59e0b" />
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '14px 16px', borderTop: '3px solid #10b981' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>Trend</div>
              <div style={{ marginTop: 8 }}><TrendBadge label={trend.label} size={14} /></div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>{metricText(trend, adminView)}</div>
            </div>
          </div>

          {data.insights?.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
              {data.insights.map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', background: ins.kind === 'trend' && trend.label === 'improving' ? '#ecfdf5' : '#fffbeb', border: `1px solid ${ins.kind === 'trend' && trend.label === 'improving' ? '#a7f3d0' : '#fde68a'}`, borderRadius: 12, fontSize: 13.5, color: '#1f2937', lineHeight: 1.5 }}>
                  <span aria-hidden>{ins.kind === 'negative_marking' ? '⚠️' : ins.kind === 'trend' ? (trend.label === 'improving' ? '📈' : '📉') : ins.kind === 'subject_gap' ? '⚖️' : ins.kind === 'untagged' ? '🏷️' : '💡'}</span>
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}

          {!adminView && (onPractice || onNotebook) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 18 }}>
              {onPractice && (
                <button onClick={onPractice} style={{ textAlign: 'left', cursor: 'pointer', padding: '14px 16px', borderRadius: 16, background: 'linear-gradient(135deg,#fff7ed,#fffbeb)', border: '1px solid #fed7aa' }}>
                  <div style={{ fontWeight: 900, color: '#7c2d12', fontSize: 15 }}>🎯 Practice my weak chapters</div>
                  <div style={{ fontSize: 12.5, color: '#9a3412', marginTop: 3 }}>15–20 questions from {data.weak_chapters?.slice(0, 3).map(c => c.chapter).join(', ') || 'your weakest chapters'}</div>
                </button>
              )}
              {onNotebook && (
                <button onClick={onNotebook} style={{ textAlign: 'left', cursor: 'pointer', padding: '14px 16px', borderRadius: 16, background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', border: '1px solid #c7d2fe' }}>
                  <div style={{ fontWeight: 900, color: '#312e81', fontSize: 15 }}>📒 Mistake notebook</div>
                  <div style={{ fontSize: 12.5, color: '#4f46e5', marginTop: 3 }}>Re-attempt every wrong or skipped question on a 3, 7, 21 day schedule</div>
                </button>
              )}
            </div>
          )}

          <TargetPanel target={data.target} editable={!adminView} onSaved={onReload} />

          {(!adminView || data.student?.id) && <MotivationSection studentId={adminView ? data.student.id : null} />}

          <Panel title="Score curve across tests" icon="📈" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>Percentile adjusts for how hard each paper was</span>}>
            {timeline.length < 2 && <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 8px' }}>One test so far. The curve fills in as more tests are taken.</p>}
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line isAnimationActive={false} type="monotone" name="Score %" dataKey="score_pct" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                <Line isAnimationActive={false} type="monotone" name="Percentile" dataKey="percentile" stroke="#10b981" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: '#10b981' }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {subjects.length > 0 && (
            <Panel title="Subject-wise trend" icon="🧪">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {data.subject_trends.map(st => (
                  <div key={st.subject} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#f8fafc', borderRadius: 12, border: '1px solid #eef2f7' }}>
                    <SubjectDot subject={st.subject} size={10} />
                    <b style={{ fontSize: 13, color: '#1e293b' }}>{st.subject}</b>
                    <span style={{ fontSize: 12, color: '#64748b' }}>avg {st.average_score_pct}%</span>
                    <TrendBadge label={st.trend.label} size={11} />
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} formatter={v => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {subjects.map(sub => (
                    <Line isAnimationActive={false} key={sub} type="monotone" dataKey={sub} name={sub} stroke={SUBJECT_COLORS[sub] || '#64748b'} strokeWidth={2.2} dot={{ r: 3 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {data.study_plan?.length > 0 && (
            <Panel title={adminView ? 'Focus list for this student' : 'Your focus list before the next test'} icon="🎯" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>Ranked by marks lost, repeated mistakes counted extra</span>}>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.weak_chapters.slice(0, 5).map((c, i) => {
                  const d = DIAG_LABEL[c.diagnosis] || DIAG_LABEL.low_accuracy
                  return (
                    <div key={c.subject + c.chapter} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12, padding: '12px 14px', border: '1px solid #eef2f7', borderRadius: 14, background: i === 0 ? '#fff7ed' : '#fff' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: i === 0 ? '#f97316' : '#e0e7ff', color: i === 0 ? '#fff' : '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{i + 1}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <b style={{ fontSize: 15, color: '#111827' }}>{c.chapter}</b>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}><SubjectDot subject={c.subject} />{c.subject}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: d.bg, color: d.color }}>{d.text}</span>
                          {c.recurring && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#b91c1c' }}>🔁 wrong in {c.tests_with_mistakes} of {c.tests_appeared} tests</span>}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 6px' }}>
                          {c.mistake_pct}% wrong · {c.skip_pct}% skipped · −{c.marks_lost} marks over {c.questions} questions
                        </div>
                        <div style={{ fontSize: 13.5, color: '#1f2937', lineHeight: 1.5 }}>{c.advice}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          {data.chapters?.length > 0 && (
            <Panel title="Where mistakes repeat (chapter × test)" icon="🧭" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>Last {Math.min(8, timeline.length)} tests</span>}>
              <Heatmap chapters={data.chapters} timeline={timeline} />
            </Panel>
          )}

          {data.chapters?.length > 0 && (
            <Panel title="Chapter-wise mistakes across all tests" icon="📚" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>Click a column to sort</span>}>
              <ChapterTable chapters={data.chapters} />
              {data.untagged_share_pct > 0 && (
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>
                  {data.untagged_share_pct}% of questions {adminView ? 'this student saw' : 'you saw'} have no chapter tag yet and are not counted here.
                </p>
              )}
            </Panel>
          )}

          <DifficultySummary d={data.difficulty} />
          <TimeStrategySummary ts={data.time_strategy} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
            {data.strong_chapters?.length > 0 && (
              <Panel title="Strong chapters" icon="💪" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {data.strong_chapters.map(c => (
                    <span key={c.subject + c.chapter} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 20, background: '#ecfdf5', border: '1px solid #a7f3d0', fontSize: 12.5, fontWeight: 700, color: '#065f46' }}>
                      <SubjectDot subject={c.subject} />{c.chapter} · {c.score_pct}%
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>Keep these warm with quick revision. Don't spend new study hours here.</p>
              </Panel>
            )}
            {data.question_types?.length > 0 && (
              <Panel title="By question type" icon="🧩" style={{ marginBottom: 0 }}>
                <div style={{ display: 'grid', gap: 9 }}>
                  {data.question_types.map(q => (
                    <div key={q.question_type} style={{ display: 'grid', gridTemplateColumns: '1fr 150px', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{QTYPE_LABELS[q.question_type] || q.question_type}<span style={{ color: '#94a3b8', fontWeight: 500 }}> · {q.attempted}/{q.questions} attempted</span></div>
                      <PctBar value={q.accuracy} color={q.accuracy >= 70 ? '#22c55e' : q.accuracy >= 40 ? '#f59e0b' : '#ef4444'} label={`${q.accuracy}%`} />
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>Accuracy on attempted questions.</p>
              </Panel>
            )}
          </div>

          <Panel title="Test history" icon="🗂️" style={{ marginTop: 18 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9', color: '#64748b', fontSize: 11 }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>TEST</th>
                    <th>DATE</th><th>SCORE</th><th>RANK</th><th>BATCH %ILE</th><th title="Estimated JEE Main percentile from marks scaled to 300">JEE %ILE*</th>
                    {subjects.map(sub => <th key={sub}>{sub.slice(0, 4).toUpperCase()}</th>)}
                    <th>−VE MARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.slice().reverse().map(t => (
                    <tr key={t.attempt_id} style={{ borderBottom: '1px solid #f8fafc', textAlign: 'center' }}>
                      <td style={{ textAlign: 'left', padding: '9px 8px', fontWeight: 700, color: '#1e293b' }}>{t.quiz_title}</td>
                      <td style={{ color: '#64748b' }}>{fmtDate(t.date)}</td>
                      <td style={{ fontWeight: 800 }}>{t.score}/{t.total_marks} <span style={{ color: '#94a3b8', fontWeight: 600 }}>({t.score_pct}%)</span></td>
                      <td>{t.rank}/{t.participants}</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>{t.percentile}</td>
                      <td style={{ color: '#4338ca', fontWeight: 700 }}>{t.estimated_jee_percentile != null ? `≈${t.estimated_jee_percentile}` : '—'}</td>
                      {subjects.map(sub => <td key={sub} style={{ color: SUBJECT_COLORS[sub], fontWeight: 700 }}>{t.subjects?.[sub] ? `${t.subjects[sub].score_pct}%` : '—'}</td>)}
                      <td style={{ color: '#b91c1c', fontWeight: 700 }}>{t.negative_marks ? `−${t.negative_marks}` : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Score % uses JEE marking (+4/−1 or as set by the admin). Percentile = share of test-takers who scored at or below {you}.</p>
        </>
      )}
    </div>
  )
}
