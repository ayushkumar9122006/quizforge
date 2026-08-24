import { usePublishedQuizzes } from '../../hooks/usePublishedQuizzes.js'

export default function StudentHome({ user, onTake, onHistory, onLogout, histCount }) {
  const { quizzes, loading, error } = usePublishedQuizzes()

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'2rem 1.5rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:26 }}>
        <div>
          <h2 style={{ fontSize:23, fontWeight:800, margin:'0 0 4px' }}>Available Quizzes</h2>
          <p style={{ fontSize:14, color:'#6b7280', margin:0 }}>Welcome, {user?.name}!</p>
        </div>
        <div style={{ display:'flex', gap:9 }}>
          <button className="btn-sec" onClick={onHistory}>🗂 History ({histCount})</button>
          <button className="btn-sec" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign:'center', color:'#9ca3af', padding:'3rem' }}>Loading quizzes…</div>
      )}

      {error && (
        <div style={{ padding:'12px 16px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10, fontSize:14, color:'#dc2626', marginBottom:16 }}>
          ⚠ {error}
        </div>
      )}

      {!loading && quizzes.length === 0 && !error && (
        <div style={{ textAlign:'center', padding:'4rem 2rem', background:'#fff', borderRadius:16, border:'1.5px dashed #e5e7eb' }}>
          <div style={{ fontSize:54, marginBottom:13 }}>📭</div>
          <p style={{ fontWeight:800, fontSize:16, margin:'0 0 5px' }}>No quizzes yet</p>
          <p style={{ color:'#9ca3af', fontSize:14 }}>Your admin hasn't published any quizzes yet.</p>
        </div>
      )}

      <div style={{ display:'grid', gap:13 }}>
        {quizzes.map(quiz => {
          const mins = Math.round((quiz.questions?.length || 0) * ((quiz.timePerQ || 300) / 60))
          const secs = [...new Set((quiz.questions || []).map(q => q.section))]
          return (
            <div key={quiz.id}
              style={{ background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb', overflow:'hidden', transition:'box-shadow .15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 6px 24px rgba(0,0,0,.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
              <div style={{ padding:'1.1rem 1.4rem', display:'flex', alignItems:'center', gap:15 }}>
                <div style={{ width:50,height:50,borderRadius:14,background:'linear-gradient(135deg,#ede9fe,#ddd6fe)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0 }}>📝</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800,fontSize:16,color:'#111827',marginBottom:4 }}>{quiz.title}</div>
                  <div style={{ fontSize:12,color:'#6b7280',display:'flex',gap:13,flexWrap:'wrap',marginBottom:secs.length>1?5:0 }}>
                    <span>📝 {quiz.questions?.length ?? 0} questions</span>
                    <span>⏱ ~{mins} min</span>
                    <span>📅 {new Date(quiz.createdAt).toLocaleDateString()}</span>
                  </div>
                  {secs.length > 1 && (
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                      {secs.map(s => <span key={s} className="tag tag-purple">{s}</span>)}
                    </div>
                  )}
                </div>
                <button className="btn-pri" onClick={() => onTake(quiz)}>Start →</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
