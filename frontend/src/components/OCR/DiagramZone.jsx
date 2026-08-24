import { useState, useEffect, useRef, useCallback } from 'react'
import ImageCropper from './ImageCropper.jsx'

export default function DiagramZone({ value, onChange }) {
  const [drag, setDrag] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const fileRef = useRef()

  const loadAndCrop = useCallback(file => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => setCropSrc(e.target.result)
    reader.readAsDataURL(file)
  }, [])

  useEffect(() => {
    const handler = e => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          loadAndCrop(item.getAsFile())
          return
        }
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [loadAndCrop])

  const onDrop = useCallback(e => {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files?.[0] || null
    if (file) { loadAndCrop(file); return }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url?.startsWith('http')) alert('Drag image files from Finder/Explorer, or paste with Cmd+V.')
  }, [loadAndCrop])

  if (cropSrc) return (
    <div style={{ height:320, border:'1.5px solid #6366f1', borderRadius:12, overflow:'hidden' }}>
      <ImageCropper
        src={cropSrc}
        onCrop={url => { onChange(url); setCropSrc(null) }}
        onCancel={() => setCropSrc(null)}
      />
    </div>
  )

  if (value) return (
    <div style={{ position:'relative' }}>
      <img src={value} alt="diagram" onClick={() => setLightbox(true)}
        style={{ maxWidth:'100%', maxHeight:160, borderRadius:10, border:'1.5px solid #c4b5fd', cursor:'zoom-in', objectFit:'contain', background:'#f9fafb', display:'block' }} />
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(false)}>
          <img src={value} alt="diagram" />
        </div>
      )}
      <div style={{ display:'flex', gap:8, marginTop:8 }}>
        <button onClick={() => fileRef.current.click()} className="btn-sec" style={{ fontSize:12, padding:'5px 11px' }}>Replace</button>
        <button onClick={() => onChange(null)} className="btn-danger" style={{ fontSize:12 }}>Remove</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => loadAndCrop(e.target.files[0])} />
    </div>
  )

  return (
    <div className={`diag-zone${drag ? ' drag' : ''}`}
      style={{ padding:'18px 14px', textAlign:'center' }}
      onClick={() => fileRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => loadAndCrop(e.target.files[0])} />
      <div style={{ fontSize:28, marginBottom:6 }}>🖼️</div>
      <div style={{ fontSize:13, fontWeight:700, color:'#6366f1', marginBottom:3 }}>Add diagram</div>
      <div style={{ fontSize:11, color:'#9ca3af', lineHeight:1.5 }}>
        Click · Drag &amp; drop · Paste (⌘V)
      </div>
    </div>
  )
}
