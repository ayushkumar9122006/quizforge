/**
 * AnalyticsDashboard — full analytics view for one quiz.
 * Fetches quiz-level analytics (across all sessions).
 * Admin can also select a specific session for granular view.
 */
import { useState, useEffect } from 'react'
import { getQuizAnalytics, getSessionAnalytics } from '../../../services/analyticsService.js'
import StatCard               from './StatCard.jsx'
import ScoreDistributionChart from './ScoreDistributionChart.jsx'
import QuestionAccuracyChart  from './QuestionAccuracyChart.jsx'
import AccuracyPieChart       from './AccuracyPieChart.jsx'
import SessionTrendChart      from './SessionTrendChart.jsx'

export default function AnalyticsDashboard({ quiz, onBack }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [mode,    setMode]    = useState('quiz')        // 'quiz' | 'session'
  const [selSession, setSelSession] = useState(null)    // selected session id
  const [expandedStudent, setExpandedStudent] = useState(null)

  // Load quiz-level analytics on mount
  useEffect(() => {
    getQuizAnalytics(quiz.id)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e?.response?.data?.detail || 'Failed to load analytics'); setLoading(false) })
  }, [quiz.id])

  // Load session analytics when a session is selected
  const loadSession = async (sessionId) => {
    setLoading(true); setError(null)
    try {
      const d = await getSessionAnalytics(sessionId)
      setData(d); setSelSession(sessionId); setMode('session')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load session analytics')
    } finally { setLoading(false) }
  }

  const loadQuiz = async () => {
    setLoading(true); setError(null); setSelSession(null); setMode('quiz')
    try {
      const d = await getQuizAnalytics(quiz.id)
      setData(d)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load analytics')
    } finally { setLoading(false) }
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  const headerBg = 'linear-gradient(135deg,#6366f1,#8b5cf6)'

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'2rem 1.5rem 4rem' }}>

      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
        <button className="btn-ghost" onClick={onBack} style={{ fontSize:13 }}>← Back</button>
        <div style={{ flex:1 }}>
          <h2 style={{ fontSize:21, fontWeight:800, margin:'0 0 2px' }}>Analytics</h2>
          <p style={{ fontSize:13, color:'#9ca3af', margin:0 }}>{quiz.title}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={loadQuiz}
            style={{ padding:'7px 14px', borderRadius:9, border:'1.5px solid #d1d5db', background:mode==='quiz'?'#6366f1':'#fff', color:mode==='quiz'?'#fff':'#374151', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            All Sessions
          </button>
        </div>
      </div>

      {/* Session selector (if quiz has sessions) */}
      {data?.session_trend?.length > 0 && (
        <div style={{ marginBottom:20, padding:'12px 16px', background:'#f9fafb', borderRadius:12, border:'1px solid #e5e7eb' }}>
          <label style={{ fontSize:12, fontWeight:700, color:'#6b7280', display:'block', marginBottom:8, textTransform:'uppercase', letterSpacing:'.04em' }}>
            View specific session
          </label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {data.session_trend.map((s, i) => (
              <button key={s.session_id}
                onClick={() => loadSession(s.session_id)}
                style={{ padding:'6px 12px', borderRadius:8, border:`1.5px solid ${selSession===s.session_id?'#6366f1':'#d1d5db'}`, background:selSession===s.session_id?'#ede9fe':'#fff', color:selSession===s.session_id?'#6366f1':'#374151', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Session {i+1} · {s.count} students · {s.avg_pct}%
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign:'center', padding:'4rem', color:'#9ca3af' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📊</div>
          Loading analytics…
        </div>
      )}

      {error && (
        <div style={{ padding:'12px 16px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10, fontSize:14, color:'#dc2626', marginBottom:16 }}>
          ⚠ {error}
        </div>
      )}

      {!loading && data && data.total_submitted === 0 && (
        <div style={{ textAlign:'center', padding:'4rem', background:'#fff', borderRadius:16, border:'1.5px dashed #e5e7eb' }}>
          <div style={{ fontSize:48, marginBottom:14 }}>📭</div>
          <p style={{ fontWeight:800, fontSize:16, margin:'0 0 6px' }}>No submissions yet</p>
          <p style={{ color:'#9ca3af', fontSize:14 }}>Create a room and have students take the quiz first.</p>
        </div>
      )}

      {!loading && data && data.total_submitted > 0 && (
        <>
          {/* ── Stat cards ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
            <StatCard icon="👥" label="Submissions"   value={data.total_submitted}
              sub={mode==='quiz'?`across ${data.total_sessions||1} session(s)`:'this session'}
              color="#6366f1" bg="#ede9fe" />
            <StatCard icon="📊" label="Avg Score"     value={`${data.average_accuracy_pct}%`}
              sub={`${data.average_score}/${data.total_marks} marks`}
              color="#059669" bg="#d1fae5" />
            <StatCard icon="🏆" label="Highest"       value={`${Math.round((data.highest_score/data.total_marks)*100)}%`}
              sub={`${data.highest_score}/${data.total_marks} marks`}
              color="#d97706" bg="#fef3c7" />
            <StatCard icon="📉" label="Lowest"        value={`${Math.round((data.lowest_score/data.total_marks)*100)}%`}
              sub={`${data.lowest_score}/${data.total_marks} marks`}
              color="#dc2626" bg="#fee2e2" />
            <StatCard icon="⏱"  label="Avg Time"      value={`${Math.round(data.average_time_sec)}s`}
              sub="per submission"
              color="#0891b2" bg="#e0f2fe" />
          </div>

          {/* ── Hardest / Easiest / Most skipped callouts ── */}
          {(data.hardest_question || data.most_skipped) && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12, marginBottom:24 }}>
              {data.hardest_question && (
                <div style={{ padding:'12px 16px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#dc2626', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>🔥 Hardest Question</div>
                  <div style={{ fontSize:14, color:'#111827', fontWeight:600, marginBottom:4 }}>{data.hardest_question.question_text}</div>
                  <div style={{ fontSize:13, color:'#dc2626' }}>{data.hardest_question.accuracy_pct}% accuracy</div>
                </div>
              )}
              {data.easiest_question && data.easiest_question.question_id !== data.hardest_question?.question_id && (
                <div style={{ padding:'12px 16px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#059669', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>✅ Easiest Question</div>
                  <div style={{ fontSize:14, color:'#111827', fontWeight:600, marginBottom:4 }}>{data.easiest_question.question_text}</div>
                  <div style={{ fontSize:13, color:'#059669' }}>{data.easiest_question.accuracy_pct}% accuracy</div>
                </div>
              )}
              {data.most_skipped && data.most_skipped.skipped > 0 && (
                <div style={{ padding:'12px 16px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#d97706', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>⏭ Most Skipped</div>
                  <div style={{ fontSize:14, color:'#111827', fontWeight:600, marginBottom:4 }}>{data.most_skipped.question_text}</div>
                  <div style={{ fontSize:13, color:'#d97706' }}>{data.most_skipped.skipped} students skipped</div>
                </div>
              )}
            </div>
          )}

          {/* ── Charts ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
            <div className="card">
              <ScoreDistributionChart distribution={data.score_distribution} />
            </div>
            <div className="card">
              <AccuracyPieChart
                correct={data.question_stats?.reduce((a,q) => a+q.correct,  0) || 0}
                wrong  ={data.question_stats?.reduce((a,q) => a+q.wrong,    0) || 0}
                skipped={data.question_stats?.reduce((a,q) => a+q.skipped,  0) || 0}
              />
            </div>
          </div>

          {/* Session trend (quiz-level only) */}
          {mode === 'quiz' && data.session_trend?.length >= 2 && (
            <div className="card" style={{ marginBottom:20 }}>
              <SessionTrendChart sessionTrend={data.session_trend} />
            </div>
          )}

          {/* ── Section Breakdown Table ── */}
          {data.section_stats?.length > 0 && (
            <div className="card" style={{ marginBottom:20 }}>
              <h4 style={{ fontSize:15, fontWeight:800, color:'#111827', margin:'0 0 14px', display:'flex', alignItems:'center', gap:8 }}>
                <span>📑</span> Section Performance Breakdown
              </h4>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:'1.5px solid #e5e7eb' }}>
                      <th style={{ textAlign:'left', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700, textTransform:'uppercase' }}>Section</th>
                      <th style={{ textAlign:'center', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700, textTransform:'uppercase' }}>Questions</th>
                      <th style={{ textAlign:'center', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700, textTransform:'uppercase' }}>Avg Time / Q</th>
                      <th style={{ textAlign:'right', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700, textTransform:'uppercase' }}>Avg Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.section_stats.map((sec, i) => {
                      const col = sec.accuracy_pct >= 70 ? '#059669' : sec.accuracy_pct >= 40 ? '#d97706' : '#dc2626'
                      const bg  = sec.accuracy_pct >= 70 ? '#f0fdf4'  : sec.accuracy_pct >= 40 ? '#fffbeb'  : '#fef2f2'
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid #f3f4f6' }}>
                          <td style={{ padding:'10px 12px', fontWeight:700, color:'#111827' }}>{sec.section}</td>
                          <td style={{ padding:'10px 12px', textAlign:'center', color:'#4b5563' }}>{sec.total_questions}</td>
                          <td style={{ padding:'10px 12px', textAlign:'center', color:'#6366f1', fontWeight:700 }}>⏱️ {sec.avg_time_sec || 0}s</td>
                          <td style={{ padding:'10px 12px', textAlign:'right' }}>
                            <span style={{ fontSize:12, padding:'3px 10px', background:bg, color:col, borderRadius:20, fontWeight:800 }}>
                              {sec.accuracy_pct}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Student-by-Student Performance Table ── */}
          {data.students?.length > 0 && (
            <div className="card" style={{ marginBottom:20 }}>
              <h4 style={{ fontSize:15, fontWeight:800, color:'#111827', margin:'0 0 14px', display:'flex', alignItems:'center', gap:8 }}>
                <span>👥</span> Student Performance & Timing Breakdown ({data.students.length})
              </h4>
              <div style={{ display:'grid', gap:10 }}>
                {data.students.map((st, i) => {
                  const isExp = expandedStudent === st.student_id
                  const col = st.accuracy_pct >= 70 ? '#059669' : st.accuracy_pct >= 40 ? '#d97706' : '#dc2626'
                  const bg  = st.accuracy_pct >= 70 ? '#dcfce7' : st.accuracy_pct >= 40 ? '#fef3c7' : '#fee2e2'
                  return (
                    <div key={st.student_id || i} style={{ border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden' }}>
                      <div
                        onClick={() => setExpandedStudent(isExp ? null : st.student_id)}
                        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background: isExp ? '#f8fafc' : '#fff', cursor:'pointer' }}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                          <span style={{ fontWeight:800, fontSize:13, color:'#9ca3af', minWidth:24 }}>#{i+1}</span>
                          <div>
                            <div style={{ fontWeight:800, fontSize:14, color:'#111827' }}>{st.student_name}</div>
                            <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                              ⏱️ Total Time: <strong>{st.time_taken_sec || 0}s</strong>
                              {st.submitted_at && ` · ${new Date(st.submitted_at).toLocaleTimeString()}`}
                            </div>
                          </div>
                        </div>

                        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontWeight:800, fontSize:14, color:'#111827' }}>{st.score} / {st.total_marks}</div>
                            <span style={{ fontSize:11, padding:'2px 8px', background:bg, color:col, borderRadius:20, fontWeight:800 }}>
                              {st.accuracy_pct}% Accuracy
                            </span>
                          </div>
                          <span style={{ fontSize:13, color:'#6366f1', fontWeight:700 }}>
                            {isExp ? '▲ Hide' : '▼ Details'}
                          </span>
                        </div>
                      </div>

                      {/* Expandable detailed student metrics */}
                      {isExp && (
                        <div style={{ padding:'14px 16px', background:'#f9fafb', borderTop:'1px solid #e5e7eb' }}>
                          {/* Section breakdown for this student */}
                          {st.section_breakdown?.length > 0 && (
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:'#4b5563', marginBottom:6, textTransform:'uppercase' }}>
                                Section Performance:
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:8 }}>
                                {st.section_breakdown.map((s, si) => (
                                  <div key={si} style={{ background:'#fff', padding:'8px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:12 }}>
                                    <div style={{ fontWeight:700, color:'#111827' }}>{s.section}</div>
                                    <div style={{ color:'#6b7280', marginTop:2 }}>
                                      Score: <strong>{s.score}/{s.total_marks}</strong> ({s.accuracy_pct}%) · ⏱️ {s.time_taken_sec || 0}s
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Question breakdown for this student */}
                          {st.question_breakdown?.length > 0 && (
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:'#4b5563', marginBottom:6, textTransform:'uppercase' }}>
                                Question-by-Question Timing & Answers:
                              </div>
                              <div style={{ display:'grid', gap:6 }}>
                                {st.question_breakdown.map((q, qi) => (
                                  <div key={qi} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', padding:'6px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:12 }}>
                                    <span style={{ fontWeight:700, color:'#374151', minWidth:40 }}>Q{q.order_index + 1}</span>
                                    <span style={{ flex:1, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:10 }}>
                                      {q.question_text || 'Question'}
                                    </span>
                                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:q.is_correct?'#dcfce7':q.selected_option!==null?'#fee2e2':'#f3f4f6', color:q.is_correct?'#15803d':q.selected_option!==null?'#b91c1c':'#6b7280', fontWeight:800, marginRight:10 }}>
                                      {q.is_correct ? '✓ Correct' : q.selected_option !== null ? '✗ Wrong' : '— Skipped'}
                                    </span>
                                    <span style={{ color:'#6366f1', fontWeight:700, minWidth:55, textAlign:'right' }}>
                                      ⏱️ {q.time_taken_sec || 0}s
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Question accuracy — full width */}
          {data.question_stats?.length > 0 && (
            <div className="card" style={{ marginBottom:20 }}>
              <QuestionAccuracyChart questionStats={data.question_stats} />
            </div>
          )}

          {/* Question details table */}
          <div className="card">
            <h4 style={{ fontSize:14, fontWeight:700, color:'#374151', margin:'0 0 14px' }}>Question Details & Average Timing</h4>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1.5px solid #e5e7eb' }}>
                    {['#','Question','Section','Avg Time','Correct','Wrong','Skipped','Accuracy'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, color:'#6b7280', fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.question_stats.map((q, i) => {
                    const col = q.accuracy_pct >= 70 ? '#059669' : q.accuracy_pct >= 40 ? '#d97706' : '#dc2626'
                    const bg  = q.accuracy_pct >= 70 ? '#f0fdf4'  : q.accuracy_pct >= 40 ? '#fffbeb'  : '#fef2f2'
                    return (
                      <tr key={q.question_id} style={{ borderBottom:'1px solid #f3f4f6', background: i%2===0?'#fff':'#fafafa' }}>
                        <td style={{ padding:'9px 12px', color:'#9ca3af', fontWeight:700 }}>{i+1}</td>
                        <td style={{ padding:'9px 12px', color:'#111827', maxWidth:240 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.question_text}</div>
                        </td>
                        <td style={{ padding:'9px 12px' }}>
                          <span style={{ fontSize:11, padding:'2px 8px', background:'#ede9fe', color:'#6366f1', borderRadius:20, fontWeight:700 }}>{q.section}</span>
                        </td>
                        <td style={{ padding:'9px 12px', color:'#6366f1', fontWeight:700 }}>⏱️ {q.avg_time_sec || 0}s</td>
                        <td style={{ padding:'9px 12px', color:'#059669', fontWeight:700 }}>{q.correct}</td>
                        <td style={{ padding:'9px 12px', color:'#dc2626', fontWeight:700 }}>{q.wrong}</td>
                        <td style={{ padding:'9px 12px', color:'#d97706', fontWeight:700 }}>{q.skipped}</td>
                        <td style={{ padding:'9px 12px' }}>
                          <span style={{ fontSize:12, padding:'3px 10px', background:bg, color:col, borderRadius:20, fontWeight:800 }}>
                            {q.accuracy_pct}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
