import api from './api.js'

const expCache = {}

export async function getExplanation(question) {
  const key = question.id
  if (expCache[key]) return expCache[key]

  // Use local explanation if present
  if (question.explanation?.trim()) {
    expCache[key] = question.explanation
    return question.explanation
  }

  try {
    const { data } = await api.post('/llm/explain', { question_id: question.id })
    const txt = data.explanation || `Correct answer: ${question.options[question.correct]}.`
    expCache[key] = txt
    return txt
  } catch {
    const correctOpt = question.options?.[question.correct]
    const correctText = correctOpt && typeof correctOpt === 'object' && correctOpt.type === 'image' ? 'the selected image option' : (correctOpt ?? 'unknown')
    const fallback = `Correct answer: ${correctText}.`
    expCache[key] = fallback
    return fallback
  }
}
