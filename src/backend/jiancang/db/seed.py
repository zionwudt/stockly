from __future__ import annotations

from pathlib import Path

from .connection import get_connection
from .migrations import _get_default_tenant_id


def seed_demo_data(db_path: Path) -> None:
    with get_connection(db_path) as connection:
        tenant_id = _get_default_tenant_id(connection)
        product_count = connection.execute(
            "SELECT COUNT(*) FROM products WHERE tenant_id = ?",
            (tenant_id,),
        ).fetchone()[0]
        if product_count:
            return

        products = [
            (tenant_id, "JC-COFFEE-001", "挂耳咖啡", "饮品", "盒", 19.5, 39.0, 20),
            (tenant_id, "JC-NB-013", "A5 点阵笔记本", "文具", "本", 6.2, 12.8, 30),
            (tenant_id, "JC-CABLE-002", "Type-C 数据线", "数码", "条", 8.8, 18.0, 25),
        ]
        partners = [
            (tenant_id, "晨光供应", "supplier", "李敏", "13800000001", "常规补货供应商"),
            (tenant_id, "城南门店", "customer", "王青", "13800000002", "线下分销门店"),
        ]

        connection.executemany(
            """
            INSERT INTO products (tenant_id, sku, name, category, unit, purchase_price, sale_price, safety_stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            products,
        )
        connection.executemany(
            """
            INSERT INTO partners (tenant_id, name, partner_type, contact, phone, note)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            partners,
        )

        supplier_id = connection.execute(
            """
            SELECT id
            FROM partners
            WHERE tenant_id = ? AND partner_type = 'supplier'
            ORDER BY id
            LIMIT 1
            """,
            (tenant_id,),
        ).fetchone()[0]
        product_rows = connection.execute(
            "SELECT id, purchase_price FROM products WHERE tenant_id = ? ORDER BY id",
            (tenant_id,),
        ).fetchall()

        connection.execute(
            """
            INSERT INTO documents (tenant_id, doc_no, doc_type, partner_id, note, total_amount)
            VALUES (?, 'PO-01-0001', 'purchase', ?, '系统初始化演示单据', ?)
            """,
            (tenant_id, supplier_id, sum(row["purchase_price"] * 50 for row in product_rows)),
        )
        document_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]

        for row in product_rows:
            quantity = 50
            price = row["purchase_price"]
            amount = quantity * price
            connection.execute(
                """
                INSERT INTO document_items (tenant_id, document_id, product_id, quantity, unit_price, line_amount)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (tenant_id, document_id, row["id"], quantity, price, amount),
            )
            connection.execute(
                """
                INSERT INTO stock_movements (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, note)
                VALUES (?, ?, ?, 'purchase', ?, ?, '初始化库存')
                """,
                (tenant_id, row["id"], document_id, quantity, price),
            )

        connection.commit()
