from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Query, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.observability import configure_logging, observability_middleware, render_metrics
from app.core.security import decode_access_token
from app.db.session import Base, engine, get_db
from app.models import User, UserRole
from app.realtime import manager as websocket_manager
from app.routers import analytics, auth, menu, orders, peripherals, pos, tables, users

settings = get_settings()
configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
    await websocket_manager.startup()
    yield
    await websocket_manager.shutdown()

def create_app() -> FastAPI:
    docs_url = "/docs" if settings.docs_enabled else None
    redoc_url = "/redoc" if settings.docs_enabled else None
    openapi_url = "/openapi.json" if settings.docs_enabled else None
    application = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Flow-POS API for waiter-kitchen order processing and cafe operations.",
        lifespan=lifespan,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.middleware("http")(observability_middleware)

    application.include_router(auth.router)
    application.include_router(users.router)
    application.include_router(tables.router)
    application.include_router(menu.router)
    application.include_router(orders.router)
    application.include_router(pos.router)
    application.include_router(analytics.router)
    application.include_router(peripherals.router)

    @application.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": settings.app_name}

    @application.get("/health/ready", tags=["system"])
    async def readiness(db: Session = Depends(get_db)) -> dict[str, str]:
        db.execute(text("SELECT 1"))
        if settings.redis_url and websocket_manager.redis is not None:
            await websocket_manager.redis.ping()
        return {"status": "ready"}

    @application.get("/metrics", tags=["system"])
    def metrics() -> Response:
        return Response(render_metrics(), media_type="text/plain; version=0.0.4")

    # Serve built frontend (if present)
    dist = Path(__file__).parent.parent / "frontend" / "dist"
    if dist.exists():
        application.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @application.get("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str) -> FileResponse:
            return FileResponse(dist / "index.html")

    @application.websocket("/ws/orders")
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
    return application


app = create_app()
