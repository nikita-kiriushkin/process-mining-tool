from pydantic import BaseModel


class UploadResponse(BaseModel):
    session_id: str
    columns: list[str]
    row_count: int
    sample_rows: list[dict]
