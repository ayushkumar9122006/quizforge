import { useState } from 'react'
import { uid } from '../../services/utils.js'

export default function SectionConfig({ onDone, onBack }) {
  const [title,        setTitle]        = useState('')
  const [timePerQ,     setTimePerQ]     = useState(5)
  const [posMarks,     setPosMarks]     = useState(4)
  const [negMarks,     setNegMarks]     = useState(1)
  const [instructions, setInstructions] = useState(
    '• Read each question carefully before choosing an answer.\n' +
    '• Each question has positive marks for correct answers and negative marking for incorrect answers.\n' +
    '• No marks are deducted for skipped/unattempted questions.\n' +
    '• The test will auto-submit when the overall test time expires.'
  )
  const [solutionPdf,     setSolutionPdf]     = useState(null)
  const [solutionPdfName, setSolutionPdfName] = useState('')
  const [pdfUploading,    setPdfUploading]    = useState(false)
  const [sections, setSections] = useState([{ name:'Section A', count:5 }])

  const addSec    = () => setSections(s => [...s, { name:`Section ${String.fromCharCode(65+s.length)}`, count:5 }])
  const remSec    = i  => setSections(s => s.filter((_,j) => j !== i))
  const upSec     = (i,f,v) => setSections(s => s.map((x,j) => j===i ? {...x,[f]:v} : x))
  const totalQ    = sections.reduce((a,s) => a + Number(s.count), 0)

  const handlePdfUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      alert('Please upload a valid PDF file.')
      return
    }
    // Limit to 25MB
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

  const build = () => {
    if (!title.trim()) { alert('Enter a quiz title.'); return }
    if (totalQ < 1)    { alert('Add at least 1 question.'); return }
    const questions = []
    sections.forEach(sec => {
      for (let i=0; i<Number(sec.count); i++)
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
    onDone(questions, title, timePerQ * 60, instructions, solutionPdf, solutionPdfName)
  }

  return (
    <div style={{ maxWidth:520, margin:'0 auto', padding:'2rem 1.5rem' }}>
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom:18 }}>← Back</button>
      <h2 style={{ fontSize:21, fontWeight:800, margin:'0 0 4px' }}>Configure quiz</h2>
      <p style={{ color:'#6b7280', fontSize:14, marginBottom:22 }}>Set title, timing, and define sections.</p>

      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ marginBottom:14 }}>
          <label className="lbl">Quiz title</label>
          <input className="inp" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Physics — Chapter 3 Test" />
        </div>
        <div>
          <label className="lbl">Minutes per question</label>
          <input type="number" className="inp" min={1} max={30} value={timePerQ}
            onChange={e => setTimePerQ(Math.max(1,+e.target.value))} style={{ width:120 }} />
        </div>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <label className="lbl" style={{ margin:0 }}>Sections</label>
          <button onClick={addSec} style={{ fontSize:12, fontWeight:700, color:'#6366f1', background:'none', border:'1.5px dashed #c4b5fd', borderRadius:7, padding:'4px 11px', cursor:'pointer' }}>
            + Add section
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 34px', gap:9, marginBottom:7 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Name</span>
          <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Questions</span>
          <span />
        </div>
        {sections.map((sec,i) => (
          <div key={i} className="sec-row">
            <input className="inp-sm" value={sec.name} onChange={e => upSec(i,'name',e.target.value)} placeholder={`Section ${i+1}`} />
            <input type="number" className="inp-sm" min={1} max={100} value={sec.count} onChange={e => upSec(i,'count',Math.max(1,+e.target.value))} />
            {sections.length > 1
              ? <button onClick={() => remSec(i)} style={{ width:32,height:32,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',fontWeight:800,fontSize:16 }}>×</button>
              : <div />}
          </div>
        ))}
        <div style={{ marginTop:10, padding:'9px 13px', background:'#f5f3ff', borderRadius:9, fontSize:13, color:'#6366f1', fontWeight:700 }}>
          Total: {totalQ} questions · {sections.length} section{sections.length!==1?'s':''}
        </div>
      </div>

      {/* Default Marking Scheme */}
      <div className="card" style={{ marginBottom:14 }}>
        <label className="lbl" style={{ marginBottom:8 }}>Default Marking Scheme</label>
        <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 12px' }}>
          Can be customized per-question in the next step.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="lbl" style={{ color:'#059669' }}>+ Correct Marks</label>
            <input type="number" step="0.25" min={0} className="inp" value={posMarks}
              onChange={e => setPosMarks(Math.max(0, +e.target.value))} />
          </div>
          <div>
            <label className="lbl" style={{ color:'#dc2626' }}>- Negative Marks</label>
            <input type="number" step="0.25" min={0} className="inp" value={negMarks}
              onChange={e => setNegMarks(Math.max(0, +e.target.value))} />
          </div>
        </div>
      </div>

      {/* Test Instructions */}
      <div className="card" style={{ marginBottom:14 }}>
        <label className="lbl" style={{ marginBottom:6 }}>Test Instructions</label>
        <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 8px' }}>
          Shown to students before entering the room code modal.
        </p>
        <textarea
          className="textarea"
          rows={4}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Enter instructions for students taking this test..."
          style={{ width:'100%', boxSizing:'border-box', fontSize:13, lineHeight:1.5 }}
        />
      </div>

      {/* Solution PDF Upload */}
      <div className="card" style={{ marginBottom:18 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <label className="lbl" style={{ margin:0 }}>Solution PDF (Optional)</label>
          {solutionPdf && (
            <button onClick={removePdf} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:'1px solid #fca5a5', background:'#fff1f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>
              Remove PDF
            </button>
          )}
        </div>
        <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 10px' }}>
          Upload official answer key & solution PDF. Available to students after test completion.
        </p>
        {solutionPdf ? (
          <div style={{ padding:'10px 14px', background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#065f46' }}>
              📄 {solutionPdfName || 'Solution.pdf'}
            </span>
            <label style={{ fontSize:12, color:'#6366f1', fontWeight:700, cursor:'pointer', textDecoration:'underline' }}>
              Replace
              <input type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display:'none' }} />
            </label>
          </div>
        ) : (
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'16px', border:'1.5px dashed #c4b5fd', borderRadius:8, background:'#faf5ff', cursor:pdfUploading?'wait':'pointer' }}>
            <span style={{ fontSize:24, marginBottom:4 }}>📄</span>
            <span style={{ fontSize:13, fontWeight:700, color:'#6366f1' }}>
              {pdfUploading ? 'Processing PDF…' : 'Upload Solution PDF'}
            </span>
            <span style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>PDF file up to 25MB</span>
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={pdfUploading} style={{ display:'none' }} />
          </label>
        )}
      </div>

      <button className="btn-pri" style={{ width:'100%' }} onClick={build}>
        Start adding questions →
      </button>
    </div>
  )
}
