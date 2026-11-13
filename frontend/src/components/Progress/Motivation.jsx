/**
 * Streaks & daily goal, badges, most-improved leaderboard.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getStreak, setDailyGoal, getBadges, getMostImproved, getStudentMotivation } from '../../services/progressService.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Panel, Sparkline, fmtDate } from './ui.jsx'

// ── shared hook ───────────────────────────────────────────────────────────────
export function useStreak(enabled = true) {
  const [streak, setStreak] = useState(null)
  const refresh = async () => {
    try { setStreak(await getStreak()) } catch { /* streak is decoration: never block the page */ }
  }
  useEffect(() => { if (enabled) refresh() }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return [streak, refresh, setStreak]
}

// ── "goal done" celebration (plays once per student per day) ─────────────────
const celebratedThisSession = new Set()
const CONFETTI_COLORS = ['#f97316', '#fb923c', '#facc15', '#6366f1', '#10b981', '#ec4899', '#38bdf8']

function alreadyCelebrated(key) {
  if (celebratedThisSession.has(key)) return true
  try { return localStorage.getItem('qf_streak_celebrated') === key } catch { return false }
}
function markCelebrated(key) {
  celebratedThisSession.add(key)
  try { localStorage.setItem('qf_streak_celebrated', key) } catch { /* private mode: the session set still stops repeats */ }
}

