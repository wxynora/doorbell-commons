"""Long-running JSONL adapter for the standalone Mahjong engine."""

from __future__ import annotations

import json
import sys
from typing import Any, TextIO

from .engine import apply_command, create_game, project_view


class _WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class MahjongWorker:
    """Keep Mahjong games in memory behind the shared JSONL response shell."""

    def __init__(self) -> None:
        self.games: dict[str, dict[str, Any]] = {}

    def handle(self, request: dict[str, Any]) -> dict[str, Any]:
        request_id = request.get("request_id") if isinstance(request, dict) else None
        try:
            if not isinstance(request, dict):
                raise _WorkerError("invalid_request", "worker 请求必须是对象。")

            operation = request.get("operation")
            if operation == "create":
                state = create_game(
                    request.get("game_id"),
                    request.get("players", []),
                    seed=request.get("seed"),
                )
                game_id = state["game_id"]
                if game_id in self.games:
                    raise _WorkerError("game_already_exists", "这个麻将 game_id 已经存在。")
                self.games[game_id] = state
                data = project_view(state, request.get("viewer_id"))
            elif operation in {"get", "command"}:
                game_id = str(request.get("game_id", ""))
                if game_id not in self.games:
                    raise _WorkerError("game_not_found", "没有找到这局麻将。")
                state = self.games[game_id]
                if operation == "get":
                    data = project_view(state, request.get("viewer_id"))
                else:
                    state = apply_command(state, request.get("command"))
                    self.games[game_id] = state
                    data = {"view": project_view(state, request.get("viewer_id"))}
            else:
                raise _WorkerError("unknown_operation", "不支持这个麻将 worker 操作。")

            return {"ok": True, "request_id": request_id, "data": data}
        except _WorkerError as error:
            return {
                "ok": False,
                "request_id": request_id,
                "error": {"code": error.code, "message": error.message},
            }
        except (AttributeError, KeyError, TypeError, ValueError) as error:
            return {
                "ok": False,
                "request_id": request_id,
                "error": {"code": "invalid_request", "message": str(error)},
            }


def run_jsonl(input_stream: TextIO, output_stream: TextIO) -> None:
    worker = MahjongWorker()
    for line in input_stream:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("request must be a JSON object")
            response = worker.handle(request)
        except (json.JSONDecodeError, ValueError) as error:
            response = {
                "ok": False,
                "request_id": None,
                "error": {"code": "invalid_json", "message": str(error)},
            }
        output_stream.write(
            json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
        output_stream.flush()


def main() -> None:
    run_jsonl(sys.stdin, sys.stdout)


if __name__ == "__main__":
    main()
