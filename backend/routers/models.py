"""Model registry endpoints consumed by the Add Model wizard.

Every route is authenticated. Registering validates and inspects the source
server-side; the client only sends a source kind and reference, never a
trusted path or a fabricated metadata blob.
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
import aiosqlite

from backend.model_registry import (
    InspectRequest,
    InspectResult,
    ModelRecord,
    ModelSourceError,
    RegisterRequest,
    create_model,
    delete_model,
    get_model,
    inspect_source,
    list_models,
    max_upload_bytes,
    models_dir,
)
from backend.security import DB_PATH, get_current_user

router = APIRouter(prefix="/api/v1/models", tags=["Model Registry"])

GGUF_MAGIC = b"GGUF"


@router.get("", response_model=list[ModelRecord])
async def list_registered_models(
    current_user: str = Depends(get_current_user),
) -> list[ModelRecord]:
    """List every registered model with its state and VRAM estimate."""
    return await asyncio.to_thread(list_models, DB_PATH)


@router.post("/inspect", response_model=InspectResult)
async def inspect_model_source(
    request: InspectRequest,
    current_user: str = Depends(get_current_user),
) -> InspectResult:
    """Dry-run metadata probe. Nothing is saved."""
    try:
        return await asyncio.to_thread(inspect_source, request.source, request.plan)
    except ModelSourceError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_gguf(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
) -> dict[str, str]:
    """Stream a GGUF file into the allow-listed models directory."""
    filename = Path(file.filename or "").name
    if not filename.lower().endswith(".gguf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only .gguf files can be uploaded.",
        )

    target_dir = models_dir()
    target = target_dir / filename
    if target.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{filename} already exists in the models directory.",
        )

    limit = max_upload_bytes()
    written = 0
    first_chunk = True
    try:
        with target.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                if first_chunk:
                    if chunk[:4] != GGUF_MAGIC:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="File does not start with the GGUF magic bytes.",
                        )
                    first_chunk = False
                written += len(chunk)
                if written > limit:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Upload exceeds MANDALA_MAX_MODEL_UPLOAD_GB.",
                    )
                await asyncio.to_thread(handle.write, chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {"filename": filename, "bytes": str(written)}


@router.post("", response_model=ModelRecord, status_code=status.HTTP_201_CREATED)
async def register_model(
    request: RegisterRequest,
    current_user: str = Depends(get_current_user),
) -> ModelRecord:
    """Register a model's metadata. This does not load any weights."""
    try:
        return await asyncio.to_thread(create_model, DB_PATH, request)
    except ModelSourceError as error:
        message = str(error)
        code = (
            status.HTTP_409_CONFLICT
            if "already registered" in message
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=message) from error


@router.get("/{model_id}", response_model=ModelRecord)
async def read_model(
    model_id: str,
    current_user: str = Depends(get_current_user),
) -> ModelRecord:
    record = await asyncio.to_thread(get_model, DB_PATH, model_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found.")
    return record


@router.delete("/{model_id}", response_model=ModelRecord)
async def remove_model(
    model_id: str,
    current_user: str = Depends(get_current_user),
) -> ModelRecord:
    try:
        return await asyncio.to_thread(delete_model, DB_PATH, model_id)
    except KeyError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Model not found."
        ) from error
    except ModelSourceError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(error)
        ) from error
