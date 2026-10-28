import os
import datetime
import aiosqlite
import jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Security, Request, status
from fastapi.security import APIKeyCookie

DB_PATH = "mandala.db"
SECRET_KEY = os.getenv("MANDALA_SECRET_KEY", "mandala-local-fallback-secret-key-32bytes!")
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
cookie_scheme = APIKeyCookie(name="mandala_session", auto_error=False)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_hours: int = 24) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(hours=expires_hours)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(request: Request):
    token = request.cookies.get("mandala_session")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found. Yu must login first."
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Token not valid")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expired or not legally used")