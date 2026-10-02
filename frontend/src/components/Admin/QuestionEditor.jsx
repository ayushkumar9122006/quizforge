import { useState, useEffect } from 'react'
import QuestionImagePanel from '../OCR/QuestionImagePanel.jsx'
import CropFromSource     from '../OCR/CropFromSource.jsx'

const LABELS = ['A','B','C','D','E','F']

/**
 * CropPanel — slide-in panel overlay (right side)
 * Used for all crop operations: question statement, options, diagram
 */
function CropPanel({ open, src, label, onCrop, onClose }) {
  useEffect(() => {
    if (!open) return
    const p = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = p }
  }, [open])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(10,10,25,.5)', zIndex:7999, opacity: open?1:0, pointerEvents:open?'auto':'none', transition:'opacity .22s' }}
      />
      {/* Panel */}
      <div style={{ position:'fixed', top:0, right:0, height:'100dvh', width:440, background:'#fff', boxShadow:'-6px 0 40px rgba(0,0,0,.16)', zIndex:8000, transform:open?'translateX(0)':'translateX(100%)', transition:'transform .26s cubic-bezier(.4,0,.2,1)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'12px 15px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontWeight:800, fontSize:14, color:'#111827' }}>✂️ Crop Region</span>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#9ca3af',padding:0,lineHeight:1 }}>×</button>
        </div>
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {open && src && (
            <CropFromSource
              src={src}
              label={label}
              onCrop={url => { onCrop(url); onClose() }}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </>
  )
}

/**
 * ImageField — shows a cropped image thumbnail with Re-crop button.
 * If no image yet, shows a placeholder with a Crop button.
 */
function ImageField({ value, onCrop, placeholder, disabled }) {
  const [lightbox, setLightbox] = useState(false)
  return (
    <div style={{ border:'1.5px solid #e5e7eb', borderRadius:10, overflow:'hidden', background:'#f9fafb' }}>
      {value ? (
        <div>
          <img
            src={value} alt="cropped"
            onClick={() => setLightbox(true)}
            style={{ width:'100%', maxHeight:110, objectFit:'contain', cursor:'zoom-in', display:'block', background:'#f9fafb' }}
          />
          {lightbox && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }} onClick={() => setLightbox(false)}>
              <img src={value} alt="zoom" style={{ maxWidth:'90vw', maxHeight:'90vh', borderRadius:10 }} />
            </div>
          )}
          <div style={{ padding:'6px 10px', borderTop:'1px solid #f3f4f6', display:'flex', gap:8 }}>
            <button
              onClick={onCrop} disabled={disabled}
              style={{ flex:1, padding:'5px', borderRadius:7, border:'1.5px solid #c4b5fd', background:'#f5f3ff', color:'#6366f1', fontSize:12, fontWeight:700, cursor:disabled?'not-allowed':'pointer', opacity:disabled?.5:1 }}>
              ✂️ Re-crop
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onCrop} disabled={disabled}
          style={{ width:'100%', padding:'18px 10px', background:'none', border:'none', cursor:disabled?'not-allowed':'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:7, opacity:disabled?.4:1 }}>
          <span style={{ fontSize:28 }}>✂️</span>
          <span style={{ fontSize:12, fontWeight:700, color:disabled?'#9ca3af':'#6366f1' }}>
            {disabled ? 'Upload image first' : placeholder}
          </span>
        </button>
      )}
    </div>
  )
}

