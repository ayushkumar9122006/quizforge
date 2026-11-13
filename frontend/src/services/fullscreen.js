/**
 * Fullscreen + install helpers for the test page.
 * Feature-detected: iPhone Safari has no element fullscreen, so there the test
 * relies on the installed app (standalone) plus tab-switch detection.
 */
export function fullscreenSupported() {
  const d = document.documentElement
  return Boolean(d.requestFullscreen || d.webkitRequestFullscreen) && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true)
}

export function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement)
}

export function enterFullscreen() {
  if (!fullscreenSupported() || isFullscreen()) return Promise.resolve(isFullscreen())
  const d = document.documentElement
  try {
    const p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen()
    return Promise.resolve(p).then(() => true).catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}

export function exitFullscreen() {
  if (!isFullscreen()) return Promise.resolve()
  try {
    const p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.()
    return Promise.resolve(p).catch(() => {})
  } catch {
    return Promise.resolve()
  }
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
