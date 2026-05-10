import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCandidates } from '../api'
import StatusBadge from '../components/StatusBadge'

const STATUSES = ['', 'new', 'reviewed', 'hired', 'rejected', 'archived']
const PAGE_SIZE = 20

export default function CandidateListPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ status: '', role_applied: '', skill: '', keyword: '' })
  const [pending, setPending] = useState({ ...filters }) // controls before apply
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listCandidates({ ...filters, page, page_size: PAGE_SIZE })
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { fetchData() }, [fetchData])

  function applyFilters(e) {
    e.preventDefault()
    setFilters({ ...pending })
    setPage(1)
  }

  function clearFilters() {
    const empty = { status: '', role_applied: '', skill: '', keyword: '' }
    setPending(empty)
    setFilters(empty)
    setPage(1)
  }

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="page fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Candidates
          </h2>
          {data && (
            <p style={{ color: 'var(--text-mute)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
              {data.total} total{hasFilters ? ' (filtered)' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={applyFilters} className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={pending.status} onChange={e => setPending(p => ({ ...p, status: e.target.value }))}>
              {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <input value={pending.role_applied} onChange={e => setPending(p => ({ ...p, role_applied: e.target.value }))} placeholder="e.g. Backend Engineer" />
          </div>
          <div>
            <label style={labelStyle}>Skill</label>
            <input value={pending.skill} onChange={e => setPending(p => ({ ...p, skill: e.target.value }))} placeholder="e.g. Python" />
          </div>
          <div>
            <label style={labelStyle}>Keyword</label>
            <input value={pending.keyword} onChange={e => setPending(p => ({ ...p, keyword: e.target.value }))} placeholder="name or email" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Filter</button>
            {hasFilters && <button type="button" className="btn-ghost" onClick={clearFilters}>✕</button>}
          </div>
        </div>
      </form>

      {/* Error */}
      {error && <div className="banner banner-error">{error}</div>}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : data?.items?.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-mute)' }}>
            No candidates match the current filters.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Email', 'Role Applied', 'Skills', 'Status', 'Created'].map(h => (
                  <th key={h} style={{ ...thStyle }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items?.map(c => (
                <tr key={c.id} onClick={() => navigate(`/candidates/${c.id}`)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>{c.name}</span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{c.email}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{c.role_applied}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {c.skills.slice(0, 3).map(s => (
                        <span key={s} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.1rem 0.45rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>{s}</span>
                      ))}
                      {c.skills.length > 3 && <span style={{ color: 'var(--text-mute)', fontSize: '0.72rem' }}>+{c.skills.length - 3}</span>}
                    </div>
                  </td>
                  <td style={tdStyle}><StatusBadge status={c.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--text-mute)', whiteSpace: 'nowrap' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <span style={{ color: 'var(--text-mute)', fontSize: '0.8rem' }}>
            Page {page} of {Math.ceil(data.total / PAGE_SIZE)}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <button className="btn-ghost" disabled={!data.has_next} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  display: 'block', color: 'var(--text-dim)', fontSize: '0.72rem',
  marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em',
}
const thStyle = {
  padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--text-mute)',
  fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
}
const tdStyle = { padding: '0.75rem 1rem', fontSize: '0.85rem' }