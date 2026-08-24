import { useState, useEffect } from 'react'
import { getPublishedQuizzes, fromApiFormat } from '../services/quizService.js'

export function usePublishedQuizzes() {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getPublishedQuizzes()
      .then(data => setQuizzes(data.map(fromApiFormat)))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load quizzes'))
      .finally(() => setLoading(false))
  }, [])

  return { quizzes, loading, error }
}
