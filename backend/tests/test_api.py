"""
Tests covering:
1. Candidate list pagination (API endpoint correctness)
2. Auth enforcement: reviewer cannot see another reviewer's scores
3. Role spoofing prevention: client cannot register as admin
"""
import json
import os
import uuid
import tempfile
import pytest
import pytest_asyncio
import aiosqlite
from httpx import AsyncClient, ASGITransport

# ── Test DB setup ─────────────────────────────────────────────────────────────
# :memory: cannot be shared across connections — each aiosqlite.connect(":memory:")
# is a brand new empty database. Use a real temp file so the app's get_db()
# dependency and our seed helper all see the same initialized schema.

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
TEST_DB_PATH = _tmp.name

os.environ["DB_PATH"] = TEST_DB_PATH
os.environ["SECRET_KEY"] = "test-secret-key-for-tests-only"

# Import AFTER env vars are set so database.py picks up TEST_DB_PATH
from app.main import app
from app.database import init_db


@pytest_asyncio.fixture(scope="module")
async def client():
    # Initialize schema + seed data into the temp file DB once for all tests
    await init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    # Cleanup temp file after all tests complete
    try:
        os.unlink(TEST_DB_PATH)
    except OSError:
        pass


# ── Helpers ───────────────────────────────────────────────────────────────────

async def register_and_login(client: AsyncClient, email: str, password: str = "password123") -> str:
    """Register a user (ignore 409 if already exists) and return JWT token."""
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


async def seed_candidate(candidate_id: str = None) -> str:
    """Insert a candidate directly into the shared test DB and return its id."""
    cid = candidate_id or str(uuid.uuid4())
    async with aiosqlite.connect(TEST_DB_PATH) as db:
        await db.execute(
            """INSERT OR IGNORE INTO candidates
               (id, name, email, role_applied, status, skills)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (cid, "Test Candidate", f"test_{cid[:8]}@ex.com",
             "Backend Engineer", "new", json.dumps(["Python", "FastAPI"])),
        )
        await db.commit()
    return cid


# ── Test 1: GET /candidates returns paginated structure ───────────────────────

@pytest.mark.asyncio
async def test_list_candidates_returns_paginated_results(client: AsyncClient):
    token = await register_and_login(client, "lister@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/candidates?page=1&page_size=10", headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert "has_next" in body
    assert isinstance(body["items"], list)
    assert body["page"] == 1
    assert body["page_size"] == 10


# ── Test 2: Reviewer cannot see another reviewer's scores ─────────────────────

@pytest.mark.asyncio
async def test_reviewer_cannot_see_other_reviewers_scores(client: AsyncClient):
    token_a = await register_and_login(client, "reviewer_a@test.com")
    token_b = await register_and_login(client, "reviewer_b@test.com")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    candidate_id = await seed_candidate()

    # Reviewer A submits a score
    score_resp = await client.post(
        f"/candidates/{candidate_id}/scores",
        json={"category": "Technical Skills", "score": 4, "note": "Good async knowledge"},
        headers=headers_a,
    )
    assert score_resp.status_code == 201

    # Reviewer B fetches the same candidate — must see 0 scores (their own only)
    detail_resp = await client.get(f"/candidates/{candidate_id}", headers=headers_b)
    assert detail_resp.status_code == 200
    body = detail_resp.json()

    assert body["scores"] == [], (
        "Reviewer B should NOT see Reviewer A's scores — got: " + str(body["scores"])
    )


# ── Test 3: Role spoofing is impossible ───────────────────────────────────────

@pytest.mark.asyncio
async def test_registration_always_assigns_reviewer_role(client: AsyncClient):
    # Send role=admin in payload — Pydantic should ignore it, DB should store 'reviewer'
    resp = await client.post(
        "/auth/register",
        json={"email": "hacker@test.com", "password": "hackpass123", "role": "admin"},
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "reviewer", (
        f"Role spoofing succeeded — got: {resp.json()['role']}"
    )

    # Login and confirm admin-only endpoint returns 403
    token = (await client.post(
        "/auth/login",
        json={"email": "hacker@test.com", "password": "hackpass123"},
    )).json()["access_token"]

    candidate_id = await seed_candidate()
    notes_resp = await client.patch(
        f"/candidates/{candidate_id}/notes",
        json={"internal_notes": "Injected admin note"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert notes_resp.status_code == 403, (
        "Reviewer should be blocked from writing internal_notes"
    )