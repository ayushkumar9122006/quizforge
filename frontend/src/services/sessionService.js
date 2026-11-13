import api from './api.js'

export async function createSession(quizId, maxStudents = 100) {
  const { data } = await api.post('/sessions/', { quiz_id: quizId, max_students: maxStudents })
  return data
}

export async function joinSession(roomCode) {
  const { data } = await api.post('/sessions/join', { room_code: roomCode })
  return data
}

export async function startSession(sessionId) {
  const { data } = await api.post(`/sessions/${sessionId}/start`)
  return data
}

export async function submitAttempt(sessionId, answers, timeTakenSec, auto = false) {
  /**
   * answers: array of { question_id, selected_option (0-based or null), time_taken_sec }
   */
  const { data } = await api.post(
    `/sessions/${sessionId}/submit?auto=${auto}`,
    { answers, time_taken_sec: timeTakenSec }
  )
  return data
}

export async function getLeaderboard(sessionId) {
  const { data } = await api.get(`/sessions/${sessionId}/leaderboard`)
  return data
}

export async function getAnalytics(sessionId) {
  const { data } = await api.get(`/sessions/${sessionId}/analytics`)
  return data
}

export async function endSession(sessionId) {
  const { data } = await api.post(`/sessions/${sessionId}/end`)
  return data
}

export async function getMyAttempts() {
  const { data } = await api.get('/sessions/attempts/my')
  return data
}

export async function downloadResponseSheetPdf(attemptId, quizTitle = 'quiz') {
  const response = await api.get(`/sessions/attempts/${attemptId}/response-sheet-pdf`, {
    responseType: 'blob',
  })
  const blob = new Blob([response.data], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeTitle = (quizTitle || 'quiz').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30)
  a.download = `response_sheet_${safeTitle}_${(attemptId || '').slice(0, 8)}.pdf`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    window.URL.revokeObjectURL(url)
    if (a.parentNode) {
      a.parentNode.removeChild(a)
    }
  }, 100)
}
