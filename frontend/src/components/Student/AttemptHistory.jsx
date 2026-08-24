export default function AttemptHistory({ attempts, onDelete, onView, onBack }) {
  if (!attempts.length) return (
    <div style={{ maxWidth:520, margin:'4rem auto', padding:'0 1.5rem', textAlign:'center' }}>
      <div style={{ fontSize:54, marginBottom:14 }}>📭</div>
      <h2 style={{ fontSize:19, fontWeight:800, marginBottom:7 }}>No attempts yet</h2>
      <p style={{ color:'#6b7280', marginBottom:22 }}>Complete a quiz and it will appear here.</p>
      <button className="btn-pri" onClick={onBack}>← Back</button>
    </div>
  )

  return (
    <div style={{ maxWidth:640, margin:'0 auto', padding:'2rem 1.5rem' }}>
      <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:22 }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <h2 style={{ fontSize:21, fontWeight:800, margin:0 }}>My attempts</h2>
        <span style={{ fontSize:13, color:'#9ca3af', marginLeft:'auto' }}>
          {attempts.length} attempt{attempts.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display:'grid', gap:11 }}>
        {[...attempts].reverse().map(a => {
          const pct = Math.round((a.score / a.totalQ) * 100)
          const sc  = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'
          const sbg = pct >= 70 ? '#d1fae5' : pct >= 40 ? '#fef3c7' : '#fee2e2'
          return (
            <div key={a.id} className="card" style={{ display:'flex', gap:13, alignItems:'flex-start' }}>
              <div style={{ minWidth:54, height:54, borderRadius:13, background:sbg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:17, fontWeight:900, color:sc }}>{pct}%</span>
                <span style={{ fontSize:10, color:sc, opacity:.75 }}>{a.score}/{a.totalQ}</span>
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#111827', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {a.quizTitle}
                </div>
                <div style={{ fontSize:12, color:'#9ca3af', marginBottom:7 }}>
                  {new Date(a.date).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                  {a.auto && <span className="tag tag-yellow" style={{ marginLeft:7 }}>Auto-submitted</span>}
                </div>
                <div style={{ height:4, background:'#f3f4f6', borderRadius:3 }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:sc, borderRadius:3 }} />
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5, flexShrink:0 }}>
                <button className="btn-sec" style={{ fontSize:12, padding:'5px 11px' }} onClick={() => onView(a)}>Review</button>
                <button className="btn-danger" onClick={() => onDelete(a.id)}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
