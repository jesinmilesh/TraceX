import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any
import logging
from database import get_database
from services.hashing import compute_custody_chain_hash

logger = logging.getLogger("tracex.custody")

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

async def record_custody_event(
    evidence_id: str,
    case_id: str,
    action: str, # ACQUIRED, UPLOADED, HASHED, STORED, ACCESSED, VERIFIED, EXPORTED
    actor: str,
    description: str
) -> dict:
    """
    Append an immutable, cryptographically chained event to the Chain of Custody ledger.
    """
    db = get_database()
    if db is None:
        return {}

    # Fetch latest custody event for this evidence item to find previous_event_hash
    last_event = await db.chain_of_custody.find_one(
        {"evidence_id": evidence_id},
        sort=[("timestamp", -1)]
    )

    previous_hash = last_event["event_hash"] if last_event else GENESIS_HASH

    custody_id = f"CUST-{uuid.uuid4().hex[:10].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()

    event_payload = {
        "custody_id": custody_id,
        "evidence_id": evidence_id,
        "case_id": case_id,
        "action": action,
        "actor": actor,
        "description": description,
        "timestamp": now_iso
    }

    event_hash = compute_custody_chain_hash(previous_hash, event_payload)

    doc = {
        **event_payload,
        "previous_event_hash": previous_hash,
        "event_hash": event_hash
    }

    await db.chain_of_custody.insert_one(doc)
    logger.info(f"[CUSTODY CHAIN] {action} for evidence {evidence_id} (Hash: {event_hash[:16]}...)")
    return doc

append_custody_entry = record_custody_event

async def get_custody_chain(evidence_id: str) -> List[Dict[str, Any]]:
    db = get_database()
    cursor = db.chain_of_custody.find({"evidence_id": evidence_id}).sort("timestamp", 1)
    return await cursor.to_list(length=500)

async def get_case_custody_chain(case_id: str) -> List[Dict[str, Any]]:
    db = get_database()
    cursor = db.chain_of_custody.find({"case_id": case_id}).sort("timestamp", 1)
    return await cursor.to_list(length=1000)
