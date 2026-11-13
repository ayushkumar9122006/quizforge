import api from './api.js'

/**
 * Notice Board API Service
 */

export async function getUnreadNoticeCount() {
  const res = await api.get('/notices/unread-count')
  return res.data.unread_count
}

export async function markNoticesRead(noticeIds = null) {
  const payload = noticeIds ? { notice_ids: noticeIds } : null
  const res = await api.post('/notices/mark-read', payload)
  return res.data
}

export async function getStudentNotices() {
  const res = await api.get('/notices/')
  return res.data
}

export async function getAdminNotices() {
  const res = await api.get('/notices/admin')
  return res.data
}

export async function createNotice(noticeData) {
  const res = await api.post('/notices/', noticeData)
  return res.data
}

export async function updateNotice(noticeId, updateData) {
  const res = await api.patch(`/notices/${noticeId}`, updateData)
  return res.data
}

export async function deleteNotice(noticeId) {
  await api.delete(`/notices/${noticeId}`)
}
