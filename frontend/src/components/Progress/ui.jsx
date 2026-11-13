/**
 * Small shared building blocks for progress analytics screens.
 */
import { SUBJECT_COLORS } from '../../services/progressService.js'

export const TREND_META = {
  improving:       { label: 'Improving',      icon: '↗', color: '#047857', bg: '#d1fae5' },
  steady:          { label: 'Steady',         icon: '→', color: '#1d4ed8', bg: '#dbeafe' },
  declining:       { label: 'Declining',      icon: '↘', color: '#b91c1c', bg: '#fee2e2' },
  worsening:       { label: 'Worsening',      icon: '↘', color: '#b91c1c', bg: '#fee2e2' },
  not_enough_data: { label: 'Need 2+ tests',  icon: '·', color: '#64748b', bg: '#f1f5f9' },
  too_early:       { label: 'Too early',      icon: '·', color: '#64748b', bg: '#f1f5f9' },
}

export function TrendBadge({ label, size = 12, title }) {
  const m = TREND_META[label] || TREND_META.not_enough_data
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: m.bg, color: m.color, fontWeight: 800, fontSize: size, whiteSpace: 'nowrap' }}>
      <span aria-hidden>{m.icon}</span>{m.label}
    </span>
  )
}

export function SubjectDot({ subject, size = 8 }) {
  return <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: SUBJECT_COLORS[subject] || SUBJECT_COLORS.Other, display: 'inline-block', flexShrink: 0 }} />
}

export function StatCard({ label, value, sub, color = '#111827', accent }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '14px 16px', borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export function Panel({ title, icon, right, children, style }) {
  return (
    <section className="card" style={{ padding: '1.25rem 1.35rem', borderRadius: 18, marginBottom: 18, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon && <span aria-hidden>{icon}</span>}{title}
          </h3>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

/** Horizontal percentage bar with value label. */
export function PctBar({ value = 0, color = '#ef4444', width = 120, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: width }}>
      <div style={{ flex: 1, height: 7, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#334155', minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{label ?? `${Math.round(v)}%`}</span>
    </div>
  )
}

/** Tiny inline line chart for lists. */
export function Sparkline({ values = [], width = 90, height = 26, color = '#6366f1' }) {
  if (!values.length) return <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
  const max = 100, min = 0
  const step = values.length > 1 ? (width - 6) / (values.length - 1) : 0
  const pts = values.map((v, i) => [3 + i * step, height - 3 - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (height - 6)])
  return (
    <svg width={width} height={height} role="img" aria-label={`Scores: ${values.map(v => Math.round(v)).join(', ')}%`}>
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 2.8 : 1.6} fill={color} />)}
    </svg>
  )
}

export function Loading({ text = 'Loading analysis…' }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
      <div style={{ width: 34, height: 34, margin: '0 auto 12px', border: '3px solid #e0e7ff', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'qf-spin 0.8s linear infinite' }} />
      <style>{'@keyframes qf-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{text}</div>
    </div>
  )
}

export function ErrorBox({ text, onRetry }) {
  return (
    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: 14, color: '#b91c1c', marginBottom: 16 }}>
      ⚠ {text}
      {onRetry && <button onClick={onRetry} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#b91c1c', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Retry</button>}
    </div>
  )
}

export function fmtDate(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  } catch { return '' }
}

export function shortTitle(t = '', n = 18) {
  const s = String(t)
  const m = s.match(/(test|mock|paper)\s*#?\s*(\d+)/i)
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export const QTYPE_LABELS = {
  single_correct: 'Single correct MCQ',
  multi_correct: 'Multi correct MCQ',
  numerical: 'Numerical',
  match_column: 'Match the column',
  assertion_reason: 'Assertion–Reason',
}
