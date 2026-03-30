USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    last_tenant_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    avatar_data TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(last_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
)
"""

TENANTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    owner_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
)
"""

TENANT_MEMBERSHIPS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)
"""

TENANT_JOIN_REQUESTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tenant_join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    decided_by_user_id INTEGER,
    decided_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
"""

SESSIONS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tenant_id INTEGER,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
)
"""

SCHEMA_STATEMENTS = [
    USERS_TABLE_SQL,
    TENANTS_TABLE_SQL,
    TENANT_MEMBERSHIPS_TABLE_SQL,
    TENANT_JOIN_REQUESTS_TABLE_SQL,
    SESSIONS_TABLE_SQL,
    """
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT '件',
        purchase_price REAL NOT NULL DEFAULT 0,
        sale_price REAL NOT NULL DEFAULT 0,
        safety_stock REAL NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        partner_type TEXT NOT NULL CHECK(partner_type IN ('supplier', 'customer')),
        contact TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        doc_no TEXT NOT NULL,
        doc_type TEXT NOT NULL CHECK(doc_type IN ('purchase', 'sale', 'adjustment')),
        partner_id INTEGER,
        created_by INTEGER,
        note TEXT NOT NULL DEFAULT '',
        total_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        voided_at TEXT,
        void_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
        FOREIGN KEY(partner_id) REFERENCES partners(id),
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS document_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        document_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        line_amount REAL NOT NULL DEFAULT 0,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        product_id INTEGER NOT NULL,
        document_id INTEGER,
        movement_type TEXT NOT NULL,
        quantity_delta REAL NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
        FOREIGN KEY(product_id) REFERENCES products(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS document_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        document_id INTEGER NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('void', 'restore')),
        user_id INTEGER,
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON tenant_memberships(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_tenant_join_requests_tenant_status ON tenant_join_requests(tenant_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_tenant_join_requests_user ON tenant_join_requests(user_id)",
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_join_requests_pending
    ON tenant_join_requests(tenant_id, user_id)
    WHERE status = 'pending'
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku ON products(tenant_id, sku)",
    "CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_partners_tenant_type ON partners(tenant_id, partner_type)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_tenant_doc_no ON documents(tenant_id, doc_no)",
    "CREATE INDEX IF NOT EXISTS idx_documents_tenant_type ON documents(tenant_id, doc_type)",
    "CREATE INDEX IF NOT EXISTS idx_documents_tenant_status ON documents(tenant_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_products_tenant_deleted ON products(tenant_id, is_deleted)",
    "CREATE INDEX IF NOT EXISTS idx_partners_tenant_deleted_type ON partners(tenant_id, is_deleted, partner_type)",
    "CREATE INDEX IF NOT EXISTS idx_document_items_tenant_document ON document_items(tenant_id, document_id)",
    "CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_product ON stock_movements(tenant_id, product_id)",
    "CREATE INDEX IF NOT EXISTS idx_document_audit_logs_tenant_doc ON document_audit_logs(tenant_id, document_id)",
]

INDEX_STATEMENTS = [
    statement
    for statement in SCHEMA_STATEMENTS
    if statement.lstrip().startswith("CREATE INDEX")
    or statement.lstrip().startswith("CREATE UNIQUE INDEX")
]

TABLE_STATEMENTS = [
    statement for statement in SCHEMA_STATEMENTS if statement not in INDEX_STATEMENTS
]
