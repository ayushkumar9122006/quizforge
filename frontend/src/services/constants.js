export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '')
export const ADMIN_PASS  = 'admin123'  // kept for fallback only
// Legacy keys — still used if running without backend
export const SK_QUIZZES  = 'qf_published_quizzes'
export const SK_ATTEMPTS = 'qf_attempts'
