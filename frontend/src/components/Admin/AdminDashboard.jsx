import { useState, useRef } from 'react'
import { useQuizzes } from '../../hooks/useQuizzes.js'
import {
  createQuiz, publishQuiz, toApiFormat, uploadSolutionPdf,
  deleteSolutionPdf, viewSolutionPdf, confirmBulkImport, updateQuizAvailability
} from '../../services/quizService.js'
import { createSession, endSession } from '../../services/sessionService.js'
import SectionConfig from './SectionConfig.jsx'
import QuestionEditor from './QuestionEditor.jsx'
import LiveSessionMonitor from './LiveSessionMonitor.jsx'
import { useRoom } from '../../hooks/useRoom.js'
import AnalyticsDashboard from './Analytics/AnalyticsDashboard.jsx'
import PdfUploadModal from './BulkImport/PdfUploadModal.jsx'
import QuestionReviewScreen from './BulkImport/QuestionReviewScreen.jsx'
import AdminNoticeManager from './AdminNoticeManager.jsx'

function formatIST(dateStr) {
  if (!dateStr) return 'Open / No deadline'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' IST'
  } catch {
    return dateStr
  }
}

function toLocalInput(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const pad = n => String(n).padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  } catch {
    return ''
  }
}

function parseToISTIso(val) {
  if (!val) return null
  try {
    return new Date(`${val}:00+05:30`).toISOString()
  } catch {
    return null
  }
}

