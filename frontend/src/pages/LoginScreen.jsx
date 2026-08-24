import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginScreen() {
  const { login, register } = useAuth()

  const [mode,  setMode]  = useState(null)       // null | 'login' | 'register'
  const [role,  setRole]  = useState(null)       // 'admin' | 'student'
  const [form,  setForm]  = useState({ email:'', name:'', password:'' })
  const [err,   setErr]   = useState('')
  const [busy,  setBusy]  = useState(false)

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setErr(''); setBusy(true)
    try {
      if (mode === 'login') {
        await login({ email: form.email.trim(), password: form.password })
      } else {
        if (!form.name.trim()) { setErr('Name is required.'); setBusy(false); return }
        await register({ email: form.email.trim(), name: form.name.trim(), password: form.password, role })
      }
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── Role picker ──────────────────────────────────────────────────────────────
  if (!role) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem', background:'#f4f6fb' }}>
      <div style={{ textAlign:'center', marginBottom:'2.2rem' }}>
        <div style={{ width:76,height:76,borderRadius:22,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:34,margin:'0 auto 18px',boxShadow:'0 8px 32px rgba(99,102,241,.3)' }}>📝</div>
        <h1 style={{ fontSize:32,fontWeight:900,margin:'0 0 7px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>QuizForge</h1>
        <p style={{ color:'#6b7280', margin:0, fontSize:15 }}>Who are you?</p>
      </div>
      <div style={{ display:'grid', gap:14, width:'100%', maxWidth:420 }}>
        {[
          { icon:'🎓', title:"I'm a Student", desc:'Take quizzes published by your admin', r:'student', accent:'#6366f1' },
          { icon:'⚙️', title:"I'm an Admin",  desc:'Create, manage and publish quizzes',  r:'admin',   accent:'#8b5cf6' },
        ].map(({ icon,title,desc,r,accent }) => (
          <button key={r} onClick={() => { setRole(r); setMode('login') }}
            style={{ display:'flex',alignItems:'center',gap:16,padding:'19px 20px',borderRadius:15,border:'1.5px solid #e5e7eb',background:'#fff',cursor:'pointer',textAlign:'left',transition:'all .15s',width:'100%' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=accent; e.currentTarget.style.boxShadow=`0 4px 24px ${accent}22` }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.boxShadow='none' }}>
            <div style={{ width:52,height:52,borderRadius:13,background:`${accent}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0 }}>{icon}</div>
            <div>
              <div style={{ fontWeight:800,fontSize:15,marginBottom:3,color:'#111827' }}>{title}</div>
              <div style={{ fontSize:13,color:'#6b7280' }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  // ── Login / Register form ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', background:'#f4f6fb' }}>
      <div className="login-card">
        <button className="btn-ghost" onClick={() => { setRole(null); setMode(null); setErr('') }} style={{ marginBottom:18 }}>← Back</button>

        <div style={{ textAlign:'center', marginBottom:22 }}>
          <div style={{ fontSize:38,marginBottom:9 }}>{role==='admin'?'⚙️':'🎓'}</div>
          <h2 style={{ fontSize:21,fontWeight:800,margin:'0 0 5px' }}>
            {role==='admin'?'Admin':'Student'} {mode==='login'?'Login':'Register'}
          </h2>
        </div>

        {/* Tab switcher */}
        <div style={{ display:'flex', gap:0, marginBottom:20, border:'1.5px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
          {['login','register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setErr('') }}
              style={{ flex:1, padding:'9px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
                background: mode===m ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff',
                color: mode===m ? '#fff' : '#6b7280' }}>
              {m==='login'?'Sign in':'Create account'}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gap:13 }}>
          {mode === 'register' && (
            <div>
              <label className="lbl">Full name</label>
              <input className="inp" value={form.name} onChange={e=>up('name',e.target.value)} placeholder="e.g. Rahul Kumar" />
            </div>
          )}
          <div>
            <label className="lbl">Email</label>
            <input className="inp" type="email" value={form.email} onChange={e=>up('email',e.target.value)}
              placeholder="you@example.com" onKeyDown={e=>e.key==='Enter'&&handleSubmit()} />
          </div>
          <div>
            <label className="lbl">Password</label>
            <input className="inp" type="password" value={form.password} onChange={e=>up('password',e.target.value)}
              placeholder="Min 6 characters" onKeyDown={e=>e.key==='Enter'&&handleSubmit()} />
          </div>
        </div>

        {err && (
          <div style={{ marginTop:12, padding:'9px 12px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:13, color:'#dc2626', fontWeight:600 }}>
            {err}
          </div>
        )}

        <button className="btn-pri" style={{ width:'100%', padding:'12px', marginTop:16 }}
          onClick={handleSubmit} disabled={busy}>
          {busy ? '...' : mode==='login' ? 'Sign in →' : 'Create account →'}
        </button>

        {/* Demo credentials hint */}
        <div style={{ marginTop:16, padding:'10px 12px', background:'#f5f3ff', borderRadius:9, fontSize:12, color:'#6366f1', lineHeight:1.7 }}>
          <strong>Demo credentials:</strong><br/>
          Admin: admin@quizforge.com / Admin@123<br/>
          Student: student@quizforge.com / Student@123
        </div>
      </div>
    </div>
  )
}
