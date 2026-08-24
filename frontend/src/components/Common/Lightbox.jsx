export default function Lightbox({ src, onClose }) {
  if (!src) return null
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt="lightbox" />
    </div>
  )
}
