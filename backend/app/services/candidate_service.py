import json
import uuid
from typing import Optional

import aiosqlite


async def list_candidates(
    db: aiosqlite.Connection,
    status: Optional[str],
    role_applied: Optional[str],
    skill: Optional[str],
    keyword: Optional[str],
    page: int,
    page_size: int,
) -> tuple[list[aiosqlite.Row], int]:
    """
    Return paginated candidates matching filters.

    All filtering and pagination is done IN THE DATABASE — not in Python.
    This avoids the N+1 / full-table-scan anti-pattern where you'd fetch
    all rows and slice in Python (see README bug analysis).
    """
    conditions = ["deleted_at IS NULL"]
    params: list = []

    if status:
        conditions.append("status = ?")
        params.append(status)

    if role_applied:
        conditions.append("role_applied = ?")
        params.append(role_applied)

    if skill:
        # skills stored as JSON array; use JSON_EACH for proper set membership
        conditions.append(
            "EXISTS ("
            "  SELECT 1 FROM json_each(skills)"
            "  WHERE LOWER(value) = LOWER(?)"
            ")"
        )
        params.append(skill)

    if keyword:
        conditions.append("(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(role_applied) LIKE ?)")
        kw = f"%{keyword.lower()}%"
        params.extend([kw, kw, kw])

    where_clause = "WHERE " + " AND ".join(conditions)

    # Count total matching rows — separate query, same filters, no LIMIT
    count_sql = f"SELECT COUNT(*) FROM candidates {where_clause}"
    cursor = await db.execute(count_sql, params)
    total = (await cursor.fetchone())[0]

    # Fetch page
    offset = (page - 1) * page_size
    data_sql = (
        f"SELECT * FROM candidates {where_clause} "
        f"ORDER BY created_at DESC "
        f"LIMIT ? OFFSET ?"
    )
    cursor = await db.execute(data_sql, params + [page_size, offset])
    rows = await cursor.fetchall()

    return rows, total


async def get_candidate(db: aiosqlite.Connection, candidate_id: str) -> Optional[aiosqlite.Row]:
    cursor = await db.execute(
        "SELECT * FROM candidates WHERE id = ? AND deleted_at IS NULL",
        (candidate_id,),
    )
    return await cursor.fetchone()


async def get_scores_for_candidate(
    db: aiosqlite.Connection,
    candidate_id: str,
    reviewer_id: Optional[str] = None,
) -> list[aiosqlite.Row]:
    """
    reviewer_id=None → return all scores (admin path).
    reviewer_id=<id>  → return only that reviewer's scores.
    """
    if reviewer_id:
        cursor = await db.execute(
            "SELECT * FROM scores WHERE candidate_id = ? AND reviewer_id = ? ORDER BY created_at DESC",
            (candidate_id, reviewer_id),
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM scores WHERE candidate_id = ? ORDER BY created_at DESC",
            (candidate_id,),
        )
    return await cursor.fetchall()


async def create_score(
    db: aiosqlite.Connection,
    candidate_id: str,
    reviewer_id: str,
    category: str,
    score: int,
    note: Optional[str],
) -> aiosqlite.Row:
    score_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO scores (id, candidate_id, reviewer_id, category, score, note)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (score_id, candidate_id, reviewer_id, category, score, note),
    )
    await db.commit()
    cursor = await db.execute("SELECT * FROM scores WHERE id = ?", (score_id,))
    return await cursor.fetchone()


async def save_ai_summary(
    db: aiosqlite.Connection,
    candidate_id: str,
    summary: str,
) -> None:
    await db.execute(
        "UPDATE candidates SET ai_summary = ? WHERE id = ?",
        (summary, candidate_id),
    )
    await db.commit()


async def soft_delete_candidate(db: aiosqlite.Connection, candidate_id: str) -> bool:
    cursor = await db.execute(
        "SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL",
        (candidate_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return False
    await db.execute(
        "UPDATE candidates SET deleted_at = datetime('now'), status = 'archived' WHERE id = ?",
        (candidate_id,),
    )
    await db.commit()
    return True


async def update_internal_notes(
    db: aiosqlite.Connection,
    candidate_id: str,
    notes: str,
) -> bool:
    cursor = await db.execute(
        "SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL",
        (candidate_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return False
    await db.execute(
        "UPDATE candidates SET internal_notes = ? WHERE id = ?",
        (notes, candidate_id),
    )
    await db.commit()
    return True