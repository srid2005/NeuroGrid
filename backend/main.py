"""
NeuroGrid — FastAPI Backend
Phase 1: Skeleton (frontend uses localStorage)
Phase 3: This will replace localStorage with PostgreSQL
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from routers import auth, subjects, concepts, links

app = FastAPI(
    title="NeuroGrid API",
    description="GATE CS Concept Knowledge Graph Backend",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────
app.include_router(auth.router,     prefix="/api/auth",     tags=["Auth"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["Subjects"])
app.include_router(concepts.router, prefix="/api/concepts", tags=["Concepts"])
app.include_router(links.router,    prefix="/api/links",    tags=["Links"])

# ── Serve frontend (Phase 3 — uncomment when backend ready) ──
# app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

# ── Health check ──────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
