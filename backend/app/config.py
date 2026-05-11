import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DB_PATH: str = os.getenv("DB_PATH", "./techkraft.db")

    #update this if you want to change admin
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@techkraft.com")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")
    BCRYPT_SCHEMES = ["bcrypt"]
    BCRYPT_DEPRECATED = "auto"

    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production-please")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    )

settings = Settings()