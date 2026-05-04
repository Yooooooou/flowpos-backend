from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import Base, engine, get_db
from app.models import User, UserRole
from app.realtime import manager as websocket_manager
from app.routers import analytics, auth, menu, orders, peripherals, tables, users

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
    await websocket_manager.startup()
    yield
    await websocket_manager.shutdown()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Flow-POS API for waiter-kitchen order processing and cafe operations.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tables.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(analytics.router)
app.include_router(peripherals.router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/health/ready", tags=["system"])
async def readiness(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    if settings.redis_url and websocket_manager.redis is not None:
        await websocket_manager.redis.ping()
    return {"status": "ready"}


@app.websocket("/ws/orders")
async def orders_socket(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> None:
    subject = decode_access_token(token)
    if subject is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = db.get(User, int(subject))
    if user is None or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    group = user.role.value
    if user.role == UserRole.waiter:
        group = f"waiter:{user.id}"

    await websocket_manager.connect(group, websocket)
    try:
        await websocket.send_json({"type": "connected", "group": group})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_manager.disconnect(group, websocket)
