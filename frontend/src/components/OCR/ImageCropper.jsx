import { useRef, useState } from 'react'
import { cropImage } from '../../services/utils.js'

export default function ImageCropper({ src, onCrop, onCancel }) {
  const imgRef = useRef()
  const [rect, setRect] = useState(null)
  const [drawing, setDrawing] = useState(false)
  const startRef = useRef(null)

  const getPos = (e, el) => {
    const br = el.getBoundingClientRect()
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - br.left
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - br.top
    return { x: Math.max(0, Math.min(cx, br.width)), y: Math.max(0, Math.min(cy, br.height)) }
  }

  const onDown = e => {
    e.preventDefault()
    const p = getPos(e, imgRef.current)
    startRef.current = p
    setRect({ x:p.x, y:p.y, w:0, h:0 })
    setDrawing(true)
  }

  const onMove = e => {
    if (!drawing || !startRef.current) return
    e.preventDefault()
    const p = getPos(e, imgRef.current), s = startRef.current
    setRect({ x:Math.min(s.x,p.x), y:Math.min(s.y,p.y), w:Math.abs(p.x-s.x), h:Math.abs(p.y-s.y) })
  }

  const onUp = () => setDrawing(false)

  const doCrop = async () => {
    if (!rect || rect.w < 8 || rect.h < 8) { alert('Draw a larger area.'); return }
    const br = imgRef.current.getBoundingClientRect()
    const pct = { x:(rect.x/br.width)*100, y:(rect.y/br.height)*100, w:(rect.w/br.width)*100, h:(rect.h/br.height)*100 }
    onCrop(await cropImage(src, pct))
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'12px 14px', borderBottom:'1px solid #f3f4f6', fontSize:13, color:'#6b7280' }}>
        <strong style={{ color:'#111827' }}>Draw crop box</strong> — click &amp; drag on the image
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'10px', background:'#f9fafb', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div className="crop-wrap"
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
          <img ref={imgRef} src={src} alt="crop"
            style={{ maxWidth:'100%', maxHeight:'calc(100dvh - 240px)', borderRadius:8, display:'block', pointerEvents:'none' }} />
          {rect && rect.w > 0 && (
            <div style={{ position:'absolute', left:rect.x, top:rect.y, width:rect.w, height:rect.h, border:'2px solid #6366f1', background:'rgba(99,102,241,.12)', pointerEvents:'none' }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ position:'absolute', width:10, height:10, background:'#6366f1', borderRadius:2,
                  top: i < 2 ? '-5px' : 'auto', bottom: i >= 2 ? '-5px' : 'auto',
                  left: i%2===0 ? '-5px' : 'auto', right: i%2===1 ? '-5px' : 'auto'
                }} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding:'11px 14px', borderTop:'1px solid #f3f4f6', display:'flex', gap:9 }}>
        <button className="btn-sec" style={{ flex:1 }} onClick={onCancel}>← Back</button>
        <button className="btn-pri" style={{ flex:1 }} onClick={doCrop} disabled={!rect || rect.w < 8 || rect.h < 8}>
          Crop &amp; Use ✓
        </button>
      </div>
    </div>
  )
}
