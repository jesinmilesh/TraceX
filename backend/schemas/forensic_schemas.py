from typing import Optional, Any, List
from pydantic import BaseModel, EmailStr, Field

# ----------------- User & Authentication -----------------
class UserLogin(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "INVESTIGATOR" # ADMIN, INVESTIGATOR, ANALYST, VIEWER

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    is_active: bool = True
    created_at: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# ----------------- Case Management -----------------
class CaseCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = ""

class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None # OPEN, ACTIVE, ON_HOLD, CLOSED, ARCHIVED

class CaseOut(BaseModel):
    case_id: str
    case_number: str
    title: str
    description: str
    status: str
    investigator: str
    created_at: str
    updated_at: str
    device_count: int = 0
    evidence_count: int = 0
    telemetry_count: int = 0

# ----------------- Device Management -----------------
# ----------------- Device Management -----------------
class DeviceRegister(BaseModel):
    case_id: str
    device_model: str
    android_version: str
    app_version: str = "1.0.0"
    device_id: Optional[str] = None

class DeviceOut(BaseModel):
    device_id: str
    case_id: str
    device_model: str
    android_version: str
    app_version: str
    status: str # ONLINE, OFFLINE, LOCATION_STALE, COLLECTION_ACTIVE, COLLECTION_STOPPED, PENDING_APPROVAL, REVOKED
    registered_at: str
    last_seen: str
    battery_level: Optional[int] = 100
    network_state: Optional[str] = "WIFI"

# ----------------- Collection Session Management -----------------
class CollectionSessionStart(BaseModel):
    case_id: str
    device_id: str
    permissions_at_start: Optional[List[str]] = []

class CollectionSessionOut(BaseModel):
    session_id: str
    case_id: str
    device_id: str
    started_at: str
    ended_at: Optional[str] = None
    started_by: str
    ended_by: Optional[str] = None
    status: str # ACTIVE, COMPLETED, REVOKED
    permissions_at_start: List[str] = []

# ----------------- Telemetry Ingestion -----------------
class CallLogItem(BaseModel):
    phone_number: str
    call_type: str = "INCOMING" # INCOMING, OUTGOING, MISSED
    date: int
    duration_seconds: int = 0
    call_event_id: Optional[str] = None

class MessageItem(BaseModel):
    sender: str
    body: str
    date: int
    msg_type: str = "INCOMING" # INCOMING, OUTGOING
    message_id: Optional[str] = None

class TelemetryIngest(BaseModel):
    case_id: str
    device_id: str
    session_id: str
    timestamp: int
    latitude: float
    longitude: float
    event_type: str = "LOCATION_UPDATE"
    accuracy: Optional[float] = 0.0
    speed: Optional[float] = 0.0
    altitude: Optional[float] = 0.0
    bearing: Optional[float] = 0.0
    battery_level: Optional[int] = 100
    network_state: Optional[str] = "WIFI"
    call_logs: Optional[List[CallLogItem]] = []
    messages: Optional[List[MessageItem]] = []

class TelemetryEventOut(BaseModel):
    event_id: str
    case_id: str
    device_id: str
    session_id: str
    timestamp: int
    latitude: float
    longitude: float
    event_type: str
    accuracy: float
    speed: Optional[float] = 0.0
    altitude: Optional[float] = 0.0
    bearing: Optional[float] = 0.0
    evidence_hash: str
    received_at: str

# ----------------- Evidence Vault -----------------
class EvidenceOut(BaseModel):
    evidence_id: str
    case_id: str
    original_filename: str
    stored_filename: str
    mime_type: str
    file_size: int
    sha256: str
    uploaded_by: str
    uploaded_at: str
    status: str

class EvidenceVerifyResult(BaseModel):
    evidence_id: str
    filename: str
    original_sha256: str
    current_sha256: str
    status: str # INTEGRITY VERIFIED, INTEGRITY MISMATCH
    verified_at: str
    verified_by: str

# ----------------- Chain of Custody -----------------
class CustodyEntryOut(BaseModel):
    custody_id: str
    evidence_id: str
    case_id: str
    action: str
    actor: str
    description: str
    previous_event_hash: str
    event_hash: str
    timestamp: str

# ----------------- Audit Logs -----------------
class AuditLogOut(BaseModel):
    audit_id: str
    case_id: Optional[str] = None
    actor: str
    role: str
    action: str
    resource: str
    ip_address: Optional[str] = ""
    timestamp: str
    details: Optional[dict] = {}
