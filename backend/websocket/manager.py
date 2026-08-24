"""
WebSocket Connection Manager

Manages all active WebSocket connections grouped by room_code.
Each room has:
  - connected clients: { user_id: { ws, name, role } }
  - broadcasts events to all or specific clients in a room

Thread-safe for asyncio (single event loop).
"""
import json
from typing import Dict
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # room_code -> { user_id: {"ws": WebSocket, "name": str, "role": str} }
        self.rooms: Dict[str, Dict[str, dict]] = {}

    # ── Connect / disconnect ───────────────────────────────────────────────────

    async def connect(self, room_code: str, user_id: str, name: str, role: str, ws: WebSocket):
        await ws.accept()
        if room_code not in self.rooms:
            self.rooms[room_code] = {}
        self.rooms[room_code][user_id] = {"ws": ws, "name": name, "role": role}

    def disconnect(self, room_code: str, user_id: str):
        if room_code in self.rooms:
            self.rooms[room_code].pop(user_id, None)
            if not self.rooms[room_code]:
                del self.rooms[room_code]

    # ── Send helpers ──────────────────────────────────────────────────────────

    async def send_to(self, room_code: str, user_id: str, event: dict):
        """Send event to one specific user in a room."""
        room = self.rooms.get(room_code, {})
        client = room.get(user_id)
        if client:
            try:
                await client["ws"].send_text(json.dumps(event))
            except Exception:
                self.disconnect(room_code, user_id)

    async def broadcast(self, room_code: str, event: dict, exclude: str = None):
        """Broadcast event to all users in a room, optionally excluding one."""
        room = self.rooms.get(room_code, {})
        dead = []
        for uid, client in room.items():
            if uid == exclude:
                continue
            try:
                await client["ws"].send_text(json.dumps(event))
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.disconnect(room_code, uid)

    async def broadcast_to_role(self, room_code: str, role: str, event: dict):
        """Broadcast only to users with a specific role (admin/student)."""
        room = self.rooms.get(room_code, {})
        dead = []
        for uid, client in room.items():
            if client["role"] != role:
                continue
            try:
                await client["ws"].send_text(json.dumps(event))
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.disconnect(room_code, uid)

    # ── Room info ─────────────────────────────────────────────────────────────

    def get_participants(self, room_code: str) -> list[dict]:
        room = self.rooms.get(room_code, {})
        return [
            {"user_id": uid, "name": c["name"], "role": c["role"]}
            for uid, c in room.items()
        ]

    def count(self, room_code: str) -> int:
        return len(self.rooms.get(room_code, {}))

    def is_connected(self, room_code: str, user_id: str) -> bool:
        return user_id in self.rooms.get(room_code, {})


# Global singleton — imported everywhere
manager = ConnectionManager()
