import { useState, useEffect } from 'react'
import { getStudentNotices, markNoticesRead } from '../../services/noticeService.js'

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

const PRIORITY_STYLES = {
  urgent: {
    bg: '#fef2f2',
    color: '#dc2626',
    border: '#fca5a5',
    label: '🚨 URGENT'
  },
  high: {
    bg: '#fffbeb',
    color: '#d97706',
    border: '#fcd34d',
    label: '⚡ HIGH'
  },
  medium: {
    bg: '#eff6ff',
    color: '#2563eb',
    border: '#bfdbfe',
    label: '📌 NOTICE'
  },
  low: {
    bg: '#f8fafc',
    color: '#64748b',
    border: '#e2e8f0',
    label: 'ℹ INFO'
  }
}

export default function NoticeBoard({ onBack, onMarkedRead }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadAndMark() {
      try {
        setLoading(true)
        setError(null)
        const data = await getStudentNotices()
        if (!isMounted) return
        setNotices(data || [])

        // Mark active notices as read upon opening the notice board
        if (data && data.length > 0) {
          await markNoticesRead()
          if (onMarkedRead) {
            onMarkedRead()
          }
        }
      } catch (err) {
        if (!isMounted) return
        setError(err?.response?.data?.detail || 'Failed to load announcements')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadAndMark()

    return () => {
      isMounted = false
    }
  }, [onMarkedRead])

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>📢</span>
            <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: '#111827' }}>
              Notice Board
            </h2>
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0 0' }}>
            Official announcements, examination schedules, and student updates
          </p>
        </div>

        {onBack && (
          <button className="btn-sec" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Back to Home
          </button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3.5rem 1rem' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Loading announcements…</p>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: 14, color: '#dc2626', marginBottom: 18 }}>
          ⚠ {error}
        </div>
      )}

      {!loading && !error && notices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: 20, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>📭</div>
          <p style={{ fontWeight: 800, fontSize: 18, margin: '0 0 6px', color: '#111827' }}>No announcements at this time</p>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>All caught up! Check back later for official instructor announcements.</p>
        </div>
      )}

      {/* Notices list */}
      {!loading && (
        <div style={{ display: 'grid', gap: 16 }}>
          {notices.map(notice => {
            const pStyle = PRIORITY_STYLES[notice.priority] || PRIORITY_STYLES.medium

            return (
              <div
                key={notice.id}
                style={{
                  background: '#fff',
                  borderRadius: 18,
                  border: notice.pinned ? '2px solid #c7d2fe' : '1.5px solid #e2e8f0',
                  boxShadow: notice.pinned ? '0 4px 16px rgba(99, 102, 241, 0.08)' : '0 2px 8px rgba(0,0,0,0.02)',
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  position: 'relative'
                }}
              >
                {/* Notice header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {notice.pinned && (
                        <span style={{
                          padding: '2px 9px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 800,
                          background: '#ede9fe',
                          color: '#6366f1',
                          border: '1px solid #c7d2fe',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          📌 PINNED
                        </span>
                      )}

                      <span style={{
                        padding: '2px 9px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 800,
                        background: pStyle.bg,
                        color: pStyle.color,
                        border: `1px solid ${pStyle.border}`
                      }}>
                        {pStyle.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>
                      🕒 {formatIST(notice.created_at)}
                    </div>
                  </div>

                  <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px 0', color: '#111827', lineHeight: 1.35 }}>
                    {notice.title}
                  </h3>

                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                    Instructor: <strong style={{ color: '#374151' }}>{notice.creator_name || 'Admin'}</strong>
                    {notice.expires_at && (
                      <span style={{ marginLeft: 12, color: '#d97706' }}>
                        ⏳ Valid until: {formatIST(notice.expires_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Notice body */}
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  <p style={{
                    margin: 0,
                    fontSize: 14.5,
                    lineHeight: 1.65,
                    color: '#374151',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {notice.content}
                  </p>

                  {/* Attachment if present */}
                  {notice.attachment_url && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}>
                      <a
                        href={notice.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 14px',
                          borderRadius: 10,
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          color: '#4338ca',
                          fontWeight: 700,
                          fontSize: 13,
                          textDecoration: 'none'
                        }}
                      >
                        📎 {notice.attachment_name || 'View Attachment'} ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
