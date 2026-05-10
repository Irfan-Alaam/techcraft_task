import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { payload, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <span className="navbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        Tech<span>Kraft</span>
      </span>
      <div className="navbar-right">
        <span className="navbar-role">{payload?.role}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{payload?.email}</span>
        <button className="btn-ghost" onClick={handleLogout} style={{ padding: '0.35rem 0.8rem' }}>
          logout
        </button>
      </div>
    </nav>
  )
}