# Flow-POS Backend

Flow-POS is a production-ready backend for a small cafe POS system. The main goal is to make waiter-kitchen communication fast, structured, and traceable: waiters create orders, kitchen staff process them in real time, and managers monitor operational performance.

The backend is built with FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis, JWT authentication, and WebSocket notifications.

## Features

- JWT authentication with role-based access control.
- Roles: `manager`, `waiter`, `kitchen`.
- User, table, menu category, and menu item management.
- Order creation with item snapshots, notes, table assignment, priority, and total calculation.
- Order editing while the ticket is still active.
- Controlled order lifecycle: `pending -> in_progress -> ready -> served -> paid`.
- Order cancellation and full order event history.
- Offline-safe order synchronization with `client_request_id` and `Idempotency-Key`.
- Real-time WebSocket updates for kitchen, manager, and the responsible waiter.
- Redis pub/sub for multi-instance real-time delivery.
- Manager analytics: active orders, revenue, average preparation time, customer wait time, peak hours, staff productivity, and popular items.
- Frontend-friendly board endpoints for waiter and kitchen screens.
- Peripheral support: receipt printers, cash drawers, barcode scanners, and print job queue.
- Production POS workflows: staff shifts, payments, manager discounts, refunds, and shift reports.
- Device-agent print workflow with dedicated agent tokens and job leases.
- Barcode lookup for menu items.
- Alembic database migrations.
- Docker Compose production stack with PostgreSQL, Redis, FastAPI API, and Caddy reverse proxy.

## Tech Stack

| Layer | Technology |
| --- | --- |
| API framework | FastAPI |
| ORM | SQLAlchemy |
| Validation | Pydantic |
| Authentication | JWT via `python-jose` |
| Password hashing | Passlib `pbkdf2_sha256` |
| Database | SQLite locally, PostgreSQL in Docker |
| Migrations | Alembic |
| Real-time | WebSocket + Redis pub/sub |
| Reverse proxy | Caddy |
| Tests | Pytest + FastAPI TestClient |

## Project Structure

```text
app/
  core/
    config.py          Application settings from environment variables
    security.py        Password hashing and JWT helpers
  db/
    session.py         SQLAlchemy engine, session, Base model
  routers/
    auth.py            Login and current user endpoints
    users.py           Manager-only user management
    tables.py          Cafe table management and table overview
    menu.py            Menu categories, items, barcode lookup
    orders.py          Order creation, editing, sync, board endpoints, status lifecycle
    analytics.py       Manager analytics
    peripherals.py     Devices and print jobs
  deps.py              Auth and role dependencies
  main.py              FastAPI app, middleware, WebSocket, health checks
  models.py            SQLAlchemy models and enums
  realtime.py          WebSocket connection manager and Redis pub/sub
  schemas.py           Pydantic request/response schemas
  seed.py              Demo users, tables, menu, devices
alembic/
  versions/            Database migrations
docker-compose.yml     PostgreSQL + Redis + API + Frontend + Caddy stack
Dockerfile             API image
Caddyfile              Reverse proxy config
frontend/              React frontend for waiter, kitchen, and manager
```

## Environment Variables

Example values are in `.env.example`.

| Variable | Description |
| --- | --- |
| `APP_NAME` | API display name |
| `ENVIRONMENT` | Environment label, for example `development` or `production` |
| `SECRET_KEY` | JWT signing secret. Change this in production |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime |
| `DATABASE_URL` | SQLAlchemy database URL |
| `REDIS_URL` | Redis URL for pub/sub. Empty means in-memory local WebSocket manager |
| `AUTO_CREATE_TABLES` | Auto-create tables on app startup. Use `false` with Alembic in production |
| `BACKEND_CORS_ORIGINS` | Comma-separated frontend origins |

## Local Run

Use this mode for development without Docker. It uses SQLite by default.

```bash
python -m pip install -r requirements.txt
copy .env.example .env
python -m alembic upgrade head
python -m app.seed
python -m uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/docs
```

