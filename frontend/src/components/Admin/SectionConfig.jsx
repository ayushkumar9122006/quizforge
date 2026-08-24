import { useState } from 'react'
import { uid } from '../../services/utils.js'

export default function SectionConfig({ onDone, onBack }) {
  const [title,    setTitle]    = useState('')
  const [timePerQ, setTimePerQ] = useState(5)
  const [sections, setSections] = useState([{ name:'Section A', count:5 }])

  const addSec    = () => setSections(s => [...s, { name:`Section ${String.fromCharCode(65+s.length)}`, count:5 }])
  const remSec    = i  => setSections(s => s.filter((_,j) => j !== i))
  const upSec     = (i,f,v) => setSections(s => s.map((x,j) => j===i ? {...x,[f]:v} : x))
  const totalQ    = sections.reduce((a,s) => a + Number(s.count), 0)

  const build = () => {
    if (!title.trim()) { alert('Enter a quiz title.'); return }
    if (totalQ < 1)    { alert('Add at least 1 question.'); return }
    const questions = []
    sections.forEach(sec => {
      for (let i=0; i<Number(sec.count); i++)
        questions.push({ id:uid(), text:'', options:['','','',''], correct:null, explanation:'', section:sec.name, diagram:null })
    })
    onDone(questions, title, timePerQ * 60)
  }

  return (
    <div style={{ maxWidth:520, margin:'0 auto', padding:'2rem 1.5rem' }}>
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom:18 }}>← Back</button>
      <h2 style={{ fontSize:21, fontWeight:800, margin:'0 0 4px' }}>Configure quiz</h2>
      <p style={{ color:'#6b7280', fontSize:14, marginBottom:22 }}>Set title, timing, and define sections.</p>

      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ marginBottom:14 }}>
          <label className="lbl">Quiz title</label>
          <input className="inp" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Physics — Chapter 3 Test" />
        </div>
        <div>
          <label className="lbl">Minutes per question</label>
          <input type="number" className="inp" min={1} max={30} value={timePerQ}
            onChange={e => setTimePerQ(Math.max(1,+e.target.value))} style={{ width:120 }} />
        </div>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <label className="lbl" style={{ margin:0 }}>Sections</label>
          <button onClick={addSec} style={{ fontSize:12, fontWeight:700, color:'#6366f1', background:'none', border:'1.5px dashed #c4b5fd', borderRadius:7, padding:'4px 11px', cursor:'pointer' }}>
            + Add section
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 34px', gap:9, marginBottom:7 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Name</span>
          <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Questions</span>
          <span />
        </div>
        {sections.map((sec,i) => (
          <div key={i} className="sec-row">
            <input className="inp-sm" value={sec.name} onChange={e => upSec(i,'name',e.target.value)} placeholder={`Section ${i+1}`} />
            <input type="number" className="inp-sm" min={1} max={100} value={sec.count} onChange={e => upSec(i,'count',Math.max(1,+e.target.value))} />
            {sections.length > 1
              ? <button onClick={() => remSec(i)} style={{ width:32,height:32,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',fontWeight:800,fontSize:16 }}>×</button>
              : <div />}
          </div>
        ))}
        <div style={{ marginTop:10, padding:'9px 13px', background:'#f5f3ff', borderRadius:9, fontSize:13, color:'#6366f1', fontWeight:700 }}>
          Total: {totalQ} questions · {sections.length} section{sections.length!==1?'s':''}
        </div>
      </div>

      <button className="btn-pri" style={{ width:'100%' }} onClick={build}>
        Start adding questions →
      </button>
    </div>
  )
}
