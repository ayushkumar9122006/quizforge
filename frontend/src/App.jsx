import { useState, useCallback } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import LoginScreen  from './pages/LoginScreen.jsx'
import AdminPage    from './pages/AdminPage.jsx'
import StudentPage  from './pages/StudentPage.jsx'

export default function App() {
  const { user, loading, logout } = useAuth()

  const [screen,    setScreen]    = useState('home')
  const [activeQuiz,    setActiveQuiz]     = useState(null)
  const [currentResult, setCurrentResult]  = useState(null)
  const [attempts,      setAttempts]       = useState([])
  const [viewingAttempt,setViewingAttempt] = useState(null)

  const handleLogout = useCallback(async () => {
    await logout()
    setScreen('home')
    setActiveQuiz(null)
    setCurrentResult(null)
    setAttempts([])
  }, [logout])

  const takequiz = useCallback(quiz => {
    setActiveQuiz(quiz)
    setScreen('quiz')
  }, [])

  const handleResult = useCallback((result) => {
    setCurrentResult(result)
    setScreen('results')
  }, [])

  // While restoring session from localStorage
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f4f6fb' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48,height:48,borderRadius:14,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,margin:'0 auto 14px' }}>📝</div>
        <p style={{ color:'#9ca3af', fontSize:14, margin:0 }}>Loading…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#f4f6fb' }}>

      {/* Global nav — only when logged in */}
      {user && (
        <nav style={{ background:'#fff', borderBottom:'1px solid #f3f4f6', padding:'0 22px', display:'flex', alignItems:'center', justifyContent:'space-between', height:52, position:'sticky', top:0, zIndex:100 }}>
          <div onClick={() => setScreen('home')} style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer' }}>
            <div style={{ width:29,height:29,borderRadius:8,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14 }}>📝</div>
            <span style={{ fontWeight:800,fontSize:15,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>QuizForge</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#6b7280' }}>
              <div style={{ width:26,height:26,borderRadius:'50%',background:user.role==='admin'?'#ede9fe':'#d1fae5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:user.role==='admin'?'#6366f1':'#059669' }}>
                {user.name?.[0]?.toUpperCase()}
              </div>
              <span style={{ fontWeight:600 }}>{user.name}</span>
              <span className={`tag ${user.role==='admin'?'tag-purple':'tag-green'}`} style={{ fontSize:10 }}>{user.role}</span>
            </div>
            {screen !== 'home' && screen !== 'quiz' && (
              <button className="btn-sec" style={{ fontSize:12,padding:'5px 11px' }} onClick={() => setScreen('home')}>Home</button>
            )}
            <button className="btn-ghost" style={{ fontSize:12 }} onClick={handleLogout}>Sign out</button>
          </div>
        </nav>
      )}

      {/* Screens */}
      {!user && <LoginScreen />}

      {user?.role === 'admin' && (
        <AdminPage onLogout={handleLogout} />
      )}

      {user?.role === 'student' && (
        <StudentPage
          user={user}
          screen={screen}
          setScreen={setScreen}
          activeQuiz={activeQuiz}
          currentResult={currentResult}
          attempts={attempts}
          setAttempts={setAttempts}
          viewingAttempt={viewingAttempt}
          setViewingAttempt={setViewingAttempt}
          onTake={takequiz}
          onResult={handleResult}
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}
