import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, HTTPException, Depends, Request
from pymongo import ReturnDocument
from database import get_database
from schemas.forensic_schemas import CaseCreate, CaseUpdate, CaseOut
from services.auth_service import get_current_user, require_roles
from services.audit_service import log_audit_event

router = APIRouter(prefix="/cases", tags=["Case Management"])

@router.post("", response_model=CaseOut)
async def create_case(
    case_in: CaseCreate,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN", "INVESTIGATOR"]))
):
    db = get_database()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Server-side atomic sequential case assignment (CASE-001, CASE-002...) with collision avoidance
    while True:
        case_counter = await db.counters.find_one_and_update(
            {"_id": "case_sequence"},
            {"$inc": {"sequence": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER
        )
        seq_num = case_counter.get("sequence", 1)
        case_seq_str = f"{seq_num:03d}"
        case_id = f"CASE-{case_seq_str}"
        case_number = f"TRACEX-{datetime.now(timezone.utc).year}-{case_seq_str}"
        existing_case = await db.cases.find_one({"$or": [{"case_id": case_id}, {"case_number": case_number}]})
        if not existing_case:
            break

    doc = {
        "case_id": case_id,
        "case_number": case_number,
        "title": case_in.title,
        "description": case_in.description or "",
        "status": "OPEN",
        "investigator": current_user["email"],
        "investigator_id": current_user["user_id"],
        "created_at": now_iso,
        "updated_at": now_iso
    }

    await db.cases.insert_one(doc)

    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=current_user["email"],
        role=current_user["role"],
        action="CREATE_CASE",
        resource=f"/cases/{case_id}",
        case_id=case_id,
        ip_address=client_ip,
        details={"case_number": case_number, "title": case_in.title}
    )

    return CaseOut(
        case_id=doc["case_id"],
        case_number=doc["case_number"],
        title=doc["title"],
        description=doc["description"],
        status=doc["status"],
        investigator=doc["investigator"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        device_count=0,
        evidence_count=0,
        telemetry_count=0
    )

@router.get("", response_model=List[CaseOut])
async def list_cases(current_user: dict = Depends(get_current_user)):
    db = get_database()
    cursor = db.cases.find({}).sort("created_at", -1)
    cases = await cursor.to_list(length=200)

    results = []
    for c in cases:
        case_id = c["case_id"]
        dev_count = await db.devices.count_documents({"case_id": case_id})
        ev_count = await db.evidence.count_documents({"case_id": case_id})
        telem_count = await db.telemetry_events.count_documents({"case_id": case_id})

        results.append(CaseOut(
            case_id=c["case_id"],
            case_number=c["case_number"],
            title=c["title"],
            description=c.get("description", ""),
            status=c.get("status", "OPEN"),
            investigator=c.get("investigator", ""),
            created_at=c.get("created_at", ""),
            updated_at=c.get("updated_at", ""),
            device_count=dev_count,
            evidence_count=ev_count,
            telemetry_count=telem_count
        ))
    return results

@router.get("/{case_id}", response_model=CaseOut)
async def get_case(case_id: str, current_user: dict = Depends(get_current_user)):
    db = get_database()
    c = await db.cases.find_one({"case_id": case_id})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")

    dev_count = await db.devices.count_documents({"case_id": case_id})
    ev_count = await db.evidence.count_documents({"case_id": case_id})
    telem_count = await db.telemetry_events.count_documents({"case_id": case_id})

    return CaseOut(
        case_id=c["case_id"],
        case_number=c["case_number"],
        title=c["title"],
        description=c.get("description", ""),
        status=c.get("status", "OPEN"),
        investigator=c.get("investigator", ""),
        created_at=c.get("created_at", ""),
        updated_at=c.get("updated_at", ""),
        device_count=dev_count,
        evidence_count=ev_count,
        telemetry_count=telem_count
    )

@router.put("/{case_id}", response_model=CaseOut)
async def update_case(
    case_id: str,
    case_up: CaseUpdate,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN", "INVESTIGATOR"]))
):
    db = get_database()
    c = await db.cases.find_one({"case_id": case_id})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if case_up.title is not None:
        updates["title"] = case_up.title
    if case_up.description is not None:
        updates["description"] = case_up.description
    if case_up.status is not None:
        updates["status"] = case_up.status

    await db.cases.update_one({"case_id": case_id}, {"$set": updates})

    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=current_user["email"],
        role=current_user["role"],
        action="UPDATE_CASE",
        resource=f"/cases/{case_id}",
        case_id=case_id,
        ip_address=client_ip,
        details=updates
    )

    return await get_case(case_id, current_user)
