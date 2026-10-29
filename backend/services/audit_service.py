import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import logging
from database import get_database

logger = logging.getLogger("tracex.audit")

async def log_audit_event(
    action: str,
    actor: str,
    role: str = "INVESTIGATOR",
    case_id: Optional[str] = None,
    resource: str = "SYSTEM",
    details: Optional[dict] = None,
    ip_address: str = ""
) -> dict:
    """
    Append-only forensic audit logging.
    Records every administrative, investigator, and telemetry action.
    """
    db = get_database()
    if db is None:
        return {}

    audit_id = f"AUD-{uuid.uuid4().hex[:10].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "audit_id": audit_id,
        "case_id": case_id,
        "actor": actor,
        "role": role,
        "action": action,
        "resource": resource,
        "ip_address": ip_address,
        "timestamp": now_iso,
        "details": details or {}
    }

    try:
        await db.audit_logs.insert_one(doc)
        logger.info(f"[AUDIT] {action} by {actor} ({role}) on {resource} (Case: {case_id})")
        return doc
    except Exception as e:
        logger.error(f"Failed to record audit event: {e}")
        return doc

async def get_audit_logs(
    case_id: Optional[str] = None,
    actor: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        return []

    query = {}
    if case_id:
        query["case_id"] = case_id
    if actor:
        query["actor"] = actor

    cursor = db.audit_logs.find(query).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(length=limit)
