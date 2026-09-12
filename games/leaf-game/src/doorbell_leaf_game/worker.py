"""Long-running JSONL adapter for the standalone Leaf Game engine."""

from __future__ import annotations

import json
import sys
import time
from typing import Any, TextIO

from .engine import CommandError, apply_command, create_game, project_replay, project_view


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


class LeafGameWorker:
    def __init__(self) -> None:
        self.games: dict[str, dict[str, Any]] = {}

    def _settle_due_final_timeout(self, game_id: str, now_ms: int) -> dict[str, Any]:
        state = self.games[game_id]
        if state["phase"] != "final_challenge":
            return state
        deadline = state["final_challenge_deadline_ms"]
        if deadline is None or now_ms < int(deadline):
            return state
        state, _ = apply_command(
            state,
            {
                "command_id": f"worker-final-timeout:{game_id}:{deadline}",
                "expected_revision": state["revision"],
                "actor_id": "system",
                "action": "resolve_final_timeout",
            },
            now_ms=now_ms,
        )
        self.games[game_id] = state
        return state

    def handle(self, request: dict[str, Any]) -> dict[str, Any]:
        request_id = request.get("request_id")
        try:
            operation = request.get("operation")
            if operation == "create":
                state = create_game(
                    request.get("players", []),
                    seed=int(request.get("seed", 1)),
                    game_id=request.get("game_id"),
                )
                self.games[state["game_id"]] = state
                data = project_view(state, request.get("viewer_id"), now_ms=_now_ms())
            elif operation in {"get", "replay", "command"}:
                game_id = str(request.get("game_id", ""))
                if game_id not in self.games:
                    raise CommandError("game_not_found", "没有找到这局叶子戏。")
                now_ms = _now_ms()
                state = self._settle_due_final_timeout(game_id, now_ms)
                if operation == "get":
                    data = project_view(state, request.get("viewer_id"), now_ms=now_ms)
                elif operation == "replay":
                    data = project_replay(state)
                else:
                    state, result = apply_command(
                        state, request.get("command", {}), now_ms=now_ms
                    )
                    self.games[game_id] = state
                    data = {
                        "command": result,
                        "view": project_view(
                            state, request.get("viewer_id"), now_ms=now_ms
                        ),
                    }
            else:
                raise CommandError("unknown_operation", "不支持这个 worker 操作。")
            return {"ok": True, "request_id": request_id, "data": data}
        except CommandError as error:
            return {
                "ok": False,
                "request_id": request_id,
                "error": {"code": error.code, "message": error.message},
            }
        except (TypeError, ValueError) as error:
            return {
                "ok": False,
                "request_id": request_id,
                "error": {"code": "invalid_request", "message": str(error)},
            }


def run_jsonl(input_stream: TextIO, output_stream: TextIO) -> None:
    worker = LeafGameWorker()
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
        output_stream.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
        output_stream.flush()


def main() -> None:
    run_jsonl(sys.stdin, sys.stdout)


if __name__ == "__main__":
    main()
