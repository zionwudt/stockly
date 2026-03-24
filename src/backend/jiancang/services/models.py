from __future__ import annotations

from dataclasses import dataclass


class ValidationError(Exception):
    """输入校验失败。"""


@dataclass(slots=True)
class SessionPrincipal:
    user_id: int
    username: str
    display_name: str
    tenant_id: int | None = None
    tenant_name: str | None = None
    tenant_slug: str | None = None
    tenant_role: str | None = None


@dataclass(slots=True)
class RequestContext:
    tenant_id: int
    tenant_name: str
    tenant_slug: str
    tenant_role: str
    user_id: int
    username: str
    display_name: str
