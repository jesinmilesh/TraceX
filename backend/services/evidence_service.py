import os
import uuid
from pathlib import Path
from datetime import datetime, timezone
import logging
from fastapi import UploadFile, HTTPException, status
from database import get_database
from config import settings
from services.hashing import calculate_sha256
from services.custody_service import record_custody_event
from services.audit_service import log_audit_event

logger = logging.getLogger("tracex.evidence")

def get_vault_path(case_id: str = "") -> Path:
    base = Path(settings.UPLOAD_DIR)
    if case_id:
        p = base / case_id
    else:
        p = base
    p.mkdir(parents=True, exist_ok=True)
    return p

async def store_evidence_artifact(file: UploadFile, case_id: str, uploader_email: str) -> dict:
    """
    Safely ingest, hash, and persist forensic artifacts into the evidence vault.
    Prevents path traversal and filename injection.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not ready")

    # Verify case exists
    case_doc = await db.cases.find_one({"case_id": case_id})
    if not case_doc:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    content = await file.read()
    file_size = len(content)

    if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size ({settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB)"
        )

    # Cryptographic SHA-256 calculation
    sha256_checksum = calculate_sha256(content)

    evidence_id = f"EV-{datetime.now().year}-{uuid.uuid4().hex[:8].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()

    # Sanitize filename & create safe storage path
    original_name = Path(file.filename).name # Strips directory traversal components
    safe_stored_filename = f"{evidence_id}_{original_name}"
    
    case_vault_dir = get_vault_path(case_id)
    destination_path = case_vault_dir / safe_stored_filename

    # Write file to disk
    with open(destination_path, "wb") as f:
        f.write(content)

    doc = {
        "evidence_id": evidence_id,
        "case_id": case_id,
        "original_filename": original_name,
        "stored_filename": safe_stored_filename,
        "storage_path": str(destination_path),
        "mime_type": file.content_type or "application/octet-stream",
        "file_size": file_size,
        "sha256": sha256_checksum,
        "uploaded_by": uploader_email,
        "uploaded_at": now_iso,
        "status": "STORED_AND_HASHED"
    }

    await db.evidence.insert_one(doc)

    logger.info(f"[EVIDENCE VAULT] Artifact {evidence_id} secured ({original_name}, {file_size} bytes)")
    return doc

store_evidence_file = store_evidence_artifact

async def verify_evidence_integrity(evidence_id: str, verifier_email: str) -> dict:
    """
    Read physical stored artifact from disk and verify against immutable SHA-256 record.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not ready")

    doc = await db.evidence.find_one({"evidence_id": evidence_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Evidence artifact not found")

    storage_path = Path(doc["storage_path"])
    if not storage_path.exists():
        raise HTTPException(status_code=404, detail="Physical evidence file missing from vault")

    with open(storage_path, "rb") as f:
        current_bytes = f.read()

    current_sha256 = calculate_sha256(current_bytes)
    original_sha256 = doc["sha256"]

    is_valid = (current_sha256 == original_sha256)
    verification_status = "INTEGRITY VERIFIED" if is_valid else "INTEGRITY MISMATCH"

    now_iso = datetime.now(timezone.utc).isoformat()

    # Record verification in Chain of Custody
    await record_custody_event(
        evidence_id=evidence_id,
        case_id=doc["case_id"],
        action="VERIFIED",
        actor=verifier_email,
        description=f"Cryptographic hash verification performed. Result: {verification_status} (Original: {original_sha256[:12]}..., Current: {current_sha256[:12]}...)"
    )

    # Audit log
    await log_audit_event(
        action="HASH_VERIFIED",
        actor=verifier_email,
        case_id=doc["case_id"],
        resource=f"EVIDENCE:{evidence_id}",
        details={"result": verification_status, "is_valid": is_valid}
    )

    return {
        "evidence_id": evidence_id,
        "filename": doc["original_filename"],
        "original_sha256": original_sha256,
        "current_sha256": current_sha256,
        "status": verification_status,
        "verified_at": now_iso,
        "verified_by": verifier_email
    }
