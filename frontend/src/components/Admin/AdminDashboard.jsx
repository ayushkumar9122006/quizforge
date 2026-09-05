import { useState, useRef } from 'react'
import { useQuizzes } from '../../hooks/useQuizzes.js'
import { createQuiz, publishQuiz, toApiFormat, uploadSolutionPdf, deleteSolutionPdf, viewSolutionPdf } from '../../services/quizService.js'
import { createSession, endSession } from '../../services/sessionService.js'
import SectionConfig      from './SectionConfig.jsx'
import QuestionEditor     from './QuestionEditor.jsx'
import LiveSessionMonitor from './LiveSessionMonitor.jsx'
import { useRoom }        from '../../hooks/useRoom.js'
import AnalyticsDashboard from './Analytics/AnalyticsDashboard.jsx'

export default function AdminDashboard({ onLogout }) {
  const { quizzes, loading, error, reload, remove, togglePublish } = useQuizzes()
  const [screen,       setScreen]      = useState('dash')
  const [draftQ,       setDraftQ]      = useState(null)
  const [draftMeta,    setDraftMeta]   = useState(null)
  const [saving,       setSaving]      = useState(false)
  const [saveErr,      setSaveErr]     = useState(null)
  const [activeSession,setActiveSession] = useState(null)
  const [activeQuiz,   setActiveQuiz]  = useState(null)
  const [analyticsQuiz,setAnalyticsQuiz]= useState(null)
  const [uploadingPdfQuizId, setUploadingPdfQuizId] = useState(null)
  const pdfInputRef = useRef(null)
  const targetPdfQuizId = useRef(null)

  const room = useRoom(activeSession?.room_code)

  const handleConfigDone = (questions, title, timePerQ, instructions, solutionPdf, solutionPdfName) => {
    setDraftQ(questions)
    setDraftMeta({ title, timePerQ, instructions, solutionPdf, solutionPdfName })
    setScreen('editor')
  }

  const handleSave = async (questions, solutionPdf, solutionPdfName) => {
    setSaving(true); setSaveErr(null)
    try {
      const payload = toApiFormat(
        {
          title: draftMeta.title,
          questions,
          instructions: draftMeta.instructions,
          solution_pdf: solutionPdf !== undefined ? solutionPdf : draftMeta.solutionPdf,
          solution_pdf_name: solutionPdfName !== undefined ? solutionPdfName : draftMeta.solutionPdfName
        },
        Math.round(draftMeta.timePerQ / 60)
      )
      const quiz = await createQuiz(payload)
      await publishQuiz(quiz.id)
      await reload()
      setScreen('dash'); setDraftQ(null); setDraftMeta(null)
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || 'Failed to save. Is the backend running?')
    } finally { setSaving(false) }
  }

  const triggerUploadPdf = (quizId) => {
    targetPdfQuizId.current = quizId
    if (pdfInputRef.current) {
      pdfInputRef.current.value = ''
      pdfInputRef.current.click()
    }
  }

  const onPdfFileSelected = async (e) => {
    const file = e.target.files?.[0]
    const quizId = targetPdfQuizId.current
    if (!file || !quizId) return
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      alert('Please select a valid PDF file.')
      return
    }
    try {
      setUploadingPdfQuizId(quizId)
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          await uploadSolutionPdf(quizId, reader.result, file.name)
          await reload()
        } catch (err) {
          alert(err?.response?.data?.detail || 'Failed to upload PDF')
        } finally {
          setUploadingPdfQuizId(null)
        }
      }
      reader.readAsDataURL(file)
    } catch {
      setUploadingPdfQuizId(null)
    }
  }

  const handleDeletePdf = async (quizId) => {
    if (!window.confirm('Are you sure you want to remove the solution PDF for this quiz?')) return
    try {
      setUploadingPdfQuizId(quizId)
      await deleteSolutionPdf(quizId)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete PDF')
    } finally {
      setUploadingPdfQuizId(null)
    }
  }

  const handleOpenRoom = async (quiz) => {
    try {
      const sess = await createSession(quiz.id)
      setActiveSession(sess)
      setActiveQuiz(quiz)
      setScreen('room')
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to create room')
    }
  }

  const handleLeaveRoom = async () => {
    if (activeSession) {
      try { await endSession(activeSession.id) } catch {}
    }
    setActiveSession(null); setActiveQuiz(null); setScreen('dash')
  }

  const handleAnalytics = (quiz) => {
    setAnalyticsQuiz(quiz); setScreen('analytics')
  }

  // ── Screens ──────────────────────────────────────────────────────────────────
  if (screen === 'config') return (
    <SectionConfig onDone={handleConfigDone} onBack={() => setScreen('dash')} />
  )
  if (screen === 'editor' && draftQ) return (
    <QuestionEditor
      initQuestions={draftQ}
      quizTitle={draftMeta.title}
      timePerQ={draftMeta.timePerQ}
      instructions={draftMeta.instructions}
      initSolutionPdf={draftMeta.solutionPdf}
      initSolutionPdfName={draftMeta.solutionPdfName}
      onSave={handleSave}
      onBack={() => setScreen('config')}
      saving={saving}
      saveError={saveErr}
    />
  )
  if (screen === 'room' && activeSession && activeQuiz) return (
    <LiveSessionMonitor
      session={activeSession}
      quiz={activeQuiz}
      onLeave={handleLeaveRoom}
      onViewAnalytics={handleAnalytics}
      connected={room.connected}
      participants={room.participants}
      leaderboard={room.leaderboard}
      quizStarted={room.quizStarted}
      quizEnded={room.quizEnded}
      recentSubmit={room.recentSubmit}
    />
  )
  if (screen === 'analytics' && analyticsQuiz) return (
    <AnalyticsDashboard
      quiz={analyticsQuiz}
      onBack={() => setScreen('dash')}
    />
  )

  // ── Dashboard ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:800, margin:'0 auto', padding:'2rem 1.5rem' }}>
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        style={{ display:'none' }}
        onChange={onPdfFileSelected}
      />

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:26 }}>
        <div>
          <h2 style={{ fontSize:23, fontWeight:800, margin:'0 0 4px' }}>Admin Dashboard</h2>
          <p style={{ fontSize:14, color:'#6b7280', margin:0 }}>
            {loading ? 'Loading…' : `${quizzes.length} quiz${quizzes.length!==1?'zes':''} total`}
          </p>
        </div>
        <div style={{ display:'flex', gap:9 }}>
          <button className="btn-sec" onClick={onLogout}>Sign out</button>
          <button className="btn-pri" onClick={() => setScreen('config')}>+ New Quiz</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom:16, padding:'12px 16px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10, fontSize:14, color:'#dc2626' }}>
          ⚠ {error} —{' '}
          <button onClick={reload} style={{ background:'none',border:'none',cursor:'pointer',color:'#dc2626',textDecoration:'underline',fontSize:14 }}>Retry</button>
        </div>
      )}

      {!loading && quizzes.length === 0 && !error && (
        <div style={{ textAlign:'center', padding:'4rem 2rem', background:'#fff', borderRadius:16, border:'1.5px dashed #e5e7eb' }}>
          <div style={{ fontSize:54, marginBottom:13 }}>📋</div>
          <p style={{ fontWeight:800, fontSize:16, margin:'0 0 5px' }}>No quizzes yet</p>
          <p style={{ color:'#9ca3af', fontSize:14, marginBottom:18 }}>Create your first quiz.</p>
          <button className="btn-pri" onClick={() => setScreen('config')}>Create quiz</button>
        </div>
      )}

      <div style={{ display:'grid', gap:11 }}>
        {quizzes.map(quiz => {
          const hasPdf = !!(quiz.solution_pdf || quiz.solution_pdf_name)
          const isBusy = uploadingPdfQuizId === quiz.id
          return (
            <div key={quiz.id} className="quiz-row" style={{ flexWrap:'wrap', gap:10 }}>
              <div style={{ width:10,height:10,borderRadius:'50%',background:quiz.status==='published'?'#34d399':'#fbbf24',flexShrink:0 }} />
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontWeight:700,fontSize:15,color:'#111827',marginBottom:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                  {quiz.title}
                </div>
                <div style={{ fontSize:12, color:'#9ca3af', display:'flex', gap:11, flexWrap:'wrap', alignItems:'center' }}>
                  <span>📝 {quiz.questions?.length ?? 0} Qs</span>
                  <span>⏱ {Math.round((quiz.time_per_q_sec||300)/60)}min/q</span>
                  <span>📅 {new Date(quiz.created_at).toLocaleDateString()}</span>
                  {hasPdf && (
                    <span style={{ color:'#059669', fontWeight:700, background:'#ecfdf5', padding:'1px 6px', borderRadius:5 }}>
                      📄 Solution PDF
                    </span>
                  )}
                </div>
              </div>
              <span className={`tag ${quiz.status==='published'?'tag-green':'tag-yellow'}`}>
                {quiz.status==='published'?'Published':'Draft'}
              </span>
              <div style={{ display:'flex', gap:7, flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>
                {quiz.status === 'published' && (
                  <button
                    className="btn-pri" style={{ fontSize:12,padding:'6px 13px' }}
                    onClick={() => handleOpenRoom(quiz)}>
                    🚀 Open Room
                  </button>
                )}
                {hasPdf ? (
                  <>
                    <button
                      className="btn-sec" style={{ fontSize:12,padding:'5px 9px', color:'#059669' }}
                      title="View solution PDF"
                      onClick={() => viewSolutionPdf(quiz.id)}>
                      📄 View PDF
                    </button>
                    <button
                      className="btn-sec" style={{ fontSize:12,padding:'5px 7px' }}
                      title="Replace solution PDF"
                      disabled={isBusy}
                      onClick={() => triggerUploadPdf(quiz.id)}>
                      🔄
                    </button>
                    <button
                      className="btn-sec" style={{ fontSize:12,padding:'5px 7px', color:'#dc2626' }}
                      title="Remove solution PDF"
                      disabled={isBusy}
                      onClick={() => handleDeletePdf(quiz.id)}>
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-sec" style={{ fontSize:12,padding:'5px 9px', color:'#6366f1' }}
                    title="Upload solution PDF"
                    disabled={isBusy}
                    onClick={() => triggerUploadPdf(quiz.id)}>
                    {isBusy ? 'Uploading…' : '+ PDF'}
                  </button>
                )}
                <button
                  className="btn-sec" style={{ fontSize:12,padding:'5px 11px' }}
                  onClick={() => handleAnalytics(quiz)}>
                  📊 Analytics
                </button>
                <button
                  className="btn-sec" style={{ fontSize:12,padding:'5px 11px' }}
                  onClick={() => togglePublish(quiz)}>
                  {quiz.status==='published'?'Unpublish':'Publish'}
                </button>
                <button className="btn-danger" onClick={() => remove(quiz.id)}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
