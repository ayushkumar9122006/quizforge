"""
QuizForge — FastAPI Application Entry Point
Block 1: Database, Models, CRUD
Block 2: JWT Auth, Quiz/Session APIs, LLM
Block 3: WebSockets — real-time leaderboard, room events
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from database.config import init_db, settings
from routers import auth, quiz, session, llm, notice
from routers import ws as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


# Ensure upload directories exist BEFORE StaticFiles mounts below — StaticFiles
# checks the directory exists at import time, which runs before the lifespan
# startup handler above ever gets a chance to run.
os.makedirs(f"{settings.upload_dir}/question_images", exist_ok=True)
os.makedirs(f"{settings.upload_dir}/diagrams", exist_ok=True)

app = FastAPI(
    title="QuiZee API",
    description="AI-powered Quiz Platform with real-time WebSockets",
    version="3.0.0",
    lifespan=lifespan,
)

# ── CORS — allow configured frontend origins and localhost ────────────────────
cors_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:80",
    "http://localhost",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
]
if settings.frontend_url:
    for u in settings.frontend_url.split(","):
        clean = u.strip().rstrip("/")
        if clean and clean not in cors_origins:
            cors_origins.append(clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static uploads ─────────────────────────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# ── HTTP routers ──────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(quiz.router)
app.include_router(session.router)
app.include_router(llm.router)
app.include_router(notice.router)

# ── WebSocket router ──────────────────────────────────────────────────────────
app.include_router(ws_router.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "3.0.0",
        "model": settings.openrouter_model,
    }
