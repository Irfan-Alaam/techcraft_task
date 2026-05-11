import asyncio
import json
from typing import Optional, AsyncGenerator

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.auth import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.models import CandidateStatus
from app.schemas import (
    CandidateListResponse,
    CandidateOut,
    CandidateWithNotesOut,
    ScoreCreate,
    ScoreOut,
    SummaryResponse,
    NotesUpdate,
)
from app.services import candidate_service as svc

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("", response_model=CandidateListResponse)
async def list_candidates(
    status: Optional[str] = Query(default=None),
    role_applied: Optional[str] = Query(default=None),
    skill: Optional[str] = Query(default=None),
    keyword: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: aiosqlite.Connection = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    if status and status not in CandidateStatus.ALL:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Choose from: {', '.join(VALID_STATUSES)}",
        )

    rows, total = await svc.list_candidates(
        db=db,
        status=status,
        role_applied=role_applied,
        skill=skill,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )

    items = [CandidateOut.from_row(row) for row in rows]
    return CandidateListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/{candidate_id}")
async def get_candidate(
    candidate_id: str,
    db: aiosqlite.Connection = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    row = await svc.get_candidate(db, candidate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    reviewer_filter = None if user.is_admin else user.id
    score_rows = await svc.get_scores_for_candidate(db, candidate_id, reviewer_filter)
    scores = [ScoreOut.from_row(s) for s in score_rows]

    if user.is_admin:
        candidate = CandidateWithNotesOut.from_row(row)
        return {**candidate.model_dump(), "scores": [s.model_dump() for s in scores]}
    else:
        candidate = CandidateOut.from_row(row)
        return {**candidate.model_dump(), "scores": [s.model_dump() for s in scores]}


@router.post("/{candidate_id}/scores", response_model=ScoreOut, status_code=status.HTTP_201_CREATED)
async def submit_score(
    candidate_id: str,
    body: ScoreCreate,
    db: aiosqlite.Connection = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    row = await svc.get_candidate(db, candidate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")

    score_row = await svc.create_score(
        db=db,
        candidate_id=candidate_id,
        reviewer_id=user.id,
        category=body.category,
        score=body.score,
        note=body.note,
    )
    return ScoreOut.from_row(score_row)


@router.post("/{candidate_id}/summary", response_model=SummaryResponse)
async def generate_summary(
    candidate_id: str,
    db: aiosqlite.Connection = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    
    row = await svc.get_candidate(db, candidate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate = dict(row)
    skills = json.loads(candidate.get("skills", "[]"))

   
    await asyncio.sleep(2)

    summary = (
        f"{candidate['name']} is applying for the {candidate['role_applied']} role. "
        f"They bring experience in {', '.join(skills) if skills else 'various areas'}. "
        f"Current status: {candidate['status']}. "
        f"Based on their profile, this candidate demonstrates relevant technical breadth "
        f"and would benefit from a structured technical interview to validate depth."
    )

    await svc.save_ai_summary(db, candidate_id, summary)
    return SummaryResponse(candidate_id=candidate_id, summary=summary)


@router.get("/{candidate_id}/stream")
async def stream_scores(
    candidate_id: str,
    db: aiosqlite.Connection = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    row = await svc.get_candidate(db, candidate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")

    reviewer_filter = None if user.is_admin else user.id

    async def event_generator() -> AsyncGenerator[str, None]:
        yield f"event: connected\ndata: {json.dumps({'candidate_id': candidate_id})}\n\n"

        last_count = -1
        poll_count = 0
        max_polls = 20  

        while poll_count < max_polls:
            await asyncio.sleep(3)
            score_rows = await svc.get_scores_for_candidate(db, candidate_id, reviewer_filter)
            scores = [dict(r) for r in score_rows]

            if len(scores) != last_count:
                last_count = len(scores)
                payload = json.dumps({"scores": scores, "total": len(scores)})
                yield f"event: scores_update\ndata: {payload}\n\n"
            else:

                yield f"event: heartbeat\ndata: {{}}\n\n"

            poll_count += 1

        yield f"event: close\ndata: {json.dumps({'reason': 'max_polls_reached'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    candidate_id: str,
    db: aiosqlite.Connection = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    deleted = await svc.soft_delete_candidate(db, candidate_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Candidate not found")


# ── PATCH /candidates/{id}/notes  (admin only) ────────────────────────────────

@router.patch("/{candidate_id}/notes", status_code=status.HTTP_204_NO_CONTENT)
async def update_notes(
    candidate_id: str,
    body: NotesUpdate,
    db: aiosqlite.Connection = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    updated = await svc.update_internal_notes(db, candidate_id, body.internal_notes)
    if not updated:
        raise HTTPException(status_code=404, detail="Candidate not found")