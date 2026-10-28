from fastapi import APIRouter, Depends
import aiosqlite
from security import DB_PATH, get_current_user

task_router = APIRouter(prefix="/api/tasks", tags=["Task History"])

@task_router.get("/history")
async def get_task_history(current_user: str = Depends(get_current_user)):
    """Hanya bisa diakses jika sudah login."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM task_history ORDER BY created_at DESC LIMIT 50") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