Health checks:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/health/ready
```

## Docker Run

Docker Compose starts the full production-like stack:

- `db`: PostgreSQL
- `redis`: Redis for WebSocket pub/sub
- `api`: FastAPI backend
- `frontend`: React application build
- `caddy`: reverse proxy on ports `80` and `443`

Run:

```bash
docker compose up --build -d
```

Open:

```text
http://127.0.0.1
```

Check containers:

```bash
docker compose ps
docker compose logs --tail=120 api
```

Stop the stack:

```bash
docker compose down
```

Reset all Docker data, including PostgreSQL and Redis volumes:

```bash
docker compose down -v
```

## Frontend Run

The frontend lives in `frontend/` and connects to the Docker backend at `http://127.0.0.1`.

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

## Demo Accounts

The seed command creates these users:

| Role | Username | Password |
| --- | --- | --- |
| Manager | `manager` | `manager123` |
| Waiter | `waiter` | `waiter123` |
| Kitchen | `kitchen` | `kitchen123` |

## Main API Endpoints

### Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/auth/login` | Login and receive JWT token |
| `GET` | `/auth/me` | Current authenticated user |

### Users

Manager-only.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/users` | List users |
| `POST` | `/users` | Create user |
| `PATCH` | `/users/{user_id}` | Update user |

### Tables

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/tables` | List cafe tables |
| `GET` | `/tables/overview` | Tables with active order information |
| `GET` | `/tables/{table_id}/active-order` | Current active order for one table |
| `POST` | `/tables` | Create table, manager-only |
| `PATCH` | `/tables/{table_id}` | Update table, manager-only |

### Menu

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/menu/categories` | List categories |
| `POST` | `/menu/categories` | Create category, manager-only |
| `PATCH` | `/menu/categories/{category_id}` | Update category, manager-only |
| `GET` | `/menu/items` | List menu items |
| `GET` | `/menu/items/barcode/{barcode}` | Find available item by barcode |
| `POST` | `/menu/items` | Create menu item, manager-only |
| `PATCH` | `/menu/items/{item_id}` | Update menu item, manager-only |

### Orders

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/orders` | Create one order |
| `POST` | `/orders/sync` | Sync offline-created orders |
| `GET` | `/orders` | List visible orders |
| `GET` | `/orders/board/kitchen` | Kitchen board grouped by pending, in-progress, and ready |
| `GET` | `/orders/board/waiter` | Waiter dashboard with active and ready orders |
| `GET` | `/orders/{order_id}` | Get order details |
| `PATCH` | `/orders/{order_id}` | Edit active order details and items |
| `PATCH` | `/orders/{order_id}/status` | Change order status |
| `POST` | `/orders/{order_id}/cancel` | Cancel order |

### Analytics

Manager-only.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/analytics/summary` | Operational dashboard metrics |

### Peripherals

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/peripherals/devices` | List devices |
| `POST` | `/peripherals/devices` | Register printer, cash drawer, or scanner |
| `PATCH` | `/peripherals/devices/{device_id}` | Update device |
| `GET` | `/peripherals/jobs` | List print/device jobs |
| `POST` | `/peripherals/jobs` | Create custom job |
| `POST` | `/peripherals/orders/{order_id}/receipt` | Queue receipt print job |
| `PATCH` | `/peripherals/jobs/{job_id}` | Mark job as processing, completed, or failed |

## Order Lifecycle

Orders are intentionally restricted to a clear workflow:

```text
pending -> in_progress -> ready -> served -> paid
```

Role behavior:

- Waiter or manager creates the order.
- Kitchen can move the order to `in_progress` and then `ready`.
- Waiter can move the order to `served` and then `paid`.
- Manager has broader control for operational correction.
- Cancelled orders move to `cancelled` and release the table.

Every status change creates an `OrderEvent`, so the manager can trace what happened and who did it.

## Offline Sync and Idempotency

When a waiter device loses internet, the frontend should store orders locally. Each offline order must have a stable `client_request_id`.

When connection returns, send the queued orders:

```http
POST /orders/sync
Authorization: Bearer <waiter_token>
Content-Type: application/json
```

