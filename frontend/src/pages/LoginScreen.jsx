import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { sendForgotOtp, verifyForgotOtp, resetPasswordWithOtp } from '../services/authService.js'

export default function LoginScreen() {
  const { login, register } = useAuth()

  const [role,  setRole]  = useState(null)       // null | 'admin' | 'student'
  const [mode,  setMode]  = useState('login')    // 'login' | 'register'
  const [form,  setForm]  = useState({ email: '', name: '', password: '' })
  const [err,   setErr]   = useState('')
  const [busy,  setBusy]  = useState(false)

  // ── Password recovery state ────────────────────────────────────────────────
  const [isRecovering,     setIsRecovering]     = useState(false)
  const [recoveryStep,     setRecoveryStep]     = useState(1) // 1: email, 2: otp, 3: reset, 4: success
  const [recoveryEmail,    setRecoveryEmail]    = useState('')
  const [recoveryOtp,      setRecoveryOtp]      = useState('')
  const [newPassword,      setNewPassword]      = useState('')
  const [confirmPassword,  setConfirmPassword]  = useState('')
  const [resetToken,       setResetToken]       = useState('')
  const [resendCooldown,   setResendCooldown]   = useState(0)
  const [recoveryMsg,      setRecoveryMsg]      = useState('')

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown(c => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Normal login / register submit
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

  // Start password recovery
  const handleStartRecovery = () => {
    setIsRecovering(true)
    setRecoveryStep(1)
    setRecoveryEmail(form.email.trim() || '')
    setRecoveryOtp('')
    setNewPassword('')
    setConfirmPassword('')
    setResetToken('')
    setErr('')
    setRecoveryMsg('')
  }

  // Cancel recovery and return to sign in
  const handleCancelRecovery = () => {
    setIsRecovering(false)
    setRecoveryStep(1)
    setErr('')
    setRecoveryMsg('')
  }

  // Step 1: Send OTP to email
  const handleSendOtp = async () => {
    setErr(''); setRecoveryMsg('')
    const email = recoveryEmail.trim()
    if (!email || !email.includes('@')) {
      setErr('Please enter a valid email address.')
      return
    }

    setBusy(true)
    try {
      const res = await sendForgotOtp({ email, role: role || 'student' })
      setRecoveryMsg(res.message || 'If an account exists with this email, a verification code has been sent.')
      setRecoveryStep(2)
      setResendCooldown(60)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Unable to send verification code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Step 2: Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || busy) return
    setErr(''); setRecoveryMsg('')
    setBusy(true)
    try {
      const res = await sendForgotOtp({ email: recoveryEmail.trim(), role: role || 'student' })
      setRecoveryMsg(res.message || 'A new verification code has been sent to your email.')
      setResendCooldown(60)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to resend code. Please try again later.')
    } finally {
      setBusy(false)
    }
  }

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    setErr(''); setRecoveryMsg('')
    const otp = recoveryOtp.trim()
    if (!otp || otp.length < 4) {
      setErr('Please enter the verification code sent to your email.')
      return
    }

    setBusy(true)
    try {
      const res = await verifyForgotOtp({ email: recoveryEmail.trim(), otp, role: role || 'student' })
      setResetToken(res.reset_token)
      setRecoveryStep(3)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Invalid or expired code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Step 3: Set new password
  const handleResetPassword = async () => {
    setErr(''); setRecoveryMsg('')
    if (!newPassword || newPassword.length < 6) {
      setErr('New password must be at least 6 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErr('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await resetPasswordWithOtp({
        email: recoveryEmail.trim(),
        reset_token: resetToken,
        new_password: newPassword,
        role: role || 'student'
      })
      setRecoveryStep(4)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to reset password. Please start recovery again.')
    } finally {
      setBusy(false)
    }
  }

  // ── Role picker ──────────────────────────────────────────────────────────────
  if (!role) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem', background:'#f4f6fb' }}>
      <div style={{ textAlign:'center', marginBottom:'2.2rem' }}>
        <div style={{ width:76,height:76,borderRadius:22,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:34,margin:'0 auto 18px',boxShadow:'0 8px 32px rgba(99,102,241,.3)' }}>📝</div>
        <h1 style={{ fontSize:32,fontWeight:900,margin:'0 0 7px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>QuiZee</h1>
        <p style={{ color:'#6b7280', margin:0, fontSize:15 }}>Who are you?</p>
      </div>
      <div style={{ display:'grid', gap:14, width:'100%', maxWidth:420 }}>
        {[
          { icon:'🎓', title:"I'm a Student", desc:'Take quizzes published by your admin', r:'student', accent:'#6366f1' },
          { icon:'⚙️', title:"I'm an Admin",  desc:'Create, manage and publish quizzes',  r:'admin',   accent:'#8b5cf6' },
        ].map(({ icon,title,desc,r,accent }) => (
          <button key={r} onClick={() => { setRole(r); setMode('login'); setIsRecovering(false); setErr('') }}
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

  // ── Password Recovery Flow View ────────────────────────────────────────────
  if (isRecovering) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', background:'#f4f6fb' }}>
        <div className="login-card" style={{ maxWidth: 440, width: '100%' }}>
          <button className="btn-ghost" onClick={handleCancelRecovery} style={{ marginBottom: 18 }}>
            ← Back to Sign In
          </button>

          {/* Step 1: Enter email */}
          {recoveryStep === 1 && (
            <div>
              <div style={{ textAlign:'center', marginBottom: 20 }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, background: '#ede9fe', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 26, margin:'0 auto 12px' }}>
                  🔑
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#111827' }}>
                  Forgot Password?
                </h2>
                <p style={{ color: '#6b7280', fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>
                  Enter the email address associated with your {role === 'admin' ? 'Admin' : 'QuiZee'} account.
                </p>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label className="lbl">Email Address</label>
                  <input
                    className="inp"
                    type="email"
                    value={recoveryEmail}
                    onChange={e => setRecoveryEmail(e.target.value)}
                    placeholder="you@example.com"
                    onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                    autoFocus
                  />
                </div>

                {err && (
                  <div style={{ padding:'9px 12px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:13, color:'#dc2626', fontWeight:600 }}>
                    {err}
                  </div>
                )}

                <button
                  className="btn-pri"
                  style={{ width: '100%', padding: '12px', marginTop: 4 }}
                  onClick={handleSendOtp}
                  disabled={busy}
                >
                  {busy ? 'Sending OTP...' : 'Send OTP →'}
                </button>

                <button
                  type="button"
                  onClick={handleCancelRecovery}
                  style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: '6px', fontWeight: 600 }}
                >
                  Cancel & Return to Sign In
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Verify OTP */}
          {recoveryStep === 2 && (
            <div>
              <div style={{ textAlign:'center', marginBottom: 20 }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, background: '#ede9fe', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 26, margin:'0 auto 12px' }}>
                  ✉️
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#111827' }}>
                  Verify Your Email
                </h2>
                <p style={{ color: '#6b7280', fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>
                  We have sent a verification code to <strong style={{ color: '#111827' }}>{recoveryEmail}</strong>.
                </p>
              </div>

              {recoveryMsg && (
                <div style={{ marginBottom: 14, padding:'9px 12px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, fontSize:13, color:'#166534', fontWeight:600 }}>
                  {recoveryMsg}
                </div>
              )}

              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label className="lbl">Enter 6-Digit OTP</label>
                  <input
                    className="inp"
                    type="text"
                    maxLength={6}
                    value={recoveryOtp}
                    onChange={e => setRecoveryOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • • • •"
                    style={{ letterSpacing: '0.4em', textAlign: 'center', fontSize: 20, fontWeight: 700 }}
                    onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                    autoFocus
                  />
                </div>

                {err && (
                  <div style={{ padding:'9px 12px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:13, color:'#dc2626', fontWeight:600 }}>
                    {err}
                  </div>
                )}

                <button
                  className="btn-pri"
                  style={{ width: '100%', padding: '12px', marginTop: 4 }}
                  onClick={handleVerifyOtp}
                  disabled={busy}
                >
                  {busy ? 'Verifying OTP...' : 'Verify OTP →'}
                </button>

                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  {resendCooldown > 0 ? (
                    <span style={{ fontSize: 13, color: '#9ca3af' }}>
                      Resend OTP in <strong>{resendCooldown}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={busy}
                      style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 13, cursor: 'pointer', fontWeight: 700, padding: 0 }}
                    >
                      Resend OTP
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Reset password */}
          {recoveryStep === 3 && (
            <div>
              <div style={{ textAlign:'center', marginBottom: 20 }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, background: '#ede9fe', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 26, margin:'0 auto 12px' }}>
                  🔒
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#111827' }}>
                  Reset Password
                </h2>
                <p style={{ color: '#6b7280', fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>
                  Choose a new strong password for your account.
                </p>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label className="lbl">New Password</label>
                  <input
                    className="inp"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="lbl">Confirm New Password</label>
                  <input
                    className="inp"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                  />
                </div>

                {err && (
                  <div style={{ padding:'9px 12px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:13, color:'#dc2626', fontWeight:600 }}>
                    {err}
                  </div>
                )}

                <button
                  className="btn-pri"
                  style={{ width: '100%', padding: '12px', marginTop: 4 }}
                  onClick={handleResetPassword}
                  disabled={busy}
                >
                  {busy ? 'Updating Password...' : 'Change Password →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Password Changed Successfully */}
          {recoveryStep === 4 && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>
                ✓
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: '#111827' }}>
                Password Changed Successfully!
              </h2>
              <p style={{ color: '#4b5563', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
                Your password has been securely updated. You can now sign in using your new credentials.
              </p>

              <button
                className="btn-pri"
                style={{ width: '100%', padding: '12px' }}
                onClick={() => {
                  setIsRecovering(false)
                  setMode('login')
                  setForm(f => ({ ...f, email: recoveryEmail, password: '' }))
                  setErr('')
                }}
              >
                Go to Sign In →
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Login / Register form ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', background:'#f4f6fb' }}>
      <div className="login-card">
        <button className="btn-ghost" onClick={() => { setRole(null); setMode('login'); setErr('') }} style={{ marginBottom:18 }}>← Back</button>

        <div style={{ textAlign:'center', marginBottom:22 }}>
          <div style={{ fontSize:38,marginBottom:9 }}>{role==='admin'?'⚙️':'🎓'}</div>
          <h2 style={{ fontSize:21,fontWeight:800,margin:'0 0 5px' }}>
            {role==='admin' ? 'Admin Login' : (mode==='login' ? 'Student Login' : 'Student Register')}
          </h2>
        </div>

        {/* Tab switcher: ONLY displayed for student. Admin registration is removed from UI. */}
        {role === 'student' && (
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
        )}

        <div style={{ display:'grid', gap:13 }}>
          {role === 'student' && mode === 'register' && (
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
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
              <label className="lbl" style={{ margin:0 }}>Password</label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleStartRecovery}
                  style={{ background:'none', border:'none', color:'#6366f1', fontSize:12, fontWeight:700, cursor:'pointer', padding:0 }}
                >
                  Forgot Password?
                </button>
              )}
            </div>
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
          {busy ? '...' : (role === 'admin' || mode === 'login') ? 'Sign in →' : 'Create account →'}
        </button>

        {/* Demo credentials hint */}
        <div style={{ marginTop:16, padding:'10px 12px', background:'#f5f3ff', borderRadius:9, fontSize:12, color:'#6366f1', lineHeight:1.7 }}>
          <strong>Demo credentials:</strong><br/>
          Admin: admin@quizee.com / Admin@123<br/>
          Student: student@quizee.com / Student@123
        </div>
      </div>
    </div>
  )
}
