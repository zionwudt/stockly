# 简仓 (Jiancang) — Copilot Instructions

## Commands

```bash
# Install (required before running or testing)
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[test]"

# Run server (default http://127.0.0.1:8000)
python src/backend/app.py
# or with options:
python src/backend/app.py --port 9000 --db ./data/dev.db

# Run all tests
pytest

# Run a single test
pytest tests/test_inventory_service.py::test_create_sale_updates_stock_and_records_document
```

No linter is configured; `ruff` has been used ad-hoc.

## Architecture

**Stdlib-only Python backend + vanilla JS frontend. No third-party runtime dependencies.**

```
src/
  backend/
    app.py                          # Entry point: starts ThreadingHTTPServer, seeds DB
    jiancang/
      http_handler.py               # All HTTP routing (one JianCangHandler class)
      security.py                   # PBKDF2 password hashing, session token generation
      db/
        connection.py               # get_connection() — sqlite3 with row_factory + FK enforcement
        schema.py                   # CREATE TABLE statements
        migrations.py               # init_db() + incremental migration functions
        seed.py                     # seed_initial_data() — demo products, partners, purchase order
        constants.py                # DEFAULT_ADMIN_*, DEFAULT_TENANT_*, TENANTED_TABLES
      services/
        service.py                  # InventoryService — composed from all mixins below
        models.py                   # RequestContext, SessionPrincipal, ValidationError
        auth.py                     # AuthServiceMixin — login, register, sessions
        tenants.py                  # TenantServiceMixin — create tenant, join requests, approval
        tenant_queries.py           # TenantQueryMixin — hub, membership queries
        inventory.py                # InventoryQueryServiceMixin — products, partners, stock, movements
        documents.py                # DocumentServiceMixin — purchase, sale, adjustment, list
        document_support.py         # DocumentSupportMixin — doc numbering helpers
        statistics.py               # StatisticsServiceMixin — monthly aggregates
        validators.py               # ValidationMixin — shared input validation helpers
  web/
    index.html                      # Single-page app entry
    js/
      app.js                        # Bootstrap: wires router, auth, page modules
      store.js                      # Pub-sub state store (getState/setState/subscribe)
      router.js                     # Hash-based client-side router
      api.js                        # fetch() wrapper for all API calls
      pages/                        # One module per page/view
```

**Multi-tenancy**: All business data (`products`, `partners`, `documents`, `document_items`, `stock_movements`) carries a `tenant_id` column. The list is in `db/constants.py::TENANTED_TABLES`.

**Current stock** is derived by aggregating `stock_movements`—there is no denormalized on-hand quantity field.

**Session management**: Cookie-based (`jiancang_session`), 7-day expiry. The session stores both `user_id` and `tenant_id` (the last active tenant).

## Key Conventions

### Service layer

`InventoryService` is a `@dataclass(slots=True)` composed from multiple mixin classes. Adding new functionality means creating a new mixin and adding it to the inheritance list in `services/service.py`.

Every business method takes a `RequestContext` as its first argument (carries `tenant_id`, `user_id`, `username`, `tenant_role`). Methods that don't need tenant scoping (auth, registration) use `SessionPrincipal` instead.

Raise `ValidationError` for any business rule violation — `http_handler.py` catches it and returns HTTP 400.

### Database access

Always use `get_connection(db_path)` as a context manager. It sets `row_factory = sqlite3.Row` and enables `PRAGMA foreign_keys = ON`. Do not call `sqlite3.connect()` directly.

```python
with get_connection(self.db_path) as connection:
    rows = connection.execute("SELECT ...", (param,)).fetchall()
    connection.commit()  # required for writes
```

### Python style

All Python files start with `from __future__ import annotations`. Type hints use the newer lowercase syntax (`list[str]`, `dict[str, Any]`).

### Tests

`conftest.py` inserts `src/backend` into `sys.path`. Tests use two fixtures:
- `service` — a fresh `InventoryService` backed by a temp SQLite file (seeded with demo data)
- `context` — an authenticated `RequestContext` for the default admin + default tenant

Tests are integration-style: they call service methods directly against a real SQLite database.
