from __future__ import annotations

import sqlite3
from typing import Any

from .models import ValidationError


class DocumentSupportMixin:
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
