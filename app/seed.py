from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import Base, SessionLocal, engine
from app.models import (
    AuthAuditEvent,
    AuthSession,
    CafeTable,
    DeviceAgentToken,
    MenuCategory,
    MenuItem,
    Order,
    OrderDiscount,
    OrderEvent,
    OrderItem,
    OrderPriority,
    OrderStatus,
    Payment,
    PaymentMethod,
    PeripheralDevice,
    PeripheralType,
    PrintJob,
    PrintJobLease,
    PrintJobStatus,
    Refund,
    ShiftStatus,
    StaffShift,
    TableStatus,
    User,
    UserRole,
)


def wipe_business_data(db) -> None:
    for model in (
        PrintJobLease,
        PrintJob,
        DeviceAgentToken,
        Refund,
        Payment,
        OrderDiscount,
        OrderEvent,
        OrderItem,
        Order,
        StaffShift,
        PeripheralDevice,
        MenuItem,
        MenuCategory,
        CafeTable,
        AuthSession,
        AuthAuditEvent,
        User,
    ):
        db.query(model).delete(synchronize_session=False)


def create_user(db, username: str, full_name: str, role: UserRole, password: str) -> User:
    user = User(
        username=username,
        full_name=full_name,
        role=role,
        hashed_password=get_password_hash(password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def create_order(
    db,
    *,
    table: CafeTable,
    waiter: User,
    items: list[tuple[MenuItem, int, str | None]],
    status: OrderStatus,
    priority: OrderPriority = OrderPriority.normal,
    note: str | None = None,
    created_at: datetime,
) -> Order:
    order = Order(
        table_id=table.id,
        waiter_id=waiter.id,
        status=status,
        priority=priority,
        customer_note=note,
        total_amount=Decimal("0.00"),
        client_request_id=f"seed-{table.number}-{int(created_at.timestamp())}",
        source_device_id="seed-terminal",
        created_at=created_at,
        updated_at=created_at,
    )
    if status in {OrderStatus.ready, OrderStatus.served, OrderStatus.paid}:
        order.ready_at = created_at + timedelta(minutes=18)
    if status in {OrderStatus.served, OrderStatus.paid}:
        order.served_at = created_at + timedelta(minutes=24)
    if status == OrderStatus.paid:
        order.paid_at = created_at + timedelta(minutes=38)

    db.add(order)
    db.flush()

    total = Decimal("0.00")
    for menu_item, quantity, item_note in items:
        line_total = Decimal(menu_item.price) * quantity
        total += line_total
        db.add(
            OrderItem(
                order_id=order.id,
                menu_item_id=menu_item.id,
                quantity=quantity,
                unit_price=menu_item.price,
                line_total=line_total,
                note=item_note,
            )
        )
    order.total_amount = total
    db.add(
        OrderEvent(
            order_id=order.id,
            actor_id=waiter.id,
            event_type="created",
            to_status=OrderStatus.pending,
            message="Order created from POS terminal",
            created_at=created_at,
        )
    )
    if status != OrderStatus.pending:
        db.add(
            OrderEvent(
                order_id=order.id,
                actor_id=waiter.id,
                event_type="status_changed",
                from_status=OrderStatus.pending,
                to_status=status,
                message=f"Moved to {status.value}",
                created_at=created_at + timedelta(minutes=6),
            )
        )
    return order


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        wipe_business_data(db)

        manager = create_user(db, "manager", "Айдана Сулейменова", UserRole.manager, "manager123")
        waiter_a = create_user(db, "waiter", "Данияр Омаров", UserRole.waiter, "waiter123")
        waiter_b = create_user(db, "waiter2", "Мадина Касенова", UserRole.waiter, "waiter123")
        kitchen = create_user(db, "kitchen", "Кухонный экран", UserRole.kitchen, "kitchen123")
        db.add(kitchen)

        tables = []
        for number, seats, location, status in [
            ("1", 2, "Окно", TableStatus.free),
            ("2", 4, "Основной зал", TableStatus.occupied),
            ("3", 4, "Основной зал", TableStatus.occupied),
            ("4", 6, "Семейная зона", TableStatus.reserved),
            ("5", 2, "Барная стойка", TableStatus.free),
            ("6", 8, "Большой стол", TableStatus.cleaning),
            ("7", 4, "Терраса", TableStatus.occupied),
            ("8", 2, "Терраса", TableStatus.free),
        ]:
            table = CafeTable(number=number, seats=seats, location=location, status=status)
            db.add(table)
            tables.append(table)
        db.flush()

        categories: dict[str, MenuCategory] = {}
        for sort_order, name in enumerate(["Завтраки", "Основные блюда", "Салаты", "Десерты", "Напитки"], start=1):
            category = MenuCategory(name=name, sort_order=sort_order, is_active=True)
            db.add(category)
            categories[name] = category
        db.flush()

        item_specs = [
            ("Завтраки", "Сырники с ягодным соусом", "487000100001", "Творожные сырники, сметана, ягодный соус", "2600.00", 12),
            ("Завтраки", "Омлет с лососем", "487000100002", "Яйца, слабосоленый лосось, зелень, тост", "3400.00", 14),
            ("Основные блюда", "Паста с курицей и грибами", "487000100003", "Сливочный соус, шампиньоны, пармезан", "4200.00", 18),
            ("Основные блюда", "Beef Burger", "460000000002", "Говяжья котлета, картофель фри, фирменный соус", "3900.00", 17),
            ("Основные блюда", "Стейк из говядины", "487000100004", "Говядина, овощи гриль, перечный соус", "6900.00", 24),
            ("Основные блюда", "Куриный боул", "487000100005", "Рис, курица терияки, овощи, кунжут", "3600.00", 16),
            ("Салаты", "Цезарь с курицей", "487000100006", "Романо, курица, пармезан, сухари", "3100.00", 11),
            ("Салаты", "Греческий салат", "487000100007", "Овощи, фета, маслины, оливковое масло", "2800.00", 9),
            ("Десерты", "Медовик", "487000100008", "Домашний медовый торт", "1900.00", 5),
            ("Десерты", "Чизкейк Сан-Себастьян", "487000100009", "Обожженный чизкейк, карамель", "2400.00", 5),
            ("Напитки", "Americano / Американо", "460000000004", "Классический черный кофе", "900.00", 4),
            ("Напитки", "Капучино", "487000100011", "Эспрессо и молочная пена", "1300.00", 5),
            ("Напитки", "Домашний лимонад", "487000100012", "Лимон, мята, содовая", "1500.00", 3),
            ("Напитки", "Облепиховый чай", "487000100013", "Облепиха, мед, апельсин", "1700.00", 6),
        ]
        items: dict[str, MenuItem] = {}
        for category_name, name, barcode, description, price, prep_time in item_specs:
            item = MenuItem(
                category_id=categories[category_name].id,
                name=name,
                barcode=barcode,
                description=description,
                price=Decimal(price),
                preparation_time_minutes=prep_time,
                is_available=True,
            )
            db.add(item)
            items[name] = item
        db.flush()

        now = datetime.now(timezone.utc)
        open_shift = StaffShift(
            opened_by_id=manager.id,
            opening_cash_amount=Decimal("75000.00"),
            status=ShiftStatus.open,
            opened_at=now.replace(hour=8, minute=30, second=0, microsecond=0),
            note="Утренняя смена, зал и терраса открыты",
        )
        closed_shift = StaffShift(
            opened_by_id=manager.id,
            closed_by_id=manager.id,
            opening_cash_amount=Decimal("60000.00"),
            closing_cash_amount=Decimal("312400.00"),
            status=ShiftStatus.closed,
            opened_at=now - timedelta(days=1, hours=9),
            closed_at=now - timedelta(days=1, hours=1),
            note="Закрыто без расхождений",
        )
        db.add_all([open_shift, closed_shift])
        db.flush()

        active_1 = create_order(
            db,
            table=tables[1],
            waiter=waiter_a,
            status=OrderStatus.in_progress,
            priority=OrderPriority.high,
            note="Гость просит подать салат первым",
            created_at=now - timedelta(minutes=22),
            items=[(items["Цезарь с курицей"], 2, None), (items["Домашний лимонад"], 2, "без льда")],
        )
        active_2 = create_order(
            db,
            table=tables[2],
            waiter=waiter_b,
            status=OrderStatus.ready,
            priority=OrderPriority.normal,
            created_at=now - timedelta(minutes=34),
            items=[(items["Паста с курицей и грибами"], 1, None), (items["Капучино"], 1, None)],
        )
        active_3 = create_order(
            db,
            table=tables[6],
            waiter=waiter_a,
            status=OrderStatus.pending,
            priority=OrderPriority.urgent,
            note="Детский стул, без острого",
            created_at=now - timedelta(minutes=5),
            items=[(items["Куриный боул"], 2, "соус отдельно"), (items["Облепиховый чай"], 1, None)],
        )
        db.add_all([active_1, active_2, active_3])

        paid_orders = [
            create_order(
                db,
                table=tables[0],
                waiter=waiter_a,
                status=OrderStatus.paid,
                priority=OrderPriority.normal,
                created_at=now.replace(hour=9, minute=40, second=0, microsecond=0),
                items=[(items["Сырники с ягодным соусом"], 2, None), (items["Americano / Американо"], 2, None)],
            ),
            create_order(
                db,
                table=tables[4],
                waiter=waiter_b,
                status=OrderStatus.paid,
                priority=OrderPriority.normal,
                created_at=now.replace(hour=12, minute=15, second=0, microsecond=0),
                items=[(items["Стейк из говядины"], 1, "medium"), (items["Греческий салат"], 1, None), (items["Домашний лимонад"], 1, None)],
            ),
            create_order(
                db,
                table=tables[7],
                waiter=waiter_a,
                status=OrderStatus.paid,
                priority=OrderPriority.low,
                created_at=now.replace(hour=14, minute=5, second=0, microsecond=0),
                items=[(items["Омлет с лососем"], 1, None), (items["Чизкейк Сан-Себастьян"], 1, None), (items["Капучино"], 2, None)],
            ),
            create_order(
                db,
                table=tables[0],
                waiter=waiter_b,
                status=OrderStatus.paid,
                priority=OrderPriority.normal,
                created_at=now - timedelta(days=1, hours=4),
                items=[(items["Паста с курицей и грибами"], 2, None), (items["Медовик"], 2, None)],
            ),
        ]
        db.flush()

        methods = [PaymentMethod.card, PaymentMethod.cash, PaymentMethod.external, PaymentMethod.card]
        shifts = [open_shift, open_shift, open_shift, closed_shift]
        for index, order in enumerate(paid_orders):
            discount = Decimal("1000.00") if index == 1 else Decimal("0.00")
            if discount:
                db.add(
                    OrderDiscount(
                        order_id=order.id,
                        created_by_id=manager.id,
                        value=discount,
                        reason="Комплимент постоянному гостю",
                    )
                )
            final_amount = Decimal(order.total_amount) - discount
            payment = Payment(
                order_id=order.id,
                shift_id=shifts[index].id,
                created_by_id=order.waiter_id,
                method=methods[index],
                subtotal_amount=order.total_amount,
                discount_amount=discount,
                tax_amount=Decimal("0.00"),
                service_fee_amount=Decimal("0.00"),
                final_amount=final_amount,
                amount_received=final_amount if methods[index] != PaymentMethod.cash else final_amount + Decimal("1000.00"),
                change_due=Decimal("0.00") if methods[index] != PaymentMethod.cash else Decimal("1000.00"),
                created_at=order.paid_at or order.created_at + timedelta(minutes=38),
            )
            db.add(payment)
            db.flush()
            if index == 1:
                db.add(Refund(payment_id=payment.id, created_by_id=manager.id, amount=Decimal("15.00"), reason="Корректировка напитка"))

        receipt_printer = PeripheralDevice(
            name="Чековый принтер касса",
            device_type=PeripheralType.receipt_printer,
            identifier="receipt-printer-main",
            location="Касса",
            is_active=True,
        )
        kitchen_printer = PeripheralDevice(
            name="Кухонный принтер горячий цех",
            device_type=PeripheralType.receipt_printer,
            identifier="kitchen-printer-hot",
            location="Кухня",
            is_active=True,
        )
        scanner = PeripheralDevice(
            name="Сканер штрихкодов бара",
            device_type=PeripheralType.barcode_scanner,
            identifier="bar-scanner-01",
            location="Бар",
            is_active=True,
        )
        cash_drawer = PeripheralDevice(
            name="Денежный ящик касса",
            device_type=PeripheralType.cash_drawer,
            identifier="cash-drawer-main",
            location="Касса",
            is_active=True,
        )
        db.add_all([receipt_printer, kitchen_printer, scanner, cash_drawer])
        db.flush()
        db.add_all(
            [
                PrintJob(
                    device_id=kitchen_printer.id,
                    order_id=active_1.id,
                    job_type="kitchen_ticket",
                    status=PrintJobStatus.completed,
                    payload={"order_id": active_1.id, "station": "hot"},
                    processed_at=now - timedelta(minutes=18),
                ),
                PrintJob(
                    device_id=receipt_printer.id,
                    order_id=paid_orders[1].id,
                    job_type="receipt",
                    status=PrintJobStatus.queued,
                    payload={"order_id": paid_orders[1].id, "copies": 1},
                ),
            ]
        )

        db.commit()
        print("Seed completed with realistic Flow-POS data.")
        print("Users: manager/manager123, waiter/waiter123, waiter2/waiter123, kitchen/kitchen123")
    finally:
        db.close()


if __name__ == "__main__":
    run()
