import { useState, useRef, useCallback } from 'react'
import ImageCropperWithMagnifier from './ImageCropperWithMagnifier.jsx'

/**
 * QuestionImagePanel
 *
 * Props:
 *   onQuestionCropReady(dataUrl) — called when admin has cropped the one question
 *                                  from the full page image
 *   onClose                     — cancel / close
 */
export default function QuestionImagePanel({ onQuestionCropReady, onClose }) {
  const [step,       setStep]    = useState('upload')   // upload | crop | preview
  const [fullImgSrc, setFullImg] = useState(null)
  const [cropped,    setCropped] = useState(null)
  const fileRef = useRef()
  const camRef  = useRef()
  const videoRef  = useRef()
  const streamRef = useRef()

  const stopCam = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = s
      setStep('camera')
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s }, 80)
    } catch { camRef.current?.click() }
  }

  const captureCamera = () => {
    const v = videoRef.current
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    stopCam()
    setFullImg(c.toDataURL('image/jpeg', 0.92))
    setStep('crop')
  }

  const handleFile = f => {
    if (!f) return
    const r = new FileReader()
    r.onload = e => { setFullImg(e.target.result); setStep('crop') }
    r.readAsDataURL(f)
  }

  const handleCropped = useCallback(url => {
    setCropped(url)
    setStep('preview')
  }, [])

  const handleConfirm = () => {
    onQuestionCropReady(cropped)
    onClose()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'12px 15px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <span style={{ fontSize:17 }}>📄</span>
          <div>
            <span style={{ fontWeight:800, fontSize:14 }}>Upload Question Image</span>
            <div style={{ fontSize:11, color:'#9ca3af', marginTop:1 }}>
              {step==='upload'?'Step 1: Upload full page':step==='camera'?'Step 1: Capture photo':step==='crop'?'Step 2: Crop ONE question':' Step 3: Confirm'}
            </div>
          </div>
        </div>
        <button onClick={() => { stopCam(); onClose() }} style={{ background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#9ca3af',padding:0,lineHeight:1 }}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>

        {/* UPLOAD */}
        {step === 'upload' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'1.5rem', gap:12 }}>
            <div style={{ background:'#f5f3ff', border:'1.5px solid #c4b5fd', borderRadius:12, padding:'14px 18px', marginBottom:6, fontSize:13, color:'#6366f1', lineHeight:1.6, textAlign:'center', width:'100%' }}>
              Upload a photo of the <strong>full question paper page</strong>.<br/>
              You will crop one question from it next.
            </div>
            {[
              { icon:'📸', title:'Open Camera',  sub:'Capture live photo',     action:openCamera,                accent:'#6366f1', bg:'#f5f3ff', bd:'#c4b5fd' },
              { icon:'🗂️', title:'Upload Image', sub:'From device / gallery',  action:()=>fileRef.current.click(), accent:'#374151', bg:'#f9fafb', bd:'#d1d5db' },
            ].map(({ icon,title,sub,action,accent,bg,bd }) => (
              <button key={title} onClick={action}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:`1.5px solid ${bd}`, background:bg, cursor:'pointer', display:'flex', alignItems:'center', gap:14, textAlign:'left' }}>
                <span style={{ fontSize:28, flexShrink:0 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:accent }}>{title}</div>
                  <div style={{ fontSize:12, color:'#9ca3af' }}>{sub}</div>
                </div>
              </button>
            ))}
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])} />
            <input ref={camRef}  type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])} />
          </div>
        )}

        {/* CAMERA */}
        {step === 'camera' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
            <div style={{ flex:1, background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <video ref={videoRef} autoPlay playsInline style={{ maxWidth:'100%', maxHeight:'calc(100dvh - 160px)', display:'block' }} />
            </div>
            <div style={{ padding:'11px 14px', display:'flex', gap:9, borderTop:'1px solid #f3f4f6' }}>
              <button className="btn-sec" style={{ flex:1 }} onClick={() => { stopCam(); setStep('upload') }}>← Back</button>
              <button className="btn-pri" style={{ flex:1 }} onClick={captureCamera}>📸 Capture</button>
            </div>
          </div>
        )}

        {/* CROP — with magnifier */}
        {step === 'crop' && fullImgSrc && (
          <ImageCropperWithMagnifier
            src={fullImgSrc}
            label="Draw a box around ONE question (with its options)"
            onCrop={handleCropped}
            onCancel={() => setStep('upload')}
          />
        )}

        {/* PREVIEW — confirm or re-crop */}
        {step === 'preview' && cropped && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'1rem 1.2rem', gap:12 }}>
            <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:9, padding:'9px 13px', fontSize:13, fontWeight:700, color:'#065f46' }}>
              ✓ Question cropped! Does this look right?
            </div>
            <div style={{ flex:1, overflow:'auto', display:'flex', alignItems:'center', justifyContent:'center', background:'#f9fafb', borderRadius:10, padding:'10px' }}>
              <img src={cropped} alt="cropped question"
                style={{ maxWidth:'100%', maxHeight:'calc(100dvh - 280px)', borderRadius:8, border:'1.5px solid #e5e7eb', objectFit:'contain' }} />
            </div>
            <p style={{ fontSize:12, color:'#9ca3af', margin:0, textAlign:'center' }}>
              This image will be used as the source for cropping the problem statement, each option, and diagram.
            </p>
            <div style={{ display:'flex', gap:9 }}>
              <button className="btn-sec" style={{ flex:1 }} onClick={() => setStep('crop')}>Re-crop</button>
              <button className="btn-pri" style={{ flex:1 }} onClick={handleConfirm}>Use this image →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
