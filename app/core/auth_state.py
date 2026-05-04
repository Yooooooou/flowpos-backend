from collections import defaultdict, deque
from datetime import datetime, timezone

try:
    from redis import Redis
except ImportError:  # pragma: no cover
    Redis = None

from app.core.config import get_settings

_redis_client: Redis | None = None
_login_failures: dict[str, deque[datetime]] = defaultdict(deque)
_revoked_tokens: set[str] = set()


def _redis() -> Redis | None:
    global _redis_client
    settings = get_settings()
    if not settings.redis_url or Redis is None:
        return None
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def clear_local_state() -> None:
    _login_failures.clear()
    _revoked_tokens.clear()


def check_login_rate_limit(key: str, attempts: int, window_seconds: int) -> bool:
    redis = _redis()
    if redis is not None:
        redis_key = f"flowpos:login-failures:{key}"
        count = redis.incr(redis_key)
        if count == 1:
            redis.expire(redis_key, window_seconds)
        return int(count) <= attempts

    now = datetime.now(timezone.utc)
    window_started_at = now.timestamp() - window_seconds
    failures = _login_failures[key]
    while failures and failures[0].timestamp() < window_started_at:
        failures.popleft()
    failures.append(now)
    return len(failures) <= attempts


def clear_login_failures(key: str) -> None:
    redis = _redis()
    if redis is not None:
        redis.delete(f"flowpos:login-failures:{key}")
        return
    _login_failures.pop(key, None)


def revoke_access_token(jti: str, ttl_seconds: int) -> None:
    redis = _redis()
    if redis is not None:
        redis.setex(f"flowpos:revoked-access:{jti}", ttl_seconds, "1")
        return
    _revoked_tokens.add(jti)


def is_access_token_revoked(jti: str) -> bool:
    redis = _redis()
    if redis is not None:
        return redis.exists(f"flowpos:revoked-access:{jti}") == 1
    return jti in _revoked_tokens
