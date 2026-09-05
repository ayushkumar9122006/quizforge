import { formatDuration } from '../../services/utils.js'
import { viewSolutionPdf } from '../../services/quizService.js'

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
    <div style={{ maxWidth:680, margin:'0 auto', padding:'2rem 1.5rem' }}>
      <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:22 }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <h2 style={{ fontSize:21, fontWeight:800, margin:0 }}>My attempts</h2>
        <span style={{ fontSize:13, color:'#9ca3af', marginLeft:'auto' }}>
          {attempts.length} attempt{attempts.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display:'grid', gap:11 }}>
        {[...attempts].reverse().map(a => {
          const totalMarks = a.total_marks !== undefined ? a.total_marks : (a.totalQ * 4)
          const pct = totalMarks > 0 ? Math.max(0, Math.round((a.score / totalMarks) * 100)) : 0
          const sc  = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'
          const sbg = pct >= 70 ? '#d1fae5' : pct >= 40 ? '#fef3c7' : '#fee2e2'
          const hasPdf = Boolean(a.solution_pdf || a.solution_pdf_name || a.quiz?.solution_pdf || a.quiz?.solution_pdf_name)

          return (
            <div key={a.id} className="card" style={{ display:'flex', gap:13, alignItems:'flex-start', flexWrap:'wrap' }}>
              <div style={{ minWidth:54, height:54, borderRadius:13, background:sbg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:17, fontWeight:900, color:sc }}>{pct}%</span>
                <span style={{ fontSize:10, color:sc, opacity:.75 }}>{a.score}/{totalMarks}</span>
              </div>

              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontWeight:700, fontSize:15, color:'#111827', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {a.quizTitle || a.quiz_title || 'Quiz'}
                </div>
                <div style={{ fontSize:12, color:'#9ca3af', marginBottom:7, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                  <span>📅 {new Date(a.date || a.submitted_at).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                  {a.time_taken_sec !== undefined && <span>⏱ {formatDuration(a.time_taken_sec)}</span>}
                  {a.auto && <span className="tag tag-yellow">Auto-submitted</span>}
                </div>
                <div style={{ height:4, background:'#f3f4f6', borderRadius:3 }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:sc, borderRadius:3 }} />
                </div>
              </div>

              <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                {hasPdf && (
                  <button
                    className="btn-sec"
                    style={{ fontSize:12, padding:'5px 10px', color:'#059669', borderColor:'#86efac', background:'#ecfdf5', fontWeight:800 }}
                    onClick={() => viewSolutionPdf(a.quizId || a.quiz_id)}
                  >
                    📄 PDF
                  </button>
                )}
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
