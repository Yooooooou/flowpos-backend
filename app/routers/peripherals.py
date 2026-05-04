from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import require_roles
from app.models import Order, PeripheralDevice, PeripheralType, PrintJob, PrintJobStatus, User, UserRole
from app.schemas import (
    PeripheralDeviceCreate,
    PeripheralDeviceRead,
    PeripheralDeviceUpdate,
    PrintJobCreate,
    PrintJobRead,
    PrintJobUpdate,
)

router = APIRouter(prefix="/peripherals", tags=["peripherals"])


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
