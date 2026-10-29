import hashlib
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from database import get_database
from schemas.forensic_schemas import TelemetryIngest, TelemetryEventOut
from services.hashing import calculate_telemetry_hash
from services.audit_service import log_audit_event
from services.websocket_manager import ws_manager
from services.auth_service import get_current_user

router = APIRouter(prefix="/telemetry", tags=["Telemetry Ingestion & Streaming"])

def generate_call_id(device_id: str, phone_number: str, date: int) -> str:
    """Generate a stable, deterministic event ID for idempotent call log deduplication."""
    h = hashlib.sha256(f"{device_id}:{phone_number}:{date}".encode()).hexdigest()[:12].upper()
    return f"CAL-{h}"

def generate_msg_id(device_id: str, sender: str, date: int) -> str:
    """Generate a stable, deterministic event ID for idempotent SMS message deduplication."""
    h = hashlib.sha256(f"{device_id}:{sender}:{date}".encode()).hexdigest()[:12].upper()
    return f"MSG-{h}"

@router.post("/ingest", response_model=TelemetryEventOut)
async def ingest_telemetry(payload: TelemetryIngest, request: Request):
    db = get_database()

    # Validate or fallback case existence
    req_case_id = (payload.case_id or "CASE-2026-001").strip()
    case = await db.cases.find_one({"case_id": req_case_id})
    if not case:
        case = await db.cases.find_one({"case_id": {"$regex": f"^{req_case_id}$", "$options": "i"}})
    if not case:
        case = await db.cases.find_one({"status": "ACTIVE"})
        if case:
            req_case_id = case["case_id"]
        else:
            req_case_id = "CASE-2026-001"

    now_iso = datetime.now(timezone.utc).isoformat()

    # Update device heartbeat and operational metrics
    device_update = {
        "case_id": req_case_id,
        "last_seen": now_iso,
        "status": "ONLINE"
    }
    if payload.battery_level is not None:
        device_update["battery_level"] = payload.battery_level
    if payload.network_state:
        device_update["network_state"] = payload.network_state

    await db.devices.update_one(
        {"device_id": payload.device_id},
        {"$set": device_update},
        upsert=True
    )

    # Ingest Call Logs if present (incremental, deduplicated via call_event_id)
    if payload.call_logs:
        new_calls_count = 0
        for call in payload.call_logs:
            call_event_id = call.call_event_id or generate_call_id(payload.device_id, call.phone_number, call.date)
            call_doc = {
                "call_event_id": call_event_id,
                "call_id": call_event_id,
                "case_id": req_case_id,
                "device_id": payload.device_id,
                "session_id": payload.session_id,
                "phone_number": call.phone_number,
                "call_type": call.call_type,
                "date": call.date,
                "duration_seconds": call.duration_seconds,
                "recorded_at": now_iso
            }
            res = await db.call_logs.update_one(
                {"call_event_id": call_event_id},
                {"$setOnInsert": call_doc},
                upsert=True
            )
            if res.upserted_id:
                new_calls_count += 1
                await ws_manager.broadcast_event(
                    event="CALL_LOG_ADDED",
                    device_id=payload.device_id,
                    case_id=req_case_id,
                    data=call_doc
                )

        if new_calls_count > 0:
            client_ip = request.client.host if request.client else "unknown"
            await log_audit_event(
                actor=f"device:{payload.device_id}",
                role="DEVICE_CLIENT",
                action="CALL_LOG_INGESTED",
                resource=f"/cases/{req_case_id}/calls",
                case_id=req_case_id,
                ip_address=client_ip,
                details={"new_records": new_calls_count}
            )

    # Ingest Messages if present (incremental, deduplicated via message_id)
    if payload.messages:
        new_msgs_count = 0
        for msg in payload.messages:
            msg_id = msg.message_id or generate_msg_id(payload.device_id, msg.sender, msg.date)
            msg_doc = {
                "message_id": msg_id,
                "case_id": req_case_id,
                "device_id": payload.device_id,
                "session_id": payload.session_id,
                "sender": msg.sender,
                "body": msg.body,
                "date": msg.date,
                "msg_type": msg.msg_type,
                "recorded_at": now_iso
            }
            res = await db.messages.update_one(
                {"message_id": msg_id},
                {"$setOnInsert": msg_doc},
                upsert=True
            )
            if res.upserted_id:
                new_msgs_count += 1
                await ws_manager.broadcast_event(
                    event="MESSAGE_ADDED",
                    device_id=payload.device_id,
                    case_id=req_case_id,
                    data=msg_doc
                )

        if new_msgs_count > 0:
            client_ip = request.client.host if request.client else "unknown"
            await log_audit_event(
                actor=f"device:{payload.device_id}",
                role="DEVICE_CLIENT",
                action="MESSAGE_INGESTED",
                resource=f"/cases/{req_case_id}/messages",
                case_id=req_case_id,
                ip_address=client_ip,
                details={"new_records": new_msgs_count}
            )

    # Calculate forensic evidence hash
    event_data = {
        "case_id": req_case_id,
        "device_id": payload.device_id,
        "session_id": payload.session_id,
        "timestamp": payload.timestamp,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "event_type": payload.event_type,
        "accuracy": payload.accuracy or 0.0,
        "speed": payload.speed or 0.0,
        "altitude": payload.altitude or 0.0,
        "bearing": payload.bearing or 0.0
    }
    evidence_hash = calculate_telemetry_hash(event_data)

    event_id = f"TLM-{uuid.uuid4().hex[:12].upper()}"
    doc = {
        "event_id": event_id,
        "case_id": req_case_id,
        "device_id": payload.device_id,
        "session_id": payload.session_id,
        "timestamp": payload.timestamp,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "event_type": payload.event_type,
        "accuracy": payload.accuracy or 0.0,
        "speed": payload.speed or 0.0,
        "altitude": payload.altitude or 0.0,
        "bearing": payload.bearing or 0.0,
        "battery_level": payload.battery_level,
        "network_state": payload.network_state,
        "evidence_hash": evidence_hash,
        "received_at": now_iso
    }

    # Insert into telemetry_events and location_events
    await db.telemetry_events.insert_one(doc)
    await db.location_events.insert_one(doc)

    # Standard real-time broadcast via WebSocket
    await ws_manager.broadcast_event(
        event="LOCATION_UPDATED",
        device_id=payload.device_id,
        case_id=req_case_id,
        timestamp=now_iso,
        data={
            "event_id": event_id,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy": payload.accuracy,
            "speed": payload.speed,
            "altitude": payload.altitude,
            "bearing": payload.bearing,
            "battery_level": payload.battery_level,
            "network_state": payload.network_state,
            "evidence_hash": evidence_hash,
            "received_at": now_iso,
            "timestamp": payload.timestamp
        }
    )

    return TelemetryEventOut(**doc)

