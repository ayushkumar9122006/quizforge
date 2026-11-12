/**
 * ChapterTagger — admin screen to tag every question of a quiz with subject + chapter.
 * AI (or keyword fallback) suggests; the admin confirms or changes, then saves.
 * Saved tags are stored as chapter_source = 'admin' (confirmed).
 */
import { useEffect, useMemo, useState } from 'react'
import { getQuiz } from '../../services/quizService.js'
import { autoTagQuiz, saveQuizChapters, inferSubjectFromSection } from '../../services/progressService.js'
import ChapterSelect, { useSyllabus, SourceBadge } from '../Progress/ChapterSelect.jsx'
import { Loading, ErrorBox } from '../Progress/ui.jsx'

export default function ChapterTagger({ quizId, onBack }) {
  const syllabus = useSyllabus()
  const [quiz, setQuiz] = useState(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // 'suggest' | 'save'
  const [savedMsg, setSavedMsg] = useState(null)
  const [filter, setFilter] = useState('all')

  const hydrate = (q) => {
    setQuiz(q)
    setRows((q.questions || []).slice().sort((a, b) => a.order_index - b.order_index).map(x => ({
      id: x.id,
      n: x.order_index + 1,
      section: x.section,
      text: x.text,
      image: x.question_image,
      type: x.question_type,
      subject: x.subject || inferSubjectFromSection(x.section),
      chapter: x.chapter,
      chapter_source: x.chapter_source,
      dirty: false,
    })))
  }

  useEffect(() => {
    getQuiz(quizId).then(hydrate).catch(e => setError(e?.response?.data?.detail || 'Could not load quiz.'))
  }, [quizId])

  const stats = useMemo(() => ({
    total: rows.length,
    untagged: rows.filter(r => !r.chapter).length,
    suggested: rows.filter(r => r.chapter && r.chapter_source !== 'admin').length,
    confirmed: rows.filter(r => r.chapter && r.chapter_source === 'admin').length,
  }), [rows])

  const shown = rows.filter(r =>
    filter === 'all' ? true : filter === 'untagged' ? !r.chapter : filter === 'suggested' ? (r.chapter && r.chapter_source !== 'admin') : (r.chapter && r.chapter_source === 'admin'))

  const update = (id, next) => {
    setSavedMsg(null)
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...next, dirty: true } : r))
  }

  const runSuggest = async () => {
    setBusy('suggest'); setError(null); setSavedMsg(null)
    try {
      // persist pending manual edits first so suggestions never overwrite them
      const pending = rows.filter(r => r.dirty && r.chapter)
      if (pending.length) await saveQuizChapters(quizId, pending.map(r => ({ question_id: r.id, subject: r.subject, chapter: r.chapter })))
      hydrate(await autoTagQuiz(quizId))
    } catch (e) {
      setError(e?.response?.data?.detail || 'Auto-suggest failed.')
    } finally { setBusy(null) }
  }

  const save = async (confirmAll) => {
    setBusy('save'); setError(null); setSavedMsg(null)
    try {
      const targets = rows.filter(r => r.chapter && (confirmAll ? r.chapter_source !== 'admin' || r.dirty : r.dirty))
      const cleared = rows.filter(r => !r.chapter && r.dirty)
      const updates = [...targets, ...cleared].map(r => ({ question_id: r.id, subject: r.subject, chapter: r.chapter }))
      if (!updates.length) { setSavedMsg('Nothing to save.'); return }
      hydrate(await saveQuizChapters(quizId, updates))
      setSavedMsg(`Saved ${updates.length} question${updates.length !== 1 ? 's' : ''}.`)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Saving failed.')
    } finally { setBusy(null) }
  }

  if (!quiz && !error) return <Loading text="Loading questions…" />

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#111827' }}>Chapter tags · {quiz?.title}</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '3px 0 0' }}>Every question needs a chapter for students' weak-chapter analysis. Suggestions are a starting point. Check them and confirm.</p>
        </div>
        <button className="btn-sec" disabled={!!busy || stats.untagged === 0} onClick={runSuggest} title={syllabus?.ai_enabled ? 'Uses AI' : 'No AI key configured, so keywords are used'}>
          {busy === 'suggest' ? 'Suggesting…' : `✨ Suggest for ${stats.untagged} untagged`}
        </button>
        <button className="btn-pri" disabled={!!busy || (stats.suggested === 0 && !rows.some(r => r.dirty))} onClick={() => save(true)}>
          {busy === 'save' ? 'Saving…' : 'Confirm all & save'}
        </button>
      </div>

      {!syllabus?.ai_enabled && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, fontSize: 13, color: '#92400e', marginBottom: 14 }}>
          No OpenRouter key is set on the server, so suggestions come from keyword matching (less accurate). Image-only questions must be tagged by hand.
        </div>
      )}
      {error && <ErrorBox text={error} />}
      {savedMsg && <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, fontSize: 13, color: '#065f46', marginBottom: 14 }}>✓ {savedMsg}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['all', `All ${stats.total}`],
          ['untagged', `Untagged ${stats.untagged}`],
          ['suggested', `Needs confirmation ${stats.suggested}`],
          ['confirmed', `Confirmed ${stats.confirmed}`],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 13px', borderRadius: 20, border: '1.5px solid', borderColor: filter === k ? '#6366f1' : '#e2e8f0', background: filter === k ? '#eef2ff' : '#fff', color: filter === k ? '#4338ca' : '#475569', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {shown.map(r => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 12px', background: '#fff', border: `1.5px solid ${r.dirty ? '#c7d2fe' : '#eef2f7'}`, borderRadius: 12 }}>
            <div style={{ fontWeight: 900, color: '#6366f1', fontSize: 13 }}>Q{r.n}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{r.section} · {r.type?.replace('_', ' ')}</div>
              {r.text
                ? <div style={{ fontSize: 13, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.45 }}>{r.text}</div>
                : r.image ? <img src={r.image} alt={`Question ${r.n}`} style={{ maxHeight: 54, maxWidth: '100%', borderRadius: 6, border: '1px solid #e5e7eb' }} /> : <i style={{ color: '#cbd5e1', fontSize: 13 }}>No text</i>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChapterSelect compact syllabus={syllabus} value={r} onChange={next => update(r.id, next)} showBadge={false} />
              <div style={{ minWidth: 112 }}>{r.chapter ? <SourceBadge source={r.dirty ? 'admin' : r.chapter_source} /> : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#dc2626' }}>Untagged</span>}</div>
            </div>
          </div>
        ))}
        {shown.length === 0 && <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: '2rem' }}>Nothing here.</p>}
      </div>

      {rows.some(r => r.dirty) && (
        <div style={{ position: 'sticky', bottom: 16, marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-pri" style={{ boxShadow: '0 8px 24px rgba(99,102,241,.35)' }} disabled={!!busy} onClick={() => save(false)}>
            Save {rows.filter(r => r.dirty).length} change{rows.filter(r => r.dirty).length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
