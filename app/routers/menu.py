from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.deps import get_current_user, require_roles
from app.models import MenuCategory, MenuItem, MenuItemPriceHistory, OrderItem, User, UserRole
from app.schemas import (
    BulkAvailabilityUpdate,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    MenuItemCreate,
    MenuItemPriceHistoryRead,
    MenuItemRead,
    MenuItemUpdate,
)

router = APIRouter(prefix="/menu", tags=["menu"])


def _item_stmt():
    return select(MenuItem).options(selectinload(MenuItem.category))


# ─── Categories ───────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryRead])
def list_categories(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MenuCategory]:
    return list(db.scalars(select(MenuCategory).order_by(MenuCategory.sort_order, MenuCategory.name)))


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> MenuCategory:
    if db.scalar(select(MenuCategory).where(MenuCategory.name == payload.name)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists")
    category = MenuCategory(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> MenuCategory:
    category = db.get(MenuCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> None:
    category = db.get(MenuCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    item_count = db.scalar(select(MenuItem).where(MenuItem.category_id == category_id).limit(1))
    if item_count is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category has menu items. Move or delete them first.",
        )
    db.delete(category)
    db.commit()


# ─── Items ────────────────────────────────────────────────────────────────────

@router.get("/items", response_model=list[MenuItemRead])
def list_items(
    available_only: bool = False,
    category_id: int | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MenuItem]:
    stmt = _item_stmt().order_by(MenuItem.name)
    if available_only:
        stmt = stmt.where(MenuItem.is_available.is_(True))
    if category_id is not None:
        stmt = stmt.where(MenuItem.category_id == category_id)
    if q:
        stmt = stmt.where(MenuItem.name.ilike(f"%{q.strip()}%"))
    return list(db.scalars(stmt))


@router.get("/items/barcode/{barcode}", response_model=MenuItemRead)
def get_item_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> MenuItem:
    item = db.scalar(
        _item_stmt().where(MenuItem.barcode == barcode, MenuItem.is_available.is_(True))
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Available menu item not found")
    return item


@router.post("/items", response_model=MenuItemRead, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: MenuItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> MenuItem:
    if db.get(MenuCategory, payload.category_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    item = MenuItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/bulk-availability", response_model=dict)
def bulk_availability(
    payload: BulkAvailabilityUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> dict:
    db.execute(
        sa_update(MenuItem)
        .where(MenuItem.id.in_(payload.item_ids))
        .values(is_available=payload.is_available)
    )
    db.commit()
    return {"updated": len(payload.item_ids)}


@router.patch("/items/{item_id}", response_model=MenuItemRead)
def update_item(
    item_id: int,
    payload: MenuItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> MenuItem:
    item = db.scalar(_item_stmt().where(MenuItem.id == item_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and db.get(MenuCategory, data["category_id"]) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    # Track price change
    if "price" in data and data["price"] != item.price:
        db.add(MenuItemPriceHistory(
            menu_item_id=item.id,
            old_price=item.price,
            new_price=data["price"],
            changed_by_id=current_user.id,
        ))
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return db.scalar(_item_stmt().where(MenuItem.id == item.id))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> None:
    item = db.get(MenuItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    in_orders = db.scalar(select(OrderItem).where(OrderItem.menu_item_id == item_id).limit(1))
    if in_orders is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item has order history. Set is_available=false instead of deleting.",
        )
    db.delete(item)
    db.commit()


@router.get("/items/{item_id}/price-history", response_model=list[MenuItemPriceHistoryRead])
def get_price_history(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> list[MenuItemPriceHistory]:
    if db.get(MenuItem, item_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    return list(
        db.scalars(
            select(MenuItemPriceHistory)
            .options(selectinload(MenuItemPriceHistory.changed_by))
            .where(MenuItemPriceHistory.menu_item_id == item_id)
            .order_by(MenuItemPriceHistory.changed_at.desc())
            .limit(50)
        )
    )