```json
{
  "orders": [
    {
      "table_id": 1,
      "client_request_id": "waiter-phone-1-000001",
      "source_device_id": "waiter-phone-1",
      "priority": "normal",
      "customer_note": "No onion",
      "items": [
        {
          "menu_item_id": 1,
          "quantity": 2,
          "note": "Less salt"
        }
      ]
    }
  ]
}
```

Response status per order:

- `created`: order was created.
- `duplicate`: the same `client_request_id` was already processed, so the existing order is returned.
- `failed`: this order could not be saved, usually because an item or table is invalid.

For single-order creation, the API also accepts:

```http
Idempotency-Key: waiter-phone-1-000001
```

## WebSocket Real-Time Updates

Connect with a JWT token:

```text
ws://127.0.0.1:8000/ws/orders?token=<access_token>
```

Through Caddy/Docker:

```text
ws://127.0.0.1/ws/orders?token=<access_token>
```

The backend sends events like:

```json
{
  "type": "order.status_changed",
  "order_id": 1,
  "status": "ready",
  "table_id": 1,
  "waiter_id": 2,
  "priority": "normal",
  "total_amount": "900.00"
}
```

Routing logic:

- Kitchen receives new and active order updates.
- Manager receives all operational updates.
- Waiter receives updates only for their own orders.
- If Redis is configured, events are published through Redis so multiple API containers can stay synchronized.

## Peripheral Workflow

The backend does not directly talk to physical printers or cash drawers. Instead, it creates jobs in the database. A local device agent can poll `/peripherals/jobs`, execute the job, and update its status.

Example receipt job:

```http
POST /peripherals/orders/1/receipt
Authorization: Bearer <waiter_token>
```

Possible job statuses:

```text
queued -> processing -> completed
queued -> processing -> failed
```

This design is more reliable for production because the API stays independent from local USB/network device details.

## Database and Migrations

Apply migrations:

```bash
python -m alembic upgrade head
```

Create a new migration after model changes:

```bash
python -m alembic revision --autogenerate -m "describe change"
python -m alembic upgrade head
```

In Docker, migrations run automatically before the API starts:

```text
alembic upgrade head && python -m app.seed && uvicorn app.main:app
```

## Tests

Run tests:

```bash
python -m pytest -q
```

Current tests cover:

- Health endpoint.
- Login flow.
- Offline sync idempotency.
- Barcode lookup.
- Full order lifecycle.
- Receipt print job.
- Analytics response.

## Production Notes

Before real deployment:

- Change `SECRET_KEY`.
- Use a real `.env` file or deployment secrets.
- Configure `Caddyfile` with a real domain.
- Point DNS to the server.
- Use HTTPS through Caddy.
- Keep `AUTO_CREATE_TABLES=false` and use Alembic migrations.
- Back up PostgreSQL volume regularly.
- Keep Redis persistent if real-time event durability matters.

Example `Caddyfile` for a real domain:

```text
api.example.com {
    reverse_proxy api:8000
}
```

## Quick Verification Commands

```bash
python -m pytest -q
python -m alembic upgrade head
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Health check through Docker/Caddy:

```bash
curl http://127.0.0.1/health
curl http://127.0.0.1/health/ready
```

## Docker Demo Flow

If you want to test the whole product without any local Python or Node setup:

```bash
docker compose up --build -d
```

Then open:

- Frontend: `http://127.0.0.1`
- Swagger: `http://127.0.0.1/docs`
- Health: `http://127.0.0.1/health`

Demo users:

- `waiter / waiter123`
- `kitchen / kitchen123`
- `manager / manager123`

Recommended live demo sequence:

1. Log in as `waiter`, pick a table, add items, and send an order.
2. Log in as `kitchen`, move the same order from `pending` to `in_progress` to `ready`.
3. Return to `waiter`, mark the order `served`, then `paid`, then create a receipt job.
4. Log in as `manager`, show analytics, table overview, and registered devices.

This path demonstrates the full value of the project: table workflow, order lifecycle, real-time updates, analytics, and production deployment through Docker.
