from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from ..db import get_connection
from .models import RequestContext, ValidationError


def _db_now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class InventoryQueryServiceMixin:
    def list_products(self, context: RequestContext) -> list[dict[str, Any]]:
        query = """
        SELECT
            p.*,
            ROUND(COALESCE(SUM(m.quantity_delta), 0), 2) AS on_hand
        FROM products p
        LEFT JOIN stock_movements m
            ON m.product_id = p.id AND m.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.is_deleted = 0
        GROUP BY p.id
        ORDER BY p.created_at DESC, p.id DESC
        """
        with get_connection(self.db_path) as connection:
            rows = connection.execute(query, (context.tenant_id,)).fetchall()
        return [dict(row) for row in rows]

    def delete_product(
        self, context: RequestContext, product_id: int
    ) -> dict[str, Any]:
        with get_connection(self.db_path) as connection:
            cursor = connection.execute(
                "SELECT id FROM products WHERE id = ? AND tenant_id = ? AND is_deleted = 0",
                (product_id, context.tenant_id),
            )
            if cursor.fetchone() is None:
                raise ValidationError("商品不存在或已删除。")
            connection.execute(
                "UPDATE products SET is_deleted = 1, deleted_at = ? WHERE id = ?",
                (_db_now(), product_id),
            )
            connection.commit()
        return {"message": "商品已删除"}

    def create_product(
        self, context: RequestContext, payload: dict[str, Any]
    ) -> dict[str, Any]:
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

    def list_partners(
        self, context: RequestContext, partner_type: str
    ) -> list[dict[str, Any]]:
        self._validate_partner_type(partner_type)
        with get_connection(self.db_path) as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM partners
                WHERE tenant_id = ? AND partner_type = ? AND is_deleted = 0
                ORDER BY created_at DESC, id DESC
                """,
                (context.tenant_id, partner_type),
            ).fetchall()
        return [dict(row) for row in rows]

    def delete_partner(
        self, context: RequestContext, partner_id: int
    ) -> dict[str, Any]:
        with get_connection(self.db_path) as connection:
            cursor = connection.execute(
                "SELECT id FROM partners WHERE id = ? AND tenant_id = ? AND is_deleted = 0",
                (partner_id, context.tenant_id),
            )
            if cursor.fetchone() is None:
                raise ValidationError("往来单位不存在或已删除。")
            connection.execute(
                "UPDATE partners SET is_deleted = 1, deleted_at = ? WHERE id = ?",
                (_db_now(), partner_id),
            )
            connection.commit()
        return {"message": "往来单位已删除"}

    def create_partner(
        self, context: RequestContext, partner_type: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
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
            counts = self._summary_counts(connection, context.tenant_id)
            stock_rows = self._summary_stock_rows(connection, context.tenant_id)
            recent_docs = self._recent_documents(connection, context.tenant_id)

        stock_value, alert_items = self._summary_alerts(stock_rows)
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
        WHERE p.tenant_id = ? AND p.is_deleted = 0
        GROUP BY p.id
        ORDER BY on_hand ASC, p.id DESC
        """
        with get_connection(self.db_path) as connection:
            rows = connection.execute(query, (context.tenant_id,)).fetchall()

        result = []
        for row in rows:
            item = dict(row)
            item["in_alert"] = float(item["on_hand"]) <= float(item["safety_stock"])
            item["inventory_value"] = round(
                float(item["on_hand"]) * float(item["purchase_price"]), 2
            )
            result.append(item)
        return result

    def _summary_counts(
        self, connection: sqlite3.Connection, tenant_id: int
    ) -> sqlite3.Row:
        return connection.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM products WHERE tenant_id = ? AND is_deleted = 0) AS product_count,
                (SELECT COUNT(*) FROM partners WHERE tenant_id = ? AND partner_type = 'supplier' AND is_deleted = 0) AS supplier_count,
                (SELECT COUNT(*) FROM partners WHERE tenant_id = ? AND partner_type = 'customer' AND is_deleted = 0) AS customer_count,
                (SELECT COUNT(*) FROM documents WHERE tenant_id = ? AND doc_type = 'purchase' AND status = 'active') AS purchase_count,
                (SELECT COUNT(*) FROM documents WHERE tenant_id = ? AND doc_type = 'sale' AND status = 'active') AS sale_count
            """,
            (tenant_id, tenant_id, tenant_id, tenant_id, tenant_id),
        ).fetchone()

    def _summary_stock_rows(
        self, connection: sqlite3.Connection, tenant_id: int
    ) -> list[sqlite3.Row]:
        return connection.execute(
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
            WHERE p.tenant_id = ? AND p.is_deleted = 0
            GROUP BY p.id
            ORDER BY on_hand ASC, p.id DESC
            """,
            (tenant_id,),
        ).fetchall()

    def _recent_documents(
        self, connection: sqlite3.Connection, tenant_id: int
    ) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT
                d.doc_no,
                d.doc_type,
                d.total_amount,
                d.status,
                d.created_at,
                COALESCE(p.name, '库存调整') AS partner_name
            FROM documents d
            LEFT JOIN partners p ON p.id = d.partner_id AND p.tenant_id = d.tenant_id
            WHERE d.tenant_id = ?
            ORDER BY d.created_at DESC, d.id DESC
            LIMIT 6
            """,
            (tenant_id,),
        ).fetchall()

    def _summary_alerts(
        self, stock_rows: list[sqlite3.Row]
    ) -> tuple[float, list[dict[str, Any]]]:
        stock_value = 0.0
        alert_items: list[dict[str, Any]] = []
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
        return stock_value, alert_items
