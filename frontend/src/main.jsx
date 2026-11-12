import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './styles/app.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)

// Keep the browser's install prompt so the "Install app" button can show it later
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  window.__qfInstallEvent = e
  window.dispatchEvent(new Event('qf-installable'))
})

// Installable app + offline shell (production builds only, so dev hot-reload is unaffected)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker registration failed', err))
  })
}
