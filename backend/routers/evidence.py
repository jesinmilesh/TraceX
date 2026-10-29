import os
from typing import List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from database import get_database
from schemas.forensic_schemas import EvidenceOut, EvidenceVerifyResult
from services.auth_service import get_current_user, require_roles
from services.evidence_service import store_evidence_file, verify_evidence_integrity, get_vault_path
from services.custody_service import append_custody_entry
from services.audit_service import log_audit_event

router = APIRouter(prefix="/evidence", tags=["Evidence Vault & Integrity"])

@router.post("/upload", response_model=EvidenceOut)
async def upload_evidence(
    case_id: str = Form(...),
    file: UploadFile = File(...),
    request: Request = None,
    current_user: dict = Depends(require_roles(["ADMIN", "INVESTIGATOR"]))
):
    db = get_database()
    case = await db.cases.find_one({"case_id": case_id})
    if not case:
        raise HTTPException(status_code=404, detail="Referenced case does not exist")

    # Store file safely in evidence vault & compute SHA-256
    stored_record = await store_evidence_file(
        file=file,
        case_id=case_id,
        uploader_email=current_user["email"]
    )

    client_ip = request.client.host if request and request.client else "unknown"

    # Create Genesis Chain of Custody entry
    await append_custody_entry(
        evidence_id=stored_record["evidence_id"],
        case_id=case_id,
        action="EVIDENCE_SECURED_IN_VAULT",
        actor=current_user["email"],
        description=f"Evidence ingested into vault. Original: {stored_record['original_filename']}, SHA-256: {stored_record['sha256']}"
    )

    # Log forensic audit entry
    await log_audit_event(
        actor=current_user["email"],
        role=current_user["role"],
        action="UPLOAD_EVIDENCE",
        resource=f"/evidence/{stored_record['evidence_id']}",
        case_id=case_id,
        ip_address=client_ip,
        details={
            "filename": stored_record["original_filename"],
            "sha256": stored_record["sha256"],
            "file_size": stored_record["file_size"]
        }
    )

    return EvidenceOut(**stored_record)

@router.get("/case/{case_id}", response_model=List[EvidenceOut])
async def list_case_evidence(case_id: str, current_user: dict = Depends(get_current_user)):
    db = get_database()
    cursor = db.evidence.find({"case_id": case_id}).sort("uploaded_at", -1)
    evidence_list = await cursor.to_list(length=200)

    return [
        EvidenceOut(
            evidence_id=e["evidence_id"],
            case_id=e["case_id"],
            original_filename=e["original_filename"],
            stored_filename=e["stored_filename"],
            mime_type=e.get("mime_type", "application/octet-stream"),
            file_size=e["file_size"],
            sha256=e["sha256"],
            uploaded_by=e.get("uploaded_by", "Unknown"),
            uploaded_at=e["uploaded_at"],
            status=e.get("status", "ACTIVE")
        )
        for e in evidence_list
    ]

@router.get("/{evidence_id}/verify", response_model=EvidenceVerifyResult)
async def verify_evidence(
    evidence_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    result = await verify_evidence_integrity(
        evidence_id=evidence_id,
        verifier_email=current_user["email"]
    )

    client_ip = request.client.host if request.client else "unknown"
    await log_audit_event(
        actor=current_user["email"],
        role=current_user["role"],
        action="VERIFY_EVIDENCE_INTEGRITY",
        resource=f"/evidence/{evidence_id}/verify",
        ip_address=client_ip,
        details={
            "status": result["status"],
            "original_sha256": result["original_sha256"],
            "current_sha256": result["current_sha256"]
        }
    )

    return EvidenceVerifyResult(**result)

@router.get("/{evidence_id}/download")
async def download_evidence(
    evidence_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    doc = await db.evidence.find_one({"evidence_id": evidence_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Evidence record not found")

    vault_dir = get_vault_path()
    file_path = os.path.join(vault_dir, doc["stored_filename"])

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Physical file missing from vault")

    client_ip = request.client.host if request.client else "unknown"

    # Custody log for file access
    await append_custody_entry(
        evidence_id=evidence_id,
        case_id=doc["case_id"],
        action="EVIDENCE_EXPORTED_FOR_ANALYSIS",
        actor=current_user["email"],
        description=f"Evidence downloaded by {current_user['email']} ({current_user.get('role')})"
    )

    # Audit log
    await log_audit_event(
        actor=current_user["email"],
        role=current_user["role"],
        action="DOWNLOAD_EVIDENCE",
        resource=f"/evidence/{evidence_id}/download",
        case_id=doc["case_id"],
        ip_address=client_ip,
        details={"original_filename": doc["original_filename"]}
    )

    return FileResponse(
        path=file_path,
        filename=doc["original_filename"],
        media_type=doc.get("mime_type", "application/octet-stream")
    )
