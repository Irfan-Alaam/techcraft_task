import aiosqlite
import os
import json
from dotenv import load_dotenv

from app.models import SCHEMA_SQL

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "./techkraft.db")


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.executescript(SCHEMA_SQL)   # schema lives in models.py
        await db.commit()
        await _seed_demo_data(db)


async def _seed_demo_data(db: aiosqlite.Connection):
    """Insert demo candidates if table is empty."""
    row = await db.execute("SELECT COUNT(*) FROM candidates")
    count = (await row.fetchone())[0]
    if count > 0:
        return

    import uuid, json
    candidates = [
        ("c1", "Aarav Sharma", "aarav@example.com", "Backend Engineer", "new",
         json.dumps(["Python", "FastAPI", "AWS Lambda"]), None),
        ("c2", "Priya Thapa", "priya@example.com", "Full Stack Engineer", "reviewed",
         json.dumps(["React", "TypeScript", "Node.js"]), "Strong frontend skills."),
        ("c3", "Bikash Rai", "bikash@example.com", "DevOps Engineer", "hired",
         json.dumps(["Docker", "Terraform", "GitHub Actions"]), "Excellent CI/CD knowledge."),
        ("c4", "Sita Gurung", "sita@example.com", "Data Engineer", "rejected",
         json.dumps(["Python", "Spark", "DynamoDB"]), "Lacked production experience."),
        ("c5", "Rajan Karki", "rajan@example.com", "Backend Engineer", "new",
         json.dumps(["FastAPI", "LangChain", "Pinecone"]), None),
    ]
    for c in candidates:
        await db.execute(
            """INSERT OR IGNORE INTO candidates
               (id, name, email, role_applied, status, skills, internal_notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            c,
        )
    await db.commit()