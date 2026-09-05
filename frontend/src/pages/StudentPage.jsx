import { useState, useEffect, useCallback } from 'react'
import StudentHome    from '../components/Student/StudentHome.jsx'
import AttemptHistory from '../components/Student/AttemptHistory.jsx'
import QuizAttempt    from '../components/Quiz/QuizAttempt.jsx'
import Results        from '../components/Quiz/Results.jsx'
import WaitingRoom    from '../components/Quiz/WaitingRoom.jsx'
import AnalyticsDashboard from '../components/Admin/Analytics/AnalyticsDashboard.jsx'
import { useRoom }    from '../hooks/useRoom.js'
import { joinSession, submitAttempt, getLeaderboard, getMyAttempts } from '../services/sessionService.js'

export default function StudentPage({
  user, screen, setScreen,
  activeQuiz, currentResult,
  attempts, setAttempts,
  viewingAttempt, setViewingAttempt,
  onTake, onResult, onLogout,
}) {
  const [session,           setSession]           = useState(null)
  const [leaderboard,       setLeaderboard]       = useState([])
  const [inWaiting,         setInWaiting]         = useState(false)
  const [analyticsQuiz,     setAnalyticsQuiz]     = useState(null)

  // Test instructions modal state — shown BEFORE the room code modal
  const [instructionTarget, setInstructionTarget] = useState(null)

  // Room-code join modal state — opened only after instructions are accepted
  const [joinTarget,        setJoinTarget]        = useState(null)
  const [roomCode,          setRoomCode]          = useState('')
  const [joinError,         setJoinError]         = useState(null)
  const [joining,           setJoining]           = useState(false)

  // Load student's attempts from the database on mount
  const loadAttempts = async () => {
    try {
      const data = await getMyAttempts()
      if (Array.isArray(data)) {
        const mapped = data.map(item => ({
          id: item.id,
          date: item.submitted_at,
          quizTitle: item.quiz_title,
          quizId: item.quiz_id,
          sessionId: item.session_id,
          score: item.score,
          total_marks: item.total_marks,
          totalQ: item.questions?.length || 0,
          accuracy: item.accuracy,
          time_taken_sec: item.time_taken_sec,
          totalTimeSpent: item.time_taken_sec,
          auto: item.auto_submitted,
          solution_pdf: item.solution_pdf,
          solution_pdf_name: item.solution_pdf_name,
          questions: item.questions || [],
          answers: (item.questions || []).reduce((acc, q, idx) => {
            if (q.selected_option !== null && q.selected_option !== undefined) {
              acc[idx] = q.selected_option
            }
            return acc
          }, {}),
          questionTimes: (item.questions || []).reduce((acc, q, idx) => {
            acc[idx] = q.time_taken_sec || 0
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

  // Student clicks Start → show instructions screen FIRST
  const handleTake = (quiz) => {
    setInstructionTarget(quiz)
    setJoinTarget(null)
    setRoomCode('')
    setJoinError(null)
  }

  const handleJoinCancel = () => {
    setJoinTarget(null)
    setRoomCode('')
    setJoinError(null)
  }

  const handleJoinSubmit = async (e) => {
    e.preventDefault()
    const code = roomCode.trim()
    if (!code) { setJoinError('Enter the room code your admin shared.'); return }

    setJoining(true)
    setJoinError(null)
    try {
      const sess = await joinSession(code)
      if (sess.quiz_id !== joinTarget.id) {
        setJoinError('That room code is for a different quiz.')
        return
      }
      setSession(sess)
      setInWaiting(true)
      onTake(joinTarget)
      setJoinTarget(null)
      setRoomCode('')
    } catch (e) {
      setJoinError(e?.response?.data?.detail || 'Invalid or expired room code.')
    } finally {
      setJoining(false)
    }
  }

  // Admin fires quiz:started via WS → leave waiting room
  const handleQuizStart = useCallback(() => {
    setInWaiting(false)
  }, [])

  const handleLeaveRoom = () => {
    setInWaiting(false)
    setSession(null)
    setScreen('home')
  }

  const handleSubmit = async (answers, auto, marked = new Set(), questionTimes = {}, totalTimeSpent = 0) => {
    if (!activeQuiz || !session) return
    const questions = activeQuiz.questions || []

    const payload = questions.map((q, i) => ({
      question_id:     q.id,
      selected_option: answers[i] ?? null,
      time_taken_sec:  questionTimes[i] || 0,
    }))

    let attemptResult
    try {
      attemptResult = await submitAttempt(session.id, payload, totalTimeSpent, auto)
    } catch (e) {
      console.error('Submit to backend failed', e)
      alert(e?.response?.data?.detail || 'Failed to submit your quiz. Please try again.')
      return
    }

    // The backend is the ONLY source of truth for correct answers and scoring
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
        selectedOption: userAns,
        isCorrect,
        marks_awarded: resItem?.marks_awarded,
        timeSpent: questionTimes[i] || 0,
      }
    })

    const score = attemptResult.score !== undefined ? attemptResult.score : (attemptResult.results || []).filter(r => r.is_correct).length
    const totalMarks = attemptResult.total_marks !== undefined ? attemptResult.total_marks : questions.reduce((sum, q) => sum + (Number(q.positive_marks ?? q.marks ?? 4)), 0)

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

    // Fetch final leaderboard for the results screen
    let lb = []
    try {
      lb = await getLeaderboard(session.id)
    } catch (e) {
      console.error('Failed to load leaderboard', e)
    }
    setLeaderboard(lb)

    // Store locally and reload from backend for fresh attempt history
    const attempt = {
      id:        attemptResult.id,
      date:      new Date().toISOString(),
      quizTitle: activeQuiz.title,
      quizId:    activeQuiz.id,
      score,
      total_marks: totalMarks,
      totalQ:    resolved.length,
      auto,
      answers,
      questions: resolved,
      sectionBreakdown,
      totalTimeSpent,
      questionTimes,
      solution_pdf: activeQuiz.solution_pdf,
      solution_pdf_name: activeQuiz.solution_pdf_name,
    }
    setAttempts(prev => [...prev, attempt])
    loadAttempts()

    onResult({
      answers,
      score,
      total_marks: totalMarks,
      auto,
      questions: resolved,
      sectionBreakdown,
      totalTimeSpent,
      questionTimes,
      solution_pdf: activeQuiz.solution_pdf,
      solution_pdf_name: activeQuiz.solution_pdf_name,
    })
  }

  const deleteAttempt = id => setAttempts(prev => prev.filter(a => a.id !== id))

  // ── Instructions modal shown BEFORE room-code join modal ───────────────────
  const instructionModal = instructionTarget && (
    <div style={{ position:'fixed',inset:0,background:'rgba(10,10,25,.58)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400,padding:'1rem' }}>
      <div style={{ background:'#fff',borderRadius:20,padding:'1.8rem 2rem',maxWidth:540,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,.18)',maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'#ede9fe', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>📝</div>
          <div>
            <h3 style={{ margin:0, fontSize:19, fontWeight:800, color:'#111827' }}>Test Instructions</h3>
            <p style={{ margin:'2px 0 0', fontSize:13, color:'#6b7280', fontWeight:600 }}>{instructionTarget.title}</p>
          </div>
        </div>

        {/* Quick parameters summary */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:9, marginBottom:16 }}>
          <div style={{ background:'#f9fafb', padding:'8px 10px', borderRadius:10, border:'1px solid #e5e7eb', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#6b7280', fontWeight:700 }}>QUESTIONS</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#111827', marginTop:2 }}>{instructionTarget.questions?.length || 0} Qs</div>
          </div>
          <div style={{ background:'#f9fafb', padding:'8px 10px', borderRadius:10, border:'1px solid #e5e7eb', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#6b7280', fontWeight:700 }}>DURATION</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#111827', marginTop:2 }}>
              ~{Math.round((instructionTarget.questions?.length || 0) * ((instructionTarget.timePerQ || 300) / 60))} min
            </div>
          </div>
          <div style={{ background:'#ecfdf5', padding:'8px 10px', borderRadius:10, border:'1px solid #a7f3d0', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#065f46', fontWeight:700 }}>CORRECT</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#059669', marginTop:2 }}>
              +{instructionTarget.questions?.[0]?.positive_marks ?? 4} marks
            </div>
          </div>
          <div style={{ background:'#fef2f2', padding:'8px 10px', borderRadius:10, border:'1px solid #fca5a5', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#991b1b', fontWeight:700 }}>NEGATIVE</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#dc2626', marginTop:2 }}>
              -{instructionTarget.questions?.[0]?.negative_marks ?? 1} marks
            </div>
          </div>
        </div>

        {/* Instructions content */}
        <div style={{ background:'#f8fafc', padding:'14px 16px', borderRadius:12, border:'1px solid #e2e8f0', fontSize:13, color:'#334155', lineHeight:1.7, marginBottom:20, whiteSpace:'pre-line' }}>
          {instructionTarget.instructions || (
            '• Read each question carefully before choosing an answer.\n' +
            '• Each question has positive marks for correct answers and negative marking for incorrect answers.\n' +
            '• Unanswered / skipped questions do not carry any penalty.\n' +
            '• The test will auto-submit when the overall timer expires.'
          )}
        </div>

        <div style={{ display:'flex', gap:9 }}>
          <button type="button" className="btn-sec" style={{ flex:1 }} onClick={() => setInstructionTarget(null)}>Cancel</button>
          <button
            type="button"
            className="btn-pri"
            style={{ flex:2 }}
            onClick={() => {
              setJoinTarget(instructionTarget)
              setInstructionTarget(null)
            }}
          >
            I Agree — Enter Room Code →
          </button>
        </div>
      </div>
    </div>
  )

  // ── Room-code join modal ────────────────────────────────────────────────────
  const joinModal = joinTarget && (
    <div style={{ position:'fixed',inset:0,background:'rgba(10,10,25,.58)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400 }}>
      <form onSubmit={handleJoinSubmit} style={{ background:'#fff',borderRadius:20,padding:'2rem',maxWidth:360,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ fontSize:40, textAlign:'center', marginBottom:12 }}>🔑</div>
        <h3 style={{ margin:'0 0 6px', fontSize:19, fontWeight:800, textAlign:'center' }}>Enter room code</h3>
        <p style={{ color:'#6b7280', fontSize:13, textAlign:'center', margin:'0 0 18px' }}>
          Ask your admin for the code to join "{joinTarget.title}"
        </p>
        <input
          autoFocus
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          placeholder="e.g. 482913"
          maxLength={6}
          style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', fontSize:22, fontWeight:800, letterSpacing:'.2em', textAlign:'center', borderRadius:12, border:'1.5px solid #d1d5db', marginBottom:12 }}
        />
        {joinError && (
          <p style={{ color:'#dc2626', fontSize:13, textAlign:'center', margin:'0 0 12px' }}>⚠ {joinError}</p>
        )}
        <div style={{ display:'flex', gap:9, marginTop:6 }}>
          <button type="button" className="btn-sec" style={{ flex:1 }} onClick={handleJoinCancel} disabled={joining}>Cancel</button>
          <button type="submit" className="btn-pri" style={{ flex:1 }} disabled={joining}>
            {joining ? 'Joining…' : 'Join room'}
          </button>
        </div>
      </form>
    </div>
  )

  // ── Waiting room ────────────────────────────────────────────────────────────
  if (screen === 'quiz' && inWaiting && session && activeQuiz) return (
    <WaitingRoom
      session={session}
      quiz={activeQuiz}
      userRole="student"
      onQuizStart={handleQuizStart}
      onLeave={handleLeaveRoom}
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
        histCount={attempts.length}
      />
      {instructionModal}
      {joinModal}
    </>
  )

  if (screen === 'analytics' && analyticsQuiz) return (
    <AnalyticsDashboard
      quiz={analyticsQuiz}
      onBack={() => setScreen('home')}
    />
  )

  if (screen === 'quiz' && activeQuiz) return (
    <QuizAttempt quiz={activeQuiz} userName={user?.name} onSubmit={handleSubmit} />
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
        auto: viewingAttempt.auto,
        sectionBreakdown: viewingAttempt.sectionBreakdown,
        totalTimeSpent: viewingAttempt.totalTimeSpent || viewingAttempt.time_taken_sec || 0,
        questionTimes: viewingAttempt.questionTimes || {},
        solution_pdf: viewingAttempt.solution_pdf,
        solution_pdf_name: viewingAttempt.solution_pdf_name,
      }}
      onBack={() => setScreen('history')}
      onHome={() => setScreen('home')}
    />
  )

  return null
}