export default function QuestionEditor({
  initQuestions,
  quizTitle,
  timePerQ,
  instructions,
  initSolutionPdf,
  initSolutionPdfName,
  onSave,
  onBack,
  saving,
  saveError,
  onBulkImportClick
}) {
  const [questions, setQuestions] = useState(
    initQuestions.map(q => ({
      ...q,
      positive_marks: q.positive_marks !== undefined ? Number(q.positive_marks) : 4,
      negative_marks: q.negative_marks !== undefined ? Number(q.negative_marks) : 1
    }))
  )
  const [cur,             setCur]             = useState(0)
  const [solutionPdf,     setSolutionPdf]     = useState(initSolutionPdf || null)
  const [solutionPdfName, setSolutionPdfName] = useState(initSolutionPdfName || '')

  // Full-page image upload panel
  const [showUpload, setShowUpload] = useState(false)

  // Crop panel state
  const [cropPanel, setCropPanel] = useState({
    open:    false,
    src:     null,
    label:   '',
    target:  null,   // 'question' | 'optionA' | 'optionB' | 'optionC' | 'optionD' | 'diagram'
  })

  const q      = questions[cur] || {}
  const srcImg = q.questionCropSrc   // the cropped single-question image = source for all sub-crops

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const upQ  = (f, v) => setQuestions(p => p.map((x, i) => i === cur ? { ...x, [f]: v } : x))
  const upOpt = (oi, v) => setQuestions(p => p.map((x, i) => {
    if (i !== cur) return x
    const o = [...x.options]; o[oi] = v; return { ...x, options: o }
  }))
  const addOpt = () => {
    if (q.options.length >= 6) return
    setQuestions(p => p.map((x, i) => i === cur ? { ...x, options: [...x.options, ''] } : x))
  }
  const rmOpt = oi => setQuestions(p => p.map((x, i) => {
    if (i !== cur) return x
    const o  = x.options.filter((_, j) => j !== oi)
    const nc = x.correct === oi ? null : (x.correct !== null && x.correct > oi ? x.correct - 1 : x.correct)
    return { ...x, options: o, correct: nc }
  }))

  // ── When admin has cropped the one question from the full page ───────────────
  const handleQuestionCropReady = src => {
    setQuestions(p => p.map((x, i) => i === cur ? { ...x, questionCropSrc: src } : x))
    setShowUpload(false)
  }

  // ── Open crop panel for a specific target ────────────────────────────────────
  const openCrop = (target) => {
    const labels = {
      question:  'Crop the PROBLEM STATEMENT text/image area',
      optionA:   'Crop OPTION A region',
      optionB:   'Crop OPTION B region',
      optionC:   'Crop OPTION C region',
      optionD:   'Crop OPTION D region',
      optionE:   'Crop OPTION E region',
      optionF:   'Crop OPTION F region',
      diagram:   'Crop the DIAGRAM / FIGURE area',
    }
    setCropPanel({ open: true, src: srcImg, label: labels[target] || 'Crop region', target })
  }

  // ── Apply cropped result to the right field ──────────────────────────────────
  const handleCropDone = url => {
    const t = cropPanel.target
    if (t === 'question') {
      upQ('qImage', url)
    } else if (t === 'diagram') {
      upQ('diagram', url)
    } else if (t.startsWith('option')) {
      const letter = t.replace('option', '')   // 'A','B','C','D'...
      const oi     = LABELS.indexOf(letter)
      if (oi >= 0) upOpt(oi, { type: 'image', src: url })
    }
    setCropPanel(p => ({ ...p, open: false }))
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  // FIX: allow image-type options (no text required)
  const optValid = opt => {
    if (!opt && opt !== 0) return false
    if (typeof opt === 'object' && opt.type === 'image') return !!opt.src
    return typeof opt === 'string' && opt.trim().length > 0
  }
  const questionValid = q => {
    const hasText  = q.text?.trim().length > 0
    const hasImage = !!q.qImage
    const hasQ     = hasText || hasImage
    const hasOpts  = q.options.length >= 2 && q.options.every(optValid)
    return hasQ && hasOpts
  }
  const allValid = questions.every(questionValid)

  const prog     = ((cur + 1) / questions.length) * 100
  const secName  = q.section
  const qInSec   = questions.slice(0, cur).filter(x => x.section === secName).length + 1
  const totInSec = questions.filter(x => x.section === secName).length

  return (
    <div style={{ maxWidth:860, margin:'0 auto', padding:'1.5rem 1.5rem 3rem', position:'relative' }}>

      {/* Full-page upload panel */}
      {showUpload && (
        <>
          <div style={{ position:'fixed', inset:0, background:'rgba(10,10,25,.5)', zIndex:7999 }} onClick={() => setShowUpload(false)} />
          <div style={{ position:'fixed', top:0, right:0, height:'100dvh', width:440, background:'#fff', boxShadow:'-6px 0 40px rgba(0,0,0,.16)', zIndex:8000, display:'flex', flexDirection:'column', overflow:'hidden', transform:'translateX(0)', transition:'transform .26s' }}>
            <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
              <QuestionImagePanel
                onQuestionCropReady={handleQuestionCropReady}
                onClose={() => setShowUpload(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* Sub-crop panel */}
      <CropPanel
        open={cropPanel.open}
        src={cropPanel.src}
        label={cropPanel.label}
        onCrop={handleCropDone}
        onClose={() => setCropPanel(p => ({ ...p, open: false }))}
      />

      {/* Top meta */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div>
          <span style={{ fontSize:13, fontWeight:700, color:'#6366f1' }}>{secName}</span>
          <span style={{ fontSize:13, color:'#9ca3af', marginLeft:8 }}>
            Q{qInSec}/{totInSec} in section · Overall {cur + 1}/{questions.length}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {onBulkImportClick && (
            <button
              type="button"
              className="btn-sec"
              onClick={onBulkImportClick}
              style={{ fontSize:12, padding:'5px 12px', display:'flex', alignItems:'center', gap:5, fontWeight:700, color:'#4f46e5', borderColor:'#c7d2fe', background:'#f5f3ff', cursor:'pointer' }}>
              ⚡ Bulk Import from PDF
            </button>
          )}
          <button className="btn-ghost" onClick={onBack}>← Exit</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:4, background:'#f3f4f6', borderRadius:2, marginBottom:18 }}>
        <div className="pbar-fill" style={{ height:'100%', width:`${prog}%`, background:'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius:2 }} />
      </div>

      {/* ── Step 1: Upload question image ── */}
      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <span style={{ fontSize:11, fontWeight:800, color:'#6366f1', letterSpacing:'.06em', textTransform:'uppercase', background:'#ede9fe', padding:'3px 9px', borderRadius:20 }}>
              {secName}
            </span>
            <span style={{ fontSize:12, color:'#9ca3af', marginLeft:10 }}>Step 1: Upload full page → crop one question</span>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9, border:'1.5px solid #c4b5fd', background:'#f5f3ff', color:'#6366f1', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            {srcImg ? '🔄 Replace image' : '📄 Upload & crop question'}
          </button>
        </div>

        {/* Show the cropped question image if available */}
        {srcImg ? (
          <div style={{ marginBottom:14, padding:'10px', background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:10 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#065f46', marginBottom:8 }}>
              ✓ Question image loaded — now crop each field below
            </div>
            <img src={srcImg} alt="question source"
              style={{ maxWidth:'100%', maxHeight:140, objectFit:'contain', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', display:'block' }} />
          </div>
        ) : (
          <div style={{ padding:'16px', background:'#f9fafb', border:'1.5px dashed #d1d5db', borderRadius:10, textAlign:'center', color:'#9ca3af', fontSize:13, marginBottom:14 }}>
            📄 Upload the full question paper image first, then crop this question from it.<br/>
            All fields below will be cropped from that image.
          </div>
        )}

        {/* ── Step 2: Crop each field ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

          {/* Left column: problem statement + options */}
          <div>
            {/* Problem statement */}
            <label className="lbl">Problem Statement</label>
            <div style={{ marginBottom:4 }}>
              <ImageField
                value={q.qImage}
                onCrop={() => openCrop('question')}
                placeholder="Crop problem statement"
                disabled={!srcImg}
              />
            </div>
            {/* Also allow manual text */}
            <textarea className="textarea" rows={2} value={q.text || ''} onChange={e => upQ('text', e.target.value)}
              placeholder="Or type question text here (optional if image set)"
              style={{ marginBottom:14, marginTop:6 }} />

            {/* Options */}
            <label className="lbl">
              Options
              <span style={{ textTransform:'none', fontWeight:400, color:'#9ca3af', marginLeft:6 }}>
                (click radio = correct · leave unset → AI resolves)
              </span>
            </label>

            {q.options.map((opt, oi) => {
              const isImg = opt && typeof opt === 'object' && opt.type === 'image'
              return (
                <div key={oi} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:10 }}>
                  {/* Radio */}
                  <div onClick={() => upQ('correct', q.correct === oi ? null : oi)}
                    style={{ width:24, height:24, borderRadius:'50%', border:`2.5px solid ${q.correct===oi?'#6366f1':'#d1d5db'}`, background:q.correct===oi?'#6366f1':'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, marginTop:isImg?4:0, transition:'all .13s' }}>
                    {q.correct === oi && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
                  </div>
                  {/* Letter */}
                  <span style={{ width:22, height:22, borderRadius:5, background:q.correct===oi?'#6366f1':'#f3f4f6', color:q.correct===oi?'#fff':'#6b7280', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0, marginTop:isImg?4:0 }}>
                    {LABELS[oi]}
                  </span>
                  {/* Content: image or text + crop button */}
                  <div style={{ flex:1 }}>
                    {isImg ? (
                      <div style={{ border:`1.5px solid ${q.correct===oi?'#6366f1':'#e5e7eb'}`, borderRadius:9, overflow:'hidden', background:q.correct===oi?'#f5f3ff':'#fff' }}>
                        <img src={opt.src} alt={`opt ${LABELS[oi]}`}
                          style={{ width:'100%', maxHeight:64, objectFit:'contain', display:'block', background:'#f9fafb', cursor:'zoom-in' }}
                          onClick={() => window.open(opt.src)} />
                        <div style={{ padding:'5px 8px', borderTop:'1px solid #f3f4f6', display:'flex', gap:7 }}>
                          <button onClick={() => openCrop(`option${LABELS[oi]}`)} disabled={!srcImg}
                            style={{ fontSize:11, padding:'3px 9px', borderRadius:6, border:'1.5px solid #c4b5fd', background:'#f5f3ff', color:'#6366f1', cursor:srcImg?'pointer':'not-allowed', fontWeight:700 }}>
                            ✂️ Re-crop
                          </button>
                          <button onClick={() => upOpt(oi, '')}
                            style={{ fontSize:11, padding:'3px 9px', borderRadius:6, border:'1.5px solid #fca5a5', background:'#fff1f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:7 }}>
                        <input className="inp" value={typeof opt === 'string' ? opt : ''} onChange={e => upOpt(oi, e.target.value)}
                          placeholder={`Option ${LABELS[oi]} text`}
                          style={{ flex:1, borderColor:q.correct===oi?'#6366f1':'#d1d5db', background:q.correct===oi?'#f5f3ff':'#fff' }} />
                        <button onClick={() => openCrop(`option${LABELS[oi]}`)} disabled={!srcImg}
                          title={srcImg?'Crop from image':'Upload question image first'}
                          style={{ padding:'0 10px', borderRadius:8, border:'1.5px solid #c4b5fd', background:'#f5f3ff', color:srcImg?'#6366f1':'#9ca3af', cursor:srcImg?'pointer':'not-allowed', fontSize:13, fontWeight:700, flexShrink:0 }}>
                          ✂️
                        </button>
                      </div>
                    )}
                  </div>
                  {q.options.length > 2 && (
                    <button onClick={() => rmOpt(oi)} style={{ background:'none',border:'none',cursor:'pointer',color:'#fca5a5',fontSize:19,lineHeight:1,padding:0,flexShrink:0,marginTop:isImg?4:0 }}>×</button>
                  )}
                </div>
              )
            })}

            {q.options.length < 6 && (
              <button onClick={addOpt} style={{ fontSize:12,color:'#6366f1',background:'none',border:'1.5px dashed #c4b5fd',borderRadius:8,padding:'5px 12px',cursor:'pointer',marginBottom:12,fontWeight:700 }}>
                + Add option
              </button>
            )}

            <label className="lbl" style={{ marginTop:4 }}>
              Explanation <span style={{ textTransform:'none', fontWeight:400, color:'#9ca3af' }}>(optional)</span>
            </label>
            <textarea className="textarea" rows={2} value={q.explanation || ''} onChange={e => upQ('explanation', e.target.value)}
              placeholder="Leave blank — AI generates after submission" />
          </div>

          {/* Right column: diagram */}
          <div>
            <label className="lbl">Diagram / Figure <span style={{ textTransform:'none', fontWeight:400, color:'#9ca3af' }}>(optional)</span></label>
            <ImageField
              value={q.diagram}
              onCrop={() => openCrop('diagram')}
              placeholder="Crop diagram / figure"
              disabled={!srcImg}
            />
            {q.diagram && (
              <button onClick={() => upQ('diagram', null)}
                style={{ marginTop:8, fontSize:12, padding:'4px 11px', borderRadius:7, border:'1.5px solid #fca5a5', background:'#fff1f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>
                Remove diagram
              </button>
            )}
            <p style={{ fontSize:11, color:'#9ca3af', marginTop:10, lineHeight:1.6 }}>
              Crop any figure, graph, or diagram from the uploaded question image.
            </p>
            {/* Marking scheme for this question */}
            <div style={{ marginTop:16, padding:'12px', background:'#f8fafc', borderRadius:9, border:'1.5px solid #e2e8f0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:12, fontWeight:700, color:'#334155' }}>Question Marking Scheme</span>
                <span style={{ fontSize:11, fontWeight:800, color:'#6366f1', background:'#ede9fe', padding:'2px 7px', borderRadius:5 }}>
                  +{q.positive_marks ?? 4} / -{q.negative_marks ?? 1}
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#059669', display:'block', marginBottom:3 }}>+ Correct</label>
                  <input
                    type="number" step="0.25" min={0} className="inp"
                    value={q.positive_marks ?? 4}
                    onChange={e => upQ('positive_marks', Math.max(0, +e.target.value))}
                    style={{ padding:'5px 8px', fontSize:13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#dc2626', display:'block', marginBottom:3 }}>- Negative</label>
                  <input
                    type="number" step="0.25" min={0} className="inp"
                    value={q.negative_marks ?? 1}
                    onChange={e => upQ('negative_marks', Math.max(0, +e.target.value))}
                    style={{ padding:'5px 8px', fontSize:13 }}
                  />
                </div>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {[
                  { label: '+4 / -1', pos: 4, neg: 1 },
                  { label: '+2 / -0.5', pos: 2, neg: 0.5 },
                  { label: '+1 / 0', pos: 1, neg: 0 },
                  { label: '+3 / -1', pos: 3, neg: 1 },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { upQ('positive_marks', preset.pos); upQ('negative_marks', preset.neg) }}
                    style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:5, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', cursor:'pointer' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <div style={{ marginBottom:12, padding:'10px 14px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:9, fontSize:13, color:'#dc2626', fontWeight:600 }}>
          ⚠ {saveError}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display:'flex', gap:9, marginBottom:12 }}>
        <button className="navarr" onClick={() => setCur(c => Math.max(0, c - 1))} disabled={cur === 0}>← Prev</button>
        {cur < questions.length - 1
          ? <button className="navarr" onClick={() => setCur(c => c + 1)}>Next →</button>
          : <button className="btn-pri" style={{ flex:1 }} disabled={!allValid || saving}
              onClick={() => allValid && !saving && onSave(questions, solutionPdf, solutionPdfName)}>
              {saving ? 'Saving…' : 'Save & Publish ✓'}
            </button>
        }
      </div>

      {/* Save & Publish always visible */}
      {cur < questions.length - 1 && (
        <button className="btn-pri" style={{ width:'100%', opacity: allValid && !saving ? 1 : .4 }}
          disabled={!allValid || saving}
          onClick={() => allValid && !saving && onSave(questions, solutionPdf, solutionPdfName)}>
          {saving ? 'Saving…' : 'Save & Publish Quiz ✓'}
        </button>
      )}

      {/* Validation hint */}
      {!allValid && (
        <p style={{ fontSize:12, color:'#f59e0b', marginTop:8, fontWeight:600, textAlign:'center' }}>
          Each question needs a problem statement (image or text) and at least 2 options (image or text)
        </p>
      )}

      {/* Q progress grid */}
      <div style={{ marginTop:18, display:'flex', flexWrap:'wrap', gap:5 }}>
        {questions.map((x, i) => {
          const filled = questionValid(x)
          const isCur  = i === cur
          return (
            <button key={i} onClick={() => setCur(i)} title={`${x.section} · Q${i+1}`}
              style={{ width:29, height:29, borderRadius:7, border:`1.5px solid ${isCur?'#6366f1':filled?'#34d399':'#e5e7eb'}`, background:isCur?'#ede9fe':filled?'#d1fae5':'#fff', color:isCur?'#6366f1':filled?'#065f46':'#9ca3af', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {i+1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
