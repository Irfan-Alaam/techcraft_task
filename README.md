# TechKraft Candidate Scoring Dashboard

An internal recruitment review tool for scoring candidates, generating AI summaries, and managing assessments with role-based access control.

---

## Quick Start

### Prerequisites
- Docker & Docker Compose, **or**
- Python 3.11+ and Node 20+ for local development

### Option A — Docker Compose (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/Irfan-Alaam/techcraft_task.git
cd <repo>

# 2. Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

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
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
pip install -e .              # makes app.* importable
cp .env.example .env
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Default Credentials

| Role     | Email                    | Password  |
|----------|--------------------------|-----------|
| Admin    | admin@techkraft.com      | admin123  |
| Reviewer | register via /login page | your choice |

> Admin credentials are seeded on first startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars. Change them before deploying.

---

## Running Tests

```bash
cd backend
pytest
```

Expected output: `3 passed`

---

## Example API Calls

### Register & Login
```bash
# Register (always creates a reviewer)
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "reviewer@test.com", "password": "pass123"}'

# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@techkraft.com", "password": "admin123"}'
```

### Candidates
```bash
# List candidates (with filters)
curl http://localhost:8000/candidates?status=new&skill=Python&page=1&page_size=10 \
  -H "Authorization: Bearer <token>"

# Get candidate detail
curl http://localhost:8000/candidates/c1 \
  -H "Authorization: Bearer <token>"

# Submit a score
curl -X POST http://localhost:8000/candidates/c1/scores \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"category": "Technical Skills", "score": 4, "note": "Strong async knowledge"}'

# Trigger AI summary (2s mock delay)
curl -X POST http://localhost:8000/candidates/c1/summary \
  -H "Authorization: Bearer <token>"

# Update internal notes (admin only)
curl -X PATCH http://localhost:8000/candidates/c1/notes \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"internal_notes": "Strong candidate, fast-track to final round."}'

# SSE score stream (stretch goal)
curl -N http://localhost:8000/candidates/c1/stream \
  -H "Authorization: Bearer <token>"
```

---

## Debugging Signal — Bug Analysis

The following pattern was provided as a debugging exercise:

```python
def search_candidates(status: str, keyword: str, page: int, page_size: int):
    all_candidates = db.execute("SELECT * FROM candidates").fetchall()
    filtered = [c for c in all_candidates if c["status"] == status]
    # ... also filter by keyword in Python ...
    offset = (page - 1) * page_size
    return filtered[offset : offset + page_size]
```

**The bug:** `SELECT * FROM candidates` fetches every row in the table into application memory before any filtering or pagination happens. Python then filters and slices the list.

**Why it matters at scale:** With 10,000 candidates, every search query transfers all 10,000 rows over the DB connection, deserializes them into Python dicts, and then discards most of them. Memory usage grows linearly with table size. Response time degrades even when the result set is tiny (e.g. 1 match out of 10,000 rows). This also defeats any DB indexes — they are never used because no `WHERE` clause reaches the DB engine.

**The correct approach:** Push all filtering and pagination into SQL so the database engine uses its indexes and returns only the rows actually needed:

```python
async def search_candidates(status, keyword, page, page_size):
    conditions = ["deleted_at IS NULL"]
    params = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if keyword:
        kw = f"%{keyword.lower()}%"
        conditions.append("(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)")
        params.extend([kw, kw])
    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * page_size
    rows = await db.execute(
        f"SELECT * FROM candidates {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset]
    )
    return await rows.fetchall()
```

This is exactly how `candidate_service.py` implements it in this project.

---

## Architecture Decision Records

### ADR 1 — SQLite over DynamoDB for local development

**Context:** The spec mentioned "DynamoDB-style or SQLite." DynamoDB requires AWS credentials, a running LocalStack instance, or a paid AWS account to develop against locally.

**Decision:** Use SQLite via `aiosqlite` for the persistence layer, with a schema shaped to match DynamoDB patterns (single-table-style IDs, status-based filtering with indexes).

