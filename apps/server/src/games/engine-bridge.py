#!/usr/bin/env python3
"""Single-request bridge for the standalone Doorbell game engines.

This is an internal JSON boundary.  It deliberately receives the complete
authoritative snapshot on every request and never keeps a game in process
memory.  It is not a worker/model/browser protocol.
"""

from __future__ import annotations

import importlib
import json
from pathlib import Path
import sys
from typing import Any


ENGINE_MODULES: dict[str, tuple[str, str]] = {
    "leaf-game": ("games/leaf-game/src", "doorbell_leaf_game.engine"),
    "doudizhu": ("games/doudizhu/src", "doorbell_doudizhu.engine"),
    "flying-chess": ("games/flying-chess/src", "doorbell_flying_chess.engine"),
    "uno": ("games/uno/src", "doorbell_uno.engine"),
    "monopoly": ("games/monopoly/src", "doorbell_monopoly.engine"),
    "mahjong": ("games/mahjong/src", "doorbell_mahjong.engine"),
}


def _engine(repository_root: Path, kind: str) -> Any:
    try:
        relative_source, module_name = ENGINE_MODULES[kind]
    except KeyError as error:
        raise ValueError(f"unsupported game kind: {kind}") from error
    source = (repository_root / relative_source).resolve()
    if not source.is_dir():
        raise ValueError(f"game source directory does not exist: {source}")
    source_text = str(source)
    if source_text not in sys.path:
        sys.path.insert(0, source_text)
    return importlib.import_module(module_name)


def _players(raw_actors: Any) -> list[dict[str, str]]:
    if not isinstance(raw_actors, list):
        raise ValueError("actors must be an array")
    players: list[dict[str, str]] = []
    for actor in raw_actors:
        if not isinstance(actor, dict):
            raise ValueError("each actor must be an object")
        player_id = actor.get("playerId")
        controller_type = actor.get("controllerType")
        if not isinstance(player_id, str) or not player_id:
            raise ValueError("actor playerId must be a non-empty string")
        if controller_type not in {"human", "resident"}:
            raise ValueError("actor controllerType must be human or resident")
        players.append(
            {
                "id": player_id,
                "name": player_id,
                "controller_type": controller_type,
            }
        )
    return players


def _create(request: dict[str, Any], repository_root: Path) -> Any:
    kind = request.get("kind")
    room_id = request.get("roomId")
    if not isinstance(kind, str) or not isinstance(room_id, str) or not room_id:
        raise ValueError("create requires kind and roomId")
    engine = _engine(repository_root, kind)
    players = _players(request.get("actors"))
    if kind == "mahjong":
        return engine.create_game(room_id, players)
    seed = request.get("seed")
    if type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("create requires an unsigned 32-bit seed")
    return engine.create_game(players, seed=seed, game_id=room_id)


def _apply(request: dict[str, Any], repository_root: Path) -> Any:
    kind = request.get("kind")
    actor_id = request.get("actorId")
    snapshot = request.get("snapshot")
    raw_command = request.get("command")
    if not isinstance(kind, str) or not isinstance(actor_id, str) or not actor_id:
        raise ValueError("apply requires kind and actorId")
    if not isinstance(raw_command, dict):
        raise ValueError("apply command must be an object")
    command = dict(raw_command)
    # The service identity is authoritative.  A client-supplied actor_id is
    # never allowed to select another seat.
    command["actor_id"] = actor_id
    engine = _engine(repository_root, kind)
    if kind == "mahjong":
        return engine.apply_command(snapshot, command)
    now_ms = request.get("nowMs")
    if kind == "leaf-game" and now_ms is not None:
        if not isinstance(now_ms, int):
            raise ValueError("nowMs must be an integer")
        updated, _result = engine.apply_command(snapshot, command, now_ms=now_ms)
    else:
        updated, _result = engine.apply_command(snapshot, command)
    return updated


def _project(request: dict[str, Any], repository_root: Path) -> Any:
    kind = request.get("kind")
    viewer_id = request.get("viewerId")
    if not isinstance(kind, str) or not isinstance(viewer_id, str) or not viewer_id:
        raise ValueError("project requires kind and viewerId")
    engine = _engine(repository_root, kind)
    now_ms = request.get("nowMs")
    if kind == "leaf-game" and now_ms is not None:
        if not isinstance(now_ms, int):
            raise ValueError("nowMs must be an integer")
        return engine.project_view(request.get("snapshot"), viewer_id, now_ms=now_ms)
    return engine.project_view(request.get("snapshot"), viewer_id)


def dispatch(request: dict[str, Any], repository_root: Path) -> Any:
    operation = request.get("operation")
    if operation == "create":
        return _create(request, repository_root)
    if operation == "apply":
        return _apply(request, repository_root)
    if operation == "apply_update":
        from game_incremental import transition
        updated = _apply(request, repository_root)
        return transition(_engine(repository_root, request["kind"]), request["kind"],
                          request["snapshot"], updated, request["actorId"], request.get("nowMs"))
    if operation == "project":
        return _project(request, repository_root)
    raise ValueError(f"unsupported bridge operation: {operation}")


def main() -> None:
    repository_root = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) == 2 else None
    try:
        if repository_root is None:
            raise ValueError("repository root argument is required")
        request_text = sys.stdin.read()
        if not request_text.strip():
            raise ValueError("bridge request is empty")
        request = json.loads(request_text)
        if not isinstance(request, dict):
            raise ValueError("bridge request must be an object")
        result = dispatch(request, repository_root)
        # Force the bridge boundary to remain JSON-only.  A non-serializable
        # engine state is an adapter error, not something to stringify.
        output = {"ok": True, "result": result}
        encoded = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    except Exception as error:  # noqa: BLE001 - one JSON result is the boundary
        encoded = json.dumps(
            {
                "ok": False,
                "error": {"type": type(error).__name__, "message": str(error)},
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    sys.stdout.write(encoded + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
