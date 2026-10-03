import { useState, useEffect, useMemo } from 'react'
import { startSession, endSession } from '../../services/sessionService.js'
import LiveLeaderboard from '../Quiz/LiveLeaderboard.jsx'
import { formatTime } from '../../services/utils.js'

export default function LiveSessionMonitor({
  session,
  quiz,
  onLeave,
  onViewAnalytics,
  connected,
  participants = [],
  leaderboard = [],
  quizStarted = false,
  quizEnded = false,
  recentSubmit = null,
}) {
  const [status, setStatus]       = useState(session.status || 'waiting')
  const [elapsed, setElapsed]     = useState(0)
  const [starting, setStarting]   = useState(false)
  const [ending, setEnding]       = useState(false)
  const [copied, setCopied]       = useState(false)

  // Track start status
  useEffect(() => {
    if (quizStarted || session.status === 'active') {
      setStatus('active')
    }
    if (quizEnded || session.status === 'completed') {
      setStatus('completed')
    }
  }, [quizStarted, quizEnded, session.status])

  // Live timer while quiz is active
  useEffect(() => {
    if (status !== 'active') return
    const timer = setInterval(() => {
      setElapsed(e => e + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [status])

  const students = useMemo(() => {
    return participants.filter(p => p.role === 'student' || !p.role)
  }, [participants])

  // Map students to their live status (Ready, Taking Quiz, Submitted)
  const studentRows = useMemo(() => {
    const lbMap = new Map()
    leaderboard.forEach(entry => {
      // Key by student_name or student_id
      if (entry.student_id) lbMap.set(entry.student_id, entry)
      if (entry.student_name) lbMap.set(entry.student_name, entry)
    })

    return students.map(s => {
      const lbEntry = lbMap.get(s.user_id) || lbMap.get(s.name)
      const hasSubmitted = !!lbEntry

      return {
        id: s.user_id,
        name: s.name,
        hasSubmitted,
        score: lbEntry?.score,
        totalMarks: lbEntry?.total_marks,
        accuracy: lbEntry ? (() => {
          const raw = Number(lbEntry.accuracy || 0);
          const accVal = raw > 1 ? raw : raw * 100;
          return Math.min(100, Math.max(0, Math.round(accVal)));
        })() : null,
        timeTaken: lbEntry?.time_taken_sec,
        rank: lbEntry?.rank,
        status: hasSubmitted ? 'submitted' : (status === 'active' ? 'in_progress' : 'waiting')
      }
    })
  }, [students, leaderboard, status])

  const submittedCount = studentRows.filter(s => s.hasSubmitted).length
  const inProgressCount = studentRows.filter(s => s.status === 'in_progress').length

  const handleStartQuiz = async () => {
    setStarting(true)
    try {
      await startSession(session.id)
      setStatus('active')
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to start quiz')
    } finally {
      setStarting(false)
    }
  }

  const handleEndQuiz = async () => {
    if (!window.confirm('Are you sure you want to end this quiz session for all students?')) return
    setEnding(true)
    try {
      await endSession(session.id)
      setStatus('completed')
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to end quiz session')
    } finally {
      setEnding(false)
    }
  }

  const copyRoomCode = () => {
    navigator.clipboard?.writeText(session.room_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>

      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button className="btn-ghost" onClick={onLeave} style={{ fontSize: 13, marginBottom: 6 }}>
            ← Back to Dashboard
          </button>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111827' }}>
            Live Quiz Room: {quiz?.title || 'Quiz Session'}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          {status === 'active' && (
            <button
              onClick={handleEndQuiz}
              disabled={ending}
              style={{
                padding: '8px 16px',
                borderRadius: 9,
                border: 'none',
                background: '#dc2626',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              {ending ? 'Ending…' : '⏹ End Quiz'}
            </button>
          )}
          {onViewAnalytics && (
            <button
              className="btn-pri"
              style={{ fontSize: 13, padding: '8px 16px' }}
              onClick={() => onViewAnalytics(quiz)}
            >
              📊 Full Analytics
            </button>
          )}
        </div>
      </div>

      {/* Hero Room Status Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
        borderRadius: 20,
        padding: '1.6rem 2rem',
        color: '#fff',
        marginBottom: 24,
        boxShadow: '0 8px 30px rgba(79, 70, 229, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,0.8)' }}>
              Room Code
            </span>
            <span
              onClick={copyRoomCode}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.2)',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              {copied ? '✓ Copied!' : '📋 Copy'}
            </span>
          </div>
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '.18em', lineHeight: 1 }}>
            {session.room_code}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>
            {status === 'waiting' && 'Waiting for students to join. Share this code with your class!'}
            {status === 'active' && 'Quiz is LIVE! Students are answering questions in real-time.'}
            {status === 'completed' && 'Quiz session has ended.'}
          </div>
        </div>

        {/* Live Status Indicators */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '12px 18px', textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 700, textTransform: 'uppercase' }}>Status</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {status === 'waiting' && <><span style={{ color: '#fef08a' }}>●</span> Waiting</>}
              {status === 'active' && <><span style={{ color: '#4ade80', animation: 'pulse 1.5s infinite' }}>●</span> Live</>}
              {status === 'completed' && <><span style={{ color: '#cbd5e1' }}>●</span> Ended</>}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '12px 18px', textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 700, textTransform: 'uppercase' }}>Live Timer</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(elapsed)}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '12px 18px', textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 700, textTransform: 'uppercase' }}>Students</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>
              {students.length}
            </div>
          </div>
        </div>
      </div>

      {/* Submission Notification Toast */}
      {recentSubmit && (
        <div style={{
          marginBottom: 20,
          padding: '12px 18px',
          background: '#f0fdf4',
          border: '1.5px solid #86efac',
          borderRadius: 12,
          fontSize: 14,
          color: '#15803d',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 4px 12px rgba(34, 197, 94, 0.15)'
        }}>
          <span style={{ fontSize: 20 }}>🎉</span>
          <span>
            <strong>{recentSubmit.name}</strong> just submitted! Score: {recentSubmit.score}/{recentSubmit.total} (Rank #{recentSubmit.rank})
          </span>
        </div>
      )}

      {/* Main Grid: Student Monitoring & Live Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: leaderboard.length > 0 ? '1fr 340px' : '1fr', gap: 20 }}>

        {/* Left Column: Live Student Status List */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px', color: '#111827' }}>
                Students in Room ({students.length})
              </h3>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                {status === 'active'
                  ? `${submittedCount} submitted · ${inProgressCount} currently taking quiz`
                  : 'Students who join with the room code will appear here live'}
              </p>
            </div>

            {status === 'waiting' && (
              <button
                className="btn-pri"
                style={{ padding: '8px 18px', fontSize: 13 }}
                onClick={handleStartQuiz}
                disabled={starting || students.length === 0}
              >
                {starting ? 'Starting…' : students.length === 0 ? 'Waiting for students…' : `Start Quiz (${students.length} ready) →`}
              </button>
            )}
          </div>

          {students.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#9ca3af' }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>👥</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#374151', marginBottom: 4 }}>No students in room yet</div>
              <div style={{ fontSize: 13 }}>Share code <strong>{session.room_code}</strong> with your students to get started.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {studentRows.map((st, idx) => {
                return (
                  <div
                    key={st.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: st.hasSubmitted ? '#f0fdf4' : (st.status === 'in_progress' ? '#f8fafc' : '#fafafa'),
                      border: `1.5px solid ${st.hasSubmitted ? '#86efac' : (st.status === 'in_progress' ? '#e2e8f0' : '#f3f4f6')}`,
                      borderRadius: 12,
                      transition: 'all .2s'
                    }}
                  >
                    {/* Student Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: st.hasSubmitted ? '#dcfce7' : '#ede9fe',
                        color: st.hasSubmitted ? '#16a34a' : '#6366f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 800
                      }}>
                        {st.name?.[0]?.toUpperCase() || 'S'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>
                          {st.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                          {st.hasSubmitted
                            ? `Completed in ${st.timeTaken || 0}s`
                            : (status === 'active' ? `Taking quiz · Live elapsed: ${formatTime(elapsed)}` : 'Connected & ready')}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div style={{ textAlign: 'right' }}>
                      {st.hasSubmitted ? (
                        <div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 11px',
                            background: '#dcfce7',
                            color: '#15803d',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 800
                          }}>
                            ✓ Submitted ({st.score}/{st.totalMarks})
                          </span>
                          {st.accuracy !== null && (
                            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>
                              {st.accuracy}% accuracy · Rank #{st.rank}
                            </div>
                          )}
                        </div>
                      ) : (
                        status === 'active' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 11px',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 800
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0284c7', animation: 'pulse 1.5s infinite' }} />
                            Live in Quiz
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 11px',
                            background: '#fef3c7',
                            color: '#92400e',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 700
                          }}>
                            ● Ready to start
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Column: Live Leaderboard (if any submissions) */}
        {leaderboard.length > 0 && (
          <div className="card" style={{ padding: '1.2rem', height: 'fit-content' }}>
            <LiveLeaderboard
              entries={leaderboard}
              title="Live Standings"
            />
          </div>
        )}
      </div>
    </div>
  )
}
