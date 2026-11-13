/**
 * In-progress test state saved in the browser, scoped per student AND per quiz,
 * so a refresh, an accidental navigation or a closed tab resumes exactly where
 * the student left off — and a different student on the same computer never
 * sees someone else's answers.
 *
 * The server stays authoritative for the deadline (start-attempt returns it);
 * this only restores answers, position, review marks, per-question time and
 * tab-switch strikes.
 */
const FIELDS = ['deadline', 'answers', 'cur', 'marked', 'qtimes', 'spent', 'tab_switches']

export function attemptKey(userId, quizId, field) {
  return `quizee_attempt_${userId || 'anon'}_${quizId}_${field}`
}

export function readAttempt(userId, quizId, field, fallback = null) {
  try {
    const raw = localStorage.getItem(attemptKey(userId, quizId, field))
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeAttempt(userId, quizId, field, value) {
  try { localStorage.setItem(attemptKey(userId, quizId, field), JSON.stringify(value)) } catch {}
}

export function clearAttempt(userId, quizId) {
  try {
    FIELDS.forEach(f => localStorage.removeItem(attemptKey(userId, quizId, f)))
    // legacy (pre-scoping) keys
    ;['deadline', 'answers', 'tab_switches'].forEach(f => {
      localStorage.removeItem(`quizee_attempt_${quizId}_${f}`)
      sessionStorage.removeItem(`quizee_attempt_${quizId}_${f}`)
    })
  } catch {}
}

/** Remaining seconds of an unfinished attempt saved on this device, or 0. */
export function resumableSeconds(userId, quizId) {
  const deadline = Number(readAttempt(userId, quizId, 'deadline', 0))
  if (!deadline) return 0
  return Math.max(0, Math.floor((deadline - Date.now()) / 1000))
}
