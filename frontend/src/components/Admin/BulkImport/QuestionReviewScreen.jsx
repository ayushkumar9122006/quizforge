import { useState } from 'react'

export default function QuestionReviewScreen({
  analysisData,
  extractedQuestions,
  metadata,
  onConfirmImport,
  onConfirm,
  onCancel,
  importing = false,
  isSubmitting = false,
}) {
  const rawQuestions = extractedQuestions || analysisData?.questions || []
  const [questions, setQuestions] = useState(
    rawQuestions.map((q) => ({
      ...q,
      approved: q.approved !== undefined ? q.approved : !q.needs_review, // Default approved if passed validation
    }))
  )
  const isImporting = importing || isSubmitting
  const fileName = metadata?.filename || analysisData?.filename || 'Uploaded PDF'

  const [filter, setFilter] = useState('all') // 'all' | 'ready' | 'needs_review'
  const [lightboxImg, setLightboxImg] = useState(null)
  const [activeTabQIndex, setActiveTabQIndex] = useState(0)

  const totalCount = questions.length
  const readyCount = questions.filter((q) => !q.needs_review).length
  const reviewCount = questions.filter((q) => q.needs_review).length
  const approvedCount = questions.filter((q) => q.approved).length

  const filteredQuestions = questions.filter((q) => {
    if (filter === 'ready') return !q.needs_review
    if (filter === 'needs_review') return q.needs_review
    return true
  })

  // ── Helpers to update individual questions ──────────────────────────────────
  const updateQuestion = (qNum, field, val) => {
    setQuestions((prev) =>
      prev.map((q) => (q.question_number === qNum ? { ...q, [field]: val } : q))
    )
  }

  const updateOptionText = (qNum, optIdx, text) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.question_number !== qNum) return q
        const newOpts = [...q.options]
        if (newOpts[optIdx]) {
          newOpts[optIdx] = { ...newOpts[optIdx], text }
        }
        return { ...q, options: newOpts }
      })
    )
  }

  const toggleApproveAll = (status) => {
    setQuestions((prev) => prev.map((q) => ({ ...q, approved: status })))
  }

  const handleBulkMarksChange = (pos, neg) => {
    setQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        positive_marks: Number(pos) || q.positive_marks,
        negative_marks: Number(neg) || q.negative_marks,
      }))
    )
  }

  const handleFinalSubmit = () => {
    const approvedList = questions.filter((q) => q.approved)
    if (approvedList.length === 0) {
      alert('Please approve at least 1 question to import.')
      return
    }
    const fn = onConfirmImport || onConfirm
    if (fn) fn(approvedList)
  }

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '1.5rem 1.25rem 6rem' }}>
      {/* Lightbox for zooming source crop or diagram */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 10, 25, 0.88)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            padding: 20,
          }}
        >
          <img
            src={lightboxImg}
            alt="Enlarged preview"
            style={{ maxWidth: '94vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
          />
        </div>
      )}

      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button className="btn-ghost" onClick={onCancel} style={{ marginBottom: 6 }}>
            ← Back
          </button>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px', color: '#111827' }}>
            Verify & Import Extracted Questions
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Source: <strong>{fileName}</strong> • {totalCount} questions detected
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', padding: '4px 6px', borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              background: filter === 'all' ? '#6366f1' : 'transparent',
              color: filter === 'all' ? '#fff' : '#4b5563',
            }}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilter('ready')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              background: filter === 'ready' ? '#10b981' : 'transparent',
              color: filter === 'ready' ? '#fff' : '#4b5563',
            }}
          >
            ✓ Ready ({readyCount})
          </button>
          <button
            onClick={() => setFilter('needs_review')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              background: filter === 'needs_review' ? '#f59e0b' : 'transparent',
              color: filter === 'needs_review' ? '#fff' : '#4b5563',
            }}
          >
            ⚠ Needs Review ({reviewCount})
          </button>
        </div>
      </div>

      {/* Batch Control Toolbar */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 18px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
            Quick Selection:
          </span>
          <button
            onClick={() => toggleApproveAll(true)}
            style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4f46e5', cursor: 'pointer' }}
          >
            Select All
          </button>
          <button
            onClick={() => toggleApproveAll(false)}
            style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', cursor: 'pointer' }}
          >
            Deselect All
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            Bulk Marks:
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['+4 / -1', '+2 / -0.5', '+1 / 0'].map((preset) => {
              const [p, n] = preset.split(' / ').map((s) => Math.abs(parseFloat(s)))
              return (
                <button
                  key={preset}
                  onClick={() => handleBulkMarksChange(p, n)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}
                >
                  {preset}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Questions List (Side-by-Side Cards) */}
      {totalCount === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: '#fff',
          borderRadius: 20,
          border: '1.5px dashed #cbd5e1',
          maxWidth: 600,
          margin: '2rem auto'
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>
            No Questions Extracted
          </h3>
          <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
            The PDF was processed, but no standard question headers (e.g. Q1, Question 1, 1.) were detected. Please ensure the PDF is not a scanned image without selectable text or OCR.
          </p>
          <button className="btn-pri" onClick={onCancel}>
            ← Choose Another PDF
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 24 }}>
        {filteredQuestions.map((q) => {
          const isMatch = q.question_type === 'match_column'
          const isAssert = q.question_type === 'assertion_reason'
          const typeLabel = isMatch
            ? '🔗 Match the Column'
            : isAssert
            ? '⚖️ Assertion–Reason'
            : q.question_type === 'numerical'
            ? '🔢 Numerical Answer'
            : q.question_type === 'multi_correct'
            ? '☑️ Multi-Correct MCQ'
            : '🔘 Single Correct MCQ'

          return (
            <div
              key={q.question_number}
              style={{
                background: '#fff',
                borderRadius: 16,
                border: `2px solid ${q.approved ? '#c7d2fe' : '#e5e7eb'}`,
                overflow: 'hidden',
                boxShadow: q.approved ? '0 4px 20px rgba(99, 102, 241, 0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all .15s ease',
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  padding: '12px 18px',
                  background: q.approved ? '#f5f3ff' : '#f9fafb',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 800, fontSize: 15, color: '#111827' }}>
                    <input
                      type="checkbox"
                      checked={q.approved}
                      onChange={(e) => updateQuestion(q.question_number, 'approved', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                    Question #{q.question_number}
                  </label>

                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: '#ede9fe', color: '#5b21b6' }}>
                    {typeLabel}
                  </span>

                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                    Page {q.source_pages?.join(', ') || q.source_page}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {q.needs_review ? (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                      ⚠ Needs Review
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                      ✓ Ready ({Math.round(q.confidence * 100)}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Review Warnings if any */}
              {q.review_notes && q.review_notes.length > 0 && (
                <div style={{ padding: '8px 18px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', fontSize: 12, color: '#b45309' }}>
                  <strong>Notes:</strong> {q.review_notes.join(' • ')}
                </div>
              )}

              {/* Card Body: SIDE-BY-SIDE VIEW */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 0 }}>
                {/* ── LEFT PANEL: Original PDF Source Crop ── */}
                <div
                  style={{
                    padding: '16px',
                    background: '#f8fafc',
                    borderRight: '1.5px solid #e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      📄 Original PDF Source
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      Click to zoom
                    </span>
                  </div>

                  {q.source_image ? (
                    <div
                      onClick={() => setLightboxImg(q.source_image)}
                      style={{
                        flex: 1,
                        background: '#fff',
                        borderRadius: 10,
                        border: '1.5px solid #cbd5e1',
                        padding: 8,
                        overflow: 'hidden',
                        cursor: 'zoom-in',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={q.source_image}
                        alt={`Q${q.question_number} Source`}
                        style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain', display: 'block' }}
                      />
                    </div>
                  ) : (
                    <div style={{ flex: 1, padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      No page crop preview available
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      Exact source capture (144 DPI)
                    </span>
                    <button
                      onClick={() => setLightboxImg(q.source_image)}
                      style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      🔍 Enlarge
                    </button>
                  </div>
                </div>

                {/* ── RIGHT PANEL: Extracted QuiZee Question Form ── */}
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Problem Statement Textarea */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
                      Problem Statement
                    </label>
                    <textarea
                      rows={isMatch ? 6 : 4}
                      className="inp"
                      value={q.text}
                      onChange={(e) => updateQuestion(q.question_number, 'text', e.target.value)}
                      placeholder="Question text statement..."
                      style={{ width: '100%', resize: 'vertical', lineHeight: 1.5, fontSize: 13, fontFamily: 'monospace' }}
                    />
                  </div>

                  {/* Attached Diagram / Image Preview if any */}
                  {(q.diagram || q.question_image) && (
                    <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                          {isMatch ? '📊 Original Matching Table (from PDF)' : '🖼️ Attached Diagram / Structure'}
                        </span>
                        <button
                          onClick={() => {
                            updateQuestion(q.question_number, 'diagram', null)
                            updateQuestion(q.question_number, 'question_image', null)
                          }}
                          style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                        >
                          Remove
                        </button>
                      </div>
                      <img
                        src={q.diagram || q.question_image}
                        alt="Question Diagram"
                        onClick={() => setLightboxImg(q.diagram || q.question_image)}
                        style={{ maxHeight: isMatch ? 260 : 130, maxWidth: '100%', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 6, display: 'block', background: '#fff', border: '1px solid #e2e8f0' }}
                      />
                      <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                        🔍 Click image to enlarge full screen
                      </span>
                    </div>
                  )}

                  {/* Match-the-Column Structured Matrix Preview */}
                  {isMatch && q.match_data && (() => {
                    try {
                      const md = JSON.parse(q.match_data)
                      if (md.column_1?.length || md.column_2?.length) {
                        return (
                          <div style={{ padding: '10px 12px', background: '#f5f3ff', borderRadius: 10, border: '1px solid #ddd6fe' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                              🔗 Structured Column Table
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div style={{ background: '#fff', padding: 8, borderRadius: 8, border: '1px solid #ede9fe' }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#5b21b6', marginBottom: 6 }}>Column-I</div>
                                {md.column_1?.map(it => (
                                  <div key={it.label} style={{ fontSize: 12, marginBottom: 5, display: 'flex', gap: 6, lineHeight: 1.35 }}>
                                    <span style={{ fontWeight: 800, color: '#6366f1' }}>({it.label})</span>
                                    <span style={{ color: '#1f2937' }}>{it.text}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{ background: '#fff', padding: 8, borderRadius: 8, border: '1px solid #ede9fe' }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#5b21b6', marginBottom: 6 }}>Column-II</div>
                                {md.column_2?.map(it => (
                                  <div key={it.label} style={{ fontSize: 12, marginBottom: 5, display: 'flex', gap: 6, lineHeight: 1.35 }}>
                                    <span style={{ fontWeight: 800, color: '#6366f1' }}>({it.label})</span>
                                    <span style={{ color: '#1f2937' }}>{it.text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      }
                    } catch (e) {
                      return null
                    }
                    return null
                  })()}

                  {/* Options List */}
                  {q.options && q.options.length > 0 && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Options & Correct Answer
                      </label>
                      <div style={{ display: 'grid', gap: 7 }}>
                        {q.options.map((opt, oi) => {
                          const isCorrect = q.correct_answer === oi
                          return (
                            <div
                              key={oi}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 10px',
                                borderRadius: 8,
                                border: `1.5px solid ${isCorrect ? '#10b981' : '#e2e8f0'}`,
                                background: isCorrect ? '#ecfdf5' : '#fff',
                              }}
                            >
                              <input
                                type="radio"
                                name={`q_ans_${q.question_number}`}
                                checked={isCorrect}
                                onChange={() => updateQuestion(q.question_number, 'correct_answer', oi)}
                                style={{ accentColor: '#10b981', cursor: 'pointer' }}
                              />
                              <span style={{ fontWeight: 800, fontSize: 12, width: 22, color: isCorrect ? '#065f46' : '#64748b' }}>
                                ({opt.label || String.fromCharCode(65 + oi)})
                              </span>
                              <input
                                type="text"
                                value={opt.text}
                                onChange={(e) => updateOptionText(q.question_number, oi, e.target.value)}
                                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, outline: 'none' }}
                              />
                              {isCorrect && (
                                <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>
                                  CORRECT
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Marks & Section Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 10, marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                        Positive Marks
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="inp"
                        value={q.positive_marks}
                        onChange={(e) => updateQuestion(q.question_number, 'positive_marks', parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                        Negative Marks
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="inp"
                        value={q.negative_marks}
                        onChange={(e) => updateQuestion(q.question_number, 'negative_marks', parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                        Section
                      </span>
                      <input
                        type="text"
                        className="inp"
                        value={q.section}
                        onChange={(e) => updateQuestion(q.question_number, 'section', e.target.value)}
                        style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Sticky Bottom Action Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          padding: '14px 24px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
          zIndex: 8000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
            {approvedCount} of {totalCount} questions selected for import
          </span>
          {approvedCount < totalCount && (
            <button
              onClick={() => toggleApproveAll(true)}
              style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Select all {totalCount}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-sec" onClick={onCancel} disabled={isImporting}>
            Cancel
          </button>
          <button
            className="btn-pri"
            onClick={handleFinalSubmit}
            disabled={isImporting || approvedCount === 0}
            style={{ padding: '10px 24px', fontSize: 14, fontWeight: 800, minWidth: 200 }}
          >
            {isImporting ? 'Importing…' : `Import ${approvedCount} Questions →`}
          </button>
        </div>
      </div>
    </div>
  )
}
