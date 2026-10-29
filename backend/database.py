import logging
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

logger = logging.getLogger("tracex.database")

client: AsyncIOMotorClient = None
db = None

import asyncio

async def connect_to_mongo():
    global client, db
    for attempt in range(1, 4):
        try:
            logger.info(f"Connecting to MongoDB Atlas (Database: {settings.MONGODB_DATABASE}) - Attempt {attempt}/3...")
            client = AsyncIOMotorClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=30000,
                connectTimeoutMS=30000,
                socketTimeoutMS=30000,
                retryWrites=True
            )
            db = client[settings.MONGODB_DATABASE]
            
            # Verify connection with ping
            await client.admin.command('ping')
            logger.info(f"Connected successfully to MongoDB Atlas cluster ({settings.MONGODB_DATABASE})")
            
            # Initialize indexes
            await init_db_indexes()
            return
        except Exception as e:
            logger.warning(f"MongoDB connection attempt {attempt} failed: {e}")
            if attempt < 3:
                await asyncio.sleep(2)
            else:
                logger.error("MongoDB Atlas connection failed after 3 attempts.")
                if client:
                    db = client[settings.MONGODB_DATABASE]

async def close_mongo_connection():
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed.")

async def init_db_indexes():
    """Ensure performant, unique indexes across all forensic collections."""
    try:
        # Users
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)

        # Cases
        await db.cases.create_index("case_id", unique=True)
        await db.cases.create_index("case_number", unique=True)

        # Devices
        await db.devices.create_index("device_id", unique=True)
        await db.devices.create_index("case_id")

        # Collection Sessions
        await db.collection_sessions.create_index("session_id", unique=True)
        await db.collection_sessions.create_index([("device_id", 1), ("status", 1)])
        await db.collection_sessions.create_index([("case_id", 1), ("started_at", -1)])

        # Telemetry Events & Location Events
        await db.telemetry_events.create_index("event_id", unique=True)
        await db.telemetry_events.create_index([("device_id", 1), ("case_id", 1), ("timestamp", -1)])
        await db.location_events.create_index([("device_id", 1), ("case_id", 1), ("timestamp", -1)])

        # Call Logs (Incremental & Deduplicated)
        await db.call_logs.create_index([("device_id", 1), ("case_id", 1), ("timestamp", -1), ("call_event_id", 1)])
        await db.call_logs.create_index("call_event_id", unique=True, sparse=True)

        # Messages (Incremental & Deduplicated)
        await db.messages.create_index([("device_id", 1), ("case_id", 1), ("timestamp", -1), ("message_id", 1)])
        await db.messages.create_index("message_id", unique=True, sparse=True)

        # Evidence Vault Artifacts
        await db.evidence.create_index("evidence_id", unique=True)
        await db.evidence.create_index("case_id")
        await db.evidence.create_index("sha256")

        # Chain of Custody (Tamper-Evident Ledger)
        await db.chain_of_custody.create_index("custody_id", unique=True)
        await db.chain_of_custody.create_index([("evidence_id", 1), ("timestamp", 1)])

        # Forensic Audit Logs (Append-Only)
        await db.audit_logs.create_index("audit_id", unique=True)
        await db.audit_logs.create_index([("case_id", 1), ("timestamp", -1)])

        # Investigation Timeline
        await db.investigation_timeline.create_index([("case_id", 1), ("timestamp", -1)])

        logger.info("All MongoDB collection indexes initialized successfully.")
    except Exception as e:
        logger.warning(f"Could not build indexes: {e}")

def get_database():
    return db
