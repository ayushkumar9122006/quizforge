import { useEffect } from 'react'

export default function Palette({ questions, answers, marked, current, onJump, onClose }) {
  useEffect(() => {
    const p = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = p }
  }, [])

  const done = Object.keys(answers).length

  return (
    <>
      <div className="pal-ov open" onClick={onClose} />
      <div className="pal-panel open">
        <div style={{ padding:'18px 16px 12px', borderBottom:'1px solid #f3f4f6' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <span style={{ fontSize:15, fontWeight:800 }}>Question Palette</span>
            <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#9ca3af',lineHeight:1,padding:0 }}>×</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 10px', fontSize:12, color:'#6b7280' }}>
            {[
              {bg:'#d1fae5',bd:'#34d399',lbl:`Answered (${done})`},
              {bg:'#fef3c7',bd:'#f59e0b',lbl:`Marked (${marked.size})`},
              {bg:'#fff',bd:'#d1d5db',lbl:'Not answered'},
              {bg:'#ede9fe',bd:'#6366f1',lbl:'Current'}
            ].map(({bg,bd,lbl}) => (
              <div key={lbl} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:13,height:13,borderRadius:3,background:bg,border:`1.5px solid ${bd}`,flexShrink:0 }} />
                {lbl}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', background:'#f9fafb', borderBottom:'1px solid #f3f4f6' }}>
          {[{v:done,l:'Done',c:'#059669'},{v:questions.length-done,l:'Left',c:'#dc2626'},{v:marked.size,l:'Marked',c:'#d97706'}].map(({v,l,c}) => (
            <div key={l} style={{ flex:1, textAlign:'center', padding:'10px 0' }}>
              <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:1 }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'13px 15px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:7 }}>
            {questions.map((_,i) => {
              const a = answers[i] !== undefined
              const m = marked.has(i)
              const c = i === current
              let cls = 'pb'
              if (c) cls += ' cur'
              else if (a && m) cls += ' both'
              else if (a) cls += ' ans'
              else if (m) cls += ' mrk'
              return (
                <button key={i} className={cls} onClick={() => { onJump(i); onClose() }}>
                  {i+1}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ padding:'11px', borderTop:'1px solid #f3f4f6', fontSize:12, color:'#9ca3af', textAlign:'center' }}>
          Tap a number to jump to that question
        </div>
      </div>
    </>
  )
}
