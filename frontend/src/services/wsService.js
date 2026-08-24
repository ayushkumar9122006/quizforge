/**
 * WebSocket service — thin wrapper around native WebSocket.
 *
 * Features:
 *  - Auth token injected as query param (browser WS can't set headers)
 *  - Auto-reconnect with exponential backoff (max 5 retries)
 *  - On an auth failure (expired access token) it refreshes the token
 *    before reconnecting, mirroring the REST 401→refresh flow in api.js
 *  - Event listener pattern: on(type, handler) / off(type, handler)
 *  - send(type, payload) helper
 */

const HTTP_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '')

const BACKEND_URL = HTTP_BACKEND_URL
  .replace(/^http/, 'ws')   // http://... → ws://...  |  https://... → wss://...

// WS close codes the backend uses for an invalid/expired access token
// (see backend/routers/ws.py) — worth a refresh attempt before giving up.
const AUTH_CLOSE_CODES = new Set([4001, 4002])

class WsService {
  constructor() {
    this.ws           = null
    this.roomCode     = null
    this.listeners    = {}       // type → Set of handlers
    this.retries      = 0
    this.maxRetries   = 5
    this.retryDelay   = 1500     // ms, doubles each retry
    this.shouldReconnect = false
    this._pingInterval = null
  }

  // ── Connect ────────────────────────────────────────────────────────────────
  connect(roomCode) {
    const token = localStorage.getItem('access_token')
    if (!token) { console.warn('[WS] No access token'); return }

    this.roomCode        = roomCode
    this.shouldReconnect = true
    this._open(token)
  }

  _open(token) {
    const url = `${BACKEND_URL}/ws/${this.roomCode}?token=${token}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.retries    = 0
      this.retryDelay = 1500
      this._emit('ws:connected', {})
      // Keep-alive ping every 25s
      this._pingInterval = setInterval(() => this.send('ping', {}), 25000)
    }

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        this._emit(event.type, event)
      } catch {}
    }

    this.ws.onerror = (e) => {
      console.warn('[WS] Error', e)
      this._emit('ws:error', { message: 'WebSocket error' })
    }

    this.ws.onclose = (e) => {
      clearInterval(this._pingInterval)
      this._emit('ws:disconnected', { code: e.code })
      if (this.shouldReconnect && this.retries < this.maxRetries) {
        this.retries++
        const delay = this.retryDelay * this.retries
        setTimeout(async () => {
          if (!this.shouldReconnect) return
          let t = localStorage.getItem('access_token')
          if (AUTH_CLOSE_CODES.has(e.code)) {
            // The access token was rejected — refresh it before retrying,
            // otherwise every retry fails with the same stale token.
            t = await this._refreshToken()
          }
          if (t) this._open(t)
        }, delay)
      }
    }
  }

  // ── Token refresh (used when the socket is closed for an auth reason) ──────
  async _refreshToken() {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return null
    try {
      const res = await fetch(`${HTTP_BACKEND_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return null
      const data = await res.json()
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      return data.access_token
    } catch (err) {
      console.warn('[WS] Token refresh failed', err)
      return null
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  disconnect() {
    this.shouldReconnect = false
    clearInterval(this._pingInterval)
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }))
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  on(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = new Set()
    this.listeners[type].add(handler)
  }

  off(type, handler) {
    this.listeners[type]?.delete(handler)
  }

  _emit(type, data) {
    this.listeners[type]?.forEach(fn => {
      try { fn(data) } catch (e) { console.error('[WS] Handler error', e) }
    })
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton — one WS connection per browser tab
const wsService = new WsService()
export default wsService
