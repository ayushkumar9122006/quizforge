/**
 * "Install app" button: Android/desktop Chrome use the browser's install prompt;
 * iPhone/iPad show the Share → Add to Home Screen tip. Hidden once installed.
 */
import { useEffect, useState } from 'react'
import { isIOS, isStandalone } from '../../services/fullscreen.js'

export default function InstallAppButton({ style }) {
  const [evt, setEvt] = useState(() => window.__qfInstallEvent || null)
  const [tip, setTip] = useState(false)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const onAvail = () => setEvt(window.__qfInstallEvent || null)
    const onInstalled = () => { setInstalled(true); setEvt(null) }
    window.addEventListener('qf-installable', onAvail)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('qf-installable', onAvail); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (installed || (!evt && !isIOS())) return null

  const click = async () => {
    if (evt) {
      evt.prompt()
      const choice = await evt.userChoice.catch(() => null)
      if (choice?.outcome === 'accepted') setInstalled(true)
      window.__qfInstallEvent = null
      setEvt(null)
    } else {
      setTip(true)
    }
  }

  return (
    <>
      <button className="btn-sec" onClick={click} style={{ display: 'flex', alignItems: 'center', gap: 6, ...style }} title="Install QuiZee on this device">
        📲 Install app
      </button>
      {tip && (
        <div role="dialog" aria-modal="true" onClick={() => setTip(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,25,.55)', zIndex: 9600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: '1.3rem', maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800 }}>Install QuiZee on your iPhone / iPad</h3>
            <ol style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
              <li>Tap the <b>Share</b> button (square with an arrow) in Safari.</li>
              <li>Choose <b>Add to Home Screen</b>.</li>
              <li>Open QuiZee from your home screen. It runs without the browser bars.</li>
            </ol>
            <button className="btn-pri" style={{ width: '100%' }} onClick={() => setTip(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
