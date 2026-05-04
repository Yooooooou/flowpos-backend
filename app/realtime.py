import asyncio
import json
from collections import defaultdict
from contextlib import suppress

from fastapi import WebSocket

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover - local fallback when redis is not installed
    Redis = None

from app.core.config import get_settings


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, set[WebSocket]] = defaultdict(set)
        self.redis: Redis | None = None
        self.listener_task: asyncio.Task | None = None
        self.channel = "flowpos:orders"

    async def startup(self) -> None:
        settings = get_settings()
        if settings.redis_url and Redis is not None:
            self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
            self.listener_task = asyncio.create_task(self._listen())

    async def shutdown(self) -> None:
        if self.listener_task:
            self.listener_task.cancel()
            with suppress(asyncio.CancelledError):
                await self.listener_task
        if self.redis:
            await self.redis.aclose()

    async def connect(self, group: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[group].add(websocket)

    def disconnect(self, group: str, websocket: WebSocket) -> None:
        self.active_connections[group].discard(websocket)

    async def publish(self, groups: list[str], payload: dict) -> None:
        message = {"groups": groups, "payload": payload}
        if self.redis is not None:
            await self.redis.publish(self.channel, json.dumps(message))
        else:
            await self.broadcast_local(groups, payload)

    async def broadcast_local(self, groups: list[str], payload: dict) -> None:
        dead_connections: list[tuple[str, WebSocket]] = []
        for group in groups:
            for websocket in list(self.active_connections[group]):
                try:
                    await websocket.send_json(payload)
                except RuntimeError:
                    dead_connections.append((group, websocket))
        for group, websocket in dead_connections:
            self.disconnect(group, websocket)

    async def _listen(self) -> None:
        if self.redis is None:
            return
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(self.channel)
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                data = json.loads(message["data"])
                await self.broadcast_local(data["groups"], data["payload"])
        finally:
            await pubsub.unsubscribe(self.channel)
            await pubsub.aclose()


manager = ConnectionManager()
