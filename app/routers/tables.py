from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user, require_roles
from app.models import CafeTable, Order, OrderStatus, User, UserRole
from app.schemas import TableCreate, TableOverview, TableRead, TableUpdate

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("", response_model=list[TableRead])
def list_tables(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CafeTable]:
    return list(db.scalars(select(CafeTable).order_by(CafeTable.number)))


@router.get("/overview", response_model=list[TableOverview])
def table_overview(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[TableOverview]:
    tables = list(db.scalars(select(CafeTable).order_by(CafeTable.number)))
    active_orders = list(
        db.scalars(
            select(Order).where(
                Order.status.in_([OrderStatus.pending, OrderStatus.in_progress, OrderStatus.ready, OrderStatus.served])
            )
        )
    )
    latest_by_table: dict[int, Order] = {}
    for order in active_orders:
        current = latest_by_table.get(order.table_id)
        if current is None or current.created_at < order.created_at:
            latest_by_table[order.table_id] = order

    results: list[TableOverview] = []
    for table in tables:
        order = latest_by_table.get(table.id)
        results.append(
            TableOverview(
                **TableRead.model_validate(table).model_dump(),
                active_order_id=order.id if order else None,
                active_order_status=order.status if order else None,
                active_order_total=order.total_amount if order else None,
                active_waiter_name=order.waiter.full_name if order and order.waiter else None,
            )
        )
    return results


@router.get("/{table_id}/active-order")
def get_table_active_order(
    table_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    table = db.get(CafeTable, table_id)
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    order = db.scalar(
        select(Order)
        .where(
            Order.table_id == table_id,
            Order.status.in_([OrderStatus.pending, OrderStatus.in_progress, OrderStatus.ready, OrderStatus.served]),
        )
        .order_by(Order.created_at.desc())
    )
    return {"table_id": table_id, "active_order_id": order.id if order else None}


@router.post("", response_model=TableRead, status_code=status.HTTP_201_CREATED)
def create_table(
    payload: TableCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> CafeTable:
    if db.scalar(select(CafeTable).where(CafeTable.number == payload.number)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Table number already exists")
    table = CafeTable(**payload.model_dump())
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


@router.patch("/{table_id}", response_model=TableRead)
def update_table(
    table_id: int,
    payload: TableUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> CafeTable:
    table = db.get(CafeTable, table_id)
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(table, key, value)
    db.commit()
    db.refresh(table)
    return table
