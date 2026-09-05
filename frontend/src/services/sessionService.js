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
