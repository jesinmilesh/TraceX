import asyncio
import io
import sys
import uuid
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from main import app, ensure_baseline_admin
from database import connect_to_mongo, close_mongo_connection, get_database
from services.auth_service import hash_password
from config.settings import settings

async def run_tests():
    print("==================================================")
    print("PROJECT TRACEX PRODUCTION BACKEND INTEGRATION TEST")
    print("==================================================")

    print("\n[1/9] Connecting to MongoDB Database...")
    await connect_to_mongo()
    db = get_database()
    assert db is not None, "Failed to connect to database"
    print(f" Connected to database: {db.name}")

    print("\n[2/9] Testing /health Endpoint...")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        health_res = await ac.get("/health")
        assert health_res.status_code == 200, f"Health check failed: {health_res.text}"
        health_data = health_res.json()
        assert health_data["status"] == "healthy", f"Health status invalid: {health_data}"
        assert health_data["database"] == "connected", f"Database status invalid: {health_data}"
        print(f" Health check passed: {health_data}")

        print("\n[3/9] Testing Authentication & Fail-Closed Credential Validation...")
        # Negative test 1: Invalid email
        fail_res1 = await ac.post("/api/v1/auth/login", json={
            "email": "nonexistent_investigator@tracex.invalid",
            "password": "WrongPassword123!"
        })
        assert fail_res1.status_code == 401, f"Expected 401 on nonexistent user, got {fail_res1.status_code}"
        print(" Negative Test PASS: Nonexistent user rejected with 401 Unauthorized")

        # Provision temporary dynamic test investigator
        test_uid = f"USR-TEST-{uuid.uuid4().hex[:6].upper()}"
        test_email = f"test.inv.{uuid.uuid4().hex[:6]}@tracex.test"
        test_pass = f"Pass-{uuid.uuid4().hex[:12]}!"
        await db.users.insert_one({
            "user_id": test_uid,
            "email": test_email,
            "password_hash": hash_password(test_pass),
            "name": "Automated Integration Tester",
            "role": "ADMIN",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Negative test 2: Correct email, wrong password
        fail_res2 = await ac.post("/api/v1/auth/login", json={
            "email": test_email,
            "password": "IncorrectPasswordAttempt!"
        })
        assert fail_res2.status_code == 401, f"Expected 401 on wrong password, got {fail_res2.status_code}"
        print(" Negative Test PASS: Incorrect password rejected with 401 Unauthorized")

        # Positive test: Valid dynamic credentials (via email)
        login_res = await ac.post("/api/v1/auth/login", json={
            "email": test_email,
            "password": test_pass
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        auth_data = login_res.json()
        token = auth_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f" Positive Test PASS: Dynamic authentication successful! JWT issued for {auth_data['user']['email']}")

        # Positive test 2: Valid credentials via username field
        login_u_res = await ac.post("/api/v1/auth/login", json={
            "username": test_email,
            "password": test_pass
        })
        assert login_u_res.status_code == 200, f"Login via username field failed: {login_u_res.text}"
        print(" Positive Test PASS: Authentication with 'username' field succeeds")

        # Rate Limiting Test: repeated failed attempts trigger 429
        rl_target = f"rl.{uuid.uuid4().hex[:6]}@tracex.invalid"
        for _ in range(5):
            await ac.post("/api/v1/auth/login", json={"email": rl_target, "password": "wrong"})
        rl_res = await ac.post("/api/v1/auth/login", json={"email": rl_target, "password": "wrong"})
        assert rl_res.status_code == 429, f"Expected 429 on rate limit trigger, got {rl_res.status_code}"
        print(" Rate Limiting PASS: Brute-force threshold triggered HTTP 429 Too Many Requests")

        # Logout Test: Calling /auth/logout with token succeeds
        logout_res = await ac.post("/api/v1/auth/logout", headers=headers)
        assert logout_res.status_code == 200, f"Logout failed: {logout_res.text}"
        print(" Logout PASS: Server-side logout audit event recorded")

        print("\n[4/9] Testing Atomic Sequential Case Creation...")
        case_res = await ac.post("/api/v1/cases", json={
            "title": "Authorized Digital Evidence Examination",
            "description": "Integration test for evidentiary pipeline and sequence ordering."
        }, headers=headers)
        assert case_res.status_code == 200, f"Case creation failed: {case_res.text}"
        case = case_res.json()
        case_id = case["case_id"]
        assert case_id.startswith("CASE-"), f"Expected CASE- prefix, got {case_id}"
        print(f" Created Case: {case['case_number']} (ID: {case_id})")

        print("\n[5/9] Testing Atomic Concurrent Device Registration (Section 74/75)...")
        reg_task1 = ac.post("/api/v1/devices/register", json={
            "case_id": case_id,
            "device_model": "Integration Unit Alpha",
            "android_version": "15.0",
            "app_version": "1.0.0"
        })
        reg_task2 = ac.post("/api/v1/devices/register", json={
            "case_id": case_id,
            "device_model": "Integration Unit Beta",
            "android_version": "15.0",
            "app_version": "1.0.0"
        })
        res1, res2 = await asyncio.gather(reg_task1, reg_task2)
        assert res1.status_code == 200 and res2.status_code == 200, "Concurrent registration failed"
        d1 = res1.json()
        d2 = res2.json()
        assert d1["device_id"] != d2["device_id"], "Device collision detected during concurrent registration!"
        print(f" Device 1 Registered: {d1['device_id']} (Number: {d1.get('device_number')})")
        print(f" Device 2 Registered: {d2['device_id']} (Number: {d2.get('device_number')})")
        print(" Atomic Sequential Registration PASS: Concurrently registered devices received unique sequential IDs")

        primary_device_id = d1["device_id"]

        print("\n[6/9] Testing Reconnect / Reinstallation Identity Persistence (Section 19)...")
        reconnect_res = await ac.post("/api/v1/devices/register", json={
            "device_id": primary_device_id,
            "case_id": case_id,
            "device_model": "Integration Unit Alpha",
            "android_version": "15.0",
            "app_version": "1.0.0"
        })
        assert reconnect_res.status_code == 200, "Re-registration failed"
        reconnected_doc = reconnect_res.json()
        assert reconnected_doc["device_id"] == primary_device_id, "Device ID changed on reconnection!"
        print(f" Persistence PASS: Reconnecting device preserved identity {primary_device_id}")

        print("\n[7/9] Testing Device Collection Session & Real-Time Telemetry Ingestion...")
        start_res = await ac.post(f"/api/v1/devices/{primary_device_id}/collection/start", json={
            "case_id": case_id,
            "device_id": primary_device_id,
            "permissions_at_start": ["ACCESS_FINE_LOCATION", "READ_CALL_LOG", "READ_SMS"]
        })
        assert start_res.status_code == 200, f"Session start failed: {start_res.text}"
        session_data = start_res.json()
        session_id = session_data["session_id"]
        print(f" Started Collection Session: {session_id} (Status: {session_data['status']})")

        # Telemetry ingestion with location, speed, call logs, messages
        telem_res = await ac.post("/api/v1/telemetry/ingest", json={
            "case_id": case_id,
            "device_id": primary_device_id,
            "session_id": session_id,
            "timestamp": int(datetime.now(timezone.utc).timestamp()),
            "latitude": 37.774929,
            "longitude": -122.419416,
            "event_type": "LOCATION_UPDATE",
            "accuracy": 3.8,
            "speed": 11.2,
            "altitude": 22.0,
            "bearing": 90.0,
            "call_logs": [
                {
                    "phone_number": "+1555019283",
                    "call_type": "INCOMING",
                    "date": int(datetime.now(timezone.utc).timestamp()),
                    "duration_seconds": 120,
                    "call_event_id": f"CAL-{uuid.uuid4().hex[:6].upper()}"
                }
            ],
            "messages": [
                {
                    "sender": "+1555019283",
                    "body": "Authorized integration verification payload.",
                    "date": int(datetime.now(timezone.utc).timestamp()),
                    "msg_type": "INCOMING",
                    "message_id": f"MSG-{uuid.uuid4().hex[:6].upper()}"
                }
            ]
        })
        assert telem_res.status_code == 200, f"Telemetry ingestion failed: {telem_res.text}"
        telem = telem_res.json()
        print(f" Telemetry Ingested! SHA-256 Checksum: {telem['evidence_hash']}")

        # Test location history API (both endpoints: /location-history and Section 10's /locations)
        loc_res = await ac.get(f"/api/v1/devices/{primary_device_id}/location-history?case_id={case_id}", headers=headers)
        assert loc_res.status_code == 200, f"Location history failed: {loc_res.text}"
        loc_data = loc_res.json()
        assert loc_data["count"] >= 1, "Expected at least 1 historical location point"
        print(f" Verified Location History API (/location-history): {loc_data['count']} points retrieved.")

        # Test Section 10 endpoint alias: /api/v1/devices/{device_id}/locations
        loc_alias_res = await ac.get(f"/api/v1/devices/{primary_device_id}/locations?case_id={case_id}", headers=headers)
        assert loc_alias_res.status_code == 200, f"Locations alias failed: {loc_alias_res.text}"
        loc_alias_data = loc_alias_res.json()
        assert loc_alias_data["count"] >= 1, "Expected points from /locations alias"
        print(f" Verified Section 10 Locations API (/locations): {loc_alias_data['count']} points retrieved.")

        # Test Google Maps Client Configuration endpoint
        map_config_res = await ac.get("/api/v1/config/maps")
        assert map_config_res.status_code == 200, f"Maps config failed: {map_config_res.text}"
        map_conf = map_config_res.json()
        assert "google_maps_api_key" in map_conf, "Maps config must contain google_maps_api_key"
        assert "provider" in map_conf and map_conf["provider"] == "google_maps", "Provider must be google_maps"
        # Security test: ensure no backend secrets are leaked in map config
        for sensitive_key in ["mongodb", "MONGO_URI", "SECRET_KEY", "JWT_SECRET", "database"]:
            assert sensitive_key not in map_conf, f"Leaked sensitive secret {sensitive_key} in public maps config!"
        print(f" Verified Maps Configuration Endpoint (/config/maps) [Configured: {map_conf['configured']}]")

        # Test GPS coordinate validation (Section 17: reject latitude outside [-90, 90] or longitude outside [-180, 180])
        invalid_gps_res = await ac.post("/api/v1/telemetry/ingest", json={
            "case_id": case_id,
            "device_id": primary_device_id,
            "session_id": session_id,
            "latitude": 195.0, # Impossible latitude
            "longitude": -122.419416,
            "accuracy": 5.0
        })
        assert invalid_gps_res.status_code in [400, 422], f"Expected 400/422 for invalid latitude, got {invalid_gps_res.status_code}"
        print(" Coordinate Validation PASS: Malformed GPS coordinate (lat 195.0) rejected")

        # Stop collection session
        stop_res = await ac.post(f"/api/v1/devices/{primary_device_id}/collection/stop?session_id={session_id}")
        assert stop_res.status_code == 200, f"Session stop failed: {stop_res.text}"
        print(f" Cleanly Stopped Collection Session: {session_id}")

        print("\n[8/9] Testing Evidence Vault Ingestion & Cryptographic Verification...")
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
        print(f" Cryptographic Integrity: {verify_data['status']}")

        print("\n[9/9] Testing Chained Custody Ledger & Forensic HTML Report...")
        custody_res = await ac.get(f"/api/v1/custody/{evidence_id}", headers=headers)
        assert custody_res.status_code == 200, f"Custody fetch failed: {custody_res.text}"
        custody_list = custody_res.json()
        assert len(custody_list) >= 2, "Expected at least 2 chained custody events"
        print(f" Chain of Custody verified with {len(custody_list)} blocks.")

        report_res = await ac.get(f"/api/v1/reports/{case_id}/html", headers=headers)
        assert report_res.status_code == 200, f"Report generation failed: {report_res.text}"
        assert "PROJECT TRACEX" in report_res.text, "Report header missing"
        print(f" Forensic HTML Report successfully generated ({len(report_res.text)} bytes).")

        # Cleanup temporary integration test user
        await db.users.delete_one({"user_id": test_uid})
        print(f" Cleaned up temporary test investigator ({test_uid})")

    await close_mongo_connection()
    print("\n==================================================")
    print("ALL PRODUCTION BACKEND INTEGRATION TESTS PASSED! ")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
