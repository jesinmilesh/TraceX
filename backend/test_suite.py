import asyncio
import io
import sys
from httpx import AsyncClient, ASGITransport
from main import app, ensure_baseline_admin
from database import connect_to_mongo, close_mongo_connection, get_database

async def run_tests():
    print("==================================================")
    print("PROJECT TRACEX PRODUCTION BACKEND INTEGRATION TEST")
    print("==================================================")

    print("\n[1/8] Connecting to MongoDB Database...")
    await connect_to_mongo()
    db = get_database()
    assert db is not None, "Failed to connect to database"
    print(f" Connected to database: {db.name}")

    print("\n[2/8] Testing /health Endpoint...")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        health_res = await ac.get("/health")
        assert health_res.status_code == 200, f"Health check failed: {health_res.text}"
        health_data = health_res.json()
        assert health_data["status"] == "healthy", f"Health status invalid: {health_data}"
        assert health_data["database"] == "connected", f"Database status invalid: {health_data}"
        print(f" Health check passed: {health_data}")

        print("\n[3/8] Verifying Baseline Admin Account...")
        await ensure_baseline_admin()
        admin_user = await db.users.find_one({"email": "admin@tracex.local"})
        assert admin_user is not None, "Admin user not found"
        print(f" Admin user verified: {admin_user['email']} (Role: {admin_user['role']})")

        print("\n[4/8] Testing Administrator Login & JWT Issuance...")
        login_res = await ac.post("/api/v1/auth/login", json={
            "email": "admin@tracex.local",
            "password": "TraceX@2026!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        auth_data = login_res.json()
        token = auth_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f" Authentication successful! JWT issued for {auth_data['user']['email']}")

        print("\n[5/8] Testing Case Management & Registration...")
        case_res = await ac.post("/api/v1/cases", json={
            "title": "Operation Sovereign Chain - Digital Audit",
            "description": "Authorized forensic examination of evidentiary telemetry under search order 2026-X."
        }, headers=headers)
        assert case_res.status_code == 200, f"Case creation failed: {case_res.text}"
        case = case_res.json()
        case_id = case["case_id"]
        print(f" Created Case: {case['case_number']} (ID: {case_id})")

        print("\n[6/8] Testing Android Device Enrollment & Collection Sessions...")
        dev_res = await ac.post("/api/v1/devices/register", json={
            "case_id": case_id,
            "device_model": "Pixel 8 Pro (Authorized Test Unit)",
            "android_version": "16.0",
            "app_version": "1.0.0"
        })
        assert dev_res.status_code == 200, f"Device registration failed: {dev_res.text}"
        device = dev_res.json()
        device_id = device["device_id"]
        print(f" Registered Device: {device_id} for Case: {case_id}")

        # Start collection session
        start_res = await ac.post(f"/api/v1/devices/{device_id}/collection/start", json={
            "case_id": case_id,
            "device_id": device_id,
            "permissions_at_start": ["ACCESS_FINE_LOCATION", "READ_CALL_LOG", "READ_SMS"]
        })
        assert start_res.status_code == 200, f"Session start failed: {start_res.text}"
        session_data = start_res.json()
        session_id = session_data["session_id"]
        print(f" Started Collection Session: {session_id} (Status: {session_data['status']})")

        # Telemetry ingestion with location, speed, call logs, messages
        telem_res = await ac.post("/api/v1/telemetry/ingest", json={
            "case_id": case_id,
            "device_id": device_id,
            "session_id": session_id,
            "timestamp": 1730000000,
            "latitude": 37.774929,
            "longitude": -122.419416,
            "event_type": "LOCATION_UPDATE",
            "accuracy": 4.5,
            "speed": 12.5,
            "altitude": 25.0,
            "bearing": 180.0,
            "call_logs": [
                {
                    "phone_number": "+1555019283",
                    "call_type": "INCOMING",
                    "date": 1730000000,
                    "duration_seconds": 145,
                    "call_event_id": "CAL-TEST001"
                }
            ],
            "messages": [
                {
                    "sender": "+1555019283",
                    "body": "Authorized test transmission for forensics verification.",
                    "date": 1730000000,
                    "msg_type": "INCOMING",
                    "message_id": "MSG-TEST001"
                }
            ]
        })
        assert telem_res.status_code == 200, f"Telemetry ingestion failed: {telem_res.text}"
        telem = telem_res.json()
        print(f" Telemetry Ingested with Call Log & Message! Checksum: {telem['evidence_hash']}")

        # Test location history API
        loc_res = await ac.get(f"/api/v1/devices/{device_id}/location-history?case_id={case_id}", headers=headers)
        assert loc_res.status_code == 200, f"Location history failed: {loc_res.text}"
        loc_data = loc_res.json()
        assert loc_data["count"] >= 1, "Expected at least 1 historical location point"
        print(f" Verified Location History API: {loc_data['count']} points retrieved.")

        # Stop collection session
        stop_res = await ac.post(f"/api/v1/devices/{device_id}/collection/stop?session_id={session_id}")
        assert stop_res.status_code == 200, f"Session stop failed: {stop_res.text}"
        print(f" Cleanly Stopped Collection Session: {session_id}")

        print("\n[7/8] Testing Evidence Vault Ingestion & Cryptographic Verification...")
        test_file_content = b"TRACE_X_PRODUCTION_FORENSIC_INTEGRITY_VERIFICATION"
        files = {
            "file": ("forensic_extract_production.log", io.BytesIO(test_file_content), "text/plain")
        }
        data = {"case_id": case_id}
        ev_res = await ac.post("/api/v1/evidence/upload", data=data, files=files, headers=headers)
        assert ev_res.status_code == 200, f"Evidence upload failed: {ev_res.text}"
        ev = ev_res.json()
        evidence_id = ev["evidence_id"]
        print(f" Evidence Vaulted: {evidence_id} (SHA-256: {ev['sha256']})")

        # Verify physical integrity
        verify_res = await ac.get(f"/api/v1/evidence/{evidence_id}/verify", headers=headers)
        assert verify_res.status_code == 200, f"Evidence verify failed: {verify_res.text}"
        verify_data = verify_res.json()
        assert verify_data["status"] == "INTEGRITY VERIFIED", f"Integrity failed: {verify_data}"
        print(f" Integrity Verified: {verify_data['status']}")

        print("\n[8/8] Testing Chained Custody Ledger & Forensic HTML Report...")
        custody_res = await ac.get(f"/api/v1/custody/{evidence_id}", headers=headers)
        assert custody_res.status_code == 200, f"Custody fetch failed: {custody_res.text}"
        custody_list = custody_res.json()
        assert len(custody_list) >= 2, "Expected at least 2 chained custody events"
        print(f" Chain of Custody verified with {len(custody_list)} blocks.")

        report_res = await ac.get(f"/api/v1/reports/{case_id}/html", headers=headers)
        assert report_res.status_code == 200, f"Report generation failed: {report_res.text}"
        assert "PROJECT TRACEX" in report_res.text, "Report header missing"
        print(f" Forensic HTML Report successfully generated ({len(report_res.text)} bytes).")

    await close_mongo_connection()
    print("\n==================================================")
    print("ALL PRODUCTION BACKEND INTEGRATION TESTS PASSED! ")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
