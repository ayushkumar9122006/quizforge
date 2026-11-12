/**
 * Answer payload shared by submit and autosave, plus the reverse mapping used to
 * restore server-autosaved answers (resume on another device).
 *
 * Front-end answers are keyed by question index:
 *   single/match/assertion → option index (number)
 *   multi_correct          → array of option indices
 *   numerical              → string
 */
export function buildAnswerPayload(questions, answers = {}, marked = new Set(), questionTimes = {}) {
  return questions.map((q, i) => {
    const userAns = answers[i]
    let selectedOption = null
    let responseText = null
    if (q.question_type === 'numerical') {
      responseText = userAns !== undefined && userAns !== null ? String(userAns).trim() : null
    } else if (q.question_type === 'multi_correct') {
      responseText = Array.isArray(userAns) ? JSON.stringify(userAns) : (userAns !== undefined && userAns !== null ? String(userAns) : null)
    } else {
      selectedOption = typeof userAns === 'number' ? userAns : null
    }
    return {
      question_id: q.id,
      selected_option: selectedOption,
      response_text: responseText,
      marked_for_review: marked.has(i),
      time_taken_sec: Math.round(questionTimes[i] || 0),
    }
  })
}

/** savedAnswers (server rows) → { answers, marked, qTimes } keyed by question index. */
export function restoreSavedAnswers(questions, savedAnswers = []) {
  const byId = Object.fromEntries((savedAnswers || []).map(a => [a.question_id, a]))
  const answers = {}
  const marked = new Set()
  const qTimes = {}
  questions.forEach((q, i) => {
    const a = byId[q.id]
    if (!a) return
    if (q.question_type === 'numerical') {
      if (a.response_text != null && String(a.response_text).trim() !== '') answers[i] = String(a.response_text)
    } else if (q.question_type === 'multi_correct') {
      try {
        const arr = JSON.parse(a.response_text || '[]')
        if (Array.isArray(arr) && arr.length) answers[i] = arr
      } catch { /* ignore */ }
    } else if (a.selected_option !== null && a.selected_option !== undefined) {
      answers[i] = a.selected_option
    }
    if (a.marked_for_review) marked.add(i)
    if (a.time_taken_sec) qTimes[i] = a.time_taken_sec
  })
  return { answers, marked, qTimes }
}
