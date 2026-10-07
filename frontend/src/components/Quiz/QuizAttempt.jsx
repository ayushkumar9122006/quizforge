import { useState, useEffect, useRef, useCallback } from 'react'
import CircularTimer from '../Common/CircularTimer.jsx'
import Palette       from './Palette.jsx'
import Lightbox      from '../Common/Lightbox.jsx'
import { formatTime } from '../../services/utils.js'

const LABELS = ['A','B','C','D','E','F']

export default function QuizAttempt({ quiz, userName, onSubmit }) {
  const questions = quiz.questions || []
  const perQ      = Math.max(1, Math.round(Number(quiz.timePerQ) || 300))
  const totalTime = Math.max(1, Math.round(quiz.effectiveDurationSec || (questions.length * perQ)))

  const storageDeadlineKey = `quizee_attempt_${quiz.id}_deadline`
  const storageAnswersKey  = `quizee_attempt_${quiz.id}_answers`
  const storageTabSwitchesKey = `quizee_attempt_${quiz.id}_tab_switches`

  const getTargetDeadlineMs = () => {
    if (quiz.effectiveDeadline) {
      const ms = new Date(quiz.effectiveDeadline).getTime()
      try { localStorage.setItem(storageDeadlineKey, String(ms)) } catch {}
      return ms
    }
    try {
      const saved = localStorage.getItem(storageDeadlineKey)
      if (saved && !isNaN(Number(saved))) {
        return Number(saved)
      }
    } catch {}
    const calculated = Date.now() + totalTime * 1000
    try { localStorage.setItem(storageDeadlineKey, String(calculated)) } catch {}
    return calculated
  }

  const deadlineMsRef = useRef(getTargetDeadlineMs())

  const getInitialTotLeft = () => {
    const diffSec = Math.max(0, Math.ceil((deadlineMsRef.current - Date.now()) / 1000))
    return diffSec > 0 ? diffSec : totalTime
  }

  const [answers,  setAnswers]  = useState(() => {
    try {
      const raw = localStorage.getItem(storageAnswersKey) || sessionStorage.getItem(storageAnswersKey)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })
  const [cur,      setCur]      = useState(0)
  const [qTime,    setQTime]    = useState(perQ)
  const [totLeft,  setTotLeft]  = useState(getInitialTotLeft)
  const [confirm,  setConfirm]  = useState(false)
  const [marked,   setMarked]   = useState(new Set())
  const [palette,  setPalette]  = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError,  setSubmitError]  = useState(null)

  // ── Tab Switch / Strike Monitoring (3 violations max) ──
  const [tabSwitchCount, setTabSwitchCount] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageTabSwitchesKey)
      return saved ? Math.min(3, Math.max(0, parseInt(saved, 10) || 0)) : 0
    } catch { return 0 }
  })
  const [tabWarningModal, setTabWarningModal] = useState(null)

  const [qTimes,   setQTimes]   = useState({})
  const [totalSpent, setTotalSpent] = useState(0)
  const [lastVisitedPerSec, setLastVisitedPerSec] = useState({})

  const answersRef          = useRef(answers)
  const markedRef           = useRef(marked)
  const qTimesRef           = useRef(qTimes)
  const totalSpentRef       = useRef(totalSpent)
  const curRef              = useRef(cur)
  const isSubmittingRef     = useRef(false)
  const submittedRef        = useRef(false)
  const tabSwitchCountRef   = useRef(tabSwitchCount)
  const lastViolationTimeRef = useRef(0)
  const isMountedRef        = useRef(false)
  const hasLeftRef          = useRef(false)

  useEffect(() => {
    answersRef.current = answers
    try {
      localStorage.setItem(storageAnswersKey, JSON.stringify(answers))
      sessionStorage.setItem(storageAnswersKey, JSON.stringify(answers))
    } catch {}
  }, [answers, storageAnswersKey])

  useEffect(() => {
    tabSwitchCountRef.current = tabSwitchCount
    try {
      sessionStorage.setItem(storageTabSwitchesKey, String(tabSwitchCount))
    } catch {}
  }, [tabSwitchCount, storageTabSwitchesKey])

  // Prevent false-positive tab switches during initial component mount/hydration
  useEffect(() => {
    const timer = setTimeout(() => {
      isMountedRef.current = true
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => { markedRef.current  = marked  }, [marked])
  useEffect(() => { qTimesRef.current  = qTimes  }, [qTimes])
  useEffect(() => { totalSpentRef.current = totalSpent }, [totalSpent])
  useEffect(() => { curRef.current = cur }, [cur])

  // Track last visited question index per section
  useEffect(() => {
    if (questions[cur]) {
      const sec = questions[cur].section || 'General'
      setLastVisitedPerSec(prev => ({ ...prev, [sec]: cur }))
    }
  }, [cur, questions])

  const doSubmit = useCallback(
    async (auto = false) => {
      // Submission mutex: prevents double, triple, and race condition submits
      if (isSubmittingRef.current || submittedRef.current) return
      isSubmittingRef.current = true
      setIsSubmitting(true)
      setSubmitError(null)

      try {
        await onSubmit(
          answersRef.current,
          auto,
          markedRef.current,
          qTimesRef.current,
          totalSpentRef.current
        )
        // Mark as submitted and clean up storage only after confirmed success
        submittedRef.current = true
        try {
          localStorage.removeItem(storageDeadlineKey)
          localStorage.removeItem(storageAnswersKey)
          sessionStorage.removeItem(storageAnswersKey)
          sessionStorage.removeItem(storageTabSwitchesKey)
        } catch {}
      } catch (err) {
        console.error('Quiz submission failed:', err)
        // CRITICAL DATA INTEGRITY:
        // Do NOT delete localStorage or React answers!
        // Release the mutex so the student can retry.
        isSubmittingRef.current = false
        setIsSubmitting(false)
        const msg = err?.response?.data?.detail || err?.message || 'Submission failed. Your answers are safely preserved. Click to retry.'
        setSubmitError(msg)
      }
    },
    [onSubmit, storageDeadlineKey, storageAnswersKey, storageTabSwitchesKey]
  )

  // ── Centralized Tab-Switch Violation Handler ──
  const handleTabViolation = useCallback(() => {
    if (!isMountedRef.current) return
    if (isSubmittingRef.current || submittedRef.current) return
    const now = Date.now()
    // Deduplicate rapid/overlapping events (blur + visibilitychange) within 1.5s
    if (now - lastViolationTimeRef.current < 1500) return
    lastViolationTimeRef.current = now

    const curCount = tabSwitchCountRef.current
    if (curCount >= 3) return

    const nextCount = curCount + 1
    tabSwitchCountRef.current = nextCount
    setTabSwitchCount(nextCount)
    try {
      sessionStorage.setItem(storageTabSwitchesKey, String(nextCount))
    } catch {}

    if (nextCount === 1) {
      setTabWarningModal({ count: 1 })
    } else if (nextCount === 2) {
      setTabWarningModal({ count: 2 })
    } else if (nextCount >= 3) {
      setTabWarningModal({ count: 3 })
      // Auto-submit immediately using existing safe submission pipeline
      doSubmit(true)
    }
  }, [doSubmit, storageTabSwitchesKey])

  // ── Browser Visibility & Focus Monitoring ──
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (!hasLeftRef.current) {
          hasLeftRef.current = true
          handleTabViolation()
        }
      } else if (document.visibilityState === 'visible') {
        hasLeftRef.current = false
      }
    }

    const onWindowBlur = () => {
      // Blur alone only counts if document actually became hidden
      if (document.visibilityState === 'hidden') {
        if (!hasLeftRef.current) {
          hasLeftRef.current = true
          handleTabViolation()
        }
      }
    }

    const onWindowFocus = () => {
      hasLeftRef.current = false
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('focus', onWindowFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('focus', onWindowFocus)
    }
  }, [handleTabViolation])

  useEffect(() => {
    const t = setInterval(() => {
      // Track per-question time
      setQTimes(prev => {
        const c = curRef.current
        return { ...prev, [c]: (prev[c] || 0) + 1 }
      })
      setTotalSpent(s => s + 1)

      setQTime(v => {
        const curSec = Math.max(0, Math.round(v))
        if (curRef.current >= questions.length - 1) {
          // On last question: timer counts down without looping and NEVER submits the quiz
          return Math.max(0, curSec - 1)
        }
        if (curSec <= 1) {
          setCur(c => {
            if (c + 1 >= questions.length) { return c }
            return c + 1
          })
          return perQ
        }
        return Math.max(0, curSec - 1)
      })

      // Authoritative overall remaining time against absolute deadline
      const curRemaining = Math.max(0, Math.ceil((deadlineMsRef.current - Date.now()) / 1000))
      setTotLeft(curRemaining)
      if (curRemaining <= 0) {
        doSubmit(true)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [questions.length, perQ, doSubmit])

  useEffect(() => setQTime(perQ), [cur, perQ])

  const q        = questions[cur] || {}
  const done     = Object.keys(answers).length
  const totPct   = (totLeft / totalTime) * 100
  const qPct     = (qTime   / perQ)      * 100
  const isMrk    = marked.has(cur)

  // ── Sections metadata for top navigation bar ─────────────────────────────
  const sectionsMap = {}
  questions.forEach((item, idx) => {
    const s = item.section || 'General'
    if (!sectionsMap[s]) {
      sectionsMap[s] = []
    }
    sectionsMap[s].push({ ...item, globalIndex: idx })
  })

  const sectionsList = Object.entries(sectionsMap).map(([name, qs]) => ({
    name,
    questions: qs,
    firstIndex: qs[0].globalIndex,
    totalCount: qs.length,
    answeredCount: qs.filter(x => answers[x.globalIndex] !== undefined).length,
  }))

  const curSecName = q.section || 'General'
  const curSecQuestions = sectionsMap[curSecName] || []
  const localQIndex = curSecQuestions.findIndex(x => x.globalIndex === cur) + 1
  const totalInSec = curSecQuestions.length

  const handleSectionSwitch = (secName) => {
    const targetIdx = lastVisitedPerSec[secName] !== undefined
      ? lastVisitedPerSec[secName]
      : (sectionsMap[secName]?.[0]?.globalIndex ?? 0)
    setCur(targetIdx)
  }

  const isMatch = Boolean(
    q.question_type === 'match_column' ||
    q.text?.toLowerCase().includes('match the column') ||
    q.text?.toLowerCase().includes('match each')
  )

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
          questions={questions}
          answers={answers}
          marked={marked}
          current={cur}
          onJump={setCur}
          onClose={() => setPalette(false)}
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
          Questions Palette
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

        {tabSwitchCount > 0 && (
          <div style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:8,background:tabSwitchCount>=2?'#fee2e2':'#fef3c7',color:tabSwitchCount>=2?'#991b1b':'#92400e',fontSize:11,fontWeight:800,flexShrink:0,border:`1px solid ${tabSwitchCount>=2?'#fca5a5':'#fde68a'}` }}>
            <span>⚠️</span>
            <span>Tab switches: {tabSwitchCount}/3</span>
          </div>
        )}

        <button className="btn-danger" style={{ padding:'7px 15px', flexShrink:0 }} onClick={() => setConfirm(true)}>
          Submit Test
        </button>
      </div>

      {/* ── Section Navigation Bar (ISSUE 2) ── */}
      {sectionsList.length > 1 && (
        <div
          style={{
            background: '#fff',
            borderBottom: '1.5px solid #e2e8f0',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            flexShrink: 0,
            zIndex: 40,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', marginRight: 4 }}>
            Sections:
          </span>
          {sectionsList.map((sec) => {
            const isActive = curSecName === sec.name
            return (
              <button
                key={sec.name}
                type="button"
                onClick={() => handleSectionSwitch(sec.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 13px',
                  borderRadius: 8,
                  border: `1.5px solid ${isActive ? '#6366f1' : '#e2e8f0'}`,
                  background: isActive ? '#ede9fe' : '#f8fafc',
                  color: isActive ? '#4338ca' : '#475569',
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all .14s ease',
                  boxShadow: isActive ? '0 2px 8px rgba(99, 102, 241, 0.15)' : 'none',
                }}
              >
                <span>{sec.name}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: isActive ? '#c7d2fe' : '#e2e8f0',
                    color: isActive ? '#312e81' : '#64748b',
                    padding: '1px 6px',
                    borderRadius: 10,
                  }}
                >
                  {sec.answeredCount}/{sec.totalCount}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Body ── */}
      <div className="qa-body">
        <div className="qa-main">

          {/* Q header row */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:13,fontWeight:900,color:'#4338ca',letterSpacing:'.04em',textTransform:'uppercase',background:'#ede9fe',padding:'3px 10px',borderRadius:6 }}>
              {curSecName} · Q{localQIndex}/{totalInSec}
            </span>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
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
            {isMrk && <span className="tag tag-yellow">🔖 Marked for Review</span>}
            <div style={{ flex:1, minWidth:60, height:3, background:'#f3f4f6', borderRadius:2, overflow:'hidden' }}>
              <div className="pbar-fill" style={{ height:'100%', width:`${qPct}%`, background:qPct<25?'#ef4444':qPct<50?'#f59e0b':'#6366f1', borderRadius:2 }} />
            </div>
            <div style={{ position:'relative', flexShrink:0 }} title={`Remaining question time: ${Math.round(qTime)}s (${(qTime / 60).toFixed(2)}m)`}>
              <CircularTimer value={Math.round(qTime)} max={perQ} size={36} />
              <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8.5,fontWeight:800,color:qPct<25?'#dc2626':'#374151' }}>
                {Math.round(qTime) < 60 ? `${Math.round(qTime)}s` : `${(qTime / 60).toFixed(2)}m`}
              </div>
            </div>
          </div>

          {/* Submission Error & Retry Banner */}
          {submitError && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #ef4444', borderRadius: 12, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 880, margin: '0 auto 14px', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b' }}>Submission Error</div>
                  <div style={{ fontSize: 12, color: '#b91c1c' }}>{submitError} (Your answers remain safely stored).</div>
                </div>
              </div>
              <button
                type="button"
                className="btn-pri"
                style={{ background: '#dc2626', padding: '7px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                onClick={() => doSubmit(false)}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Retrying...' : 'Retry Submit'}
              </button>
            </div>
          )}

          {/* Unified reading-order layout: Statement -> Diagram/Figure -> Options */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 18px', maxWidth: 880, margin: '0 auto', width: '100%' }}>

              {/* 1. Problem Statement */}
              <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.65, color: '#111827' }}>
                {q.text}
              </p>

              {/* 2. Visual Asset (Original Diagram / Chemical Structure / Cropped Match Table) */}
              {(q.diagram || q.question_image || q.qImage) && (
                <div
                  style={{
                    margin: '6px 0 16px',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '1.5px solid #e2e8f0',
                    background: '#f8fafc',
                    padding: '10px 12px',
                    textAlign: 'center',
                  }}
                >
                  {isMatch && (
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#4f46e5', marginBottom: 8, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📊</span> Original Matching Table (from PDF)
                    </div>
                  )}
                  <img
                    src={q.diagram || q.question_image || q.qImage}
                    alt={isMatch ? 'Original Matching Table' : 'Question Figure'}
                    onClick={() => setLightbox(q.diagram || q.question_image || q.qImage)}
                    style={{
                      maxWidth: '100%',
                      maxHeight: isMatch ? 360 : 280,
                      objectFit: 'contain',
                      cursor: 'zoom-in',
                      display: 'block',
                      margin: '0 auto',
                      borderRadius: 6,
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 5 }}>
                    🔍 Click image to enlarge full screen
                  </span>
                </div>
              )}

              {/* 3. Options List */}
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                {(q.options || []).map((opt, oi) => {
                  const sel  = answers[cur] === oi
                  const isImg = opt && typeof opt === 'object' && opt.type === 'image'
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={`opt${sel ? ' sel' : ''}`}
                      onClick={() => setAnswers(a => ({ ...a, [cur]: oi }))}
                      style={{ alignItems: isImg ? 'flex-start' : 'center' }}
                    >
                      <span className="obadge" style={{ marginTop: isImg ? 4 : 0 }}>{LABELS[oi]}</span>
                      {isImg ? (
                        <div style={{ flex: 1, lineHeight: 0 }}>
                          <img
                            src={opt.src}
                            alt={`Option ${LABELS[oi]}`}
                            style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', borderRadius: 7, background: '#f9fafb', display: 'block', cursor: 'pointer' }}
                            onClick={e => { e.stopPropagation(); setLightbox(opt.src) }}
                          />
                          <span style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1, marginTop: 3, display: 'block' }}>Tap image to enlarge</span>
                        </div>
                      ) : (
                        <span className="olabel" style={{ flex: 1, lineHeight: 1.4, fontSize: 14 }}>{opt}</span>
                      )}
                      {sel && <span style={{ fontSize: 16, color: '#6366f1', fontWeight: 800, marginTop: isImg ? 4 : 0 }}>✓</span>}
                    </button>
                  )
                })}
              </div>

              {/* 4. Actions row: Mark for review + Clear Response + Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={toggleMark}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 13px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1.5px solid',
                      borderColor: isMrk ? '#f59e0b' : '#d1d5db',
                      background: isMrk ? '#fef3c7' : '#fff',
                      color: isMrk ? '#92400e' : '#6b7280',
                    }}
                  >
                    {isMrk ? '🔖 Marked' : '🏳 Mark for later'}
                  </button>
                  <button
                    type="button"
                    onClick={clearResponse}
                    disabled={answers[cur] === undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 13px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: answers[cur] !== undefined ? 'pointer' : 'not-allowed',
                      border: '1.5px solid #e5e7eb',
                      background: answers[cur] !== undefined ? '#fef2f2' : '#f9fafb',
                      color: answers[cur] !== undefined ? '#dc2626' : '#9ca3af',
                      transition: 'all .15s ease',
                    }}
                    title="Remove selected option for this question"
                  >
                    🗑️ Clear Response
                  </button>
                </div>
                <span style={{ fontSize: 12 }}>
                  {answers[cur] !== undefined
                    ? <span style={{ color: '#059669', fontWeight: 700 }}>✓ Answered</span>
                    : <span style={{ color: '#9ca3af' }}>Not answered</span>}
                </span>
              </div>

              {/* 5. Navigation buttons (Seamless section progression) */}
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="navarr"
                  onClick={() => setCur(c => Math.max(0, c - 1))}
                  disabled={cur === 0}
                  style={{ flex: 1 }}
                >
                  ← Prev
                </button>
                {cur === questions.length - 1 ? (
                  <button
                    type="button"
                    className="btn-pri"
                    style={{ flex: 1, background: isSubmitting ? '#9ca3af' : '#dc2626', cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
                    onClick={() => setConfirm(true)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Quiz ✓'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="navarr"
                    onClick={() => setCur(c => Math.min(questions.length - 1, c + 1))}
                    style={{ flex: 1 }}
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirm submit modal ── */}
      {confirm && (
        <div style={{ position:'fixed',inset:0,background:'rgba(10,10,25,.58)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400 }}>
          <div style={{ background:'#fff',borderRadius:20,padding:'2rem',maxWidth:380,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:40, textAlign:'center', marginBottom:12 }}>📋</div>
            <h3 style={{ margin:'0 0 9px', fontSize:19, fontWeight:800, textAlign:'center' }}>Submit quiz?</h3>
            <p style={{ color:'#6b7280', fontSize:14, textAlign:'center', margin:'0 0 5px' }}>{done}/{questions.length} answered across all sections</p>
            {questions.length - done > 0 && (
              <p style={{ color:'#dc2626', fontSize:13, textAlign:'center', margin:'0 0 18px' }}>⚠ {questions.length-done} unanswered</p>
            )}
            <div style={{ display:'flex', gap:9, marginTop:18 }}>
              <button className="btn-sec" style={{ flex:1 }} onClick={() => setConfirm(false)} disabled={isSubmitting}>Cancel</button>
              <button
                style={{ flex:1,padding:'11px',borderRadius:10,background:isSubmitting ? '#9ca3af' : '#ef4444',color:'#fff',border:'none',cursor:isSubmitting ? 'not-allowed' : 'pointer',fontSize:14,fontWeight:700 }}
                onClick={() => { setConfirm(false); doSubmit(false) }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Switch Warning Modal (Strikes 1, 2, 3) ── */}
      {tabWarningModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(10,10,25,.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,backdropFilter:'blur(4px)' }}>
          <div style={{ background:'#fff',borderRadius:20,padding:'2rem',maxWidth:440,width:'90%',boxShadow:'0 25px 70px rgba(0,0,0,.25)',textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:10 }}>
              {tabWarningModal.count >= 3 ? '🚨' : '⚠️'}
            </div>

            {tabWarningModal.count === 1 && (
              <>
                <div style={{ display:'inline-block',background:'#fef3c7',color:'#92400e',fontWeight:800,fontSize:11,padding:'4px 12px',borderRadius:20,marginBottom:10,letterSpacing:'0.05em',textTransform:'uppercase' }}>
                  Violation 1 of 3
                </div>
                <h3 style={{ margin:'0 0 10px', fontSize:20, fontWeight:800, color:'#111827' }}>
                  Tab Switch Detected
                </h3>
                <p style={{ color:'#4b5563', fontSize:14, margin:'0 0 20px', lineHeight:1.55 }}>
                  You navigated away from the quiz window. This is your <strong>1st warning</strong>.<br/>
                  If you switch tabs <strong>2 more times</strong>, your quiz will be <strong>automatically submitted</strong> immediately.
                </p>
                <button
                  type="button"
                  className="btn-pri"
                  style={{ width:'100%',padding:'12px',borderRadius:10,fontSize:14,fontWeight:700 }}
                  onClick={() => setTabWarningModal(null)}
                >
                  I Understand, Return to Quiz
                </button>
              </>
            )}

            {tabWarningModal.count === 2 && (
              <>
                <div style={{ display:'inline-block',background:'#fee2e2',color:'#991b1b',fontWeight:800,fontSize:11,padding:'4px 12px',borderRadius:20,marginBottom:10,letterSpacing:'0.05em',textTransform:'uppercase' }}>
                  Violation 2 of 3 — Final Warning
                </div>
                <h3 style={{ margin:'0 0 10px', fontSize:20, fontWeight:800, color:'#b91c1c' }}>
                  Warning: Second Tab Switch
                </h3>
                <p style={{ color:'#4b5563', fontSize:14, margin:'0 0 20px', lineHeight:1.55 }}>
                  You left the quiz tab again. This is your <strong>2nd violation</strong>.<br/>
                  <strong style={{ color:'#dc2626' }}>ONE MORE VIOLATION</strong> will immediately auto-submit your test and lock your answers.
                </p>
                <button
                  type="button"
                  className="btn-pri"
                  style={{ width:'100%',padding:'12px',borderRadius:10,fontSize:14,fontWeight:700,background:'#dc2626' }}
                  onClick={() => setTabWarningModal(null)}
                >
                  I Understand, Resume Test
                </button>
              </>
            )}

            {tabWarningModal.count >= 3 && (
              <>
                <div style={{ display:'inline-block',background:'#7f1d1d',color:'#fee2e2',fontWeight:800,fontSize:11,padding:'4px 12px',borderRadius:20,marginBottom:10,letterSpacing:'0.05em',textTransform:'uppercase' }}>
                  Violation 3 of 3 — Auto-Submitting
                </div>
                <h3 style={{ margin:'0 0 10px', fontSize:20, fontWeight:800, color:'#991b1b' }}>
                  Test Auto-Submitted
                </h3>
                <p style={{ color:'#4b5563', fontSize:14, margin:'0 0 20px', lineHeight:1.55 }}>
                  You have exceeded the maximum allowed tab switches (3/3).<br/>
                  Your quiz is now being <strong>automatically submitted</strong>. All your completed answers are being graded.
                </p>
                {submitError ? (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ color:'#dc2626',fontSize:13,fontWeight:600,marginBottom:10 }}>
                      {submitError}
                    </div>
                    <button
                      type="button"
                      className="btn-pri"
                      style={{ width:'100%',padding:'12px',borderRadius:10,fontSize:14,fontWeight:700,background:'#dc2626' }}
                      onClick={() => doSubmit(true)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Submitting...' : 'Retry Auto-Submit'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'12px',background:'#f3f4f6',borderRadius:10,color:'#374151',fontSize:13,fontWeight:600 }}>
                    <span className="spinner" style={{ display:'inline-block',width:16,height:16,border:'2px solid #9ca3af',borderTopColor:'#111827',borderRadius:'50%',animation:'spin 1s linear infinite' }} />
                    Submitting your answers securely...
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
