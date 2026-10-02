import { usePublishedQuizzes } from '../../hooks/usePublishedQuizzes.js'

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

export default function StudentHome({
  user,
  onTake,
  onHistory,
  onAnalytics,
  onLogout,
  attempts = [],
  histCount = 0,
  onViewAttempt
}) {
  const { quizzes, loading, error, reload } = usePublishedQuizzes()

  // Map of completed quiz IDs
  const completedMap = {}
  attempts.forEach(a => {
    const qid = a.quizId || a.quiz_id
    if (qid) completedMap[qid] = a
  })

  const getQuizAvailability = (quiz) => {
    const completedAttempt = completedMap[quiz.id]
    if (completedAttempt) {
      return {
        status: 'completed',
        label: '✓ Completed',
        badgeBg: '#d1fae5',
        badgeColor: '#059669',
        badgeBorder: '#a7f3d0',
        canStart: false,
        isCompleted: true,
        attempt: completedAttempt,
        detail: `Submitted on ${formatIST(completedAttempt.date || completedAttempt.submitted_at)}`
      }
    }

    const now = new Date()
    if (quiz.availability_start) {
      const start = new Date(quiz.availability_start)
      if (now < start) {
        return {
          status: 'scheduled',
          label: '🕒 Scheduled',
          badgeBg: '#fef3c7',
          badgeColor: '#b45309',
          badgeBorder: '#fde68a',
          canStart: false,
          detail: `Available From: ${formatIST(quiz.availability_start)}`
        }
      }
    }

    if (quiz.availability_end) {
      const end = new Date(quiz.availability_end)
      if (now > end) {
        return {
          status: 'closed',
          label: '🔒 Closed',
          badgeBg: '#fee2e2',
          badgeColor: '#dc2626',
          badgeBorder: '#fecaca',
          canStart: false,
          detail: `Test Ended: ${formatIST(quiz.availability_end)}`
        }
      }
    }

    return {
      status: 'available',
      label: '🟢 Available Now',
      badgeBg: '#dcfce7',
      badgeColor: '#15803d',
      badgeBorder: '#86efac',
      canStart: true,
      detail: quiz.availability_end ? `Closes: ${formatIST(quiz.availability_end)}` : 'Open for attempts'
    }
  }

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px', color: '#111827' }}>Available Tests</h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Welcome back, <strong style={{ color: '#111827' }}>{user?.name}</strong>!</p>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn-sec" onClick={onHistory}>
            🗂 My Test History ({histCount || attempts.length})
          </button>
          <button className="btn-sec" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>
          Loading active tests…
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: 14, color: '#dc2626', marginBottom: 18 }}>
          ⚠ {error} — <button onClick={reload} style={{ background: 'none', border: 'none', color: '#dc2626', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {!loading && quizzes.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: 20, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 54, marginBottom: 14 }}>📭</div>
          <p style={{ fontWeight: 800, fontSize: 17, margin: '0 0 6px', color: '#111827' }}>No tests available right now</p>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Your instructor has not scheduled any quizzes at this time.</p>
        </div>
      )}

      {/* Quiz List */}
      <div style={{ display: 'grid', gap: 14 }}>
        {quizzes.map(quiz => {
          const totalQ = quiz.questions?.length || 0
          const mins = Math.round(totalQ * ((quiz.time_per_q_sec || quiz.timePerQ || 300) / 60))
          const secs = [...new Set((quiz.questions || []).map(q => q.section || 'General'))]
          const availability = getQuizAvailability(quiz)

          return (
            <div
              key={quiz.id}
              style={{
                background: '#fff',
                borderRadius: 18,
                border: '1.5px solid #e2e8f0',
                overflow: 'hidden',
                transition: 'box-shadow .2s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'}
            >
              <div style={{ padding: '1.3rem 1.5rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 15,
                  background: availability.status === 'available' ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0
                }}>
                  {availability.status === 'completed' ? '🏆' : availability.status === 'scheduled' ? '🕒' : '📝'}
                </div>

                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 17, color: '#111827' }}>{quiz.title}</span>
                    <span style={{
                      padding: '2px 9px',
                      borderRadius: 20,
                      background: availability.badgeBg,
                      color: availability.badgeColor,
                      border: `1px solid ${availability.badgeBorder}`,
                      fontSize: 11,
                      fontWeight: 800
                    }}>
                      {availability.label}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                    <span>📝 {totalQ} questions</span>
                    <span>⏱ ~{mins} mins duration</span>
                    <span style={{ color: '#4f46e5', fontWeight: 600 }}>{availability.detail}</span>
                  </div>

                  {secs.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {secs.map(s => <span key={s} className="tag tag-purple">{s}</span>)}
                    </div>
                  )}
                </div>

                {/* Right Action Button */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                  {onAnalytics && (
                    <button
                      className="btn-sec"
                      style={{ fontSize: 12, padding: '7px 12px' }}
                      onClick={() => onAnalytics(quiz)}
                    >
                      📊 Analytics
                    </button>
                  )}

                  {availability.isCompleted ? (
                    <button
                      className="btn-sec"
                      style={{ fontSize: 13, padding: '8px 16px', color: '#059669', borderColor: '#86efac', background: '#ecfdf5', fontWeight: 800 }}
                      onClick={() => onViewAttempt ? onViewAttempt(availability.attempt) : onHistory()}
                    >
                      View Result →
                    </button>
                  ) : availability.canStart ? (
                    <button
                      className="btn-pri"
                      style={{ fontSize: 14, padding: '8px 20px', fontWeight: 800 }}
                      onClick={() => onTake(quiz)}
                    >
                      Start Test →
                    </button>
                  ) : availability.status === 'scheduled' ? (
                    <button
                      className="btn-sec"
                      disabled
                      style={{ fontSize: 12, padding: '8px 14px', background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }}
                    >
                      Available Soon
                    </button>
                  ) : (
                    <button
                      className="btn-sec"
                      disabled
                      style={{ fontSize: 12, padding: '8px 14px', background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }}
                    >
                      Test Closed
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
