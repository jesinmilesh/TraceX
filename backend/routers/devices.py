import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from database import get_database
from pymongo import ReturnDocument
from schemas.forensic_schemas import (
    DeviceRegister,
    DeviceOut,
    CollectionSessionStart,
    CollectionSessionOut
)
from services.auth_service import get_current_user, require_roles
from services.audit_service import log_audit_event
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/devices", tags=["Device Enrollment & Tracking"])

def compute_effective_status(status: str, last_seen_iso: str) -> str:
    """Evaluate device status against real-time heartbeat freshness."""
    if status in ["REVOKED", "SUSPENDED", "PENDING_APPROVAL"]:
        return status
    if not last_seen_iso:
        return "OFFLINE"
    try:
        last_dt = datetime.fromisoformat(last_seen_iso.replace("Z", "+00:00"))
        delta_sec = (datetime.now(timezone.utc) - last_dt).total_seconds()
        if delta_sec > 180:
            return "OFFLINE"
        elif delta_sec > 45:
            return "LOCATION_STALE"
        return "ONLINE" if status in ["ACTIVE", "ONLINE"] else status
    except Exception:
        return status

@router.post("/register", response_model=DeviceOut)
async def register_device(device_in: DeviceRegister, request: Request):
    db = get_database()
    req_case_id = (device_in.case_id or "").strip()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Case association: find requested case or active case, or atomically create CASE-001
    case = None
    if req_case_id:
        case = await db.cases.find_one({"case_id": req_case_id})
        if not case:
            case = await db.cases.find_one({"case_id": {"$regex": f"^{req_case_id}$", "$options": "i"}})
    
    if not case:
        case = await db.cases.find_one({"status": "ACTIVE"})
        if case:
            req_case_id = case["case_id"]
        else:
            case_counter = await db.counters.find_one_and_update(
                {"_id": "case_sequence"},
                {"$inc": {"sequence": 1}},
                upsert=True,
                return_document=ReturnDocument.AFTER
            )
            case_seq_str = f"{case_counter.get('sequence', 1):03d}"
            req_case_id = f"CASE-{case_seq_str}"
            case_number = f"TRACEX-{datetime.now(timezone.utc).year}-{case_seq_str}"
            await db.cases.insert_one({
                "case_id": req_case_id,
                "case_number": case_number,
                "title": "Authorized Digital Evidence Monitoring",
                "description": "Baseline case for authorized evidence capture and forensics.",
                "status": "ACTIVE",
                "created_at": now_iso,
                "updated_at": now_iso
            })

    candidate_id = (device_in.device_id or "").strip()
    client_uuid = (device_in.client_uuid or candidate_id or "").strip()

    # Check for existing device to prevent duplicate assignment on reinstall or reconnect
    existing = None
    if candidate_id and candidate_id.upper() not in ["NEW", "UNREGISTERED", "NONE"]:
        existing = await db.devices.find_one({"device_id": candidate_id})
    if not existing and client_uuid:
        existing = await db.devices.find_one({"client_uuid": client_uuid})

    if existing:
        device_id = existing["device_id"]
        device_number = existing.get("device_number") or device_id.replace("DEV-", "")
        update_data = {
            "case_id": req_case_id,
            "device_model": device_in.device_model,
            "android_version": device_in.android_version,
            "app_version": device_in.app_version,
            "last_seen": now_iso,
            "status": "ONLINE"
        }
        if client_uuid:
            update_data["client_uuid"] = client_uuid
        await db.devices.update_one({"device_id": device_id}, {"$set": update_data})
        doc = await db.devices.find_one({"device_id": device_id})
    else:
        # Genuinely new device: assign server-side atomic sequential numbering (001, 002, 003...)
        dev_counter = await db.counters.find_one_and_update(
            {"_id": "device_sequence"},
            {"$inc": {"sequence": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER
        )
        seq_num = dev_counter.get("sequence", 1)
        device_number = f"{seq_num:03d}"
        device_id = f"DEV-{device_number}"

        doc = {
            "device_id": device_id,
            "device_number": device_number,
            "client_uuid": client_uuid or device_id,
            "case_id": req_case_id,
            "device_model": device_in.device_model,
            "android_version": device_in.android_version,
            "app_version": device_in.app_version,
            "status": "ONLINE",
            "registered_at": now_iso,
            "last_seen": now_iso,
            "battery_level": 100,
            "network_state": "WIFI"
        }
        await db.devices.insert_one(doc)

    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=f"device:{device_id}",
        role="DEVICE_CLIENT",
        action="DEVICE_REGISTERED",
        resource=f"/devices/{device_id}",
        case_id=req_case_id,
        ip_address=client_ip,
        details={
            "device_number": device_number,
            "device_model": device_in.device_model,
            "android_version": device_in.android_version,
            "app_version": device_in.app_version
        }
    )

    await ws_manager.broadcast_event(
        event="DEVICE_STATUS_CHANGED",
        device_id=device_id,
        case_id=req_case_id,
        data={"status": "ONLINE", "last_seen": now_iso, "device_number": device_number}
    )

    return DeviceOut(
        device_id=doc["device_id"],
        device_number=doc.get("device_number", device_number),
        case_id=doc["case_id"],
        device_model=doc["device_model"],
        android_version=doc["android_version"],
        app_version=doc["app_version"],
        status=compute_effective_status(doc.get("status", "ONLINE"), now_iso),
        registered_at=doc.get("registered_at", now_iso),
        last_seen=doc.get("last_seen", now_iso),
        battery_level=doc.get("battery_level", 100),
        network_state=doc.get("network_state", "WIFI")
    )

@router.get("", response_model=List[DeviceOut])
async def list_devices(
    case_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    query = {}
    if case_id:
        query["case_id"] = case_id
    cursor = db.devices.find(query).sort("last_seen", -1)
    devices = await cursor.to_list(length=200)

    result = []
    for d in devices:
        eff_status = compute_effective_status(d.get("status", "ONLINE"), d.get("last_seen", ""))
        result.append(
            DeviceOut(
                device_id=d["device_id"],
                device_number=d.get("device_number"),
                case_id=d["case_id"],
                device_model=d.get("device_model", "Unknown"),
                android_version=d.get("android_version", "Android"),
                app_version=d.get("app_version", "1.0.0"),
                status=eff_status,
                registered_at=d.get("registered_at", ""),
                last_seen=d.get("last_seen", ""),
                battery_level=d.get("battery_level", 100),
                network_state=d.get("network_state", "WIFI")
            )
        )
    return result

@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(device_id: str, current_user: dict = Depends(get_current_user)):
    db = get_database()
    d = await db.devices.find_one({"device_id": device_id})
    if not d:
        raise HTTPException(status_code=404, detail="Device not found")

    eff_status = compute_effective_status(d.get("status", "ONLINE"), d.get("last_seen", ""))
    return DeviceOut(
        device_id=d["device_id"],
        device_number=d.get("device_number"),
        case_id=d["case_id"],
        device_model=d.get("device_model", "Unknown"),
        android_version=d.get("android_version", "Android"),
        app_version=d.get("app_version", "1.0.0"),
        status=eff_status,
        registered_at=d.get("registered_at", ""),
        last_seen=d.get("last_seen", ""),
        battery_level=d.get("battery_level", 100),
        network_state=d.get("network_state", "WIFI")
    )

@router.get("/{device_id}/locations")
@router.get("/{device_id}/location-history")
async def get_device_location_history(
    device_id: str,
    case_id: Optional[str] = Query(None),
    start_time: Optional[int] = Query(None, description="Start timestamp in ms or seconds"),
    end_time: Optional[int] = Query(None, description="End timestamp in ms or seconds"),
    limit: int = Query(500, ge=1, le=2000),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve chronologically ordered authorized GPS telemetry points for live map movement trail."""
    db = get_database()
    query = {"device_id": device_id}
    if case_id:
        query["case_id"] = case_id

    # Handle timestamp ranges (converting seconds to ms if necessary)
    if start_time is not None or end_time is not None:
        time_query = {}
        if start_time is not None:
            time_query["$gte"] = start_time
        if end_time is not None:
            time_query["$lte"] = end_time
        query["timestamp"] = time_query

    # Fetch ordered chronologically (oldest to newest for smooth movement paths)
    cursor = db.telemetry_events.find(query, {"_id": 0}).sort("timestamp", 1).limit(limit)
    events = await cursor.to_list(length=limit)

    return {
        "device_id": device_id,
        "case_id": case_id,
        "count": len(events),
        "history": events
    }

# ----------------- Collection Sessions Management -----------------
@router.post("/{device_id}/collection/start", response_model=CollectionSessionOut)
async def start_collection_session(
    device_id: str,
    payload: CollectionSessionStart,
    request: Request
):
    db = get_database()
    now_iso = datetime.now(timezone.utc).isoformat()
    session_id = f"SESS-{uuid.uuid4().hex[:10].upper()}"

    session_doc = {
        "session_id": session_id,
        "case_id": payload.case_id,
        "device_id": device_id,
        "started_at": now_iso,
        "ended_at": None,
        "started_by": f"device:{device_id}",
        "ended_by": None,
        "status": "ACTIVE",
        "permissions_at_start": payload.permissions_at_start or []
    }
    await db.collection_sessions.insert_one(session_doc)

    await db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"status": "COLLECTION_ACTIVE", "last_seen": now_iso}}
    )

    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=f"device:{device_id}",
        role="DEVICE_CLIENT",
        action="COLLECTION_STARTED",
        resource=f"/devices/{device_id}/sessions/{session_id}",
        case_id=payload.case_id,
        ip_address=client_ip,
        details={"session_id": session_id, "permissions": payload.permissions_at_start}
    )

    await ws_manager.broadcast_event(
        event="COLLECTION_STARTED",
        device_id=device_id,
        case_id=payload.case_id,
        data={"session_id": session_id, "started_at": now_iso}
    )

    return CollectionSessionOut(**session_doc)

@router.post("/{device_id}/collection/stop")
async def stop_collection_session(
    device_id: str,
    request: Request,
    session_id: Optional[str] = Query(None)
):
    db = get_database()
    now_iso = datetime.now(timezone.utc).isoformat()

    query = {"device_id": device_id, "status": "ACTIVE"}
    if session_id:
        query["session_id"] = session_id

    active_session = await db.collection_sessions.find_one(query)
    case_id = active_session.get("case_id", "CASE-2026-001") if active_session else "CASE-2026-001"
    cur_sess_id = active_session["session_id"] if active_session else (session_id or "UNKNOWN")

    await db.collection_sessions.update_many(
        {"device_id": device_id, "status": "ACTIVE"},
        {"$set": {"ended_at": now_iso, "status": "COMPLETED", "ended_by": f"device:{device_id}"}}
    )

    await db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"status": "COLLECTION_STOPPED", "last_seen": now_iso}}
    )

    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=f"device:{device_id}",
        role="DEVICE_CLIENT",
        action="COLLECTION_STOPPED",
        resource=f"/devices/{device_id}/sessions/{cur_sess_id}",
        case_id=case_id,
        ip_address=client_ip,
        details={"session_id": cur_sess_id, "stopped_at": now_iso}
    )

    await ws_manager.broadcast_event(
        event="COLLECTION_STOPPED",
        device_id=device_id,
        case_id=case_id,
        data={"session_id": cur_sess_id, "stopped_at": now_iso}
    )

    return {
        "message": "Collection session terminated cleanly",
        "device_id": device_id,
        "session_id": cur_sess_id,
        "ended_at": now_iso
    }

@router.patch("/{device_id}/status")
async def update_device_status(
    device_id: str,
    status_update: dict,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN", "INVESTIGATOR"]))
):
    db = get_database()
    new_status = status_update.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status is required")

    res = await db.devices.update_one({"device_id": device_id}, {"$set": {"status": new_status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")

    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=current_user["email"],
        role=current_user["role"],
        action="UPDATE_DEVICE_STATUS",
        resource=f"/devices/{device_id}",
        ip_address=client_ip,
        details={"status": new_status}
    )

    device_doc = await db.devices.find_one({"device_id": device_id})
    case_id = device_doc.get("case_id", "") if device_doc else ""

    await ws_manager.broadcast_event(
        event="DEVICE_STATUS_CHANGED",
        device_id=device_id,
        case_id=case_id,
        data={"status": new_status}
    )

    return {"message": "Device status updated", "device_id": device_id, "status": new_status}
