import { useState } from 'react'
import { uid } from '../../services/utils.js'

export default function SectionConfig({ onDone, onBack, onBulkImportClick }) {
  const [title, setTitle] = useState('')
  const [timePerQ, setTimePerQ] = useState(5)
  const [posMarks, setPosMarks] = useState(4)
  const [negMarks, setNegMarks] = useState(1)
  const [instructions, setInstructions] = useState(
    '• Read each question carefully before choosing an answer.\n' +
    '• Each question has positive marks for correct answers and negative marking for incorrect answers.\n' +
    '• No marks are deducted for skipped/unattempted questions.\n' +
    '• Clear Response: You can clear a selected response anytime without affecting Mark for Review.\n' +
    '• The test will auto-submit when the overall test time expires.'
  )
  const [solutionPdf, setSolutionPdf] = useState(null)
  const [solutionPdfName, setSolutionPdfName] = useState('')
  const [pdfUploading, setPdfUploading] = useState(false)
  const [sections, setSections] = useState([{ name: 'Section A', count: 5 }])

  // Test Availability Window (Asia/Kolkata IST)
  // Default to today/tomorrow in IST
  const now = new Date()
  const toLocalInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const [availStart, setAvailStart] = useState(toLocalInput(now))
  const [availEnd, setAvailEnd] = useState(toLocalInput(tomorrow))
  const [enableWindow, setEnableWindow] = useState(true)

  const addSec = () => setSections(s => [...s, { name: `Section ${String.fromCharCode(65 + s.length)}`, count: 5 }])
  const remSec = i => setSections(s => s.filter((_, j) => j !== i))
  const upSec = (i, f, v) => setSections(s => s.map((x, j) => j === i ? { ...x, [f]: v } : x))
  const totalQ = sections.reduce((a, s) => a + Number(s.count), 0)

  const handlePdfUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      alert('Please upload a valid PDF file.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('PDF file size should be less than 25MB.')
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

  const removePdf = () => {
    setSolutionPdf(null)
    setSolutionPdfName('')
  }

  const parseToISTIso = (val) => {
    if (!val) return null
    // Treats local input as Asia/Kolkata (IST +05:30)
    try {
      const iso = new Date(`${val}:00+05:30`).toISOString()
      return iso
    } catch {
      return null
    }
  }

  const formatPreview = (val) => {
    if (!val) return 'Not set'
    try {
      const d = new Date(`${val}:00+05:30`)
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' IST'
    } catch {
      return val
    }
  }

  const build = () => {
    if (!title.trim()) { alert('Enter a quiz title.'); return }
    if (totalQ < 1) { alert('Add at least 1 question.'); return }

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

    const questions = []
    sections.forEach(sec => {
      for (let i = 0; i < Number(sec.count); i++)
        questions.push({
          id: uid(),
          text: '',
          options: ['', '', '', ''],
          correct: null,
          explanation: '',
          section: sec.name,
          diagram: null,
          positive_marks: Number(posMarks) || 4,
          negative_marks: Number(negMarks) || 0
        })
    })

    onDone(
      questions,
      title,
      timePerQ * 60,
      instructions,
      solutionPdf,
      solutionPdfName,
      startIso,
      endIso
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 18 }}>← Back</button>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px', color: '#111827' }}>Configure Quiz</h2>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        Set title, availability window, timing, and marking scheme.
      </p>

      {onBulkImportClick && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          background: 'linear-gradient(135deg, #eef2ff, #fdf4ff)',
          border: '1.5px dashed #a5b4fc',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#4338ca' }}>
              ⚡ Have a Question Paper PDF?
            </div>
            <div style={{ fontSize: 12, color: '#6366f1' }}>
              Auto-extract questions, diagrams & options with side-by-side review.
            </div>
          </div>
          <button
            type="button"
            className="btn-sec"
            onClick={onBulkImportClick}
            style={{
              padding: '7px 13px',
              fontSize: 12,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Bulk Import PDF →
          </button>
        </div>
      )}

      {/* Basic Info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <label className="lbl">Quiz Title</label>
          <input className="inp" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. JEE Advanced Physics — Thermodynamics" />
        </div>
        <div>
          <label className="lbl">Minutes per question (Individual Attempt Duration)</label>
          <input type="number" className="inp" min={1} max={30} value={timePerQ}
            onChange={e => setTimePerQ(Math.max(1, +e.target.value))} style={{ width: 140 }} />
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 10 }}>
            Total test duration: ~{timePerQ * totalQ} minutes
          </span>
        </div>
      </div>

      {/* Feature 2: Test Availability Window */}
      <div className="card" style={{ marginBottom: 16, border: '1.5px solid #c7d2fe', background: '#fafbff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <label className="lbl" style={{ margin: 0, color: '#312e81', fontSize: 14, fontWeight: 800 }}>
              🕒 Test Availability Window
            </label>
            <div style={{ fontSize: 12, color: '#6366f1', marginTop: 2 }}>
              Default Time Zone: <strong>Asia/Kolkata (IST)</strong>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={enableWindow} onChange={e => setEnableWindow(e.target.checked)} />
            Enforce Window
          </label>
        </div>

        {enableWindow ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="lbl" style={{ fontSize: 11, color: '#475569' }}>Available From (IST)</label>
                <input
                  type="datetime-local"
                  className="inp"
                  value={availStart}
                  onChange={e => setAvailStart(e.target.value)}
                  style={{ fontSize: 12 }}
                />
              </div>
              <div>
                <label className="lbl" style={{ fontSize: 11, color: '#475569' }}>Available Until (IST)</label>
                <input
                  type="datetime-local"
                  className="inp"
                  value={availEnd}
                  onChange={e => setAvailEnd(e.target.value)}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: '#e0e7ff', borderRadius: 8, fontSize: 12, color: '#3730a3', lineHeight: 1.5 }}>
              <div><strong>Available From:</strong> {formatPreview(availStart)}</div>
              <div><strong>Available Until:</strong> {formatPreview(availEnd)}</div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
            Test will be open indefinitely once published.
          </p>
        )}
      </div>

      {/* Sections Config */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <label className="lbl" style={{ margin: 0 }}>Sections</label>
          <button onClick={addSec} style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', background: 'none', border: '1.5px dashed #c4b5fd', borderRadius: 7, padding: '4px 11px', cursor: 'pointer' }}>
            + Add section
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 34px', gap: 9, marginBottom: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>Name</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>Questions</span>
          <span />
        </div>
        {sections.map((sec, i) => (
          <div key={i} className="sec-row">
            <input className="inp-sm" value={sec.name} onChange={e => upSec(i, 'name', e.target.value)} placeholder={`Section ${i + 1}`} />
            <input type="number" className="inp-sm" min={1} max={100} value={sec.count} onChange={e => upSec(i, 'count', Math.max(1, +e.target.value))} />
            {sections.length > 1
              ? <button onClick={() => remSec(i)} style={{ width: 32, height: 32, borderRadius: 7, border: '1.5px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>×</button>
              : <div />}
          </div>
        ))}
        <div style={{ marginTop: 10, padding: '9px 13px', background: '#f5f3ff', borderRadius: 9, fontSize: 13, color: '#6366f1', fontWeight: 700 }}>
          Total: {totalQ} questions · {sections.length} section{sections.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Default Marking Scheme */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label className="lbl" style={{ marginBottom: 6 }}>Default Marking Scheme</label>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
          Can be customized per-question in the question editor.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="lbl" style={{ color: '#059669' }}>+ Correct Marks</label>
            <input type="number" step="0.25" min={0} className="inp" value={posMarks}
              onChange={e => setPosMarks(Math.max(0, +e.target.value))} />
          </div>
          <div>
            <label className="lbl" style={{ color: '#dc2626' }}>- Negative Marks</label>
            <input type="number" step="0.25" min={0} className="inp" value={negMarks}
              onChange={e => setNegMarks(Math.max(0, +e.target.value))} />
          </div>
        </div>
      </div>

      {/* Test Instructions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label className="lbl" style={{ marginBottom: 6 }}>Test Instructions</label>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
          Presented to students on the dedicated Pre-Test Instructions screen before the test timer starts.
        </p>
        <textarea
          className="textarea"
          rows={4}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Enter instructions for students taking this test..."
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.5 }}
        />
      </div>

      {/* Detailed Solution PDF Upload (Feature 4 A) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label className="lbl" style={{ margin: 0 }}>Detailed Solution PDF (Optional)</label>
          {solutionPdf && (
            <button onClick={removePdf} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>
              Remove PDF
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
          Upload official answer key & detailed solution PDF. Released to students after test completion.
        </p>
        {solutionPdf ? (
          <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>
              📄 {solutionPdfName || 'Solution.pdf'}
            </span>
            <label style={{ fontSize: 12, color: '#6366f1', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
              Replace
              <input type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: 'none' }} />
            </label>
          </div>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', border: '1.5px dashed #c4b5fd', borderRadius: 10, background: '#faf5ff', cursor: pdfUploading ? 'wait' : 'pointer' }}>
            <span style={{ fontSize: 24, marginBottom: 4 }}>📄</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>
              {pdfUploading ? 'Processing PDF…' : 'Upload Solution PDF'}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>PDF file up to 25MB</span>
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={pdfUploading} style={{ display: 'none' }} />
          </label>
        )}
      </div>

      <button className="btn-pri" style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 800 }} onClick={build}>
        Start Adding Questions →
      </button>
    </div>
  )
}
