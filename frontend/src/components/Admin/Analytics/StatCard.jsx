/**
 * StatCard — single metric tile used in the analytics dashboard.
 */
export default function StatCard({ icon, label, value, sub, color = '#6366f1', bg = '#f5f3ff' }) {
  return (
    <div style={{ background:'#fff', border:'1.5px solid #e5e7eb', borderRadius:14, padding:'1.1rem 1.3rem', display:'flex', alignItems:'flex-start', gap:14 }}>
      <div style={{ width:46, height:46, borderRadius:12, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
        {icon}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
          {label}
        </div>
        <div style={{ fontSize:26, fontWeight:900, color, lineHeight:1, marginBottom:3 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize:12, color:'#9ca3af' }}>{sub}</div>}
      </div>
    </div>
  )
}
