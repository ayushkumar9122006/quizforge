/**
 * useQuizzes — fetch and manage quizzes for admin dashboard.
 * Automatically reloads on mount.
 */
import { useState, useEffect, useCallback } from 'react'
import { getMyQuizzes, deleteQuiz, publishQuiz, updateQuiz } from '../services/quizService.js'

export function useQuizzes() {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getMyQuizzes()
      setQuizzes(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = useCallback(async (id) => {
    if (!window.confirm('Delete this quiz? This cannot be undone.')) return
    await deleteQuiz(id)
    setQuizzes(prev => prev.filter(q => q.id !== id))
  }, [])

  const togglePublish = useCallback(async (quiz) => {
    if (quiz.status === 'published') {
      await updateQuiz(quiz.id, { status: 'draft' })
      setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, status: 'draft' } : q))
    } else {
      await publishQuiz(quiz.id)
      setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, status: 'published' } : q))
    }
  }, [])

  return { quizzes, loading, error, reload: load, remove, togglePublish }
}