**Trade-off:** SQLite does not scale horizontally and is not suitable for multi-instance production deployments. In a real AWS serverless deployment this would be swapped for DynamoDB with GSIs on `status` and `role_applied`. The service layer (`candidate_service.py`) is the only file that would need to change — all business logic and API contracts remain identical.

---

### ADR 2 — FastAPI over Flask / Django

**Context:** The backend needs async support for the SSE streaming endpoint and the mock LLM call, both of which require non-blocking I/O. The project also benefits from automatic OpenAPI documentation.

**Decision:** FastAPI with `uvicorn` and `aiosqlite` for a fully async stack.

**Trade-off:** FastAPI's dependency injection system has a steeper learning curve than Flask's simplicity. Django was ruled out because its ORM and middleware are synchronous by default and would require additional configuration (`ASGI` mode, `django-ninja` or similar) to support the async patterns needed here. FastAPI gives async-first behavior out of the box with zero extra configuration.

---

### ADR 3 — JWT stored in localStorage with role embedded in token

**Context:** The app needs role-based UI rendering (show/hide admin panels) without a round-trip to the server on every page load. Two options: opaque tokens with a `/me` endpoint, or self-contained JWTs.

**Decision:** JWT with `role` embedded in the payload, stored in `localStorage`. The frontend decodes the payload client-side (no verification — just `atob`) for UI decisions. All authorization enforcement happens server-side in FastAPI via the `require_admin` dependency.

**Trade-off:** `localStorage` is vulnerable to XSS attacks; `httpOnly` cookies would be more secure. Embedding `role` in the token means a role change (e.g. promoting a reviewer to admin) requires the user to log out and back in before the new role takes effect. For an internal tool with a small team this is an acceptable trade-off. A production system would use short-lived tokens with a refresh mechanism.

---

## Learning Reflection

Building the SSE streaming endpoint was new territory — specifically managing the async generator lifecycle inside FastAPI's `StreamingResponse` and ensuring the event loop stays free during the polling interval (`asyncio.sleep`) rather than blocking. Given more time, I would explore replacing the polling-based SSE implementation with DynamoDB Streams or EventBridge Pipes, which would push real-time score events rather than polling the DB every 3 seconds — a much cleaner event-driven pattern that fits the serverless architecture TechKraft uses in production.

---

## Project Structure

```
/
├── README.md
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml          # makes app.* importable via pip install -e .
│   ├── pytest.ini
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py             # FastAPI app, CORS, lifespan
│       ├── models.py           # DB schema DDL + enum constants
│       ├── schemas.py          # Pydantic request/response models
│       ├── auth.py             # JWT, password hashing, role dependencies
│       ├── database.py         # aiosqlite setup, init, seed
│       ├── routers/
│       │   ├── auth.py         # POST /auth/register, /auth/login
│       │   └── candidates.py   # All candidate endpoints + SSE
│       └── services/
│           └── candidate_service.py   # All DB queries
├── tests/
│   └── test_api.py             # 3 tests: pagination, score isolation, role spoofing
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── .env.example
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── api.js              # All fetch calls in one place
        ├── App.jsx             # Router setup
        ├── styles.css          # Design tokens + global styles
        ├── context/
        │   └── AuthContext.jsx # Global auth state + isAdmin
        ├── components/
        │   ├── Navbar.jsx
        │   ├── ProtectedRoute.jsx
        │   ├── StatusBadge.jsx
        │   ├── ScoreForm.jsx
        │   └── AISummaryPanel.jsx
        └── pages/
            ├── LoginPage.jsx
            ├── CandidateListPage.jsx
            └── CandidateDetailPage.jsx
```

## Known Limitations

- **No POST /candidates endpoint** — the spec does not define one; demo candidates are seeded on startup. A real implementation would add this with admin-only access.
- **SSE auth via query param** — browser `EventSource` does not support custom headers, so the token is passed as a query param for the stream endpoint. A production system would use a short-lived stream token instead.
- **SQLite single-writer** — concurrent writes under high load will serialize. Acceptable for an internal tool; swap to DynamoDB or PostgreSQL for production scale.