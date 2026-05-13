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


def seed_initial_users() -> None:
    """Run full demo seed if DB is empty or RESET_SEED=true env var is set."""
    import os
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        has_users = db.query(User).count() > 0
    finally:
        db.close()

    force = os.getenv("RESET_SEED", "").lower() == "true"
    if has_users and not force:
        print("Users already exist, skipping initial seed.")
        return
    run()


def _make_payment(db, order, shift, manager, method, discount_amount=Decimal("0.00"), refund_reason=None):
    final = Decimal(order.total_amount) - discount_amount
    if discount_amount:
        db.add(OrderDiscount(order_id=order.id, created_by_id=manager.id, value=discount_amount, reason="Скидка постоянному гостю"))
    payment = Payment(
        order_id=order.id, shift_id=shift.id, created_by_id=order.waiter_id,
        method=method, subtotal_amount=order.total_amount, discount_amount=discount_amount,
        tax_amount=Decimal("0.00"), service_fee_amount=Decimal("0.00"), final_amount=final,
        amount_received=final + Decimal("500.00") if method == PaymentMethod.cash else final,
        change_due=Decimal("500.00") if method == PaymentMethod.cash else Decimal("0.00"),
        created_at=order.paid_at or order.created_at + timedelta(minutes=40),
    )
    db.add(payment)
    db.flush()
    if refund_reason:
        db.add(Refund(payment_id=payment.id, created_by_id=manager.id, amount=Decimal("500.00"), reason=refund_reason))
    return payment


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        wipe_business_data(db)

        # ── Users ──────────────────────────────────────────────────────────────
        manager  = create_user(db, "manager",  "Айдана Сулейменова",   UserRole.manager,  "manager123")
        waiter_a = create_user(db, "waiter",   "Данияр Омаров",        UserRole.waiter,   "waiter123")
        waiter_b = create_user(db, "waiter2",  "Мадина Касенова",      UserRole.waiter,   "waiter123")
        waiter_c = create_user(db, "waiter3",  "Алибек Джаксыбеков",   UserRole.waiter,   "waiter123")
        waiter_d = create_user(db, "waiter4",  "Нурия Бекова",         UserRole.waiter,   "waiter123")
        create_user(db, "kitchen", "Кухонный экран", UserRole.kitchen, "kitchen123")
        waiters = [waiter_a, waiter_b, waiter_c, waiter_d]

        # ── Tables ─────────────────────────────────────────────────────────────
        tables = []
        for number, seats, location, status in [
            ("1",  2,  "Окно",          TableStatus.free),
            ("2",  2,  "Окно",          TableStatus.occupied),
            ("3",  4,  "Основной зал",  TableStatus.occupied),
            ("4",  4,  "Основной зал",  TableStatus.occupied),
            ("5",  4,  "Основной зал",  TableStatus.free),
            ("6",  4,  "Основной зал",  TableStatus.reserved),
            ("7",  6,  "Семейная зона", TableStatus.occupied),
            ("8",  6,  "Семейная зона", TableStatus.free),
            ("9",  2,  "Барная стойка", TableStatus.occupied),
            ("10", 2,  "Барная стойка", TableStatus.free),
            ("11", 4,  "Терраса",       TableStatus.occupied),
            ("12", 4,  "Терраса",       TableStatus.occupied),
            ("13", 4,  "Терраса",       TableStatus.cleaning),
            ("14", 8,  "VIP зал",       TableStatus.reserved),
            ("15", 12, "Банкетный зал", TableStatus.free),
        ]:
            t = CafeTable(number=number, seats=seats, location=location, status=status)
            db.add(t)
            tables.append(t)
        db.flush()

        # ── Menu ───────────────────────────────────────────────────────────────
        categories: dict[str, MenuCategory] = {}
        for i, name in enumerate(["Завтраки", "Супы", "Основные блюда", "Салаты", "Закуски", "Десерты", "Напитки", "Алкоголь"], start=1):
            c = MenuCategory(name=name, sort_order=i, is_active=True)
            db.add(c)
            categories[name] = c
        db.flush()

        item_specs = [
            # Завтраки
            ("Завтраки",        "Сырники с ягодным соусом",   "4870001001", "Творожные сырники, сметана, ягодный соус",          "2600.00", 12),
            ("Завтраки",        "Омлет с лососем",             "4870001002", "Яйца, слабосоленый лосось, зелень, тост",           "3400.00", 14),
            ("Завтраки",        "Авокадо тост",                "4870001003", "Ржаной хлеб, авокадо, яйцо пашот, микрозелень",     "3200.00", 10),
            ("Завтраки",        "Каша овсяная с ягодами",      "4870001004", "Овсяная каша, сезонные ягоды, мед, орехи",          "1800.00", 8),
            ("Завтраки",        "Яйца Бенедикт",               "4870001005", "Яйца пашот, голландский соус, ветчина, булочка",    "3600.00", 16),
            # Супы
            ("Супы",            "Борщ со сметаной",            "4870002001", "Традиционный красный борщ, сметана, пампушки",      "2200.00", 15),
            ("Супы",            "Крем-суп из тыквы",           "4870002002", "Тыква, сливки, имбирь, кунжутное масло",            "2400.00", 12),
            ("Супы",            "Том-ям с морепродуктами",     "4870002003", "Кокосовое молоко, кальмары, креветки, грибы",       "4200.00", 18),
            # Основные блюда
            ("Основные блюда",  "Паста карбонара",             "4870003001", "Спагетти, бекон, пармезан, яйцо",                   "3800.00", 18),
            ("Основные блюда",  "Паста с курицей и грибами",   "4870003002", "Сливочный соус, шампиньоны, пармезан",              "4200.00", 18),
            ("Основные блюда",  "Beef Burger",                 "4600000002", "Говяжья котлета, картофель фри, фирменный соус",    "3900.00", 17),
            ("Основные блюда",  "Стейк из говядины",           "4870003003", "Говядина 250г, овощи гриль, перечный соус",         "6900.00", 24),
            ("Основные блюда",  "Куриный боул",                "4870003004", "Рис, курица терияки, овощи, кунжут",                "3600.00", 16),
            ("Основные блюда",  "Лосось на гриле",             "4870003005", "Лосось 200г, шпинат, лимонный соус",                "5800.00", 20),
            ("Основные блюда",  "Ризотто с грибами",           "4870003006", "Арборио, ассорти грибов, пармезан, трюфельное масло","4500.00", 22),
            ("Основные блюда",  "Пицца Маргарита",             "4870003007", "Томатный соус, моцарелла, базилик",                 "3200.00", 20),
            ("Основные блюда",  "Пицца Пеперони",              "4870003008", "Томатный соус, моцарелла, пеперони",                "3700.00", 20),
            # Салаты
            ("Салаты",          "Цезарь с курицей",            "4870004001", "Романо, куриное филе, пармезан, крутоны",           "3100.00", 11),
            ("Салаты",          "Греческий салат",             "4870004002", "Томаты, огурцы, фета, маслины, оливковое масло",    "2800.00",  9),
            ("Салаты",          "Нисуаз",                      "4870004003", "Тунец, стручковая фасоль, яйцо, помидоры",          "3400.00", 10),
            # Закуски
            ("Закуски",         "Брускетта с томатами",        "4870005001", "Хрустящий хлеб, томаты, базилик, оливковое масло",  "1900.00",  8),
            ("Закуски",         "Тартар из говядины",          "4870005002", "Говядина, каперсы, лук-шалот, желток",              "4800.00", 12),
            ("Закуски",         "Сырная тарелка",              "4870005003", "Ассорти сыров, виноград, крекеры, мед",             "4200.00",  6),
            # Десерты
            ("Десерты",         "Медовик",                     "4870006001", "Домашний медовый торт",                             "1900.00",  5),
            ("Десерты",         "Чизкейк Сан-Себастьян",       "4870006002", "Обожженный чизкейк, карамельный соус",              "2400.00",  5),
            ("Десерты",         "Тирамису",                    "4870006003", "Маскарпоне, савоярди, эспрессо, какао",             "2200.00",  5),
            ("Десерты",         "Шоколадный фондан",           "4870006004", "Тёплый шоколадный кекс с жидкой начинкой",         "2600.00",  8),
            # Напитки
            ("Напитки",         "Americano",                   "4600000004", "Классический черный кофе",                          "900.00",   4),
            ("Напитки",         "Капучино",                    "4870007001", "Эспрессо и молочная пена",                         "1300.00",   5),
            ("Напитки",         "Флэт уайт",                   "4870007002", "Двойной эспрессо, велюровое молоко",               "1400.00",   5),
            ("Напитки",         "Матча латте",                 "4870007003", "Японский чай матча, молоко на выбор",              "1600.00",   5),
            ("Напитки",         "Домашний лимонад",            "4870007004", "Лимон, мята, содовая",                             "1500.00",   3),
            ("Напитки",         "Облепиховый чай",             "4870007005", "Облепиха, мед, апельсин",                          "1700.00",   6),
            ("Напитки",         "Свежевыжатый апельсиновый",   "4870007006", "100% свежевыжатый апельсиновый сок",              "1800.00",   3),
            ("Напитки",         "Минеральная вода Borjomi",    "4870007007", "Газированная, 0.5л",                               "700.00",    1),
            # Алкоголь
            ("Алкоголь",        "Бокал красного вина",         "4870008001", "Каберне совиньон, Чили",                           "2200.00",   2),
            ("Алкоголь",        "Бокал белого вина",           "4870008002", "Совиньон блан, Новая Зеландия",                    "2200.00",   2),
            ("Алкоголь",        "Пиво разливное светлое",      "4870008003", "0.5л, светлое фильтрованное",                      "1400.00",   3),
            ("Алкоголь",        "Коктейль Апероль Шприц",      "4870008004", "Апероль, просекко, содовая, апельсин",             "3200.00",   5),
        ]
        items: dict[str, MenuItem] = {}
        for cat, name, barcode, desc, price, prep in item_specs:
            mi = MenuItem(category_id=categories[cat].id, name=name, barcode=barcode,
                          description=desc, price=Decimal(price), preparation_time_minutes=prep, is_available=True)
            db.add(mi)
            items[name] = mi
        db.flush()

        # ── Shifts (5 closed + 1 open) ─────────────────────────────────────────
        now = datetime.now(timezone.utc)
        shifts_closed = []
        closing_amounts = ["287400.00", "341200.00", "198600.00", "412800.00", "356100.00"]
        for day_back, closing in enumerate(closing_amounts, start=5):
            s = StaffShift(
                opened_by_id=manager.id, closed_by_id=manager.id,
                opening_cash_amount=Decimal("50000.00"),
                closing_cash_amount=Decimal(closing),
                status=ShiftStatus.closed,
                opened_at=now - timedelta(days=day_back, hours=16),
                closed_at=now - timedelta(days=day_back, hours=2),
                note=f"Смена {day_back} дней назад. Закрыто без расхождений.",
            )
            db.add(s)
            shifts_closed.append(s)

        shift_yesterday = StaffShift(
            opened_by_id=manager.id, closed_by_id=manager.id,
            opening_cash_amount=Decimal("60000.00"),
            closing_cash_amount=Decimal("389500.00"),
            status=ShiftStatus.closed,
            opened_at=now - timedelta(days=1, hours=16),
            closed_at=now - timedelta(hours=2),
            note="Вчерашняя смена. Закрыта в штатном режиме.",
        )
        db.add(shift_yesterday)

        shift_today = StaffShift(
            opened_by_id=manager.id,
            opening_cash_amount=Decimal("75000.00"),
            status=ShiftStatus.open,
            opened_at=now.replace(hour=8, minute=0, second=0, microsecond=0),
            note="Текущая смена. Зал, терраса и VIP открыты.",
        )
        db.add(shift_today)
        db.flush()

        all_closed_shifts = shifts_closed + [shift_yesterday]

        # ── Historical paid orders (5 days × 8 orders) ────────────────────────
        hist_combos = [
            # (table_idx, waiter, items_list, method, discount)
            (0,  waiter_a, [("Сырники с ягодным соусом", 2, None), ("Americano", 2, None)],                           PaymentMethod.card,     Decimal("0")),
            (2,  waiter_b, [("Паста карбонара", 1, None), ("Капучино", 1, None)],                                     PaymentMethod.cash,     Decimal("0")),
            (4,  waiter_c, [("Цезарь с курицей", 2, None), ("Домашний лимонад", 2, "без льда")],                     PaymentMethod.card,     Decimal("0")),
            (6,  waiter_d, [("Стейк из говядины", 1, "medium"), ("Греческий салат", 1, None), ("Бокал красного вина", 1, None)], PaymentMethod.card, Decimal("500")),
            (1,  waiter_a, [("Борщ со сметаной", 2, None), ("Beef Burger", 2, None), ("Пиво разливное светлое", 2, None)], PaymentMethod.cash, Decimal("0")),
            (3,  waiter_b, [("Лосось на гриле", 1, None), ("Нисуаз", 1, None), ("Флэт уайт", 1, None)],              PaymentMethod.external, Decimal("0")),
            (8,  waiter_c, [("Авокадо тост", 1, None), ("Матча латте", 1, None)],                                    PaymentMethod.card,     Decimal("0")),
            (10, waiter_d, [("Пицца Пеперони", 1, None), ("Пиво разливное светлое", 2, None)],                       PaymentMethod.cash,     Decimal("0")),
            (5,  waiter_a, [("Ризотто с грибами", 2, None), ("Бокал белого вина", 2, None)],                         PaymentMethod.card,     Decimal("1000")),
            (7,  waiter_b, [("Тартар из говядины", 1, None), ("Стейк из говядины", 1, "well done"), ("Коктейль Апероль Шприц", 2, None)], PaymentMethod.card, Decimal("0")),
            (9,  waiter_c, [("Чизкейк Сан-Себастьян", 2, None), ("Капучино", 2, None)],                              PaymentMethod.cash,     Decimal("0")),
            (11, waiter_d, [("Крем-суп из тыквы", 1, None), ("Паста с курицей и грибами", 1, None)],                 PaymentMethod.card,     Decimal("0")),
        ]

        _order_seq = 0
        for day_back in range(5, 0, -1):
            shift = all_closed_shifts[5 - day_back]
            base_date = now - timedelta(days=day_back)
            for idx, (t_idx, waiter, order_items, method, disc) in enumerate(hist_combos):
                _order_seq += 1
                hour = 9 + (idx * 70 // 60)
                minute = (idx * 70) % 60
                created = base_date.replace(hour=min(hour, 21), minute=minute, second=0, microsecond=0)
                resolved_items = [(items[name], qty, note) for name, qty, note in order_items]
                o = create_order(db, table=tables[t_idx], waiter=waiter,
                                 status=OrderStatus.paid, priority=OrderPriority.normal,
                                 created_at=created, items=resolved_items)
                refund_reason = "Гость вернул блюдо" if _order_seq % 11 == 0 else None
                _make_payment(db, o, shift, manager, method, disc, refund_reason)

        # ── Today paid orders ──────────────────────────────────────────────────
        today_paid = [
            (0,  waiter_a, [("Яйца Бенедикт", 2, None), ("Свежевыжатый апельсиновый", 2, None)],         now.replace(hour=9, minute=10, second=0, microsecond=0),  PaymentMethod.card,  Decimal("0")),
            (2,  waiter_b, [("Авокадо тост", 1, None), ("Матча латте", 1, None)],                        now.replace(hour=10, minute=5, second=0, microsecond=0),  PaymentMethod.cash,  Decimal("0")),
            (4,  waiter_c, [("Том-ям с морепродуктами", 2, None), ("Бокал белого вина", 2, None)],        now.replace(hour=12, minute=30, second=0, microsecond=0), PaymentMethod.card,  Decimal("500")),
            (9,  waiter_d, [("Beef Burger", 1, None), ("Домашний лимонад", 1, None)],                    now.replace(hour=13, minute=15, second=0, microsecond=0), PaymentMethod.cash,  Decimal("0")),
            (1,  waiter_a, [("Цезарь с курицей", 1, None), ("Капучино", 1, None)],                       now.replace(hour=14, minute=40, second=0, microsecond=0), PaymentMethod.card,  Decimal("0")),
            (8,  waiter_b, [("Сырная тарелка", 1, None), ("Бокал красного вина", 2, None)],              now.replace(hour=15, minute=20, second=0, microsecond=0), PaymentMethod.card,  Decimal("0")),
        ]
        for t_idx, waiter, order_items, created, method, disc in today_paid:
            resolved = [(items[n], q, note) for n, q, note in order_items]
            o = create_order(db, table=tables[t_idx], waiter=waiter, status=OrderStatus.paid,
                             priority=OrderPriority.normal, created_at=created, items=resolved)
            _make_payment(db, o, shift_today, manager, method, disc)

        # ── Active orders (live kitchen board) ────────────────────────────────
        create_order(db, table=tables[3],  waiter=waiter_a, status=OrderStatus.pending,
                     priority=OrderPriority.urgent, note="Аллергия на орехи!",
                     created_at=now - timedelta(minutes=4),
                     items=[(items["Крем-суп из тыквы"], 2, None), (items["Лосось на гриле"], 2, "без кожи"), (items["Облепиховый чай"], 2, None)])

        create_order(db, table=tables[6],  waiter=waiter_b, status=OrderStatus.in_progress,
                     priority=OrderPriority.high, note="Подать салат первым",
                     created_at=now - timedelta(minutes=18),
                     items=[(items["Цезарь с курицей"], 2, None), (items["Паста карбонара"], 1, None), (items["Домашний лимонад"], 3, "без льда")])

        create_order(db, table=tables[11], waiter=waiter_c, status=OrderStatus.in_progress,
                     priority=OrderPriority.normal,
                     created_at=now - timedelta(minutes=25),
                     items=[(items["Пицца Маргарита"], 1, None), (items["Пицца Пеперони"], 1, None), (items["Пиво разливное светлое"], 2, None)])

        create_order(db, table=tables[1],  waiter=waiter_d, status=OrderStatus.ready,
                     priority=OrderPriority.normal,
                     created_at=now - timedelta(minutes=38),
                     items=[(items["Стейк из говядины"], 1, "medium rare"), (items["Нисуаз", ], 1, None), (items["Бокал красного вина"], 1, None)])

        create_order(db, table=tables[8],  waiter=waiter_a, status=OrderStatus.ready,
                     priority=OrderPriority.normal,
                     created_at=now - timedelta(minutes=31),
                     items=[(items["Брускетта с томатами"], 2, None), (items["Капучино"], 2, None)])

        create_order(db, table=tables[12], waiter=waiter_b, status=OrderStatus.served,
                     priority=OrderPriority.low,
                     created_at=now - timedelta(minutes=55),
                     items=[(items["Тирамису"], 2, None), (items["Флэт уайт"], 2, None)])

        create_order(db, table=tables[13], waiter=waiter_c, status=OrderStatus.in_progress,
                     priority=OrderPriority.high, note="VIP гость, особое внимание",
                     created_at=now - timedelta(minutes=12),
                     items=[(items["Тартар из говядины"], 1, None), (items["Том-ям с морепродуктами"], 2, None),
                            (items["Ризотто с грибами"], 2, None), (items["Коктейль Апероль Шприц"], 4, None)])

        create_order(db, table=tables[10], waiter=waiter_d, status=OrderStatus.pending,
                     priority=OrderPriority.normal,
                     created_at=now - timedelta(minutes=2),
                     items=[(items["Борщ со сметаной"], 2, None), (items["Куриный боул"], 2, "соус отдельно"), (items["Минеральная вода Borjomi"], 4, None)])

        # ── Peripheral devices ─────────────────────────────────────────────────
        devices = [
            PeripheralDevice(name="Чековый принтер касса",        device_type=PeripheralType.receipt_printer,  identifier="receipt-main",       location="Касса",   is_active=True),
            PeripheralDevice(name="Кухонный принтер горячий цех",  device_type=PeripheralType.receipt_printer,  identifier="kitchen-hot",         location="Кухня",   is_active=True),
            PeripheralDevice(name="Кухонный принтер холодный цех", device_type=PeripheralType.receipt_printer,  identifier="kitchen-cold",        location="Кухня",   is_active=True),
            PeripheralDevice(name="Принтер бар",                   device_type=PeripheralType.receipt_printer,  identifier="bar-printer",         location="Бар",     is_active=True),
            PeripheralDevice(name="Сканер штрихкодов касса",       device_type=PeripheralType.barcode_scanner,  identifier="bar-scanner-01",      location="Касса",   is_active=True),
            PeripheralDevice(name="Денежный ящик касса",           device_type=PeripheralType.cash_drawer,      identifier="cash-drawer-main",    location="Касса",   is_active=True),
        ]
        db.add_all(devices)
        db.flush()

        db.commit()
        print("Seed completed: 6 users, 15 tables, 38 menu items, 6 shifts, 70+ orders.")
        print("Users: manager/manager123, waiter/waiter123, waiter2-4/waiter123, kitchen/kitchen123")
    finally:
        db.close()


if __name__ == "__main__":
    run()
