# TechKraft — Candidate Scoring Dashboard

An internal recruitment review tool for scoring candidates, generating AI summaries, and managing assessments with role-based access control.

> **Stack:** FastAPI · aiosqlite · JWT · React + Vite · Docker Compose

---

## ⚠️ Debugging Signal — Bug Analysis

**The buggy pattern provided:**

```python
def search_candidates(status: str, keyword: str, page: int, page_size: int):
    all_candidates = db.execute("SELECT * FROM candidates").fetchall()
    filtered = [c for c in all_candidates if c["status"] == status]
    # ... also filter by keyword in Python ...
    offset = (page - 1) * page_size
    return filtered[offset : offset + page_size]
```

**The bug — full table scan + in-memory filtering:**

`SELECT * FROM candidates` fetches every row into application memory before
any filtering or pagination happens. Three compounding problems:

| Problem | Impact at scale |
|---|---|
| Full table loaded into memory | 10,000 candidates → 10,000 rows deserialized on every search |
| DB indexes never used | No `WHERE` clause reaches the engine — indexes on `status`, `role_applied` are wasted |
| Paginating filtered Python list | `filtered[offset:offset+page_size]` discards most of what was fetched |

**The correct approach — push everything into SQL:**

```python
async def list_candidates(db, status, role_applied, skill, keyword, page, page_size):
    conditions = ["deleted_at IS NULL"]
    params = []

    if status:
        conditions.append("status = ?")           # uses idx_candidates_status
        params.append(status)
    if role_applied:
        conditions.append("role_applied = ?")     # uses idx_candidates_role_applied
        params.append(role_applied)
    if keyword:
        kw = f"%{keyword.lower()}%"
        conditions.append("(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)")
        params.extend([kw, kw])

    where  = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * page_size

    total = (await (await db.execute(
        f"SELECT COUNT(*) FROM candidates {where}", params
    )).fetchone())[0]

    rows = await (await db.execute(
        f"SELECT * FROM candidates {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset]
    )).fetchall()

    return rows, total
```

This is exactly how `backend/app/services/candidate_service.py` implements it.
The DB engine uses its indexes, transfers only the required rows, and memory
usage stays constant regardless of table size.

---

## Quick Start

### Prerequisites
- Docker & Docker Compose **or** Python 3.11+ and Node 20+

### Option A — Docker Compose (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/Irfan-Alaam/techcraft_task.git
cd techcraft_task

# 2. Copy env file
cp .env.example .env          # edit values if needed

# 3. Start both services
docker compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8000      |
| API Docs | http://localhost:8000/docs |

### Option B — Local Development

**Backend**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
pip install -e .              # makes app.* importable across processes
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

### Default Credentials

| Role     | Email               | Password     | How created                        |
|----------|---------------------|--------------|------------------------------------|
| Admin    | admin@techkraft.com | admin123     | Seeded automatically on first run  |
| Reviewer | any email           | your choice  | Register via `/login` page         |

> Admin credentials are read from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars
> (see `.env.example`). Registration is always hardcoded to `reviewer` —
> the seed is the only path to an admin account.

---

## Running Tests

```bash
cd backend
pytest
# Expected: 3 passed
```

**Tests cover:**
1. `test_list_candidates_returns_paginated_results` — GET /candidates pagination structure
2. `test_reviewer_cannot_see_other_reviewers_scores` — score isolation between reviewers
3. `test_registration_always_assigns_reviewer_role` — role spoofing prevention

---

## Example API Calls

### Auth

```bash
# Register (always creates a reviewer — role cannot be injected)
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "reviewer@test.com", "password": "pass123"}'

# Login as admin
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@techkraft.com", "password": "admin123"}'
# → returns { "access_token": "<jwt>", "token_type": "bearer" }
```

### Candidates

