from __future__ import annotations

import argparse
import json
import mimetypes
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from jiancang.db import init_db, seed_demo_data
from jiancang.security import SESSION_DAYS
from jiancang.services import InventoryService, ValidationError


ROOT_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT_DIR / "web"
DEFAULT_DB_PATH = ROOT_DIR / "data" / "jiancang.db"
SESSION_COOKIE_NAME = "jiancang_session"


class JianCangHandler(BaseHTTPRequestHandler):
    service: InventoryService
    static_dir: Path

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self._handle_api_get(path, parse_qs(parsed.query))
            return

        self._serve_static(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            payload = self._read_json_body()

            if path == "/api/auth/login":
                context, session_token = self.service.authenticate_user(payload)
                self._send_json(
                    self.service.get_auth_profile(context),
                    cookies=[self._session_cookie(session_token)],
                )
                return

            if path == "/api/auth/logout":
                self.service.logout_session(self._session_token())
                self._send_json({"message": "已退出登录"}, cookies=[self._clear_session_cookie()])
                return

            context = self._require_context()
            if context is None:
                return

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
                self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
                return
            self._send_json(result, status=HTTPStatus.CREATED)
        except ValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except json.JSONDecodeError:
            self._send_json({"error": "请求体不是合法 JSON。"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - 兜底错误
            self._send_json({"error": f"服务器内部错误: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def _handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        try:
            if path == "/api/auth/me":
                context = self._require_context()
                if context is None:
                    return
                self._send_json(self.service.get_auth_profile(context))
                return

            context = self._require_context()
            if context is None:
                return

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
                result = self.service.list_documents(context, doc_type=doc_type, limit=limit)
            else:
                self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)
                return
            self._send_json(result)
        except ValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - 兜底错误
            self._send_json({"error": f"服务器内部错误: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

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

    def _require_context(self):
        context = self.service.get_context_for_session(self._session_token())
        if context is None:
            self._send_json({"error": "请先登录。"}, status=HTTPStatus.UNAUTHORIZED)
            return None
        return context

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length else b"{}"
        return json.loads(raw_body.decode("utf-8"))

    def _serve_static(self, path: str) -> None:
        clean_path = unquote(path)
        if clean_path in {"", "/"}:
            file_path = self.static_dir / "index.html"
        else:
            relative = clean_path.lstrip("/")
            file_path = (self.static_dir / relative).resolve()
            if self.static_dir.resolve() not in file_path.parents and file_path != self.static_dir.resolve():
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


def run_server(host: str, port: int, db_path: Path) -> None:
    init_db(db_path)
    seed_demo_data(db_path)
    service = InventoryService(db_path=db_path)
    handler = build_handler(service, STATIC_DIR)
    server = ThreadingHTTPServer((host, port), handler)
    print(f"简仓 MVP 已启动: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
    finally:
        server.server_close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="简仓 MVP 服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH))
    return parser.parse_args()


def main() -> None:
    arguments = parse_args()
    run_server(arguments.host, arguments.port, Path(arguments.db))


if __name__ == "__main__":
    main()
