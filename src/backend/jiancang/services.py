from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import re
import sqlite3

from .db import get_connection
from .security import (
    SESSION_DAYS,
    db_days_from_now,
    db_now,
    generate_salt,
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)


USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{2,31}$")
TENANT_SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,31}$")


class ValidationError(Exception):
    """输入校验失败。"""


@dataclass(slots=True)
class SessionPrincipal:
    user_id: int
    username: str
    display_name: str
    tenant_id: int | None = None
    tenant_name: str | None = None
    tenant_slug: str | None = None
    tenant_role: str | None = None


@dataclass(slots=True)
class RequestContext:
    tenant_id: int
    tenant_name: str
    tenant_slug: str
    tenant_role: str
    user_id: int
    username: str
    display_name: str


@dataclass(slots=True)
class InventoryService:
    db_path: Path

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

            tenant_row = None
            if preferred_tenant_slug:
                tenant_row = self._membership_row_by_slug(connection, int(user_row["id"]), preferred_tenant_slug)
                if tenant_row is None:
                    raise ValidationError("当前账号尚未加入该租户，或租户不可用。")
            else:
                tenant_row = self._first_membership_row(connection, int(user_row["id"]))

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

            tenant_row = None
            tenant_id = session_row["tenant_id"]
            if tenant_id is not None:
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
            if tenant_id:
                tenant_row = self._membership_row_by_id(connection, principal.user_id, tenant_id)
            else:
                tenant_row = self._membership_row_by_slug(connection, principal.user_id, tenant_slug)
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
        tenant_id = int(payload.get("tenant_id") or 0)
        tenant_slug = self._normalized_tenant_slug(self._text(payload, "tenant_slug"))
        note = self._text(payload, "note")

        with get_connection(self.db_path) as connection:
            tenant_row = None
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
            if int(tenant_row["owner_user_id"] or 0) == principal.user_id:
                raise ValidationError("你已经是该租户的创建者。")

            membership_exists = connection.execute(
                """
                SELECT 1
                FROM tenant_memberships
                WHERE tenant_id = ? AND user_id = ?
                LIMIT 1
                """,
                (tenant_row["id"], principal.user_id),
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
                (tenant_row["id"], principal.user_id),
            ).fetchone()
            if pending_exists is not None:
                raise ValidationError("你已经提交过加入申请，请等待处理。")

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
            if int(request_row["owner_user_id"] or 0) != principal.user_id:
                raise ValidationError("只有租户创建者可以处理加入申请。")

            decided_at = db_now()
            if approved:
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

    def list_products(self, context: RequestContext) -> list[dict[str, Any]]:
        query = """
        SELECT
            p.*,
            ROUND(COALESCE(SUM(m.quantity_delta), 0), 2) AS on_hand
        FROM products p
        LEFT JOIN stock_movements m
            ON m.product_id = p.id AND m.tenant_id = p.tenant_id
        WHERE p.tenant_id = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC, p.id DESC
        """
        with get_connection(self.db_path) as connection:
            rows = connection.execute(query, (context.tenant_id,)).fetchall()
        return [dict(row) for row in rows]

    def create_product(self, context: RequestContext, payload: dict[str, Any]) -> dict[str, Any]:
        sku = self._required_text(payload, "sku")
        name = self._required_text(payload, "name")
        category = self._text(payload, "category")
        unit = self._text(payload, "unit") or "件"
        purchase_price = self._non_negative_number(payload, "purchase_price")
        sale_price = self._non_negative_number(payload, "sale_price")
        safety_stock = self._non_negative_number(payload, "safety_stock")

        with get_connection(self.db_path) as connection:
            try:
                connection.execute(
                    """
                    INSERT INTO products (tenant_id, sku, name, category, unit, purchase_price, sale_price, safety_stock)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        context.tenant_id,
                        sku,
                        name,
                        category,
                        unit,
                        purchase_price,
                        sale_price,
                        safety_stock,
                    ),
                )
                connection.commit()
            except sqlite3.IntegrityError as exc:
                raise ValidationError("商品编码已存在，请使用新的 SKU。") from exc

        return {"message": "商品已创建"}

    def list_partners(self, context: RequestContext, partner_type: str) -> list[dict[str, Any]]:
        self._validate_partner_type(partner_type)
        with get_connection(self.db_path) as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM partners
                WHERE tenant_id = ? AND partner_type = ?
                ORDER BY created_at DESC, id DESC
                """,
                (context.tenant_id, partner_type),
            ).fetchall()
        return [dict(row) for row in rows]

    def create_partner(self, context: RequestContext, partner_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._validate_partner_type(partner_type)
        name = self._required_text(payload, "name")
        contact = self._text(payload, "contact")
        phone = self._text(payload, "phone")
        note = self._text(payload, "note")

        with get_connection(self.db_path) as connection:
            connection.execute(
                """
                INSERT INTO partners (tenant_id, name, partner_type, contact, phone, note)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (context.tenant_id, name, partner_type, contact, phone, note),
            )
            connection.commit()
        return {"message": "往来单位已创建"}

    def get_summary(self, context: RequestContext) -> dict[str, Any]:
        with get_connection(self.db_path) as connection:
            counts = connection.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM products WHERE tenant_id = ?) AS product_count,
                    (SELECT COUNT(*) FROM partners WHERE tenant_id = ? AND partner_type = 'supplier') AS supplier_count,
                    (SELECT COUNT(*) FROM partners WHERE tenant_id = ? AND partner_type = 'customer') AS customer_count,
                    (SELECT COUNT(*) FROM documents WHERE tenant_id = ? AND doc_type = 'purchase') AS purchase_count,
                    (SELECT COUNT(*) FROM documents WHERE tenant_id = ? AND doc_type = 'sale') AS sale_count
                """,
                (
                    context.tenant_id,
                    context.tenant_id,
                    context.tenant_id,
                    context.tenant_id,
                    context.tenant_id,
                ),
            ).fetchone()
            stock_rows = connection.execute(
                """
                SELECT
                    p.id,
                    p.name,
                    p.sku,
                    p.safety_stock,
                    p.purchase_price,
                    ROUND(COALESCE(SUM(m.quantity_delta), 0), 2) AS on_hand
                FROM products p
                LEFT JOIN stock_movements m
                    ON m.product_id = p.id AND m.tenant_id = p.tenant_id
                WHERE p.tenant_id = ?
                GROUP BY p.id
                ORDER BY on_hand ASC, p.id DESC
                """,
                (context.tenant_id,),
            ).fetchall()
            recent_docs = connection.execute(
                """
                SELECT
                    d.doc_no,
                    d.doc_type,
                    d.total_amount,
                    d.created_at,
                    COALESCE(p.name, '库存调整') AS partner_name
                FROM documents d
                LEFT JOIN partners p ON p.id = d.partner_id AND p.tenant_id = d.tenant_id
                WHERE d.tenant_id = ?
                ORDER BY d.created_at DESC, d.id DESC
                LIMIT 6
                """,
                (context.tenant_id,),
            ).fetchall()

        stock_value = 0.0
        alert_items = []
        for row in stock_rows:
            on_hand = float(row["on_hand"])
            stock_value += on_hand * float(row["purchase_price"])
            if on_hand <= float(row["safety_stock"]):
                alert_items.append(
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "sku": row["sku"],
                        "on_hand": round(on_hand, 2),
                        "safety_stock": round(float(row["safety_stock"]), 2),
                    }
                )

        return {
            "metrics": {
                "product_count": counts["product_count"],
                "supplier_count": counts["supplier_count"],
                "customer_count": counts["customer_count"],
                "purchase_count": counts["purchase_count"],
                "sale_count": counts["sale_count"],
                "stock_value": round(stock_value, 2),
                "alert_count": len(alert_items),
            },
            "alerts": alert_items[:5],
            "recent_documents": [dict(row) for row in recent_docs],
        }

    def get_stock_overview(self, context: RequestContext) -> list[dict[str, Any]]:
        query = """
        SELECT
            p.id,
            p.sku,
            p.name,
            p.category,
            p.unit,
            p.purchase_price,
            p.sale_price,
            p.safety_stock,
            ROUND(COALESCE(SUM(m.quantity_delta), 0), 2) AS on_hand
        FROM products p
        LEFT JOIN stock_movements m
            ON m.product_id = p.id AND m.tenant_id = p.tenant_id
        WHERE p.tenant_id = ?
        GROUP BY p.id
        ORDER BY on_hand ASC, p.id DESC
        """
        with get_connection(self.db_path) as connection:
            rows = connection.execute(query, (context.tenant_id,)).fetchall()

        result = []
        for row in rows:
            item = dict(row)
            item["in_alert"] = float(item["on_hand"]) <= float(item["safety_stock"])
            item["inventory_value"] = round(float(item["on_hand"]) * float(item["purchase_price"]), 2)
            result.append(item)
        return result

    def list_movements(self, context: RequestContext, limit: int = 30) -> list[dict[str, Any]]:
        safe_limit = max(1, min(limit, 200))
        query = """
        SELECT
            m.id,
            m.movement_type,
            m.quantity_delta,
            m.unit_price,
            m.note,
            m.created_at,
            p.sku,
            p.name AS product_name,
            d.doc_no
        FROM stock_movements m
        JOIN products p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
        LEFT JOIN documents d ON d.id = m.document_id AND d.tenant_id = m.tenant_id
        WHERE m.tenant_id = ?
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
        """
        with get_connection(self.db_path) as connection:
            rows = connection.execute(query, (context.tenant_id, safe_limit)).fetchall()
        return [dict(row) for row in rows]

    def list_documents(
        self,
        context: RequestContext,
        doc_type: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(limit, 200))
        parameters: list[Any] = [context.tenant_id]
        type_filter = ""
        if doc_type:
            if doc_type not in {"purchase", "sale", "adjustment"}:
                raise ValidationError("doc_type 仅支持 purchase、sale 或 adjustment。")
            type_filter = "AND d.doc_type = ?"
            parameters.append(doc_type)

        query = f"""
        SELECT
            d.id,
            d.doc_no,
            d.doc_type,
            d.note,
            d.total_amount,
            d.created_at,
            COALESCE(p.name, '库存调整') AS partner_name,
            COUNT(i.id) AS item_count
        FROM documents d
        LEFT JOIN partners p ON p.id = d.partner_id AND p.tenant_id = d.tenant_id
        LEFT JOIN document_items i ON i.document_id = d.id AND i.tenant_id = d.tenant_id
        WHERE d.tenant_id = ?
        {type_filter}
        GROUP BY d.id
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT ?
        """
        parameters.append(safe_limit)

        with get_connection(self.db_path) as connection:
            rows = connection.execute(query, tuple(parameters)).fetchall()
        return [dict(row) for row in rows]

    def create_purchase(self, context: RequestContext, payload: dict[str, Any]) -> dict[str, Any]:
        note = self._text(payload, "note")
        items = self._normalize_items(payload)

        with get_connection(self.db_path) as connection:
            partner_id = self._partner_id(connection, context.tenant_id, payload, "supplier")
            total_amount = round(sum(item["quantity"] * item["unit_price"] for item in items), 2)
            doc_no = self._generate_doc_no(connection, context.tenant_id, "purchase")
            connection.execute(
                """
                INSERT INTO documents (tenant_id, doc_no, doc_type, partner_id, note, total_amount)
                VALUES (?, ?, 'purchase', ?, ?, ?)
                """,
                (context.tenant_id, doc_no, partner_id, note, total_amount),
            )
            document_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]

            for item in items:
                self._product_exists(connection, context.tenant_id, item["product_id"])
                amount = round(item["quantity"] * item["unit_price"], 2)
                connection.execute(
                    """
                    INSERT INTO document_items (tenant_id, document_id, product_id, quantity, unit_price, line_amount)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        context.tenant_id,
                        document_id,
                        item["product_id"],
                        item["quantity"],
                        item["unit_price"],
                        amount,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO stock_movements (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note)
                    VALUES (?, ?, ?, 'purchase', ?, ?, ?)
                    """,
                    (
                        context.tenant_id,
                        item["product_id"],
                        document_id,
                        item["quantity"],
                        item["unit_price"],
                        note,
                    ),
                )

            connection.commit()

        return {"message": f"采购入库已登记，单号 {doc_no}", "doc_no": doc_no}

    def create_sale(self, context: RequestContext, payload: dict[str, Any]) -> dict[str, Any]:
        note = self._text(payload, "note")
        items = self._normalize_items(payload)

        with get_connection(self.db_path) as connection:
            partner_id = self._partner_id(connection, context.tenant_id, payload, "customer")
            current_stock = self._stock_by_product(connection, context.tenant_id)
            for item in items:
                self._product_exists(connection, context.tenant_id, item["product_id"])
                available = current_stock.get(item["product_id"], 0.0)
                if available < item["quantity"]:
                    raise ValidationError(f"商品库存不足，product_id={item['product_id']} 当前仅剩 {available}")
                current_stock[item["product_id"]] = round(available - item["quantity"], 2)

            total_amount = round(sum(item["quantity"] * item["unit_price"] for item in items), 2)
            doc_no = self._generate_doc_no(connection, context.tenant_id, "sale")
            connection.execute(
                """
                INSERT INTO documents (tenant_id, doc_no, doc_type, partner_id, note, total_amount)
                VALUES (?, ?, 'sale', ?, ?, ?)
                """,
                (context.tenant_id, doc_no, partner_id, note, total_amount),
            )
            document_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]

            for item in items:
                amount = round(item["quantity"] * item["unit_price"], 2)
                connection.execute(
                    """
                    INSERT INTO document_items (tenant_id, document_id, product_id, quantity, unit_price, line_amount)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        context.tenant_id,
                        document_id,
                        item["product_id"],
                        item["quantity"],
                        item["unit_price"],
                        amount,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO stock_movements (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note)
                    VALUES (?, ?, ?, 'sale', ?, ?, ?)
                    """,
                    (
                        context.tenant_id,
                        item["product_id"],
                        document_id,
                        -item["quantity"],
                        item["unit_price"],
                        note,
                    ),
                )

            connection.commit()

        return {"message": f"销售出库已登记，单号 {doc_no}", "doc_no": doc_no}

    def create_adjustment(self, context: RequestContext, payload: dict[str, Any]) -> dict[str, Any]:
        product_id = int(payload.get("product_id") or 0)
        quantity_delta = self._number(payload, "quantity_delta")
        reason = self._required_text(payload, "reason")
        note = self._text(payload, "note")

        if not product_id:
            raise ValidationError("请选择需要调整的商品。")
        if quantity_delta == 0:
            raise ValidationError("调整数量不能为 0。")

        with get_connection(self.db_path) as connection:
            self._product_exists(connection, context.tenant_id, product_id)
            current_stock = self._stock_by_product(connection, context.tenant_id).get(product_id, 0.0)
            if current_stock + quantity_delta < 0:
                raise ValidationError(f"调整后库存不能为负数，当前库存 {current_stock}")

            doc_no = self._generate_doc_no(connection, context.tenant_id, "adjustment")
            note_text = f"{reason} {note}".strip()
            connection.execute(
                """
                INSERT INTO documents (tenant_id, doc_no, doc_type, note, total_amount)
                VALUES (?, ?, 'adjustment', ?, 0)
                """,
                (context.tenant_id, doc_no, note_text),
            )
            document_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            connection.execute(
                """
                INSERT INTO document_items (tenant_id, document_id, product_id, quantity, unit_price, line_amount)
                VALUES (?, ?, ?, ?, 0, 0)
                """,
                (context.tenant_id, document_id, product_id, abs(quantity_delta)),
            )
            connection.execute(
                """
                INSERT INTO stock_movements (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note)
                VALUES (?, ?, ?, 'adjustment', ?, 0, ?)
                """,
                (context.tenant_id, product_id, document_id, quantity_delta, note_text),
            )
            connection.commit()

        return {"message": f"库存调整已登记，单号 {doc_no}", "doc_no": doc_no}

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
            ORDER BY CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END, t.created_at DESC, t.id DESC
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
        owner_user_id: int,
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
            WHERE r.status = 'pending' AND t.owner_user_id = ?
            ORDER BY CASE WHEN t.id = ? THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC
            """,
            (owner_user_id, current_tenant_id or -1),
        ).fetchall()
        return [dict(row) for row in rows]

    def _normalize_items(self, payload: dict[str, Any]) -> list[dict[str, float]]:
        raw_items = payload.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            raise ValidationError("请至少填写一条商品明细。")

        items = []
        seen_products: set[int] = set()
        for entry in raw_items:
            if not isinstance(entry, dict):
                raise ValidationError("商品明细格式不正确。")
            product_id = int(entry.get("product_id") or 0)
            quantity = self._positive_number(entry, "quantity")
            unit_price = self._non_negative_number(entry, "unit_price")
            if not product_id:
                raise ValidationError("商品明细缺少 product_id。")
            if product_id in seen_products:
                raise ValidationError("同一张单据里请不要重复选择相同商品。")
            seen_products.add(product_id)
            items.append(
                {
                    "product_id": product_id,
                    "quantity": quantity,
                    "unit_price": unit_price,
                }
            )
        return items

    def _product_exists(self, connection: sqlite3.Connection, tenant_id: int, product_id: int) -> None:
        row = connection.execute(
            "SELECT id FROM products WHERE tenant_id = ? AND id = ?",
            (tenant_id, product_id),
        ).fetchone()
        if row is None:
            raise ValidationError(f"商品不存在，product_id={product_id}")

    def _partner_id(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        payload: dict[str, Any],
        partner_type: str,
    ) -> int:
        self._validate_partner_type(partner_type)
        partner_id = int(payload.get("partner_id") or 0)
        if not partner_id:
            raise ValidationError("请选择往来单位。")
        row = connection.execute(
            """
            SELECT id
            FROM partners
            WHERE tenant_id = ? AND id = ? AND partner_type = ?
            """,
            (tenant_id, partner_id, partner_type),
        ).fetchone()
        if row is None:
            raise ValidationError("往来单位不存在或类型不匹配。")
        return partner_id

    def _generate_doc_no(self, connection: sqlite3.Connection, tenant_id: int, doc_type: str) -> str:
        prefixes = {
            "purchase": "PO",
            "sale": "SO",
            "adjustment": "ADJ",
        }
        prefix = prefixes[doc_type]
        count = connection.execute(
            "SELECT COUNT(*) FROM documents WHERE tenant_id = ? AND doc_type = ?",
            (tenant_id, doc_type),
        ).fetchone()[0]
        return f"{prefix}-{tenant_id:02d}-{count + 1:04d}"

    def _stock_by_product(self, connection: sqlite3.Connection, tenant_id: int) -> dict[int, float]:
        rows = connection.execute(
            """
            SELECT product_id, ROUND(SUM(quantity_delta), 2) AS on_hand
            FROM stock_movements
            WHERE tenant_id = ?
            GROUP BY product_id
            """,
            (tenant_id,),
        ).fetchall()
        return {int(row["product_id"]): float(row["on_hand"]) for row in rows}

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

    @staticmethod
    def _validate_partner_type(partner_type: str) -> None:
        if partner_type not in {"supplier", "customer"}:
            raise ValidationError("仅支持 supplier 或 customer 类型。")

    @staticmethod
    def _text(payload: dict[str, Any], key: str) -> str:
        value = payload.get(key, "")
        return str(value).strip()

    def _required_text(self, payload: dict[str, Any], key: str) -> str:
        value = self._text(payload, key)
        if not value:
            raise ValidationError(f"{key} 不能为空。")
        return value

    @staticmethod
    def _number(payload: dict[str, Any], key: str) -> float:
        try:
            return round(float(payload.get(key, 0)), 2)
        except (TypeError, ValueError) as exc:
            raise ValidationError(f"{key} 不是有效数字。") from exc

    def _positive_number(self, payload: dict[str, Any], key: str) -> float:
        value = self._number(payload, key)
        if value <= 0:
            raise ValidationError(f"{key} 必须大于 0。")
        return value

    def _non_negative_number(self, payload: dict[str, Any], key: str) -> float:
        value = self._number(payload, key)
        if value < 0:
            raise ValidationError(f"{key} 不能为负数。")
        return value

    @staticmethod
    def _normalized_username(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _normalized_tenant_slug(value: str) -> str:
        return value.strip().lower()

    def _validate_username(self, username: str) -> None:
        if not USERNAME_PATTERN.fullmatch(username):
            raise ValidationError("账号只支持 3-32 位小写字母、数字、下划线和中划线。")

    def _validate_password(self, password: str) -> None:
        if len(password) < 8:
            raise ValidationError("密码长度不能少于 8 位。")

    def _validate_tenant_slug(self, slug: str) -> None:
        if not TENANT_SLUG_PATTERN.fullmatch(slug):
            raise ValidationError("租户标识只支持 2-32 位小写字母、数字和中划线。")
