import { useState } from 'react'
import ImageCropperWithMagnifier from './ImageCropperWithMagnifier.jsx'

/**
 * CropFromSource
 * Opens a side panel with the question crop image,
 * admin draws a box to extract a specific field.
 *
 * Props:
 *   src      — the cropped question image (source for all sub-crops)
 *   label    — instruction text e.g. "Crop the problem statement"
 *   onCrop   — callback(croppedDataUrl)
 *   onCancel — close without saving
 */
export default function CropFromSource({ src, label, onCrop, onCancel }) {
  const [preview, setPreview] = useState(null)

  if (preview) return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'10px 14px', background:'#f0fdf4', borderBottom:'1px solid #86efac', fontSize:13, color:'#065f46', fontWeight:700, flexShrink:0 }}>
        ✓ Cropped — confirm or re-do
      </div>
      <div style={{ flex:1, overflow:'auto', display:'flex', alignItems:'center', justifyContent:'center', background:'#f9fafb', padding:'10px' }}>
        <img src={preview} alt="cropped"
          style={{ maxWidth:'100%', maxHeight:'calc(100dvh - 200px)', borderRadius:8, border:'1.5px solid #e5e7eb', objectFit:'contain' }} />
      </div>
      <div style={{ padding:'11px 14px', borderTop:'1px solid #f3f4f6', display:'flex', gap:9, flexShrink:0 }}>
        <button className="btn-sec" style={{ flex:1 }} onClick={() => setPreview(null)}>Re-crop</button>
        <button className="btn-pri" style={{ flex:1 }} onClick={() => onCrop(preview)}>Save ✓</button>
      </div>
    </div>
  )

  return (
    <ImageCropperWithMagnifier
      src={src}
      label={label}
      onCrop={url => setPreview(url)}
      onCancel={onCancel}
    />
  )
}
