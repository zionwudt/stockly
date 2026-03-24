from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .auth import AuthServiceMixin
from .document_support import DocumentSupportMixin
from .documents import DocumentServiceMixin
from .inventory import InventoryQueryServiceMixin
from .tenant_queries import TenantQueryMixin
from .tenants import TenantServiceMixin
from .validators import ValidationMixin


@dataclass(slots=True)
class InventoryService(
    ValidationMixin,
    TenantQueryMixin,
    DocumentSupportMixin,
    AuthServiceMixin,
    TenantServiceMixin,
    InventoryQueryServiceMixin,
    DocumentServiceMixin,
):
    db_path: Path
