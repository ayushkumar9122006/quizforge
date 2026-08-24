/**
 * Quiz API calls — replaces localStorage quiz storage.
 * All calls go to FastAPI backend.
 */
import api from './api.js'

export async function createQuiz(quizData) {
  const { data } = await api.post('/quizzes/', quizData)
  return data
}

export async function getMyQuizzes() {
  const { data } = await api.get('/quizzes/my')
  return data
}

export async function getPublishedQuizzes() {
  const { data } = await api.get('/quizzes/published')
  return data
}

export async function getQuiz(quizId) {
  const { data } = await api.get(`/quizzes/${quizId}`)
  return data
}

export async function updateQuiz(quizId, updates) {
  const { data } = await api.patch(`/quizzes/${quizId}`, updates)
  return data
}

export async function publishQuiz(quizId) {
  const { data } = await api.post(`/quizzes/${quizId}/publish`)
  return data
}

export async function deleteQuiz(quizId) {
  await api.delete(`/quizzes/${quizId}`)
}

// Convert frontend quiz format → backend API format
export function toApiFormat(frontendQuiz, timePerQMin = 5) {
  return {
    title:          frontendQuiz.title || 'Untitled Quiz',
    description:    frontendQuiz.description || null,
    time_per_q_sec: (timePerQMin || 5) * 60,
    is_public:      false,
    tags:           Array.isArray(frontendQuiz.tags) ? frontendQuiz.tags : (typeof frontendQuiz.tags === 'string' && frontendQuiz.tags.trim() ? frontendQuiz.tags.split(',').map(t => t.trim()) : null),
    subject:        frontendQuiz.subject || null,
    difficulty:     frontendQuiz.difficulty || null,
    questions: (frontendQuiz.questions || []).map((q, i) => ({
      order_index:    i,
      section:        q.section || 'General',
      text:           q.text || '',
      question_image: q.qImage || null,
      content_type:   q.qImage ? (q.text ? 'both' : 'image') : 'text',
      correct_answer: q.correct ?? null,
      explanation:    q.explanation || null,
      marks:          q.marks || 1,
      diagram:        q.diagram || null,
      options: (q.options || []).map((opt, j) => {
        const isImg = opt && typeof opt === 'object' && opt.type === 'image'
        return {
          order_index:  j,
          text:         isImg ? '' : (opt || ''),
          image:        isImg ? opt.src : null,
          content_type: isImg ? 'image' : 'text',
        }
      }),
    })),
  }
}

// Convert backend API format → frontend format
export function fromApiFormat(apiQuiz) {
  return {
    id:          apiQuiz.id,
    title:       apiQuiz.title,
    description: apiQuiz.description,
    published:   apiQuiz.status === 'published',
    timePerQ:    apiQuiz.time_per_q_sec,
    createdAt:   apiQuiz.created_at,
    questions: (apiQuiz.questions || []).map(q => ({
      id:          q.id,
      text:        q.text,
      qImage:      q.question_image,
      section:     q.section,
      correct:     q.correct_answer,
      explanation: q.explanation,
      marks:       q.marks,
      diagram:     q.diagram,
      options: (q.options || [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(opt =>
          opt.content_type === 'image'
            ? { type: 'image', src: opt.image }
            : opt.text
        ),
    })),
  }
}
