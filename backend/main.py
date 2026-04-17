from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import upload, process

app = FastAPI(
    title="Process Mining Tool",
    description="API for interactive process mining from event logs",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(process.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
