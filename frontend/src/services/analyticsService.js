import api from './api.js'

export async function getSessionAnalytics(sessionId) {
  const { data } = await api.get(`/sessions/${sessionId}/analytics`)
  return data
}

export async function getQuizAnalytics(quizId) {
  const { data } = await api.get(`/quizzes/${quizId}/analytics`)
  return data
}
