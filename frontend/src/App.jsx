import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import LoginScreen  from './pages/LoginScreen.jsx'
import AdminPage    from './pages/AdminPage.jsx'
import StudentPage  from './pages/StudentPage.jsx'
import { getUnreadNoticeCount } from './services/noticeService.js'

export default function App() {
  const { user, loading, logout } = useAuth()

  const [screen,    setScreen]    = useState('home')
  const [activeQuiz,    setActiveQuiz]     = useState(null)
  const [currentResult, setCurrentResult]  = useState(null)
  const [attempts,      setAttempts]       = useState([])
  const [viewingAttempt,setViewingAttempt] = useState(null)
  const [unreadNoticesCount, setUnreadNoticesCount] = useState(0)

  const fetchUnreadCount = useCallback(async () => {
    if (user?.role === 'student') {
      try {
        const count = await getUnreadNoticeCount()
        setUnreadNoticesCount(count || 0)
      } catch {
        // Silently ignore if not authorized or network issue
      }
    }
  }, [user])

  useEffect(() => {
    if (user?.role === 'student') {
      fetchUnreadCount()
      const timer = setInterval(fetchUnreadCount, 30000)
      return () => clearInterval(timer)
    } else {
      setUnreadNoticesCount(0)
    }
  }, [user, fetchUnreadCount])

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
            <span style={{ fontWeight:800,fontSize:15,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>QuiZee</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#6b7280' }}>
              <div style={{ width:26,height:26,borderRadius:'50%',background:user.role==='admin'?'#ede9fe':'#d1fae5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:user.role==='admin'?'#6366f1':'#059669' }}>
                {user.name?.[0]?.toUpperCase()}
              </div>
              <span style={{ fontWeight:600 }}>{user.name}</span>
              <span className={`tag ${user.role==='admin'?'tag-purple':'tag-green'}`} style={{ fontSize:10 }}>{user.role}</span>
            </div>

            {user.role === 'student' && (
              <button
                id="navbar-notice-bell"
                onClick={() => setScreen('notices')}
                style={{
                  position: 'relative',
                  background: screen === 'notices' ? '#ede9fe' : '#f3f4f6',
                  border: screen === 'notices' ? '1px solid #c7d2fe' : '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: '5px 9px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  transition: 'all 0.2s',
                  color: '#374151',
                  marginRight: 2
                }}
                title={unreadNoticesCount > 0 ? `${unreadNoticesCount} unread notices` : "Notice Board"}
              >
                🔔
                {unreadNoticesCount > 0 && (
                  <span
                    id="navbar-notice-badge"
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -6,
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 800,
                      borderRadius: 10,
                      minWidth: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      boxShadow: '0 2px 5px rgba(239,68,68,0.4)',
                      lineHeight: 1
                    }}
                  >
                    {unreadNoticesCount}
                  </span>
                )}
              </button>
            )}

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
          unreadCount={unreadNoticesCount}
          onMarkNoticesRead={() => {
            setUnreadNoticesCount(0)
            fetchUnreadCount()
          }}
          onTake={takequiz}
          onResult={handleResult}
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}
