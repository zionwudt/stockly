"""
Seed 12 months of realistic demo history for tenant 1.
Run: python scripts/seed_demo_history.py
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src" / "backend"))

from jiancang.db.connection import get_connection

DB_PATH = Path(__file__).parent.parent / "data" / "jiancang.db"
TENANT_ID = 1
TODAY = date(2026, 3, 30)
random.seed(42)


def rand_date_in_month(y: int, m: int) -> date:
    """Return a random business date within the given year/month."""
    first = date(y, m, 1)
    # last day of month
    if m == 12:
        last = date(y + 1, 1, 1) - timedelta(days=1)
    else:
        last = date(y, m + 1, 1) - timedelta(days=1)
    days = (last - first).days
    while True:
        d = first + timedelta(days=random.randint(0, days))
        if d.weekday() < 6:  # Mon-Sat
            return d


def fmt(d: date) -> str:
    return f"{d.isoformat()} {random.randint(8,17):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}"


def next_doc_no(conn, prefix: str) -> str:
    row = conn.execute(
        "SELECT COUNT(*) FROM documents WHERE tenant_id=? AND doc_no LIKE ?",
        (TENANT_ID, f"{prefix}%"),
    ).fetchone()
    n = row[0] + 1
    return f"{prefix}{n:04d}"


def insert_doc_with_items(conn, doc_type: str, partner_id: int, items: list[tuple], ts: str):
    """items: list of (product_id, qty, unit_price)"""
    prefix = "PO-01-" if doc_type == "purchase" else "SO-01-"
    doc_no = next_doc_no(conn, prefix)
    total = sum(qty * price for _, qty, price in items)
    conn.execute(
        """INSERT INTO documents (tenant_id, doc_no, doc_type, partner_id, total_amount, status, transaction_time, created_at)
           VALUES (?,?,?,?,?,'active',?,?)""",
        (TENANT_ID, doc_no, doc_type, partner_id, round(total, 2), ts, ts),
    )
    doc_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    movement_type = doc_type  # 'purchase' | 'sale'
    for product_id, qty, price in items:
        line = round(qty * price, 2)
        conn.execute(
            """INSERT INTO document_items (tenant_id, document_id, product_id, quantity, unit_price, line_amount)
               VALUES (?,?,?,?,?,?)""",
            (TENANT_ID, doc_id, product_id, qty, price, line),
        )
        delta = qty if doc_type == "purchase" else -qty
        conn.execute(
            """INSERT INTO stock_movements (tenant_id, product_id, document_id, movement_type, quantity_delta, unit_price, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (TENANT_ID, product_id, doc_id, movement_type, delta, price, ts),
        )


