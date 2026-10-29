import hashlib
import json
from typing import Any, Union, Dict

def calculate_sha256(data: bytes) -> str:
    """Compute SHA-256 hex digest for binary data."""
    return hashlib.sha256(data).hexdigest()

def canonicalize_json(obj: Any) -> Any:
    """Recursively sort dictionary keys for deterministic canonical JSON string."""
    if isinstance(obj, dict):
        return {k: canonicalize_json(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [canonicalize_json(item) for item in obj]
    return obj

def compute_telemetry_hash(device_id: str, timestamp: int, lat: float, lng: float, event_type: str) -> str:
    """Compute deterministic SHA-256 integrity hash for a telemetry event."""
    payload_str = f"{device_id}-{timestamp}-{float(lat):.6f}-{float(lng):.6f}-{event_type}"
    return hashlib.sha256(payload_str.encode('utf-8')).hexdigest()

def calculate_telemetry_hash(event_data: Union[Dict[str, Any], Any]) -> str:
    """Compute deterministic SHA-256 integrity hash from telemetry dict."""
    if isinstance(event_data, dict):
        device_id = str(event_data.get("device_id", ""))
        timestamp = int(event_data.get("timestamp", 0))
        lat = float(event_data.get("latitude", 0.0))
        lng = float(event_data.get("longitude", 0.0))
        event_type = str(event_data.get("event_type", "LOCATION_UPDATE"))
        return compute_telemetry_hash(device_id, timestamp, lat, lng, event_type)
    return hashlib.sha256(str(event_data).encode('utf-8')).hexdigest()

def compute_custody_chain_hash(previous_hash: str, custody_data: dict) -> str:
    """
    Generate tamper-evident custody link:
    SHA-256(previous_hash + canonical_json(custody_data))
    """
    canonical_repr = json.dumps(canonicalize_json(custody_data), separators=(',', ':'))
    raw_chain_string = f"{previous_hash}|{canonical_repr}"
    return hashlib.sha256(raw_chain_string.encode('utf-8')).hexdigest()
