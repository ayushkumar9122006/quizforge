import { useState } from 'react'
import Lightbox from '../Common/Lightbox.jsx'
import LiveLeaderboard from './LiveLeaderboard.jsx'
import { getExplanation } from '../../services/llmService.js'
import { formatDuration } from '../../services/utils.js'
import { viewSolutionPdf } from '../../services/quizService.js'
import { downloadResponseSheetPdf } from '../../services/sessionService.js'

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function Results({
  quiz = {},
  result = {},
  onBack,
  onHome,
  leaderboard = [],
  currentUserId = null,
  currentUserName = null,
}) {
  const questions = result.questions || quiz.questions || []
  const [tab, setTab] = useState('analytics') // 'analytics' | 'review'
  const [explanations, setExpl] = useState({})
  const [loadingE, setLoading] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const handleDownloadResponseSheet = async () => {
    const attemptId = result.id || result.attempt_id || result.attemptId
    if (!attemptId) {
      alert('Unable to identify attempt ID for downloading response sheet.')
      return
    }
    setDownloadingPdf(true)
    try {
      await downloadResponseSheetPdf(attemptId, quiz.title || result.quizTitle || 'quiz')
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to download response sheet PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  // Authoritative marks and scores
  const score = Number(result.score !== undefined ? result.score : 0)
  const totalQuestions = questions.length || 1
  const totalMarks = Number(
    result.total_marks !== undefined
      ? result.total_marks
      : (result.totalMarks !== undefined
        ? result.totalMarks
        : questions.reduce((sum, q) => sum + Number(q.positive_marks ?? q.marks ?? 4), 0))
  )

  const pct = totalMarks > 0 ? Math.max(0, Math.round((score / totalMarks) * 100)) : 0
  const sc = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'
  const sbg = pct >= 70 ? '#d1fae5' : pct >= 40 ? '#fef3c7' : '#fee2e2'

  // Authoritative calculations: Fallback calculation from questions array if backend summary fields not directly on result
  let computedCorrect = 0
  let computedWrong = 0
  let computedSkipped = 0
  let computedMarked = 0

  questions.forEach((q, i) => {
    const userAns = q.selectedOption !== undefined
      ? q.selectedOption
      : (q.userAnswer !== undefined
        ? q.userAnswer
        : (result.answers ? result.answers[i] : undefined))

    const isMarked = Boolean(q.marked_for_review || q.marked)
    if (isMarked) computedMarked++

    const isAttempted = userAns !== undefined && userAns !== null && userAns !== '' && (Array.isArray(userAns) ? userAns.length > 0 : true)
    if (!isAttempted) {
      computedSkipped++
    } else if (q.isCorrect !== undefined ? q.isCorrect : (userAns === (q.correct_answer ?? q.correct))) {
      computedCorrect++
    } else {
      computedWrong++
    }
  })

  const correctCount = result.correct_count !== undefined ? result.correct_count : computedCorrect
  const incorrectCount = result.incorrect_count !== undefined ? result.incorrect_count : computedWrong
  const skippedCount = result.skipped_count !== undefined ? result.skipped_count : computedSkipped
  const markedCount = result.marked_count !== undefined ? result.marked_count : computedMarked
  const attemptedCount = result.attempted_count !== undefined ? result.attempted_count : (correctCount + incorrectCount)

  // Accuracy: Correct / Attempted * 100
  const accuracy = result.accuracy !== undefined
    ? Number(result.accuracy)
    : (attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 1000) / 10 : 0)

  const rank = result.rank ?? null
  const totalParticipants = result.total_participants ?? (leaderboard.length || 1)

  // Solution PDF presence
  const quizId = quiz.id || result.quiz_id || result.quizId
  const hasSolutionPdf = Boolean(
    quiz.solution_pdf || quiz.solution_pdf_name ||
    result.solution_pdf || result.solution_pdf_name ||
    result.has_solution_pdf
  )

  // Time metrics
  const totalTimeSpent = result.totalTimeSpent || result.time_taken_sec || questions.reduce((acc, q) => acc + (q.timeSpent || 0), 0)
  const avgTimePerQ = totalQuestions > 0 ? Math.round(totalTimeSpent / totalQuestions) : 0

  // Sections
  const sections = [...new Set(questions.map(q => q.section || 'General'))]

  // Section breakdown
  const sectionStats = result.sectionBreakdown || result.section_breakdown || sections.map(sec => {
    const secQuestions = questions.filter(q => (q.section || 'General') === sec)
    const secCorrect = secQuestions.filter(q => {
      const u = q.selectedOption ?? q.userAnswer ?? (result.answers && result.answers[questions.indexOf(q)])
      return q.isCorrect !== undefined ? q.isCorrect : (u !== undefined && u !== null && u === (q.correct_answer ?? q.correct))
    }).length
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
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px', color: '#111827' }}>Quiz Results & Analytics</h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0, fontWeight: 600 }}>{quiz.title || result.quizTitle || 'Quiz Result'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(result.id || result.attempt_id) && (
            <button
              className="btn-sec"
              style={{ fontSize: 13, padding: '7px 15px', color: '#4338ca', borderColor: '#c7d2fe', background: '#eef2ff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}
              disabled={downloadingPdf}
              onClick={handleDownloadResponseSheet}
              title="Download official candidate response sheet PDF"
            >
              <span>📥</span>
              <span>{downloadingPdf ? 'Downloading…' : 'Response Sheet PDF'}</span>
            </button>
          )}
          {hasSolutionPdf && (
            <button
              className="btn-sec"
              style={{ fontSize: 13, padding: '7px 15px', color: '#059669', borderColor: '#86efac', background: '#ecfdf5', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => viewSolutionPdf(quizId)}
            >
              <span>📄</span>
              <span>View Detailed Solutions</span>
            </button>
          )}
          <button className="btn-sec" style={{ fontSize: 13, padding: '7px 14px' }} onClick={onBack}>← Back</button>
          <button className="btn-pri" style={{ fontSize: 13, padding: '7px 14px' }} onClick={onHome}>Home</button>
        </div>
      </div>

      {/* Score Hero Card */}
      <div style={{
        textAlign: 'center',
        padding: '2.2rem 2rem',
        background: sbg,
        borderRadius: 24,
        marginBottom: 24,
        border: `1.5px solid ${sc}40`,
        boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)'
      }}>
        <div style={{ fontSize: 68, fontWeight: 900, color: sc, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontSize: 22, color: sc, fontWeight: 900, marginTop: 10 }}>
          {score} / {totalMarks} Marks
        </div>

        {/* Summary Badges */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
          marginTop: 14,
          flexWrap: 'wrap'
        }}>
          <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 800 }}>
            ✓ {correctCount} Correct
          </span>
          <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 800 }}>
            ✗ {incorrectCount} Incorrect
          </span>
          <span style={{ background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 800 }}>
            — {skippedCount} Skipped
          </span>
          <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 800 }}>
            🔖 {markedCount} Marked for Review
          </span>
          {rank && (
            <span style={{ background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 800 }}>
              🏆 Rank #{rank} of {totalParticipants}
            </span>
          )}
        </div>

        <div style={{ fontSize: 14, color: sc, marginTop: 12, fontWeight: 700 }}>
          {pct >= 70 ? '🎉 Excellent performance! Well done!' : pct >= 40 ? '👍 Good attempt! Review areas for improvement below.' : '📚 Needs practice. Inspect question explanations below.'}
        </div>

        {result.auto && (
          <div style={{ display: 'inline-block', marginTop: 10, padding: '4px 14px', background: '#fef3c7', color: '#92400e', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            ⏰ Auto-submitted on timer expiry
          </div>
        )}

        {(result.id || result.attempt_id) && (
          <div style={{ marginTop: 16 }}>
            <button
              className="btn-pri"
              style={{
                fontSize: 13,
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontWeight: 800,
                cursor: downloadingPdf ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
              }}
              disabled={downloadingPdf}
              onClick={handleDownloadResponseSheet}
            >
              <span>📥</span>
              <span>{downloadingPdf ? 'Generating PDF…' : 'Download Response Sheet (PDF)'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Major Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 24,
        background: '#f1f5f9',
        padding: 5,
        borderRadius: 14,
        border: '1px solid #e2e8f0'
      }}>
        <button
          onClick={() => setTab('analytics')}
          style={{
            flex: 1,
            padding: '11px 18px',
            borderRadius: 10,
            border: 'none',
            background: tab === 'analytics' ? '#6366f1' : 'transparent',
            color: tab === 'analytics' ? '#fff' : '#475569',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all .18s',
            boxShadow: tab === 'analytics' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none'
          }}
        >
          📊 Comprehensive Analysis
        </button>
        <button
          onClick={() => setTab('review')}
          style={{
            flex: 1,
            padding: '11px 18px',
            borderRadius: 10,
            border: 'none',
            background: tab === 'review' ? '#6366f1' : 'transparent',
            color: tab === 'review' ? '#fff' : '#475569',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all .18s',
            boxShadow: tab === 'review' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none'
          }}
        >
          📝 Question-by-Question Review
        </button>
      </div>

      {/* TAB 1: COMPREHENSIVE ANALYSIS */}
      {tab === 'analytics' && (
        <>
          {/* Key Metrics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
            marginBottom: 24
          }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>ACCURACY</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: sc, marginTop: 4 }}>{accuracy}%</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{correctCount} of {attemptedCount} attempted</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>ATTEMPTED</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#2563eb', marginTop: 4 }}>{attemptedCount} / {totalQuestions}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{totalQuestions - attemptedCount} unattempted</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>CORRECT / WRONG</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#059669', marginTop: 4 }}>
                {correctCount} <span style={{ fontSize: 18, color: '#dc2626' }}>/ {incorrectCount}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{skippedCount} skipped</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>TOTAL TIME</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#6366f1', marginTop: 4 }}>{formatDuration(totalTimeSpent)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>total duration</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>AVG TIME / Q</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0891b2', marginTop: 4 }}>{formatDuration(avgTimePerQ)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>per question</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>REVIEWED</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#d97706', marginTop: 4 }}>{markedCount}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>marked for review</div>
            </div>
          </div>

          {/* Section-Wise Analytics Table */}
          <div className="card" style={{ marginBottom: 24, padding: '1.5rem', borderRadius: 18 }}>
            <h4 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📑</span> Section Performance Breakdown
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#64748b', fontSize: 12, fontWeight: 800 }}>SECTION</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', color: '#64748b', fontSize: 12, fontWeight: 800 }}>QUESTIONS</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', color: '#64748b', fontSize: 12, fontWeight: 800 }}>CORRECT</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', color: '#64748b', fontSize: 12, fontWeight: 800 }}>TIME SPENT</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: '#64748b', fontSize: 12, fontWeight: 800 }}>ACCURACY</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionStats.map((sec, idx) => {
                    const accColor = sec.accuracyPct >= 70 ? '#059669' : sec.accuracyPct >= 40 ? '#d97706' : '#dc2626'
                    const accBg = sec.accuracyPct >= 70 ? '#d1fae5' : sec.accuracyPct >= 40 ? '#fef3c7' : '#fee2e2'
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px', fontWeight: 800, color: '#1e293b' }}>{sec.name}</td>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>{sec.total}</td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 800, color: '#1e293b' }}>
                          {sec.correct} / {sec.total}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#6366f1', fontWeight: 700 }}>
                          ⏱️ {formatDuration(sec.timeSpent || 0)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <span style={{ padding: '4px 10px', borderRadius: 20, background: accBg, color: accColor, fontWeight: 800, fontSize: 12 }}>
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

          {/* Question Time Breakdown */}
          <div className="card" style={{ marginBottom: 24, padding: '1.5rem', borderRadius: 18 }}>
            <h4 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⏱️</span> Question Time Distribution
            </h4>
            <div style={{ display: 'grid', gap: 9 }}>
              {questions.map((q, i) => {
                const userAns = q.selectedOption ?? q.userAnswer ?? (result.answers ? result.answers[i] : undefined)
                const isAttempted = userAns !== undefined && userAns !== null && userAns !== ''
                const isRight = q.isCorrect !== undefined ? q.isCorrect : (userAns === (q.correct_answer ?? q.correct))
                const qTime = q.timeSpent || (result.questionTimes ? result.questionTimes[i] : 0) || 0
                const pctOfTotal = totalTimeSpent > 0 ? Math.min(100, Math.round((qTime / totalTimeSpent) * 100)) : 0

                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', minWidth: 34 }}>Q{i + 1}</span>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: isRight ? '#d1fae5' : isAttempted ? '#fee2e2' : '#f1f5f9',
                      color: isRight ? '#059669' : isAttempted ? '#dc2626' : '#64748b',
                      fontWeight: 800,
                      minWidth: 70,
                      textAlign: 'center'
                    }}>
                      {isRight ? '✓ Correct' : isAttempted ? '✗ Wrong' : '— Skipped'}
                    </span>
                    <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pctOfTotal}%`, height: '100%', background: '#6366f1', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', minWidth: 60, textAlign: 'right' }}>
                      {formatDuration(qTime)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live Leaderboard */}
          {leaderboard.length > 0 && (
            <div className="card" style={{ marginBottom: 24, padding: '1.5rem', borderRadius: 18 }}>
              <LiveLeaderboard
                entries={leaderboard}
                title="Quiz Leaderboard & Rankings"
                currentUserId={currentUserId}
                currentUserName={currentUserName}
              />
            </div>
          )}
        </>
      )}

      {/* TAB 2: QUESTION-BY-QUESTION REVIEW */}
      {tab === 'review' && (
        <div style={{ display: 'grid', gap: 22 }}>
          {sections.map(sec => {
            const secQuestions = questions.filter(q => (q.section || 'General') === sec)
            return (
              <div key={sec}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className="tag tag-purple">{sec}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                    {secQuestions.length} question{secQuestions.length !== 1 ? 's' : ''}
                  </span>
                </h3>

                <div style={{ display: 'grid', gap: 14 }}>
                  {secQuestions.map((q, secIdx) => {
                    const i = questions.indexOf(q)
                    const userAns = q.selectedOption ?? q.userAnswer ?? (result.answers ? result.answers[i] : undefined)
                    const isAttempted = userAns !== undefined && userAns !== null && userAns !== '' && (Array.isArray(userAns) ? userAns.length > 0 : true)
                    const isRight = q.isCorrect !== undefined ? q.isCorrect : (userAns === (q.correct_answer ?? q.correct))
                    const isMarked = Boolean(q.marked_for_review || q.marked)
                    const isExp = expanded === i
                    const qTime = q.timeSpent || (result.questionTimes ? result.questionTimes[i] : 0) || 0
                    const pos = Number(q.positive_marks ?? q.marks ?? 4)
                    const neg = Number(q.negative_marks ?? 0)
                    const marksAwarded = q.marks_awarded !== undefined ? q.marks_awarded : (q.marksAwarded !== undefined ? q.marksAwarded : (isRight ? pos : (isAttempted ? -neg : 0)))
                    const isPartial = !isRight && marksAwarded > 0

                    return (
                      <div
                        key={i}
                        style={{
                          background: '#fff',
                          border: `2px solid ${isRight ? '#10b981' : isPartial ? '#6366f1' : isAttempted ? '#ef4444' : '#e2e8f0'}`,
                          borderRadius: 16,
                          overflow: 'hidden',
                          boxShadow: '0 4px 14px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ padding: '1.25rem 1.5rem' }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 14,
                            paddingBottom: 10,
                            borderBottom: '1px solid #f1f5f9',
                            flexWrap: 'wrap',
                            gap: 8
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Question {i + 1}</span>
                              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 800 }}>
                                {q.question_type === 'numerical' ? '🔢 Numerical Answer' : q.question_type === 'multi_correct' ? '☑️ Multi-Correct MCQ' : q.question_type === 'match_column' ? '🔗 Match the Column' : '🔘 Single Correct MCQ'}
                              </span>
                              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                                ⏱️ {formatDuration(qTime)} spent
                              </span>
                              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 700 }}>
                                +{pos} / -{neg}
                              </span>
                              {isMarked && (
                                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontWeight: 800 }}>
                                  🔖 Marked for Review
                                </span>
                              )}
                              {(q.explanation?.includes('Page') || q.source_page) && (
                                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', fontWeight: 700 }}>
                                  📄 {q.source_page ? `Page ${q.source_page}` : q.explanation}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{
                                fontSize: 12,
                                fontWeight: 800,
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: isRight ? '#ecfdf5' : isPartial ? '#ede9fe' : isAttempted ? '#fef2f2' : '#f8fafc',
                                color: isRight ? '#065f46' : isPartial ? '#5b21b6' : isAttempted ? '#b91c1c' : '#64748b',
                                border: `1px solid ${isRight ? '#a7f3d0' : isPartial ? '#c7d2fe' : isAttempted ? '#fecaca' : '#e2e8f0'}`
                              }}>
                                {isRight ? `+${pos} marks` : isPartial ? `+${marksAwarded} marks (partial)` : isAttempted ? `${marksAwarded < 0 ? marksAwarded : `-${neg}`} marks` : '0 marks'}
                              </span>
                              <span style={{
                                fontSize: 12,
                                fontWeight: 900,
                                padding: '4px 12px',
                                borderRadius: 20,
                                background: isRight ? '#d1fae5' : isPartial ? '#e0e7ff' : isAttempted ? '#fee2e2' : '#f1f5f9',
                                color: isRight ? '#065f46' : isPartial ? '#4338ca' : isAttempted ? '#991b1b' : '#64748b'
                              }}>
                                {isRight ? '✓ Correct' : isPartial ? `⚡ Partial (+${marksAwarded})` : isAttempted ? '✗ Incorrect' : '— Not Attempted'}
                              </span>
                            </div>
                          </div>

                          {(q.qImage || q.question_image) && (
                            <img
                              src={q.qImage || q.question_image}
                              alt="question"
                              onClick={() => setLightbox(q.qImage || q.question_image)}
                              style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10, border: '1.5px solid #e2e8f0', cursor: 'zoom-in', objectFit: 'contain', background: '#f8fafc', display: 'block', marginBottom: 12 }}
                            />
                          )}

                          {q.text && (
                            <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.6, color: '#0f172a' }}>
                              {q.text}
                            </p>
                          )}

                          {/* Original Matching Table or Diagram from PDF */}
                          {q.diagram && (
                            <div style={{ marginBottom: 14, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', padding: 10, textAlign: 'center' }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: '#4f46e5', marginBottom: 6, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>📊</span> Original Diagram / Matching Table (from PDF)
                              </div>
                              <img
                                src={q.diagram}
                                alt="Diagram / Matching Table"
                                onClick={() => setLightbox(q.diagram)}
                                style={{ maxWidth: '100%', maxHeight: 340, borderRadius: 8, cursor: 'zoom-in', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                              />
                              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>🔍 Click image to enlarge</span>
                            </div>
                          )}

                          {/* Options / Answer Listing */}
                          {q.question_type === 'numerical' ? (
                            <div style={{
                              background: isRight ? '#f0fdf4' : (isAttempted ? '#fef2f2' : '#f8fafc'),
                              padding: '16px 20px',
                              borderRadius: 12,
                              border: `1.5px solid ${isRight ? '#86efac' : (isAttempted ? '#fca5a5' : '#e2e8f0')}`,
                              display: 'grid',
                              gap: 12
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5 }}>
                                  <span style={{ fontWeight: 800, color: '#334155', minWidth: 140 }}>Candidate Answer:</span>
                                  <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 17, color: isAttempted ? (isRight ? '#059669' : '#dc2626') : '#64748b' }}>
                                    {isAttempted ? String(userAns) : '— Not Attempted'}
                                  </span>
                                  {isAttempted && !isRight && <span style={{ fontSize: 11, fontWeight: 800, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 4 }}>INCORRECT</span>}
                                  {isRight && <span style={{ fontSize: 11, fontWeight: 800, background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 4 }}>CORRECT</span>}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                                  Marks: <strong style={{ color: isRight ? '#059669' : (isAttempted ? '#dc2626' : '#64748b') }}>{marksAwarded > 0 ? `+${marksAwarded}` : marksAwarded} / {pos}</strong>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
                                <span style={{ fontWeight: 800, color: '#334155', minWidth: 140 }}>Official Answer:</span>
                                <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 17, color: '#059669' }}>
                                  {q.raw_answer || (q.correct_answer !== null && q.correct_answer !== undefined ? q.correct_answer : '—')}
                                </span>
                                <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>(Authoritative correct key)</span>
                              </div>
                            </div>
                          ) : q.question_type === 'multi_correct' ? (
                            (() => {
                              // Correct options set
                              const corrSet = new Set()
                              if (q.raw_answer) {
                                const letters = (String(q.raw_answer).match(/[A-Fa-f1-6]/g) || []).map(x => {
                                  const u = x.toUpperCase()
                                  return '123456'.includes(u) ? parseInt(u, 10) - 1 : (u.charCodeAt(0) - 65)
                                })
                                letters.forEach(idx => corrSet.add(idx))
                              }
                              if (corrSet.size === 0 && Array.isArray(q.correct_options)) {
                                q.correct_options.forEach(l => {
                                  if (typeof l === 'string' && l.length === 1) corrSet.add(l.toUpperCase().charCodeAt(0) - 65)
                                })
                              }
                              if (corrSet.size === 0 && q.correct_answer !== null && q.correct_answer !== undefined) {
                                corrSet.add(q.correct_answer)
                              }

                              // Student selected options set
                              const selSet = new Set()
                              if (userAns !== undefined && userAns !== null) {
                                if (Array.isArray(userAns)) {
                                  userAns.forEach(x => {
                                    if (typeof x === 'number') selSet.add(x)
                                    else if (typeof x === 'string' && x.trim().length === 1 && /[A-Fa-f]/.test(x)) selSet.add(x.toUpperCase().charCodeAt(0) - 65)
                                    else if (!isNaN(parseInt(x, 10))) selSet.add(parseInt(x, 10))
                                  })
                                } else if (typeof userAns === 'string' && userAns.trim()) {
                                  try {
                                    const parsed = JSON.parse(userAns)
                                    if (Array.isArray(parsed)) {
                                      parsed.forEach(x => {
                                        if (typeof x === 'number') selSet.add(x)
                                        else if (typeof x === 'string' && x.trim().length === 1 && /[A-Fa-f]/.test(x)) selSet.add(x.toUpperCase().charCodeAt(0) - 65)
                                        else if (!isNaN(parseInt(x, 10))) selSet.add(parseInt(x, 10))
                                      })
                                    }
                                  } catch {
                                    const letters = (userAns.match(/[A-Fa-f1-6]/g) || []).map(x => {
                                      const u = x.toUpperCase()
                                      return '123456'.includes(u) ? parseInt(u, 10) - 1 : (u.charCodeAt(0) - 65)
                                    })
                                    letters.forEach(idx => selSet.add(idx))
                                  }
                                } else if (typeof userAns === 'number') {
                                  selSet.add(userAns)
                                }
                              }

                              const selLetters = Array.from(selSet).sort((a,b)=>a-b).map(idx => LABELS[idx] || String(idx+1))
                              const corrLetters = Array.from(corrSet).sort((a,b)=>a-b).map(idx => LABELS[idx] || String(idx+1))

                              return (
                                <div>
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    {(q.options || []).map((opt, oi) => {
                                      const isC = corrSet.has(oi)
                                      const isCh = selSet.has(oi)
                                      const isImg = opt && typeof opt === 'object' && opt.type === 'image'
                                      let cls = 'ropt'
                                      if (isC && isCh) cls += ' right'
                                      else if (isCh && !isC) cls += ' wrong'
                                      else if (isC) cls += ' right'
                                      else cls += ' plain'

                                      return (
                                        <div key={oi} className={cls} style={{ alignItems: isImg ? 'flex-start' : 'center', padding: '10px 14px' }}>
                                          <span style={{ fontWeight: 800, minWidth: 24, marginTop: isImg ? 3 : 0 }}>{LABELS[oi]}.</span>
                                          {isImg ? (
                                            <img
                                              src={opt.src}
                                              alt={`Option ${LABELS[oi]}`}
                                              onClick={() => setLightbox(opt.src)}
                                              style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', borderRadius: 6, cursor: 'zoom-in', background: '#f8fafc', display: 'block', flex: 1 }}
                                            />
                                          ) : (
                                            <span style={{ flex: 1, fontSize: 14 }}>{typeof opt === 'string' ? opt : (opt?.text || '')}</span>
                                          )}
                                          {isCh && isC && <span style={{ marginTop: isImg ? 3 : 0, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>✓ Candidate Selected & Correct</span>}
                                          {isCh && !isC && <span style={{ marginTop: isImg ? 3 : 0, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>✗ Candidate Selected - Wrong</span>}
                                          {!isCh && isC && <span style={{ marginTop: isImg ? 3 : 0, fontWeight: 800, color: '#059669', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>✓ Correct Option (Not Selected)</span>}
                                        </div>
                                      )
                                    })}
                                  </div>

                                  {/* Multi-correct summary banner */}
                                  <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                      <span style={{ fontWeight: 700, color: '#475569' }}>Candidate Choices: </span>
                                      <strong style={{ color: selLetters.length > 0 ? '#1e293b' : '#94a3b8' }}>{selLetters.length > 0 ? selLetters.join(', ') : 'None (Skipped)'}</strong>
                                      <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                                      <span style={{ fontWeight: 700, color: '#475569' }}>Official Correct Key: </span>
                                      <strong style={{ color: '#059669' }}>{corrLetters.join(', ')}</strong>
                                    </div>
                                    <div style={{ fontWeight: 800, color: isRight ? '#059669' : (isPartial ? '#5b21b6' : (isAttempted ? '#dc2626' : '#64748b')) }}>
                                      {isRight ? `Full marks (+${pos})` : isPartial ? `Partial integer credit (+${marksAwarded} of ${pos})` : isAttempted ? `Incorrect (-${neg} mark penalty)` : '0 marks (Skipped)'}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()
                          ) : (
                            <div>
                              <div style={{ display: 'grid', gap: 8 }}>
                                {(q.options || []).map((opt, oi) => {
                                  const isC = oi === (q.correct_answer ?? q.correct)
                                  const isCh = isAttempted && oi === userAns
                                  const isImg = opt && typeof opt === 'object' && opt.type === 'image'
                                  let cls = 'ropt'
                                  if (isC) cls += ' right'
                                  else if (isCh) cls += ' wrong'
                                  else cls += ' plain'

                                  return (
                                    <div key={oi} className={cls} style={{ alignItems: isImg ? 'flex-start' : 'center', padding: '10px 14px' }}>
                                      <span style={{ fontWeight: 800, minWidth: 24, marginTop: isImg ? 3 : 0 }}>{LABELS[oi]}.</span>
                                      {isImg ? (
                                        <img
                                          src={opt.src}
                                          alt={`Option ${LABELS[oi]}`}
                                          onClick={() => setLightbox(opt.src)}
                                          style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', borderRadius: 6, cursor: 'zoom-in', background: '#f8fafc', display: 'block', flex: 1 }}
                                        />
                                      ) : (
                                        <span style={{ flex: 1, fontSize: 14 }}>{typeof opt === 'string' ? opt : (opt?.text || '')}</span>
                                      )}
                                      {isC && !isCh && <span style={{ marginTop: isImg ? 3 : 0, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>✓ (Official Correct Answer)</span>}
                                      {isCh && !isC && <span style={{ marginTop: isImg ? 3 : 0, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>✗ (Your Selection - Incorrect)</span>}
                                      {isCh && isC && <span style={{ marginTop: isImg ? 3 : 0, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>✓ (Your Selection & Correct)</span>}
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Single correct / Match column summary banner */}
                              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <div>
                                  <span style={{ fontWeight: 700, color: '#475569' }}>Candidate Choice: </span>
                                  <strong style={{ color: isAttempted ? (isRight ? '#059669' : '#dc2626') : '#94a3b8' }}>
                                    {isAttempted && userAns !== undefined && userAns >= 0 && userAns < LABELS.length ? `Option (${LABELS[userAns]})` : 'None (Skipped)'}
                                  </strong>
                                  <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                                  <span style={{ fontWeight: 700, color: '#475569' }}>Official Key: </span>
                                  <strong style={{ color: '#059669' }}>
                                    {q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer >= 0 && q.correct_answer < LABELS.length ? `Option (${LABELS[q.correct_answer]})` : (q.raw_answer || '—')}
                                  </strong>
                                </div>
                                <div style={{ fontWeight: 800, color: isRight ? '#059669' : (isAttempted ? '#dc2626' : '#64748b') }}>
                                  {isRight ? `+${pos} marks` : (isAttempted ? `-${neg} marks` : '0 marks')}
                                </div>
                              </div>
                            </div>
                          )}

                          {!isAttempted && (
                            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', fontWeight: 600, fontStyle: 'italic' }}>
                              — You did not submit an answer for this question.
                            </div>
                          )}

                          {!isAttempted && (
                            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', fontWeight: 600, fontStyle: 'italic' }}>
                              — You did not submit an answer for this question.
                            </div>
                          )}
                        </div>

                        {/* AI Explanation Toggle */}
                        <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 1.4rem', background: '#fafafa' }}>
                          <button
                            onClick={() => { const o = isExp; setExpanded(o ? null : i); if (!o) loadE(q) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
                          >
                            {isExp ? '▲ Hide' : '✨ Show'} Detailed Explanation
                          </button>
                          {isExp && (
                            <div style={{ marginTop: 10, padding: '14px', background: '#f5f3ff', borderRadius: 10, fontSize: 13, lineHeight: 1.8, color: '#1e293b', border: '1px solid #e0e7ff' }}>
                              {loadingE[q.id] ? (
                                <span style={{ color: '#6366f1', fontWeight: 600 }}>⏳ Generating detailed explanation…</span>
                              ) : (
                                explanations[q.id] || q.explanation || 'The marked option is verified as the authoritative correct answer.'
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

      {/* Bottom Navigation */}
      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <button className="btn-sec" style={{ flex: 1, padding: '11px' }} onClick={onBack}>← Back</button>
        <button className="btn-pri" style={{ flex: 1, padding: '11px' }} onClick={onHome}>Back to Home</button>
      </div>
    </div>
  )
}
