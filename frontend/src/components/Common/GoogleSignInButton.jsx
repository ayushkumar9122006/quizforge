/**
 * "Continue with Google" — Google Identity Services button.
 * Renders nothing until the server says Google sign-in is configured.
 * Google's script draws the button and returns a signed ID token (credential);
 * the backend verifies it (POST /auth/google).
 */
import { useEffect, useRef, useState } from 'react'
import { getGoogleConfig } from '../../services/authService.js'

const GSI_SRC = 'https://accounts.google.com/gsi/client'
let gsiPromise = null

function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GSI_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => { gsiPromise = null; reject(new Error('Could not load Google sign-in')) }
      document.head.appendChild(s)
    })
  }
  return gsiPromise
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with', disabled = false }) {
  const box = useRef(null)
  const cb = useRef(onCredential)
  const [state, setState] = useState('loading')      // loading | ready | off | error
  cb.current = onCredential

  useEffect(() => {
    let live = true
    ;(async () => {
      const cfg = await getGoogleConfig()
      if (!live) return
      if (!cfg?.enabled || !cfg.client_id) { setState('off'); return }
      try {
        await loadGsi()
      } catch {
        if (live) setState('error')
        return
      }
      if (!live || !box.current) return
      window.google.accounts.id.initialize({
        client_id: cfg.client_id,
        callback: (resp) => resp?.credential && cb.current?.(resp.credential),
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
      })
      const width = Math.max(220, Math.min(400, Math.round(box.current.getBoundingClientRect().width || 320)))
      box.current.innerHTML = ''
      window.google.accounts.id.renderButton(box.current, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill',
        text, logo_alignment: 'center', width,
      })
      setState('ready')
    })()
    return () => { live = false }
  }, [text])

  if (state === 'off') return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px', color: '#9ca3af', fontSize: 12, fontWeight: 700 }}>
        <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} /> OR <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      </div>
      <div style={{ position: 'relative', minHeight: 44, display: 'flex', justifyContent: 'center', opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
        <div ref={box} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
        {state === 'loading' && <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: '#f3f4f6' }} aria-hidden />}
      </div>
      {state === 'error' && (
        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: '8px 0 0' }}>Google sign-in couldn't load. Check your connection or use email and password.</p>
      )}
    </div>
  )
}
