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

export async function uploadSolutionPdf(quizId, file) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post(`/quizzes/${quizId}/solution-pdf`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteSolutionPdf(quizId) {
  const { data } = await api.delete(`/quizzes/${quizId}/solution-pdf`)
  return data
}

export async function viewSolutionPdf(quizId) {
  const response = await api.get(`/quizzes/${quizId}/solution-pdf`, {
    responseType: 'blob',
  })
  const blob = new Blob([response.data], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  window.open(url, '_blank')
}

// Convert frontend quiz format → backend API format
export function toApiFormat(frontendQuiz, totalDurationMin = null, fallbackTimePerQMin = 5) {
  const numQuestions = (frontendQuiz.questions || []).length || 1
  let totMin = totalDurationMin !== null
    ? totalDurationMin
    : (frontendQuiz.total_duration_minutes ?? frontendQuiz.totalDurationMin ?? null)

  let timePerQSec = 300
  if (totMin !== null && totMin !== undefined && !isNaN(Number(totMin))) {
    totMin = Number(Number(totMin).toFixed(2))
    const perQMin = Number((totMin / numQuestions).toFixed(2))
    timePerQSec = Math.round(perQMin * 60)
  } else {
    const perQMin = Number(Number(fallbackTimePerQMin || 5).toFixed(2))
    timePerQSec = Math.round(perQMin * 60)
    totMin = Number((perQMin * numQuestions).toFixed(2))
  }

  return {
    title:             frontendQuiz.title || 'Untitled Quiz',
    description:       frontendQuiz.description || null,
    instructions:      frontendQuiz.instructions || null,
    solution_pdf:      frontendQuiz.solution_pdf || null,
    solution_pdf_name: frontendQuiz.solution_pdf_name || null,
    availability_start: frontendQuiz.availability_start || null,
    availability_end:   frontendQuiz.availability_end || null,
    total_duration_minutes: totMin !== null && !isNaN(totMin) ? Number(Number(totMin).toFixed(2)) : null,
    time_per_q_sec:    timePerQSec,
    is_public:         false,
    tags:              Array.isArray(frontendQuiz.tags) ? frontendQuiz.tags : (typeof frontendQuiz.tags === 'string' && frontendQuiz.tags.trim() ? frontendQuiz.tags.split(',').map(t => t.trim()) : null),
    subject:           frontendQuiz.subject || null,
    difficulty:        frontendQuiz.difficulty || null,
    questions: (frontendQuiz.questions || []).map((q, i) => {
      const pos = q.positive_marks !== undefined ? Number(q.positive_marks) : (q.marks !== undefined ? Number(q.marks) : 1)
      const neg = q.negative_marks !== undefined ? Number(q.negative_marks) : 0
      const qImg = q.question_image || q.qImage || null
      const corr = q.correct_answer !== undefined ? q.correct_answer : (q.correct ?? null)
      return {
        order_index:    i,
        section:        q.section || 'General',
        text:           q.text || '',
        question_image: qImg,
        content_type:   qImg ? (q.text ? 'both' : 'image') : 'text',
        correct_answer: corr,
        raw_answer:     q.raw_answer || null,
        question_type:  q.question_type || 'single_correct',
        match_data:     q.match_data || null,
        explanation:    q.explanation || (q.source_page ? `PDF Page ${q.source_page}` : null),
        marks:          pos,
        positive_marks: pos,
        negative_marks: neg,
        diagram:        q.diagram || null,
        options: (q.options || []).map((opt, j) => {
          const isImg = opt && typeof opt === 'object' && opt.type === 'image'
          const optText = isImg ? '' : (typeof opt === 'string' ? opt : (opt?.text || ''))
          const optImg = isImg ? opt.src : (opt?.image || null)
          return {
            order_index:  j,
            text:         optText,
            image:        optImg,
            content_type: (isImg || optImg) ? 'image' : 'text',
          }
        }),
      }
    }),
  }
}

export function sortQuestionsBySection(questionsList) {
  if (!questionsList || questionsList.length <= 1) return questionsList || []

  // Extract distinct sections in their order of appearance
  const seenSections = []
  questionsList.forEach(q => {
    const s = q.section || 'General'
    if (!seenSections.includes(s)) seenSections.push(s)
  })

  // Natural comparator for section names, e.g. "Section A" < "Section B"
  const sectionRank = (sec) => {
    const m = String(sec).match(/^section\s*([a-z0-9]+)/i)
    if (m) {
      const code = m[1].toUpperCase()
      if (code.length === 1 && code >= 'A' && code <= 'Z') {
        return code.charCodeAt(0) - 65
      }
      const num = parseInt(code, 10)
      if (!isNaN(num)) return num
    }
    return 1000 + seenSections.indexOf(sec)
  }

  const sortedSections = [...seenSections].sort((a, b) => {
    const rankA = sectionRank(a)
    const rankB = sectionRank(b)
    if (rankA !== rankB) return rankA - rankB
    return seenSections.indexOf(a) - seenSections.indexOf(b)
  })

  // Group questions by section, preserving original relative order
  const grouped = {}
  sortedSections.forEach(s => { grouped[s] = [] })
  questionsList.forEach(q => {
    const s = q.section || 'General'
    if (!grouped[s]) grouped[s] = []
    grouped[s].push(q)
  })

  const sorted = []
  sortedSections.forEach(s => {
    if (grouped[s]) sorted.push(...grouped[s])
  })
  return sorted
}

// Convert backend API format → frontend format
export function fromApiFormat(apiQuiz) {
  return {
    id:                apiQuiz.id,
    title:             apiQuiz.title,
    description:       apiQuiz.description,
    instructions:      apiQuiz.instructions,
    solution_pdf:      apiQuiz.solution_pdf,
    solution_pdf_name: apiQuiz.solution_pdf_name,
    has_solution_pdf:  Boolean(apiQuiz.solution_pdf),
    availability_start: apiQuiz.availability_start,
    availability_end:   apiQuiz.availability_end,
    published:         apiQuiz.status === 'published',
    timePerQ:          apiQuiz.time_per_q_sec,
    createdAt:         apiQuiz.created_at,
    questions: sortQuestionsBySection((apiQuiz.questions || []).map(q => ({
      id:             q.id,
      text:           q.text,
      qImage:         q.question_image,
      section:        q.section || 'General',
      correct:        q.correct_answer,
      explanation:    q.explanation,
      marks:          q.positive_marks !== undefined ? q.positive_marks : (q.marks || 1),
      positive_marks: q.positive_marks !== undefined ? q.positive_marks : (q.marks || 1),
      negative_marks: q.negative_marks !== undefined ? q.negative_marks : 0,
      diagram:        q.diagram,
      question_type:  q.question_type || 'single_correct',
      raw_answer:     q.raw_answer || null,
      match_data:     q.match_data || null,
      options: (q.options || [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(opt =>
          opt.content_type === 'image'
            ? { type: 'image', src: opt.image }
            : opt.text
        ),
    }))),
  }
}

// ── Bulk Import API ──────────────────────────────────────────────────────────

export async function analyzePdfForImport(file, { defaultPosMarks = 4, defaultNegMarks = 1, defaultSection = 'General' } = {}) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('default_pos_marks', defaultPosMarks)
  formData.append('default_neg_marks', defaultNegMarks)
  formData.append('default_section', defaultSection)

  const { data } = await api.post('/quizzes/import/analyze-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 2 minutes for processing large PDFs
  })
  return data
}

export async function confirmBulkImport(quizId, questions) {
  const payload = {
    questions: questions.map((q, i) => {
      const pos = q.positive_marks !== undefined ? Number(q.positive_marks) : 4
      const neg = q.negative_marks !== undefined ? Number(q.negative_marks) : 0
      return {
        order_index: i,
        section: q.section || 'General',
        text: q.text || '',
        question_image: q.question_image || q.qImage || null,
        content_type: (q.question_image || q.qImage) ? (q.text ? 'both' : 'image') : 'text',
        correct_answer: q.correct_answer ?? q.correct ?? null,
        raw_answer: q.raw_answer || null,
        question_type: q.question_type || 'single_correct',
        match_data: q.match_data || null,
        explanation: q.explanation || (q.source_page ? `PDF Page ${q.source_page}` : null),
        marks: pos,
        positive_marks: pos,
        negative_marks: neg,
        diagram: q.diagram || null,
        options: (q.options || []).map((opt, j) => {
          const isImg = opt && typeof opt === 'object' && opt.type === 'image'
          return {
            order_index: j,
            text: isImg ? '' : (typeof opt === 'string' ? opt : (opt.text || '')),
            image: isImg ? opt.src : (opt.image || null),
            content_type: (isImg || opt.image) ? 'image' : 'text',
          }
        }),
      }
    }),
  }
  const { data } = await api.post(`/quizzes/${quizId}/import/confirm`, payload)
  return data
}

export async function startQuizAttempt(quizId) {
  const { data } = await api.post(`/quizzes/${quizId}/start-attempt`)
  return data
}

export async function updateQuizAvailability(quizId, startOrObj, maybeEnd) {
  let availability_start = null
  let availability_end = null
  if (typeof startOrObj === 'object' && startOrObj !== null) {
    availability_start = startOrObj.availability_start
    availability_end = startOrObj.availability_end
  } else {
    availability_start = startOrObj
    availability_end = maybeEnd
  }
  const { data } = await api.patch(`/quizzes/${quizId}/availability`, {
    availability_start,
    availability_end,
  })
  return data
}



