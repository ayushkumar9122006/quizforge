/**
 * useAttempts — manages student attempt history.
 * Persists to localStorage so history survives page refresh.
 */
import { useState, useEffect } from 'react'

const KEY = 'qf_attempts_v2'

export function useAttempts() {
  const [attempts, setAttempts] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(attempts)) } catch {}
  }, [attempts])

  const addAttempt = (attempt) => setAttempts(prev => [...prev, attempt])
  const deleteAttempt = (id) => setAttempts(prev => prev.filter(a => a.id !== id))
  const clearAll = () => setAttempts([])

  return { attempts, setAttempts, addAttempt, deleteAttempt, clearAll }
}
