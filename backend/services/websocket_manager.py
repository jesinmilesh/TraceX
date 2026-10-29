import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("tracex.websocket")

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast raw payload dictionary to all active investigator connections."""
        disconnected = []
        payload = json.dumps(message)
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                disconnected.append(connection)

        for dead_conn in disconnected:
            self.disconnect(dead_conn)

    async def broadcast_event(
        self,
        event: str,
        device_id: str,
        case_id: str,
        data: Dict[str, Any],
        timestamp: Optional[str] = None
    ):
        """Broadcast standardized forensic event complying with TraceX production specifications."""
        now_iso = timestamp or datetime.now(timezone.utc).isoformat()
        payload = {
            "event": event,
            "type": event,  # dual-compatibility with dashboard event handlers
            "device_id": device_id,
            "case_id": case_id,
            "timestamp": now_iso,
            "data": data
        }
        await self.broadcast(payload)

ws_manager = ConnectionManager()
