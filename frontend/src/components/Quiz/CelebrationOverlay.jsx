import { useEffect, useState } from 'react'

export default function CelebrationOverlay({ result, onDone }) {
  const [countdown, setCountdown] = useState(4)

  useEffect(() => {
    // Optional cheerful chime using browser Web Audio API
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const playTone = (freq, delay, dur) => {
          setTimeout(() => {
            try {
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.type = 'triangle'
              osc.frequency.setValueAtTime(freq, ctx.currentTime)
              gain.gain.setValueAtTime(0.12, ctx.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
              osc.connect(gain)
              gain.connect(ctx.destination)
              osc.start()
              osc.stop(ctx.currentTime + dur)
            } catch {}
          }, delay)
        }
        playTone(523.25, 100, 0.3) // C5
        playTone(659.25, 250, 0.3) // E5
        playTone(783.99, 400, 0.5) // G5
      }
    } catch {}

    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer)
          onDone()
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [onDone])

  const score = result?.score ?? 0
  const totalMarks = result?.total_marks ?? 0
  const pct = totalMarks > 0 ? Math.max(0, Math.round((score / totalMarks) * 100)) : 0
  const rank = result?.rank
  const accuracy = result?.accuracy ?? (result?.attempted_count > 0 ? Math.round((result?.correct_count / result?.attempted_count) * 100) : 0)

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1.5rem',
      overflow: 'hidden'
    }}>
      {/* Falling Confetti Particles */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {Array.from({ length: 36 }).map((_, i) => {
          const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444']
          const color = colors[i % colors.length]
          const left = `${(i * 2.8) % 100}%`
          const animDelay = `${(i * 0.12) % 2}s`
          const animDuration = `${2.2 + (i % 5) * 0.4}s`
          const size = 8 + (i % 8)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: '-20px',
                left,
                width: size,
                height: size * (i % 2 === 0 ? 1 : 1.6),
                background: color,
                borderRadius: i % 3 === 0 ? '50%' : '2px',
                opacity: 0.9,
                animation: `confettiFall ${animDuration} linear infinite`,
                animationDelay: animDelay,
                transform: `rotate(${i * 25}deg)`
              }}
            />
          )
        })}
      </div>

      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
        @keyframes trophyPop {
          0% { transform: scale(0.6) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>

      {/* Celebration Modal Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: 24,
        padding: '2.5rem 2rem',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
        position: 'relative',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        border: '1.5px solid rgba(255, 255, 255, 0.4)'
      }}>
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)',
          animation: 'trophyPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          <span style={{ fontSize: 44 }}>🏆</span>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: '0 0 6px' }}>
          Test Submitted Successfully! 🎉
        </h2>
        <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px', fontWeight: 600 }}>
          Your responses have been securely evaluated and recorded.
        </p>

        {/* Quick Highlights */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 24,
          background: '#f8fafc',
          padding: '12px 10px',
          borderRadius: 16,
          border: '1px solid #e2e8f0'
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>SCORE</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#4f46e5', marginTop: 2 }}>
              {score} <span style={{ fontSize: 12, color: '#94a3b8' }}>/ {totalMarks}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>ACCURACY</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#059669', marginTop: 2 }}>
              {accuracy}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>PERCENT</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#d97706', marginTop: 2 }}>
              {pct}%
            </div>
          </div>
        </div>

        {rank && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 14px',
            borderRadius: 20,
            background: '#e0e7ff',
            color: '#4338ca',
            fontSize: 13,
            fontWeight: 800,
            marginBottom: 20
          }}>
            <span>🎖️</span> Leaderboard Standing: Rank #{rank}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onDone}
            className="btn-pri"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 15,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
            }}
          >
            <span>Skip to Results & Standings</span>
            <span>→</span>
          </button>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            Automatically opening in {countdown}s…
          </div>
        </div>
      </div>
    </div>
  )
}
