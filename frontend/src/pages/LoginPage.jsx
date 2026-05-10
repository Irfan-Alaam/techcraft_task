import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [regSuccess, setRegSuccess] = useState(false)
  const { refreshAuth } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setRegSuccess(false)
    try {
      if (mode === 'register') {
        await register(email, password)
        setRegSuccess(true)
        setMode('login')
      } else {
        await login(email, password)
        refreshAuth()
        navigate('/')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(245,166,35,0.04) 0%, transparent 60%)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '1rem' }} className="fade-in">
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Tech<span style={{ color: 'var(--amber)' }}>Kraft</span>
          </h1>
          <p style={{ color: 'var(--text-mute)', fontSize: '0.8rem', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Candidate Dashboard
          </p>
        </div>

        <div className="card">
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null); setRegSuccess(false) }}
                style={{
                  flex: 1, background: 'none', borderRadius: 0, padding: '0.6rem',
                  color: mode === m ? 'var(--amber)' : 'var(--text-mute)',
                  borderBottom: mode === m ? '2px solid var(--amber)' : '2px solid transparent',
                  fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em',
                  transition: 'color 0.15s',
                }}>
                {m}
              </button>
            ))}
          </div>

          {error && <div className="banner banner-error" style={{ marginBottom: '1rem' }}>{error}</div>}
          {regSuccess && (
            <div className="banner" style={{ background: 'rgba(76,175,130,0.1)', border: '1px solid var(--green)', color: 'var(--green)', marginBottom: '1rem' }}>
              Account created — please log in.
            </div>
          )}
          {mode === 'register' && (
            <div className="banner banner-info" style={{ marginBottom: '1rem', fontSize: '0.78rem' }}>
              New accounts are registered as <strong>reviewer</strong>. Contact an admin for elevated access.
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="min. 6 characters" />
            </div>
            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.5rem', padding: '0.65rem', fontSize: '0.9rem' }}>
              {loading ? <span className="spinner" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}