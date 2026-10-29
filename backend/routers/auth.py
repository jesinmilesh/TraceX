import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends, Request
from database import get_database
from schemas.forensic_schemas import UserLogin, UserCreate, UserOut, Token
from services.auth_service import hash_password, verify_password, create_access_token, get_current_user, require_roles
from services.audit_service import log_audit_event

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, request: Request):
    db = get_database()
    user = await db.users.find_one({"email": credentials.email.lower().strip()})
    
    client_ip = request.client.host if request.client else "unknown"

    if not user or not verify_password(credentials.password, user.get("password_hash", "")):
        await log_audit_event(
            actor=credentials.email,
            role="UNKNOWN",
            action="LOGIN_FAILED",
            resource="/auth/login",
            ip_address=client_ip,
            details={"reason": "Invalid credentials"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    access_token = create_access_token(data={"sub": user["user_id"], "email": user["email"], "role": user["role"]})
    
    await log_audit_event(
        actor=user["email"],
        role=user["role"],
        action="LOGIN_SUCCESS",
        resource="/auth/login",
        ip_address=client_ip,
        details={"user_id": user["user_id"]}
    )

    user_out = UserOut(
        user_id=user["user_id"],
        email=user["email"],
        name=user.get("name", user["email"]),
        role=user.get("role", "INVESTIGATOR"),
        is_active=user.get("is_active", True),
        created_at=user.get("created_at", datetime.now(timezone.utc).isoformat())
    )

    return Token(access_token=access_token, token_type="bearer", user=user_out)

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
