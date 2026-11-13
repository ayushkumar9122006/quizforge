/**
 * ChapterSelect — subject + JEE chapter dropdowns with a source badge.
 *   value:    { subject, chapter, chapter_source }
 *   onChange: (next) => void   (manual changes always set chapter_source = 'admin')
 */
import { useEffect, useState } from 'react'
import { getSyllabus } from '../../services/progressService.js'

export function useSyllabus() {
  const [syllabus, setSyllabus] = useState(null)
  useEffect(() => {
    let alive = true
    getSyllabus().then(d => { if (alive) setSyllabus(d) }).catch(() => { if (alive) setSyllabus({ subjects: [], ai_enabled: false }) })
    return () => { alive = false }
  }, [])
  return syllabus
}

export function SourceBadge({ source }) {
  if (!source) return null
  const meta = {
    admin: { t: '✓ Confirmed', c: '#065f46', b: '#d1fae5' },
    ai: { t: '✨ AI suggested', c: '#6d28d9', b: '#ede9fe' },
    keyword: { t: '🔎 Auto-guessed', c: '#92400e', b: '#fef3c7' },
  }[source]
  if (!meta) return null
  return <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: meta.b, color: meta.c, whiteSpace: 'nowrap' }}>{meta.t}</span>
}

export default function ChapterSelect({ value = {}, onChange, syllabus, compact = false, showBadge = true }) {
  const subjects = syllabus?.subjects || []
  const chapters = subjects.find(s => s.subject === value.subject)?.chapters || []
  const size = compact ? { fontSize: 12, padding: '5px 8px' } : { fontSize: 13 }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        className="inp-sm"
        aria-label="Subject"
        style={{ ...size, minWidth: 110 }}
        value={value.subject || ''}
        onChange={e => onChange({ subject: e.target.value || null, chapter: null, chapter_source: null })}
      >
        <option value="">Subject…</option>
        {subjects.map(s => <option key={s.subject} value={s.subject}>{s.subject}</option>)}
      </select>
      <select
        className="inp-sm"
        aria-label="Chapter"
        style={{ ...size, minWidth: compact ? 170 : 230, borderColor: value.chapter ? undefined : '#fca5a5' }}
        value={value.chapter || ''}
        disabled={!value.subject}
        onChange={e => onChange({ subject: value.subject, chapter: e.target.value || null, chapter_source: e.target.value ? 'admin' : null })}
      >
        <option value="">{value.subject ? 'Chapter…' : 'Pick subject first'}</option>
        {chapters.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {showBadge && value.chapter && <SourceBadge source={value.chapter_source} />}
    </div>
  )
}
