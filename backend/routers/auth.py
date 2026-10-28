from fastapi import APIRouter, Response, Depends, HTTPException, status
from pydantic import BaseModel
import aiosqlite
from security import DB_PATH, hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication & Setup"])

class SetupRequest(BaseModel):
    username: str
    password: str
    rocm_path: str = "/opt/rocm"
    voice_character: str = "reji_engineer"

class LoginRequest(BaseModel):
    username: str
    password: str

@router.get("/status")
async def check_setup_status():
    """Analyzing is mandala setup is ready or still need onboarding."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            user_count = (await cursor.fetchone())[0]
            
    return {
        "is_setup_completed": user_count > 0,
        "requires_onboarding": user_count == 0
    }

@router.post("/setup")
async def initial_setup(payload: SetupRequest, response: Response):
    """Only accessible 1 time when ap is firstly installed"""
    async with aiosqlite.connect(DB_PATH) as db:
        # Validate if user is ready
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            if (await cursor.fetchone())[0] > 0:
                raise HTTPException(status_code=400, detail="Setup is already finished!")

        # 1. Buat master user
        hashed_pwd = hash_password(payload.password)
        await db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (payload.username, hashed_pwd)
        )

        # 2. Simpan konfigurasi awal
        await db.execute("UPDATE system_config SET value = ? WHERE key = 'rocm_path'", (payload.rocm_path,))
        await db.execute("UPDATE system_config SET value = ? WHERE key = 'ai_voice_character'", (payload.voice_character,))
        await db.execute("UPDATE system_config SET value = 'true' WHERE key = 'setup_completed'")
        await db.commit()

    # Berikan session cookie langsung setelah setup sukses
    token = create_access_token({"sub": payload.username})
    response.set_cookie(
        key="mandala_session",
        value=token,
        httponly=True,
        samesite="strict",
        max_age=86400  # 24 jam
    )
    return {"message": "Setup success! Mandala administrator account is active."}

@router.post("/login")
async def login(payload: LoginRequest, response: Response):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT password_hash FROM users WHERE username = ?", (payload.username,)) as cursor:
            row = await cursor.fetchone()
            if not row or not verify_password(payload.password, row[0]):
                raise HTTPException(status_code=401, detail="Username or password false")

        # Update last login
        await db.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = ?", (payload.username,))
        await db.commit()

    token = create_access_token({"sub": payload.username})
    response.set_cookie(
        key="mandala_session",
        value=token,
        httponly=True,
        samesite="strict",
        max_age=86400
    )
    return {"message": "Login success", "username": payload.username}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="mandala_session")
    return {"message": "Logout success"}