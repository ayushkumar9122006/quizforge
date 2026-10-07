import React, { useState } from 'react'

function parseToISTIso(val) {
  if (!val) return null
  try {
    return new Date(`${val}:00+05:30`).toISOString()
  } catch {
    return null
  }
}

function toLocalInput(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const pad = n => String(n).padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  } catch {
    return ''
  }
}

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
  const initialSections = (analysisData?.configuredSections && Array.isArray(analysisData.configuredSections) && analysisData.configuredSections.length > 0)
    ? [...analysisData.configuredSections]
    : ['Section A', 'Section B', 'Section C', 'Section D']

  const [sections, setSections] = useState(initialSections)
  const [newSecInput, setNewSecInput] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')

  const [quizTitle, setQuizTitle] = useState(
    analysisData?.title ||
    metadata?.title ||
    (analysisData?.filename ? analysisData.filename.replace(/\.pdf$/i, '').replace(/_/g, ' ') : 'Imported Quiz')
  )
  const [totalDuration, setTotalDuration] = useState(
    analysisData?.totalDurationMinutes !== undefined && analysisData?.totalDurationMinutes !== null
      ? String(analysisData.totalDurationMinutes)
      : String((analysisData?.timePerQMin || (analysisData?.timePerQ ? Math.round(analysisData.timePerQ / 60) : 5)) * (questions?.length || 10))
  )

  const [instructions, setInstructions] = useState(
    analysisData?.customInstructions ||
    '• Read each question carefully before choosing an answer.\n• Marking scheme and question types are set based on the examination paper.\n• Clear Response button is available to deselect any answer.\n• Test will auto-submit when the overall timer expires.'
  )
  const [enableWindow, setEnableWindow] = useState(
    Boolean(analysisData?.enableWindow || analysisData?.availabilityStart || analysisData?.availabilityEnd)
  )
  const [availStart, setAvailStart] = useState(
    analysisData?.rawAvailStart || toLocalInput(analysisData?.availabilityStart) || ''
  )
  const [availEnd, setAvailEnd] = useState(
    analysisData?.rawAvailEnd || toLocalInput(analysisData?.availabilityEnd) || ''
  )

  const [solutionPdf, setSolutionPdf] = useState(analysisData?.solutionPdf || null)
  const [solutionPdfName, setSolutionPdfName] = useState(analysisData?.solutionPdfName || '')
  const [pdfUploading, setPdfUploading] = useState(false)

  const [showConfig, setShowConfig] = useState(true)

  const rawQuestions = extractedQuestions || analysisData?.questions || []
  const [questions, setQuestions] = useState(
    rawQuestions.map((q, i) => {
      const qNum = q.question_number !== undefined ? q.question_number : (i + 1)
      const assignedSec = (q.section && initialSections.includes(q.section))
        ? q.section
        : (initialSections && initialSections[0]) || 'Section A'
      return {
        ...q,
        question_number: qNum,
        section: assignedSec,
        approved: q.approved !== undefined ? q.approved : !q.needs_review,
      }
    })
  )
  const isImporting = importing || isSubmitting
  const fileName = metadata?.filename || analysisData?.filename || 'Uploaded PDF'

  const [filter, setFilter] = useState('all') // 'all' | 'ready' | 'needs_review'
  const [lightboxImg, setLightboxImg] = useState(null)

  const totalCount = questions.length
  const readyCount = questions.filter((q) => !q.needs_review).length
  const reviewCount = questions.filter((q) => q.needs_review).length
  const approvedCount = questions.filter((q) => q.approved).length

  const filteredQuestions = questions.filter((q) => {
    if (filter === 'ready' && q.needs_review) return false
    if (filter === 'needs_review' && !q.needs_review) return false
    if (sectionFilter !== 'all' && q.section !== sectionFilter) return false
    return true
  })

  // ── Solution PDF upload handler ───────────────────────────────────────────
  const handleSolutionPdfUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please upload a valid PDF file.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('Solution PDF size must be under 25MB.')
      return
    }
    setPdfUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      setSolutionPdf(reader.result)
      setSolutionPdfName(file.name)
      setPdfUploading(false)
    }
    reader.onerror = () => {
      alert('Failed to read PDF file.')
      setPdfUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const removeSolutionPdf = () => {
    setSolutionPdf(null)
    setSolutionPdfName('')
  }

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

  const addSection = () => {
    const trimmed = newSecInput.trim()
    if (!trimmed) return
    if (!sections.includes(trimmed)) {
      setSections(prev => [...prev, trimmed])
    }
    setNewSecInput('')
  }

  const removeSection = (secName) => {
    if (sections.length <= 1) {
      alert('You must have at least one section configured.')
      return
    }
    const fallbackSec = sections.find(s => s !== secName)
    if (!window.confirm(`Delete section "${secName}"? Questions assigned to "${secName}" will be reassigned to "${fallbackSec}".`)) {
      return
    }
    setSections(prev => prev.filter(s => s !== secName))
    setQuestions(prev => prev.map(q => q.section === secName ? { ...q, section: fallbackSec } : q))
    if (sectionFilter === secName) setSectionFilter('all')
  }

  const handleFinalSubmit = () => {
    const approvedList = questions.filter((q) => q.approved)
    if (approvedList.length === 0) {
      alert('Please approve at least 1 question to import.')
      return
    }

    const missingSec = approvedList.some(q => !q.section || !q.section.trim())
    if (missingSec) {
      alert('Please ensure every approved question has a valid section assigned.')
      return
    }

    // Ensure all approved questions are strictly mapped to admin-configured sections
    // and sorted by the admin's configured section order
    const sectionOrderMap = {}
    sections.forEach((s, idx) => { sectionOrderMap[s] = idx })

    const sortedApprovedList = [...approvedList].map(q => ({
      ...q,
      section: (q.section && sections.includes(q.section)) ? q.section : (sections[0] || 'Section A'),
    })).sort((a, b) => {
      const rankA = sectionOrderMap[a.section] !== undefined ? sectionOrderMap[a.section] : 999
      const rankB = sectionOrderMap[b.section] !== undefined ? sectionOrderMap[b.section] : 999
      if (rankA !== rankB) return rankA - rankB
      return (a.question_number || 0) - (b.question_number || 0)
    })

    let startIso = null
    let endIso = null
    if (enableWindow) {
      startIso = parseToISTIso(availStart)
      endIso = parseToISTIso(availEnd)
      if (startIso && endIso && new Date(startIso) >= new Date(endIso)) {
        alert('Availability End Time must be strictly after Availability Start Time.')
        return
      }
    }

    const numQuestions = questions?.length || 1
    const parsedDur = parseFloat(totalDuration)
    const isPos = !isNaN(parsedDur) && parsedDur > 0
    const decParts = String(totalDuration).split('.')
    const decCount = decParts.length > 1 ? decParts[1].length : 0

    if (!isPos) {
      alert('Total Quiz Duration must be greater than 0 minutes.')
      return
    }
    if (decCount > 2) {
      alert('Total Quiz Duration cannot have more than 2 decimal places.')
      return
    }

    const perQMin = (parsedDur / numQuestions).toFixed(2)

    const extraConfig = {
      title: quizTitle.trim() || 'Imported Quiz',
      total_duration_minutes: Number(Number(parsedDur).toFixed(2)),
      totalDurationMin: Number(Number(parsedDur).toFixed(2)),
      timePerQ: Math.round(Number(perQMin) * 60),
      timePerQMin: Number(perQMin),
      instructions,
      solution_pdf: solutionPdf,
      solution_pdf_name: solutionPdfName,
      availability_start: startIso,
      availability_end: endIso,
      sections,
    }

    const fn = onConfirmImport || onConfirm
    if (fn) fn(sortedApprovedList, extraConfig)
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
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
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

      {/* ── Section Assignment & Breakdown Bar ── */}
      <div style={{ background: '#fdf4ff', borderRadius: 14, border: '1.5px solid #f0abfc', padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📑</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#701a75' }}>
              Section Allocation & Question Counts
            </span>
            <span style={{ fontSize: 11, background: '#fae8ff', color: '#86198f', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>
              {sections.length} active sections
            </span>
          </div>

          {/* Quick add section */}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="inp"
              placeholder="+ New section name"
              value={newSecInput}
              onChange={e => setNewSecInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSection() } }}
              style={{ fontSize: 12, padding: '4px 8px', width: 170 }}
            />
            <button
              type="button"
              onClick={addSection}
              disabled={!newSecInput.trim()}
              className="btn-sec"
              style={{ fontSize: 12, padding: '4px 10px', fontWeight: 700, color: '#a21caf', borderColor: '#f0abfc' }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Section Pills with Question Counts & Filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setSectionFilter('all')}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              border: `1.5px solid ${sectionFilter === 'all' ? '#a21caf' : '#e9d5ff'}`,
              background: sectionFilter === 'all' ? '#a21caf' : '#fff',
              color: sectionFilter === 'all' ? '#fff' : '#701a75',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            All Sections ({questions.length})
          </button>
          {sections.map(sec => {
            const count = questions.filter(q => q.section === sec).length
            const isSelected = sectionFilter === sec
            return (
              <div
                key={sec}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: `1.5px solid ${isSelected ? '#9333ea' : '#e9d5ff'}`,
                  background: isSelected ? '#ede9fe' : '#fff',
                  cursor: 'pointer'
                }}
                onClick={() => setSectionFilter(sec)}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: isSelected ? '#581c87' : '#7e22ce' }}>
                  {sec}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, background: '#f5d0fe', color: '#701a75', padding: '1px 6px', borderRadius: 10 }}>
                  {count} Qs
                </span>
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSection(sec) }}
                    title={`Delete section ${sec}`}
                    style={{ background: 'none', border: 'none', color: '#c084fc', cursor: 'pointer', padding: 0, fontWeight: 800, fontSize: 13, lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Test Configuration: Title, Timing, Instructions, Availability Window & Solution PDF ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showConfig ? 12 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setShowConfig(!showConfig)}>
            <span style={{ fontSize: 15 }}>⚙️</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
              Quiz Settings & Guidelines (Title, Timing, Instructions, Availability & Solution PDF)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            {showConfig ? '▲ Collapse' : '▼ Expand'}
          </button>
        </div>

        {showConfig && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Title & Timing */}
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 4 }}>
                  📋 Quiz Title
                </label>
                <input
                  type="text"
                  className="inp"
                  value={quizTitle}
                  onChange={e => setQuizTitle(e.target.value)}
                  placeholder="e.g. JEE Main Chemistry Mock 2026"
                  style={{ width: '100%', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 4 }}>
                  ⏱️ Total Quiz Duration (minutes)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="inp"
                  value={totalDuration}
                  onChange={e => setTotalDuration(e.target.value)}
                  style={{ width: '100%', fontSize: 13, boxSizing: 'border-box' }}
                  placeholder="e.g. 60.00"
                />
                <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 3 }}>
                  Per-question time: <strong>{(() => {
                    const dur = parseFloat(totalDuration)
                    const n = questions?.length || 1
                    return (!isNaN(dur) && dur > 0) ? (dur / n).toFixed(2) : '0.00'
                  })()} min/q</strong> ({Number(parseFloat(totalDuration) || 0).toFixed(2)} min ÷ {questions?.length || 1} questions)
                </span>
              </div>

              {/* Solution PDF */}
              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 4 }}>
                  📑 Official Solution PDF (Optional)
                </label>
                {solutionPdf ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ecfdf5', padding: '6px 10px', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                      ✓ {solutionPdfName || 'Solution Attached'}
                    </span>
                    <button
                      type="button"
                      onClick={removeSolutionPdf}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      id="bulk-solution-pdf"
                      accept="application/pdf"
                      onChange={handleSolutionPdfUpload}
                      style={{ display: 'none' }}
                      disabled={pdfUploading}
                    />
                    <label
                      htmlFor="bulk-solution-pdf"
                      style={{
                        display: 'inline-block',
                        padding: '5px 10px',
                        background: '#fff',
                        border: '1px dashed #94a3b8',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#475569'
                      }}
                    >
                      {pdfUploading ? 'Reading PDF…' : '+ Attach Solution PDF'}
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Test Instructions Editor */}
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: 12, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 4 }}>
                📝 Test Instructions (Shown on Student Pre-Test Screen)
              </label>
              <textarea
                className="inp"
                rows={5}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="Enter rules, marking instructions, notes..."
                style={{ width: '100%', fontSize: 12, lineHeight: 1.5, boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                Instructions will be shown to students before they click "Start Test Now".
              </span>
            </div>

            {/* Test Availability Window */}
            <div style={{ background: '#fafbff', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #c7d2fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <label style={{ margin: 0, color: '#312e81', fontSize: 12, fontWeight: 800 }}>
                    🕒 Test Availability Window
                  </label>
                  <div style={{ fontSize: 11, color: '#6366f1', marginTop: 1 }}>
                    Default Time Zone: <strong>Asia/Kolkata (IST)</strong>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={enableWindow} onChange={e => setEnableWindow(e.target.checked)} />
                  Enforce Window
                </label>
              </div>

              {enableWindow ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#475569', display: 'block', marginBottom: 3, fontWeight: 600 }}>Available From (IST)</label>
                    <input
                      type="datetime-local"
                      className="inp"
                      value={availStart}
                      onChange={e => setAvailStart(e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '5px 7px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#475569', display: 'block', marginBottom: 3, fontWeight: 600 }}>Available Until (IST)</label>
                    <input
                      type="datetime-local"
                      className="inp"
                      value={availEnd}
                      onChange={e => setAvailEnd(e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '5px 7px' }}
                    />
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>
                  Availability window is currently disabled (Always Available). Check "Enforce Window" to restrict test access to a specific IST timeframe.
                </p>
              )}
            </div>
          </div>
        )}
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

          const curSec = (q.section && sections.includes(q.section)) ? q.section : (sections[0] || 'Section A')
          const questionsInCurSec = questions.filter(x => ((x.section && sections.includes(x.section)) ? x.section : (sections[0] || 'Section A')) === curSec)
          const qIndexInSec = questionsInCurSec.findIndex(x => x === q || x.question_number === q.question_number)
          const qInSec = qIndexInSec >= 0 ? qIndexInSec + 1 : 1
          const totInSec = questionsInCurSec.length

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

                  <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: '#ede9fe', color: '#5b21b6' }}>
                    {curSec} · Q{qInSec}/{totInSec}
                  </span>

                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: '#f1f5f9', color: '#475569' }}>
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
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#6b21a8', display: 'block', marginBottom: 3 }}>
                        Section Assignment
                      </span>
                      <select
                        className="inp"
                        value={sections.includes(q.section) ? q.section : (sections[0] || 'Section A')}
                        onChange={(e) => updateQuestion(q.question_number, 'section', e.target.value)}
                        style={{ width: '100%', fontSize: 12, padding: '5px 8px', fontWeight: 800, color: '#581c87', background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: 8, cursor: 'pointer' }}
                      >
                        {sections.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
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
