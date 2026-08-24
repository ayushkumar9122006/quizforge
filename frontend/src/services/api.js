/**
 * Axios instance with:
 *  - base URL from env
 *  - JWT Authorization header injected automatically
 *  - 401 → auto refresh token → retry original request
 *  - 401 on refresh → force logout
 */
import axios from 'axios'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '')

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach access token ──────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// ── Response interceptor: handle 401 → refresh ───────────────────────────────
let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve(token))
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    // Only handle 401 that isn't already a retry or a login/refresh request
    if (
      err.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          original.headers['Authorization'] = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) {
        isRefreshing = false
        forceLogout()
        return Promise.reject(err)
      }

      try {
        const { data } = await axios.post(`${BACKEND_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        api.defaults.headers['Authorization'] = `Bearer ${data.access_token}`
        processQueue(null, data.access_token)
        original.headers['Authorization'] = `Bearer ${data.access_token}`
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        forceLogout()
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  }
)

function forceLogout() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  // Trigger a full page reload so AuthContext re-reads localStorage
  window.dispatchEvent(new Event('auth:logout'))
}

export default api
