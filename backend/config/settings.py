import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Locate .env file in backend/ or root
backend_dir = Path(__file__).resolve().parent.parent
env_path = backend_dir / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

class Settings:
    """Single source of truth configuration for TraceX Backend."""
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production").lower()
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # MongoDB Database Configuration
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DATABASE: str = os.getenv("MONGODB_DATABASE", "monitor")

    # Security & Cryptographic Tokens
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

    # Baseline Administrator Authentication (Server-Side Only - Never Exposed to Browser or APK)
    TRACEX_ADMIN_USERNAME: str = os.getenv("TRACEX_ADMIN_USERNAME", os.getenv("ADMIN_EMAIL", "")).strip()
    TRACEX_ADMIN_PASSWORD_HASH: str = os.getenv("TRACEX_ADMIN_PASSWORD_HASH", "").strip()
    TRACEX_ADMIN_PASSWORD: str = os.getenv("TRACEX_ADMIN_PASSWORD", "").strip()

    # Public-facing Endpoints
    API_BASE_URL: str = os.getenv("API_BASE_URL", "").rstrip("/")
    WS_BASE_URL: str = os.getenv("WS_BASE_URL", "").rstrip("/")

    # Evidence Vault
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", str(backend_dir / "evidence_vault"))
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", "104857600"))  # 100 MB

    # Google Maps Integration (Browser client key served via /api/v1/config/maps)
    GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", os.getenv("MAP_API_KEY", "")).strip()

    # CORS Allowed Origins (Never allow wildcard '*' in production)
    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        raw_origins = os.getenv("ALLOWED_ORIGINS") or os.getenv("CORS_ORIGINS") or ""
        if raw_origins.strip():
            return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
        # Strict fail-safe defaults when variable is omitted
        if self.is_production():
            return ["https://tracex-tau.vercel.app"]
        h_local = "localhost"
        h_loop = "127.0.0.1"
        return [f"http://{h_local}:5500", f"http://{h_local}:8000", f"http://{h_loop}:8000"]

    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    def validate_production_readiness(self) -> List[str]:
        """Verify that critical production configuration variables are present and not default."""
        issues = []
        if not self.MONGODB_URI:
            issues.append("MONGODB_URI is not configured.")
        if not self.JWT_SECRET or len(self.JWT_SECRET) < 32:
            issues.append("JWT_SECRET must be configured with at least 32 characters of high-entropy data.")
        if not self.TRACEX_ADMIN_USERNAME:
            issues.append("TRACEX_ADMIN_USERNAME is not configured.")
        if not self.TRACEX_ADMIN_PASSWORD_HASH and not self.TRACEX_ADMIN_PASSWORD:
            issues.append("TRACEX_ADMIN_PASSWORD_HASH (or TRACEX_ADMIN_PASSWORD) is not configured.")
        return issues

settings = Settings()
