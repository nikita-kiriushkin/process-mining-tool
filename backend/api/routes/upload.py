import uuid
import tempfile
import os

from fastapi import APIRouter, UploadFile, File, HTTPException

from api.schemas.upload import UploadResponse
from core.parser import parse_csv_preview

router = APIRouter()

# In-memory session store: session_id -> temp file path
# For MVP: files are kept in /tmp until process request
_sessions: dict[str, str] = {}


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Save to temp file
    suffix = ".csv"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(content)
        tmp.flush()
        tmp_path = tmp.name
    finally:
        tmp.close()

    try:
        preview = parse_csv_preview(tmp_path)
    except ValueError as e:
        os.unlink(tmp_path)
        raise HTTPException(status_code=422, detail=str(e))

    session_id = str(uuid.uuid4())
    _sessions[session_id] = tmp_path

    return UploadResponse(
        session_id=session_id,
        columns=preview["columns"],
        row_count=preview["row_count"],
        sample_rows=preview["sample_rows"],
    )


def get_session_path(session_id: str) -> str:
    path = _sessions.get(session_id)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Session not found or expired. Please re-upload.")
    return path
