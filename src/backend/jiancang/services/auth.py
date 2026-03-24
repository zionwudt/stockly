from __future__ import annotations

import sqlite3
from typing import Any

from ..db import get_connection
from ..security import (
    SESSION_DAYS,
    db_days_from_now,
    db_now,
    generate_salt,
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)
from .models import RequestContext, SessionPrincipal, ValidationError


class AuthServiceMixin:
    def register_user(self, payload: dict[str, Any]) -> tuple[SessionPrincipal, str]:
        username = self._normalized_username(self._required_text(payload, "username"))
        display_name = self._text(payload, "display_name") or username
        password = self._required_text(payload, "password")
        password_confirm = self._text(payload, "password_confirm")

        self._validate_username(username)
        self._validate_password(password)
        if password_confirm and password_confirm != password:
            raise ValidationError("两次输入的密码不一致。")

        with get_connection(self.db_path) as connection:
            exists = connection.execute(
                "SELECT id FROM users WHERE username = ? LIMIT 1",
                (username,),
            ).fetchone()
            if exists is not None:
                raise ValidationError("账号已存在，请更换用户名。")

            salt = generate_salt()
            connection.execute(
                """
                INSERT INTO users (username, display_name, password_salt, password_hash, is_active, created_at)
                VALUES (?, ?, ?, ?, 1, ?)
                """,
                (username, display_name, salt, hash_password(password, salt), db_now()),
            )
            user_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            session_token = self._create_session(connection, user_id=user_id, tenant_id=None)
            connection.commit()

        principal = SessionPrincipal(
            user_id=int(user_id),
            username=username,
            display_name=display_name,
        )
        return principal, session_token

    def authenticate_user(self, payload: dict[str, Any]) -> tuple[RequestContext | SessionPrincipal, str]:
        username = self._normalized_username(self._required_text(payload, "username"))
        password = self._required_text(payload, "password")
        preferred_tenant_slug = self._normalized_tenant_slug(self._text(payload, "tenant_slug"))

        with get_connection(self.db_path) as connection:
            user_row = connection.execute(
                """
                SELECT id, username, display_name, password_salt, password_hash, is_active
                FROM users
                WHERE username = ?
                LIMIT 1
                """,
                (username,),
            ).fetchone()
            if user_row is None:
                raise ValidationError("账号或密码不正确。")
            if not user_row["is_active"]:
                raise ValidationError("当前账号已停用，请联系管理员。")
            if not verify_password(password, user_row["password_salt"], user_row["password_hash"]):
                raise ValidationError("账号或密码不正确。")

            tenant_row = self._resolve_login_tenant(connection, int(user_row["id"]), preferred_tenant_slug)
            tenant_id = int(tenant_row["tenant_id"]) if tenant_row is not None else None
            session_token = self._create_session(connection, user_id=int(user_row["id"]), tenant_id=tenant_id)
            connection.commit()

        principal = self._principal_from_rows(user_row, tenant_row)
        context = self._maybe_context_from_principal(principal)
        if context is not None:
            return context, session_token
        return principal, session_token

    def get_principal_for_session(self, session_token: str | None) -> SessionPrincipal | None:
        if not session_token:
            return None

        with get_connection(self.db_path) as connection:
            session_row = connection.execute(
                """
                SELECT
                    s.user_id,
                    s.tenant_id,
                    u.username,
                    u.display_name,
                    u.is_active
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.expires_at > ?
                LIMIT 1
                """,
                (hash_token(session_token), db_now()),
            ).fetchone()
            if session_row is None or not session_row["is_active"]:
                return None

            tenant_row = self._resolve_session_tenant(connection, session_row, session_token)
        return self._principal_from_rows(session_row, tenant_row)

    def get_context_for_session(self, session_token: str | None) -> RequestContext | None:
        principal = self.get_principal_for_session(session_token)
        if principal is None:
            return None
        return self._maybe_context_from_principal(principal)

    def require_request_context(self, principal: SessionPrincipal) -> RequestContext:
        context = self._maybe_context_from_principal(principal)
        if context is None:
            raise ValidationError("请先创建租户或切换到一个已加入的租户。")
        return context

    def logout_session(self, session_token: str | None) -> None:
        if not session_token:
            return
        with get_connection(self.db_path) as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(session_token),))
            connection.commit()

    def switch_current_tenant(
        self,
        session_token: str | None,
        principal: SessionPrincipal,
        payload: dict[str, Any],
    ) -> SessionPrincipal:
        if not session_token:
            raise ValidationError("会话不存在，请重新登录。")

        tenant_id = int(payload.get("tenant_id") or 0)
        tenant_slug = self._normalized_tenant_slug(self._text(payload, "tenant_slug"))
        if not tenant_id and not tenant_slug:
            raise ValidationError("请选择要切换的租户。")

        with get_connection(self.db_path) as connection:
            tenant_row = self._membership_row_by_id(connection, principal.user_id, tenant_id) if tenant_id else self._membership_row_by_slug(connection, principal.user_id, tenant_slug)
            if tenant_row is None:
                raise ValidationError("你还没有加入该租户。")

            connection.execute(
                "UPDATE sessions SET tenant_id = ? WHERE token_hash = ?",
                (tenant_row["tenant_id"], hash_token(session_token)),
            )
            connection.commit()

        return SessionPrincipal(
            user_id=principal.user_id,
            username=principal.username,
            display_name=principal.display_name,
            tenant_id=int(tenant_row["tenant_id"]),
            tenant_name=str(tenant_row["tenant_name"]),
            tenant_slug=str(tenant_row["tenant_slug"]),
            tenant_role=str(tenant_row["tenant_role"]),
        )

    def get_auth_profile(self, identity: SessionPrincipal | RequestContext) -> dict[str, Any]:
        current_tenant_id = getattr(identity, "tenant_id", None)

        with get_connection(self.db_path) as connection:
            available_tenants = self._list_accessible_tenants(
                connection,
                identity.user_id,
                current_tenant_id=current_tenant_id,
            )
            current_tenant = next((item for item in available_tenants if item["is_current"]), None)
            pending_request_count = connection.execute(
                """
                SELECT COUNT(*)
                FROM tenant_join_requests
                WHERE user_id = ? AND status = 'pending'
                """,
                (identity.user_id,),
            ).fetchone()[0]
            pending_approval_count = connection.execute(
                """
                SELECT COUNT(*)
                FROM tenant_join_requests r
                JOIN tenants t ON t.id = r.tenant_id
                WHERE r.status = 'pending' AND t.owner_user_id = ?
                """,
                (identity.user_id,),
            ).fetchone()[0]

        return {
            "user": {
                "id": identity.user_id,
                "username": identity.username,
                "display_name": identity.display_name,
            },
            "tenant": current_tenant,
            "current_tenant": current_tenant,
            "available_tenants": available_tenants,
            "pending_request_count": int(pending_request_count),
            "pending_approval_count": int(pending_approval_count),
        }

    def _create_session(self, connection: sqlite3.Connection, user_id: int, tenant_id: int | None) -> str:
        session_token = generate_session_token()
        connection.execute(
            """
            INSERT INTO sessions (user_id, tenant_id, token_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, tenant_id, hash_token(session_token), db_days_from_now(SESSION_DAYS), db_now()),
        )
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (db_now(),))
        return session_token

    def _resolve_login_tenant(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        preferred_tenant_slug: str,
    ) -> sqlite3.Row | None:
        if preferred_tenant_slug:
            tenant_row = self._membership_row_by_slug(connection, user_id, preferred_tenant_slug)
            if tenant_row is None:
                raise ValidationError("当前账号尚未加入该租户，或租户不可用。")
            return tenant_row
        return self._first_membership_row(connection, user_id)

    def _resolve_session_tenant(
        self,
        connection: sqlite3.Connection,
        session_row: sqlite3.Row,
        session_token: str,
    ) -> sqlite3.Row | None:
        tenant_id = session_row["tenant_id"]
        if tenant_id is None:
            return None

        tenant_row = connection.execute(
            """
            SELECT
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                tm.role AS tenant_role
            FROM tenant_memberships tm
            JOIN tenants t ON t.id = tm.tenant_id
            WHERE tm.user_id = ? AND tm.tenant_id = ? AND t.status = 'active'
            LIMIT 1
            """,
            (session_row["user_id"], tenant_id),
        ).fetchone()
        if tenant_row is None:
            connection.execute(
                "UPDATE sessions SET tenant_id = NULL WHERE token_hash = ?",
                (hash_token(session_token),),
            )
            connection.commit()
        return tenant_row
