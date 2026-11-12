/*
 * QuiZee service worker: makes the app installable and lets it open offline.
 *
 * - App shell (index.html, hashed /assets/*, icons) is cached.
 * - Page navigations: network first, cached shell when offline.
 * - /assets/* (content-hashed): cache first.
 * - Anything cross-origin (the API, Cloudinary images, fonts) is NOT touched:
 *   scores, questions and answers always come live from the server.
 * Answers typed while offline are kept by the test page itself (localStorage)
 * and synced by its autosave as soon as the connection returns.
 */
const VERSION = 'quizee-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // API, CDN images, fonts: straight to network

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone()
          caches.open(VERSION).then(c => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(VERSION).then(c => c.put(req, copy))
        }
        return res
      }))
    )
  }
})
