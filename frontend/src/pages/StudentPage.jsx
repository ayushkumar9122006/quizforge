import { useState, useCallback } from 'react'
import StudentHome    from '../components/Student/StudentHome.jsx'
import AttemptHistory from '../components/Student/AttemptHistory.jsx'
import QuizAttempt    from '../components/Quiz/QuizAttempt.jsx'
import Results        from '../components/Quiz/Results.jsx'
import WaitingRoom    from '../components/Quiz/WaitingRoom.jsx'
import { useRoom }    from '../hooks/useRoom.js'
import { joinSession, submitAttempt, getLeaderboard } from '../services/sessionService.js'

export default function StudentPage({
  user, screen, setScreen,
  activeQuiz, currentResult,
  attempts, setAttempts,
  viewingAttempt, setViewingAttempt,
  onTake, onResult, onLogout,
}) {
  const [session,     setSession]     = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [inWaiting,   setInWaiting]   = useState(false)

  // Room-code join modal state — a student can NEVER reach the quiz
  // without a valid room code. Clicking "Start" opens this modal instead
  // of going straight to the quiz.
  const [joinTarget, setJoinTarget]   = useState(null)   // quiz awaiting a room code, or null
  const [roomCode,   setRoomCode]     = useState('')
  const [joinError,  setJoinError]    = useState(null)
  const [joining,    setJoining]      = useState(false)

  // Student clicks Start → prompt for the admin's room code first.

  const room = useRoom(session?.room_code)
  const handleTake = (quiz) => {
    setJoinTarget(quiz)
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
    const correctByQuestion = {}
    for (const r of attemptResult.results || []) {
      correctByQuestion[r.question_id] = r.correct_answer
    }

    const resolved = questions.map((q, i) => {
      const correctAns = correctByQuestion[q.id] ?? q.correct
      const userAns = answers[i]
      const isCorrect = userAns !== undefined && userAns === correctAns
      return {
        ...q,
        correct: correctAns,
        selectedOption: userAns,
        isCorrect,
        timeSpent: questionTimes[i] || 0,
      }
    })

    const score = (attemptResult.results || []).filter(r => r.is_correct).length

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
      secMap[s].totalMarks += (q.marks || 1)
      if (q.isCorrect) {
        secMap[s].correct += 1
        secMap[s].score += (q.marks || 1)
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

    // Store locally for attempt history
    const attempt = {
      id:        attemptResult.id,
      date:      new Date().toISOString(),
      quizTitle: activeQuiz.title,
      quizId:    activeQuiz.id,
      score,
      totalQ:    resolved.length,
      auto,
      answers,
      questions: resolved,
      sectionBreakdown,
      totalTimeSpent,
      questionTimes,
    }
    setAttempts(prev => [...prev, attempt])
    onResult({
      answers,
      score,
      auto,
      questions: resolved,
      sectionBreakdown,
      totalTimeSpent,
      questionTimes,
    })
  }

  const deleteAttempt = id => setAttempts(prev => prev.filter(a => a.id !== id))

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
        onLogout={onLogout}
        histCount={attempts.length}
      />
      {joinModal}
    </>
  )

  if (screen === 'quiz' && activeQuiz) return (
    <QuizAttempt quiz={activeQuiz} userName={user?.name} onSubmit={handleSubmit} />
  )

  if (screen === 'results' && activeQuiz && currentResult) return (
    <Results
      quiz={{ ...activeQuiz, questions: currentResult.questions || activeQuiz.questions }}
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
      quiz={{ title: viewingAttempt.quizTitle, questions: viewingAttempt.questions }}
      result={{
        answers: viewingAttempt.answers,
        score: viewingAttempt.score,
        auto: viewingAttempt.auto,
        sectionBreakdown: viewingAttempt.sectionBreakdown,
        totalTimeSpent: viewingAttempt.totalTimeSpent,
        questionTimes: viewingAttempt.questionTimes,
      }}
      onBack={() => setScreen('history')}
      onHome={() => setScreen('home')}
    />
  )

  return null
}