@router.get("/{case_id}/latest", response_model=Optional[TelemetryEventOut])
async def get_latest_telemetry(
    case_id: str,
    device_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    query = {"case_id": case_id}
    if device_id:
        query["device_id"] = device_id

    doc = await db.telemetry_events.find_one(query, sort=[("timestamp", -1)])
    if not doc:
        return None

    return TelemetryEventOut(
        event_id=doc["event_id"],
        case_id=doc["case_id"],
        device_id=doc["device_id"],
        session_id=doc.get("session_id", ""),
        timestamp=doc["timestamp"],
        latitude=doc["latitude"],
        longitude=doc["longitude"],
        event_type=doc.get("event_type", "LOCATION_UPDATE"),
        accuracy=doc.get("accuracy", 0.0),
        speed=doc.get("speed", 0.0),
        altitude=doc.get("altitude", 0.0),
        bearing=doc.get("bearing", 0.0),
        evidence_hash=doc.get("evidence_hash", ""),
        received_at=doc.get("received_at", "")
    )

@router.get("/{case_id}/calls")
async def get_case_calls(
    case_id: str,
    device_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    query = {"case_id": case_id}
    if device_id:
        query["device_id"] = device_id
    cursor = db.call_logs.find(query, {"_id": 0}).sort("date", -1).limit(limit)
    return await cursor.to_list(length=limit)

@router.get("/{case_id}/messages")
async def get_case_messages(
    case_id: str,
    device_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    query = {"case_id": case_id}
    if device_id:
        query["device_id"] = device_id
    cursor = db.messages.find(query, {"_id": 0}).sort("date", -1).limit(limit)
    return await cursor.to_list(length=limit)

@router.get("/{case_id}", response_model=List[TelemetryEventOut])
async def get_case_telemetry(
    case_id: str,
    device_id: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    query = {"case_id": case_id}
    if device_id:
        query["device_id"] = device_id

    cursor = db.telemetry_events.find(query).sort("timestamp", -1).limit(limit)
    events = await cursor.to_list(length=limit)

    return [
        TelemetryEventOut(
            event_id=e["event_id"],
            case_id=e["case_id"],
            device_id=e["device_id"],
            session_id=e.get("session_id", ""),
            timestamp=e["timestamp"],
            latitude=e["latitude"],
            longitude=e["longitude"],
            event_type=e.get("event_type", "LOCATION_UPDATE"),
            accuracy=e.get("accuracy", 0.0),
            speed=e.get("speed", 0.0),
            altitude=e.get("altitude", 0.0),
            bearing=e.get("bearing", 0.0),
            evidence_hash=e.get("evidence_hash", ""),
            received_at=e.get("received_at", "")
        )
        for e in events
    ]
