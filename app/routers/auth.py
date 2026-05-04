from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token, get_password_hash, hash_token, verify_password
from app.db.session import get_db
from app.deps import get_current_user
from app.models import AuthAuditEvent, AuthSession, User
from app.schemas import ChangePasswordRequest, LoginRequest, RefreshTokenRequest, Token, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
_login_failures: dict[str, deque[datetime]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _rate_limit_key(request: Request, username: str) -> str:
    return f"{_client_ip(request)}:{username.lower()}"


def _check_login_rate_limit(request: Request, username: str) -> None:
    key = _rate_limit_key(request, username)
    now = datetime.now(timezone.utc)
    window_started_at = now - timedelta(seconds=settings.login_rate_limit_window_seconds)
    failures = _login_failures[key]
    while failures and failures[0] < window_started_at:
        failures.popleft()
    if len(failures) >= settings.login_rate_limit_attempts:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts")


def _record_failed_login(request: Request, username: str) -> None:
    _login_failures[_rate_limit_key(request, username)].append(datetime.now(timezone.utc))


def _clear_failed_logins(request: Request, username: str) -> None:
    _login_failures.pop(_rate_limit_key(request, username), None)


def _audit_auth_event(db: Session, request: Request, event_type: str, username: str | None, user: User | None) -> None:
    db.add(
        AuthAuditEvent(
            user_id=user.id if user else None,
            username=username,
            event_type=event_type,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )


def _issue_token_pair(db: Session, request: Request, user: User) -> Token:
    refresh_token = create_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.refresh_token_expire_minutes)
    db.add(
        AuthSession(
            user_id=user.id,
            refresh_token_hash=hash_token(refresh_token),
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            expires_at=expires_at,
        )
    )
    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


def _is_expired(expires_at: datetime, now: datetime) -> bool:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= now


@router.post("/login", response_model=Token)
async def login(request: Request, db: Session = Depends(get_db)) -> Token:
    content_type = request.headers.get("content-type", "").lower()

    if "application/json" in content_type:
        payload = LoginRequest.model_validate(await request.json())
        username = payload.username
        password = payload.password
    else:
        form = await request.form()
        username = str(form.get("username", "")).strip()
        password = str(form.get("password", ""))

    _check_login_rate_limit(request, username)
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not verify_password(password, user.hashed_password):
        _record_failed_login(request, username)
        _audit_auth_event(db, request, "login.failed", username, user)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        _audit_auth_event(db, request, "login.inactive", username, user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    _clear_failed_logins(request, username)
    token = _issue_token_pair(db, request, user)
    _audit_auth_event(db, request, "login.succeeded", username, user)
    db.commit()
    return token


@router.post("/refresh", response_model=Token)
def refresh_token(payload: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)) -> Token:
    token_hash = hash_token(payload.refresh_token)
    session = db.scalar(select(AuthSession).where(AuthSession.refresh_token_hash == token_hash))
    now = datetime.now(timezone.utc)
    if session is None or session.revoked_at is not None or _is_expired(session.expires_at, now):
        _audit_auth_event(db, request, "refresh.failed", None, None)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        session.revoked_at = now
        _audit_auth_event(db, request, "refresh.inactive", None, user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user")

    session.revoked_at = now
    token = _issue_token_pair(db, request, user)
    _audit_auth_event(db, request, "refresh.succeeded", user.username, user)
    db.commit()
    return token


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)) -> None:
    session = db.scalar(select(AuthSession).where(AuthSession.refresh_token_hash == hash_token(payload.refresh_token)))
    if session is not None and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        user = db.get(User, session.user_id)
        _audit_auth_event(db, request, "logout.succeeded", user.username if user else None, user)
        db.commit()


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not verify_password(payload.current_password, current_user.hashed_password):
        _audit_auth_event(db, request, "password_change.failed", current_user.username, current_user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.query(AuthSession).filter(
        AuthSession.user_id == current_user.id,
        AuthSession.revoked_at.is_(None),
    ).update({"revoked_at": datetime.now(timezone.utc)})
    _audit_auth_event(db, request, "password_change.succeeded", current_user.username, current_user)
    db.commit()


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
