const COLOR_MAP = {
  new:      { bg: 'rgba(91,141,239,0.12)', color: '#5b8def', border: '#5b8def' },
  reviewed: { bg: 'rgba(245,166,35,0.12)', color: '#f5a623', border: '#f5a623' },
  hired:    { bg: 'rgba(76,175,130,0.12)', color: '#4caf82', border: '#4caf82' },
  rejected: { bg: 'rgba(224,92,92,0.12)',  color: '#e05c5c', border: '#e05c5c' },
  archived: { bg: 'rgba(124,129,145,0.12)', color: '#7c8191', border: '#7c8191' },
}

export default function StatusBadge({ status }) {
  const style = COLOR_MAP[status] || COLOR_MAP.archived
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
      borderRadius: '20px',
      padding: '0.15rem 0.65rem',
      fontSize: '0.75rem',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}