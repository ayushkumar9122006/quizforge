/**
 * Mistake notebook + weak-chapter practice API.
 */
import api from './api.js'

export async function getNotebook() {
  const { data } = await api.get('/mistakes')
  return data
}

export async function getDueMistakes({ chapter = null, includeUpcoming = false, limit = 30 } = {}) {
  const params = { limit, include_upcoming: includeUpcoming }
  if (chapter) params.chapter = chapter
  const { data } = await api.get('/mistakes/due', { params })
  return data
}

export async function answerMistake(itemId, answer) {
  const { data } = await api.post(`/mistakes/${itemId}/answer`, answer)
  return data
}

export async function createWeakChapterPractice() {
  const { data } = await api.post('/practice/weak-chapters', null, { timeout: 60000 })
  return data
}

export async function listPracticeSets() {
  const { data } = await api.get('/practice')
  return data
}

export async function getPracticeSet(setId) {
  const { data } = await api.get(`/practice/${setId}`)
  return data
}

export async function answerPractice(setId, questionId, answer) {
  const { data } = await api.post(`/practice/${setId}/answer`, { question_id: questionId, ...answer })
  return data
}
