import { useState } from 'react'
import { submitScore } from '../api'

const CATEGORIES = [
  'Technical Skills',
  'Communication',
  'Problem Solving',
  'Culture Fit',
  'Leadership',
  'System Design',
]

export default function ScoreForm({ candidateId, onScoreSubmitted }) {
  const [category, setCategory] = useState(CATEGORIES[0])
  const [score, setScore] = useState(3)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      await submitScore(candidateId, { category, score: Number(score), note: note || undefined })
      setSuccess(true)
      setNote('')
      onScoreSubmitted?.()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div className="banner banner-error">{error}</div>}
      {success && <div className="banner" style={{ background: 'rgba(76,175,130,0.1)', border: '1px solid var(--green)', color: 'var(--green)' }}>Score submitted.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Score — <span style={{ color: 'var(--amber)' }}>{score} / 5</span>
          </label>
          <input
            type="range" min="1" max="5" value={score}
            onChange={e => setScore(e.target.value)}
            style={{ padding: 0, cursor: 'pointer', accentColor: 'var(--amber)' }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note (optional)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="Add context for this score..."
          style={{ resize: 'vertical' }}
        />
      </div>

      <button type="submit" className="btn-primary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? <span className="spinner" /> : 'Submit Score'}
      </button>
    </form>
  )
}