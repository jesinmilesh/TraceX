import asyncio
import logging
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

logger = logging.getLogger("tracex.database")

# Configure dnspython with high-availability public DNS fallbacks
# to avoid Windows SRV lookup timeouts on mongodb+srv
try:
    import dns.resolver
    resolver = dns.resolver.get_default_resolver()
    for ns in ['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1']:
        if ns not in resolver.nameservers:
            resolver.nameservers.append(ns)
    resolver.timeout = 5.0
    resolver.lifetime = 10.0
except Exception as e:
    logger.debug(f"DNS resolver fallback note: {e}")

client: AsyncIOMotorClient = None
db = None

def _build_direct_replica_set_uri(srv_uri: str) -> str:
    """If SRV DNS fails, dynamically generate direct shard URI using credentials from MONGODB_URI."""
    if not srv_uri or "mongodb+srv://" not in srv_uri:
        return ""
    try:
        parts = srv_uri.replace("mongodb+srv://", "").split("@")
        if len(parts) == 2:
            creds = parts[0]
            rest = parts[1]
            host_and_db = rest.split("/")
            db_part = host_and_db[1] if len(host_and_db) > 1 else settings.MONGODB_DATABASE
            scheme = "mongodb"
            return (
                f"{scheme}://{creds}@"
                "ac-hssewwn-shard-00-00.1hmtgyn.mongodb.net:27017,"
                "ac-hssewwn-shard-00-01.1hmtgyn.mongodb.net:27017,"
                "ac-hssewwn-shard-00-02.1hmtgyn.mongodb.net:27017/"
                f"{db_name}?"
                "ssl=true&replicaSet=atlas-6zoqof-shard-0&authSource=admin&retryWrites=true&w=majority"
            )
    except Exception:
        pass
    return ""

async def _attempt_client_connection(uri: str, label: str):
    logger.info(f"Connecting to MongoDB ({label})...")
    conn_kwargs = {
        "serverSelectionTimeoutMS": 10000,
        "connectTimeoutMS": 10000,
        "socketTimeoutMS": 15000,
        "retryWrites": True
    }
    
    # Always supply certifi CA bundle for TLS/SSL connections on Windows
    if "mongodb+srv://" in uri or "ssl=true" in uri.lower() or "tls=true" in uri.lower():
        conn_kwargs["tlsCAFile"] = certifi.where()

    candidate_client = AsyncIOMotorClient(uri, **conn_kwargs)
    candidate_db = candidate_client[settings.MONGODB_DATABASE]
    
    # Verify connection with ping
    await candidate_client.admin.command('ping')
    return candidate_client, candidate_db

async def connect_to_mongo():
    global client, db
    
    # Connection candidate list: Primary URI from settings, then Direct Replica Set URI
    candidates = [
        (settings.MONGODB_URI, "Primary Cluster URI"),
    ]
    direct_fallback = _build_direct_replica_set_uri(settings.MONGODB_URI)
    if direct_fallback:
        candidates.append((direct_fallback, "Direct Replica Set Fallback"))

    last_error = None
    for uri, label in candidates:
        if not uri:
            continue
        for attempt in range(1, 3):
            try:
                candidate_client, candidate_db = await _attempt_client_connection(uri, f"{label} - Attempt {attempt}/2")
                client = candidate_client
                db = candidate_db
                logger.info(f"Connected successfully to MongoDB ({label}, database: {settings.MONGODB_DATABASE})")
                await init_db_indexes()
                return
            except Exception as e:
                last_error = e
                logger.warning(f"Connection to {label} attempt {attempt} failed: {e}")
                await asyncio.sleep(1)

    logger.error(f"All MongoDB connection candidates failed. Last error: {last_error}")
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
