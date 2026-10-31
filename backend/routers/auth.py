import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends, Request
from database import get_database
from schemas.forensic_schemas import UserLogin, UserCreate, UserOut, Token
from config.settings import settings
from services.auth_service import hash_password, verify_password, create_access_token, get_current_user, require_roles
from services.audit_service import log_audit_event

from services.rate_limiter import login_rate_limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, request: Request):
    db = get_database()
    input_ident = (credentials.email or credentials.username or "").lower().strip()
    client_ip = request.client.host if request.client else "unknown"

    if not input_ident or not credentials.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email and password are required"
        )

    # Brute-force rate limiting protection
    is_limited, cooldown = login_rate_limiter.is_rate_limited(client_ip, input_ident)
    if is_limited:
        await log_audit_event(
            actor=input_ident,
            role="UNKNOWN",
            action="LOGIN_RATE_LIMITED",
            resource="/auth/login",
            ip_address=client_ip,
            details={"reason": "Excessive failed attempts", "cooldown_seconds": cooldown}
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait and try again."
        )

    # Fail closed if production admin credentials missing and no active users
    admin_env_user = settings.TRACEX_ADMIN_USERNAME.lower().strip()
    admin_env_hash = settings.TRACEX_ADMIN_PASSWORD_HASH.strip()
    admin_env_plain = settings.TRACEX_ADMIN_PASSWORD.strip()

    user = None
    if db is not None:
        user = await db.users.find_one({"$or": [{"email": input_ident}, {"username": input_ident}]})

    authenticated = False
    user_role = "INVESTIGATOR"
    user_id = ""
    user_name = input_ident

    # Check against environment configured admin credentials
    is_admin_match = admin_env_user and (
        input_ident == admin_env_user or 
        input_ident == "admin" or 
        (admin_env_user.startswith("admin@") and input_ident == admin_env_user.split("@")[0])
    )
    if is_admin_match:
        if admin_env_hash and verify_password(credentials.password, admin_env_hash):
            authenticated = True
        elif admin_env_plain and credentials.password == admin_env_plain:
            authenticated = True
        
        if authenticated:
            user_role = "ADMIN"
            user_id = user.get("user_id", "USR-ADMIN-001") if user else "USR-ADMIN-001"
            user_name = user.get("name", "Forensic System Administrator") if user else "Forensic System Administrator"
            # Ensure persisted in db
            if db is not None and not user:
                hashed = admin_env_hash or hash_password(admin_env_plain)
                user = {
                    "user_id": user_id,
                    "email": admin_env_user,
                    "password_hash": hashed,
                    "name": user_name,
                    "role": user_role,
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.users.insert_one(user)

    # If not authenticated via direct env admin, check database record
    if not authenticated and user:
        if verify_password(credentials.password, user.get("password_hash", "")):
            authenticated = True
            user_role = user.get("role", "INVESTIGATOR")
            user_id = user["user_id"]
            user_name = user.get("name", user["email"])

    if not authenticated:
        login_rate_limiter.record_failure(client_ip, input_ident)
        await log_audit_event(
            actor=input_ident,
            role="UNKNOWN",
            action="LOGIN_FAILED",
            resource="/auth/login",
            ip_address=client_ip,
            details={"reason": "Invalid credentials"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user and not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Reset rate limiting on successful login
    login_rate_limiter.record_success(client_ip, input_ident)

    actual_email = user.get("email", input_ident) if user else input_ident
    access_token = create_access_token(data={"sub": user_id, "email": actual_email, "role": user_role})
    
    await log_audit_event(
        actor=actual_email,
        role=user_role,
        action="LOGIN_SUCCESS",
        resource="/auth/login",
        ip_address=client_ip,
        details={"user_id": user_id}
    )

    user_out = UserOut(
        user_id=user["user_id"] if user else user_id,
        email=actual_email,
        name=user.get("name", user_name) if user else user_name,
        role=user.get("role", user_role) if user else user_role,
        is_active=user.get("is_active", True) if user else True,
        created_at=user.get("created_at", datetime.now(timezone.utc).isoformat()) if user else datetime.now(timezone.utc).isoformat()
    )

    return Token(access_token=access_token, token_type="bearer", user=user_out)

@router.post("/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=current_user.get("email", "unknown"),
        role=current_user.get("role", "INVESTIGATOR"),
        action="LOGOUT",
        resource="/auth/logout",
        ip_address=client_ip,
        details={"user_id": current_user.get("user_id")}
    )
    return {"message": "Logged out successfully", "status": "LOGOUT_SUCCESS"}

@router.get("/me", response_model=UserOut)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserOut(
        user_id=current_user["user_id"],
        email=current_user["email"],
        name=current_user.get("name", current_user["email"]),
        role=current_user.get("role", "INVESTIGATOR"),
        is_active=current_user.get("is_active", True),
        created_at=current_user.get("created_at", datetime.now(timezone.utc).isoformat())
    )

@router.post("/register", response_model=UserOut)
async def register_user(
    user_in: UserCreate,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    db = get_database()
    existing = await db.users.find_one({"email": user_in.email.lower().strip()})
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered")

    new_user_id = f"USR-{uuid.uuid4().hex[:8].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "user_id": new_user_id,
        "email": user_in.email.lower().strip(),
        "password_hash": hash_password(user_in.password),
        "name": user_in.name,
        "role": user_in.role.upper(),
        "is_active": True,
        "created_at": now_iso
    }

    await db.users.insert_one(doc)

    await log_audit_event(
        actor=current_user["email"],
        role=current_user["role"],
        action="CREATE_USER",
        resource=f"/users/{new_user_id}",
        details={"created_email": doc["email"], "role": doc["role"]}
    )

    return UserOut(
        user_id=doc["user_id"],
        email=doc["email"],
        name=doc["name"],
        role=doc["role"],
        is_active=True,
        created_at=now_iso
    )
