from __future__ import annotations

import sqlite3
from pathlib import Path

from ..security import db_now, generate_salt, hash_password
from .connection import get_connection
from .constants import (
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_USERNAME,
    DEFAULT_TENANT_NAME,
    DEFAULT_TENANT_SLUG,
    TENANTED_TABLES,
)
from .schema import (
    INDEX_STATEMENTS,
    SESSIONS_TABLE_SQL,
    TABLE_STATEMENTS,
    TENANT_JOIN_REQUESTS_TABLE_SQL,
    TENANT_MEMBERSHIPS_TABLE_SQL,
    USERS_TABLE_SQL,
)


def init_db(db_path: Path) -> None:
    with get_connection(db_path) as connection:
        for statement in TABLE_STATEMENTS:
            connection.execute(statement)
        _migrate_legacy_schema(connection)
        _migrate_identity_schema(connection)
        _migrate_soft_delete(connection)
        _migrate_avatar(connection)
        _migrate_admin_role(connection)
        _migrate_stock_movement_types(connection)
        for statement in INDEX_STATEMENTS:
            connection.execute(statement)
        _seed_default_identity(connection)
        connection.commit()


def _migrate_stock_movement_types(connection: sqlite3.Connection) -> None:
    """Remove CHECK constraint on movement_type if present (older DBs had it)."""
    if not _table_exists(connection, "stock_movements"):
        return
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_movements'"
    ).fetchone()
    if not row or "movement_type IN" not in (row["sql"] or ""):
        return

    connection.execute("""
        CREATE TABLE stock_movements_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL DEFAULT 1,
            product_id INTEGER NOT NULL,
            document_id INTEGER,
            movement_type TEXT NOT NULL,
            quantity_delta REAL NOT NULL,
            unit_price REAL NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(tenant_id) REFERENCES tenants(id),
            FOREIGN KEY(product_id) REFERENCES products(id),
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
        )
    """)
    connection.execute("""
        INSERT INTO stock_movements_new (id, tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note, created_at)
        SELECT id, tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note, created_at FROM stock_movements
    """)
    connection.execute("DROP TABLE stock_movements")
    connection.execute("ALTER TABLE stock_movements_new RENAME TO stock_movements")


