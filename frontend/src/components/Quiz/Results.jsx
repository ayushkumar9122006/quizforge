import { useState } from 'react'
import Lightbox from '../Common/Lightbox.jsx'
import LiveLeaderboard from './LiveLeaderboard.jsx'
import { getExplanation } from '../../services/llmService.js'
import { formatTime } from '../../services/utils.js'

const LABELS = ['A','B','C','D','E','F']

export default function Results({ quiz, result, onBack, onHome, leaderboard = [], currentUserId = null }) {
  const questions = quiz.questions || []
  const [tab,          setTab]         = useState('analytics') // 'analytics' | 'review'
  const [explanations, setExpl]        = useState({})
  const [loadingE,     setLoading]     = useState({})
  const [expanded,     setExpanded]    = useState(null)
  const [lightbox,     setLightbox]    = useState(null)

  const score = result.score ?? 0
  const totalQuestions = questions.length || 1
  const pct = Math.round((score / totalQuestions) * 100)
  const sc  = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'
  const sbg = pct >= 70 ? '#d1fae5' : pct >= 40 ? '#fef3c7' : '#fee2e2'

  // Total time spent
  const totalTimeSpent = result.totalTimeSpent || questions.reduce((acc, q) => acc + (q.timeSpent || 0), 0)
  const avgTimePerQ = totalQuestions > 0 ? (totalTimeSpent / totalQuestions).toFixed(1) : 0

  // Sections
  const sections = [...new Set(questions.map(q => q.section || 'General'))]

  // Section breakdown
  const sectionStats = result.sectionBreakdown || sections.map(sec => {
    const secQuestions = questions.filter(q => (q.section || 'General') === sec)
    const secCorrect = secQuestions.filter(q => q.isCorrect || (result.answers && result.answers[questions.indexOf(q)] === q.correct)).length
    const secTime = secQuestions.reduce((a, q) => a + (q.timeSpent || 0), 0)
    return {
      name: sec,
      total: secQuestions.length,
      correct: secCorrect,
      timeSpent: secTime,
      accuracyPct: secQuestions.length > 0 ? Math.round((secCorrect / secQuestions.length) * 100) : 0,
    }
  })

  const loadE = async q => {
    const k = q.id
    if (explanations[k] || loadingE[k]) return
    setLoading(l => ({ ...l, [k]: true }))
    const e = await getExplanation(q)
    setExpl(x => ({ ...x, [k]: e }))
    setLoading(l => ({ ...l, [k]: false }))
  }

  return (
    <div style={{ maxWidth:780, margin:'0 auto', padding:'2rem 1.5rem 4rem' }}>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      {/* Top Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#111827' }}>Quiz Results & Analytics</h2>
          <p style={{ color:'#6b7280', fontSize:13, margin:0 }}>{quiz.title}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-sec" style={{ fontSize:12, padding:'6px 12px' }} onClick={onBack}>← Back</button>
          <button className="btn-pri" style={{ fontSize:12, padding:'6px 12px' }} onClick={onHome}>Home</button>
        </div>
      </div>

      {/* Score hero */}
      <div style={{ textAlign:'center', padding:'2rem', background:sbg, borderRadius:20, marginBottom:22, border:`1.5px solid ${sc}35`, boxShadow:'0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize:64, fontWeight:900, color:sc, lineHeight:1 }}>{pct}%</div>
        <div style={{ fontSize:18, color:sc, fontWeight:800, marginTop:8 }}>
          {score} / {totalQuestions} Correct
        </div>
        <div style={{ fontSize:14, color:sc, opacity:0.85, marginTop:4, fontWeight:600 }}>
          {pct >= 70 ? '🎉 Excellent performance!' : pct >= 40 ? '👍 Good attempt! Review areas for improvement below.' : '📚 Needs practice. Check question explanations.'}
        </div>
        {result.auto && (
          <div style={{ marginTop:10, display:'inline-block', padding:'4px 12px', background:'#fef3c7', color:'#92400e', borderRadius:20, fontSize:12, fontWeight:700 }}>
            ⏰ Auto-submitted on timer expiry
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div style={{ display:'flex', gap:10, marginBottom:22, background:'#ede9fe', padding:5, borderRadius:12 }}>
        <button
          onClick={() => setTab('analytics')}
          style={{
            flex: 1,
            padding: '9px 16px',
            borderRadius: 9,
            border: 'none',
            background: tab === 'analytics' ? '#6366f1' : 'transparent',
            color: tab === 'analytics' ? '#fff' : '#4b5563',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all .2s'
          }}
        >
          📊 Comprehensive Analytics
        </button>
        <button
          onClick={() => setTab('review')}
          style={{
            flex: 1,
            padding: '9px 16px',
            borderRadius: 9,
            border: 'none',
            background: tab === 'review' ? '#6366f1' : 'transparent',
            color: tab === 'review' ? '#fff' : '#4b5563',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all .2s'
          }}
        >
          📝 Question-by-Question Review
        </button>
      </div>

      {/* TAB 1: ANALYTICS */}
      {tab === 'analytics' && (
        <>
          {/* Key Metrics Grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:12, marginBottom:24 }}>
            <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'14px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize:11, color:'#6b7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em' }}>Accuracy</div>
              <div style={{ fontSize:26, fontWeight:900, color:sc, marginTop:3 }}>{pct}%</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{score}/{totalQuestions} Qs</div>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'14px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize:11, color:'#6b7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em' }}>Total Time</div>
              <div style={{ fontSize:26, fontWeight:900, color:'#6366f1', marginTop:3 }}>{formatTime(totalTimeSpent)}</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{totalTimeSpent}s elapsed</div>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'14px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize:11, color:'#6b7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em' }}>Avg Time / Q</div>
              <div style={{ fontSize:26, fontWeight:900, color:'#0891b2', marginTop:3 }}>{avgTimePerQ}s</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>per question</div>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'14px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize:11, color:'#6b7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em' }}>Correct / Wrong</div>
              <div style={{ fontSize:26, fontWeight:900, color:'#10b981', marginTop:3 }}>
                {score} <span style={{ fontSize:18, color:'#ef4444' }}>/ {totalQuestions - score}</span>
              </div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>performance</div>
            </div>
          </div>

          {/* Section-Wise Analytics Table */}
          <div className="card" style={{ marginBottom:24 }}>
            <h4 style={{ fontSize:15, fontWeight:800, color:'#111827', margin:'0 0 14px', display:'flex', alignItems:'center', gap:8 }}>
              <span>📑</span> Section Performance Breakdown
            </h4>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1.5px solid #f3f4f6' }}>
                    <th style={{ textAlign:'left', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700 }}>Section</th>
                    <th style={{ textAlign:'center', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700 }}>Questions</th>
                    <th style={{ textAlign:'center', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700 }}>Score</th>
                    <th style={{ textAlign:'center', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700 }}>Time Spent</th>
                    <th style={{ textAlign:'right', padding:'8px 12px', color:'#6b7280', fontSize:12, fontWeight:700 }}>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionStats.map((sec, idx) => {
                    const accColor = sec.accuracyPct >= 70 ? '#059669' : sec.accuracyPct >= 40 ? '#d97706' : '#dc2626'
                    const accBg = sec.accuracyPct >= 70 ? '#d1fae5' : sec.accuracyPct >= 40 ? '#fef3c7' : '#fee2e2'
                    return (
                      <tr key={idx} style={{ borderBottom:'1px solid #f9fafb' }}>
                        <td style={{ padding:'10px 12px', fontWeight:700, color:'#111827' }}>{sec.name}</td>
                        <td style={{ padding:'10px 12px', textAlign:'center', color:'#4b5563' }}>{sec.total}</td>
                        <td style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:'#111827' }}>
                          {sec.correct} / {sec.total}
                        </td>
                        <td style={{ padding:'10px 12px', textAlign:'center', color:'#6366f1', fontWeight:700 }}>
                          ⏱️ {formatTime(sec.timeSpent || 0)}
                        </td>
                        <td style={{ padding:'10px 12px', textAlign:'right' }}>
                          <span style={{ padding:'3px 10px', borderRadius:20, background:accBg, color:accColor, fontWeight:800, fontSize:12 }}>
                            {sec.accuracyPct}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Question Time Spent Breakdown Card */}
          <div className="card" style={{ marginBottom:24 }}>
            <h4 style={{ fontSize:15, fontWeight:800, color:'#111827', margin:'0 0 14px', display:'flex', alignItems:'center', gap:8 }}>
              <span>⏱️</span> Question Time Distribution
            </h4>
            <div style={{ display:'grid', gap:9 }}>
              {questions.map((q, i) => {
                const userAns = result.answers ? result.answers[i] : undefined
                const isRight = q.isCorrect !== undefined ? q.isCorrect : (userAns === q.correct)
                const qTime = q.timeSpent || (result.questionTimes ? result.questionTimes[i] : 0) || 0
                const pctOfTotal = totalTimeSpent > 0 ? Math.min(100, Math.round((qTime / totalTimeSpent) * 100)) : 0
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#f9fafb', borderRadius:10 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'#6b7280', minWidth:32 }}>Q{i+1}</span>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:isRight?'#d1fae5':userAns!==undefined?'#fee2e2':'#f3f4f6', color:isRight?'#059669':userAns!==undefined?'#dc2626':'#6b7280', fontWeight:800 }}>
                      {isRight ? '✓ Correct' : userAns !== undefined ? '✗ Wrong' : '— Skipped'}
                    </span>
                    <div style={{ flex:1, height:6, background:'#e5e7eb', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pctOfTotal}%`, height:'100%', background:'#6366f1', borderRadius:3 }} />
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:'#374151', minWidth:48, textAlign:'right' }}>
                      {qTime}s
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live Leaderboard */}
          {leaderboard.length > 0 && (
            <div className="card" style={{ marginBottom:24 }}>
              <LiveLeaderboard
                entries={leaderboard}
                title="Room Leaderboard"
                currentUserId={currentUserId}
              />
            </div>
          )}
        </>
      )}

      {/* TAB 2: QUESTION-BY-QUESTION REVIEW */}
      {tab === 'review' && (
        <div style={{ display:'grid', gap:22 }}>
          {sections.map(sec => {
            const secQuestions = questions.filter(q => (q.section || 'General') === sec)
            return (
              <div key={sec}>
                <h3 style={{ fontSize:15, fontWeight:800, color:'#111827', marginBottom:12, display:'flex', alignItems:'center', gap:9 }}>
                  <span className="tag tag-purple">{sec}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#6b7280' }}>
                    {secQuestions.length} question{secQuestions.length !== 1 ? 's' : ''}
                  </span>
                </h3>

                <div style={{ display:'grid', gap:12 }}>
                  {secQuestions.map((q, secIdx) => {
                    const i = questions.indexOf(q)
                    const ch = result.answers ? result.answers[i] : undefined
                    const right = q.isCorrect !== undefined ? q.isCorrect : (ch === q.correct)
                    const isExp = expanded === i
                    const qTime = q.timeSpent || (result.questionTimes ? result.questionTimes[i] : 0) || 0

                    return (
                      <div key={i} style={{ background:'#fff', border:`1.5px solid ${right?'#34d399':ch!==undefined?'#fca5a5':'#e5e7eb'}`, borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.02)' }}>
                        <div style={{ padding:'1.1rem 1.2rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:9 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontSize:12, fontWeight:800, color:'#6b7280' }}>Question {i+1}</span>
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#eff6ff', color:'#2563eb', fontWeight:700 }}>
                                ⏱️ {qTime}s spent
                              </span>
                            </div>
                            <span style={{ fontSize:12, fontWeight:700, padding:'2px 9px', borderRadius:20, background:right?'#d1fae5':ch!==undefined?'#fee2e2':'#f3f4f6', color:right?'#065f46':ch!==undefined?'#991b1b':'#6b7280' }}>
                              {right ? '✓ Correct' : ch !== undefined ? '✗ Wrong' : '— Skipped'}
                            </span>
                          </div>

                          {(q.qImage || q.question_image) && (
                            <img
                              src={q.qImage || q.question_image}
                              alt="question"
                              onClick={() => setLightbox(q.qImage || q.question_image)}
                              style={{ maxWidth:'100%', maxHeight:200, borderRadius:9, border:'1.5px solid #e5e7eb', cursor:'zoom-in', objectFit:'contain', background:'#f9fafb', display:'block', marginBottom:10 }}
                            />
                          )}

                          {q.text && (
                            <p style={{ fontSize:15, fontWeight:700, margin:'0 0 11px', lineHeight:1.6, color:'#111827' }}>{q.text}</p>
                          )}

                          {q.diagram && (
                            <img
                              src={q.diagram}
                              alt="diagram"
                              onClick={() => setLightbox(q.diagram)}
                              style={{ maxWidth:'100%', maxHeight:160, borderRadius:9, border:'1.5px solid #e5e7eb', cursor:'zoom-in', objectFit:'contain', background:'#f9fafb', display:'block', marginBottom:11 }}
                            />
                          )}

                          <div style={{ display:'grid', gap:6 }}>
                            {(q.options || []).map((opt, oi) => {
                              const isC = oi === q.correct
                              const isCh = oi === ch
                              const isImg = opt && typeof opt === 'object' && opt.type === 'image'
                              let cls = 'ropt'
                              if (isC) cls += ' right'
                              else if (isCh) cls += ' wrong'
                              else cls += ' plain'

                              return (
                                <div key={oi} className={cls} style={{ alignItems: isImg ? 'flex-start' : 'center' }}>
                                  <span style={{ fontWeight:800, minWidth:20, marginTop: isImg ? 3 : 0 }}>{LABELS[oi]}.</span>
                                  {isImg ? (
                                    <img
                                      src={opt.src}
                                      alt={`Option ${LABELS[oi]}`}
                                      onClick={() => setLightbox(opt.src)}
                                      style={{ maxWidth:'100%', maxHeight:70, objectFit:'contain', borderRadius:6, cursor:'zoom-in', background:'#f9fafb', display:'block', flex:1 }}
                                    />
                                  ) : (
                                    <span style={{ flex:1 }}>{opt}</span>
                                  )}
                                  {isC && <span style={{ marginTop: isImg ? 3 : 0, fontWeight:800, color:'#059669' }}>✓ (Correct)</span>}
                                  {isCh && !isC && <span style={{ marginTop: isImg ? 3 : 0, fontWeight:800, color:'#dc2626' }}>✗ (Your choice)</span>}
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* AI Explanation Toggle */}
                        <div style={{ borderTop:'1px solid #f3f4f6', padding:'9px 1.2rem', background:'#fafafa' }}>
                          <button
                            onClick={() => { const o = isExp; setExpanded(o ? null : i); if (!o) loadE(q) }}
                            style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, color:'#6366f1', display:'flex', alignItems:'center', gap:5, padding:0 }}
                          >
                            {isExp ? '▲ Hide' : '✨ Show'} AI Explanation
                          </button>
                          {isExp && (
                            <div style={{ marginTop:10, padding:'13px', background:'#f5f3ff', borderRadius:9, fontSize:13, lineHeight:1.8, color:'#111827', border:'1px solid #e0e7ff' }}>
                              {loadingE[q.id] ? (
                                <span style={{ color:'#6366f1', fontWeight:600 }}>⏳ Generating AI explanation…</span>
                              ) : (
                                explanations[q.id] || q.explanation || 'The marked option is verified as the correct answer.'
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom Buttons */}
      <div style={{ display:'flex', gap:11, marginTop:24 }}>
        <button className="btn-sec" style={{ flex:1 }} onClick={onBack}>← Back</button>
        <button className="btn-pri" style={{ flex:1 }} onClick={onHome}>Back to Home</button>
      </div>
    </div>
  )
}