```bash
# List with filters + pagination (all filtering is SQL-side)
curl "http://localhost:8000/candidates?status=new&skill=Python&page=1&page_size=10" \
  -H "Authorization: Bearer <token>"

# Get candidate detail (admin sees internal_notes + all scores; reviewer sees own scores only)
curl http://localhost:8000/candidates/c1 \
  -H "Authorization: Bearer <token>"

# Submit a score (1–5)
curl -X POST http://localhost:8000/candidates/c1/scores \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"category": "Technical Skills", "score": 4, "note": "Strong async knowledge"}'

# Trigger AI summary — 2s async mock delay, non-blocking
curl -X POST http://localhost:8000/candidates/c1/summary \
  -H "Authorization: Bearer <token>"

# Update internal notes — admin only, returns 403 for reviewers
curl -X PATCH http://localhost:8000/candidates/c1/notes \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"internal_notes": "Strong candidate, fast-track to final round."}'

# Soft delete — sets deleted_at, never hard-deletes (admin only)
curl -X DELETE http://localhost:8000/candidates/c1 \
  -H "Authorization: Bearer <admin-token>"

# SSE score stream — stretch goal
curl -N http://localhost:8000/candidates/c1/stream \
  -H "Authorization: Bearer <token>"
```

---

## Architecture Decision Records

### ADR 1 — SQL-level filtering with explicit indexes (not in-memory)

**Context:** Candidate search requires filtering by `status`, `role_applied`, `skill`,
and `keyword` with offset-based pagination. The naive approach is fetching all rows
and filtering in Python — which is the exact anti-pattern shown in the debugging signal.

**Decision:** All filtering, counting, and pagination happens in SQL. Three indexes
are created explicitly in `models.py`:

```sql
CREATE INDEX idx_candidates_status      ON candidates(status);
CREATE INDEX idx_candidates_role_applied ON candidates(role_applied);
CREATE INDEX idx_scores_candidate_id    ON scores(candidate_id);
```

The service layer (`candidate_service.py`) builds parameterized `WHERE` clauses
dynamically and passes `LIMIT`/`OFFSET` to the DB engine — the application never
loads more rows than the page size.

**Trade-off:** Dynamic SQL construction requires careful parameterization to avoid
injection. All values go through `?` placeholders — never string-interpolated.

---

### ADR 2 — Service layer separation (routers never touch DB directly)

**Context:** FastAPI routers could query the DB directly via the `db` dependency.
This works but tightly couples HTTP concerns (request parsing, response shaping)
with persistence concerns (query construction, result mapping).

**Decision:** All DB queries live exclusively in `services/candidate_service.py`.
Routers call service functions and receive domain objects. This means:
- Swapping SQLite for DynamoDB only requires changing `candidate_service.py`
- Routers stay thin and testable without a real DB
- The service layer is independently unit-testable

**Trade-off:** For a small project this adds one indirection layer. The benefit
pays off at the point where the persistence layer needs to change — which is
exactly the DynamoDB swap this project is designed to eventually make.

---

### ADR 3 — FastAPI over Flask / Django

**Context:** The backend needs async support for the SSE streaming endpoint and
the mock LLM call (`asyncio.sleep(2)`), both requiring non-blocking I/O.

**Decision:** FastAPI with `uvicorn` and `aiosqlite` for a fully async stack.
Auto-generated OpenAPI docs at `/docs` come for free.

**Trade-off:** FastAPI's dependency injection has a steeper learning curve than
Flask. Django was ruled out — its ORM is synchronous by default and requires
additional configuration (`django-ninja` or ASGI mode) to support the async
patterns needed here.

---

### ADR 4 — JWT with embedded role, stored in localStorage

**Context:** Role-based UI rendering (admin notes panel, score visibility) requires
knowing the user's role client-side without a `/me` round-trip on every page load.

**Decision:** JWT with `role` embedded in the payload. The frontend decodes it
client-side (`atob`) for UI decisions only. All authorization enforcement happens
server-side via the `require_admin` FastAPI dependency — the frontend role is
purely cosmetic.

**Trade-off:** `localStorage` is vulnerable to XSS; `httpOnly` cookies are more
secure. Role changes require re-login since the role is baked into the token at
issue time. Acceptable for an internal tool — a production system would use
short-lived tokens with a refresh flow.

---

## Learning Reflection

