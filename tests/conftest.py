from __future__ import annotations

import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from jiancang.db import (  # noqa: E402
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_USERNAME,
    DEFAULT_TENANT_SLUG,
    init_db,
    seed_demo_data,
)
from jiancang.services import InventoryService  # noqa: E402


@pytest.fixture
def service(tmp_path: Path) -> InventoryService:
    db_path = tmp_path / "jiancang-test.db"
    init_db(db_path)
    seed_demo_data(db_path)
    return InventoryService(db_path=db_path)


@pytest.fixture
def context(service: InventoryService):
    request_context, _ = service.authenticate_user(
        {
            "tenant_slug": DEFAULT_TENANT_SLUG,
            "username": DEFAULT_ADMIN_USERNAME,
            "password": DEFAULT_ADMIN_PASSWORD,
        }
    )
    return request_context
