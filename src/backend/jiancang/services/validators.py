from __future__ import annotations

import re
from typing import Any

from .models import ValidationError


USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{2,31}$")
TENANT_SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,31}$")


class ValidationMixin:
    @staticmethod
    def _validate_partner_type(partner_type: str) -> None:
        if partner_type not in {"supplier", "customer"}:
            raise ValidationError("仅支持 supplier 或 customer 类型。")

    @staticmethod
    def _text(payload: dict[str, Any], key: str) -> str:
        value = payload.get(key, "")
        return str(value).strip()

    def _required_text(self, payload: dict[str, Any], key: str) -> str:
        value = self._text(payload, key)
        if not value:
            raise ValidationError(f"{key} 不能为空。")
        return value

    @staticmethod
    def _number(payload: dict[str, Any], key: str) -> float:
        try:
            return round(float(payload.get(key, 0)), 2)
        except (TypeError, ValueError) as exc:
            raise ValidationError(f"{key} 不是有效数字。") from exc

    def _positive_number(self, payload: dict[str, Any], key: str) -> float:
        value = self._number(payload, key)
        if value <= 0:
            raise ValidationError(f"{key} 必须大于 0。")
        return value

    def _non_negative_number(self, payload: dict[str, Any], key: str) -> float:
        value = self._number(payload, key)
        if value < 0:
            raise ValidationError(f"{key} 不能为负数。")
        return value

    @staticmethod
    def _normalized_username(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _normalized_tenant_slug(value: str) -> str:
        return value.strip().lower()

    def _validate_username(self, username: str) -> None:
        if not USERNAME_PATTERN.fullmatch(username):
            raise ValidationError("账号只支持 3-32 位小写字母、数字、下划线和中划线。")

    def _validate_password(self, password: str) -> None:
        if len(password) < 8:
            raise ValidationError("密码长度不能少于 8 位。")

    def _validate_tenant_slug(self, slug: str) -> None:
        if not TENANT_SLUG_PATTERN.fullmatch(slug):
            raise ValidationError("租户标识只支持 2-32 位小写字母、数字和中划线。")
