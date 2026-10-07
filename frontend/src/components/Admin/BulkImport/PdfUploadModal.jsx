import { useState, useRef, useEffect } from 'react'
import { analyzePdfForImport } from '../../../services/quizService.js'

export default function PdfUploadModal({ open, onClose, onAnalysisComplete, quizId = null }) {
  const [file, setFile] = useState(null)
  const [quizTitle, setQuizTitle] = useState('')
  const [totalDuration, setTotalDuration] = useState('60.00')
  const [posMarks, setPosMarks] = useState(4)
  const [negMarks, setNegMarks] = useState(1)
  const [sections, setSections] = useState(['Section A', 'Section B', 'Section C', 'Section D'])
  const [newSecInput, setNewSecInput] = useState('')
  const [instructions, setInstructions] = useState(
    '• Read each question carefully before choosing an answer.\n• Marking scheme and question types are set based on the examination paper.\n• Clear Response button is available to deselect any answer.\n• Test will auto-submit when the overall timer expires.'
  )
  const [enableWindow, setEnableWindow] = useState(false)
  const [availStart, setAvailStart] = useState('')
  const [availEnd, setAvailEnd] = useState('')
  const [solutionPdf, setSolutionPdf] = useState(null)
  const [solutionPdfName, setSolutionPdfName] = useState('')
  const [pdfUploading, setPdfUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [progressStep, setProgressStep] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setQuizTitle('')
      setTotalDuration('60.00')
      setSolutionPdf(null)
      setSolutionPdfName('')
      setError('')
      setAnalyzing(false)
      setProgressStep('')
    }
  }, [open])

  if (!open) return null

  const parseToISTIso = (val) => {
    if (!val) return null
    try {
      return new Date(`${val}:00+05:30`).toISOString()
    } catch {
      return null
    }
  }

  const addSection = () => {
    const trimmed = newSecInput.trim()
    if (!trimmed) return
    if (!sections.includes(trimmed)) {
      setSections([...sections, trimmed])
    }
    setNewSecInput('')
  }

  const removeSection = (name) => {
    if (sections.length <= 1) {
      alert('You must have at least one section configured.')
      return
    }
    setSections(sections.filter(s => s !== name))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.pdf')) {
      setFile(droppedFile)
      if (!quizTitle) {
        setQuizTitle(droppedFile.name.replace(/\.pdf$/i, '').replace(/_/g, ' '))
      }
      setError('')
    } else {
      setError('Please select a valid PDF file.')
    }
  }

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected && selected.name.toLowerCase().endsWith('.pdf')) {
      setFile(selected)
      if (!quizTitle) {
        setQuizTitle(selected.name.replace(/\.pdf$/i, '').replace(/_/g, ' '))
      }
      setError('')
    } else if (selected) {
      setError('Please select a valid PDF file.')
    }
  }

  const handleSolutionPdfUpload = (e) => {
    const sFile = e.target.files?.[0]
    if (!sFile) return
    if (sFile.type !== 'application/pdf' && !sFile.name.toLowerCase().endsWith('.pdf')) {
      alert('Please upload a valid PDF file.')
      return
    }
    if (sFile.size > 25 * 1024 * 1024) {
      alert('Solution PDF size must be under 25MB.')
      return
    }
    setPdfUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      setSolutionPdf(reader.result)
      setSolutionPdfName(sFile.name)
      setPdfUploading(false)
    }
    reader.onerror = () => {
      alert('Failed to read PDF file.')
      setPdfUploading(false)
    }
    reader.readAsDataURL(sFile)
  }

  const removeSolutionPdf = () => {
    setSolutionPdf(null)
    setSolutionPdfName('')
  }

  const handleStartAnalysis = async () => {
    if (!file) {
      setError('Please select a PDF file.')
      return
    }

    let startIso = null
    let endIso = null
    if (enableWindow) {
      startIso = parseToISTIso(availStart)
      endIso = parseToISTIso(availEnd)
      if (startIso && endIso && new Date(startIso) >= new Date(endIso)) {
        setError('Availability End Time must be strictly after Availability Start Time.')
        return
      }
    }

    if (sections.length === 0) {
      setError('Please configure at least one section for question assignment.')
      return
    }

    const parsedDur = parseFloat(totalDuration)
    if (isNaN(parsedDur) || parsedDur <= 0) {
      setError('Please enter a valid Total Quiz Duration greater than 0.')
      return
    }
    const parts = String(totalDuration).split('.')
    if (parts.length > 1 && parts[1].length > 2) {
      setError('Total Quiz Duration cannot have more than 2 decimal places.')
      return
    }

    setError('')
    setAnalyzing(true)

    // Friendly progress simulation
    const steps = [
      'Reading PDF pages & vector structure...',
      'Detecting question boundaries across page breaks...',
      'Extracting diagrams, graphs & chemical structures...',
      'Parsing options & authoritative answer keys...',
      'Finalizing side-by-side verification preview...',
    ]
    let stepIdx = 0
    setProgressStep(steps[0])
    const interval = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length
      setProgressStep(steps[stepIdx])
    }, 1800)

    try {
      const data = await analyzePdfForImport(file, {
        defaultPosMarks: Number(posMarks) || 4,
        defaultNegMarks: Number(negMarks) || 1,
        defaultSection: sections[0] || 'Section A',
      })
      clearInterval(interval)
      setAnalyzing(false)
      const qCount = data?.total_questions || data?.questions?.length || 10
      const perQMin = Number((parsedDur / qCount).toFixed(2))
      onAnalysisComplete({
        ...data,
        title: quizTitle.trim() || (file ? file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ') : 'Imported Quiz'),
        totalDurationMinutes: Number(Number(parsedDur).toFixed(2)),
        timePerQMin: perQMin,
        timePerQ: Math.round(perQMin * 60),
        solutionPdf,
        solutionPdfName,
        configuredSections: sections,
        customInstructions: instructions,
        availabilityStart: startIso,
        availabilityEnd: endIso,
        enableWindow,
        rawAvailStart: availStart,
        rawAvailEnd: availEnd,
      })
    } catch (err) {
      clearInterval(interval)
      setAnalyzing(false)
      setError(err?.response?.data?.detail || err.message || 'Failed to extract questions from PDF.')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div
        onClick={analyzing ? null : onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)' }}
      />

      {/* Modal Box */}
      <div style={{
        position: 'relative',
        background: '#fff',
        width: '100%',
        maxWidth: 640,
        maxHeight: '90vh',
        borderRadius: 20,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        padding: '2rem',
        margin: '1rem',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              ⚡
            </div>
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: '#111827' }}>
                Bulk Import from PDF
              </h3>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 0' }}>
                Extract questions, configure sections & set test guidelines
              </p>
            </div>
          </div>
          {!analyzing && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#9ca3af', cursor: 'pointer', padding: 4, lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#6366f1' : file ? '#10b981' : '#cbd5e1'}`,
            borderRadius: 14,
            padding: '22px 16px',
            textAlign: 'center',
            background: dragOver ? '#f5f3ff' : file ? '#f0fdf4' : '#f8fafc',
            cursor: analyzing ? 'default' : 'pointer',
            transition: 'all .2s ease',
            marginBottom: 16,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={analyzing}
          />
          <div style={{ fontSize: 32, marginBottom: 6 }}>
            {file ? '📄' : '📤'}
          </div>
          {file ? (
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#065f46' }}>
                {file.name}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {(file.size / (1024 * 1024)).toFixed(2)} MB • Click to replace
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#334155' }}>
                Drag & drop your question paper PDF here
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                or click to browse your computer
              </div>
            </div>
          )}
        </div>

        {/* Quiz Title & Minutes per Question */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
              Quiz Title
            </label>
            <input
              type="text"
              className="inp"
              placeholder="e.g. JEE Main Chemistry Mock 2026"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              disabled={analyzing}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
              Total Quiz Duration (minutes)
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="inp"
              value={totalDuration}
              onChange={(e) => setTotalDuration(e.target.value)}
              disabled={analyzing}
              placeholder="e.g. 60.00"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Marks Scheme */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
              Default Positive Marks
            </label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              className="inp"
              value={posMarks}
              onChange={(e) => setPosMarks(e.target.value)}
              disabled={analyzing}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
              Default Negative Marks
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="inp"
              value={negMarks}
              onChange={(e) => setNegMarks(e.target.value)}
              disabled={analyzing}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Sections Configuration */}
        <div style={{ marginBottom: 16, background: '#faf5ff', border: '1.5px solid #e9d5ff', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 800, color: '#581c87', margin: 0 }}>
              📑 Configured Sections (For Question Assignment)
            </label>
            <span style={{ fontSize: 11, color: '#7e22ce', fontWeight: 600 }}>
              {sections.length} section{sections.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {sections.map(s => (
              <span
                key={s}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: '#fff',
                  border: '1px solid #c084fc',
                  color: '#6b21a8',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {s}
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSection(s)}
                    disabled={analyzing}
                    style={{ background: 'none', border: 'none', color: '#9333ea', cursor: 'pointer', padding: 0, fontWeight: 800, fontSize: 12 }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="inp"
              placeholder="Add section name (e.g. Section E, Physics)"
              value={newSecInput}
              onChange={e => setNewSecInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSection() } }}
              disabled={analyzing}
              style={{ flex: 1, fontSize: 12, padding: '5px 9px' }}
            />
            <button
              type="button"
              onClick={addSection}
              disabled={analyzing || !newSecInput.trim()}
              className="btn-sec"
              style={{ fontSize: 12, padding: '5px 12px', fontWeight: 700, borderColor: '#c084fc', color: '#6b21a8' }}
            >
              + Add
            </button>
          </div>
        </div>

        {/* Test Instructions */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
            📝 Test Instructions
          </label>
          <textarea
            className="inp"
            rows={3}
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            disabled={analyzing}
            placeholder="Enter test instructions for students..."
            style={{ width: '100%', fontSize: 12, lineHeight: 1.5, boxSizing: 'border-box' }}
          />
        </div>

        {/* Test Availability Window */}
        <div style={{ marginBottom: 16, border: '1.5px solid #c7d2fe', background: '#fafbff', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <label style={{ margin: 0, color: '#312e81', fontSize: 13, fontWeight: 800 }}>
                🕒 Test Availability Window
              </label>
              <div style={{ fontSize: 11, color: '#6366f1', marginTop: 1 }}>
                Default Time Zone: <strong>Asia/Kolkata (IST)</strong>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={enableWindow} onChange={e => setEnableWindow(e.target.checked)} disabled={analyzing} />
              Enforce Window
            </label>
          </div>

          {enableWindow && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: '#475569', display: 'block', marginBottom: 3, fontWeight: 600 }}>Available From (IST)</label>
                <input
                  type="datetime-local"
                  className="inp"
                  value={availStart}
                  onChange={e => setAvailStart(e.target.value)}
                  disabled={analyzing}
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
                  disabled={analyzing}
                  style={{ width: '100%', fontSize: 11, padding: '5px 7px' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Optional Solution PDF */}
        <div style={{ marginBottom: 18, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 4 }}>
            📑 Solution PDF (Optional)
          </label>
          {solutionPdf ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ecfdf5', padding: '6px 10px', borderRadius: 8, border: '1px solid #a7f3d0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                ✓ {solutionPdfName || 'Solution Attached'}
              </span>
              <button
                type="button"
                onClick={removeSolutionPdf}
                disabled={analyzing}
                style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <input
                type="file"
                id="modal-solution-pdf"
                accept="application/pdf"
                onChange={handleSolutionPdfUpload}
                style={{ display: 'none' }}
                disabled={analyzing || pdfUploading}
              />
              <label
                htmlFor="modal-solution-pdf"
                style={{
                  display: 'inline-block',
                  padding: '5px 12px',
                  background: '#fff',
                  border: '1px dashed #94a3b8',
                  borderRadius: 6,
                  cursor: analyzing || pdfUploading ? 'default' : 'pointer',
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

        {/* Error Alert */}
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>
            ⚠ {error}
          </div>
        )}

        {/* Progress State */}
        {analyzing && (
          <div style={{ marginBottom: 18, padding: '14px', background: '#f5f3ff', borderRadius: 12, border: '1px solid #ddd6fe' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 18, height: 18, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5' }}>
                {progressStep}
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
              Hybrid PyMuPDF engine is extracting vectors, structures, and answer keys without guessing.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn-sec"
            onClick={onClose}
            disabled={analyzing}
          >
            Cancel
          </button>
          <button
            className="btn-pri"
            onClick={handleStartAnalysis}
            disabled={analyzing || !file}
            style={{ minWidth: 140 }}
          >
            {analyzing ? 'Analyzing PDF…' : 'Extract Questions →'}
          </button>
        </div>
      </div>
    </div>
  )
}
