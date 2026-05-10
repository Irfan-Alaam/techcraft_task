import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCandidate, updateNotes } from '../api'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import ScoreForm from '../components/ScoreForm'
import AISummaryPanel from '../components/AISummaryPanel'

export default function CandidateDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [candidate, setCandidate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Admin notes edit state
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesError, setNotesError] = useState(null)

  const fetchCandidate = useCallback(async () => {
    try {
      const data = await getCandidate(id)
      setCandidate(data)
      setNotesValue(data.internal_notes || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchCandidate() }, [fetchCandidate])

  async function saveNotes() {
    setNotesSaving(true)
    setNotesError(null)
    try {
      await updateNotes(id, notesValue)
      setCandidate(c => ({ ...c, internal_notes: notesValue }))
      setEditingNotes(false)
    } catch (err) {
      setNotesError(err.message)
    } finally {
      setNotesSaving(false)
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (error) return (
    <div className="page">
      <div className="banner banner-error">{error}</div>
      <button className="btn-ghost" onClick={() => navigate('/')}>← Back</button>
    </div>
  )

  if (!candidate) return null

  const avgScore = candidate.scores?.length
    ? (candidate.scores.reduce((s, r) => s + r.score, 0) / candidate.scores.length).toFixed(1)
    : null

  return (
    <div className="page fade-in">
      {/* Back */}
      <button className="btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: '1.25rem', fontSize: '0.8rem' }}>
        ← All Candidates
      </button>

      {/* Profile header */}
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem' }}>
            {candidate.name}
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{candidate.email}</p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '0.1rem' }}>{candidate.role_applied}</p>
          <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {candidate.skills.map(s => (
              <span key={s} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.15rem 0.55rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>{s}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          <StatusBadge status={candidate.status} />
          {avgScore && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--amber)' }}>{avgScore}</span>
              <span style={{ color: 'var(--text-mute)', fontSize: '0.8rem' }}> / 5 avg</span>
            </div>
          )}
          <span style={{ color: 'var(--text-mute)', fontSize: '0.75rem' }}>
            Added {new Date(candidate.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Score form */}
          <section className="card">
            <h3 style={sectionHead}>Submit Score</h3>
            <ScoreForm candidateId={id} onScoreSubmitted={fetchCandidate} />
          </section>

          {/* Scores list */}
          <section className="card">
            <h3 style={sectionHead}>
              Scores
              <span style={{ color: 'var(--text-mute)', fontWeight: 400, fontSize: '0.78rem', marginLeft: '0.5rem' }}>
                {isAdmin ? '(all reviewers)' : '(your scores)'}
              </span>
            </h3>
            {candidate.scores?.length === 0 ? (
              <p style={{ color: 'var(--text-mute)', fontSize: '0.85rem' }}>No scores yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {candidate.scores.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '0.6rem 0.75rem', background: 'var(--bg-input)',
                    borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{s.category}</div>
                      {s.note && <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.15rem' }}>{s.note}</div>}
                      {isAdmin && <div style={{ color: 'var(--text-mute)', fontSize: '0.72rem', marginTop: '0.15rem' }}>by {s.reviewer_id.slice(0, 8)}…</div>}
                    </div>
                    <ScoreDots value={s.score} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* AI Summary */}
          <section className="card">
            <h3 style={sectionHead}>AI Summary</h3>
            <AISummaryPanel
              candidateId={id}
              initialSummary={candidate.ai_summary}
              onGenerated={summary => setCandidate(c => ({ ...c, ai_summary: summary }))}
            />
          </section>

          {/* Admin notes */}
          {isAdmin && (
            <section className="card" style={{ border: '1px solid rgba(245,166,35,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ ...sectionHead, marginBottom: 0 }}>
                  Internal Notes
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>admin</span>
                </h3>
                {!editingNotes && (
                  <button className="btn-ghost" onClick={() => setEditingNotes(true)} style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem' }}>
                    Edit
                  </button>
                )}
              </div>

              {notesError && <div className="banner banner-error" style={{ marginBottom: '0.75rem' }}>{notesError}</div>}

              {editingNotes ? (
                <>
                  <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} rows={5} style={{ resize: 'vertical', marginBottom: '0.75rem' }} />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-primary" onClick={saveNotes} disabled={notesSaving}>
                      {notesSaving ? <span className="spinner" /> : 'Save'}
                    </button>
                    <button className="btn-ghost" onClick={() => { setEditingNotes(false); setNotesValue(candidate.internal_notes || '') }}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ color: candidate.internal_notes ? 'var(--text)' : 'var(--text-mute)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {candidate.internal_notes || 'No internal notes. Click Edit to add.'}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreDots({ value }) {
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: i <= value ? 'var(--amber)' : 'var(--border)',
          display: 'inline-block',
        }} />
      ))}
      <span style={{ marginLeft: '4px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>{value}</span>
    </div>
  )
}

const sectionHead = {
  fontFamily: 'var(--font-head)',
  fontSize: '0.9rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '0.75rem',
  color: 'var(--text)',
}