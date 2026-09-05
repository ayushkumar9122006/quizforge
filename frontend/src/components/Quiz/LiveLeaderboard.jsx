import { formatDuration } from '../../services/utils.js'

/**
 * LiveLeaderboard — real-time leaderboard shown after quiz ends
 * or during quiz (admin view).
 * Receives leaderboard data via WebSocket through useRoom,
 * or falls back to HTTP polling via prop.
 */
export default function LiveLeaderboard({ entries = [], title = 'Leaderboard', currentUserId = null }) {
  if (!entries.length) return (
    <div style={{ textAlign:'center', padding:'2rem', color:'#9ca3af' }}>
      <div style={{ fontSize:36, marginBottom:10 }}>🏆</div>
      <p style={{ fontWeight:700 }}>No submissions yet</p>
    </div>
  )

  return (
    <div>
      <h3 style={{ fontSize:17, fontWeight:800, margin:'0 0 16px', display:'flex', alignItems:'center', gap:8 }}>
        🏆 {title}
        <span style={{ fontSize:12, color:'#9ca3af', fontWeight:400 }}>{entries.length} submitted</span>
      </h3>

      <div style={{ display:'grid', gap:8 }}>
        {entries.map((entry, i) => {
          const isMe  = entry.student_id === currentUserId
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
          const pct   = entry.total_marks > 0
            ? Math.round((entry.score / entry.total_marks) * 100) : 0
          const barColor = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'

          return (
            <div key={entry.student_name + i}
              style={{ padding:'12px 14px', borderRadius:12, border:`1.5px solid ${isMe ? '#6366f1' : '#e5e7eb'}`, background: isMe ? '#f5f3ff' : '#fff', transition:'all .2s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                {/* Rank */}
                <div style={{ width:36, textAlign:'center', fontSize: medal ? 22 : 15, fontWeight:800, color:'#6b7280', flexShrink:0 }}>
                  {medal || `#${entry.rank}`}
                </div>
                {/* Avatar */}
                <div style={{ width:34,height:34,borderRadius:'50%',background:isMe?'#ede9fe':'#f3f4f6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:isMe?'#6366f1':'#6b7280',flexShrink:0 }}>
                  {entry.student_name?.[0]?.toUpperCase()}
                </div>
                {/* Name */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, color: isMe ? '#6366f1' : '#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {entry.student_name}{isMe && <span style={{ fontSize:11, marginLeft:6, opacity:.6 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#9ca3af' }}>
                    {Math.round((entry.accuracy || 0) * 100)}% accuracy · {formatDuration(entry.time_taken_sec || 0)}
                  </div>
                </div>
                {/* Score */}
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:18, fontWeight:900, color:barColor }}>{pct}%</div>
                  <div style={{ fontSize:11, color:'#9ca3af' }}>{entry.score} / {entry.total_marks} pts</div>
                </div>
              </div>

              {/* Score bar */}
              <div style={{ height:4, background:'#f3f4f6', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:barColor, borderRadius:2, transition:'width .6s ease' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
