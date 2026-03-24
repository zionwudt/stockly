from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta


PASSWORD_ITERATIONS = 200_000
SESSION_DAYS = 7


def db_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


def db_days_from_now(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")


def generate_salt() -> str:
    return secrets.token_hex(16)


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    return secrets.compare_digest(hash_password(password, salt), password_hash)


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
