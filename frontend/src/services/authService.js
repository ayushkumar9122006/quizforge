import api from './api.js'

export async function register({ email, name, password, role = 'student' }) {
  const { data } = await api.post('/auth/register', { email, name, password, role })
  return data
}

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password })
  // Store tokens in localStorage
  localStorage.setItem('access_token',  data.access_token)
  localStorage.setItem('refresh_token', data.refresh_token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data
}

export async function logout(refreshToken) {
  try {
    await api.post('/auth/logout', { refresh_token: refreshToken })
  } catch {}
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function getStoredTokens() {
  return {
    accessToken:  localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
  }
}
