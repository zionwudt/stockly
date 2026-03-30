from __future__ import annotations

import sqlite3
from typing import Any

from .models import RequestContext, SessionPrincipal


class TenantQueryMixin:
    def _first_membership_row(self, connection: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                tm.role AS tenant_role
            FROM tenant_memberships tm
            JOIN tenants t ON t.id = tm.tenant_id
            WHERE tm.user_id = ? AND t.status = 'active'
            ORDER BY CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END, tm.created_at ASC, t.id ASC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()

    def _membership_row_by_slug(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        tenant_slug: str,
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                tm.role AS tenant_role
            FROM tenant_memberships tm
            JOIN tenants t ON t.id = tm.tenant_id
            WHERE tm.user_id = ? AND t.slug = ? AND t.status = 'active'
            LIMIT 1
            """,
            (user_id, tenant_slug),
        ).fetchone()

    def _membership_row_by_id(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        tenant_id: int,
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                tm.role AS tenant_role
            FROM tenant_memberships tm
            JOIN tenants t ON t.id = tm.tenant_id
            WHERE tm.user_id = ? AND t.id = ? AND t.status = 'active'
            LIMIT 1
            """,
            (user_id, tenant_id),
        ).fetchone()

    def _list_accessible_tenants(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        current_tenant_id: int | None,
    ) -> list[dict[str, Any]]:
        rows = connection.execute(
            """
            SELECT
                t.id,
                t.name,
                t.slug,
                tm.role,
                tm.created_at AS joined_at,
                (SELECT COUNT(*) FROM tenant_memberships members WHERE members.tenant_id = t.id) AS member_count,
                (
                    SELECT COUNT(*)
                    FROM tenant_join_requests requests
                    WHERE requests.tenant_id = t.id AND requests.status = 'pending'
                ) AS pending_request_count
            FROM tenant_memberships tm
            JOIN tenants t ON t.id = tm.tenant_id
            WHERE tm.user_id = ? AND t.status = 'active'
            ORDER BY CASE WHEN tm.role = 'owner' THEN 0 WHEN tm.role = 'admin' THEN 1 ELSE 2 END, t.created_at DESC, t.id DESC
            """,
            (user_id,),
        ).fetchall()
        return [
            {
                "id": int(row["id"]),
                "name": str(row["name"]),
                "slug": str(row["slug"]),
                "role": str(row["role"]),
                "is_owner": str(row["role"]) == "owner",
                "is_admin": str(row["role"]) == "admin",
                "joined_at": str(row["joined_at"]),
                "member_count": int(row["member_count"]),
                "pending_request_count": int(row["pending_request_count"]),
                "is_current": current_tenant_id is not None and int(row["id"]) == current_tenant_id,
            }
            for row in rows
        ]

    def _list_tenant_directory(self, connection: sqlite3.Connection, user_id: int) -> list[dict[str, Any]]:
        rows = connection.execute(
            """
            SELECT
                t.id,
                t.name,
                t.slug,
                t.created_at,
                COALESCE(owner.display_name, owner.username, '未命名创建者') AS owner_display_name,
                (SELECT COUNT(*) FROM tenant_memberships members WHERE members.tenant_id = t.id) AS member_count,
                CASE
                    WHEN EXISTS(
                        SELECT 1
                        FROM tenant_memberships tm
                        WHERE tm.tenant_id = t.id AND tm.user_id = ?
                    ) THEN 'member'
                    WHEN EXISTS(
                        SELECT 1
                        FROM tenant_join_requests r
                        WHERE r.tenant_id = t.id AND r.user_id = ? AND r.status = 'pending'
                    ) THEN 'pending'
                    ELSE 'none'
                END AS relation
            FROM tenants t
            LEFT JOIN users owner ON owner.id = t.owner_user_id
            WHERE t.status = 'active'
            ORDER BY t.created_at DESC, t.id DESC
            """,
            (user_id, user_id),
        ).fetchall()
        return [
            {
                "id": int(row["id"]),
                "name": str(row["name"]),
                "slug": str(row["slug"]),
                "created_at": str(row["created_at"]),
                "owner_display_name": str(row["owner_display_name"]),
                "member_count": int(row["member_count"]),
                "relation": str(row["relation"]),
            }
            for row in rows
        ]

    def _list_my_join_requests(self, connection: sqlite3.Connection, user_id: int) -> list[dict[str, Any]]:
        rows = connection.execute(
            """
            SELECT
                r.id,
                r.note,
                r.status,
                r.created_at,
                r.decided_at,
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.slug AS tenant_slug
            FROM tenant_join_requests r
            JOIN tenants t ON t.id = r.tenant_id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 20
            """,
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _list_pending_approvals(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        current_tenant_id: int | None,
    ) -> list[dict[str, Any]]:
        rows = connection.execute(
            """
            SELECT
                r.id,
                r.note,
                r.created_at,
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                u.id AS applicant_id,
                u.username,
                u.display_name
            FROM tenant_join_requests r
            JOIN tenants t ON t.id = r.tenant_id
            JOIN users u ON u.id = r.user_id
            JOIN tenant_memberships tm ON tm.tenant_id = t.id AND tm.user_id = ?
            WHERE r.status = 'pending' AND tm.role IN ('owner', 'admin')
            ORDER BY CASE WHEN t.id = ? THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC
            """,
            (user_id, current_tenant_id or -1),
        ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _principal_from_rows(user_row: sqlite3.Row, tenant_row: sqlite3.Row | None) -> SessionPrincipal:
        return SessionPrincipal(
            user_id=int(user_row["user_id"] if "user_id" in user_row.keys() else user_row["id"]),
            username=str(user_row["username"]),
            display_name=str(user_row["display_name"] or user_row["username"]),
            tenant_id=int(tenant_row["tenant_id"]) if tenant_row is not None else None,
            tenant_name=str(tenant_row["tenant_name"]) if tenant_row is not None else None,
            tenant_slug=str(tenant_row["tenant_slug"]) if tenant_row is not None else None,
            tenant_role=str(tenant_row["tenant_role"]) if tenant_row is not None else None,
        )

    def _list_tenant_members(self, connection: sqlite3.Connection, tenant_id: int) -> list[dict[str, Any]]:
        rows = connection.execute(
            """
            SELECT
                tm.user_id,
                tm.role,
                tm.created_at AS joined_at,
                u.username,
                u.display_name
            FROM tenant_memberships tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.tenant_id = ?
            ORDER BY CASE WHEN tm.role = 'owner' THEN 0 WHEN tm.role = 'admin' THEN 1 ELSE 2 END, tm.created_at ASC
            """,
            (tenant_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _get_tenant_detail(self, connection: sqlite3.Connection, tenant_id: int) -> dict[str, Any] | None:
        row = connection.execute(
            """
            SELECT
                t.id,
                t.name,
                t.slug,
                t.status,
                t.owner_user_id,
                t.created_at,
                u.username AS owner_username,
                u.display_name AS owner_display_name
            FROM tenants t
            JOIN users u ON u.id = t.owner_user_id
            WHERE t.id = ?
            LIMIT 1
            """,
            (tenant_id,),
        ).fetchone()
        if not row:
            return None
        return dict(row)

    @staticmethod
    def _maybe_context_from_principal(principal: SessionPrincipal) -> RequestContext | None:
        if principal.tenant_id is None or principal.tenant_name is None or principal.tenant_slug is None:
            return None
        return RequestContext(
            tenant_id=principal.tenant_id,
            tenant_name=principal.tenant_name,
            tenant_slug=principal.tenant_slug,
            tenant_role=principal.tenant_role or "member",
            user_id=principal.user_id,
            username=principal.username,
            display_name=principal.display_name,
        )
