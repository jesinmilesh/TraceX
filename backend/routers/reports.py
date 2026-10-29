from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from services.auth_service import get_current_user
from services.report_service import generate_case_report_html
from database import get_database

router = APIRouter(prefix="/reports", tags=["Forensic Reports"])

@router.get("/{case_id}/html", response_class=HTMLResponse)
async def get_case_report_html(
    case_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        html_content = await generate_case_report_html(
            case_id=case_id,
            generated_by=current_user["email"]
        )
        return HTMLResponse(content=html_content, status_code=200)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@router.get("/{case_id}/summary")
async def get_case_summary(
    case_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    case = await db.cases.find_one({"case_id": case_id})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    dev_count = await db.devices.count_documents({"case_id": case_id})
    ev_count = await db.evidence.count_documents({"case_id": case_id})
    telem_count = await db.telemetry_events.count_documents({"case_id": case_id})
    custody_count = await db.chain_of_custody.count_documents({"case_id": case_id})
    audit_count = await db.audit_logs.count_documents({"case_id": case_id})

    return {
        "case": {
            "case_id": case["case_id"],
            "case_number": case.get("case_number", ""),
            "title": case.get("title", ""),
            "status": case.get("status", "OPEN"),
            "investigator": case.get("investigator", ""),
            "created_at": case.get("created_at", "")
        },
        "stats": {
            "devices": dev_count,
            "evidence_artifacts": ev_count,
            "telemetry_events": telem_count,
            "chain_of_custody_records": custody_count,
            "audit_trail_events": audit_count
        }
    }
