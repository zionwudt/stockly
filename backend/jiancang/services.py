from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import sqlite3

from .db import get_connection
from .security import SESSION_DAYS, db_days_from_now, db_now, generate_session_token, hash_token, verify_password


class ValidationError(Exception):
    """输入校验失败。"""


@dataclass(slots=True)
class RequestContext:
    tenant_id: int
    tenant_name: str
    tenant_slug: str
    user_id: int
    username: str
    display_name: str


@dataclass(slots=True)
class InventoryService:
    db_path: Path

    def authenticate_user(self, payload: dict[str, Any]) -> tuple[RequestContext, str]:
        tenant_slug = self._required_text(payload, "tenant_slug").lower()
        username = self._required_text(payload, "username")
        password = self._required_text(payload, "password")

        with get_connection(self.db_path) as connection:
            row = connection.execute(
                """
                SELECT
                    u.id AS user_id,
                    u.username,
                    u.display_name,
                    u.password_salt,
                    u.password_hash,
                    u.is_active,
                    t.id AS tenant_id,
                    t.name AS tenant_name,
                    t.slug AS tenant_slug,
                    t.status AS tenant_status
                FROM users u
                JOIN tenants t ON t.id = u.tenant_id
                WHERE t.slug = ? AND u.username = ?
                LIMIT 1
                """,
                (tenant_slug, username),
            ).fetchone()
            if row is None:
                raise ValidationError("租户、账号或密码不正确。")
            if row["tenant_status"] != "active" or not row["is_active"]:
                raise ValidationError("当前账号已停用，请联系管理员。")
            if not verify_password(password, row["password_salt"], row["password_hash"]):
                raise ValidationError("租户、账号或密码不正确。")

            session_token = generate_session_token()
            connection.execute(
                """
                INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (row["user_id"], hash_token(session_token), db_days_from_now(SESSION_DAYS), db_now()),
            )
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (db_now(),))
            connection.commit()

        return self._context_from_row(row), session_token

    def get_context_for_session(self, session_token: str | None) -> RequestContext | None:
        if not session_token:
            return None

        with get_connection(self.db_path) as connection:
            row = connection.execute(
                """
                SELECT
                    u.id AS user_id,
                    u.username,
                    u.display_name,
                    u.is_active,
                    t.id AS tenant_id,
                    t.name AS tenant_name,
                    t.slug AS tenant_slug,
                    t.status AS tenant_status
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                JOIN tenants t ON t.id = u.tenant_id
                WHERE s.token_hash = ? AND s.expires_at > ?
                LIMIT 1
                """,
                (hash_token(session_token), db_now()),
            ).fetchone()

        if row is None or row["tenant_status"] != "active" or not row["is_active"]:
            return None
        return self._context_from_row(row)

    def logout_session(self, session_token: str | None) -> None:
        if not session_token:
            return
        with get_connection(self.db_path) as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(session_token),))
            connection.commit()

    def get_auth_profile(self, context: RequestContext) -> dict[str, Any]:
        return {
            "tenant": {
                "id": context.tenant_id,
                "name": context.tenant_name,
                "slug": context.tenant_slug,
            },
            "user": {
                "id": context.user_id,
                "username": context.username,
                "display_name": context.display_name,
            },
        }

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
    def _context_from_row(row: sqlite3.Row) -> RequestContext:
        return RequestContext(
            tenant_id=int(row["tenant_id"]),
            tenant_name=str(row["tenant_name"]),
            tenant_slug=str(row["tenant_slug"]),
            user_id=int(row["user_id"]),
            username=str(row["username"]),
            display_name=str(row["display_name"] or row["username"]),
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
