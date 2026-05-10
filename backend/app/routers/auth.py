from fastapi import APIRouter, Depends, HTTPException, status
import aiosqlite

from app.database import get_db
from app.schemas import RegisterRequest, LoginRequest, TokenResponse, UserOut
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_user_by_email,
    create_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: aiosqlite.Connection = Depends(get_db)):
    existing = await get_user_by_email(body.email, db)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    hashed = hash_password(body.password)
    # Role is ALWAYS 'reviewer' — never taken from client
    user = await create_user(body.email, hashed, db)
    return UserOut(**user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: aiosqlite.Connection = Depends(get_db)):
    user = await get_user_by_email(body.email, db)
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(user["id"], user["email"], user["role"])
    return TokenResponse(access_token=token)