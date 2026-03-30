from __future__ import annotations

import json
import mimetypes
import re
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .security import SESSION_DAYS
from .services import (
    InventoryService,
    RequestContext,
    SessionPrincipal,
    ValidationError,
)


SESSION_COOKIE_NAME = "jiancang_session"


class JianCangHandler(BaseHTTPRequestHandler):
    service: InventoryService
    static_dir: Path

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api_get(parsed.path, parse_qs(parsed.query))
            return
        self._serve_static(parsed.path)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            payload = self._read_json_body()
            if self._handle_auth_post(path, payload):
                return
            if self._handle_tenant_post(path, payload):
                return
            if self._handle_tenant_delete(path, payload):
                return

            context = self._require_context()
            if context is None:
                return
            if self._handle_workspace_delete(path, payload, context):
                return

            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
        except ValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except json.JSONDecodeError:
            self._send_json(
                {"error": "请求体不是合法 JSON。"}, status=HTTPStatus.BAD_REQUEST
            )
        except Exception as exc:
            self._send_json(
                {"error": f"服务器内部错误: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            payload = self._read_json_body()
            if self._handle_auth_put(path, payload):
                return
            if self._handle_tenant_put(path, payload):
                return
            
            context = self._require_context()
            if context is None:
                return
            if self._handle_workspace_put(path, payload, context):
                return

            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
        except ValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except json.JSONDecodeError:
            self._send_json(
                {"error": "请求体不是合法 JSON。"}, status=HTTPStatus.BAD_REQUEST
            )
        except Exception as exc:
            self._send_json(
                {"error": f"服务器内部错误: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            payload = self._read_json_body()
            if self._handle_auth_post(path, payload):
                return
            if self._handle_tenant_post(path, payload):
                return

            context = self._require_context()
            if context is None:
                return
            if self._handle_workspace_post(path, payload, context):
                return

            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
        except ValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except json.JSONDecodeError:
            self._send_json(
                {"error": "请求体不是合法 JSON。"}, status=HTTPStatus.BAD_REQUEST
            )
        except Exception as exc:  # pragma: no cover - 兜底错误
            self._send_json(
                {"error": f"服务器内部错误: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def _handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        try:
            if self._handle_identity_get(path):
                return

            context = self._require_context()
            if context is None:
                return
            if self._handle_workspace_get(path, query, context):
                return

            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
        except ValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - 兜底错误
            self._send_json(
                {"error": f"服务器内部错误: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _handle_auth_post(self, path: str, payload: dict) -> bool:
        if path == "/api/auth/register":
            principal, session_token = self.service.register_user(payload)
            self._send_json(
                self.service.get_auth_profile(principal),
                status=HTTPStatus.CREATED,
                cookies=[self._session_cookie(session_token)],
            )
            return True

        if path == "/api/auth/login":
            identity, session_token = self.service.authenticate_user(payload)
            self._send_json(
                self.service.get_auth_profile(identity),
                cookies=[self._session_cookie(session_token)],
            )
            return True

        if path == "/api/auth/logout":
            self.service.logout_session(self._session_token())
            self._send_json(
                {"message": "已退出登录"}, cookies=[self._clear_session_cookie()]
            )
            return True

        if path != "/api/auth/switch-tenant":
            return False

        principal = self._require_principal()
        if principal is None:
            return True
        updated_principal = self.service.switch_current_tenant(
            self._session_token(), principal, payload
        )
        self._send_json(self.service.get_auth_profile(updated_principal))
        return True

    def _handle_tenant_post(self, path: str, payload: dict) -> bool:
        if path == "/api/tenants":
            principal = self._require_principal()
            if principal is None:
                return True
            result = self.service.create_tenant(principal, payload)
            updated_principal = self.service.switch_current_tenant(
                self._session_token(),
                principal,
                {"tenant_id": result["tenant"]["id"]},
            )
            result["auth"] = self.service.get_auth_profile(updated_principal)
            self._send_json(result, status=HTTPStatus.CREATED)
            return True

        if path == "/api/tenant-join-requests":
            principal = self._require_principal()
            if principal is None:
                return True
            result = self.service.create_join_request(principal, payload)
            self._send_json(result, status=HTTPStatus.CREATED)
            return True

        decision_match = re.fullmatch(
            r"/api/tenant-join-requests/(\d+)/(approve|reject)", path
        )
        if decision_match:
            principal = self._require_principal()
            if principal is None:
                return True
            request_id = int(decision_match.group(1))
            approved = decision_match.group(2) == "approve"
            result = self.service.review_join_request(principal, request_id, approved)
            self._send_json(result)
            return True
        
        return False

    def _handle_auth_put(self, path: str, payload: dict) -> bool:
        if path != "/api/auth/profile":
            return False
        principal = self._require_principal()
        if principal is None:
            return True
        updated_principal = self.service.update_profile(principal, payload)
        self._send_json(self.service.get_auth_profile(updated_principal))
        return True

    def _handle_tenant_put(self, path: str, payload: dict) -> bool:
        update_name_match = re.fullmatch(r"/api/tenants/(\d+)/name", path)
        if update_name_match:
            principal = self._require_principal()
            if principal is None:
                return True
            tenant_id = int(update_name_match.group(1))
            result = self.service.update_tenant_name(principal, tenant_id, payload)
            self._send_json(result)
            return True
        
        update_role_match = re.fullmatch(r"/api/tenants/(\d+)/members/(\d+)/role", path)
        if update_role_match:
            principal = self._require_principal()
            if principal is None:
                return True
            tenant_id = int(update_role_match.group(1))
            user_id = int(update_role_match.group(2))
            result = self.service.update_member_role(principal, tenant_id, user_id, payload)
            self._send_json(result)
            return True
        
        return False

    def _handle_tenant_delete(self, path: str, payload: dict) -> bool:
        remove_member_match = re.fullmatch(r"/api/tenants/(\d+)/members/(\d+)", path)
        if remove_member_match:
            principal = self._require_principal()
            if principal is None:
                return True
            tenant_id = int(remove_member_match.group(1))
            user_id = int(remove_member_match.group(2))
            result = self.service.remove_member(principal, tenant_id, user_id)
            self._send_json(result)
            return True
        
        return False

    def _handle_workspace_post(
        self, path: str, payload: dict, context: RequestContext
    ) -> bool:
        if path == "/api/products":
            result = self.service.create_product(context, payload)
        elif path == "/api/suppliers":
            result = self.service.create_partner(context, "supplier", payload)
        elif path == "/api/customers":
            result = self.service.create_partner(context, "customer", payload)
        elif path == "/api/purchases":
            result = self.service.create_purchase(context, payload)
        elif path == "/api/sales":
            result = self.service.create_sale(context, payload)
        elif path == "/api/adjustments":
            result = self.service.create_adjustment(context, payload)
        else:
            void_match = re.fullmatch(r"/api/documents/(\d+)/void", path)
            if void_match:
                document_id = int(void_match.group(1))
                reason = payload.get("reason")
                result = self.service.void_document(context, document_id, reason)
                self._send_json(result)
                return True
            return False

        self._send_json(result, status=HTTPStatus.CREATED)
        return True

    def _handle_workspace_delete(
        self, path: str, payload: dict, context: RequestContext
    ) -> bool:
        product_match = re.fullmatch(r"/api/products/(\d+)", path)
        if product_match:
            product_id = int(product_match.group(1))
            result = self.service.delete_product(context, product_id)
            self._send_json(result)
            return True

        supplier_match = re.fullmatch(r"/api/suppliers/(\d+)", path)
        if supplier_match:
            partner_id = int(supplier_match.group(1))
            result = self.service.delete_partner(context, partner_id)
            self._send_json(result)
            return True

        customer_match = re.fullmatch(r"/api/customers/(\d+)", path)
        if customer_match:
            partner_id = int(customer_match.group(1))
            result = self.service.delete_partner(context, partner_id)
            self._send_json(result)
            return True

        return False

    def _handle_workspace_put(
        self, path: str, payload: dict, context: RequestContext
    ) -> bool:
        product_match = re.fullmatch(r"/api/products/(\d+)", path)
        if product_match:
            product_id = int(product_match.group(1))
            result = self.service.update_product(context, product_id, payload)
            self._send_json(result)
            return True

        return False

    def _handle_identity_get(self, path: str) -> bool:
        if path == "/api/auth/me":
            principal = self._require_principal()
            if principal is None:
                return True
            self._send_json(self.service.get_auth_profile(principal))
            return True

        if path == "/api/tenant-hub":
            principal = self._require_principal()
            if principal is None:
                return True
            self._send_json(self.service.get_tenant_hub(principal))
            return True
        
        tenant_detail_match = re.fullmatch(r"/api/tenants/(\d+)", path)
        if tenant_detail_match:
            principal = self._require_principal()
            if principal is None:
                return True
            tenant_id = int(tenant_detail_match.group(1))
            self._send_json(self.service.get_tenant_detail(principal, tenant_id))
            return True

        return False

    def _handle_workspace_get(
        self,
        path: str,
        query: dict[str, list[str]],
        context: RequestContext,
    ) -> bool:
        if path == "/api/summary":
            result = self.service.get_summary(context)
        elif path == "/api/products":
            result = self.service.list_products(context)
        elif path == "/api/suppliers":
            result = self.service.list_partners(context, "supplier")
        elif path == "/api/customers":
            result = self.service.list_partners(context, "customer")
        elif path == "/api/stock":
            result = self.service.get_stock_overview(context)
        elif path == "/api/movements":
            limit = int(query.get("limit", ["30"])[0])
            result = self.service.list_movements(context, limit)
        elif path == "/api/documents":
            limit = int(query.get("limit", ["50"])[0])
            doc_type = query.get("type", [""])[0] or None
            result = self.service.list_documents(
                context, doc_type=doc_type, limit=limit
            )
        elif path == "/api/statistics":
            result = self.service.get_statistics(
                context,
                start_date=query.get("start_date", [""])[0] or None,
                end_date=query.get("end_date", [""])[0] or None,
            )
        else:
            return False

        self._send_json(result)
        return True

    def _session_token(self) -> str | None:
        raw_cookie = self.headers.get("Cookie")
        if not raw_cookie:
            return None
        cookie = SimpleCookie()
        cookie.load(raw_cookie)
        morsel = cookie.get(SESSION_COOKIE_NAME)
        if morsel is None:
            return None
        return morsel.value

    def _require_principal(self) -> SessionPrincipal | None:
        principal = self.service.get_principal_for_session(self._session_token())
        if principal is None:
            self._send_json({"error": "请先登录。"}, status=HTTPStatus.UNAUTHORIZED)
            return None
        return principal

    def _require_context(self) -> RequestContext | None:
        principal = self._require_principal()
        if principal is None:
            return None
        try:
            return self.service.require_request_context(principal)
        except ValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.CONFLICT)
            return None

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length else b"{}"
        return json.loads(raw_body.decode("utf-8"))

    def _serve_static(self, path: str) -> None:
        clean_path = unquote(path)
        if clean_path in {"", "/", "/auth", "/auth/"}:
            file_path = self.static_dir / "index.html"
        elif clean_path in {"/tenant", "/tenant/", "/tenant.html"}:
            self._redirect("/app")
            return
        elif clean_path in {"/app", "/app/"}:
            file_path = self.static_dir / "app.html"
        else:
            relative = clean_path.lstrip("/")
            file_path = (self.static_dir / relative).resolve()
            if (
                self.static_dir.resolve() not in file_path.parents
                and file_path != self.static_dir.resolve()
            ):
                self.send_error(HTTPStatus.FORBIDDEN)
                return

        if not file_path.exists() or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        mime_type, _ = mimetypes.guess_type(str(file_path))
        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _redirect(self, location: str, status: HTTPStatus = HTTPStatus.FOUND) -> None:
        self.send_response(status)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _send_json(
        self,
        data,
        status: HTTPStatus = HTTPStatus.OK,
        cookies: list[str] | None = None,
    ) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    @staticmethod
    def _session_cookie(session_token: str) -> str:
        cookie = SimpleCookie()
        cookie[SESSION_COOKIE_NAME] = session_token
        cookie[SESSION_COOKIE_NAME]["path"] = "/"
        cookie[SESSION_COOKIE_NAME]["httponly"] = True
        cookie[SESSION_COOKIE_NAME]["samesite"] = "Lax"
        cookie[SESSION_COOKIE_NAME]["max-age"] = str(SESSION_DAYS * 24 * 60 * 60)
        return cookie.output(header="").strip()

    @staticmethod
    def _clear_session_cookie() -> str:
        cookie = SimpleCookie()
        cookie[SESSION_COOKIE_NAME] = ""
        cookie[SESSION_COOKIE_NAME]["path"] = "/"
        cookie[SESSION_COOKIE_NAME]["httponly"] = True
        cookie[SESSION_COOKIE_NAME]["samesite"] = "Lax"
        cookie[SESSION_COOKIE_NAME]["max-age"] = "0"
        return cookie.output(header="").strip()


def build_handler(service: InventoryService, static_dir: Path):
    class Handler(JianCangHandler):
        pass

    Handler.service = service
    Handler.static_dir = static_dir
    return Handler
