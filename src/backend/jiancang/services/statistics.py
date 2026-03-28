from __future__ import annotations

from datetime import date
import sqlite3
from typing import Any

from ..db import get_connection
from .models import RequestContext, ValidationError


DEFAULT_STATISTICS_MONTH_WINDOW = 6


class StatisticsServiceMixin:
    def get_statistics(
        self,
        context: RequestContext,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        start, end = self._resolve_statistics_range(start_date, end_date)

        with get_connection(self.db_path) as connection:
            overview = self._statistics_overview(
                connection, context.tenant_id, start, end
            )
            monthly_documents = self._statistics_monthly_documents(
                connection, context.tenant_id, start, end
            )
            monthly_movements = self._statistics_monthly_movements(
                connection, context.tenant_id, start, end
            )
            top_products = self._statistics_top_products(
                connection, context.tenant_id, start, end
            )

        purchase_amount = round(float(overview["purchase_amount"] or 0), 2)
        sale_amount = round(float(overview["sale_amount"] or 0), 2)
        purchase_quantity = round(float(overview["purchase_quantity"] or 0), 2)
        sale_quantity = round(float(overview["sale_quantity"] or 0), 2)
        adjustment_quantity = round(float(overview["adjustment_quantity"] or 0), 2)
        purchase_docs = int(overview["purchase_docs"] or 0)
        sale_docs = int(overview["sale_docs"] or 0)
        adjustment_docs = int(overview["adjustment_docs"] or 0)

        return {
            "range": {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "day_count": (end - start).days + 1,
                "month_count": len(self._month_starts(start, end)),
                "label": f"{start.isoformat()} 至 {end.isoformat()}",
            },
            "overview": {
                "document_count": int(overview["document_count"] or 0),
                "active_days": int(overview["active_days"] or 0),
                "purchase_docs": purchase_docs,
                "sale_docs": sale_docs,
                "adjustment_docs": adjustment_docs,
                "purchase_amount": purchase_amount,
                "sale_amount": sale_amount,
                "net_amount": round(sale_amount - purchase_amount, 2),
                "purchase_quantity": purchase_quantity,
                "sale_quantity": sale_quantity,
                "adjustment_quantity": adjustment_quantity,
            },
            "monthly": self._merge_monthly_statistics(
                monthly_documents, monthly_movements, start, end
            ),
            "mix": [
                {
                    "type": "sale",
                    "label": "销售",
                    "count": sale_docs,
                    "amount": sale_amount,
                    "quantity": sale_quantity,
                },
                {
                    "type": "purchase",
                    "label": "采购",
                    "count": purchase_docs,
                    "amount": purchase_amount,
                    "quantity": purchase_quantity,
                },
                {
                    "type": "adjustment",
                    "label": "调整",
                    "count": adjustment_docs,
                    "amount": 0,
                    "quantity": adjustment_quantity,
                },
            ],
            "top_products": [self._serialize_top_product(row) for row in top_products],
        }

    def _resolve_statistics_range(
        self,
        start_date: str | None,
        end_date: str | None,
    ) -> tuple[date, date]:
        today = date.today()
        end = self._parse_iso_date(end_date, "end_date") if end_date else today
        start = (
            self._parse_iso_date(start_date, "start_date")
            if start_date
            else self._shift_month_start(end, -(DEFAULT_STATISTICS_MONTH_WINDOW - 1))
        )
        if start > end:
            raise ValidationError("start_date 不能晚于 end_date。")
        return start, end

    def _parse_iso_date(self, value: str, field_name: str) -> date:
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValidationError(f"{field_name} 必须是 YYYY-MM-DD 格式。") from exc

    def _statistics_overview(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        start: date,
        end: date,
    ) -> sqlite3.Row:
        return connection.execute(
            """
            SELECT
                (
                    SELECT COUNT(*)
                    FROM documents
                    WHERE tenant_id = ?
                      AND status = 'active'
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS document_count,
                (
                    SELECT COUNT(DISTINCT DATE(created_at))
                    FROM documents
                    WHERE tenant_id = ?
                      AND status = 'active'
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS active_days,
                (
                    SELECT COUNT(*)
                    FROM documents
                    WHERE tenant_id = ?
                      AND doc_type = 'purchase'
                      AND status = 'active'
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS purchase_docs,
                (
                    SELECT COUNT(*)
                    FROM documents
                    WHERE tenant_id = ?
                      AND doc_type = 'sale'
                      AND status = 'active'
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS sale_docs,
                (
                    SELECT COUNT(*)
                    FROM documents
                    WHERE tenant_id = ?
                      AND doc_type = 'adjustment'
                      AND status = 'active'
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS adjustment_docs,
                (
                    SELECT ROUND(COALESCE(SUM(total_amount), 0), 2)
                    FROM documents
                    WHERE tenant_id = ?
                      AND doc_type = 'purchase'
                      AND status = 'active'
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS purchase_amount,
                (
                    SELECT ROUND(COALESCE(SUM(total_amount), 0), 2)
                    FROM documents
                    WHERE tenant_id = ?
                      AND doc_type = 'sale'
                      AND status = 'active'
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS sale_amount,
                (
                    SELECT ROUND(COALESCE(SUM(CASE WHEN movement_type = 'purchase' THEN ABS(quantity_delta) ELSE 0 END), 0), 2)
                    FROM stock_movements
                    WHERE tenant_id = ?
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS purchase_quantity,
                (
                    SELECT ROUND(COALESCE(SUM(CASE WHEN movement_type = 'sale' THEN ABS(quantity_delta) ELSE 0 END), 0), 2)
                    FROM stock_movements
                    WHERE tenant_id = ?
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS sale_quantity,
                (
                    SELECT ROUND(COALESCE(SUM(CASE WHEN movement_type = 'adjustment' THEN ABS(quantity_delta) ELSE 0 END), 0), 2)
                    FROM stock_movements
                    WHERE tenant_id = ?
                      AND DATE(created_at) BETWEEN ? AND ?
                ) AS adjustment_quantity
            """,
            (
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
                tenant_id,
                start.isoformat(),
                end.isoformat(),
            ),
        ).fetchone()

    def _statistics_monthly_documents(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        start: date,
        end: date,
    ) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT
                STRFTIME('%Y-%m', d.created_at) AS month_key,
                ROUND(COALESCE(SUM(CASE WHEN d.doc_type = 'purchase' THEN d.total_amount ELSE 0 END), 0), 2) AS purchase_amount,
                ROUND(COALESCE(SUM(CASE WHEN d.doc_type = 'sale' THEN d.total_amount ELSE 0 END), 0), 2) AS sale_amount,
                SUM(CASE WHEN d.doc_type = 'purchase' THEN 1 ELSE 0 END) AS purchase_docs,
                SUM(CASE WHEN d.doc_type = 'sale' THEN 1 ELSE 0 END) AS sale_docs,
                SUM(CASE WHEN d.doc_type = 'adjustment' THEN 1 ELSE 0 END) AS adjustment_docs
            FROM documents d
            WHERE d.tenant_id = ?
              AND d.status = 'active'
              AND DATE(d.created_at) BETWEEN ? AND ?
            GROUP BY month_key
            ORDER BY month_key ASC
            """,
            (tenant_id, start.isoformat(), end.isoformat()),
        ).fetchall()

    def _statistics_monthly_movements(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        start: date,
        end: date,
    ) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT
                STRFTIME('%Y-%m', m.created_at) AS month_key,
                ROUND(
                    COALESCE(SUM(CASE WHEN m.movement_type = 'purchase' THEN ABS(m.quantity_delta) ELSE 0 END), 0),
                    2
                ) AS purchase_quantity,
                ROUND(
                    COALESCE(SUM(CASE WHEN m.movement_type = 'sale' THEN ABS(m.quantity_delta) ELSE 0 END), 0),
                    2
                ) AS sale_quantity,
                ROUND(
                    COALESCE(SUM(CASE WHEN m.movement_type = 'adjustment' THEN ABS(m.quantity_delta) ELSE 0 END), 0),
                    2
                ) AS adjustment_quantity
            FROM stock_movements m
            WHERE m.tenant_id = ?
              AND DATE(m.created_at) BETWEEN ? AND ?
            GROUP BY month_key
            ORDER BY month_key ASC
            """,
            (tenant_id, start.isoformat(), end.isoformat()),
        ).fetchall()

    def _statistics_top_products(
        self,
        connection: sqlite3.Connection,
        tenant_id: int,
        start: date,
        end: date,
    ) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT *
            FROM (
                SELECT
                    p.id,
                    p.sku,
                    p.name,
                    p.category,
                    p.unit,
                    ROUND(
                        COALESCE(SUM(CASE WHEN m.movement_type = 'sale' THEN ABS(m.quantity_delta) ELSE 0 END), 0),
                        2
                    ) AS sale_quantity,
                    ROUND(
                        COALESCE(SUM(CASE WHEN m.movement_type = 'purchase' THEN ABS(m.quantity_delta) ELSE 0 END), 0),
                        2
                    ) AS purchase_quantity,
                    ROUND(
                        COALESCE(SUM(CASE WHEN m.movement_type = 'adjustment' THEN m.quantity_delta ELSE 0 END), 0),
                        2
                    ) AS adjustment_quantity,
                    ROUND(
                        COALESCE(SUM(CASE WHEN m.movement_type = 'sale' THEN ABS(m.quantity_delta) * m.unit_price ELSE 0 END), 0),
                        2
                    ) AS sale_amount,
                    ROUND(
                        COALESCE(SUM(CASE WHEN m.movement_type = 'purchase' THEN ABS(m.quantity_delta) * m.unit_price ELSE 0 END), 0),
                        2
                    ) AS purchase_amount,
                    ROUND(
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN m.movement_type IN ('purchase', 'sale') THEN ABS(m.quantity_delta) * m.unit_price
                                    ELSE 0
                                END
                            ),
                            0
                        ),
                        2
                    ) AS activity_amount
                FROM products p
                LEFT JOIN stock_movements m
                    ON m.product_id = p.id
                    AND m.tenant_id = p.tenant_id
                    AND DATE(m.created_at) BETWEEN ? AND ?
                WHERE p.tenant_id = ?
                GROUP BY p.id
            ) ranked
            WHERE ranked.activity_amount > 0 OR ABS(ranked.adjustment_quantity) > 0
            ORDER BY ranked.activity_amount DESC, ABS(ranked.adjustment_quantity) DESC, ranked.sale_amount DESC, ranked.sale_quantity DESC, ranked.id DESC
            LIMIT 6
            """,
            (start.isoformat(), end.isoformat(), tenant_id),
        ).fetchall()

    def _merge_monthly_statistics(
        self,
        document_rows: list[sqlite3.Row],
        movement_rows: list[sqlite3.Row],
        start: date,
        end: date,
    ) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {
            month_start.strftime("%Y-%m"): {
                "month": month_start.strftime("%Y-%m"),
                "purchase_amount": 0.0,
                "sale_amount": 0.0,
                "purchase_docs": 0,
                "sale_docs": 0,
                "adjustment_docs": 0,
                "purchase_quantity": 0.0,
                "sale_quantity": 0.0,
                "adjustment_quantity": 0.0,
            }
            for month_start in self._month_starts(start, end)
        }

        for row in document_rows:
            item = merged[row["month_key"]]
            item["purchase_amount"] = round(float(row["purchase_amount"] or 0), 2)
            item["sale_amount"] = round(float(row["sale_amount"] or 0), 2)
            item["purchase_docs"] = int(row["purchase_docs"] or 0)
            item["sale_docs"] = int(row["sale_docs"] or 0)
            item["adjustment_docs"] = int(row["adjustment_docs"] or 0)

        for row in movement_rows:
            item = merged[row["month_key"]]
            item["purchase_quantity"] = round(float(row["purchase_quantity"] or 0), 2)
            item["sale_quantity"] = round(float(row["sale_quantity"] or 0), 2)
            item["adjustment_quantity"] = round(
                float(row["adjustment_quantity"] or 0), 2
            )

        return [
            {
                **item,
                "document_count": item["purchase_docs"]
                + item["sale_docs"]
                + item["adjustment_docs"],
                "net_amount": round(item["sale_amount"] - item["purchase_amount"], 2),
            }
            for item in merged.values()
        ]

    def _serialize_top_product(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "sku": row["sku"],
            "name": row["name"],
            "category": row["category"],
            "unit": row["unit"],
            "sale_quantity": round(float(row["sale_quantity"] or 0), 2),
            "purchase_quantity": round(float(row["purchase_quantity"] or 0), 2),
            "adjustment_quantity": round(float(row["adjustment_quantity"] or 0), 2),
            "sale_amount": round(float(row["sale_amount"] or 0), 2),
            "purchase_amount": round(float(row["purchase_amount"] or 0), 2),
            "activity_amount": round(float(row["activity_amount"] or 0), 2),
        }

    def _month_starts(self, start: date, end: date) -> list[date]:
        current = date(start.year, start.month, 1)
        last = date(end.year, end.month, 1)
        result: list[date] = []
        while current <= last:
            result.append(current)
            current = self._shift_month_start(current, 1)
        return result

    def _shift_month_start(self, value: date, delta_months: int) -> date:
        absolute_month = value.year * 12 + (value.month - 1) + delta_months
        year = absolute_month // 12
        month = absolute_month % 12 + 1
        return date(year, month, 1)
