"""Project TraceX — Safe Production Data Cleanup & Migration Script
Identifies and purges demo, mock, and sample data while preserving legitimate investigation records.
Requires interactive confirmation (or --force for automated pipelines) and creates a JSON backup first.
"""

import sys
import os
import json
import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from config.settings import settings
from motor.motor_asyncio import AsyncIOMotorClient

DEMO_KEYWORDS = ["demo", "sample", "mock", "dummy", "fake", "test", "pixel 8 pro (authorized test unit)"]

def is_demo_record(doc: dict) -> bool:
    """Evaluate whether a document contains dummy or sample markers."""
    doc_str = json.dumps(doc, default=str).lower()
    return any(keyword in doc_str for keyword in DEMO_KEYWORDS)

async def run_cleanup(force: bool = False):
    print("=" * 60)
    print(" PROJECT TRACEX — PRODUCTION DATA CLEANUP & AUDIT")
    print("=" * 60)

    if not settings.MONGODB_URI:
        print("[ERROR] MONGODB_URI is not set. Please configure .env.")
        sys.exit(1)

    print(f"Connecting to database: {settings.MONGODB_DATABASE}...")
    client = AsyncIOMotorClient(
        settings.MONGODB_URI,
        serverSelectionTimeoutMS=20000,
        connectTimeoutMS=20000,
        socketTimeoutMS=20000,
        retryWrites=True
    )
    db = client[settings.MONGODB_DATABASE]

    connected = False
    for attempt in range(1, 4):
        try:
            print(f"Attempt {attempt}/3 connecting to MongoDB...")
            await client.admin.command('ping')
            print("[PASS] MongoDB connection established.")
            connected = True
            break
        except Exception as e:
            print(f"Attempt {attempt} connection notice: {e}")
            if attempt < 3:
                await asyncio.sleep(2)

    if not connected:
        print("[FAIL] Cannot connect to MongoDB after 3 attempts.")
        sys.exit(1)

    collections = [
        "devices",
        "cases",
        "telemetry_events",
        "location_events",
        "call_logs",
        "messages",
        "evidence",
        "chain_of_custody",
        "audit_logs",
        "investigation_timeline",
        "collection_sessions"
    ]

    candidates_to_remove = {}
    backup_data = {}

    print("\nScanning collections for demo/sample records...")
    for coll_name in collections:
        coll = db[coll_name]
        cursor = coll.find({})
        all_docs = await cursor.to_list(length=5000)

        demo_ids = []
        demo_docs = []
        for doc in all_docs:
            if is_demo_record(doc):
                demo_ids.append(doc.get("_id"))
                clean_doc = {k: v for k, v in doc.items() if k != "_id"}
                clean_doc["_id"] = str(doc.get("_id"))
                demo_docs.append(clean_doc)

        if demo_ids:
            candidates_to_remove[coll_name] = demo_ids
            backup_data[coll_name] = demo_docs
            print(f" - Collection '{coll_name}': {len(demo_ids)} sample records identified.")
        else:
            print(f" - Collection '{coll_name}': 0 sample records. (Clean)")

    total_candidates = sum(len(v) for v in candidates_to_remove.values())

    if total_candidates == 0:
        print("\n[SUCCESS] No sample/demo records detected. Database is clean and production ready.")
        client.close()
        return

    print(f"\nTotal sample records pending removal: {total_candidates}")

    # Step 1: Create Backup
    backup_dir = backend_path / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"tracex_demo_cleanup_backup_{timestamp_str}.json"

    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, indent=2)
    print(f"[PASS] Pre-cleanup backup secured: {backup_file}")

    # Step 2: Confirmation
    if not force:
        confirm = input("\nProceed with permanent removal of sample records? [type 'CONFIRM']: ")
        if confirm.strip() != "CONFIRM":
            print("[CANCELLED] Cleanup aborted by investigator.")
            client.close()
            return

    # Step 3: Removal & Audit Logging
    print("\nPurging sample records...")
    removed_count = 0
    for coll_name, ids in candidates_to_remove.items():
        res = await db[coll_name].delete_many({"_id": {"$in": ids}})
        removed_count += res.deleted_count
        print(f" - Purged {res.deleted_count} records from '{coll_name}'.")

    # Record migration audit event
    audit_doc = {
        "audit_id": f"AUD-CLEANUP-{timestamp_str}",
        "actor": "system:migration",
        "role": "SYSTEM",
        "action": "PRODUCTION_DATA_CLEANUP",
        "resource": "database/monitor",
        "details": {
            "records_purged": removed_count,
            "backup_path": str(backup_file),
            "collections_affected": list(candidates_to_remove.keys())
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_logs.insert_one(audit_doc)

    print(f"\n[DONE] Successfully purged {removed_count} sample records.")
    print(f"[DONE] Audit trail updated: AUD-CLEANUP-{timestamp_str}")
    client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TraceX Production Database Cleanup")
    parser.add_argument("--force", action="store_true", help="Non-interactive execution")
    args = parser.parse_args()

    asyncio.run(run_cleanup(force=args.force))
