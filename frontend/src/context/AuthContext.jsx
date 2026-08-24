/**
 * AuthContext — single source of truth for the logged-in user.
 *
 * Provides:
 *   user        — { id, email, name, role } or null
 *   loading     — true while checking stored session
 *   login()     — calls API, stores tokens, sets user
 *   logout()    — revokes token, clears state
 *   register()  — creates account then auto-logs in
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { login as apiLogin, logout as apiLogout, register as apiRegister, getStoredUser, getStoredTokens } from '../services/authService.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)   // checking stored session on mount

  // On mount: restore session from localStorage
  useEffect(() => {
    const stored = getStoredUser()
    const { accessToken } = getStoredTokens()
    if (stored && accessToken) {
      setUser(stored)
    }
    setLoading(false)
  }, [])

  // Listen for force-logout events (fired by api.js interceptor on 401)
  useEffect(() => {
    const handler = () => { setUser(null) }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const login = useCallback(async ({ email, password }) => {
    const data = await apiLogin({ email, password })
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async ({ email, name, password, role }) => {
    await apiRegister({ email, name, password, role })
    const data = await apiLogin({ email, password })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const { refreshToken } = getStoredTokens()
    await apiLogout(refreshToken)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
