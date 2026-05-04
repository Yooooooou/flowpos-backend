from decimal import Decimal

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import Base, SessionLocal, engine
from app.models import CafeTable, MenuCategory, MenuItem, PeripheralDevice, PeripheralType, TableStatus, User, UserRole


def upsert_user(db, username: str, full_name: str, role: UserRole, password: str) -> None:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        db.add(
            User(
                username=username,
                full_name=full_name,
                role=role,
                hashed_password=get_password_hash(password),
                is_active=True,
            )
        )


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        upsert_user(db, "manager", "Cafe Manager", UserRole.manager, "manager123")
        upsert_user(db, "waiter", "Demo Waiter", UserRole.waiter, "waiter123")
        upsert_user(db, "kitchen", "Kitchen Display", UserRole.kitchen, "kitchen123")

        for number, seats, location in [
            ("1", 2, "Window"),
            ("2", 4, "Main hall"),
            ("3", 4, "Main hall"),
            ("4", 6, "Family zone"),
        ]:
            if db.scalar(select(CafeTable).where(CafeTable.number == number)) is None:
                db.add(CafeTable(number=number, seats=seats, location=location, status=TableStatus.free))

        food = db.scalar(select(MenuCategory).where(MenuCategory.name == "Food"))
        if food is None:
            food = MenuCategory(name="Food", sort_order=1)
            db.add(food)
            db.flush()

        drinks = db.scalar(select(MenuCategory).where(MenuCategory.name == "Drinks"))
        if drinks is None:
            drinks = MenuCategory(name="Drinks", sort_order=2)
            db.add(drinks)
            db.flush()

        samples = [
            (food.id, "Chicken Caesar", "460000000001", "Salad with chicken, lettuce, parmesan", Decimal("2900.00"), 12),
            (food.id, "Beef Burger", "460000000002", "Burger with fries", Decimal("3600.00"), 18),
            (food.id, "Tomato Soup", "460000000003", "Warm soup with basil", Decimal("1800.00"), 10),
            (drinks.id, "Americano", "460000000004", "Classic black coffee", Decimal("900.00"), 4),
            (drinks.id, "Lemonade", "460000000005", "House citrus lemonade", Decimal("1200.00"), 3),
        ]
        for category_id, name, barcode, description, price, prep_time in samples:
            item = db.scalar(select(MenuItem).where(MenuItem.name == name))
            if item is None:
                db.add(
                    MenuItem(
                        category_id=category_id,
                        name=name,
                        barcode=barcode,
                        description=description,
                        price=price,
                        preparation_time_minutes=prep_time,
                        is_available=True,
                    )
                )
            elif item.barcode is None:
                item.barcode = barcode

        if db.scalar(select(PeripheralDevice).where(PeripheralDevice.identifier == "receipt-printer-main")) is None:
            db.add(
                PeripheralDevice(
                    name="Main receipt printer",
                    device_type=PeripheralType.receipt_printer,
                    identifier="receipt-printer-main",
                    location="Cash desk",
                    is_active=True,
                )
            )
        if db.scalar(select(PeripheralDevice).where(PeripheralDevice.identifier == "cash-drawer-main")) is None:
            db.add(
                PeripheralDevice(
                    name="Main cash drawer",
                    device_type=PeripheralType.cash_drawer,
                    identifier="cash-drawer-main",
                    location="Cash desk",
                    is_active=True,
                )
            )

        db.commit()
        print("Seed completed. Users: manager/manager123, waiter/waiter123, kitchen/kitchen123")
    finally:
        db.close()


if __name__ == "__main__":
    run()
