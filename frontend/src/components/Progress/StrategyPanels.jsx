/**
 * Time strategy, easy/medium/hard and target-tracker panels.
 * Used on the per-test report (AttemptReport) and on My Progress.
 */
import { useState } from 'react'
import { setTarget } from '../../services/progressService.js'
import { Panel, PctBar, SubjectDot } from './ui.jsx'

const mmss = sec => {
  const t = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

function TimeBar({ label, sec, max, color, note }) {
  const w = max > 0 ? Math.min(100, (sec / max) * 100) : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr 70px', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <span style={{ color: '#64748b', fontWeight: 700 }}>{label}</span>
      <div style={{ height: 9, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 5 }} />
      </div>
      <span style={{ fontWeight: 800, color: '#334155', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} title={note}>{mmss(sec)}</span>
    </div>
  )
}

function QList({ items, empty, accent }) {
  if (!items.length) return <p style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 0' }}>{empty}</p>
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      {items.slice(0, 8).map(q => (
        <div key={q.question_id} style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto auto', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '6px 10px', background: '#f8fafc', borderRadius: 9 }}>
          <b style={{ color: accent }}>Q{q.number}</b>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155', display: 'flex', gap: 6, alignItems: 'center' }}><SubjectDot subject={q.subject} />{q.chapter}</span>
          <span style={{ fontWeight: 800, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{mmss(q.time_sec)}</span>
          <span style={{ fontWeight: 800, color: '#b91c1c' }}>−{q.marks_lost}</span>
        </div>
      ))}
      {items.length > 8 && <span style={{ fontSize: 12, color: '#94a3b8' }}>+{items.length - 8} more</span>}
    </div>
  )
}

/** Per-test time strategy (report). */
export function TimeStrategyPanel({ ts }) {
  if (!ts) return null
  const max = Math.max(1, ...ts.subjects.flatMap(s => [s.my_time_sec, s.topper_time_sec, s.batch_avg_time_sec]))
  return (
    <Panel title="Time strategy" icon="⏱️" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>You {mmss(ts.my_total_time_sec)} · topper {mmss(ts.topper_total_time_sec)}</span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#9a3412' }}>🐢 Over {ts.slow_threshold_sec / 60} min and still wrong ({ts.slow_wrong.length})</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{ts.slow_wrong.length ? `${mmss(ts.time_on_slow_wrong_sec)} spent for −${ts.marks_lost_slow_wrong} marks. Skip and return when stuck.` : ''}</div>
          <QList items={ts.slow_wrong} empty="None. You moved on from hard questions well." accent="#c2410c" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#991b1b' }}>⚡ Under {ts.rushed_threshold_sec} s and wrong ({ts.rushed_wrong.length})</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{ts.rushed_wrong.length ? `−${ts.marks_lost_rushed_wrong} marks from rushing. Read the whole question first.` : ''}</div>
          <QList items={ts.rushed_wrong} empty="None. No careless rushed answers." accent="#b91c1c" />
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>TIME PER SUBJECT: YOU VS TOPPER VS BATCH AVERAGE</div>
        <div style={{ display: 'grid', gap: 14 }}>
          {ts.subjects.map(s => (
            <div key={s.subject}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 5 }}>
                <SubjectDot subject={s.subject} />{s.subject}
                <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: 12 }}>· you scored {s.my_score_pct}% · topper {s.topper_score_pct}%</span>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <TimeBar label="You" sec={s.my_time_sec} max={max} color="#6366f1" />
                <TimeBar label="Topper" sec={s.topper_time_sec} max={max} color="#f59e0b" />
                <TimeBar label="Batch avg" sec={s.batch_avg_time_sec} max={max} color="#cbd5e1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

/** Aggregate time strategy (progress). */
export function TimeStrategySummary({ ts }) {
  if (!ts) return null
  const max = Math.max(1, ...ts.subjects.flatMap(s => [s.my_sec_per_q, s.topper_sec_per_q]))
  return (
    <Panel title="Time strategy across tests" icon="⏱️">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ padding: '10px 12px', borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#9a3412' }}>🐢 OVER {ts.slow_threshold_sec / 60} MIN & WRONG</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#c2410c' }}>{ts.slow_wrong}</div>
          <div style={{ fontSize: 12, color: '#9a3412' }}>−{ts.marks_lost_slow_wrong} marks</div>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#991b1b' }}>⚡ UNDER {ts.rushed_threshold_sec} S & WRONG</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#b91c1c' }}>{ts.rushed_wrong}</div>
          <div style={{ fontSize: 12, color: '#991b1b' }}>−{ts.marks_lost_rushed_wrong} marks</div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>AVERAGE TIME PER QUESTION: YOU VS EACH TEST'S TOPPER</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {ts.subjects.map(s => (
          <div key={s.subject}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 4 }}><SubjectDot subject={s.subject} />{s.subject}</div>
            <div style={{ display: 'grid', gap: 4 }}>
              <TimeBar label="You" sec={s.my_sec_per_q} max={max} color="#6366f1" />
              <TimeBar label="Topper" sec={s.topper_sec_per_q} max={max} color="#f59e0b" />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

const LEVEL_META = {
  easy: { label: 'Easy', color: '#16a34a', bg: '#dcfce7' },
  medium: { label: 'Medium', color: '#d97706', bg: '#fef3c7' },
  hard: { label: 'Hard', color: '#dc2626', bg: '#fee2e2' },
}

function LevelRows({ levels }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {['easy', 'medium', 'hard'].map(k => {
        const b = levels[k]
        if (!b || !b.questions) return null
        const m = LEVEL_META[k]
        const seg = (n, c) => <div style={{ width: `${(n / b.questions) * 100}%`, background: c }} />
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 120px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ fontWeight: 800, color: m.color, background: m.bg, padding: '2px 8px', borderRadius: 20, textAlign: 'center', whiteSpace: 'nowrap' }}>{m.label} · {b.questions}</span>
            <div style={{ height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex', background: '#f1f5f9' }} title={`${b.correct} correct, ${b.wrong + b.partial} wrong, ${b.skipped} skipped`}>
              {seg(b.correct, '#22c55e')}{seg(b.wrong + b.partial, '#ef4444')}{seg(b.skipped, '#cbd5e1')}
            </div>
            <span style={{ color: '#475569', fontWeight: 700, textAlign: 'right' }}>{b.accuracy}% acc · −{b.marks_lost}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Per-test difficulty (report). */
export function DifficultyPanel({ d }) {
  if (!d) return null
  if (!d.rated) return (
    <Panel title="Easy-question mistakes" icon="🎯">
      <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Questions get an easy / medium / hard rating once at least {d.thresholds.min_cohort} students have taken this test.</p>
    </Panel>
  )
  return (
    <Panel title="Easy-question mistakes" icon="🎯" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>Easy = ≥{d.thresholds.easy_at_least_pct}% of the batch got it right · hard = under {d.thresholds.hard_below_pct}%</span>}>
      {d.easy_misses.length > 0 ? (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 14, fontSize: 14, color: '#7c2d12', lineHeight: 1.5 }}>
          You lost <b>{d.easy_marks_lost} marks</b> on {d.easy_misses.length} easy question{d.easy_misses.length !== 1 ? 's' : ''}, ones <b>{d.easy_misses_avg_batch_pct}%</b> of the batch got right. These are the fastest marks to win back.
        </div>
      ) : (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', marginBottom: 14, fontSize: 14, color: '#065f46' }}>
          ✓ No easy question missed. Your lost marks are on medium and hard ones.
        </div>
      )}
      <LevelRows levels={d.levels} />
      {d.easy_misses.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 14 }}>
          {d.easy_misses.slice(0, 8).map(m => (
            <div key={m.question_id} style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto auto', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '6px 10px', background: '#f8fafc', borderRadius: 9 }}>
              <b style={{ color: '#16a34a' }}>Q{m.number}</b>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}><SubjectDot subject={m.subject} />{m.chapter}</span>
              <span style={{ color: '#475569' }}>{m.kind === 'skipped' ? 'skipped' : 'wrong'} · {m.batch_correct_pct}% got it</span>
              <span style={{ fontWeight: 800, color: '#b91c1c' }}>−{m.marks_lost}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

/** Aggregate difficulty (progress). */
export function DifficultySummary({ d }) {
  if (!d || !['easy', 'medium', 'hard'].some(k => d.levels[k]?.questions)) return null
  return (
    <Panel title="Accuracy by difficulty" icon="🎯" right={<span style={{ fontSize: 12, color: '#94a3b8' }}>Difficulty from how the whole batch did</span>}>
      <LevelRows levels={d.levels} />
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b', marginTop: 10, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#22c55e', borderRadius: 2, marginRight: 4 }} />correct</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#ef4444', borderRadius: 2, marginRight: 4 }} />wrong</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#cbd5e1', borderRadius: 2, marginRight: 4 }} />skipped</span>
      </div>
    </Panel>
  )
}

function GapRow({ subject, value, target }) {
  const gap = target != null ? Math.round((target - value) * 10) / 10 : null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#1e293b' }}><SubjectDot subject={subject} />{subject}</span>
      <div style={{ position: 'relative', height: 10, background: '#f1f5f9', borderRadius: 5 }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: gap != null && gap <= 0 ? '#22c55e' : '#6366f1', borderRadius: 5 }} />
        {target != null && <div title={`Target ${target}/100`} style={{ position: 'absolute', top: -3, left: `calc(${Math.min(100, target)}% - 1px)`, width: 2, height: 16, background: '#0f172a' }} />}
      </div>
      <span style={{ fontWeight: 800, textAlign: 'right', color: gap == null ? '#475569' : gap <= 0 ? '#047857' : '#b91c1c' }}>
        {value}/100{gap != null ? (gap <= 0 ? ' ✓' : ` (−${gap})`) : ''}
      </span>
    </div>
  )
}

/** Target tracker: set a goal out of 300, see the gap overall and per subject. */
export function TargetPanel({ target, onSaved, editable = true, compact = false }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(target?.target_marks ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  if (!target) return null

  const save = async () => {
    const n = Number(val)
    if (val !== '' && (!Number.isFinite(n) || n < 1 || n > 300)) { setErr('Enter a target between 1 and 300.'); return }
    setSaving(true); setErr(null)
    try { await setTarget(val === '' ? null : n); setEditing(false); onSaved?.() } catch (e) { setErr(e?.response?.data?.detail || 'Could not save target.') } finally { setSaving(false) }
  }

  const t = target.target_marks
  const current = target.recent_avg_300 ?? target.score_300
  const currentPct = target.estimated_percentile_recent ?? target.estimated_percentile
  const subjects = target.subjects || []
  const editor = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="inp-sm" type="number" min={1} max={300} placeholder="e.g. 200" value={val} onChange={e => setVal(e.target.value)} style={{ width: 110 }} aria-label="Target marks out of 300" />
      <span style={{ fontSize: 12, color: '#64748b' }}>/ 300</span>
      <button className="btn-pri" style={{ fontSize: 12, padding: '6px 12px' }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save target'}</button>
      {t && <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditing(false)}>Cancel</button>}
      {err && <span style={{ color: '#b91c1c', fontSize: 12 }}>{err}</span>}
    </div>
  )

  return (
    <Panel title="Target tracker" icon="🏁" right={editable && t && !editing ? <button className="btn-sec" style={{ fontSize: 12, padding: '5px 11px' }} onClick={() => { setVal(t); setEditing(true) }}>Change target</button> : null}>
      {(!t || editing) && editable ? (
        <div>
          {current != null && (
            <div style={{ fontSize: 14, color: '#0f172a', marginBottom: 8 }}>
              {target.recent_avg_300 != null ? 'Your recent average' : 'This test'}: <b>{current}/300</b> ≈ <b>{currentPct}</b> JEE Main percentile*
            </div>
          )}
          <p style={{ fontSize: 13.5, color: '#334155', margin: '0 0 10px' }}>Set your JEE Main goal out of 300. After every test you'll see how far you are from it, overall and per subject.</p>
          {editor}
          {target.hints && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {target.hints.map(h => (
                <button key={h.percentile} className="btn-sec" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => setVal(Math.ceil(h.marks))}>≈{h.percentile} %ile → {Math.ceil(h.marks)} marks</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: '#eef2ff' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>TARGET</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#312e81' }}>{t}/300</div>
              <div style={{ fontSize: 12, color: '#4f46e5' }}>≈ {target.target_percentile} percentile*</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{target.recent_avg_300 != null ? 'RECENT AVERAGE (LAST 3)' : 'THIS TEST'}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{current}/300</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>≈ {currentPct} percentile*</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: target.gap <= 0 ? '#ecfdf5' : '#fef2f2' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: target.gap <= 0 ? '#065f46' : '#991b1b' }}>GAP</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: target.gap <= 0 ? '#047857' : '#b91c1c' }}>{target.gap <= 0 ? `+${Math.abs(target.gap)} ahead` : `${target.gap} marks`}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{target.biggest_gap_subject && target.gap > 0 ? `Biggest gap: ${target.biggest_gap_subject}` : target.gap <= 0 ? 'On target 🎉' : ''}</div>
            </div>
          </div>
          {!compact && subjects.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>EACH SUBJECT OUT OF 100 (TARGET {Math.round((t / 3) * 10) / 10} EACH, ▌ = TARGET)</div>
              {subjects.map(s => <GapRow key={s.subject} subject={s.subject} value={s.recent_avg_100 ?? s.score_100} target={s.target_100} />)}
            </div>
          )}
          {compact && subjects.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {subjects.map(s => <GapRow key={s.subject} subject={s.subject} value={s.score_100} target={s.target_100} />)}
            </div>
          )}
        </>
      )}
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '12px 0 0' }}>* Estimate only. {target.note} Scores from your tests are scaled to 300.</p>
    </Panel>
  )
}
