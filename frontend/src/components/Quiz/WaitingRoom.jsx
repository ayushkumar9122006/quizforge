/**
 * WaitingRoom — shown to student after joining, before quiz starts.
 * Also shown to admin with full participant list + Start button.
 */
import { useEffect } from 'react'
// import { useRoom } from '../../hooks/useRoom.js'
import { startSession } from '../../services/sessionService.js'

export default function WaitingRoom({ session, quiz, userRole, onQuizStart, onLeave ,connected, participants, quizStarted, recentSubmit,}) {
  // const {
  //   connected, participants, quizStarted, recentSubmit
  // } = useRoom(session.room_code)

  // When quiz:started WS event fires, notify parent
  useEffect(() => {
    if (quizStarted) onQuizStart()
  }, [quizStarted, onQuizStart])

  const students = participants.filter(p => p.role === 'student')
  const isAdmin  = userRole === 'admin'

  const handleStart = async () => {
    try {
      await startSession(session.id)
      // WS event quiz:started will fire and trigger onQuizStart
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to start quiz')
    }
  }

  return (
    <div style={{ minHeight:'calc(100vh - 52px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', background:'#f4f6fb' }}>
      <div style={{ width:'100%', maxWidth:520 }}>

        {/* Room code card */}
        <div style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:20, padding:'2rem', textAlign:'center', marginBottom:20, boxShadow:'0 8px 32px rgba(99,102,241,.3)' }}>
          <p style={{ color:'rgba(255,255,255,.75)', fontSize:13, fontWeight:700, margin:'0 0 8px', letterSpacing:'.1em', textTransform:'uppercase' }}>Room Code</p>
          <div style={{ fontSize:52, fontWeight:900, color:'#fff', letterSpacing:'.2em', fontVariantNumeric:'tabular-nums' }}>
            {session.room_code}
          </div>
          <p style={{ color:'rgba(255,255,255,.7)', fontSize:13, margin:'10px 0 0' }}>
            Share this code with students to join
          </p>
        </div>

        {/* Quiz info */}
        <div className="card" style={{ marginBottom:16, textAlign:'center' }}>
          <div style={{ fontSize:22, marginBottom:6 }}>📝</div>
          <div style={{ fontWeight:800, fontSize:16, color:'#111827', marginBottom:4 }}>{quiz?.title}</div>
          <div style={{ fontSize:13, color:'#9ca3af' }}>
            {quiz?.questions?.length ?? 0} questions · {
              quiz?.total_duration_minutes != null
                ? `${Number(quiz.total_duration_minutes).toFixed(2)} min total (${Number(quiz.time_per_question_min ?? (quiz.total_duration_minutes / (quiz.questions?.length || 1))).toFixed(2)} min/q)`
                : `${Math.round((quiz?.timePerQ || quiz?.time_per_q_sec || 300) / 60)} min/q`
            }
          </div>
        </div>

        {/* Connection status */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, padding:'10px 14px', background:connected?'#f0fdf4':'#fef2f2', borderRadius:10, border:`1px solid ${connected?'#86efac':'#fca5a5'}` }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:connected?'#22c55e':'#ef4444',flexShrink:0 }} />
          <span style={{ fontSize:13, fontWeight:600, color:connected?'#065f46':'#dc2626' }}>
            {connected ? 'Connected to room' : 'Connecting…'}
          </span>
        </div>

        {/* Participant list */}
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <span style={{ fontWeight:700, fontSize:15 }}>
              Participants
            </span>
            <span style={{ fontSize:13, color:'#9ca3af' }}>{students.length} student{students.length !== 1 ? 's' : ''}</span>
          </div>

          {students.length === 0 ? (
            <div style={{ textAlign:'center', padding:'1.5rem', color:'#9ca3af', fontSize:14 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
              Waiting for students to join…
            </div>
          ) : (
            <div style={{ display:'grid', gap:8 }}>
              {students.map(p => (
                <div key={p.user_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#f9fafb', borderRadius:9 }}>
                  <div style={{ width:30,height:30,borderRadius:'50%',background:'#ede9fe',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:'#6366f1',flexShrink:0 }}>
                    {p.name?.[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontWeight:600, fontSize:14, color:'#111827' }}>{p.name}</span>
                  <span style={{ marginLeft:'auto', fontSize:11, color:'#22c55e', fontWeight:700 }}>● Online</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent submit toast (admin only) */}
        {isAdmin && recentSubmit && (
          <div style={{ marginBottom:14, padding:'10px 14px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, fontSize:13, color:'#065f46', fontWeight:600 }}>
            ✓ {recentSubmit.name} submitted — {recentSubmit.score}/{recentSubmit.total} (Rank #{recentSubmit.rank})
          </div>
        )}

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn-sec" style={{ flex:1 }} onClick={onLeave}>
            ← Leave room
          </button>
          {isAdmin && (
            <button
              className="btn-pri" style={{ flex:2 }}
              onClick={handleStart}
              disabled={students.length === 0}>
              {students.length === 0 ? 'Waiting for students…' : `Start quiz (${students.length} ready) →`}
            </button>
          )}
          {!isAdmin && (
            <div style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f3ff', borderRadius:10, fontSize:14, color:'#6366f1', fontWeight:700 }}>
              ⏳ Waiting for admin to start…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