Building the SSE streaming endpoint was new territory — specifically managing the
async generator lifecycle inside FastAPI's `StreamingResponse` and ensuring the
event loop stays free during polling intervals via `asyncio.sleep()` rather than
blocking. The current implementation polls the DB every 3 seconds; given more time
I would replace this with DynamoDB Streams or EventBridge Pipes, which push score
events rather than polling — a cleaner event-driven pattern that aligns with
TechKraft's serverless architecture and eliminates unnecessary DB reads entirely.

---

## Key Implementation Details

### Role-Based Access Control
- Registration is **hardcoded to `reviewer`** — the `RegisterRequest` Pydantic schema
  has no `role` field, so clients cannot inject one
- Admin account is seeded at startup via env vars — never via registration
- `require_admin` FastAPI dependency guards all admin endpoints; returns `403` for reviewers
- Score queries: admin passes `reviewer_filter=None` → all scores; reviewer passes their `id` → own scores only

### Soft Delete
- `DELETE /candidates/{id}` sets `deleted_at = datetime('now')` and `status = 'archived'`
- No `DELETE FROM` exists anywhere in the codebase
- All list queries include `WHERE deleted_at IS NULL`

### Mock AI Summary
- `POST /candidates/{id}/summary` runs `await asyncio.sleep(2)` — non-blocking,
  event loop remains free for other requests during the wait
- Frontend shows a spinner + "Generating..." message during the 2s delay
- Error state displayed if the request fails — never a blank page

### SSE Stream (stretch goal)
- `GET /candidates/{id}/stream` returns `StreamingResponse` with `text/event-stream`
- Async generator polls DB every 3s, emits `scores_update` events on change
- Heartbeat events keep the connection alive between updates
- Auto-closes after 60s to prevent zombie connections

---

## Project Structure

```
/
├── README.md
├── docker-compose.yml
├── .env.example                          # root-level for docker-compose variable substitution
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml                    # pip install -e . makes app.* importable
│   ├── pytest.ini                        # asyncio_mode = auto
│   ├── requirements.txt
│   └── app/
│       ├── main.py                       # FastAPI app, CORS, lifespan hook
│       ├── config.py                     # Single load_dotenv() call, Settings class
│       ├── models.py                     # DDL schema + index definitions + enums
│       ├── schemas.py                    # Pydantic I/O models
│       ├── auth.py                       # JWT encode/decode, require_admin dependency
│       ├── database.py                   # aiosqlite setup, init_db, seed
│       ├── routers/
│       │   ├── auth.py                   # POST /auth/register, /auth/login
│       │   └── candidates.py            # All candidate endpoints + SSE
│       └── services/
│           └── candidate_service.py     # All DB queries — routers never touch DB directly
└── backend/tests/
│   └── test_api.py                      # 3 tests: pagination, score isolation, role spoofing
└── frontend/
    ├── Dockerfile
    ├── nginx.conf                        # SPA fallback + /api proxy to backend
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── api.js                        # All fetch calls, token management
        ├── App.jsx                       # Router + AuthProvider
        ├── styles.css                    # CSS variables, global tokens
        ├── context/AuthContext.jsx       # isAdmin derived from JWT payload
        ├── components/
        │   ├── Navbar.jsx
        │   ├── ProtectedRoute.jsx
        │   ├── StatusBadge.jsx
        │   ├── ScoreForm.jsx
        │   └── AISummaryPanel.jsx        # Loading + error states for AI summary
        └── pages/
            ├── LoginPage.jsx
            ├── CandidateListPage.jsx     # Filters + pagination
            └── CandidateDetailPage.jsx  # Scores, AI summary, admin notes panel
```

---

## Known Limitations

- **No `POST /candidates` endpoint** — the spec does not define one. Demo candidates
  are seeded on startup. A real implementation would add this as an admin-only endpoint.
- **SSE auth limitation** — browser `EventSource` does not support custom headers,
  so the Bearer token cannot be sent the standard way on the stream endpoint.
  A production system would issue a short-lived stream token for this purpose.
- **SQLite single-writer** — concurrent writes serialize under load. Acceptable for
  an internal tool with a small team. The service layer is the only change point
  for a DynamoDB migration.