import { useState, useRef, useEffect } from 'react'
import { analyzePdfForImport } from '../../../services/quizService.js'

export default function PdfUploadModal({ open, onClose, onAnalysisComplete, quizId = null }) {
  const [file, setFile] = useState(null)
  const [posMarks, setPosMarks] = useState(4)
  const [negMarks, setNegMarks] = useState(1)
  const [section, setSection] = useState('General')
  const [analyzing, setAnalyzing] = useState(false)
  const [progressStep, setProgressStep] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setError('')
      setAnalyzing(false)
      setProgressStep('')
    }
  }, [open])

  if (!open) return null

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.pdf')) {
      setFile(droppedFile)
      setError('')
    } else {
      setError('Please select a valid PDF file.')
    }
  }

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected && selected.name.toLowerCase().endsWith('.pdf')) {
      setFile(selected)
      setError('')
    } else if (selected) {
      setError('Please select a valid PDF file.')
    }
  }

  const handleStartAnalysis = async () => {
    if (!file) {
      setError('Please select a PDF file.')
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
        defaultSection: section || 'General',
      })
      clearInterval(interval)
      setAnalyzing(false)
      onAnalysisComplete(data)
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
        maxWidth: 540,
        borderRadius: 20,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        padding: '2rem',
        margin: '1rem',
        overflow: 'hidden',
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
                High-accuracy question, diagram, & answer extraction
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
            padding: '28px 16px',
            textAlign: 'center',
            background: dragOver ? '#f5f3ff' : file ? '#f0fdf4' : '#f8fafc',
            cursor: analyzing ? 'default' : 'pointer',
            transition: 'all .2s ease',
            marginBottom: 18,
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
          <div style={{ fontSize: 36, marginBottom: 8 }}>
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

        {/* Configuration Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
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

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
            Default Section Name
          </label>
          <input
            className="inp"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="e.g. Physics or Section A"
            disabled={analyzing}
            style={{ width: '100%' }}
          />
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
