import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.db.session import get_db
from app.deps import require_roles
from app.models import DeviceAgentToken, Order, PeripheralDevice, PeripheralType, PrintJob, PrintJobLease, PrintJobStatus, User, UserRole
from app.schemas import (
    AgentJobClaim,
    AgentJobLeaseRead,
    DeviceAgentTokenCreate,
    DeviceAgentTokenCreated,
    PeripheralDeviceCreate,
    PeripheralDeviceRead,
    PeripheralDeviceUpdate,
    PrintJobCreate,
    PrintJobRead,
    PrintJobUpdate,
)

router = APIRouter(prefix="/peripherals", tags=["peripherals"])


def _agent_device(db: Session, token: str | None) -> PeripheralDevice:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing device agent token")
    agent_token = db.scalar(
        select(DeviceAgentToken).where(
            DeviceAgentToken.token_hash == hash_token(token),
            DeviceAgentToken.is_active.is_(True),
            DeviceAgentToken.revoked_at.is_(None),
        )
    )
    if agent_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device agent token")
    device = db.get(PeripheralDevice, agent_token.device_id)
    if device is None or not device.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is inactive")
    return device


def _is_expired(value: datetime, now: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value <= now


@router.get("/devices", response_model=list[PeripheralDeviceRead])
def list_devices(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> list[PeripheralDevice]:
    return list(db.scalars(select(PeripheralDevice).order_by(PeripheralDevice.name)))


@router.post("/devices", response_model=PeripheralDeviceRead, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: PeripheralDeviceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> PeripheralDevice:
    device = PeripheralDevice(**payload.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.patch("/devices/{device_id}", response_model=PeripheralDeviceRead)
def update_device(
    device_id: int,
    payload: PeripheralDeviceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> PeripheralDevice:
    device = db.get(PeripheralDevice, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    return device


@router.post("/agent-tokens", response_model=DeviceAgentTokenCreated, status_code=status.HTTP_201_CREATED)
def create_agent_token(
    payload: DeviceAgentTokenCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> DeviceAgentTokenCreated:
    device = db.get(PeripheralDevice, payload.device_id)
    if device is None or not device.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active device not found")
    token = secrets.token_urlsafe(32)
    agent_token = DeviceAgentToken(device_id=device.id, name=payload.name, token_hash=hash_token(token), is_active=True)
    db.add(agent_token)
    db.commit()
    db.refresh(agent_token)
    return DeviceAgentTokenCreated(id=agent_token.id, device_id=device.id, name=agent_token.name, token=token)


@router.get("/jobs", response_model=list[PrintJobRead])
def list_jobs(
    device_id: int | None = None,
    job_status: PrintJobStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager, UserRole.kitchen)),
) -> list[PrintJob]:
    stmt = select(PrintJob).order_by(PrintJob.created_at)
    if device_id is not None:
        stmt = stmt.where(PrintJob.device_id == device_id)
    if job_status is not None:
        stmt = stmt.where(PrintJob.status == job_status)
    return list(db.scalars(stmt))


@router.post("/jobs", response_model=PrintJobRead, status_code=status.HTTP_201_CREATED)
def create_job(
    payload: PrintJobCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager, UserRole.waiter)),
) -> PrintJob:
    device = db.get(PeripheralDevice, payload.device_id)
    if device is None or not device.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active device not found")
    if payload.order_id is not None and db.get(Order, payload.order_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    job = PrintJob(**payload.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.post("/orders/{order_id}/receipt", response_model=PrintJobRead, status_code=status.HTTP_201_CREATED)
def create_receipt_job(
    order_id: int,
    device_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager, UserRole.waiter)),
) -> PrintJob:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if device_id is None:
        device = db.scalar(
            select(PeripheralDevice)
            .where(
                PeripheralDevice.device_type == PeripheralType.receipt_printer,
                PeripheralDevice.is_active.is_(True),
            )
            .order_by(PeripheralDevice.id)
        )
    else:
        device = db.get(PeripheralDevice, device_id)

    if device is None or not device.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active receipt printer not found")

    job = PrintJob(
        device_id=device.id,
        order_id=order.id,
        job_type="receipt",
        payload={"order_id": order.id, "total_amount": str(order.total_amount), "table_id": order.table_id},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.patch("/jobs/{job_id}", response_model=PrintJobRead)
def update_job(
    job_id: int,
    payload: PrintJobUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager, UserRole.kitchen)),
) -> PrintJob:
    job = db.get(PrintJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    job.status = payload.status
    job.error_message = payload.error_message
    if payload.status in {PrintJobStatus.completed, PrintJobStatus.failed}:
        job.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job


@router.post("/agent/jobs/claim", response_model=AgentJobLeaseRead)
def claim_agent_job(
    payload: AgentJobClaim,
    x_device_agent_token: str | None = Header(default=None, alias="X-Device-Agent-Token"),
    db: Session = Depends(get_db),
) -> AgentJobLeaseRead:
    device = _agent_device(db, x_device_agent_token)
    now = datetime.now(timezone.utc)
    expired_leases = [lease for lease in db.scalars(select(PrintJobLease)) if _is_expired(lease.expires_at, now)]
    for lease in expired_leases:
        if lease.job.status == PrintJobStatus.processing:
            lease.job.status = PrintJobStatus.queued
        db.delete(lease)

    job = db.scalar(
        select(PrintJob)
        .where(PrintJob.device_id == device.id, PrintJob.status == PrintJobStatus.queued)
        .order_by(PrintJob.created_at)
    )
    if job is None:
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No queued jobs")

    lease_token = secrets.token_urlsafe(32)
    lease = PrintJobLease(
        job_id=job.id,
        device_id=device.id,
        lease_token_hash=hash_token(lease_token),
        expires_at=now + timedelta(seconds=payload.lease_seconds),
        heartbeat_at=now,
    )
    job.status = PrintJobStatus.processing
    db.add(lease)
    db.commit()
    db.refresh(job)
    return AgentJobLeaseRead(job=job, lease_token=lease_token, expires_at=lease.expires_at)


@router.patch("/agent/jobs/{job_id}", response_model=PrintJobRead)
def update_agent_job(
    job_id: int,
    payload: PrintJobUpdate,
    lease_token: str = Header(alias="X-Job-Lease-Token"),
    x_device_agent_token: str | None = Header(default=None, alias="X-Device-Agent-Token"),
    db: Session = Depends(get_db),
) -> PrintJob:
    device = _agent_device(db, x_device_agent_token)
    job = db.get(PrintJob, job_id)
    if job is None or job.device_id != device.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    lease = db.scalar(
        select(PrintJobLease).where(
            PrintJobLease.job_id == job.id,
            PrintJobLease.device_id == device.id,
            PrintJobLease.lease_token_hash == hash_token(lease_token),
        )
    )
    now = datetime.now(timezone.utc)
    if lease is None or _is_expired(lease.expires_at, now):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job lease is missing or expired")
    job.status = payload.status
    job.error_message = payload.error_message
    if payload.status == PrintJobStatus.failed:
        retry_count = int(job.payload.get("retry_count", 0)) + 1
        job.payload = {**job.payload, "retry_count": retry_count}
    if payload.status in {PrintJobStatus.completed, PrintJobStatus.failed}:
        job.processed_at = now
        db.delete(lease)
    else:
        lease.heartbeat_at = now
    db.commit()
    db.refresh(job)
    return job
