import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from config.settings import settings
from database import connect_to_mongo, close_mongo_connection, get_database
from services.auth_service import hash_password
from services.websocket_manager import ws_manager

# Routers
from routers.auth import router as auth_router
from routers.cases import router as cases_router
from routers.devices import router as devices_router
from routers.telemetry import router as telemetry_router
from routers.evidence import router as evidence_router
from routers.custody import router as custody_router
from routers.audit import router as audit_router
from routers.reports import router as reports_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("tracex.main")

async def ensure_baseline_admin():
    """Ensure baseline admin account exists if no user accounts exist in the database."""
    db = get_database()
    if db is None:
        return

    try:
        user_count = await db.users.count_documents({})
        if user_count == 0:
            logger.info("Initializing baseline administrator account (admin@tracex.local)...")
            await db.users.insert_one({
                "user_id": "USR-ADMIN-001",
                "email": "admin@tracex.local",
                "password_hash": hash_password("TraceX@2026!"),
                "name": "Forensic System Administrator",
                "role": "ADMIN",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    except Exception as e:
        logger.warning(f"Baseline administrator verification deferred: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Project TraceX Backend Engine (Environment: {settings.ENVIRONMENT})...")
    try:
        await connect_to_mongo()
        await ensure_baseline_admin()
    except Exception as e:
        logger.error(f"Non-fatal error during lifespan startup: {e}")
    yield
    logger.info("Shutting down Project TraceX Backend Engine...")
    try:
        await close_mongo_connection()
    except Exception as e:
        logger.warning(f"Error during shutdown: {e}")

app = FastAPI(
    title="Project TraceX - Forensic Investigation Platform",
    description="Authorized digital evidence collection, cryptographic integrity verification, and tamper-evident chain of custody.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Security Configuration
configured_origins = settings.ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins if configured_origins else ["https://tracex.local"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Mount API Routers under /api/v1
app.include_router(auth_router, prefix="/api/v1")
app.include_router(cases_router, prefix="/api/v1")
app.include_router(devices_router, prefix="/api/v1")
app.include_router(telemetry_router, prefix="/api/v1")
app.include_router(evidence_router, prefix="/api/v1")
app.include_router(custody_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")

# Mount Dashboard Static Files
dashboard_dir = Path(__file__).resolve().parent.parent / "dashboard"
if dashboard_dir.exists():
    css_dir = dashboard_dir / "css"
    js_dir = dashboard_dir / "js"
    if css_dir.exists():
        app.mount("/css", StaticFiles(directory=str(css_dir)), name="css")
    if js_dir.exists():
        app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")
    app.mount("/dashboard", StaticFiles(directory=str(dashboard_dir), html=True), name="dashboard")

@app.get("/")
async def root():
    index_file = dashboard_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {
        "name": "Project TraceX - Digital Evidence Core",
        "status": "ONLINE",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "forensic_standards": ["ISO/IEC 27037", "NIST SP 800-86"],
        "docs": "/docs"
    }

@app.get("/health")
async def health():
    """Health check endpoint complying with production forensic monitoring standards."""
    db = get_database()
    db_status = "disconnected"
    if db is not None:
        try:
            await db.command("ping")
            db_status = "connected"
        except Exception:
            db_status = "disconnected"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "environment": settings.ENVIRONMENT
    }

@app.websocket("/ws/investigation")
async def websocket_investigation_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Welcome handshake
        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "event": "CONNECTION_ESTABLISHED",
            "message": "Connected to Project TraceX live forensic telemetry stream",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error: {e}")
        ws_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=False)
