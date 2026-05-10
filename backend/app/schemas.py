from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
import json

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    role: str
    created_at: str

class CandidateOut(BaseModel):
    id: str
    name: str
    email: str
    role_applied: str
    status: str
    skills: list[str]
    ai_summary: Optional[str]
    created_at: str

    @classmethod
    def from_row(cls, row) -> "CandidateOut":
        data = dict(row)
        raw_skills = data.get("skills", "[]")
        data["skills"] = json.loads(raw_skills) if isinstance(raw_skills, str) else raw_skills
        data.pop("internal_notes", None)
        data.pop("deleted_at", None)
        return cls(**data)


class CandidateWithNotesOut(CandidateOut):
    internal_notes: Optional[str] = None

    @classmethod
    def from_row(cls, row) -> "CandidateWithNotesOut":
        data = dict(row)
        raw_skills = data.get("skills", "[]")
        data["skills"] = json.loads(raw_skills) if isinstance(raw_skills, str) else raw_skills
        data.pop("deleted_at", None)
        return cls(**data)


class CandidateListResponse(BaseModel):
    items: list[CandidateOut]
    total: int
    page: int
    page_size: int
    has_next: bool



class ScoreCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    score: int = Field(ge=1, le=5)
    note: Optional[str] = Field(default=None, max_length=1000)


class ScoreOut(BaseModel):
    id: str
    candidate_id: str
    category: str
    score: int
    reviewer_id: str
    note: Optional[str]
    created_at: str

    @classmethod
    def from_row(cls, row) -> "ScoreOut":
        return cls(**dict(row))


class SummaryResponse(BaseModel):
    candidate_id: str
    summary: str


class NotesUpdate(BaseModel):
    internal_notes: str = Field(max_length=5000)