export function StreakCelebration({ streak }) {
  const { user } = useAuth() || {}
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [snap, setSnap] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    if (!streak?.today?.met || user?.role === 'admin') return
    const key = `${user?.id || 'me'}:${streak.today.date}`
    if (alreadyCelebrated(key)) return
    markCelebrated(key)
    setSnap(streak)
    setOpen(true)
  }, [streak, user])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') close() }
    window.addEventListener('keydown', onKey)
    timer.current = setTimeout(close, 6500)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer.current) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 240)
  }

  if (!open || !snap) return null
  const n = Math.max(1, snap.current)
  const isBest = n >= (snap.longest || 0) && n > 1
  const week = snap.history.slice(-7)
  const viaTest = snap.today.tests > 0 && snap.today.revised < snap.daily_goal
  const R = 70, LEN = 2 * Math.PI * R
  const confetti = Array.from({ length: 46 }, (_, i) => {
    const a = (i / 46) * Math.PI * 2 + (i % 3) * 0.2
    const dist = 120 + ((i * 37) % 90)
    return {
      '--x': `${Math.cos(a) * dist}px`, '--y': `${Math.sin(a) * dist * 0.8 + 90}px`,
      '--r': `${(i % 2 ? 1 : -1) * (240 + (i * 53) % 360)}deg`, '--d': `${1.1 + (i % 6) * 0.03}s`,
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      width: i % 4 === 0 ? 6 : 8, height: i % 3 === 0 ? 8 : 13, borderRadius: i % 5 === 0 ? '50%' : 2,
    }
  })

  return createPortal(
    <div className={`qf-celebrate-backdrop${closing ? ' closing' : ''}`} onClick={close} role="dialog" aria-modal="true" aria-label={`Daily goal done. ${n}-day streak.`}>
      <div className="qf-celebrate-card" onClick={e => e.stopPropagation()}>
        <div className="qf-ring-wrap">
          <div className="qf-ring-glow" />
          <svg viewBox="0 0 168 168" width="168" height="168" aria-hidden>
            <defs>
              <linearGradient id="qfRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#facc15" /><stop offset="55%" stopColor="#f97316" /><stop offset="100%" stopColor="#ea580c" />
              </linearGradient>
            </defs>
            <circle cx="84" cy="84" r={R} fill="none" stroke="#ffedd5" strokeWidth="10" />
            <circle className="qf-ring-fill" cx="84" cy="84" r={R} fill="none" stroke="url(#qfRing)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={LEN} style={{ '--len': LEN }} />
          </svg>
          <div className="qf-flame" aria-hidden>🔥</div>
          <div className="qf-confetti" aria-hidden>{confetti.map((st, i) => <i key={i} style={st} />)}</div>
        </div>

        <div className="qf-count" aria-hidden>
          <div className="qf-count-roll"><span>{n - 1}</span><span>{n}</span></div>
        </div>
        <div className="qf-pop" style={{ animationDelay: '1.35s' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#7c2d12' }}>{n}-day streak!</div>
          {isBest && <div style={{ display: 'inline-block', marginTop: 6, fontSize: 11.5, fontWeight: 900, color: '#fff', background: 'linear-gradient(135deg,#f97316,#ea580c)', borderRadius: 999, padding: '3px 10px' }}>🏆 New best streak</div>}
          <p style={{ fontSize: 13.5, color: '#78716c', margin: '8px 0 0', lineHeight: 1.45 }}>
            {viaTest ? 'You took a test today, so your streak is safe.' : `Daily goal done: ${snap.today.revised} question${snap.today.revised !== 1 ? 's' : ''} revised.`}
            {' '}See you tomorrow!
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '18px 0 20px' }}>
          {week.map((d, i) => {
            const isToday = i === week.length - 1
            return (
              <div key={d.date} className="qf-day-dot" style={{ animationDelay: isToday ? '1.7s' : `${1.4 + i * 0.04}s`, textAlign: 'center' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                  background: d.met || isToday ? 'linear-gradient(135deg,#fb923c,#f97316)' : '#f1f5f9',
                  color: d.met || isToday ? '#fff' : '#cbd5e1', fontWeight: 900,
                  boxShadow: isToday ? '0 0 0 3px #fed7aa, 0 6px 16px rgba(249,115,22,.45)' : 'none',
                }}>{d.met || isToday ? '✓' : '·'}</div>
                <div style={{ fontSize: 10.5, color: isToday ? '#c2410c' : '#a8a29e', marginTop: 4, fontWeight: isToday ? 900 : 600 }}>{d.weekday[0]}</div>
              </div>
            )
          })}
        </div>

        <button className="btn-pri qf-pop" style={{ animationDelay: '1.6s', width: '100%', background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 10px 24px rgba(234,88,12,.35)' }} onClick={close} autoFocus>
          Keep going
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ── chip (home, notebook, practice) ───────────────────────────────────────────
export function StreakChip({ streak, onClick, compact = false, celebrate = true }) {
  const prev = useRef(null)
  const [bump, setBump] = useState(0)
  const [plus, setPlus] = useState(0)
  useEffect(() => {
    const r = streak?.today?.revised
    if (r == null) return
    if (prev.current != null && r > prev.current) { setBump(b => b + 1); setPlus(r - prev.current) }
    prev.current = r
  }, [streak])
  if (!streak) return null
  const { current, today, daily_goal: goal, at_risk: atRisk } = streak
  const done = Math.min(today.revised, goal)
  const pct = today.met ? 100 : Math.round((100 * done) / goal)
  const bg = today.met ? 'linear-gradient(135deg,#fff7ed,#ffedd5)' : atRisk ? '#fef2f2' : '#f8fafc'
  const border = today.met ? '#fdba74' : atRisk ? '#fecaca' : '#e2e8f0'
  const Tag = onClick ? 'button' : 'div'
  return (
    <>
      <Tag
        key={bump}
        className={bump ? 'qf-chip-bump' : undefined}
        onClick={onClick}
        title={streak.message}
        aria-label={`${current}-day streak. Today ${today.revised} of ${goal} questions revised.`}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10, padding: compact ? '6px 11px' : '8px 14px', borderRadius: 999, background: bg, border: `1px solid ${border}`, cursor: onClick ? 'pointer' : 'default', font: 'inherit' }}
      >
        <span aria-hidden style={{ fontSize: compact ? 16 : 19, filter: current ? 'none' : 'grayscale(1)', opacity: current ? 1 : 0.55 }}>🔥</span>
        <span style={{ fontWeight: 900, fontSize: compact ? 13 : 14, color: current ? '#9a3412' : '#475569', fontVariantNumeric: 'tabular-nums' }}>
          {current ? `${current}-day streak` : 'No streak yet'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: compact ? 44 : 60, height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: today.met ? '#f97316' : '#6366f1', transition: 'width .5s cubic-bezier(.3,1.4,.5,1)' }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: today.met ? '#c2410c' : '#475569', fontVariantNumeric: 'tabular-nums' }}>
            {today.met ? '✓ today' : `${today.revised}/${goal}`}
          </span>
        </span>
        {bump > 0 && plus > 0 && !today.met && <span className="qf-plus-one" aria-hidden>+{plus}</span>}
      </Tag>
      {celebrate && <StreakCelebration streak={streak} />}
    </>
  )
}

