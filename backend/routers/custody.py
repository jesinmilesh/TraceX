from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Request
from schemas.forensic_schemas import CustodyEntryOut
from services.auth_service import get_current_user, require_roles
from services.custody_service import append_custody_entry, get_custody_chain, get_case_custody_chain
from database import get_database

router = APIRouter(prefix="/custody", tags=["Chain of Custody Ledger"])

class CustodyActionCreate(BaseModel):
    action: str
    description: str

@router.get("/{evidence_id}", response_model=List[CustodyEntryOut])
async def get_evidence_custody(evidence_id: str, current_user: dict = Depends(get_current_user)):
    chain = await get_custody_chain(evidence_id)
    return [
        CustodyEntryOut(
            custody_id=c["custody_id"],
            evidence_id=c["evidence_id"],
            case_id=c["case_id"],
            action=c["action"],
            actor=c["actor"],
            description=c["description"],
            previous_event_hash=c["previous_event_hash"],
            event_hash=c["event_hash"],
            timestamp=c["timestamp"]
        )
        for c in chain
    ]

@router.get("/case/{case_id}", response_model=List[CustodyEntryOut])
async def get_case_custody(case_id: str, current_user: dict = Depends(get_current_user)):
    chain = await get_case_custody_chain(case_id)
    return [
        CustodyEntryOut(
            custody_id=c["custody_id"],
            evidence_id=c["evidence_id"],
            case_id=c["case_id"],
            action=c["action"],
            actor=c["actor"],
            description=c["description"],
            previous_event_hash=c["previous_event_hash"],
            event_hash=c["event_hash"],
            timestamp=c["timestamp"]
        )
        for c in chain
    ]

@router.post("/{evidence_id}", response_model=CustodyEntryOut)
async def add_custody_entry(
    evidence_id: str,
    action_in: CustodyActionCreate,
    current_user: dict = Depends(require_roles(["ADMIN", "INVESTIGATOR", "ANALYST"]))
):
    db = get_database()
    ev = await db.evidence.find_one({"evidence_id": evidence_id})
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence artifact not found")

    entry = await append_custody_entry(
        evidence_id=evidence_id,
        case_id=ev["case_id"],
        action=action_in.action.upper().replace(" ", "_"),
        actor=current_user["email"],
        description=action_in.description
    )

    return CustodyEntryOut(
        custody_id=entry["custody_id"],
        evidence_id=entry["evidence_id"],
        case_id=entry["case_id"],
        action=entry["action"],
        actor=entry["actor"],
        description=entry["description"],
        previous_event_hash=entry["previous_event_hash"],
        event_hash=entry["event_hash"],
        timestamp=entry["timestamp"]
    )
