import { useState, useEffect, useRef, useCallback } from 'react'
import ImageCropper from './ImageCropper.jsx'
import { runOcr } from '../../services/ocrService.js'

// ─── Utility: crop a region from a dataURL ────────────────────────────────────
function cropDataUrl(src, x, y, w, h) {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h)
      res(c.toDataURL('image/jpeg', 0.93))
    }
    img.src = src
  })
}

// ─── Auto-detect option label positions using Tesseract word-level data ───────
// Returns { A:{x,y,w,h}, B:{x,y,w,h}, ... } in image pixel coords
// Falls back to equal-height strips if detection fails
async function detectOptionBounds(imgSrc, imgW, imgH) {
  try {
    const Tesseract = (await import('tesseract.js')).default
    const result = await Tesseract.recognize(imgSrc, 'eng', {
      tessedit_pageseg_mode: 6  // assume single block of text
    })
    const words = result.data.words || []
    const labels = ['A', 'B', 'C', 'D']
    const found = {}

    // Find words that are exactly a label letter or "(A)" / "A." / "A)"
    for (const word of words) {
      const clean = word.text.replace(/[().]/g, '').trim().toUpperCase()
      if (labels.includes(clean) && !found[clean]) {
        found[clean] = word.bbox // {x0,y0,x1,y1}
      }
    }

    // Build row slices: from label Y to next label Y
    const rows = labels.map(l => found[l]).filter(Boolean)
    if (rows.length < 2) throw new Error('Not enough labels found')

    const bounds = {}
    labels.forEach((lbl, i) => {
      if (!found[lbl]) return
      const y0 = Math.max(0, found[lbl].y0 - 4)
      const y1 = i + 1 < labels.length && found[labels[i+1]]
        ? found[labels[i+1]].y0 - 4
        : imgH
      bounds[lbl] = { x: 0, y: y0, w: imgW, h: Math.max(10, y1 - y0) }
    })
    return bounds
  } catch {
    // Fallback: equal strips
    const strip = Math.floor(imgH / 4)
    return {
      A: { x:0, y:0,         w:imgW, h:strip },
      B: { x:0, y:strip,     w:imgW, h:strip },
      C: { x:0, y:strip*2,   w:imgW, h:strip },
      D: { x:0, y:strip*3,   w:imgW, h:Math.max(strip, imgH - strip*3) },
    }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OcrPanel({ open, onClose, onResult }) {
  // step: choose | camera | cropQ | processingQ | cropOpts | reviewOpts | applying | done | err
  const [step,        setStep]        = useState('choose')
  const [qMode,       setQMode]       = useState('text')   // 'text' | 'image'
  const [optMode,     setOptMode]     = useState('text')   // 'text' | 'image'
  const [fullImgSrc,  setFullImgSrc]  = useState(null)     // uploaded image
  const [qCrop,       setQCrop]       = useState(null)     // cropped question dataUrl
  const [remainSrc,   setRemainSrc]   = useState(null)     // image below question crop
  const [optCrops,    setOptCrops]    = useState({})       // {A,B,C,D} -> dataUrl
  const [optTexts,    setOptTexts]    = useState({})       // {A,B,C,D} -> string (text mode)
  const [qText,       setQText]       = useState('')
  const [ocrProg,     setOcrProg]     = useState(0)
  const [errMsg,      setErrMsg]      = useState('')
  const [redrawOpt,   setRedrawOpt]   = useState(null)     // 'A'|'B'|'C'|'D' | null

  const videoRef = useRef(); const streamRef = useRef()
  const fileRef  = useRef(); const camRef    = useRef()

  // Reset on close
  useEffect(() => {
    if (!open) {
      stopCam()
      setStep('choose'); setFullImgSrc(null); setQCrop(null); setRemainSrc(null)
      setOptCrops({}); setOptTexts({}); setQText(''); setOcrProg(0)
      setErrMsg(''); setRedrawOpt(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const stopCam = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }

  // ── Load image ──────────────────────────────────────────────────────────────
  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } })
      streamRef.current = s; setStep('camera')
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s }, 80)
    } catch { camRef.current?.click() }
  }

  const captureCamera = () => {
    const v = videoRef.current
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    stopCam(); setFullImgSrc(c.toDataURL('image/jpeg', .92)); setStep('cropQ')
  }

  const handleFile = f => {
    if (!f) return
    const r = new FileReader()
    r.onload = e => { setFullImgSrc(e.target.result); setStep('cropQ') }
    r.readAsDataURL(f)
  }

  // ── Step 1: Question crop done ───────────────────────────────────────────────
  const onQuestionCrop = useCallback(async (croppedUrl) => {
    setQCrop(croppedUrl)

    // Build "remaining" image = everything below the crop
    // We need to find what Y% was the bottom of the crop
    // ImageCropper returns the full cropped dataUrl; we stored fullImgSrc
    // Strategy: show remaining as full image, user already cropped top part
    // We simply store croppedUrl for question and keep fullImgSrc for options step

    if (qMode === 'text') {
      setStep('processingQ'); setOcrProg(0)
      try {
        const Tesseract = (await import('tesseract.js')).default
        const r = await Tesseract.recognize(croppedUrl, 'eng', {
          logger: m => { if (m.status === 'recognizing text') setOcrProg(Math.round(m.progress*100)) }
        })
        setQText(r.data.text.trim())
      } catch { setQText('') }
    }
    // After Q processing (or direct for image mode), move to options
    setStep('cropOpts')
  }, [qMode])

  // ── Step 2: User has seen processingQ, now move to crop options ─────────────
  // (cropOpts step shows fullImgSrc with instruction to auto-detect)

  const runOptionDetection = useCallback(async () => {
    setStep('processingOpts')
    // Get image dimensions
    const img = new Image()
    await new Promise(res => { img.onload = res; img.src = fullImgSrc })
    const W = img.naturalWidth, H = img.naturalHeight

    // Auto-detect bounds
    const bounds = await detectOptionBounds(fullImgSrc, W, H)

    // Crop each
    const crops = {}
    for (const lbl of ['A','B','C','D']) {
      if (bounds[lbl]) {
        const { x, y, w, h } = bounds[lbl]
        crops[lbl] = await cropDataUrl(fullImgSrc, x, y, w, h)
      }
    }
    setOptCrops(crops)

    // If text mode, OCR each crop
    if (optMode === 'text') {
      const texts = {}
      const Tesseract = (await import('tesseract.js')).default
      for (const lbl of ['A','B','C','D']) {
        if (crops[lbl]) {
          try {
            const r = await Tesseract.recognize(crops[lbl], 'eng')
            // Strip leading "A." / "(A)" etc from text
            let t = r.data.text.trim().replace(/^[(]?[A-D][).]\s*/i, '').trim()
            texts[lbl] = t
          } catch { texts[lbl] = '' }
        }
      }
      setOptTexts(texts)
    }

    setStep('reviewOpts')
  }, [fullImgSrc, optMode])

  // ── Redraw one option manually ───────────────────────────────────────────────
  const onRedrawCrop = useCallback(async (croppedUrl) => {
    const lbl = redrawOpt
    setOptCrops(prev => ({ ...prev, [lbl]: croppedUrl }))
    if (optMode === 'text') {
      try {
        const Tesseract = (await import('tesseract.js')).default
        const r = await Tesseract.recognize(croppedUrl, 'eng')
        const t = r.data.text.trim().replace(/^[(]?[A-D][).]\s*/i, '').trim()
        setOptTexts(prev => ({ ...prev, [lbl]: t }))
      } catch {}
    }
    setRedrawOpt(null)
  }, [redrawOpt, optMode])

  // ── Apply result to QuestionEditor ───────────────────────────────────────────
  const applyResult = useCallback(() => {
    const payload = {
      questionMode: qMode,
      optionMode:   optMode,
      question:     qMode === 'text' ? qText : null,
      questionImage: qMode === 'image' ? qCrop : null,
      options: ['A','B','C','D'].reduce((acc, lbl) => {
        acc[lbl] = optMode === 'text'
          ? (optTexts[lbl] || '')
          : (optCrops[lbl] || null)
        return acc
      }, {})
    }
    onResult(payload)
    onClose()
  }, [qMode, optMode, qText, qCrop, optTexts, optCrops, onResult, onClose])

  // ─────────────────────────────────────────────────────────────────────────────
  const S = { // shared styles
    panel: { flex:1, overflowY:'auto', padding:'1.1rem 1.2rem', display:'flex', flexDirection:'column', gap:12 },
    center: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:'1.5rem', textAlign:'center' },
    modeBtn: (active) => ({ flex:1, padding:'9px 0', borderRadius:9, border:`2px solid ${active?'#6366f1':'#d1d5db'}`, background:active?'#6366f1':'#fff', color:active?'#fff':'#6b7280', fontWeight:700, fontSize:13, cursor:'pointer', transition:'all .13s' }),
    optThumb: { width:'100%', maxHeight:80, objectFit:'contain', borderRadius:7, border:'1.5px solid #e5e7eb', background:'#f9fafb', display:'block' },
    optBox: (lbl) => ({ border:'1.5px solid #e5e7eb', borderRadius:10, padding:'10px 11px', background:'#fff' }),
  }

  const LABELS = ['A','B','C','D']

  return (
    <>
      <div className={`ocr-ov${open?' open':''}`} onClick={() => { stopCam(); onClose() }} />
      <div className={`ocr-panel${open?' open':''}`}>

        {/* Header */}
        <div style={{ padding:'12px 14px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>📷</span>
            <span style={{ fontWeight:800, fontSize:14 }}>Scan Question (OCR)</span>
            {step !== 'choose' && (
              <span style={{ fontSize:11, color:'#9ca3af', marginLeft:4 }}>
                {step==='cropQ'||step==='processingQ' ? '① Question' : step==='cropOpts'||step==='processingOpts' ? '② Options' : step==='reviewOpts' ? '③ Review' : ''}
              </span>
            )}
          </div>
          <button onClick={() => { stopCam(); onClose() }} style={{ background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#9ca3af',padding:0,lineHeight:1 }}>×</button>
        </div>

        {/* Progress steps */}
        {step !== 'choose' && step !== 'camera' && (
          <div style={{ padding:'8px 14px', borderBottom:'1px solid #f3f4f6', display:'flex', gap:6 }}>
            {[{id:'cropQ',label:'① Crop Q'},{id:'cropOpts',label:'② Options'},{id:'reviewOpts',label:'③ Review'}].map(s => {
              const done = (s.id==='cropQ' && ['cropOpts','processingOpts','reviewOpts','applying'].includes(step))
                        || (s.id==='cropOpts' && ['reviewOpts','applying'].includes(step))
              const active = step.startsWith(s.id.replace('cropQ','cropQ').replace('cropOpts','cropOpts')) || step===s.id || (s.id==='cropOpts'&&step==='processingOpts')
              return (
                <div key={s.id} style={{ flex:1, padding:'5px', borderRadius:7, background:done?'#d1fae5':active?'#ede9fe':'#f9fafb', textAlign:'center', fontSize:11, fontWeight:700, color:done?'#065f46':active?'#6366f1':'#9ca3af' }}>
                  {done ? '✓ '+s.label.slice(2) : s.label}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>

          {/* ── STEP: choose ── */}
          {step === 'choose' && (
            <div style={S.panel}>
              {/* Mode selectors */}
              <div>
                <label className="lbl">Question mode</label>
                <div style={{ display:'flex', gap:8 }}>
                  <button style={S.modeBtn(qMode==='text')}  onClick={() => setQMode('text')}>📝 Text</button>
                  <button style={S.modeBtn(qMode==='image')} onClick={() => setQMode('image')}>🖼️ Image</button>
                </div>
              </div>
              <div>
                <label className="lbl">Options mode</label>
                <div style={{ display:'flex', gap:8 }}>
                  <button style={S.modeBtn(optMode==='text')}  onClick={() => setOptMode('text')}>📝 Text</button>
                  <button style={S.modeBtn(optMode==='image')} onClick={() => setOptMode('image')}>🖼️ Image</button>
                </div>
              </div>

              {/* Summary box */}
              <div style={{ background:'#f5f3ff', borderRadius:9, padding:'10px 13px', fontSize:12, color:'#6366f1', lineHeight:1.7 }}>
                <strong>Selected:</strong><br/>
                Question → <strong>{qMode==='text'?'OCR to text':'Store as image'}</strong><br/>
                Options → <strong>{optMode==='text'?'OCR to text':'Store as images'}</strong>
              </div>

              <p style={{ fontSize:12, color:'#9ca3af', margin:0, lineHeight:1.6 }}>
                You will upload one image, crop the question area, then the app auto-detects and crops options A–D.
              </p>

              {/* Source buttons */}
              <div style={{ display:'grid', gap:9, marginTop:4 }}>
                {[
                  { icon:'📸', title:'Open Camera',  sub:'Capture live photo',    action: openCamera,                accent:'#6366f1', bg:'#f5f3ff', bd:'#c4b5fd' },
                  { icon:'🗂️', title:'Upload Image', sub:'From device / gallery', action:()=>fileRef.current.click(), accent:'#374151', bg:'#f9fafb', bd:'#d1d5db' },
                ].map(({ icon,title,sub,action,accent,bg,bd }) => (
                  <button key={title} onClick={action}
                    style={{ width:'100%', padding:'13px', borderRadius:12, border:`1.5px solid ${bd}`, background:bg, cursor:'pointer', display:'flex', alignItems:'center', gap:14, textAlign:'left' }}>
                    <span style={{ fontSize:26, flexShrink:0 }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:accent }}>{title}</div>
                      <div style={{ fontSize:12, color:'#9ca3af' }}>{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
              <input ref={fileRef}  type="file" accept="image/*"            style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])} />
              <input ref={camRef}   type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])} />
            </div>
          )}

          {/* ── STEP: camera ── */}
          {step === 'camera' && (
            <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
              <div style={{ flex:1, background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <video ref={videoRef} autoPlay playsInline style={{ maxWidth:'100%', maxHeight:'calc(100dvh - 160px)', display:'block' }} />
              </div>
              <div style={{ padding:'11px 13px', display:'flex', gap:9, borderTop:'1px solid #f3f4f6' }}>
                <button className="btn-sec" style={{ flex:1 }} onClick={() => { stopCam(); setStep('choose') }}>← Back</button>
                <button className="btn-pri" style={{ flex:1 }} onClick={captureCamera}>📸 Capture</button>
              </div>
            </div>
          )}

          {/* ── STEP: cropQ — crop the question area ── */}
          {step === 'cropQ' && fullImgSrc && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ padding:'9px 13px', background:'#eff6ff', borderBottom:'1px solid #dbeafe', fontSize:12, color:'#1d4ed8', fontWeight:600 }}>
                ① Draw a box around the <strong>question statement only</strong>
              </div>
              <div style={{ flex:1, overflow:'hidden' }}>
                <ImageCropper src={fullImgSrc} onCrop={onQuestionCrop} onCancel={() => setStep('choose')} />
              </div>
            </div>
          )}

          {/* ── STEP: processingQ — OCR running on question crop ── */}
          {step === 'processingQ' && (
            <div style={S.center}>
              <div style={{ fontSize:40 }}>🔍</div>
              <p style={{ fontWeight:800, fontSize:15, margin:0 }}>Reading question…</p>
              <div style={{ width:'100%', height:6, background:'#f3f4f6', borderRadius:3 }}>
                <div style={{ height:'100%', width:`${ocrProg}%`, background:'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius:3, transition:'width .3s' }} />
              </div>
              <p style={{ fontSize:12, color:'#9ca3af', margin:0 }}>Tesseract OCR — {ocrProg}%</p>
            </div>
          )}

          {/* ── STEP: cropOpts — show full image, user triggers auto-detect ── */}
          {step === 'cropOpts' && fullImgSrc && (
            <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'9px 13px', background:'#fef3c7', borderBottom:'1px solid #fde68a', fontSize:12, color:'#92400e', fontWeight:600 }}>
                ② Now auto-detect options (A)(B)(C)(D) from the full image
              </div>

              {/* Show Q result so far */}
              {qMode === 'text' && qText && (
                <div style={{ margin:'10px 12px 0', padding:'9px 12px', background:'#f0fdf4', borderRadius:9, fontSize:12, color:'#065f46', border:'1px solid #86efac' }}>
                  <strong>Question extracted:</strong><br/>{qText.slice(0,120)}{qText.length>120?'…':''}
                </div>
              )}
              {qMode === 'image' && qCrop && (
                <div style={{ margin:'10px 12px 0', padding:'8px', background:'#f0fdf4', borderRadius:9, border:'1px solid #86efac' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#065f46', marginBottom:5 }}>✓ Question image saved</div>
                  <img src={qCrop} alt="q" style={{ maxWidth:'100%', maxHeight:60, objectFit:'contain', borderRadius:6, background:'#fff', display:'block' }} />
                </div>
              )}

              <div style={{ flex:1, overflow:'auto', padding:'10px 12px' }}>
                <div style={{ position:'relative', lineHeight:0 }}>
                  <img src={fullImgSrc} alt="full" style={{ width:'100%', borderRadius:8, display:'block' }} />
                  <div style={{ position:'absolute', inset:0, background:'rgba(99,102,241,.06)', borderRadius:8, border:'2px dashed #6366f1', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ background:'rgba(255,255,255,.92)', borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:700, color:'#6366f1', textAlign:'center', boxShadow:'0 2px 12px rgba(0,0,0,.1)' }}>
                      Options A–D will be<br/>auto-detected here
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding:'11px 13px', borderTop:'1px solid #f3f4f6', display:'flex', gap:9 }}>
                <button className="btn-sec" style={{ flex:1 }} onClick={() => setStep('cropQ')}>← Re-crop Q</button>
                <button className="btn-pri" style={{ flex:1 }} onClick={runOptionDetection}>Auto-detect A–D →</button>
              </div>
            </div>
          )}

          {/* ── STEP: processingOpts ── */}
          {step === 'processingOpts' && (
            <div style={S.center}>
              <div style={{ fontSize:40 }}>⚙️</div>
              <p style={{ fontWeight:800, fontSize:15, margin:0 }}>Detecting options…</p>
              <p style={{ fontSize:12, color:'#9ca3af', margin:0 }}>Finding (A) (B) (C) (D) labels and cropping each</p>
              {optMode === 'text' && <p style={{ fontSize:12, color:'#9ca3af', margin:0 }}>Then running OCR on each option</p>}
            </div>
          )}

          {/* ── STEP: reviewOpts — show all 4 crops, allow redraw ── */}
          {step === 'reviewOpts' && !redrawOpt && (
            <div style={S.panel}>
              <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:9, padding:'9px 13px', fontSize:13, fontWeight:700, color:'#065f46' }}>
                ③ Review all options — redraw any that look wrong
              </div>

              {LABELS.map(lbl => (
                <div key={lbl} style={S.optBox(lbl)}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <span style={{ width:24, height:24, borderRadius:6, background:'#6366f1', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>{lbl}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>Option {lbl}</span>
                    </div>
                    <button onClick={() => setRedrawOpt(lbl)}
                      style={{ fontSize:11, padding:'4px 9px', borderRadius:7, border:'1.5px solid #c4b5fd', background:'#f5f3ff', color:'#6366f1', cursor:'pointer', fontWeight:700 }}>
                      ✏️ Redraw
                    </button>
                  </div>

                  {optCrops[lbl]
                    ? <img src={optCrops[lbl]} alt={`Option ${lbl}`} style={S.optThumb} />
                    : <div style={{ height:40, background:'#fef2f2', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#dc2626' }}>Not detected</div>
                  }

                  {optMode === 'text' && (
                    <div style={{ marginTop:7 }}>
                      <label className="lbl" style={{ marginBottom:3 }}>Extracted text</label>
                      <input
                        className="inp"
                        value={optTexts[lbl] || ''}
                        onChange={e => setOptTexts(prev => ({ ...prev, [lbl]: e.target.value }))}
                        placeholder={`Edit option ${lbl} text…`}
                        style={{ fontSize:13 }}
                      />
                    </div>
                  )}
                </div>
              ))}

              <button className="btn-pri" style={{ width:'100%', marginTop:4 }} onClick={applyResult}>
                Apply to question →
              </button>
            </div>
          )}

          {/* ── STEP: redraw one option ── */}
          {step === 'reviewOpts' && redrawOpt && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ padding:'9px 13px', background:'#fef3c7', borderBottom:'1px solid #fde68a', fontSize:12, color:'#92400e', fontWeight:600 }}>
                Redraw crop for Option <strong>{redrawOpt}</strong>
              </div>
              <div style={{ flex:1, overflow:'hidden' }}>
                <ImageCropper
                  src={fullImgSrc}
                  onCrop={onRedrawCrop}
                  onCancel={() => setRedrawOpt(null)}
                />
              </div>
            </div>
          )}

          {/* ── STEP: err ── */}
          {step === 'err' && (
            <div style={S.center}>
              <div style={{ fontSize:40 }}>❌</div>
              <p style={{ fontWeight:800, fontSize:15, margin:0, color:'#dc2626' }}>Failed</p>
              <p style={{ fontSize:13, color:'#9ca3af', margin:0 }}>{errMsg}</p>
              <button className="btn-sec" onClick={() => setStep('choose')}>Try again</button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