def _migrate_admin_role(connection: sqlite3.Connection) -> None:
    """Rebuild tenant_memberships to allow 'admin' role (was only 'owner'/'member')."""
    if not _table_exists(connection, "tenant_memberships"):
        return
    # Check if the constraint already allows 'admin' by inspecting the SQL
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='tenant_memberships'"
    ).fetchone()
    if row and "'admin'" in row["sql"]:
        return  # Already migrated

    connection.execute("""
        CREATE TABLE tenant_memberships_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tenant_id, user_id),
            FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    connection.execute("""
        INSERT INTO tenant_memberships_new (id, tenant_id, user_id, role, created_at)
        SELECT id, tenant_id, user_id, role, created_at FROM tenant_memberships
    """)
    connection.execute("DROP TABLE tenant_memberships")
    connection.execute("ALTER TABLE tenant_memberships_new RENAME TO tenant_memberships")


def _migrate_legacy_schema(connection: sqlite3.Connection) -> None:
    for table in TENANTED_TABLES:
        if _table_exists(connection, table):
            _ensure_column(connection, table, "tenant_id", "INTEGER NOT NULL DEFAULT 1")

    for table in TENANTED_TABLES:
        if _table_exists(connection, table) and _column_exists(
            connection, table, "tenant_id"
        ):
            connection.execute(
                f"UPDATE {table} SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id = 0"
            )


def _migrate_identity_schema(connection: sqlite3.Connection) -> None:
    if _table_exists(connection, "tenants"):
        _ensure_column(connection, "tenants", "owner_user_id", "INTEGER")

    if _table_exists(connection, "users") and _column_exists(
        connection, "users", "tenant_id"
    ):
        _migrate_users_to_global_accounts(connection)

    if _table_exists(connection, "users"):
        _ensure_column(connection, "users", "last_tenant_id", "INTEGER")

    if not _table_exists(connection, "sessions") or not _column_exists(
        connection, "sessions", "tenant_id"
    ):
        _rebuild_sessions_table(connection)


def _migrate_soft_delete(connection: sqlite3.Connection) -> None:
    if _table_exists(connection, "products"):
        _ensure_column(
            connection, "products", "is_deleted", "INTEGER NOT NULL DEFAULT 0"
        )
        _ensure_column(connection, "products", "deleted_at", "TEXT")

    if _table_exists(connection, "partners"):
        _ensure_column(
            connection, "partners", "is_deleted", "INTEGER NOT NULL DEFAULT 0"
        )
        _ensure_column(connection, "partners", "deleted_at", "TEXT")

    if _table_exists(connection, "documents"):
        _ensure_column(
            connection, "documents", "status", "TEXT NOT NULL DEFAULT 'active'"
        )
        _ensure_column(connection, "documents", "voided_at", "TEXT")
        _ensure_column(connection, "documents", "void_reason", "TEXT")
        _ensure_column(connection, "documents", "created_by", "INTEGER")


def _migrate_avatar(connection: sqlite3.Connection) -> None:
    if _table_exists(connection, "users"):
        _ensure_column(connection, "users", "avatar_data", "TEXT")


def _migrate_users_to_global_accounts(connection: sqlite3.Connection) -> None:
    if _table_exists(connection, "tenant_join_requests"):
        connection.execute("DROP TABLE tenant_join_requests")
    if _table_exists(connection, "tenant_memberships"):
        connection.execute("DROP TABLE tenant_memberships")
    if _table_exists(connection, "sessions"):
        connection.execute("DROP TABLE sessions")

    connection.execute("ALTER TABLE users RENAME TO users_legacy")
    connection.execute(USERS_TABLE_SQL)
    connection.execute(TENANT_MEMBERSHIPS_TABLE_SQL)
    connection.execute(TENANT_JOIN_REQUESTS_TABLE_SQL)

    legacy_rows = connection.execute(
        """
        SELECT
            u.*,
            t.slug AS tenant_slug
        FROM users_legacy u
        JOIN tenants t ON t.id = u.tenant_id
        ORDER BY u.created_at ASC, u.id ASC
        """
    ).fetchall()
    owner_old_ids: dict[int, int] = {}
    for row in legacy_rows:
        owner_old_ids.setdefault(int(row["tenant_id"]), int(row["id"]))

    seen_usernames: set[str] = set()
    for row in legacy_rows:
        username = _dedupe_username(
            seen_usernames, str(row["username"]), str(row["tenant_slug"])
        )
        seen_usernames.add(username)
        connection.execute(
            """
            INSERT INTO users (username, display_name, password_salt, password_hash, last_tenant_id, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                str(row["display_name"] or row["username"]),
                row["password_salt"],
                row["password_hash"],
                int(row["tenant_id"]),
                int(row["is_active"]),
                row["created_at"],
            ),
        )
        new_user_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
        tenant_id = int(row["tenant_id"])
        role = "owner" if owner_old_ids[tenant_id] == int(row["id"]) else "member"
        connection.execute(
            """
            INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (tenant_id, new_user_id, role, row["created_at"]),
        )
        if role == "owner":
            connection.execute(
                "UPDATE tenants SET owner_user_id = ? WHERE id = ?",
                (new_user_id, tenant_id),
            )

    connection.execute("DROP TABLE users_legacy")
    connection.execute(SESSIONS_TABLE_SQL)


def _rebuild_sessions_table(connection: sqlite3.Connection) -> None:
    if _table_exists(connection, "sessions"):
        connection.execute("DROP TABLE sessions")
    connection.execute(SESSIONS_TABLE_SQL)


def _seed_default_identity(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        UPDATE tenants
        SET name = ?, slug = ?
        WHERE id = 1 AND slug = 'demo'
        """,
        (DEFAULT_TENANT_NAME, DEFAULT_TENANT_SLUG),
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO tenants (id, name, slug, status, created_at)
        VALUES (1, ?, ?, 'active', ?)
        """,
        (DEFAULT_TENANT_NAME, DEFAULT_TENANT_SLUG, db_now()),
    )
    tenant_id = _get_default_tenant_id(connection)

    for table in TENANTED_TABLES:
        if _table_exists(connection, table) and _column_exists(
            connection, table, "tenant_id"
        ):
            connection.execute(
                f"UPDATE {table} SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = 0",
                (tenant_id,),
            )

    admin_row = connection.execute(
        "SELECT id FROM users WHERE username = ? LIMIT 1",
        (DEFAULT_ADMIN_USERNAME,),
    ).fetchone()
    if admin_row is None:
        salt = generate_salt()
        connection.execute(
            """
            INSERT INTO users (username, display_name, password_salt, password_hash, is_active, created_at)
            VALUES (?, ?, ?, ?, 1, ?)
            """,
            (
                DEFAULT_ADMIN_USERNAME,
                "系统管理员",
                salt,
                hash_password(DEFAULT_ADMIN_PASSWORD, salt),
                db_now(),
            ),
        )
        admin_user_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
    else:
        admin_user_id = int(admin_row["id"])

    membership_row = connection.execute(
        """
        SELECT id
        FROM tenant_memberships
        WHERE tenant_id = ? AND user_id = ?
        LIMIT 1
        """,
        (tenant_id, admin_user_id),
    ).fetchone()
    if membership_row is None:
        connection.execute(
            """
            INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
            VALUES (?, ?, 'owner', ?)
            """,
            (tenant_id, admin_user_id, db_now()),
        )
    else:
        connection.execute(
            """
            UPDATE tenant_memberships
            SET role = 'owner'
            WHERE tenant_id = ? AND user_id = ?
            """,
            (tenant_id, admin_user_id),
        )

    connection.execute(
        "UPDATE tenants SET owner_user_id = COALESCE(owner_user_id, ?) WHERE id = ?",
        (admin_user_id, tenant_id),
    )
    connection.execute(
        """
        UPDATE users
        SET last_tenant_id = COALESCE(last_tenant_id, ?)
        WHERE id = ?
        """,
        (tenant_id, admin_user_id),
    )


def _dedupe_username(seen_usernames: set[str], username: str, tenant_slug: str) -> str:
    base = username.strip().lower()
    if not base:
        base = f"user_{tenant_slug}"
    candidate = base
    suffix = 2
    while candidate in seen_usernames:
        candidate = f"{base}_{tenant_slug}_{suffix}"
        suffix += 1
    return candidate


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


def _column_exists(
    connection: sqlite3.Connection, table_name: str, column_name: str
) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row["name"] == column_name for row in rows)


def _ensure_column(
    connection: sqlite3.Connection, table_name: str, column_name: str, definition: str
) -> None:
    if _column_exists(connection, table_name, column_name):
        return
    connection.execute(
        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"
    )
