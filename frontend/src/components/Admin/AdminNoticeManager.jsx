import { useState, useEffect } from 'react'
import {
  getAdminNotices,
  createNotice,
  updateNotice,
  deleteNotice
} from '../../services/noticeService.js'

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

export default function AdminNoticeManager({ onBack }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Editor modal state
  const [showModal, setShowModal] = useState(false)
  const [editingNotice, setEditingNotice] = useState(null)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formPriority, setFormPriority] = useState('medium')
  const [formPinned, setFormPinned] = useState(false)
  const [formActive, setFormActive] = useState(true)
  const [formAttachmentUrl, setFormAttachmentUrl] = useState('')
  const [formAttachmentName, setFormAttachmentName] = useState('')
  const [formExpiresAt, setFormExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const loadNotices = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getAdminNotices()
      setNotices(data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load notices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotices()
  }, [])

  const handleOpenCreate = () => {
    setEditingNotice(null)
    setFormTitle('')
    setFormContent('')
    setFormPriority('medium')
    setFormPinned(false)
    setFormActive(true)
    setFormAttachmentUrl('')
    setFormAttachmentName('')
    setFormExpiresAt('')
    setFormError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (notice) => {
    setEditingNotice(notice)
    setFormTitle(notice.title)
    setFormContent(notice.content)
    setFormPriority(notice.priority || 'medium')
    setFormPinned(!!notice.pinned)
    setFormActive(!!notice.is_active)
    setFormAttachmentUrl(notice.attachment_url || '')
    setFormAttachmentName(notice.attachment_name || '')
    setFormExpiresAt(notice.expires_at ? notice.expires_at.slice(0, 16) : '')
    setFormError(null)
    setShowModal(true)
  }

  const handleSaveNotice = async (e) => {
    e.preventDefault()
    if (!formTitle.trim()) {
      setFormError('Title is required')
      return
    }
    if (!formContent.trim()) {
      setFormError('Content is required')
      return
    }

    try {
      setSaving(true)
      setFormError(null)

      const payload = {
        title: formTitle.trim(),
        content: formContent.trim(),
        priority: formPriority,
        pinned: formPinned,
        is_active: formActive,
        attachment_url: formAttachmentUrl.trim() || null,
        attachment_name: formAttachmentName.trim() || null,
        expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
      }

      if (editingNotice) {
        await updateNotice(editingNotice.id, payload)
      } else {
        await createNotice(payload)
      }

      setShowModal(false)
      await loadNotices()
    } catch (err) {
      setFormError(err?.response?.data?.detail || 'Failed to save notice')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (noticeId) => {
    if (!window.confirm('Are you sure you want to delete this notice?')) return
    try {
      await deleteNotice(noticeId)
      await loadNotices()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete notice')
    }
  }

  const handleToggleActive = async (notice) => {
    try {
      await updateNotice(notice.id, { is_active: !notice.is_active })
      await loadNotices()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to update notice status')
    }
  }

  const handleTogglePinned = async (notice) => {
    try {
      await updateNotice(notice.id, { pinned: !notice.pinned })
      await loadNotices()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to update pinned status')
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px', color: '#111827' }}>
            📢 Notice Board Management
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Publish updates, exam alerts, and manage student announcements
          </p>
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          {onBack && (
            <button className="btn-sec" onClick={onBack}>
              ← Back to Dashboard
            </button>
          )}
          <button
            className="btn-pri"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleOpenCreate}
          >
            + Create Notice
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>
          Loading notices…
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: 14, color: '#dc2626' }}>
          ⚠ {error} — <button onClick={loadNotices} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', textDecoration: 'underline', fontSize: 14, fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {!loading && !error && notices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: 20, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>📢</div>
          <p style={{ fontWeight: 800, fontSize: 18, margin: '0 0 6px', color: '#111827' }}>No notices created yet</p>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>Publish your first announcement for students.</p>
          <button className="btn-pri" onClick={handleOpenCreate}>+ Create First Notice</button>
        </div>
      )}

      {/* Notice list */}
      {!loading && (
        <div style={{ display: 'grid', gap: 14 }}>
          {notices.map(notice => (
            <div
              key={notice.id}
              style={{
                background: '#fff',
                borderRadius: 16,
                border: notice.pinned ? '2px solid #c7d2fe' : '1.5px solid #e2e8f0',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {notice.pinned && (
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800, background: '#ede9fe', color: '#6366f1', border: '1px solid #c7d2fe' }}>
                      📌 PINNED
                    </span>
                  )}
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 800,
                    background: notice.priority === 'urgent' ? '#fee2e2' : notice.priority === 'high' ? '#fef3c7' : '#eff6ff',
                    color: notice.priority === 'urgent' ? '#dc2626' : notice.priority === 'high' ? '#d97706' : '#2563eb'
                  }}>
                    {notice.priority?.toUpperCase()}
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 800,
                    background: notice.is_active ? '#dcfce7' : '#f1f5f9',
                    color: notice.is_active ? '#15803d' : '#64748b'
                  }}>
                    {notice.is_active ? 'PUBLISHED' : 'DRAFT / HIDDEN'}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {formatIST(notice.created_at)}
                </div>
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: '#111827' }}>
                {notice.title}
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#4b5563', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {notice.content}
              </p>

              {notice.attachment_url && (
                <div style={{ marginBottom: 12, fontSize: 12 }}>
                  📎 <a href={notice.attachment_url} target="_blank" rel="noopener noreferrer" style={{ color: '#4338ca', fontWeight: 600 }}>
                    {notice.attachment_name || notice.attachment_url}
                  </a>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => handleToggleActive(notice)}
                >
                  {notice.is_active ? 'Hide (Unpublish)' : 'Publish'}
                </button>

                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => handleTogglePinned(notice)}
                >
                  {notice.pinned ? 'Unpin' : 'Pin to Top'}
                </button>

                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => handleOpenEdit(notice)}
                >
                  Edit
                </button>

                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '4px 10px', color: '#dc2626' }}
                  onClick={() => handleDelete(notice.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notice Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,25,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '2rem', maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 800, color: '#111827' }}>
              {editingNotice ? 'Edit Notice' : 'Create New Notice'}
            </h3>

            {formError && (
              <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626', marginBottom: 14 }}>
                ⚠ {formError}
              </div>
            )}

            <form onSubmit={handleSaveNotice}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                  Notice Title *
                </label>
                <input
                  type="text"
                  className="inp"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Mid-Term Examination Schedule"
                  required
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                  Content / Announcement Details *
                </label>
                <textarea
                  className="inp"
                  rows={4}
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  placeholder="Enter notice text here..."
                  required
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    Priority
                  </label>
                  <select
                    className="inp"
                    value={formPriority}
                    onChange={e => setFormPriority(e.target.value)}
                  >
                    <option value="low">Low (Info)</option>
                    <option value="medium">Medium (Regular)</option>
                    <option value="high">High (Important)</option>
                    <option value="urgent">Urgent (Immediate Attention)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    Expires At (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    className="inp"
                    value={formExpiresAt}
                    onChange={e => setFormExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                  Attachment Link (Optional URL)
                </label>
                <input
                  type="url"
                  className="inp"
                  value={formAttachmentUrl}
                  onChange={e => setFormAttachmentUrl(e.target.value)}
                  placeholder="https://example.com/schedule.pdf"
                />
              </div>

              {formAttachmentUrl && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    Attachment Label
                  </label>
                  <input
                    type="text"
                    className="inp"
                    value={formAttachmentName}
                    onChange={e => setFormAttachmentName(e.target.value)}
                    placeholder="e.g. Download Exam Schedule PDF"
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formPinned}
                    onChange={e => setFormPinned(e.target.checked)}
                  />
                  📌 Pin to Top
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={e => setFormActive(e.target.checked)}
                  />
                  Publish Immediately
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn-sec"
                  style={{ flex: 1 }}
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pri"
                  style={{ flex: 1.5, fontWeight: 800 }}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : editingNotice ? 'Update Notice' : 'Publish Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
