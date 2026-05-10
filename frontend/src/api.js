const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken() {
  return localStorage.getItem('tk_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('tk_token')
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }

  if (res.status === 204) return null
  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  localStorage.setItem('tk_token', data.access_token)
  return data
}

export async function register(email, password) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function logout() {
  localStorage.removeItem('tk_token')
}

export function getStoredToken() {
  return getToken()
}

// Decode JWT payload (no verification — just for UI role display)
export function parseTokenPayload() {
  const token = getToken()
  if (!token) return null
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

// ── Candidates ────────────────────────────────────────────────────────────────

export async function listCandidates({ status, role_applied, skill, keyword, page = 1, page_size = 20 } = {}) {
  const params = new URLSearchParams()
  if (status)       params.set('status', status)
  if (role_applied) params.set('role_applied', role_applied)
  if (skill)        params.set('skill', skill)
  if (keyword)      params.set('keyword', keyword)
  params.set('page', page)
  params.set('page_size', page_size)
  return request(`/candidates?${params}`)
}

export async function getCandidate(id) {
  return request(`/candidates/${id}`)
}

export async function submitScore(candidateId, { category, score, note }) {
  return request(`/candidates/${candidateId}/scores`, {
    method: 'POST',
    body: JSON.stringify({ category, score, note }),
  })
}

export async function generateSummary(candidateId) {
  return request(`/candidates/${candidateId}/summary`, { method: 'POST' })
}

export async function updateNotes(candidateId, internal_notes) {
  return request(`/candidates/${candidateId}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ internal_notes }),
  })
}

// ── SSE stream ────────────────────────────────────────────────────────────────

export function streamScores(candidateId, onUpdate, onError) {
  const token = getToken()
  const url = `${BASE}/candidates/${candidateId}/stream`

  // SSE doesn't support custom headers natively — pass token as query param
  // The backend should accept it; for now we open the stream directly
  const es = new EventSource(`${url}?token=${token}`)

  es.addEventListener('scores_update', (e) => {
    try { onUpdate(JSON.parse(e.data)) } catch {}
  })

  es.addEventListener('close', () => es.close())
  es.onerror = (e) => { onError?.(e); es.close() }

  return () => es.close() // cleanup function
}