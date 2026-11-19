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

// "Sign in with Google": credential = ID token from Google's button
export async function googleLogin({ credential, role = 'student' }) {
  const { data } = await api.post('/auth/google', { credential, role })
  localStorage.setItem('access_token',  data.access_token)
  localStorage.setItem('refresh_token', data.refresh_token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data
}

let googleConfigPromise = null
export function getGoogleConfig() {
  // The client ID comes from the backend (GOOGLE_CLIENT_ID), so only Render needs it;
  // VITE_GOOGLE_CLIENT_ID works too if you prefer setting it on the frontend.
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (envId) return Promise.resolve({ enabled: true, client_id: envId })
  if (!googleConfigPromise) {
    googleConfigPromise = api.get('/auth/google/config')
      .then(r => r.data)
      .catch(() => { googleConfigPromise = null; return { enabled: false } })
  }
  return googleConfigPromise
}

export async function logout(refreshToken) {
  try {
    await api.post('/auth/logout', { refresh_token: refreshToken })
  } catch {}
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
}

export async function sendForgotOtp({ email, role = 'student' }) {
  const { data } = await api.post('/auth/forgot-password/send-otp', { email, role })
  return data
}

export async function verifyForgotOtp({ email, otp, role = 'student' }) {
  const { data } = await api.post('/auth/forgot-password/verify-otp', { email, otp, role })
  return data
}

export async function resetPasswordWithOtp({ email, reset_token, new_password, role = 'student' }) {
  const { data } = await api.post('/auth/forgot-password/reset-password', {
    email,
    reset_token,
    new_password,
    role
  })
  return data
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
