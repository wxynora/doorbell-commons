"""Minimal Cedar plugin boundary; no room, wallet, MCP or model runtime."""
from dataclasses import dataclass
from typing import Any


@dataclass
class MoveResult:
    state: dict[str, Any]
    next_player_id: str | None = None
    note: str = ""
    result: dict[str, Any] | None = None
    public_event: dict[str, Any] | None = None


class GamePlugin:
    pass
