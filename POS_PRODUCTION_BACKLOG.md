# POS Production Backlog

These items are required before Flow-POS can be considered a full production POS rather than an order workflow system.

## Payments

Status: `todo`

Acceptance criteria:

- Orders store payment method: `cash`, `card`, `mixed`, or external provider reference.
- Paid amount, change due, and payment timestamp are recorded.
- Manager can correct payment metadata with audit history.
- Payment reporting separates cash and card totals.

## Refunds And Voids

Status: `todo`

Acceptance criteria:

- Paid orders can be refunded by a manager.
- Refund reason is required.
- Refund events are immutable audit entries.
- Refunded revenue is excluded or separated in analytics.

## Discounts, Taxes, And Service Fees

Status: `todo`

Acceptance criteria:

- Order totals include item subtotal, discount total, tax total, service fee, and final total.
- Discounts can be item-level or order-level.
- Manager-only permissions control manual discounts.
- Receipt payload includes the full total breakdown.

## Staff Shifts

Status: `todo`

Acceptance criteria:

- Manager can open and close shifts.
- Orders and payments are linked to a shift.
- Shift close report includes revenue, refunds, order count, and staff productivity.
- New paid orders are blocked when no shift is open, unless explicitly allowed by configuration.

## Device Agent Protocol

Status: `todo`

Acceptance criteria:

- Device agents authenticate with a dedicated token, not a staff JWT.
- Print jobs use a lease/heartbeat so two agents cannot process the same job.
- Stuck jobs return to `queued` after a visibility timeout.
- Failed jobs track retry count and terminal failure state.

## Inventory And Availability

Status: `todo`

Acceptance criteria:

- Manager can mark items unavailable.
- Optional stock count can decrement when an order is paid.
- Low-stock items appear in manager reporting.

## Reporting

Status: `todo`

Acceptance criteria:

- Daily sales report.
- Shift report.
- Payment method report.
- Refund report.
- Popular item report with date range filters.
