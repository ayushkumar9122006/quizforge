import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from database.config import AsyncSessionLocal
from utils.security import decode_token
from crud.user import get_user_by_id
from crud.session import get_session_by_code
from websocket.manager import manager
from websocket.events import evt_participants, evt_joined, evt_left, evt_error

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/{room_code}")
async def websocket_endpoint(
    room_code: str,
    websocket: WebSocket,
    token: str = Query(...),
):
    # Authenticate via token before accepting
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.accept()
        await websocket.send_text(json.dumps(evt_error("Invalid token")))
        await websocket.close(code=4001)
        return

    user_id = payload.get("sub")

    # Use manual DB session — Depends(get_db) closes too early for WebSocket
    async with AsyncSessionLocal() as db:
        user = await get_user_by_id(db, user_id)
        if not user:
            await websocket.accept()
            await websocket.send_text(json.dumps(evt_error("User not found")))
            await websocket.close(code=4002)
            return

        session = await get_session_by_code(db, room_code)
        if not session:
            await websocket.accept()
            await websocket.send_text(json.dumps(evt_error("Room not found")))
            await websocket.close(code=4004)
            return

        user_name = user.name
        user_role = user.role

    # DB session is now closed — connect WebSocket
    await manager.connect(room_code, user_id, user_name, user_role, websocket)

    # Send participant list to new user
    await manager.send_to(
        room_code, user_id,
        evt_participants(manager.get_participants(room_code))
    )

    # Broadcast join to everyone else
    await manager.broadcast(
        room_code,
        evt_joined(user_id, user_name, user_role),
        exclude=user_id,
    )

    # Message loop
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "ping":
                await manager.send_to(room_code, user_id, {"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_code, user_id)
        await manager.broadcast(room_code, evt_left(user_id, user_name))