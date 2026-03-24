from __future__ import annotations

import sqlite3
from pathlib import Path

from .security import db_now, generate_salt, hash_password


DEFAULT_TENANT_NAME = "演示租户"
DEFAULT_TENANT_SLUG = "demo"
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123456"

TENANTED_TABLES = [
    "products",
    "partners",
    "documents",
    "document_items",
    "stock_movements",
]

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, username),
        FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT '件',
        purchase_price REAL NOT NULL DEFAULT 0,
        sale_price REAL NOT NULL DEFAULT 0,
        safety_stock REAL NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        partner_type TEXT NOT NULL CHECK(partner_type IN ('supplier', 'customer')),
        contact TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        doc_no TEXT NOT NULL,
        doc_type TEXT NOT NULL CHECK(doc_type IN ('purchase', 'sale', 'adjustment')),
        partner_id INTEGER,
        note TEXT NOT NULL DEFAULT '',
        total_amount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
        FOREIGN KEY(partner_id) REFERENCES partners(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS document_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        document_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        line_amount REAL NOT NULL DEFAULT 0,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        product_id INTEGER NOT NULL,
        document_id INTEGER,
        movement_type TEXT NOT NULL CHECK(movement_type IN ('purchase', 'sale', 'adjustment')),
        quantity_delta REAL NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
        FOREIGN KEY(product_id) REFERENCES products(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_users_tenant_username ON users(tenant_id, username)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku ON products(tenant_id, sku)",
    "CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_partners_tenant_type ON partners(tenant_id, partner_type)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_tenant_doc_no ON documents(tenant_id, doc_no)",
    "CREATE INDEX IF NOT EXISTS idx_documents_tenant_type ON documents(tenant_id, doc_type)",
    "CREATE INDEX IF NOT EXISTS idx_document_items_tenant_document ON document_items(tenant_id, document_id)",
    "CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_product ON stock_movements(tenant_id, product_id)",
]

INDEX_STATEMENTS = [
    statement
    for statement in SCHEMA_STATEMENTS
    if statement.startswith("CREATE INDEX") or statement.startswith("CREATE UNIQUE INDEX")
]

TABLE_STATEMENTS = [statement for statement in SCHEMA_STATEMENTS if statement not in INDEX_STATEMENTS]


def get_connection(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(db_path: Path) -> None:
    with get_connection(db_path) as connection:
        for statement in TABLE_STATEMENTS:
            connection.execute(statement)
        _migrate_legacy_schema(connection)
        for statement in INDEX_STATEMENTS:
            connection.execute(statement)
        _seed_default_identity(connection)
        connection.commit()


def seed_demo_data(db_path: Path) -> None:
    with get_connection(db_path) as connection:
        tenant_id = _get_default_tenant_id(connection)
        product_count = connection.execute(
            "SELECT COUNT(*) FROM products WHERE tenant_id = ?",
            (tenant_id,),
        ).fetchone()[0]
        if product_count:
            return

        products = [
            (tenant_id, "JC-COFFEE-001", "挂耳咖啡", "饮品", "盒", 19.5, 39.0, 20),
            (tenant_id, "JC-NB-013", "A5 点阵笔记本", "文具", "本", 6.2, 12.8, 30),
            (tenant_id, "JC-CABLE-002", "Type-C 数据线", "数码", "条", 8.8, 18.0, 25),
        ]
        partners = [
            (tenant_id, "晨光供应", "supplier", "李敏", "13800000001", "常规补货供应商"),
            (tenant_id, "城南门店", "customer", "王青", "13800000002", "线下分销门店"),
        ]

        connection.executemany(
            """
            INSERT INTO products (tenant_id, sku, name, category, unit, purchase_price, sale_price, safety_stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            products,
        )
        connection.executemany(
            """
            INSERT INTO partners (tenant_id, name, partner_type, contact, phone, note)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            partners,
        )

        supplier_id = connection.execute(
            """
            SELECT id
            FROM partners
            WHERE tenant_id = ? AND partner_type = 'supplier'
            ORDER BY id
            LIMIT 1
            """,
            (tenant_id,),
        ).fetchone()[0]
        product_rows = connection.execute(
            "SELECT id, purchase_price FROM products WHERE tenant_id = ? ORDER BY id",
            (tenant_id,),
        ).fetchall()

        connection.execute(
            """
            INSERT INTO documents (tenant_id, doc_no, doc_type, partner_id, note, total_amount)
            VALUES (?, 'PO-01-0001', 'purchase', ?, '系统初始化演示单据', ?)
            """,
            (tenant_id, supplier_id, sum(row["purchase_price"] * 50 for row in product_rows)),
        )
        document_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]

        for row in product_rows:
            quantity = 50
            price = row["purchase_price"]
            amount = quantity * price
            connection.execute(
                """
                INSERT INTO document_items (tenant_id, document_id, product_id, quantity, unit_price, line_amount)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (tenant_id, document_id, row["id"], quantity, price, amount),
            )
            connection.execute(
                """
                INSERT INTO stock_movements (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note)
                VALUES (?, ?, ?, 'purchase', ?, ?, '初始化库存')
                """,
                (tenant_id, row["id"], document_id, quantity, price),
            )

        connection.commit()


def _migrate_legacy_schema(connection: sqlite3.Connection) -> None:
    for table in TENANTED_TABLES:
        if _table_exists(connection, table):
            _ensure_column(connection, table, "tenant_id", "INTEGER NOT NULL DEFAULT 1")

    for table in TENANTED_TABLES:
        if _table_exists(connection, table) and _column_exists(connection, table, "tenant_id"):
            connection.execute(f"UPDATE {table} SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id = 0")


def _seed_default_identity(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO tenants (id, name, slug, status, created_at)
        VALUES (1, ?, ?, 'active', ?)
        """,
        (DEFAULT_TENANT_NAME, DEFAULT_TENANT_SLUG, db_now()),
    )
    tenant_id = _get_default_tenant_id(connection)

    for table in TENANTED_TABLES:
        if _table_exists(connection, table) and _column_exists(connection, table, "tenant_id"):
            connection.execute(
                f"UPDATE {table} SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = 0",
                (tenant_id,),
            )

    user_count = connection.execute(
        "SELECT COUNT(*) FROM users WHERE tenant_id = ?",
        (tenant_id,),
    ).fetchone()[0]
    if user_count:
        return

    salt = generate_salt()
    connection.execute(
        """
        INSERT INTO users (tenant_id, username, display_name, password_salt, password_hash, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        """,
        (
            tenant_id,
            DEFAULT_ADMIN_USERNAME,
            "系统管理员",
            salt,
            hash_password(DEFAULT_ADMIN_PASSWORD, salt),
            db_now(),
        ),
    )


def _get_default_tenant_id(connection: sqlite3.Connection) -> int:
    return connection.execute(
        "SELECT id FROM tenants WHERE slug = ? LIMIT 1",
        (DEFAULT_TENANT_SLUG,),
    ).fetchone()[0]


def _table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    row = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _column_exists(connection: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row["name"] == column_name for row in rows)


def _ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    if _column_exists(connection, table_name, column_name):
        return
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
