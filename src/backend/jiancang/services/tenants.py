from __future__ import annotations

import sqlite3
from typing import Any

from ..db import get_connection
from ..security import db_now
from .models import SessionPrincipal, ValidationError


class TenantServiceMixin:
    def get_tenant_hub(self, principal: SessionPrincipal) -> dict[str, Any]:
        with get_connection(self.db_path) as connection:
            accessible_tenants = self._list_accessible_tenants(
                connection,
                principal.user_id,
                current_tenant_id=principal.tenant_id,
            )
            discoverable_tenants = self._list_tenant_directory(connection, principal.user_id)
            my_join_requests = self._list_my_join_requests(connection, principal.user_id)
            pending_approvals = self._list_pending_approvals(
                connection,
                principal.user_id,
                principal.tenant_id,
            )

        return {
            "accessible_tenants": accessible_tenants,
            "discoverable_tenants": discoverable_tenants,
            "my_join_requests": my_join_requests,
            "pending_approvals": pending_approvals,
        }

    def create_tenant(self, principal: SessionPrincipal, payload: dict[str, Any]) -> dict[str, Any]:
        name = self._required_text(payload, "name")
        slug = self._normalized_tenant_slug(self._required_text(payload, "slug"))
        self._validate_tenant_slug(slug)

        with get_connection(self.db_path) as connection:
            try:
                connection.execute(
                    """
                    INSERT INTO tenants (name, slug, status, owner_user_id, created_at)
                    VALUES (?, ?, 'active', ?, ?)
                    """,
                    (name, slug, principal.user_id, db_now()),
                )
            except sqlite3.IntegrityError as exc:
                raise ValidationError("租户标识已存在，请换一个 slug。") from exc

            tenant_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            connection.execute(
                """
                INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
                VALUES (?, ?, 'owner', ?)
                """,
                (tenant_id, principal.user_id, db_now()),
            )
            connection.commit()

        return {
            "message": f"租户 {name} 已创建。",
            "tenant": {
                "id": int(tenant_id),
                "name": name,
                "slug": slug,
                "role": "owner",
                "is_owner": True,
            },
        }

    def create_join_request(self, principal: SessionPrincipal, payload: dict[str, Any]) -> dict[str, Any]:
        note = self._text(payload, "note")

        with get_connection(self.db_path) as connection:
            tenant_row = self._requested_tenant_row(connection, payload)
            self._ensure_join_request_allowed(connection, principal.user_id, tenant_row)
            connection.execute(
                """
                INSERT INTO tenant_join_requests (tenant_id, user_id, note, status, created_at)
                VALUES (?, ?, ?, 'pending', ?)
                """,
                (tenant_row["id"], principal.user_id, note, db_now()),
            )
            connection.commit()

        return {"message": f"已提交加入租户 {tenant_row['name']} 的申请。"}

    def review_join_request(self, principal: SessionPrincipal, request_id: int, approved: bool) -> dict[str, Any]:
        if request_id <= 0:
            raise ValidationError("申请记录不存在。")

        with get_connection(self.db_path) as connection:
            request_row = self._pending_join_request(connection, request_id)
            if int(request_row["owner_user_id"] or 0) != principal.user_id:
                raise ValidationError("只有租户创建者可以处理加入申请。")

            decided_at = db_now()
            if approved:
                self._approve_membership_if_missing(connection, request_row, decided_at)

            connection.execute(
                """
                UPDATE tenant_join_requests
                SET status = ?, decided_by_user_id = ?, decided_at = ?
                WHERE id = ?
                """,
                ("approved" if approved else "rejected", principal.user_id, decided_at, request_id),
            )
            connection.commit()

        action = "已同意" if approved else "已拒绝"
        display_name = request_row["display_name"] or request_row["username"]
        return {"message": f"{action} {display_name} 加入租户 {request_row['tenant_name']}。"}

    def _requested_tenant_row(self, connection: sqlite3.Connection, payload: dict[str, Any]) -> sqlite3.Row:
        tenant_id = int(payload.get("tenant_id") or 0)
        tenant_slug = self._normalized_tenant_slug(self._text(payload, "tenant_slug"))
        if tenant_id:
            tenant_row = connection.execute(
                """
                SELECT id, name, slug, owner_user_id
                FROM tenants
                WHERE id = ? AND status = 'active'
                LIMIT 1
                """,
                (tenant_id,),
            ).fetchone()
        elif tenant_slug:
            tenant_row = connection.execute(
                """
                SELECT id, name, slug, owner_user_id
                FROM tenants
                WHERE slug = ? AND status = 'active'
                LIMIT 1
                """,
                (tenant_slug,),
            ).fetchone()
        else:
            raise ValidationError("请选择要申请加入的租户。")

        if tenant_row is None:
            raise ValidationError("租户不存在或已停用。")
        return tenant_row

    def _ensure_join_request_allowed(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        tenant_row: sqlite3.Row,
    ) -> None:
        if int(tenant_row["owner_user_id"] or 0) == user_id:
            raise ValidationError("你已经是该租户的创建者。")

        membership_exists = connection.execute(
            """
            SELECT 1
            FROM tenant_memberships
            WHERE tenant_id = ? AND user_id = ?
            LIMIT 1
            """,
            (tenant_row["id"], user_id),
        ).fetchone()
        if membership_exists is not None:
            raise ValidationError("你已经加入该租户，无需重复申请。")

        pending_exists = connection.execute(
            """
            SELECT 1
            FROM tenant_join_requests
            WHERE tenant_id = ? AND user_id = ? AND status = 'pending'
            LIMIT 1
            """,
            (tenant_row["id"], user_id),
        ).fetchone()
        if pending_exists is not None:
            raise ValidationError("你已经提交过加入申请，请等待处理。")

    def _pending_join_request(self, connection: sqlite3.Connection, request_id: int) -> sqlite3.Row:
        request_row = connection.execute(
            """
            SELECT
                r.id,
                r.tenant_id,
                r.user_id,
                r.note,
                r.status,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                t.owner_user_id,
                u.username,
                u.display_name
            FROM tenant_join_requests r
            JOIN tenants t ON t.id = r.tenant_id
            JOIN users u ON u.id = r.user_id
            WHERE r.id = ?
            LIMIT 1
            """,
            (request_id,),
        ).fetchone()
        if request_row is None:
            raise ValidationError("申请记录不存在。")
        if request_row["status"] != "pending":
            raise ValidationError("该申请已经处理过了。")
        return request_row

    def _approve_membership_if_missing(
        self,
        connection: sqlite3.Connection,
        request_row: sqlite3.Row,
        decided_at: str,
    ) -> None:
        membership_exists = connection.execute(
            """
            SELECT 1
            FROM tenant_memberships
            WHERE tenant_id = ? AND user_id = ?
            LIMIT 1
            """,
            (request_row["tenant_id"], request_row["user_id"]),
        ).fetchone()
        if membership_exists is None:
            connection.execute(
                """
                INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
                VALUES (?, ?, 'member', ?)
                """,
                (request_row["tenant_id"], request_row["user_id"], decided_at),
            )
