from __future__ import annotations

import argparse
from http.server import ThreadingHTTPServer
from pathlib import Path

from jiancang.http_handler import build_handler
from jiancang.db import init_db, seed_demo_data
from jiancang.services import InventoryService


ROOT_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT_DIR / "src" / "web"
DEFAULT_DB_PATH = ROOT_DIR / "data" / "jiancang.db"


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
