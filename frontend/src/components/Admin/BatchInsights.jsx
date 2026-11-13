/**
 * BatchInsights — admin view of the whole batch:
 *   • every student with test count, average, last result, trend and weakest chapter
 *   • chapters the batch keeps getting wrong (for teaching plans)
 *   • per-test batch average curve
 * Clicking a student opens their full progress dashboard.
 */
import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getBatchInsights, getMostImproved } from '../../services/progressService.js'
import MyProgress from '../Progress/MyProgress.jsx'
import { MostImprovedPanel } from '../Progress/Motivation.jsx'
import { Panel, PctBar, SubjectDot, Sparkline, StatCard, TrendBadge, Loading, ErrorBox, shortTitle, fmtDate } from '../Progress/ui.jsx'

export default function BatchInsights({ onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [student, setStudent] = useState(null)
  const [tab, setTab] = useState('students')
  const [query, setQuery] = useState('')
  const [trendFilter, setTrendFilter] = useState('all')
  const [subject, setSubject] = useState('All')
  const [improved, setImproved] = useState(null)

  const load = async () => {
    setError(null)
    try { setData(await getBatchInsights()) } catch (e) { setError(e?.response?.data?.detail || 'Could not load batch insights.') }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (tab === 'improved' && !improved) getMostImproved(50).then(setImproved).catch(() => setImproved({ entries: [], rule: 'Could not load.' }))
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const students = useMemo(() => (data?.students || []).filter(s =>
    (trendFilter === 'all' || s.trend === trendFilter) &&
    (!query || `${s.name} ${s.email || ''}`.toLowerCase().includes(query.toLowerCase()))
  ), [data, query, trendFilter])

  if (student) return <MyProgress studentId={student.student_id} onBack={() => setStudent(null)} />
  if (error) return <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1.5rem' }}><button className="btn-ghost" onClick={onBack}>← Back</button><div style={{ marginTop: 12 }}><ErrorBox text={error} onRetry={load} /></div></div>
  if (!data) return <Loading text="Analysing the batch…" />

  const tc = data.trend_counts || {}
  const subjects = ['All', ...Array.from(new Set(data.chapters.map(c => c.subject)))]
  const chapters = data.chapters.filter(c => subject === 'All' || c.subject === subject)
  const testSubjects = Array.from(new Set(data.tests.flatMap(t => Object.keys(t.subjects || {}))))
  const curve = data.tests.map(t => ({ name: shortTitle(t.quiz_title), full: t.quiz_title, avg: t.average_score_pct, topper: t.topper_score_pct, n: t.participants, ...t.subjects }))
  const SUBJ_COL = { Physics: '#2563eb', Chemistry: '#059669', Mathematics: '#d97706' }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: '#111827' }}>Students & Progress</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '3px 0 0' }}>Who is improving, who is slipping, and the chapters the batch keeps getting wrong.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="Students" value={data.students.length} sub={`${data.tests.length} test${data.tests.length !== 1 ? 's' : ''} analysed`} accent="#6366f1" />
        <StatCard label="Improving" value={tc.improving || 0} color="#047857" accent="#10b981" />
        <StatCard label="Steady" value={tc.steady || 0} color="#1d4ed8" accent="#3b82f6" />
        <StatCard label="Declining" value={tc.declining || 0} color="#b91c1c" accent="#ef4444" />
        <StatCard label="Need 2+ tests" value={tc.not_enough_data || 0} color="#64748b" accent="#cbd5e1" />
      </div>

      {data.untagged_share_pct > 20 && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, fontSize: 13, color: '#92400e', marginBottom: 14 }}>
          🏷️ {data.untagged_share_pct}% of attempted questions have no chapter tag. Open a quiz's <b>Chapters</b> screen to tag them so weak-chapter analysis is complete.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: '#f1f5f9', padding: 5, borderRadius: 14, border: '1px solid #e2e8f0' }}>
        {[['students', '👥 Students'], ['chapters', '📚 Batch weak chapters'], ['tests', '📈 Test trend'], ['improved', '🚀 Most improved']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: tab === k ? '#6366f1' : 'transparent', color: tab === k ? '#fff' : '#475569', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {tab === 'improved' && (improved
        ? <MostImprovedPanel data={improved} adminView onOpenStudent={r => setStudent({ student_id: r.student_id })} />
        : <Loading text="Ranking improvement…" />)}

      {tab === 'students' && (
        <Panel
          title="All students"
          icon="👥"
          right={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="inp-sm" placeholder="Search name or email" value={query} onChange={e => setQuery(e.target.value)} style={{ minWidth: 190 }} />
              <select className="inp-sm" value={trendFilter} onChange={e => setTrendFilter(e.target.value)}>
                <option value="all">All trends</option>
                <option value="improving">Improving</option>
                <option value="steady">Steady</option>
                <option value="declining">Declining</option>
                <option value="not_enough_data">Need 2+ tests</option>
              </select>
            </div>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9', color: '#64748b', fontSize: 11 }}>
                  <th style={{ textAlign: 'left', padding: '9px 8px' }}>STUDENT</th>
                  <th>TESTS</th><th>AVG SCORE</th><th>LAST TEST</th><th>CURVE</th><th>TREND</th><th style={{ textAlign: 'left' }}>WEAKEST CHAPTER</th><th />
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.student_id} onClick={() => setStudent(s)} style={{ borderBottom: '1px solid #f8fafc', textAlign: 'center', cursor: 'pointer' }} onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                    <td style={{ textAlign: 'left', padding: '10px 8px' }}>
                      <div style={{ fontWeight: 800, color: '#111827' }}>{s.name}</div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{s.email}</div>
                    </td>
                    <td>{s.tests_taken}</td>
                    <td style={{ fontWeight: 800 }}>{s.average_score_pct}%</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{s.last_score_pct}%</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>rank {s.last_rank} · {s.last_percentile} %ile · {fmtDate(s.last_date)}</div>
                    </td>
                    <td><Sparkline values={s.spark} color={s.trend === 'declining' ? '#ef4444' : s.trend === 'improving' ? '#10b981' : '#6366f1'} /></td>
                    <td><TrendBadge label={s.trend} size={11} /></td>
                    <td style={{ textAlign: 'left', color: s.top_weak_chapter ? '#b91c1c' : '#cbd5e1', fontWeight: 700 }}>{s.top_weak_chapter || '—'}</td>
                    <td style={{ color: '#6366f1', fontWeight: 800 }}>→</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {students.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem', fontSize: 14 }}>No students match.</p>}
          </div>
        </Panel>
      )}

      {tab === 'chapters' && (
        <Panel title="Chapters the batch keeps getting wrong" icon="📚" right={
          <div style={{ display: 'flex', gap: 6 }}>
            {subjects.map(s => (
              <button key={s} onClick={() => setSubject(s)} style={{ padding: '5px 12px', borderRadius: 20, border: '1.5px solid', borderColor: subject === s ? '#6366f1' : '#e2e8f0', background: subject === s ? '#eef2ff' : '#fff', color: subject === s ? '#4338ca' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{s}</button>
            ))}
          </div>
        }>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9', color: '#64748b', fontSize: 11 }}>
                  <th style={{ textAlign: 'left', padding: '9px 8px' }}>CHAPTER</th>
                  <th>IN TESTS</th><th>ATTEMPTS</th><th style={{ minWidth: 140 }}>MISTAKE %</th><th style={{ minWidth: 120 }}>SKIPPED %</th><th>STUDENTS STRUGGLING</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map(c => (
                  <tr key={c.subject + c.chapter} style={{ borderBottom: '1px solid #f8fafc', textAlign: 'center' }}>
                    <td style={{ textAlign: 'left', padding: '9px 8px', fontWeight: 700, color: '#1e293b' }}><span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><SubjectDot subject={c.subject} />{c.chapter}</span></td>
                    <td>{c.tests}</td>
                    <td>{c.attempted}</td>
                    <td style={{ padding: '0 8px' }}><PctBar value={c.mistake_pct} color={c.mistake_pct >= 50 ? '#ef4444' : c.mistake_pct >= 30 ? '#f59e0b' : '#22c55e'} /></td>
                    <td style={{ padding: '0 8px' }}><PctBar value={c.skip_pct} color="#94a3b8" width={90} /></td>
                    <td style={{ fontWeight: 800, color: c.struggling_pct >= 40 ? '#b91c1c' : '#475569' }}>{c.students_struggling} of {c.students} <span style={{ color: '#94a3b8', fontWeight: 600 }}>({c.struggling_pct}%)</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>“Struggling” = wrong on at least half of their attempts in that chapter (min. 2 attempts). Good candidates for a re-teach or a chapter test.</p>
        </Panel>
      )}

      {tab === 'tests' && (
        <Panel title="Batch average per test" icon="📈">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={curve} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} formatter={v => `${v}%`} labelFormatter={(l, p) => `${p?.[0]?.payload?.full || l} · ${p?.[0]?.payload?.n || 0} students`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line isAnimationActive={false} type="monotone" dataKey="avg" name="Batch average" stroke="#6366f1" strokeWidth={2.8} dot={{ r: 4 }} />
              <Line isAnimationActive={false} type="monotone" dataKey="topper" name="Topper" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="5 4" dot={{ r: 3 }} />
              {testSubjects.map(s => <Line isAnimationActive={false} key={s} type="monotone" dataKey={s} name={`${s} avg`} stroke={SUBJ_COL[s] || '#64748b'} strokeWidth={1.4} dot={false} strokeOpacity={0.7} />)}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1.5px solid #f1f5f9', color: '#64748b', fontSize: 11 }}><th style={{ textAlign: 'left', padding: 8 }}>TEST</th><th>DATE</th><th>STUDENTS</th><th>AVERAGE</th><th>TOPPER</th></tr></thead>
              <tbody>
                {data.tests.slice().reverse().map(t => (
                  <tr key={t.quiz_id} style={{ borderBottom: '1px solid #f8fafc', textAlign: 'center' }}>
                    <td style={{ textAlign: 'left', padding: '9px 8px', fontWeight: 700 }}>{t.quiz_title}</td>
                    <td style={{ color: '#64748b' }}>{fmtDate(t.date)}</td>
                    <td>{t.participants}</td>
                    <td style={{ fontWeight: 800 }}>{t.average_score_pct}%</td>
                    <td>{t.topper_score_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
