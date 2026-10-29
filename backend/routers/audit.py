from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from schemas.forensic_schemas import AuditLogOut
from services.auth_service import get_current_user, require_roles
from services.audit_service import get_audit_logs

router = APIRouter(prefix="/audit", tags=["Forensic Audit Logs"])

@router.get("", response_model=List[AuditLogOut])
async def list_audit_logs(
    case_id: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(require_roles(["ADMIN", "INVESTIGATOR"]))
):
    logs = await get_audit_logs(case_id=case_id, actor=actor, limit=limit)
    return [
        AuditLogOut(
            audit_id=log["audit_id"],
            case_id=log.get("case_id"),
            actor=log["actor"],
            role=log.get("role", "UNKNOWN"),
            action=log["action"],
            resource=log["resource"],
            ip_address=log.get("ip_address", ""),
            timestamp=log["timestamp"],
            details=log.get("details", {})
        )
        for log in logs
    ]

@router.get("/case/{case_id}", response_model=List[AuditLogOut])
async def list_case_audit_logs(
    case_id: str,
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(require_roles(["ADMIN", "INVESTIGATOR"]))
):
    logs = await get_audit_logs(case_id=case_id, limit=limit)
    return [
        AuditLogOut(
            audit_id=log["audit_id"],
            case_id=log.get("case_id"),
            actor=log["actor"],
            role=log.get("role", "UNKNOWN"),
            action=log["action"],
            resource=log["resource"],
            ip_address=log.get("ip_address", ""),
            timestamp=log["timestamp"],
            details=log.get("details", {})
        )
        for log in logs
    ]
