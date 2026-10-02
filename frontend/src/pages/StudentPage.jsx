import { useState, useEffect, useCallback } from 'react'
import StudentHome from '../components/Student/StudentHome.jsx'
import AttemptHistory from '../components/Student/AttemptHistory.jsx'
import QuizAttempt from '../components/Quiz/QuizAttempt.jsx'
import Results from '../components/Quiz/Results.jsx'
import WaitingRoom from '../components/Quiz/WaitingRoom.jsx'
import AnalyticsDashboard from '../components/Admin/Analytics/AnalyticsDashboard.jsx'
import CelebrationOverlay from '../components/Quiz/CelebrationOverlay.jsx'
import { useRoom } from '../hooks/useRoom.js'
import { submitAttempt, getLeaderboard, getMyAttempts } from '../services/sessionService.js'
import { startQuizAttempt } from '../services/quizService.js'

function formatIST(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' IST'
  } catch {
    return dateStr
  }
}

export default function StudentPage({
  user, screen, setScreen,
  activeQuiz, currentResult,
  attempts, setAttempts,
  viewingAttempt, setViewingAttempt,
  onTake, onResult, onLogout,
}) {
  const [session, setSession] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [inWaiting, setInWaiting] = useState(false)
  const [analyticsQuiz, setAnalyticsQuiz] = useState(null)

  // Pre-test instructions modal state
  const [instructionTarget, setInstructionTarget] = useState(null)
  const [startingAttempt, setStartingAttempt] = useState(false)
  const [startError, setStartError] = useState(null)

  // Celebration overlay state
  const [celebrationResult, setCelebrationResult] = useState(null)
  const [pendingResultsData, setPendingResultsData] = useState(null)

  // Load student's attempts from the database on mount
  const loadAttempts = async () => {
    try {
      const data = await getMyAttempts()
      if (Array.isArray(data)) {
        const mapped = data.map(item => ({
          id: item.id,
          date: item.submitted_at || item.date,
          quizTitle: item.quiz_title || item.quizTitle,
          quizId: item.quiz_id || item.quizId,
          sessionId: item.session_id,
          score: item.score,
          total_marks: item.total_marks,
          totalQ: item.questions?.length || item.total_questions || 0,
          total_questions: item.questions?.length || item.total_questions || 0,
          attempted_count: item.attempted_count,
          correct_count: item.correct_count,
          incorrect_count: item.incorrect_count,
          skipped_count: item.skipped_count,
          marked_count: item.marked_count,
          accuracy: item.accuracy,
          rank: item.rank,
          total_participants: item.total_participants,
          time_taken_sec: item.time_taken_sec,
          totalTimeSpent: item.time_taken_sec,
          auto: item.auto,
          solution_pdf: item.solution_pdf,
          solution_pdf_name: item.solution_pdf_name,
          has_solution_pdf: item.has_solution_pdf,
          questions: item.questions || [],
          answers: (item.questions || []).reduce((acc, q, idx) => {
            if (q.selected_option !== null && q.selected_option !== undefined) {
              acc[idx] = q.selected_option
            } else if (q.userAnswer !== null && q.userAnswer !== undefined) {
              acc[idx] = q.userAnswer
            }
            return acc
          }, {}),
          questionTimes: (item.questions || []).reduce((acc, q, idx) => {
            acc[idx] = q.time_taken_sec || q.timeSpent || 0
            return acc
          }, {})
        }))
        setAttempts(mapped)
      }
    } catch (err) {
      console.error('Failed to load my attempts:', err)
    }
  }

  useEffect(() => {
    loadAttempts()
  }, [])

  const room = useRoom(session?.room_code)

  // Student clicks Start on a quiz card → show pre-test instruction screen FIRST
  const handleTake = (quiz) => {
    setInstructionTarget(quiz)
    setStartError(null)
  }

  // Pre-test instruction screen: Student clicks "Start Test Now"
  const handleStartAttemptNow = async () => {
    if (!instructionTarget || startingAttempt) return
    setStartingAttempt(true)
    setStartError(null)

    try {
      const resp = await startQuizAttempt(instructionTarget.id)
      setSession({
        id: resp.session_id,
        room_code: '',
      })

      // Update quiz effective duration if clamped by closing deadline
      const configuredQuiz = {
        ...instructionTarget,
        effectiveDurationSec: resp.duration_sec,
        timePerQ: resp.duration_sec / (instructionTarget.questions?.length || 1),
      }

      setInWaiting(false)
      onTake(configuredQuiz)
      setInstructionTarget(null)
      setScreen('quiz')
    } catch (err) {
      console.error('Failed to start attempt:', err)
      setStartError(err?.response?.data?.detail || 'Failed to start quiz attempt. Please check availability window.')
    } finally {
      setStartingAttempt(false)
    }
  }

  // Submit attempt from QuizAttempt component
  const handleSubmit = async (answers, auto, marked = new Set(), questionTimes = {}, totalTimeSpent = 0) => {
    if (!activeQuiz || !session) return
    const questions = activeQuiz.questions || []

    const payload = questions.map((q, i) => ({
      question_id: q.id,
      selected_option: answers[i] ?? null,
      response_text: null,
      marked_for_review: marked.has(i),
      time_taken_sec: questionTimes[i] || 0,
    }))

    let attemptResult
    try {
      attemptResult = await submitAttempt(session.id, payload, totalTimeSpent, auto)
    } catch (e) {
      console.error('Submit to backend failed', e)
      alert(e?.response?.data?.detail || 'Failed to submit your quiz. Please try again.')
      return
    }

    // Backend is the authoritative source of truth for evaluation, scores, and review statuses
    const correctMap = {}
    for (const r of attemptResult.results || []) {
      correctMap[r.question_id] = r
    }

    const resolved = questions.map((q, i) => {
      const resItem = correctMap[q.id]
      const correctAns = resItem?.correct_answer ?? q.correct
      const userAns = answers[i]
      const isCorrect = resItem ? resItem.is_correct : (userAns !== undefined && userAns === correctAns)
      return {
        ...q,
        correct: correctAns,
        correct_answer: correctAns,
        selectedOption: userAns,
        userAnswer: userAns,
        isCorrect,
        marked_for_review: marked.has(i) || resItem?.marked_for_review,
        marks_awarded: resItem?.marks_awarded,
        timeSpent: questionTimes[i] || 0,
      }
    })

    const score = attemptResult.score !== undefined ? attemptResult.score : 0
    const totalMarks = attemptResult.total_marks !== undefined ? attemptResult.total_marks : questions.reduce((sum, q) => sum + Number(q.positive_marks ?? q.marks ?? 4), 0)

    // Compute Section-wise Breakdown
    const secMap = {}
    resolved.forEach(q => {
      const s = q.section || 'General'
      if (!secMap[s]) {
        secMap[s] = {
          name: s,
          total: 0,
          correct: 0,
          timeSpent: 0,
          totalMarks: 0,
          score: 0,
        }
      }
      secMap[s].total += 1
      secMap[s].timeSpent += (q.timeSpent || 0)
      const qPos = Number(q.positive_marks ?? q.marks ?? 4)
      secMap[s].totalMarks += qPos
      if (q.isCorrect) {
        secMap[s].correct += 1
        secMap[s].score += (q.marks_awarded !== undefined ? q.marks_awarded : qPos)
      } else if (q.selectedOption !== undefined && q.selectedOption !== null) {
        const qNeg = Number(q.negative_marks ?? 0)
        secMap[s].score -= (q.marks_awarded !== undefined ? Math.abs(q.marks_awarded) : qNeg)
      }
    })

    const sectionBreakdown = Object.values(secMap).map(s => ({
      ...s,
      accuracyPct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
    }))

    // Fetch leaderboard
    let lb = []
    try {
      lb = await getLeaderboard(session.id)
    } catch (e) {
      console.error('Failed to load leaderboard', e)
    }
    setLeaderboard(lb)

    const finalResultData = {
      id: attemptResult.id,
      answers,
      score,
      total_marks: totalMarks,
      accuracy: attemptResult.accuracy,
      correct_count: attemptResult.correct_count,
      incorrect_count: attemptResult.incorrect_count,
      skipped_count: attemptResult.skipped_count,
      marked_count: attemptResult.marked_count,
      attempted_count: attemptResult.attempted_count,
      rank: attemptResult.rank,
      total_participants: lb.length || 1,
      auto,
      questions: resolved,
      sectionBreakdown,
      totalTimeSpent,
      questionTimes,
      solution_pdf: activeQuiz.solution_pdf,
      solution_pdf_name: activeQuiz.solution_pdf_name,
    }

    // Persist locally and refresh database list
    const attempt = {
      id: attemptResult.id,
      date: new Date().toISOString(),
      quizTitle: activeQuiz.title,
      quizId: activeQuiz.id,
      ...finalResultData
    }
    setAttempts(prev => [attempt, ...prev.filter(a => a.id !== attempt.id)])
    loadAttempts()

    // Trigger celebration overlay before proceeding to results
    setPendingResultsData(finalResultData)
    setCelebrationResult(attemptResult)
  }

  const handleFinishCelebration = () => {
    if (pendingResultsData) {
      onResult(pendingResultsData)
    }
    setCelebrationResult(null)
    setPendingResultsData(null)
    setScreen('results')
  }

  const deleteAttempt = id => setAttempts(prev => prev.filter(a => a.id !== id))

  // ── Pre-Test Instructions Modal (Feature 6) ──────────────────────────────────
  const instructionModal = instructionTarget && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 10, 25, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '1.2rem' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '2rem 2.2rem', maxWidth: 580, width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.22)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
            📝
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>Test Instructions</h3>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6366f1', fontWeight: 700 }}>{instructionTarget.title}</p>
          </div>
        </div>

        {/* Quick parameters summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 10, marginBottom: 18 }}>
          <div style={{ background: '#f8fafc', padding: '10px', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800 }}>QUESTIONS</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#111827', marginTop: 2 }}>{instructionTarget.questions?.length || 0} Qs</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '10px', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800 }}>DURATION</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#111827', marginTop: 2 }}>
              ~{Math.round((instructionTarget.questions?.length || 0) * ((instructionTarget.time_per_q_sec || instructionTarget.timePerQ || 300) / 60))} min
            </div>
          </div>
          <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: 12, border: '1px solid #a7f3d0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#065f46', fontWeight: 800 }}>CORRECT</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#059669', marginTop: 2 }}>
              +{instructionTarget.questions?.[0]?.positive_marks ?? 4} marks
            </div>
          </div>
          <div style={{ background: '#fef2f2', padding: '10px', borderRadius: 12, border: '1px solid #fecaca', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 800 }}>NEGATIVE</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626', marginTop: 2 }}>
              -{instructionTarget.questions?.[0]?.negative_marks ?? 1} marks
            </div>
          </div>
        </div>

        {instructionTarget.availability_end && (
          <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af', fontWeight: 700, marginBottom: 16 }}>
            🕒 Availability Deadline: {formatIST(instructionTarget.availability_end)} (Timer will be clamped to deadline if remaining time is less than test duration).
          </div>
        )}

        {/* Detailed Instructions content */}
        <div style={{ background: '#f8fafc', padding: '16px 18px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155', lineHeight: 1.7, marginBottom: 18 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8, fontSize: 14 }}>Rules & Guidelines:</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Timer starts immediately</strong> upon clicking "Start Test Now".</li>
            <li><strong>Clear Response:</strong> Use the "Clear Response" button anytime to deselect an answer without affecting your "Mark for Review" status.</li>
            <li><strong>Mark for Review:</strong> You can mark questions for later review and return to them using the question palette.</li>
            <li><strong>Scoring:</strong> Correct answers receive positive marks. Incorrect answers receive negative marks penalty. Unanswered/skipped questions carry zero penalty.</li>
            <li><strong>Auto-Submit:</strong> The test will auto-submit when the overall timer expires. Ensure you finalize your answers in time.</li>
          </ul>
          {instructionTarget.instructions && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #cbd5e1', whiteSpace: 'pre-line' }}>
              <strong>Instructor's Notes:</strong><br />
              {instructionTarget.instructions}
            </div>
          )}
        </div>

        {startError && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
            ⚠ {startError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn-sec"
            style={{ flex: 1, padding: '12px' }}
            onClick={() => setInstructionTarget(null)}
            disabled={startingAttempt}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-pri"
            style={{ flex: 2, padding: '12px', fontSize: 15, fontWeight: 900 }}
            onClick={handleStartAttemptNow}
            disabled={startingAttempt}
          >
            {startingAttempt ? 'Starting Test…' : 'Start Test Now →'}
          </button>
        </div>
      </div>
    </div>
  )

  // Waiting room if needed
  if (screen === 'quiz' && inWaiting && session && activeQuiz) return (
    <WaitingRoom
      session={session}
      quiz={activeQuiz}
      userRole="student"
      onQuizStart={() => setInWaiting(false)}
      onLeave={() => { setInWaiting(false); setSession(null); setScreen('home') }}
      connected={room.connected}
      participants={room.participants}
      quizStarted={room.quizStarted}
      recentSubmit={room.recentSubmit}
    />
  )

  if (screen === 'home') return (
    <>
      <StudentHome
        user={user}
        onTake={handleTake}
        onHistory={() => setScreen('history')}
        onAnalytics={quiz => { setAnalyticsQuiz(quiz); setScreen('analytics') }}
        onLogout={onLogout}
        attempts={attempts}
        histCount={attempts.length}
        onViewAttempt={a => { setViewingAttempt(a); setScreen('historyDetail') }}
      />
      {instructionModal}
      {celebrationResult && (
        <CelebrationOverlay result={celebrationResult} onDone={handleFinishCelebration} />
      )}
    </>
  )

  if (screen === 'analytics' && analyticsQuiz) return (
    <AnalyticsDashboard
      quiz={analyticsQuiz}
      onBack={() => setScreen('home')}
    />
  )

  if (screen === 'quiz' && activeQuiz) return (
    <>
      <QuizAttempt quiz={activeQuiz} userName={user?.name} onSubmit={handleSubmit} />
      {celebrationResult && (
        <CelebrationOverlay result={celebrationResult} onDone={handleFinishCelebration} />
      )}
    </>
  )

  if (screen === 'results' && activeQuiz && currentResult) return (
    <Results
      quiz={{
        ...activeQuiz,
        questions: currentResult.questions || activeQuiz.questions,
        solution_pdf: currentResult.solution_pdf || activeQuiz.solution_pdf,
        solution_pdf_name: currentResult.solution_pdf_name || activeQuiz.solution_pdf_name
      }}
      result={currentResult}
      leaderboard={leaderboard}
      currentUserId={user?.id}
      onBack={() => setScreen('home')}
      onHome={() => setScreen('home')}
    />
  )

  if (screen === 'history') return (
    <AttemptHistory
      attempts={attempts}
      onDelete={deleteAttempt}
      onView={a => { setViewingAttempt(a); setScreen('historyDetail') }}
      onBack={() => setScreen('home')}
    />
  )

  if (screen === 'historyDetail' && viewingAttempt) return (
    <Results
      quiz={{
        id: viewingAttempt.quizId || viewingAttempt.quiz_id,
        title: viewingAttempt.quizTitle || viewingAttempt.quiz_title,
        questions: viewingAttempt.questions || [],
        solution_pdf: viewingAttempt.solution_pdf,
        solution_pdf_name: viewingAttempt.solution_pdf_name,
      }}
      result={{
        answers: viewingAttempt.answers,
        score: viewingAttempt.score,
        total_marks: viewingAttempt.total_marks,
        totalMarks: viewingAttempt.total_marks,
        accuracy: viewingAttempt.accuracy,
        correct_count: viewingAttempt.correct_count,
        incorrect_count: viewingAttempt.incorrect_count,
        skipped_count: viewingAttempt.skipped_count,
        marked_count: viewingAttempt.marked_count,
        attempted_count: viewingAttempt.attempted_count,
        rank: viewingAttempt.rank,
        total_participants: viewingAttempt.total_participants,
        auto: viewingAttempt.auto,
        sectionBreakdown: viewingAttempt.sectionBreakdown,
        totalTimeSpent: viewingAttempt.totalTimeSpent || viewingAttempt.time_taken_sec || 0,
        questionTimes: viewingAttempt.questionTimes || {},
        solution_pdf: viewingAttempt.solution_pdf,
        solution_pdf_name: viewingAttempt.solution_pdf_name,
        questions: viewingAttempt.questions || [],
      }}
      onBack={() => setScreen('history')}
      onHome={() => setScreen('home')}
    />
  )

  return null
}
