import { useEffect } from 'react'

export default function Palette({ questions, answers, marked, current, onJump, onClose }) {
  useEffect(() => {
    const p = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = p }
  }, [])

  const done = Object.keys(answers).length

  // Group questions by section with both local and global indices
  const sectionsMap = {}
  questions.forEach((q, globalIdx) => {
    const s = q.section || 'General'
    if (!sectionsMap[s]) {
      sectionsMap[s] = []
    }
    sectionsMap[s].push({
      ...q,
      globalIndex: globalIdx,
      localIndex: sectionsMap[s].length,
    })
  })

  const sectionsList = Object.entries(sectionsMap).map(([name, qs]) => {
    const answeredCount = qs.filter(q => answers[q.globalIndex] !== undefined).length
    const remainingCount = qs.length - answeredCount
    const markedCount = qs.filter(q => marked.has(q.globalIndex)).length
    return {
      name,
      questions: qs,
      totalCount: qs.length,
      answeredCount,
      remainingCount,
      markedCount,
    }
  })

  return (
    <>
      <div className="pal-ov open" onClick={onClose} />
      <div className="pal-panel open" style={{ width: 'min(360px, 92vw)' }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Question Palette</span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: '#9ca3af', lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>

          {/* Visual Legend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 11, color: '#6b7280' }}>
            {[
              { bg: '#d1fae5', bd: '#34d399', lbl: `Answered (${done})` },
              { bg: '#fef3c7', bd: '#f59e0b', lbl: `Marked (${marked.size})` },
              { bg: '#fff', bd: '#d1d5db', lbl: 'Not answered' },
              { bg: '#ede9fe', bd: '#6366f1', lbl: 'Current' },
            ].map(({ bg, bd, lbl }) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 13, height: 13, borderRadius: 3, background: bg, border: `1.5px solid ${bd}`, flexShrink: 0 }} />
                <span>{lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Global Progress Bar */}
        <div style={{ display: 'flex', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
          {[
            { v: done, l: 'Answered', c: '#059669' },
            { v: questions.length - done, l: 'Remaining', c: '#dc2626' },
            { v: marked.size, l: 'Marked', c: '#d97706' },
          ].map(({ v, l, c }) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, fontWeight: 600 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Section-wise Question Groups */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          {sectionsList.map((sec) => (
            <div
              key={sec.name}
              style={{
                marginBottom: 20,
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              {/* Section Header with dynamic counts */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#334155', letterSpacing: '.03em' }}>
                  {sec.name.toUpperCase()} — {sec.totalCount} Questions
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: sec.remainingCount === 0 ? '#d1fae5' : '#ede9fe',
                    color: sec.remainingCount === 0 ? '#065f46' : '#5b21b6',
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {sec.answeredCount} answered • {sec.remainingCount} left
                </span>
              </div>

              {/* Local Question Number Buttons [1] [2] ... [N] */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {sec.questions.map((q) => {
                  const a = answers[q.globalIndex] !== undefined
                  const m = marked.has(q.globalIndex)
                  const c = q.globalIndex === current
                  let cls = 'pb'
                  if (c) cls += ' cur'
                  else if (a && m) cls += ' both'
                  else if (a) cls += ' ans'
                  else if (m) cls += ' mrk'

                  return (
                    <button
                      key={q.globalIndex}
                      className={cls}
                      onClick={() => {
                        onJump(q.globalIndex)
                        onClose()
                      }}
                      title={`${sec.name} · Question ${q.localIndex + 1} (${a ? 'Answered' : 'Not answered'}${m ? ', Marked' : ''})`}
                      style={{
                        width: '100%',
                        height: 36,
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {q.localIndex + 1}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px', borderTop: '1px solid #f3f4f6', fontSize: 12, color: '#94a3b8', textAlign: 'center', background: '#fff' }}>
          Tap any question number to jump directly
        </div>
      </div>
    </>
  )
}
