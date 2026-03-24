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
        for statement in INDEX_STATEMENTS:
            connection.execute(statement)
        _seed_default_identity(connection)
        connection.commit()


def _migrate_legacy_schema(connection: sqlite3.Connection) -> None:
    for table in TENANTED_TABLES:
        if _table_exists(connection, table):
            _ensure_column(connection, table, "tenant_id", "INTEGER NOT NULL DEFAULT 1")

    for table in TENANTED_TABLES:
        if _table_exists(connection, table) and _column_exists(connection, table, "tenant_id"):
            connection.execute(f"UPDATE {table} SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id = 0")


def _migrate_identity_schema(connection: sqlite3.Connection) -> None:
    if _table_exists(connection, "tenants"):
        _ensure_column(connection, "tenants", "owner_user_id", "INTEGER")

    if _table_exists(connection, "users") and _column_exists(connection, "users", "tenant_id"):
        _migrate_users_to_global_accounts(connection)

    if not _table_exists(connection, "sessions") or not _column_exists(connection, "sessions", "tenant_id"):
        _rebuild_sessions_table(connection)


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
        username = _dedupe_username(seen_usernames, str(row["username"]), str(row["tenant_slug"]))
        seen_usernames.add(username)
        connection.execute(
            """
            INSERT INTO users (username, display_name, password_salt, password_hash, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                str(row["display_name"] or row["username"]),
                row["password_salt"],
                row["password_hash"],
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


def _column_exists(connection: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row["name"] == column_name for row in rows)


def _ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    if _column_exists(connection, table_name, column_name):
        return
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
