/**
 * Progress analytics + chapter tagging API.
 */
import api from './api.js'

let syllabusCache = null

export async function getSyllabus() {
  if (syllabusCache) return syllabusCache
  const { data } = await api.get('/progress/syllabus')
  syllabusCache = data
  return data
}

export async function getMyProgress() {
  const { data } = await api.get('/progress/me')
  return data
}

export async function getAttemptReport(attemptId) {
  const { data } = await api.get(`/progress/attempts/${attemptId}/report`)
  return data
}

export async function getStudentsProgress() {
  const { data } = await api.get('/progress/students')
  return data
}

export async function getStudentProgress(studentId) {
  const { data } = await api.get(`/progress/students/${studentId}`)
  return data
}

export async function getBatchInsights() {
  const { data } = await api.get('/progress/batch')
  return data
}

/** items: [{ key, text, subject }] → [{ key, subject, chapter, source, confidence }] */
export async function suggestChapters(items, useAi = true) {
  const out = []
  // backend caps a request at 60 items
  for (let i = 0; i < items.length; i += 40) {
    const { data } = await api.post('/progress/chapters/suggest', { items: items.slice(i, i + 40), use_ai: useAi }, { timeout: 120000 })
    out.push(...data)
  }
  return out
}

export async function saveQuizChapters(quizId, updates) {
  const { data } = await api.put(`/quizzes/${quizId}/chapters`, { updates })
  return data
}

export async function autoTagQuiz(quizId, overwriteSuggestions = false) {
  const { data } = await api.post(`/quizzes/${quizId}/chapters/auto-tag?overwrite_suggestions=${overwriteSuggestions}`, null, { timeout: 180000 })
  return data
}

export function questionTextForTagging(q) {
  const opts = (q.options || []).map(o => (typeof o === 'string' ? o : (o?.text || ''))).filter(Boolean)
  return [q.text || '', ...opts].join('\n').trim()
}

export const SUBJECT_COLORS = {
  Physics: '#2563eb',
  Chemistry: '#059669',
  Mathematics: '#d97706',
  Other: '#64748b',
}

export function inferSubjectFromSection(section) {
  const s = String(section || '').toLowerCase()
  if (/\bphy/.test(s)) return 'Physics'
  if (/\bchem/.test(s)) return 'Chemistry'
  if (/\bmath/.test(s)) return 'Mathematics'
  return null
}

// ── Target tracker ────────────────────────────────────────────────────────────
export async function getTarget() {
  const { data } = await api.get('/progress/target')
  return data
}

export async function setTarget(targetMarks) {
  const { data } = await api.put('/progress/target', { target_marks: targetMarks || null })
  return data
}
