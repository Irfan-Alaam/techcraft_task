
class CandidateStatus:
    NEW      = "new"
    REVIEWED = "reviewed"
    HIRED    = "hired"
    REJECTED = "rejected"
    ARCHIVED = "archived"  

    ALL = {NEW, REVIEWED, HIRED, REJECTED, ARCHIVED}


class UserRole:
    REVIEWER = "reviewer"
    ADMIN    = "admin"
    ALL = {REVIEWER, ADMIN}


class ScoreRange:
    MIN = 1
    MAX = 5


TABLE_USERS      = "users"
TABLE_CANDIDATES = "candidates"
TABLE_SCORES     = "scores"



SCHEMA_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS users (
    id               TEXT PRIMARY KEY,
    email            TEXT UNIQUE NOT NULL,
    hashed_password  TEXT NOT NULL,
    role             TEXT NOT NULL DEFAULT 'reviewer'
                          CHECK(role IN ('reviewer', 'admin')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidates (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    role_applied   TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'new'
                        CHECK(status IN ('new','reviewed','hired','rejected','archived')),
    skills         TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
    internal_notes TEXT,                         -- admin-only
    ai_summary     TEXT,
    deleted_at     TEXT,                         -- NULL = active; soft delete timestamp
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_candidates_status
    ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_role_applied
    ON candidates(role_applied);
CREATE INDEX IF NOT EXISTS idx_candidates_deleted_at
    ON candidates(deleted_at);

CREATE TABLE IF NOT EXISTS scores (
    id           TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES candidates(id),
    category     TEXT NOT NULL,
    score        INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    reviewer_id  TEXT NOT NULL REFERENCES users(id),
    note         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scores_candidate_id
    ON scores(candidate_id);
CREATE INDEX IF NOT EXISTS idx_scores_reviewer_id
    ON scores(reviewer_id);
"""