def main():
    with get_connection(DB_PATH) as conn:
        # ── Ensure extra products exist ────────────────────────────────────
        existing_skus = {r["sku"] for r in conn.execute(
            "SELECT sku FROM products WHERE tenant_id=? AND is_deleted=0", (TENANT_ID,)
        ).fetchall()}

        extra_products = [
            ("JC-CABLE-002", "Type-C 数据线", "数码", "条",  8.8,  18.0, 25),
            ("JC-MOUSE-003", "无线鼠标",       "数码", "个", 25.0,  59.0, 15),
            ("JC-PAD-004",   "鼠标垫 XL",      "数码", "片",  6.5,  15.0, 20),
            ("JC-TEA-005",   "大红袍茶叶",     "食品", "罐", 35.0,  88.0, 10),
        ]
        for sku, name, cat, unit, pp, sp, ss in extra_products:
            if sku not in existing_skus:
                conn.execute(
                    """INSERT OR IGNORE INTO products (tenant_id,sku,name,category,unit,purchase_price,sale_price,safety_stock)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (TENANT_ID, sku, name, cat, unit, pp, sp, ss),
                )
                print(f"  Added product: {name}")

        # ── Ensure extra partners exist ────────────────────────────────────
        existing_partners = {r["name"]: r["id"] for r in conn.execute(
            "SELECT id, name FROM partners WHERE tenant_id=? AND is_deleted=0", (TENANT_ID,)
        ).fetchall()}

        extra_partners = [
            ("德隆贸易",   "supplier", "张磊",  "13900000011", "稳定供货"),
            ("优品电商",   "supplier", "王芳",  "13900000012", "线上渠道"),
            ("北方批发",   "customer", "李强",  "13900000013", "批发客户"),
            ("惠民超市",   "customer", "赵敏",  "13900000014", "连锁超市"),
            ("好邻居便利", "customer", "陈亮",  "13900000015", "便利连锁"),
        ]
        for name, ptype, contact, phone, note in extra_partners:
            if name not in existing_partners:
                conn.execute(
                    """INSERT INTO partners (tenant_id,name,partner_type,contact,phone,note)
                       VALUES (?,?,?,?,?,?)""",
                    (TENANT_ID, name, ptype, contact, phone, note),
                )
                print(f"  Added partner: {name}")

        conn.commit()

        # Reload after inserts
        products = conn.execute(
            "SELECT id,sku,purchase_price,sale_price FROM products WHERE tenant_id=? AND is_deleted=0",
            (TENANT_ID,),
        ).fetchall()
        suppliers = [r for r in conn.execute(
            "SELECT id FROM partners WHERE tenant_id=? AND partner_type='supplier' AND is_deleted=0",
            (TENANT_ID,),
        ).fetchall()]
        customers = [r for r in conn.execute(
            "SELECT id FROM partners WHERE tenant_id=? AND partner_type='customer' AND is_deleted=0",
            (TENANT_ID,),
        ).fetchall()]

        prod_ids   = [p["id"]             for p in products]
        buy_prices = {p["id"]: p["purchase_price"] for p in products}
        sell_prices = {p["id"]: p["sale_price"]    for p in products}
        sup_ids    = [r["id"] for r in suppliers]
        cust_ids   = [r["id"] for r in customers]

        # ── Check if we already seeded history ────────────────────────────
        already = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE tenant_id=? AND created_at < '2026-03-01'",
            (TENANT_ID,),
        ).fetchone()[0]
        if already > 0:
            print(f"History already seeded ({already} docs before 2026-03). Skipping.")
            return

        # ── Generate 12 months of data (2025-04 → 2026-03) ───────────────
        # Monthly pattern: purchase 2-4 times, sale 4-10 times per month
        months = []
        y, m = 2025, 4
        while (y, m) <= (2026, 3):
            months.append((y, m))
            m += 1
            if m > 12:
                m = 1; y += 1

        print(f"Seeding {len(months)} months of history...")

        # Seasonal sale multiplier (higher in Q4 / spring festival)
        def sale_mult(y, m):
            if m in (1, 2):   return 1.6   # 春节
            if m in (11, 12): return 1.4   # 年末
            if m in (6, 7):   return 0.85  # 淡季
            return 1.0

        # Maintain running stock to avoid negatives
        stock = {pid: 200 for pid in prod_ids}  # start with ample stock

        for y, m in months:
            mult = sale_mult(y, m)

            # ── Purchases: 2-3 per month ──────────────────────────────────
            n_purchases = random.randint(2, 3)
            for _ in range(n_purchases):
                ts = fmt(rand_date_in_month(y, m))
                sup_id = random.choice(sup_ids)
                # Pick 2-4 products to purchase
                chosen = random.sample(prod_ids, k=min(random.randint(2, 4), len(prod_ids)))
                items = []
                for pid in chosen:
                    qty = random.randint(20, 80)
                    price = round(buy_prices[pid] * random.uniform(0.95, 1.05), 2)
                    items.append((pid, qty, price))
                    stock[pid] += qty
                insert_doc_with_items(conn, "purchase", sup_id, items, ts)

            # ── Sales: 4-8 per month ──────────────────────────────────────
            n_sales = int(random.randint(4, 8) * mult)
            for _ in range(n_sales):
                ts = fmt(rand_date_in_month(y, m))
                cust_id = random.choice(cust_ids)
                chosen = random.sample(prod_ids, k=min(random.randint(1, 3), len(prod_ids)))
                items = []
                for pid in chosen:
                    max_qty = max(1, int(stock[pid] * 0.3))
                    qty = random.randint(1, min(max_qty, 20))
                    if stock[pid] < qty:
                        continue
                    price = round(sell_prices[pid] * random.uniform(0.9, 1.1), 2)
                    items.append((pid, qty, price))
                    stock[pid] -= qty
                if items:
                    insert_doc_with_items(conn, "sale", cust_id, items, ts)

        conn.commit()

        # Summary
        total_docs = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE tenant_id=?", (TENANT_ID,)
        ).fetchone()[0]
        total_mvmt = conn.execute(
            "SELECT COUNT(*) FROM stock_movements WHERE tenant_id=?", (TENANT_ID,)
        ).fetchone()[0]
        print(f"Done! Total documents: {total_docs}, movements: {total_mvmt}")


if __name__ == "__main__":
    main()

