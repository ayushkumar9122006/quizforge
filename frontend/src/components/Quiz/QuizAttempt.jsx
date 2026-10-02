import { useState, useEffect, useRef, useCallback } from 'react'
import CircularTimer from '../Common/CircularTimer.jsx'
import Palette       from './Palette.jsx'
import Lightbox      from '../Common/Lightbox.jsx'
import { formatTime } from '../../services/utils.js'

const LABELS = ['A','B','C','D','E','F']

export default function QuizAttempt({ quiz, userName, onSubmit }) {
  const questions = quiz.questions
  const perQ      = quiz.timePerQ || 300
  const totalTime = questions.length * perQ

  const [answers,  setAnswers]  = useState({})
  const [cur,      setCur]      = useState(0)
  const [qTime,    setQTime]    = useState(perQ)
  const [totLeft,  setTotLeft]  = useState(totalTime)
  const [confirm,  setConfirm]  = useState(false)
  const [marked,   setMarked]   = useState(new Set())
  const [palette,  setPalette]  = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const [qTimes,   setQTimes]   = useState({})
  const [totalSpent, setTotalSpent] = useState(0)

  const answersRef    = useRef(answers)
  const markedRef     = useRef(marked)
  const qTimesRef     = useRef(qTimes)
  const totalSpentRef = useRef(totalSpent)
  const curRef        = useRef(cur)
  const submittedRef  = useRef(false)

  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { markedRef.current  = marked  }, [marked])
  useEffect(() => { qTimesRef.current  = qTimes  }, [qTimes])
  useEffect(() => { totalSpentRef.current = totalSpent }, [totalSpent])
  useEffect(() => { curRef.current = cur }, [cur])

  const doSubmit = useCallback(
    (auto = false) => {
      if (submittedRef.current) return
      submittedRef.current = true
      onSubmit(answersRef.current, auto, markedRef.current, qTimesRef.current, totalSpentRef.current)
    },
    [onSubmit]
  )

  useEffect(() => {
    const t = setInterval(() => {
      // Track per-question time
      setQTimes(prev => {
        const c = curRef.current
        return { ...prev, [c]: (prev[c] || 0) + 1 }
      })
      setTotalSpent(s => s + 1)

      setQTime(v => {
        if (curRef.current >= questions.length - 1) {
          // On last question: timer counts down without looping and NEVER submits the quiz
          return Math.max(0, v - 1)
        }
        if (v <= 1) {
          setCur(c => {
            if (c + 1 >= questions.length) { return c }
            return c + 1
          })
          return perQ
        }
        return v - 1
      })
      setTotLeft(v => {
        if (v <= 1) { doSubmit(true); return 0 }
        return v - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [questions.length, perQ, doSubmit])

  useEffect(() => setQTime(perQ), [cur, perQ])

  const q        = questions[cur]
  const done     = Object.keys(answers).length
  const totPct   = (totLeft / totalTime) * 100
  const qPct     = (qTime   / perQ)      * 100
  const isMrk    = marked.has(cur)
  const isVisualMatch = Boolean(
    q.diagram && (
      q.question_type === 'match_column' ||
      q.text?.toLowerCase().includes('match the column') ||
      q.text?.toLowerCase().includes('match each')
    )
  )
  const hasDiag  = !!q.diagram && !isVisualMatch

  const toggleMark = () =>
    setMarked(m => { const n = new Set(m); n.has(cur) ? n.delete(cur) : n.add(cur); return n })

  const clearResponse = () => {
    setAnswers(prev => {
      const next = { ...prev }
      delete next[cur]
      return next
    })
  }

  return (
    <div className="qa-root">
      {palette && (
        <Palette
          questions={questions} answers={answers} marked={marked}
          current={cur} onJump={setCur} onClose={() => setPalette(false)}
        />
      )}
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      {/* ── Sub-bar ── */}
      <div className="qa-subbar">
        {/* Palette trigger */}
        <button
          onClick={() => setPalette(true)}
          style={{ display:'flex',alignItems:'center',gap:7,padding:'6px 13px',borderRadius:9,border:'1.5px solid #d1d5db',background:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,color:'#374151',flexShrink:0 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='#6366f1'; e.currentTarget.style.color='#6366f1' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='#d1d5db'; e.currentTarget.style.color='#374151' }}
        >
          <span style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:2,width:11 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width:4,height:4,borderRadius:1,background:'currentColor',opacity:.7 }} />)}
          </span>
          Questions
        </button>

        {/* Progress */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9ca3af', marginBottom:3 }}>
            <span>{done}/{questions.length} answered</span>
          </div>
          <div style={{ height:4, background:'#f3f4f6', borderRadius:2 }}>
            <div className="pbar-fill" style={{ height:'100%', width:`${totPct}%`, background:totLeft<60?'#ef4444':'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius:2 }} />
          </div>
        </div>

        {/* Bold total timer */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <CircularTimer value={totLeft} max={totalTime} size={36} />
          <span className="timer-display" style={{ color:totLeft<60?'#ef4444':totLeft<120?'#f59e0b':'#111827' }}>
            {formatTime(totLeft)}
          </span>
        </div>

        <button className="btn-danger" style={{ padding:'7px 15px', flexShrink:0 }} onClick={() => setConfirm(true)}>
          Submit
        </button>
      </div>

      {/* ── Body ── */}
      <div className="qa-body">
        <div className="qa-main">

          {/* Q header row */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:12,fontWeight:800,color:'#6366f1',letterSpacing:'.05em',textTransform:'uppercase' }}>
              {q.section} · Q{cur+1}/{questions.length}
            </span>
            <div style={{ display:'flex', gap:5, alignItems:'center' }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:5, background:'#ecfdf5', color:'#065f46', border:'1px solid #a7f3d0' }}>
                +{q.positive_marks !== undefined ? q.positive_marks : (q.marks !== undefined ? q.marks : 4)} marks
              </span>
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:5, background: (q.negative_marks !== undefined ? q.negative_marks : 0) > 0 ? '#fef2f2' : '#f3f4f6', color: (q.negative_marks !== undefined ? q.negative_marks : 0) > 0 ? '#b91c1c' : '#6b7280', border: `1px solid ${(q.negative_marks !== undefined ? q.negative_marks : 0) > 0 ? '#fca5a5' : '#e5e7eb'}` }}>
                {(q.negative_marks !== undefined ? q.negative_marks : 0) > 0 ? `-${q.negative_marks} negative` : 'No negative marking'}
              </span>
              {(q.explanation?.includes('Page') || q.source_page) && (
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:5, background:'#ede9fe', color:'#6d28d9', border:'1px solid #ddd6fe' }}>
                  📄 {q.source_page ? `Page ${q.source_page}` : q.explanation}
                </span>
              )}
            </div>
            {isMrk && <span className="tag tag-yellow">🔖 Marked</span>}
            <div style={{ flex:1, minWidth:60, height:3, background:'#f3f4f6', borderRadius:2, overflow:'hidden' }}>
              <div className="pbar-fill" style={{ height:'100%', width:`${qPct}%`, background:qPct<25?'#ef4444':qPct<50?'#f59e0b':'#6366f1', borderRadius:2 }} />
            </div>
            <div style={{ position:'relative', flexShrink:0 }}>
              <CircularTimer value={qTime} max={perQ} size={36} />
              <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:qPct<25?'#dc2626':'#374151' }}>
                {qTime < 60 ? `${qTime}s` : `${Math.ceil(qTime/60)}m`}
              </div>
            </div>
          </div>

          {/* Two-col if diagram, one-col otherwise */}
          <div className={hasDiag ? 'qa-two' : 'qa-one'} style={{ overflow:'hidden' }}>

            {/* Left: question + options */}
            <div style={{ display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>
              <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'auto', padding:'12px 14px' }}>
                {q.qImage && (
                  <div style={{ marginBottom:10, flexShrink:0 }}>
                    <img src={q.qImage} alt="question" onClick={() => setLightbox(q.qImage)}
                      style={{ maxWidth:'100%', maxHeight:140, borderRadius:9, border:'1.5px solid #e5e7eb', cursor:'zoom-in', objectFit:'contain', background:'#f9fafb', display:'block' }} />
                  </div>
                )}
                <p style={{ fontSize:15, fontWeight:700, margin:'0 0 10px', lineHeight:1.65, color:'#111827', flexShrink:0 }}>
                  {q.text}
                </p>

                {/* Cropped visual Match-the-Column table */}
                {isVisualMatch && (
                  <div style={{ margin:'6px 0 14px', borderRadius:9, overflow:'hidden', border:'1.5px solid #e5e7eb', background:'#f9fafb', padding:'8px', textAlign:'center', flexShrink:0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#4f46e5', marginBottom:6, textAlign:'left', display:'flex', alignItems:'center', gap:5 }}>
                      <span>📊</span> Original Matching Table (from PDF)
                    </div>
                    <img
                      src={q.diagram}
                      alt="Original Matching Table"
                      onClick={() => setLightbox(q.diagram)}
                      style={{ maxWidth:'100%', maxHeight:320, objectFit:'contain', cursor:'zoom-in', display:'block', margin:'0 auto', borderRadius:6 }}
                    />
                    <span style={{ fontSize:10, color:'#9ca3af', display:'block', marginTop:4 }}>🔍 Click image to enlarge table</span>
                  </div>
                )}

                <div style={{ display:'grid', gap:7, flex:1 }}>
                  {q.options.map((opt, oi) => {
                    const sel  = answers[cur] === oi
                    const isImg = opt && typeof opt === 'object' && opt.type === 'image'
                    return (
                      <button key={oi} className={`opt${sel ? ' sel' : ''}`}
                        onClick={() => setAnswers(a => ({ ...a, [cur]: oi }))}
                        style={{ alignItems: isImg ? 'flex-start' : 'center' }}>
                        <span className="obadge" style={{ marginTop: isImg ? 4 : 0 }}>{LABELS[oi]}</span>
                        {isImg ? (
                          <div style={{ flex:1, lineHeight:0 }}>
                            <img src={opt.src} alt={`Option ${LABELS[oi]}`}
                              style={{ maxWidth:'100%', maxHeight:80, objectFit:'contain', borderRadius:7, background:'#f9fafb', display:'block', cursor:'pointer' }}
                              onClick={e => { e.stopPropagation(); setLightbox(opt.src) }} />
                            <span style={{ fontSize:10, color:'#9ca3af', lineHeight:1, marginTop:3, display:'block' }}>Tap image to enlarge</span>
                          </div>
                        ) : (
                          <span className="olabel" style={{ flex:1, lineHeight:1.4, fontSize:13 }}>{opt}</span>
                        )}
                        {sel && <span style={{ fontSize:15, color:'#6366f1', fontWeight:800, marginTop: isImg ? 4 : 0 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Actions row: Mark for review + Clear Response + Status */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8, gap:8, flexWrap:'wrap' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button
                    type="button"
                    onClick={toggleMark}
                    style={{ display:'flex',alignItems:'center',gap:5,padding:'6px 13px',borderRadius:20,fontSize:12,fontWeight:700,cursor:'pointer',border:'1.5px solid',borderColor:isMrk?'#f59e0b':'#d1d5db',background:isMrk?'#fef3c7':'#fff',color:isMrk?'#92400e':'#6b7280' }}>
                    {isMrk ? '🔖 Marked' : '🏳 Mark for later'}
                  </button>
                  <button
                    type="button"
                    onClick={clearResponse}
                    disabled={answers[cur] === undefined}
                    style={{
                      display:'flex',
                      alignItems:'center',
                      gap:5,
                      padding:'6px 13px',
                      borderRadius:20,
                      fontSize:12,
                      fontWeight:700,
                      cursor: answers[cur] !== undefined ? 'pointer' : 'not-allowed',
                      border:'1.5px solid #e5e7eb',
                      background: answers[cur] !== undefined ? '#fef2f2' : '#f9fafb',
                      color: answers[cur] !== undefined ? '#dc2626' : '#9ca3af',
                      transition:'all .15s ease'
                    }}
                    title="Remove selected option for this question"
                  >
                    🗑️ Clear Response
                  </button>
                </div>
                <span style={{ fontSize:12 }}>
                  {answers[cur] !== undefined
                    ? <span style={{ color:'#059669', fontWeight:700 }}>✓ Answered</span>
                    : <span style={{ color:'#9ca3af' }}>Not answered</span>}
                </span>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <button className="navarr" onClick={() => setCur(c => Math.max(0,c-1))} disabled={cur===0}>← Prev</button>
                {cur === questions.length - 1 ? (
                  <button className="btn-pri" style={{ flex:1, background:'#dc2626' }} onClick={() => setConfirm(true)}>
                    Submit Quiz ✓
                  </button>
                ) : (
                  <button className="navarr" onClick={() => setCur(c => Math.min(questions.length-1,c+1))}>Next →</button>
                )}
              </div>
            </div>

            {/* Right: diagram (only in two-col) */}
            {hasDiag && (
              <div style={{ display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>
                <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'10px', minHeight:0 }}>
                  <img src={q.diagram} alt="diagram"
                    onClick={() => setLightbox(q.diagram)}
                    style={{ maxWidth:'100%', maxHeight:'100%', borderRadius:9, cursor:'zoom-in', objectFit:'contain', background:'#f9fafb', display:'block' }} />
                  <p style={{ fontSize:11, color:'#9ca3af', margin:'6px 0 0' }}>Tap to enlarge</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirm submit modal ── */}
      {confirm && (
        <div style={{ position:'fixed',inset:0,background:'rgba(10,10,25,.58)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400 }}>
          <div style={{ background:'#fff',borderRadius:20,padding:'2rem',maxWidth:360,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:40, textAlign:'center', marginBottom:12 }}>📋</div>
            <h3 style={{ margin:'0 0 9px', fontSize:19, fontWeight:800, textAlign:'center' }}>Submit quiz?</h3>
            <p style={{ color:'#6b7280', fontSize:14, textAlign:'center', margin:'0 0 5px' }}>{done}/{questions.length} answered</p>
            {questions.length - done > 0 && (
              <p style={{ color:'#dc2626', fontSize:13, textAlign:'center', margin:'0 0 18px' }}>⚠ {questions.length-done} unanswered</p>
            )}
            <div style={{ display:'flex', gap:9, marginTop:18 }}>
              <button className="btn-sec" style={{ flex:1 }} onClick={() => setConfirm(false)}>Cancel</button>
              <button style={{ flex:1,padding:'11px',borderRadius:10,background:'#ef4444',color:'#fff',border:'none',cursor:'pointer',fontSize:14,fontWeight:700 }}
                onClick={() => { setConfirm(false); doSubmit(false) }}>
                Submit now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
