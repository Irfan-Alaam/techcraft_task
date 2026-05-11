import aiosqlite
import uuid
import json
from app.security import hash_password
from app.models import SCHEMA_SQL
from app.config import settings


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(settings.DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    async with aiosqlite.connect(settings.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.executescript(SCHEMA_SQL)
        await db.commit()

        await _seed_admin(db)
        await _seed_demo_data(db)

async def _seed_admin(db: aiosqlite.Connection):
    admin_email = settings.ADMIN_EMAIL
    admin_password = settings.ADMIN_PASSWORD

    cursor = await db.execute(
        "SELECT id FROM users WHERE email = ?",
        (admin_email,)
    )

    if await cursor.fetchone() is None:
        await db.execute(
            """
            INSERT INTO users (id, email, hashed_password, role)
            VALUES (?, ?, ?, 'admin')
            """,
            (str(uuid.uuid4()), admin_email, hash_password(admin_password)),
        )
        await db.commit()
        
async def _seed_demo_data(db: aiosqlite.Connection):
    row = await db.execute("SELECT COUNT(*) FROM candidates")
    count = (await row.fetchone())[0]
    if count > 0:
        return

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