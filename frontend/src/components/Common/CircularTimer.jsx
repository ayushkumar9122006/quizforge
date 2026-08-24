export default function CircularTimer({ value, max, size = 48 }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const pct = value / max
  const col = pct > .5 ? '#6366f1' : pct > .25 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
        strokeLinecap="round" className="tring" />
    </svg>
  )
}
