import { formatDuration } from '../../services/utils.js'
import { viewSolutionPdf } from '../../services/quizService.js'
import { downloadResponseSheetPdf } from '../../services/sessionService.js'

function formatIST(dateStr) {
  if (!dateStr) return 'N/A'
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

export default function AttemptHistory({ attempts = [], onView, onBack }) {
  // Sort attempts by most recent submission date descending
  const sortedAttempts = [...attempts].sort((a, b) => {
    const timeA = new Date(a.date || a.submitted_at || 0).getTime()
    const timeB = new Date(b.date || b.submitted_at || 0).getTime()
    return timeB - timeA
  })

  if (!sortedAttempts.length) {
    return (
      <div style={{ maxWidth: 540, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>📭</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: '#111827' }}>No test attempts yet</h2>
        <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
          Complete a test within the availability window and your comprehensive results, rank, and history will appear here.
        </p>
        <button className="btn-pri" onClick={onBack}>← Back to Available Tests</button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 900, margin: 0, color: '#111827' }}>My Test History</h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '2px 0 0' }}>
            Review past scores, rankings, question analyses, and official solution PDFs.
          </p>
        </div>
        <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 800, marginLeft: 'auto', background: '#e0e7ff', padding: '4px 12px', borderRadius: 20 }}>
          {sortedAttempts.length} Completed
        </span>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {sortedAttempts.map(a => {
          const totalMarks = Number(a.total_marks !== undefined ? a.total_marks : (a.totalQ * 4))
          const score = Number(a.score || 0)
          const pct = totalMarks > 0 ? Math.max(0, Math.round((score / totalMarks) * 100)) : 0
          const sc = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'
          const sbg = pct >= 70 ? '#d1fae5' : pct >= 40 ? '#fef3c7' : '#fee2e2'
          const hasPdf = Boolean(a.solution_pdf || a.solution_pdf_name || a.has_solution_pdf)
          const accuracy = a.accuracy !== undefined ? a.accuracy : (a.attempted_count > 0 ? Math.round((a.correct_count / a.attempted_count) * 100) : 0)
          const rank = a.rank ?? 1
          const totalParticipants = a.total_participants ?? 1
          const timeSec = a.time_taken_sec || a.totalTimeSpent || 0

          return (
            <div
              key={a.id}
              className="card"
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                flexWrap: 'wrap',
                padding: '1.4rem',
                borderRadius: 18,
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                transition: 'all .15s ease'
              }}
            >
              {/* Score Badge */}
              <div style={{
                minWidth: 64,
                height: 64,
                borderRadius: 16,
                background: sbg,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: `1.5px solid ${sc}30`
              }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: sc }}>{pct}%</span>
                <span style={{ fontSize: 11, color: sc, fontWeight: 700 }}>{score}/{totalMarks}</span>
              </div>

              {/* Quiz Details */}
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', marginBottom: 4 }}>
                  {a.quizTitle || a.quiz_title || 'Quiz Attempt'}
                </div>

                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>📅 {formatIST(a.date || a.submitted_at)}</span>
                  <span>⏱ {formatDuration(timeSec)}</span>
                  <span style={{ color: '#059669', fontWeight: 700 }}>🎯 {accuracy}% Accuracy</span>
                  <span style={{ color: '#4338ca', fontWeight: 800, background: '#ede9fe', padding: '1px 8px', borderRadius: 12 }}>
                    🏆 Rank #{rank} / {totalParticipants}
                  </span>
                  {a.auto && <span className="tag tag-yellow">Auto-submitted</span>}
                </div>

                {/* Progress bar */}
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: sc, borderRadius: 3 }} />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                {hasPdf && (
                  <button
                    className="btn-sec"
                    style={{ fontSize: 12, padding: '7px 12px', color: '#059669', borderColor: '#86efac', background: '#ecfdf5', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => viewSolutionPdf(a.quizId || a.quiz_id)}
                    title="View official solution PDF"
                  >
                    <span>📄</span>
                    <span>Solution PDF</span>
                  </button>
                )}
                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '7px 12px', color: '#4338ca', borderColor: '#c7d2fe', background: '#eef2ff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={async () => {
                    try {
                      await downloadResponseSheetPdf(a.id, a.quizTitle || a.quiz_title)
                    } catch (err) {
                      alert(err.response?.data?.detail || 'Failed to download response sheet PDF.')
                    }
                  }}
                  title="Download your official response sheet PDF"
                >
                  <span>📥</span>
                  <span>Response Sheet</span>
                </button>
                <button
                  className="btn-pri"
                  style={{ fontSize: 13, padding: '7px 16px', fontWeight: 800 }}
                  onClick={() => onView(a)}
                >
                  View Result →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