// ── streak panel ──────────────────────────────────────────────────────────────
export function StreakPanel({ streak, editable, onChange }) {
  const [saving, setSaving] = useState(false)
  if (!streak) return null
  const { current, longest, today, daily_goal: goal } = streak
  const done = Math.min(today.revised, goal)
  const pct = today.met ? 100 : Math.round((100 * done) / goal)

  const changeGoal = async (g) => {
    setSaving(true)
    try { onChange?.(await setDailyGoal(g)) } finally { setSaving(false) }
  }

  return (
    <>
    {editable && <StreakCelebration streak={streak} />}
    <Panel title="Streak & daily goal" icon="🔥" style={{ marginBottom: 0 }}
      right={editable ? (
        <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          Daily goal
          <select className="inp-sm" value={goal} disabled={saving} onChange={e => changeGoal(Number(e.target.value))} style={{ fontSize: 12, width: 'auto' }}>
            {(streak.goal_choices || [5, 10, 20]).concat(streak.goal_choices?.includes(goal) ? [] : [goal]).sort((a, b) => a - b)
              .map(g => <option key={g} value={g}>{g} questions</option>)}
          </select>
        </label>
      ) : <span style={{ fontSize: 12, color: '#94a3b8' }}>Goal: {goal} questions / day</span>}
    >
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: 92 }}>
          <div style={{ fontSize: 40, lineHeight: 1, filter: current ? 'none' : 'grayscale(1)', opacity: current ? 1 : 0.5 }} aria-hidden>🔥</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: current ? '#c2410c' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>{current}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>day{current !== 1 ? 's' : ''} · best {longest}</div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <b style={{ color: '#1e293b' }}>Today</b>
            <span style={{ color: today.met ? '#c2410c' : '#475569', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {today.revised}/{goal} revised{today.tests ? ` · ${today.tests} test` : ''}{today.met ? ' ✓' : ''}
            </span>
          </div>
          <div style={{ height: 10, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: today.met ? 'linear-gradient(90deg,#fb923c,#f97316)' : '#6366f1', borderRadius: 6 }} />
          </div>
          <p style={{ fontSize: 12.5, color: streak.at_risk ? '#b91c1c' : '#64748b', margin: '8px 0 10px', lineHeight: 1.45 }}>{streak.message}</p>
          <div style={{ display: 'flex', gap: 4 }} aria-label="Last 14 days">
            {streak.history.map(h => (
              <div key={h.date} title={`${fmtDate(h.date)}: ${h.revised} revised${h.tests ? `, ${h.tests} test` : ''}${h.met ? ' ✓' : ''}`}
                style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <div style={{ height: 18, borderRadius: 5, background: h.met ? '#fb923c' : h.revised ? '#fed7aa' : '#f1f5f9', border: h.date === today.date ? '2px solid #6366f1' : '1px solid transparent' }} />
                <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>{h.weekday[0]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '10px 0 0' }}>{streak.rule}</p>
    </Panel>
    </>
  )
}

// ── badges ────────────────────────────────────────────────────────────────────
export function BadgesPanel({ data, compact = false }) {
  const [showAll, setShowAll] = useState(false)
  if (!data) return null
  const earned = data.badges.filter(b => b.earned)
  const locked = data.badges.filter(b => !b.earned)
  const lockedShown = showAll ? locked : locked.slice(0, compact ? 3 : 4)
  return (
    <Panel title="Badges" icon="🏅" right={<span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{data.earned_count} of {data.total} earned</span>}>
      {data.new?.length > 0 && (
        <div style={{ padding: '9px 13px', background: 'linear-gradient(135deg,#fef3c7,#fff7ed)', border: '1px solid #fcd34d', borderRadius: 12, fontSize: 13, color: '#78350f', marginBottom: 12, fontWeight: 700 }}>
          🎉 New: {data.badges.filter(b => b.new).map(b => `${b.icon} ${b.title}`).join(' · ')}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
        {earned.map(b => <BadgeCard key={b.id} b={b} />)}
        {lockedShown.map(b => <BadgeCard key={b.id} b={b} />)}
      </div>
      {locked.length > lockedShown.length && (
        <button className="btn-ghost" style={{ marginTop: 10, fontSize: 13 }} onClick={() => setShowAll(true)}>Show {locked.length - lockedShown.length} more to unlock</button>
      )}
    </Panel>
  )
}

function BadgeCard({ b }) {
  const p = b.progress
  return (
    <div style={{ padding: '11px 12px', borderRadius: 14, border: `1px solid ${b.earned ? '#fcd34d' : '#e2e8f0'}`, background: b.earned ? 'linear-gradient(135deg,#fffbeb,#fff)' : '#f8fafc', position: 'relative' }}>
      {b.new && <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9.5, fontWeight: 900, color: '#fff', background: '#f97316', borderRadius: 6, padding: '1px 6px' }}>NEW</span>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span aria-hidden style={{ fontSize: 26, lineHeight: 1, filter: b.earned ? 'none' : 'grayscale(1)', opacity: b.earned ? 1 : 0.45 }}>{b.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: b.earned ? '#78350f' : '#475569' }}>{b.title}</div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{b.earned && b.detail ? b.detail : b.description}</div>
          {b.earned && b.earned_at && <div style={{ fontSize: 11, color: '#a16207', marginTop: 3 }}>Earned {fmtDate(b.earned_at)}</div>}
          {!b.earned && b.detail && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{b.detail}</div>}
        </div>
      </div>
      {!b.earned && p && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
          <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${p.pct}%`, height: '100%', background: '#94a3b8' }} />
          </div>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.current}/{p.goal}</span>
        </div>
      )}
    </div>
  )
}

// ── most improved ─────────────────────────────────────────────────────────────
export function MostImprovedPanel({ data, adminView = false, onOpenStudent }) {
  if (!data) return null
  const unit = data.metric === 'percentile' ? 'percentile' : 'score %'
  const rows = data.entries || []
  const meOutside = !adminView && data.me && !rows.some(r => r.is_me)
  const Row = ({ r }) => {
    const up = r.change > 0, down = r.change < 0
    return (
      <tr style={{ borderTop: '1px solid #f1f5f9', background: r.is_me ? '#eef2ff' : undefined, cursor: adminView && onOpenStudent ? 'pointer' : 'default' }}
        onClick={() => adminView && onOpenStudent?.(r)}>
        <td style={{ padding: '9px 8px', fontWeight: 900, color: r.position <= 3 ? '#b45309' : '#64748b', width: 40 }}>
          {r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : r.position}
        </td>
        <td style={{ padding: '9px 8px', fontWeight: 700, color: '#1e293b' }}>{r.name}{r.is_me ? ' (you)' : ''}</td>
        <td style={{ padding: '9px 8px', color: '#64748b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.before} → <b style={{ color: '#1e293b' }}>{r.after}</b></td>
        <td style={{ padding: '9px 8px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: up ? '#047857' : down ? '#b91c1c' : '#64748b', whiteSpace: 'nowrap' }}>
          {up ? '▲ +' : down ? '▼ ' : ''}{r.change}
        </td>
        <td style={{ padding: '9px 8px' }}><Sparkline values={r.spark} color={up ? '#10b981' : down ? '#ef4444' : '#94a3b8'} /></td>
        <td style={{ padding: '9px 8px', color: '#94a3b8', fontSize: 12 }}>{r.tests}</td>
      </tr>
    )
  }
  return (
    <Panel title="Most improved" icon="🚀" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>{data.window} · {unit}</span>}>
      <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>
        Ranked by how much each student <b>improved</b>, not by the highest score. {data.rule}
      </p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Appears once students have taken at least 2 tests.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <th style={{ padding: '6px 8px' }}>#</th><th style={{ padding: '6px 8px' }}>Student</th>
                <th style={{ padding: '6px 8px' }}>Before → now</th><th style={{ padding: '6px 8px' }}>Change</th>
                <th style={{ padding: '6px 8px' }}>Recent tests</th><th style={{ padding: '6px 8px' }}>Tests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => <Row key={r.position} r={r} />)}
              {meOutside && (
                <>
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#cbd5e1', padding: 2 }}>⋯</td></tr>
                  <Row r={data.me} />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!adminView && !data.me && rows.length > 0 && (
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>You'll appear here after your second test.</p>
      )}
    </Panel>
  )
}

// ── section for My Progress (student) and a student's page (admin) ────────────
export default function MotivationSection({ studentId = null }) {
  const [streak, setStreak] = useState(null)
  const [badges, setBadges] = useState(null)
  const [board, setBoard] = useState(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        if (studentId) {
          const m = await getStudentMotivation(studentId)
          if (live) { setStreak(m.streak); setBadges(m.badges) }
        } else {
          const [s, b, l] = await Promise.all([getStreak(), getBadges(), getMostImproved()])
          if (live) { setStreak(s); setBadges(b); setBoard(l) }
        }
      } catch { /* optional section */ }
    })()
    return () => { live = false }
  }, [studentId])

  if (!streak && !badges) return null
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <StreakPanel streak={streak} editable={!studentId} onChange={setStreak} />
      </div>
      <BadgesPanel data={badges} />
      {!studentId && <MostImprovedPanel data={board} />}
    </>
  )
}
