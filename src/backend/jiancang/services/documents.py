from __future__ import annotations

import sqlite3
from typing import Any

from ..db import get_connection
from .models import RequestContext, ValidationError


class DocumentServiceMixin:
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
        return self._create_trade_document(
            context,
            payload,
            doc_type="purchase",
            partner_type="supplier",
            movement_sign=1,
            success_message="采购入库已登记",
        )

    def create_sale(self, context: RequestContext, payload: dict[str, Any]) -> dict[str, Any]:
        return self._create_trade_document(
            context,
            payload,
            doc_type="sale",
            partner_type="customer",
            movement_sign=-1,
            success_message="销售出库已登记",
        )

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
            document_id = self._insert_document(
                connection,
                context.tenant_id,
                doc_no,
                "adjustment",
                None,
                note_text,
                0,
            )
            self._insert_document_item(
                connection,
                context.tenant_id,
                document_id,
                product_id,
                abs(quantity_delta),
                0,
            )
            self._insert_stock_movement(
                connection,
                context.tenant_id,
                product_id,
                document_id,
                "adjustment",
                quantity_delta,
                0,
                note_text,
            )
            connection.commit()

        return {"message": f"库存调整已登记，单号 {doc_no}", "doc_no": doc_no}

    def _create_trade_document(
        self,
        context: RequestContext,
        payload: dict[str, Any],
        *,
        doc_type: str,
        partner_type: str,
        movement_sign: int,
        success_message: str,
    ) -> dict[str, Any]:
        note = self._text(payload, "note")
        items = self._normalize_items(payload)

        with get_connection(self.db_path) as connection:
            partner_id = self._partner_id(connection, context.tenant_id, payload, partner_type)
            if movement_sign < 0:
                self._ensure_sale_stock(connection, context.tenant_id, items)

            total_amount = round(sum(item["quantity"] * item["unit_price"] for item in items), 2)
            doc_no = self._generate_doc_no(connection, context.tenant_id, doc_type)
            document_id = self._insert_document(
                connection,
                context.tenant_id,
                doc_no,
                doc_type,
                partner_id,
                note,
                total_amount,
            )
            self._insert_trade_items(
                connection,
                context.tenant_id,
                document_id,
                doc_type,
                items,
                note,
                movement_sign,
            )
            connection.commit()

        return {"message": f"{success_message}，单号 {doc_no}", "doc_no": doc_no}

    def _ensure_sale_stock(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        items: list[dict[str, float]],
    ) -> None:
        current_stock = self._stock_by_product(connection, tenant_id)
        for item in items:
            self._product_exists(connection, tenant_id, item["product_id"])
            available = current_stock.get(item["product_id"], 0.0)
            if available < item["quantity"]:
                raise ValidationError(f"商品库存不足，product_id={item['product_id']} 当前仅剩 {available}")
            current_stock[item["product_id"]] = round(available - item["quantity"], 2)

    def _insert_document(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        doc_no: str,
        doc_type: str,
        partner_id: int | None,
        note: str,
        total_amount: float,
    ) -> int:
        connection.execute(
            """
            INSERT INTO documents (tenant_id, doc_no, doc_type, partner_id, note, total_amount)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (tenant_id, doc_no, doc_type, partner_id, note, total_amount),
        )
        return int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])

    def _insert_trade_items(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        document_id: int,
        doc_type: str,
        items: list[dict[str, float]],
        note: str,
        movement_sign: int,
    ) -> None:
        for item in items:
            self._product_exists(connection, tenant_id, item["product_id"])
            self._insert_document_item(
                connection,
                tenant_id,
                document_id,
                item["product_id"],
                item["quantity"],
                item["unit_price"],
            )
            self._insert_stock_movement(
                connection,
                tenant_id,
                item["product_id"],
                document_id,
                doc_type,
                movement_sign * item["quantity"],
                item["unit_price"],
                note,
            )

    def _insert_document_item(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        document_id: int,
        product_id: int,
        quantity: float,
        unit_price: float,
    ) -> None:
        amount = round(quantity * unit_price, 2)
        connection.execute(
            """
            INSERT INTO document_items (tenant_id, document_id, product_id, quantity, unit_price, line_amount)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (tenant_id, document_id, product_id, quantity, unit_price, amount),
        )

    def _insert_stock_movement(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        product_id: int,
        document_id: int,
        movement_type: str,
        quantity_delta: float,
        unit_price: float,
        note: str,
    ) -> None:
        connection.execute(
            """
            INSERT INTO stock_movements (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note),
        )
