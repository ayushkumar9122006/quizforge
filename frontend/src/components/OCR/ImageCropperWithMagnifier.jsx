import { useRef, useState, useEffect, useCallback } from 'react'

/**
 * ImageCropperWithMagnifier
 *
 * Props:
 *   src        — image data URL to crop from
 *   onCrop     — callback(croppedDataUrl) when user confirms
 *   onCancel   — callback() when user cancels
 *   label      — optional instruction text shown at top
 */
export default function ImageCropperWithMagnifier({ src, onCrop, onCancel, label }) {
  const containerRef = useRef()
  const imgRef       = useRef()
  const canvasRef    = useRef()           // offscreen canvas for magnifier
  const [rect,    setRect]    = useState(null)   // {x,y,w,h} in px
  const [drawing, setDrawing] = useState(false)
  const [mouse,   setMouse]   = useState(null)   // {x,y} for magnifier position
  const [showMag, setShowMag] = useState(false)
  const startRef = useRef(null)
  const MAGNIFIER_R  = 60    // radius of magnifier circle (px)
  const MAGNIFIER_Z  = 2.5   // zoom level

  // Draw magnifier on canvas whenever mouse moves inside image
  useEffect(() => {
    if (!showMag || !mouse || !imgRef.current || !canvasRef.current) return
    const img = imgRef.current
    const cv  = canvasRef.current
    const ctx = cv.getContext('2d')
    const br  = img.getBoundingClientRect()

    // Natural image coords under cursor
    const scaleX = img.naturalWidth  / br.width
    const scaleY = img.naturalHeight / br.height
    const nx = mouse.x * scaleX
    const ny = mouse.y * scaleY

    const d  = MAGNIFIER_R * 2
    cv.width  = d
    cv.height = d

    // Clip to circle
    ctx.clearRect(0, 0, d, d)
    ctx.save()
    ctx.beginPath()
    ctx.arc(MAGNIFIER_R, MAGNIFIER_R, MAGNIFIER_R, 0, Math.PI * 2)
    ctx.clip()

    // Draw zoomed portion
    const sw = (MAGNIFIER_R * 2) / MAGNIFIER_Z   // source width in natural px
    const sh = sw
    ctx.drawImage(img, nx - sw/2, ny - sh/2, sw, sh, 0, 0, d, d)

    // Border
    ctx.restore()
    ctx.beginPath()
    ctx.arc(MAGNIFIER_R, MAGNIFIER_R, MAGNIFIER_R - 1, 0, Math.PI * 2)
    ctx.strokeStyle = '#6366f1'
    ctx.lineWidth   = 2.5
    ctx.stroke()

    // Crosshair
    ctx.strokeStyle = 'rgba(99,102,241,0.6)'
    ctx.lineWidth   = 1
    ctx.beginPath(); ctx.moveTo(MAGNIFIER_R, 4); ctx.lineTo(MAGNIFIER_R, d-4); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(4, MAGNIFIER_R); ctx.lineTo(d-4, MAGNIFIER_R); ctx.stroke()

  }, [mouse, showMag])

  const getPos = (e, el) => {
    const br = el.getBoundingClientRect()
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - br.left
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - br.top
    return {
      x: Math.max(0, Math.min(cx, br.width)),
      y: Math.max(0, Math.min(cy, br.height)),
    }
  }

  const onDown = e => {
    e.preventDefault()
    const p = getPos(e, imgRef.current)
    startRef.current = p
    setRect({ x: p.x, y: p.y, w: 0, h: 0 })
    setDrawing(true)
    setMouse(p)
    setShowMag(true)
  }

  const onMove = e => {
    e.preventDefault()
    const p = getPos(e, imgRef.current)
    setMouse(p)
    setShowMag(true)
    if (!drawing || !startRef.current) return
    const s = startRef.current
    setRect({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    })
  }

  const onUp = () => {
    setDrawing(false)
    setShowMag(false)
  }

  const onLeave = () => setShowMag(false)

  const doCrop = useCallback(async () => {
    if (!rect || rect.w < 8 || rect.h < 8) { alert('Draw a larger crop area.'); return }
    const img = imgRef.current
    const br  = img.getBoundingClientRect()
    const pct = {
      x: (rect.x / br.width)  * 100,
      y: (rect.y / br.height) * 100,
      w: (rect.w / br.width)  * 100,
      h: (rect.h / br.height) * 100,
    }
    // Crop via canvas
    const cropped = await new Promise(res => {
      const i = new Image()
      i.onload = () => {
        const sx = (pct.x / 100) * i.width
        const sy = (pct.y / 100) * i.height
        const sw = (pct.w / 100) * i.width
        const sh = (pct.h / 100) * i.height
        const c  = document.createElement('canvas')
        c.width = sw; c.height = sh
        c.getContext('2d').drawImage(i, sx, sy, sw, sh, 0, 0, sw, sh)
        res(c.toDataURL('image/jpeg', 0.93))
      }
      i.src = src
    })
    onCrop(cropped)
  }, [rect, src, onCrop])

  const D = MAGNIFIER_R * 2   // magnifier diameter

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Instruction */}
      <div style={{ padding:'10px 14px', background:'#eff6ff', borderBottom:'1px solid #dbeafe', fontSize:13, color:'#1d4ed8', fontWeight:600, flexShrink:0 }}>
        {label || 'Draw a crop box — click and drag on the image'}
      </div>

      {/* Image + magnifier */}
      <div ref={containerRef}
        style={{ flex:1, overflow:'auto', padding:'10px', background:'#f9fafb', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>

        {/* Magnifier lens — follows cursor */}
        {showMag && mouse && (
          <canvas ref={canvasRef}
            style={{
              position:      'absolute',
              left:          (mouse.x + 10 + (MAGNIFIER_R * 2) > (containerRef.current?.clientWidth || 999)
                               ? mouse.x - D - 10 : mouse.x + 10) + 'px',
              top:           Math.max(0, mouse.y - MAGNIFIER_R) + 'px',
              width:         D + 'px',
              height:        D + 'px',
              borderRadius:  '50%',
              boxShadow:     '0 4px 20px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
              zIndex:        20,
              background:    '#fff',
            }}
          />
        )}

        {/* The image itself */}
        <div style={{ position:'relative', lineHeight:0, userSelect:'none', cursor:'crosshair' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
          <img ref={imgRef} src={src} alt="crop source"
            style={{ maxWidth:'100%', maxHeight:'calc(100dvh - 220px)', borderRadius:8, display:'block', pointerEvents:'none' }}/>

          {/* Crop box overlay */}
          {rect && rect.w > 0 && (
            <div style={{
              position:'absolute', left:rect.x, top:rect.y, width:rect.w, height:rect.h,
              border:'2.5px solid #6366f1', background:'rgba(99,102,241,0.1)', pointerEvents:'none'
            }}>
              {/* Corner handles */}
              {[[{top:'-5px',left:'-5px'},{top:'-5px',right:'-5px'},{bottom:'-5px',left:'-5px'},{bottom:'-5px',right:'-5px'}]].flat().map((pos,i)=>(
                <div key={i} style={{ position:'absolute', width:10, height:10, background:'#6366f1', borderRadius:2, ...pos }}/>
              ))}
              {/* Size label */}
              {rect.w > 40 && rect.h > 20 && (
                <div style={{ position:'absolute', bottom:-22, left:0, fontSize:10, color:'#6366f1', fontWeight:700, whiteSpace:'nowrap', background:'white', padding:'1px 4px', borderRadius:3 }}>
                  {Math.round(rect.w)} × {Math.round(rect.h)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding:'11px 14px', borderTop:'1px solid #f3f4f6', display:'flex', gap:9, flexShrink:0 }}>
        <button className="btn-sec" style={{ flex:1 }} onClick={onCancel}>← Back</button>
        <button className="btn-pri" style={{ flex:1 }} onClick={doCrop}
          disabled={!rect || rect.w < 8 || rect.h < 8}>
          Crop & Use ✓
        </button>
      </div>
    </div>
  )
}
