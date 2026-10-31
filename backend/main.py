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
from routers.config import router as config_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("tracex.main")

async def ensure_baseline_admin():
    """Ensure baseline administrator exists using server-side environment credentials (fail-safe)."""
    db = get_database()
    if db is None:
        return

    admin_username = settings.TRACEX_ADMIN_USERNAME.strip().lower()
    admin_hash = settings.TRACEX_ADMIN_PASSWORD_HASH.strip()
    admin_plaintext = settings.TRACEX_ADMIN_PASSWORD.strip()

    if not admin_username or (not admin_hash and not admin_plaintext):
        logger.info("[AUTH] TRACEX_ADMIN_USERNAME or TRACEX_ADMIN_PASSWORD_HASH not configured in environment. Admin baseline creation deferred (fail-safe).")
        return

    if not admin_hash and admin_plaintext:
        admin_hash = hash_password(admin_plaintext)

    try:
        existing_admin = await db.users.find_one({"email": admin_username})
        if not existing_admin:
            logger.info(f"Provisioning authorized administrator account ({admin_username}) from environment configuration...")
            await db.users.insert_one({
                "user_id": "USR-ADMIN-001",
                "email": admin_username,
                "password_hash": admin_hash,
                "name": "Forensic System Administrator",
                "role": "ADMIN",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        else:
            # Sync password hash if updated in deployment environment
            await db.users.update_one(
                {"email": admin_username},
                {"$set": {"password_hash": admin_hash, "role": "ADMIN", "is_active": True}}
            )
    except Exception as e:
        logger.warning(f"Baseline administrator verification deferred: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Project TraceX Backend Engine (Environment: {settings.ENVIRONMENT})...")
    issues = settings.validate_production_readiness()
    if issues:
        for issue in issues:
            logger.warning(f"[CONFIG] Production check note: {issue}")
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

# CORS Security Configuration — Whitelisted from ALLOWED_ORIGINS Environment Variable
# Strict origin isolation: never uses allow_origins=["*"]
cors_origins = settings.ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https://tracex.*\.vercel\.app$" if settings.is_production() else None,
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
app.include_router(config_router, prefix="/api/v1")

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
@app.get("/api/v1/health")
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

from jose import jwt, JWTError

@app.websocket("/ws/investigation")
async def websocket_investigation_endpoint(websocket: WebSocket, token: str = None):
    auth_token = token or websocket.query_params.get("token")
    user_id = None
    user_role = None

    if auth_token:
        try:
            payload = jwt.decode(auth_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("sub")
            user_role = payload.get("role", "INVESTIGATOR")
        except JWTError:
            pass

    if not user_id:
        await websocket.accept()
        try:
            import json, asyncio
            raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=4.0)
            data = json.loads(raw_msg)
            if data.get("type") == "AUTHENTICATE" and data.get("token"):
                payload = jwt.decode(data["token"], settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
                user_id = payload.get("sub")
                user_role = payload.get("role", "INVESTIGATOR")
        except Exception:
            pass

        if not user_id:
            try:
                await websocket.send_json({
                    "type": "AUTH_ERROR",
                    "message": "Authentication required. Provide valid JWT token to subscribe to live forensic telemetry."
                })
                await websocket.close(code=1008)
            except Exception:
                pass
            return
    else:
        await ws_manager.connect(websocket)

    try:
        # Welcome handshake
        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "event": "CONNECTION_ESTABLISHED",
            "authenticated": True,
            "user_id": user_id,
            "role": user_role,
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