export default function AdminDashboard({ onLogout }) {
  const { quizzes, loading, error, reload, remove, togglePublish } = useQuizzes()
  const [screen, setScreen] = useState('dash')
  const [draftQ, setDraftQ] = useState(null)
  const [draftMeta, setDraftMeta] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [activeQuiz, setActiveQuiz] = useState(null)
  const [analyticsQuiz, setAnalyticsQuiz] = useState(null)
  const [uploadingPdfQuizId, setUploadingPdfQuizId] = useState(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkTargetQuizId, setBulkTargetQuizId] = useState(null)
  const [bulkAnalysisData, setBulkAnalysisData] = useState(null)
  const [bulkImporting, setBulkImporting] = useState(false)

  // Edit Availability Modal state (Feature 2 B)
  const [editingAvailQuiz, setEditingAvailQuiz] = useState(null)
  const [availStartInput, setAvailStartInput] = useState('')
  const [availEndInput, setAvailEndInput] = useState('')
  const [savingAvail, setSavingAvail] = useState(false)
  const [availErr, setAvailErr] = useState(null)

  const pdfInputRef = useRef(null)
  const targetPdfQuizId = useRef(null)

  const room = useRoom(activeSession?.room_code)

  const handleConfigDone = (questions, title, totalDurationMin, instructions, solutionPdf, solutionPdfName, availabilityStart, availabilityEnd) => {
    setDraftQ(questions)
    setDraftMeta({ title, totalDurationMin, instructions, solutionPdf, solutionPdfName, availabilityStart, availabilityEnd })
    setScreen('editor')
  }

  const handleSave = async (questions, solutionPdf, solutionPdfName) => {
    setSaving(true)
    setSaveErr(null)
    try {
      const payload = toApiFormat(
        {
          title: draftMeta.title,
          questions,
          instructions: draftMeta.instructions,
          solution_pdf: solutionPdf !== undefined ? solutionPdf : draftMeta.solutionPdf,
          solution_pdf_name: solutionPdfName !== undefined ? solutionPdfName : draftMeta.solutionPdfName,
          availability_start: draftMeta.availabilityStart,
          availability_end: draftMeta.availabilityEnd,
          total_duration_minutes: draftMeta.totalDurationMin,
        },
        draftMeta.totalDurationMin
      )
      const quiz = await createQuiz(payload)
      await publishQuiz(quiz.id)
      await reload()
      setScreen('dash')
      setDraftQ(null)
      setDraftMeta(null)
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || 'Failed to save quiz.')
    } finally {
      setSaving(false)
    }
  }

  // Solution PDF Management (Feature 4 B)
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
    if (file.size > 25 * 1024 * 1024) {
      alert('PDF file size must be under 25MB.')
      return
    }

    try {
      setUploadingPdfQuizId(quizId)
      await uploadSolutionPdf(quizId, file)
      await reload()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to upload PDF')
    } finally {
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

  // Edit Availability Window (Feature 2 B)
  const handleOpenEditAvail = (quiz) => {
    setEditingAvailQuiz(quiz)
    setAvailStartInput(toLocalInput(quiz.availability_start))
    setAvailEndInput(toLocalInput(quiz.availability_end))
    setAvailErr(null)
  }

  const handleSaveAvailability = async () => {
    if (!editingAvailQuiz) return
    setSavingAvail(true)
    setAvailErr(null)

    const startIso = parseToISTIso(availStartInput)
    const endIso = parseToISTIso(availEndInput)

    if (startIso && endIso && new Date(startIso) >= new Date(endIso)) {
      setAvailErr('End time must be after start time.')
      setSavingAvail(false)
      return
    }

    try {
      await updateQuizAvailability(editingAvailQuiz.id, startIso, endIso)
      await reload()
      setEditingAvailQuiz(null)
    } catch (err) {
      setAvailErr(err?.response?.data?.detail || 'Failed to update availability window.')
    } finally {
      setSavingAvail(false)
    }
  }

  const handleLeaveRoom = async () => {
    if (activeSession) {
      try { await endSession(activeSession.id) } catch {}
    }
    setActiveSession(null)
    setActiveQuiz(null)
    setScreen('dash')
  }

  const handleAnalytics = (quiz) => {
    setAnalyticsQuiz(quiz)
    setScreen('analytics')
  }

  const handleBulkAnalysisComplete = (data) => {
    setBulkAnalysisData(data)
    setShowBulkModal(false)
    setScreen('bulk_review')
  }

  const handleConfirmBulkImport = async (approvedQuestions, extraConfig = {}) => {
    setBulkImporting(true)
    try {
      let targetQuiz = null
      if (bulkTargetQuizId) {
        targetQuiz = await confirmBulkImport(bulkTargetQuizId, approvedQuestions)
      } else {
        const totDurationMin = extraConfig?.total_duration_minutes ?? extraConfig?.totalDurationMin ?? bulkAnalysisData?.totalDurationMinutes ?? null
        const timePerQMin = extraConfig?.timePerQMin || (extraConfig?.timePerQ ? (extraConfig.timePerQ > 30 ? Math.round(extraConfig.timePerQ / 60) : extraConfig.timePerQ) : (bulkAnalysisData?.timePerQMin || 5))
        const payload = toApiFormat({
          title: extraConfig?.title || bulkAnalysisData?.title || bulkAnalysisData?.metadata?.title || 'Imported Quiz',
          questions: approvedQuestions,
          instructions: extraConfig?.instructions !== undefined
            ? extraConfig.instructions
            : (bulkAnalysisData?.customInstructions || '• Read each question carefully before choosing an answer.\n• Marking scheme and question types are set based on the examination paper.\n• Clear Response button is available to deselect any answer.\n• Test will auto-submit when the overall timer expires.'),
          solution_pdf: extraConfig?.solution_pdf || bulkAnalysisData?.solutionPdf || null,
          solution_pdf_name: extraConfig?.solution_pdf_name || bulkAnalysisData?.solutionPdfName || null,
          availability_start: extraConfig?.availability_start !== undefined
            ? extraConfig.availability_start
            : (bulkAnalysisData?.availabilityStart || null),
          availability_end: extraConfig?.availability_end !== undefined
            ? extraConfig.availability_end
            : (bulkAnalysisData?.availabilityEnd || null),
          total_duration_minutes: totDurationMin,
        }, totDurationMin, timePerQMin)
        const newQuiz = await createQuiz(payload)
        await publishQuiz(newQuiz.id)
        targetQuiz = newQuiz
      }

      await reload()
      setScreen('dash')
      setBulkAnalysisData(null)
      setBulkTargetQuizId(null)
      alert(`Successfully saved ${approvedQuestions.length} questions to ${targetQuiz?.title || 'quiz'}!`)
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to save imported questions.')
    } finally {
      setBulkImporting(false)
    }
  }

  // ── Screens ──────────────────────────────────────────────────────────────────
  if (screen === 'config') return (
    <SectionConfig
      onDone={handleConfigDone}
      onBack={() => setScreen('dash')}
      onBulkImportClick={() => { setBulkTargetQuizId(null); setShowBulkModal(true) }}
    />
  )

  if (screen === 'editor' && draftQ && draftMeta) return (
    <QuestionEditor
      initQuestions={draftQ}
      questions={draftQ}
      meta={draftMeta}
      quizTitle={draftMeta.title}
      timePerQ={draftMeta.timePerQ}
      instructions={draftMeta.instructions}
      initSolutionPdf={draftMeta.solutionPdf}
      initSolutionPdfName={draftMeta.solutionPdfName}
      saving={saving}
      saveError={saveErr}
      saveErr={saveErr}
      onSave={handleSave}
      onBack={() => setScreen('config')}
      onBulkImportClick={() => { setBulkTargetQuizId(null); setShowBulkModal(true) }}
      onImportClick={() => { setBulkTargetQuizId(null); setShowBulkModal(true) }}
    />
  )

  if (screen === 'bulk_review' && bulkAnalysisData) return (
    <QuestionReviewScreen
      analysisData={bulkAnalysisData}
      extractedQuestions={bulkAnalysisData.questions || []}
      metadata={{
        filename: bulkAnalysisData.filename || 'Uploaded PDF',
        total_questions: bulkAnalysisData.total_questions || (bulkAnalysisData.questions?.length || 0),
        title: bulkAnalysisData.filename ? bulkAnalysisData.filename.replace(/\.pdf$/i, '').replace(/_/g, ' ') : 'Imported Quiz'
      }}
      onConfirmImport={handleConfirmBulkImport}
      onConfirm={handleConfirmBulkImport}
      onCancel={() => { setScreen('dash'); setBulkAnalysisData(null); setBulkTargetQuizId(null) }}
      importing={bulkImporting}
      isSubmitting={bulkImporting}
    />
  )

  if (screen === 'room' && activeSession && activeQuiz) return (
    <LiveSessionMonitor
      session={activeSession}
      quiz={activeQuiz}
      onLeave={handleLeaveRoom}
      connected={room.connected}
      participants={room.participants}
      count={room.count}
      quizStarted={room.quizStarted}
      recentSubmit={room.recentSubmit}
      leaderboard={room.leaderboard}
    />
  )

  if (screen === 'analytics' && analyticsQuiz) return (
    <AnalyticsDashboard
      quiz={analyticsQuiz}
      onBack={() => setScreen('dash')}
    />
  )

  if (screen === 'notices') return (
    <AdminNoticeManager onBack={() => setScreen('dash')} />
  )

  // ── Dashboard ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <PdfUploadModal
        open={showBulkModal}
        onClose={() => { setShowBulkModal(false); setBulkTargetQuizId(null) }}
        onAnalysisComplete={handleBulkAnalysisComplete}
        quizId={bulkTargetQuizId}
      />

      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={onPdfFileSelected}
      />

      {/* Edit Availability Modal (Feature 2 B) */}
      {editingAvailQuiz && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 10, 25, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '2rem', maxWidth: 460, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 24 }}>🕒</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111827' }}>Edit Test Availability</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6366f1', fontWeight: 700 }}>{editingAvailQuiz.title}</p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Set when students can begin and complete this test. Times are interpreted in <strong>Asia/Kolkata (IST)</strong>.
            </p>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="lbl" style={{ fontSize: 12 }}>Availability Start Time (IST)</label>
                <input
                  type="datetime-local"
                  className="inp"
                  value={availStartInput}
                  onChange={e => setAvailStartInput(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div>
                <label className="lbl" style={{ fontSize: 12 }}>Availability End Time (IST)</label>
                <input
                  type="datetime-local"
                  className="inp"
                  value={availEndInput}
                  onChange={e => setAvailEndInput(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-sec"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => {
                    const n = new Date()
                    const t = new Date(n.getTime() + 48 * 3600 * 1000)
                    setAvailStartInput(toLocalInput(n))
                    setAvailEndInput(toLocalInput(t))
                  }}
                >
                  Quick: Now + 48h
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => {
                    setAvailStartInput('')
                    setAvailEndInput('')
                  }}
                >
                  Clear Window (Open)
                </button>
              </div>
            </div>

            {availErr && (
              <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626', marginBottom: 14 }}>
                ⚠ {availErr}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn-sec"
                style={{ flex: 1 }}
                onClick={() => setEditingAvailQuiz(null)}
                disabled={savingAvail}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-pri"
                style={{ flex: 1.5, fontWeight: 800 }}
                onClick={handleSaveAvailability}
                disabled={savingAvail}
              >
                {savingAvail ? 'Saving…' : 'Save Availability'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px', color: '#111827' }}>Admin Dashboard</h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            {loading ? 'Loading…' : `${quizzes.length} quiz${quizzes.length !== 1 ? 'zes' : ''} total`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button className="btn-sec" onClick={onLogout}>Sign out</button>
          <button
            className="btn-sec"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setScreen('notices')}
          >
            📢 Notice Board
          </button>
          <button
            className="btn-pri"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setBulkTargetQuizId(null); setShowBulkModal(true) }}
          >
            ⚡ Bulk Import PDF
          </button>
          <button className="btn-pri" onClick={() => setScreen('config')}>+ New Quiz</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: 14, color: '#dc2626' }}>
          ⚠ {error} — <button onClick={reload} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', textDecoration: 'underline', fontSize: 14, fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {!loading && quizzes.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: 20, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: 54, marginBottom: 14 }}>📋</div>
          <p style={{ fontWeight: 800, fontSize: 18, margin: '0 0 6px', color: '#111827' }}>No quizzes yet</p>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>Create a quiz manually or auto-extract questions in bulk from a PDF.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button
              className="btn-pri"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              onClick={() => { setBulkTargetQuizId(null); setShowBulkModal(true) }}
            >
              ⚡ Bulk Import from PDF
            </button>
            <button className="btn-sec" onClick={() => setScreen('config')}>Manual Setup</button>
          </div>
        </div>
      )}

      {/* Quizzes List */}
      <div style={{ display: 'grid', gap: 14 }}>
        {quizzes.map(quiz => {
          const hasPdf = Boolean(quiz.solution_pdf || quiz.solution_pdf_name)
          const isBusy = uploadingPdfQuizId === quiz.id
          const hasWindow = Boolean(quiz.availability_start || quiz.availability_end)

          return (
            <div key={quiz.id} className="quiz-row" style={{ flexWrap: 'wrap', gap: 12, padding: '1.2rem 1.4rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: quiz.status === 'published' ? '#34d399' : '#fbbf24', flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', marginBottom: 4 }}>
                  {quiz.title}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                  <span>📝 {quiz.questions?.length ?? 0} Qs</span>
                  <span>⏱ {quiz.total_duration_minutes != null ? `${Number(quiz.total_duration_minutes).toFixed(2)} min (${Number(quiz.time_per_question_min ?? (quiz.total_duration_minutes / (quiz.questions?.length || 1))).toFixed(2)} min/q)` : `${Math.round((quiz.time_per_q_sec || 300) / 60)} min/q`}</span>
                  <span>📅 Created {new Date(quiz.created_at).toLocaleDateString()}</span>
                  {hasPdf && (
                    <span style={{ color: '#059669', fontWeight: 800, background: '#ecfdf5', padding: '1px 8px', borderRadius: 6, border: '1px solid #a7f3d0' }}>
                      📄 Solution PDF
                    </span>
                  )}
                </div>

                {/* Availability Display */}
                <div style={{ fontSize: 12, color: '#4338ca', background: '#eef2ff', padding: '3px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>🕒</span>
                  {hasWindow ? (
                    <span>
                      <strong>Window:</strong> {formatIST(quiz.availability_start)} → {formatIST(quiz.availability_end)}
                    </span>
                  ) : (
                    <span><strong>Window:</strong> Open (No deadline)</span>
                  )}
                </div>
              </div>

              <span className={`tag ${quiz.status === 'published' ? 'tag-green' : 'tag-yellow'}`} style={{ fontWeight: 800 }}>
                {quiz.status === 'published' ? 'Published' : 'Draft'}
              </span>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 7, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Feature 2: Edit Availability */}
                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '6px 12px', color: '#4338ca', borderColor: '#c7d2fe', background: '#f5f3ff', fontWeight: 800 }}
                  onClick={() => handleOpenEditAvail(quiz)}
                >
                  🕒 Edit Availability
                </button>

                {/* Feature 4: Manage Solution PDF */}
                {hasPdf ? (
                  <>
                    <button
                      className="btn-sec"
                      style={{ fontSize: 12, padding: '6px 10px', color: '#059669', fontWeight: 800 }}
                      title="View solution PDF"
                      onClick={() => viewSolutionPdf(quiz.id)}
                    >
                      📄 View PDF
                    </button>
                    <button
                      className="btn-sec"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                      title="Replace solution PDF"
                      disabled={isBusy}
                      onClick={() => triggerUploadPdf(quiz.id)}
                    >
                      🔄
                    </button>
                    <button
                      className="btn-sec"
                      style={{ fontSize: 12, padding: '6px 8px', color: '#dc2626' }}
                      title="Remove solution PDF"
                      disabled={isBusy}
                      onClick={() => handleDeletePdf(quiz.id)}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-sec"
                    style={{ fontSize: 12, padding: '6px 11px', color: '#4f46e5', fontWeight: 700 }}
                    title="Upload solution PDF"
                    disabled={isBusy}
                    onClick={() => triggerUploadPdf(quiz.id)}
                  >
                    {isBusy ? 'Uploading…' : '+ Solution PDF'}
                  </button>
                )}

                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '6px 10px', color: '#6366f1' }}
                  title="Import more questions from PDF into this quiz"
                  onClick={() => { setBulkTargetQuizId(quiz.id); setShowBulkModal(true) }}
                >
                  ⚡ +PDF Qs
                </button>
                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '6px 11px' }}
                  onClick={() => handleAnalytics(quiz)}
                >
                  📊 Analytics
                </button>
                <button
                  className="btn-sec"
                  style={{ fontSize: 12, padding: '6px 11px' }}
                  onClick={() => togglePublish(quiz)}
                >
                  {quiz.status === 'published' ? 'Unpublish' : 'Publish'}
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
