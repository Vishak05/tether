"""
Tether Agent — File Quick-Send (watched-folder convention)

Not literal drag-and-drop (that would need a laptop-side tray/GUI app this
project doesn't have) — instead, two plain folders:

  ~/Tether Outbox/   drop files here on the laptop; the phone can list and
                      download them via GET /files/outbox[/…/download].
  ~/Tether Inbox/    files the phone uploads via POST /files/inbox land here.

Filenames double as the public "file_id" — the only real security-sensitive
piece is making sure a requested name can't escape its folder (path
traversal), so every lookup resolves the path and checks it's still a direct
child of the expected directory before touching the filesystem.
"""
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from agent.core import auth, db
from agent.core.config import INBOX_DIR, MAX_UPLOAD_MB, OUTBOX_DIR
from agent.core.logging import get_logger

router = APIRouter(prefix="/files", tags=["files"])
log = get_logger("tether.files")

_MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
_UNSAFE_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


class FileEntry(BaseModel):
    id: str
    name: str
    size_bytes: int
    modified_at: float


class FileListResponse(BaseModel):
    files: list[FileEntry]


def _list_dir(directory: Path) -> FileListResponse:
    entries = []
    for p in sorted(directory.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
        if not p.is_file():
            continue
        stat = p.stat()
        entries.append(FileEntry(id=p.name, name=p.name, size_bytes=stat.st_size, modified_at=stat.st_mtime))
    return FileListResponse(files=entries)


def _resolve_safe(directory: Path, file_id: str) -> Path:
    """Resolve file_id to a path guaranteed to be a direct child of directory."""
    candidate = (directory / file_id).resolve()
    if candidate.parent != directory.resolve() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return candidate


def _sanitize_filename(name: str) -> str:
    name = _UNSAFE_CHARS.sub("_", name).strip().strip(".")
    return name or "unnamed"


def _unique_path(directory: Path, filename: str) -> Path:
    candidate = directory / filename
    if not candidate.exists():
        return candidate
    stem, suffix = Path(filename).stem, Path(filename).suffix
    n = 1
    while True:
        candidate = directory / f"{stem} ({n}){suffix}"
        if not candidate.exists():
            return candidate
        n += 1


# ── outbox: laptop → phone ─────────────────────────────────────────────────────

@router.get("/outbox", response_model=FileListResponse, summary="List files available to download")
async def list_outbox(device_id: str = Depends(auth.require_auth)) -> FileListResponse:
    return _list_dir(OUTBOX_DIR)


@router.get("/outbox/{file_id}/download", summary="Download a file from the outbox")
async def download_outbox_file(
    file_id: str,
    request: Request,
    device_id: str = Depends(auth.require_auth),
) -> FileResponse:
    path = _resolve_safe(OUTBOX_DIR, file_id)
    db.log_command(
        device_id=device_id,
        action="file_download",
        source_ip=request.client.host if request.client else "unknown",
        ok=True,
    )
    log.info("file downloaded", extra={"device_id": device_id, "file": path.name})
    return FileResponse(path, filename=path.name)


# ── inbox: phone → laptop ──────────────────────────────────────────────────────

@router.get("/inbox", response_model=FileListResponse, summary="List files received from the phone")
async def list_inbox(device_id: str = Depends(auth.require_auth)) -> FileListResponse:
    return _list_dir(INBOX_DIR)


@router.post("/inbox", response_model=FileEntry, summary="Upload a file to the laptop")
async def upload_to_inbox(
    request: Request,
    file: UploadFile,
    device_id: str = Depends(auth.require_auth),
) -> FileEntry:
    safe_name = _sanitize_filename(file.filename or "unnamed")
    dest = _unique_path(INBOX_DIR, safe_name)

    total = 0
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > _MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_MB} MB limit")
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        db.log_command(
            device_id=device_id, action="file_upload",
            source_ip=request.client.host if request.client else "unknown",
            ok=False, error=f"exceeds {MAX_UPLOAD_MB} MB limit",
        )
        raise

    db.log_command(
        device_id=device_id,
        action="file_upload",
        source_ip=request.client.host if request.client else "unknown",
        ok=True,
    )
    log.info("file uploaded", extra={"device_id": device_id, "file": dest.name, "size_bytes": total})

    stat = dest.stat()
    return FileEntry(id=dest.name, name=dest.name, size_bytes=stat.st_size, modified_at=stat.st_mtime)
