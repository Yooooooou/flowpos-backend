import json
import logging
import time
from collections import Counter
from uuid import uuid4

from fastapi import Request, Response

logger = logging.getLogger("flowpos.access")
REQUEST_COUNT: Counter[str] = Counter()
REQUEST_LATENCY_SECONDS: Counter[str] = Counter()


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def get_request_id(request: Request) -> str:
    return request.headers.get("x-request-id") or str(uuid4())


async def observability_middleware(request: Request, call_next) -> Response:
    request_id = get_request_id(request)
    started_at = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        elapsed = time.perf_counter() - started_at
        route = request.url.path
        key = f"{request.method} {route} {status_code}"
        REQUEST_COUNT[key] += 1
        REQUEST_LATENCY_SECONDS[key] += elapsed
        logger.info(
            json.dumps(
                {
                    "event": "http.request",
                    "request_id": request_id,
                    "method": request.method,
                    "path": route,
                    "status_code": status_code,
                    "duration_ms": round(elapsed * 1000, 2),
                    "client": request.client.host if request.client else None,
                },
                separators=(",", ":"),
            )
        )
        if "response" in locals():
            response.headers["x-request-id"] = request_id


def render_metrics() -> str:
    lines = [
        "# TYPE flowpos_http_requests_total counter",
        "# TYPE flowpos_http_request_latency_seconds counter",
    ]
    for key, value in sorted(REQUEST_COUNT.items()):
        method, path, status_code = key.rsplit(" ", 2)
        labels = f'method="{method}",path="{path}",status_code="{status_code}"'
        lines.append(f"flowpos_http_requests_total{{{labels}}} {value}")
        lines.append(f"flowpos_http_request_latency_seconds{{{labels}}} {REQUEST_LATENCY_SECONDS[key]:.6f}")
    return "\n".join(lines) + "\n"
