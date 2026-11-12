import { useEffect, useState } from 'react'
import { getMyProgress, getStudentProgress } from '../../services/progressService.js'
import ProgressDashboard from './ProgressDashboard.jsx'
import { Loading, ErrorBox } from './ui.jsx'

/** Loads progress (own, or a given student's for admins) and renders the dashboard. */
export default function MyProgress({ studentId = null, onBack, title }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    setError(null)
    setData(null)
    try {
      setData(studentId ? await getStudentProgress(studentId) : await getMyProgress())
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load progress.')
    }
  }
  useEffect(() => { load() }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1.5rem' }}><button className="btn-ghost" onClick={onBack}>← Back</button><div style={{ marginTop: 12 }}><ErrorBox text={error} onRetry={load} /></div></div>
  if (!data) return <Loading text="Analysing all tests…" />
  return (
    <ProgressDashboard
      data={data}
      onBack={onBack}
      adminView={Boolean(studentId)}
      title={title || (studentId ? `${data.student?.name || 'Student'}: Progress` : 'My Progress')}
    />
  )
}
