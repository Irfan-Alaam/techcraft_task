import { useState } from 'react'
import { generateSummary } from '../api'

export default function AISummaryPanel({ candidateId, initialSummary, onGenerated }) {
  const [summary, setSummary] = useState(initialSummary || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const data = await generateSummary(candidateId)
      setSummary(data.summary)
      onGenerated?.(data.summary)
    } catch (err) {
      setError(err.message || 'Failed to generate summary. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div className="banner banner-error">{error}</div>}

      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '1rem', background: 'rgba(245,166,35,0.05)',
          border: '1px dashed var(--amber-dim)', borderRadius: 'var(--radius)',
          color: 'var(--text-dim)', fontSize: '0.85rem',
        }}>
          <span className="spinner" />
          <span>Generating AI summary — this takes ~2 seconds...</span>
        </div>
      )}

      {!loading && summary && (
        <div style={{
          padding: '1rem',
          background: 'rgba(76,175,130,0.05)',
          border: '1px solid rgba(76,175,130,0.25)',
          borderRadius: 'var(--radius)',
          color: 'var(--text)',
          fontSize: '0.88rem',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }} className="fade-in">
          {summary}
        </div>
      )}

      {!loading && !summary && (
        <p style={{ color: 'var(--text-mute)', fontSize: '0.85rem' }}>
          No summary generated yet.
        </p>
      )}

      <button
        className="btn-ghost"
        onClick={handleGenerate}
        disabled={loading}
        style={{ alignSelf: 'flex-start' }}
      >
        {loading ? 'Generating...' : summary ? '↻ Regenerate Summary' : '✦ Generate AI Summary'}
      </button>
    </div>
  )
}