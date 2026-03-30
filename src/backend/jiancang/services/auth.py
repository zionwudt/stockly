from __future__ import annotations

import re
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
            tenant = self._create_default_tenant_for_user(
                connection,
                user_id=int(user_id),
                display_name=display_name,
                username=username,
            )
            self._remember_last_tenant(connection, int(user_id), tenant["id"])
            session_token = self._create_session(connection, user_id=int(user_id), tenant_id=tenant["id"])
            connection.commit()

        principal = SessionPrincipal(
            user_id=int(user_id),
            username=username,
            display_name=display_name,
            tenant_id=tenant["id"],
            tenant_name=tenant["name"],
            tenant_slug=tenant["slug"],
            tenant_role="owner",
        )
        return principal, session_token

    def authenticate_user(self, payload: dict[str, Any]) -> tuple[RequestContext | SessionPrincipal, str]:
        username = self._normalized_username(self._required_text(payload, "username"))
        password = self._required_text(payload, "password")
        preferred_tenant_slug = self._normalized_tenant_slug(self._text(payload, "tenant_slug"))

        with get_connection(self.db_path) as connection:
            user_row = connection.execute(
                """
                SELECT id, username, display_name, password_salt, password_hash, last_tenant_id, is_active
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

            tenant_row = self._resolve_login_tenant(
                connection,
                int(user_row["id"]),
                preferred_tenant_slug,
                int(user_row["last_tenant_id"]) if user_row["last_tenant_id"] is not None else None,
            )
            tenant_id = int(tenant_row["tenant_id"]) if tenant_row is not None else None
            self._remember_last_tenant(connection, int(user_row["id"]), tenant_id)
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
                    u.last_tenant_id,
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
            self._remember_last_tenant(connection, principal.user_id, int(tenant_row["tenant_id"]))
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

    def update_profile(self, principal: SessionPrincipal, payload: dict[str, Any]) -> SessionPrincipal:
        display_name = (payload.get("display_name") or "").strip()
        avatar_data: str | None = payload.get("avatar_data")
        # Password change fields
        current_password = self._text(payload, "current_password")
        new_password = self._text(payload, "password")
        password_confirm = self._text(payload, "password_confirm")

        if avatar_data is not None and not isinstance(avatar_data, str):
            raise ValidationError("头像数据格式不正确。")
        if avatar_data and not avatar_data.startswith("data:image/"):
            raise ValidationError("头像数据格式不正确，请上传图片文件。")
        if avatar_data and len(avatar_data) > 7_340_032:  # ~5 MB base64
            raise ValidationError("头像文件过大，请选择小于 512 KB 的图片。")

        # If no display/avatar/password updates provided, nothing to do
        if not display_name and avatar_data is None and not new_password:
            raise ValidationError("没有可更新的内容。")

        with get_connection(self.db_path) as connection:
            if display_name:
                connection.execute(
                    "UPDATE users SET display_name = ? WHERE id = ?",
                    (display_name, principal.user_id),
                )
            if avatar_data is not None:
                connection.execute(
                    "UPDATE users SET avatar_data = ? WHERE id = ?",
                    (avatar_data, principal.user_id),
                )
            # Handle password change: verify current password, validate new password, update salt/hash
            if new_password:
                # Require current password
                if not current_password:
                    raise ValidationError("需要提供当前密码以修改密码。")
                # Verify current password matches stored
                row = connection.execute(
                    "SELECT password_salt, password_hash FROM users WHERE id = ? LIMIT 1",
                    (principal.user_id,),
                ).fetchone()
                if row is None:
                    raise ValidationError("用户不存在。")
                if not verify_password(current_password, row["password_salt"], row["password_hash"]):
                    raise ValidationError("当前密码不正确。")
                # Validate new password
                self._validate_password(new_password)
                if password_confirm and password_confirm != new_password:
                    raise ValidationError("两次输入的密码不一致。")
                salt = generate_salt()
                connection.execute(
                    "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
                    (salt, hash_password(new_password, salt), principal.user_id),
                )
            connection.commit()

        return SessionPrincipal(
            user_id=principal.user_id,
            username=principal.username,
            display_name=display_name or principal.display_name,
            tenant_id=principal.tenant_id,
            tenant_name=principal.tenant_name,
            tenant_slug=principal.tenant_slug,
            tenant_role=principal.tenant_role,
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
            avatar_row = connection.execute(
                "SELECT avatar_data FROM users WHERE id = ? LIMIT 1",
                (identity.user_id,),
            ).fetchone()
            avatar_data = avatar_row["avatar_data"] if avatar_row else None

        return {
            "user": {
                "id": identity.user_id,
                "username": identity.username,
                "display_name": identity.display_name,
                "avatar_data": avatar_data,
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
        last_tenant_id: int | None,
    ) -> sqlite3.Row | None:
        if preferred_tenant_slug:
            tenant_row = self._membership_row_by_slug(connection, user_id, preferred_tenant_slug)
            if tenant_row is None:
                raise ValidationError("当前账号尚未加入该租户，或租户不可用。")
            return tenant_row
        return self._resolve_default_tenant(connection, user_id, last_tenant_id)

    def _resolve_session_tenant(
        self,
        connection: sqlite3.Connection,
        session_row: sqlite3.Row,
        session_token: str,
    ) -> sqlite3.Row | None:
        tenant_id = session_row["tenant_id"]
        tenant_row = None

        if tenant_id is not None:
            tenant_row = self._membership_row_by_id(connection, int(session_row["user_id"]), int(tenant_id))

        if tenant_row is not None:
            self._remember_last_tenant(connection, int(session_row["user_id"]), int(tenant_row["tenant_id"]))
            connection.commit()
            return tenant_row

        fallback_row = self._resolve_default_tenant(
            connection,
            int(session_row["user_id"]),
            int(session_row["last_tenant_id"]) if session_row["last_tenant_id"] is not None else None,
        )
        if fallback_row is not None:
            connection.execute(
                "UPDATE sessions SET tenant_id = ? WHERE token_hash = ?",
                (fallback_row["tenant_id"], hash_token(session_token)),
            )
            self._remember_last_tenant(connection, int(session_row["user_id"]), int(fallback_row["tenant_id"]))
        elif tenant_id is not None:
            connection.execute(
                "UPDATE sessions SET tenant_id = NULL WHERE token_hash = ?",
                (hash_token(session_token),),
            )
            self._remember_last_tenant(connection, int(session_row["user_id"]), None)
        connection.commit()
        return fallback_row

    def _resolve_default_tenant(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        last_tenant_id: int | None,
    ) -> sqlite3.Row | None:
        if last_tenant_id:
            remembered_row = self._membership_row_by_id(connection, user_id, last_tenant_id)
            if remembered_row is not None:
                return remembered_row
        return self._first_membership_row(connection, user_id)

    @staticmethod
    def _remember_last_tenant(
        connection: sqlite3.Connection,
        user_id: int,
        tenant_id: int | None,
    ) -> None:
        connection.execute(
            "UPDATE users SET last_tenant_id = ? WHERE id = ?",
            (tenant_id, user_id),
        )

    def _create_default_tenant_for_user(
        self,
        connection: sqlite3.Connection,
        user_id: int,
        display_name: str,
        username: str,
    ) -> dict[str, Any]:
        name = f"{display_name} 的默认租户"
        slug = self._next_default_tenant_slug(connection, username)
        created_at = db_now()

        connection.execute(
            """
            INSERT INTO tenants (name, slug, status, owner_user_id, created_at)
            VALUES (?, ?, 'active', ?, ?)
            """,
            (name, slug, user_id, created_at),
        )
        tenant_id = int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])
        connection.execute(
            """
            INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
            VALUES (?, ?, 'owner', ?)
            """,
            (tenant_id, user_id, created_at),
        )
        return {"id": tenant_id, "name": name, "slug": slug}

    def _next_default_tenant_slug(self, connection: sqlite3.Connection, username: str) -> str:
        base = re.sub(r"[^a-z0-9-]+", "-", username.replace("_", "-")).strip("-")
        if not base:
            base = "user"
        base = base[:24].rstrip("-") or "user"
        candidate_base = f"{base}-default"
        candidate = candidate_base
        suffix = 2

        while True:
            exists = connection.execute(
                "SELECT 1 FROM tenants WHERE slug = ? LIMIT 1",
                (candidate,),
            ).fetchone()
            if exists is None:
                return candidate
            candidate = f"{candidate_base[: max(1, 32 - len(str(suffix)) - 1)]}-{suffix}"
            suffix += 1
