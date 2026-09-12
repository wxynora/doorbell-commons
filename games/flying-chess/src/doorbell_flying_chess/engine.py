"""Doorbell Commons standalone traditional Flying Chess rules engine."""

from __future__ import annotations

from copy import deepcopy
import json
import time
from typing import Any
from uuid import uuid4


RULES_VERSION = "doorbell.flying-chess.traditional.v3"
MIN_PLAYER_COUNT = 2
MAX_PLAYER_COUNT = 4
PIECES_PER_PLAYER = 4
OUTER_LENGTH = 52
MAIN_STEPS = 50
HOME_STEPS = 6
GOAL_PROGRESS = MAIN_STEPS + HOME_STEPS + 1
FLIGHT_SOURCE_PROGRESS = 18
FLIGHT_DEST_PROGRESS = 30
HOME_CROSS_PROGRESS = 54
OWN_COLOR_PROGRESS = tuple(range(2, MAIN_STEPS + 1, 4))
START_INDICES = (0, 13, 26, 39)
ACCENTS = ("coral", "gold", "sky", "mint")
DEFAULT_RULES = {
    "takeoff_roll": 6,
    "extra_roll_on_six": True,
    "triple_six_penalty": "return_one_active_piece",
    "color_jump": True,
    "flight_shortcut": True,
    "capture": True,
    "home_bounce": True,
    "move_stacks_together": False,
    "colored_cells_safe": False,
}


class CommandError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _hash_seed(seed: object) -> int:
    value = str("flying-chess" if seed is None else seed)
    result = 2166136261
    for char in value:
        result ^= ord(char)
        result = (result * 16777619) & 0xFFFFFFFF
    return result


def _create_rng_state(seed: object) -> list[int]:
    value = _hash_seed(seed)
    result: list[int] = []
    for _ in range(4):
        value ^= (value << 13) & 0xFFFFFFFF
        value &= 0xFFFFFFFF
        value ^= value >> 17
        value ^= (value << 5) & 0xFFFFFFFF
        value &= 0xFFFFFFFF
        result.append(value)
    if not any(result):
        result[0] = 0x9E3779B9
    return result


def _rng_next(state: dict[str, Any]) -> int:
    x, y, z, w = (int(value) & 0xFFFFFFFF for value in state["rng_state"])
    temp = (x ^ ((x << 11) & 0xFFFFFFFF)) & 0xFFFFFFFF
    new_w = (w ^ (w >> 19) ^ temp ^ (temp >> 8)) & 0xFFFFFFFF
    state["rng_state"] = [y, z, w, new_w]
    return new_w


def _roll_die(state: dict[str, Any]) -> int:
    return (_rng_next(state) % 6) + 1


def _normalise_rules(rules: dict[str, Any] | None) -> dict[str, Any]:
    if rules is None:
        return deepcopy(DEFAULT_RULES)
    if not isinstance(rules, dict):
        raise CommandError("invalid_rules", "飞行棋规则必须是对象。")
    unknown = set(rules) - set(DEFAULT_RULES)
    if unknown:
        raise CommandError("unsupported_rules", f"不支持的飞行棋规则：{sorted(unknown)}。")
    merged = {**DEFAULT_RULES, **rules}
    if merged != DEFAULT_RULES:
        raise CommandError("unsupported_rules", "当前只支持已确认的传统飞行棋规则版本。")
    return deepcopy(merged)


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    player = next((item for item in state["players"] if item["id"] == player_id), None)
    if player is None:
        raise CommandError("player_not_found", "没有这名飞行棋玩家。")
    return player


def _piece(player: dict[str, Any], piece_id: str) -> dict[str, Any]:
    piece = next((item for item in player["pieces"] if item["id"] == piece_id), None)
    if piece is None:
        raise CommandError("piece_not_found", "没有这架飞机。")
    return piece


def _next_player_id(state: dict[str, Any], player_id: str) -> str:
    order = state["turn_order"]
    index = order.index(player_id)
    return str(order[(index + 1) % len(order)])


def _event(state: dict[str, Any], type_name: str, text: str, **extra: Any) -> None:
    state["public_events"].append(
        {
            "seq": len(state["public_events"]) + 1,
            "revision": state["revision"],
            "type": type_name,
            "text": text,
            **deepcopy(extra),
        }
    )


def _outer_index(player: dict[str, Any], progress: int) -> int:
    if not 1 <= progress <= MAIN_STEPS:
        raise ValueError("outer index requires main-track progress")
    return (START_INDICES[player["seat"]] + progress - 1) % OUTER_LENGTH


def _zone(progress: int) -> str:
    if progress < 0:
        return "hangar"
    if progress == 0:
        return "launch"
    if progress <= MAIN_STEPS:
        return "track"
    if progress < GOAL_PROGRESS:
        return "home"
    return "goal"


def _active_penalty_pieces(player: dict[str, Any]) -> list[dict[str, Any]]:
    return [piece for piece in player["pieces"] if 0 <= piece["progress"] < GOAL_PROGRESS]


def _movable_pieces(state: dict[str, Any], player: dict[str, Any]) -> list[dict[str, Any]]:
    if state["phase"] != "awaiting_move" or state["dice"] is None:
        return []
    dice = int(state["dice"])
    return [
        piece
        for piece in player["pieces"]
        if piece["progress"] < GOAL_PROGRESS
        and (piece["progress"] >= 0 or dice == DEFAULT_RULES["takeoff_roll"])
    ]


def _start_round(state: dict[str, Any], starter_id: str) -> None:
    state.update(
        {
            "phase": "awaiting_roll",
            "current_player_id": starter_id,
            "dice": None,
            "consecutive_sixes": 0,
            "winner_id": None,
            "last_roll": None,
            "last_move": None,
        }
    )
    for player in state["players"]:
        for piece in player["pieces"]:
            piece["progress"] = -1
    _event(
        state,
        "round_start",
        f"第 {state['round']} 局开始，{_player(state, starter_id)['name']} 先掷骰。",
        starter_id=starter_id,
    )


def create_game(
    players: list[dict[str, Any]],
    *,
    seed: object = 1,
    game_id: str | None = None,
    rules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(players, list) or not MIN_PLAYER_COUNT <= len(players) <= MAX_PLAYER_COUNT:
        raise CommandError("invalid_player_count", "飞行棋需要二至四名玩家。")
    ids: set[str] = set()
    prepared: list[dict[str, Any]] = []
    seat_positions = (0, 2) if len(players) == 2 else tuple(range(len(players)))
    for player_index, source in enumerate(players):
        if not isinstance(source, dict):
            raise CommandError("invalid_player", "每名飞行棋玩家都必须是对象。")
        seat = seat_positions[player_index]
        player_id = str(source.get("id", f"player-{player_index + 1}")).strip()
        if not player_id or player_id in ids:
            raise CommandError("invalid_player_id", "飞行棋玩家 ID 不能为空或重复。")
        ids.add(player_id)
        name = (
            str(source.get("name", f"玩家{player_index + 1}")).strip()
            or f"玩家{player_index + 1}"
        )
        controller_type = str(source.get("controller_type", "human")).strip()
        if controller_type not in {"human", "resident"}:
            raise CommandError(
                "invalid_controller_type", "座位控制类型只能是 human 或 resident。"
            )
        prepared.append(
            {
                "id": player_id,
                "name": name,
                "seat": seat,
                "controller_type": controller_type,
                "accent": str(source.get("accent", ACCENTS[seat])),
                "wins": 0,
                "pieces": [
                    {
                        "id": f"{player_id}-plane-{number}",
                        "number": number,
                        "progress": -1,
                    }
                    for number in range(1, PIECES_PER_PLAYER + 1)
                ],
            }
        )
    resolved_game_id = str(game_id).strip() if game_id is not None else f"flying-{uuid4()}"
    if not resolved_game_id:
        raise CommandError("invalid_game_id", "飞行棋 game_id 不能为空。")
    state: dict[str, Any] = {
        "game_id": resolved_game_id,
        "rules_version": RULES_VERSION,
        "rules": _normalise_rules(rules),
        "created_at_ms": time.time_ns() // 1_000_000,
        "revision": 0,
        "round": 1,
        "phase": "awaiting_roll",
        "turn_order": [player["id"] for player in prepared],
        "current_player_id": prepared[0]["id"],
        "players": prepared,
        "dice": None,
        "last_roll": None,
        "consecutive_sixes": 0,
        "winner_id": None,
        "last_move": None,
        "rounds": [],
        "rng_state": _create_rng_state(seed),
        "public_events": [],
        "command_log": [],
        "applied_commands": {},
    }
    _event(state, "game_start", f"飞行棋开局，{len(prepared)} 名玩家各有四架飞机。")
    starter = prepared[_hash_seed(seed) % len(prepared)]
    _start_round(state, starter["id"])
    _assert_state(state)
    return state


def _advance_turn(state: dict[str, Any], player_id: str, *, extra_roll: bool) -> None:
    state["dice"] = None
    state["phase"] = "awaiting_roll"
    if extra_roll:
        state["current_player_id"] = player_id
        _event(state, "extra_roll", f"{_player(state, player_id)['name']} 掷到 6，可以再掷一次。")
        return
    state["consecutive_sixes"] = 0
    state["current_player_id"] = _next_player_id(state, player_id)


def _act_roll(state: dict[str, Any], player: dict[str, Any]) -> None:
    if state["phase"] != "awaiting_roll":
        raise CommandError("roll_unavailable", "现在不能掷骰子。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家掷骰子。")
    dice = _roll_die(state)
    state["dice"] = dice
    state["last_roll"] = {
        "player_id": player["id"],
        "dice": dice,
        "revision": state["revision"],
    }
    state["consecutive_sixes"] = state["consecutive_sixes"] + 1 if dice == 6 else 0
    _event(
        state,
        "roll",
        f"{player['name']} 掷出了 {dice}。",
        player_id=player["id"],
        dice=dice,
        consecutive_sixes=state["consecutive_sixes"],
    )
    if dice == 6 and state["consecutive_sixes"] >= 3:
        penalties = _active_penalty_pieces(player)
        if penalties:
            state["phase"] = "awaiting_penalty"
            _event(
                state,
                "triple_six",
                f"{player['name']} 连续三次掷出 6，需要选择一架未完成飞机返回机场。",
                player_id=player["id"],
                legal_piece_ids=[piece["id"] for piece in penalties],
            )
            return
        _event(state, "triple_six_clear", f"{player['name']} 没有可罚回的飞机，本回合结束。")
        _advance_turn(state, player["id"], extra_roll=False)
        return
    state["phase"] = "awaiting_move"
    if not _movable_pieces(state, player):
        _event(state, "no_move", f"{player['name']} 没有可以移动的飞机。", player_id=player["id"])
        _advance_turn(state, player["id"], extra_roll=dice == 6)


def _capture_crossing(state: dict[str, Any], player: dict[str, Any]) -> list[str]:
    opposite_seat = (player["seat"] + 2) % MAX_PLAYER_COUNT
    opposite = next(
        (item for item in state["players"] if item["seat"] == opposite_seat),
        None,
    )
    if opposite is None:
        return []
    captured: list[str] = []
    for piece in opposite["pieces"]:
        if piece["progress"] == HOME_CROSS_PROGRESS:
            piece["progress"] = -1
            captured.append(piece["id"])
    return captured


def _capture_landing(
    state: dict[str, Any], player: dict[str, Any], progress: int
) -> list[str]:
    if not 1 <= progress <= MAIN_STEPS:
        return []
    destination = _outer_index(player, progress)
    captured: list[str] = []
    for opponent in state["players"]:
        if opponent["id"] == player["id"]:
            continue
        for piece in opponent["pieces"]:
            if 1 <= piece["progress"] <= MAIN_STEPS and _outer_index(opponent, piece["progress"]) == destination:
                piece["progress"] = -1
                captured.append(piece["id"])
    return captured


def _resolve_main_track(progress: int) -> tuple[int, list[str], list[tuple[str, int | None]]]:
    effects: list[str] = []
    checkpoints: list[tuple[str, int | None]] = [("landing", progress)]
    if progress == FLIGHT_SOURCE_PROGRESS:
        effects.extend(["flight", "color_jump"])
        checkpoints.extend(
            [
                ("crossing", None),
                ("landing", FLIGHT_DEST_PROGRESS),
                ("landing", FLIGHT_DEST_PROGRESS + 4),
            ]
        )
        return FLIGHT_DEST_PROGRESS + 4, effects, checkpoints
    if progress in OWN_COLOR_PROGRESS and progress + 4 <= MAIN_STEPS:
        progress += 4
        effects.append("color_jump")
        checkpoints.append(("landing", progress))
        if progress == FLIGHT_SOURCE_PROGRESS:
            progress = FLIGHT_DEST_PROGRESS
            effects.append("flight")
            checkpoints.extend([("crossing", None), ("landing", progress)])
    return progress, effects, checkpoints


def _capture_checkpoints(
    state: dict[str, Any],
    player: dict[str, Any],
    checkpoints: list[tuple[str, int | None]],
) -> list[str]:
    captured: list[str] = []
    for kind, progress in checkpoints:
        if kind == "crossing":
            captured.extend(_capture_crossing(state, player))
        elif progress is not None:
            captured.extend(_capture_landing(state, player, progress))
    return captured


def _finish_round(state: dict[str, Any], player: dict[str, Any]) -> None:
    player["wins"] += 1
    state["winner_id"] = player["id"]
    state["phase"] = "round_over"
    state["current_player_id"] = None
    state["dice"] = None
    state["consecutive_sixes"] = 0
    record = {
        "round": state["round"],
        "winner_id": player["id"],
        "winner_name": player["name"],
    }
    state["rounds"].append(record)
    _event(
        state,
        "round_over",
        f"{player['name']} 的四架飞机全部到达，赢得第 {state['round']} 局。",
        **record,
    )


def _act_move(state: dict[str, Any], player: dict[str, Any], command: dict[str, Any]) -> None:
    if state["phase"] != "awaiting_move" or state["dice"] is None:
        raise CommandError("move_unavailable", "现在不能移动飞机。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家移动。")
    piece_id = str(command.get("piece_id", "")).strip()
    piece = _piece(player, piece_id)
    legal_ids = {item["id"] for item in _movable_pieces(state, player)}
    if piece_id not in legal_ids:
        raise CommandError("piece_not_movable", "这架飞机不能按当前骰子移动。")
    dice = int(state["dice"])
    start = int(piece["progress"])
    effects: list[str] = []
    captured: list[str] = []
    if start < 0:
        destination = 0
        effects.append("takeoff")
    else:
        raw = start + dice
        if raw > GOAL_PROGRESS:
            destination = GOAL_PROGRESS - (raw - GOAL_PROGRESS)
            effects.append("bounce")
        else:
            destination = raw
        if 1 <= destination <= MAIN_STEPS:
            destination, track_effects, checkpoints = _resolve_main_track(destination)
            effects.extend(track_effects)
            captured.extend(_capture_checkpoints(state, player, checkpoints))
        if destination == GOAL_PROGRESS:
            effects.append("goal")
    piece["progress"] = destination
    if captured:
        effects.append("capture")
    state["last_move"] = {
        "player_id": player["id"],
        "piece_id": piece["id"],
        "piece_number": piece["number"],
        "dice": dice,
        "from_progress": start,
        "to_progress": destination,
        "effects": effects,
        "captured_piece_ids": captured,
    }
    effect_text = {
        "takeoff": "起飞",
        "color_jump": "同色跳跃",
        "flight": "飞越长航线",
        "capture": f"吃回 {len(captured)} 架飞机",
        "bounce": "终点反弹",
        "goal": "抵达终点",
    }
    summary = "、".join(effect_text[item] for item in effects if item in effect_text)
    _event(
        state,
        "move",
        f"{player['name']} 移动 {piece['number']} 号机{f'：{summary}' if summary else ''}。",
        **deepcopy(state["last_move"]),
    )
    if all(item["progress"] == GOAL_PROGRESS for item in player["pieces"]):
        _finish_round(state, player)
        return
    _advance_turn(state, player["id"], extra_roll=dice == 6)


def _act_penalty_return(
    state: dict[str, Any], player: dict[str, Any], command: dict[str, Any]
) -> None:
    if state["phase"] != "awaiting_penalty":
        raise CommandError("penalty_unavailable", "现在没有三连六罚回。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家处理罚回。")
    piece_id = str(command.get("piece_id", "")).strip()
    piece = _piece(player, piece_id)
    if piece not in _active_penalty_pieces(player):
        raise CommandError("piece_not_penalizable", "这架飞机不能被罚回机场。")
    start = int(piece["progress"])
    piece["progress"] = -1
    state["last_move"] = {
        "player_id": player["id"],
        "piece_id": piece["id"],
        "piece_number": piece["number"],
        "dice": 6,
        "from_progress": start,
        "to_progress": -1,
        "effects": ["triple_six_penalty"],
        "captured_piece_ids": [],
    }
    _event(
        state,
        "penalty_return",
        f"{player['name']} 的 {piece['number']} 号机因三连六返回机场。",
        **deepcopy(state["last_move"]),
    )
    _advance_turn(state, player["id"], extra_roll=False)


def _canonical_command(command: dict[str, Any]) -> str:
    return json.dumps(command, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def apply_command(
    source_state: dict[str, Any], command: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(command, dict):
        raise CommandError("invalid_command", "飞行棋动作必须是对象。")
    command_id = str(command.get("command_id", "")).strip()
    if command_id and command_id in source_state["applied_commands"]:
        previous = source_state["applied_commands"][command_id]
        if previous["canonical"] != _canonical_command(command):
            raise CommandError("command_id_conflict", "同一 command_id 已用于不同动作。")
        return deepcopy(source_state), {"duplicate": True, "revision": source_state["revision"]}
    if not command_id:
        raise CommandError("missing_command_id", "动作缺少 command_id。")
    expected_revision = command.get("expected_revision")
    if not isinstance(expected_revision, int):
        raise CommandError("missing_expected_revision", "动作缺少整数 expected_revision。")
    if expected_revision != source_state["revision"]:
        raise CommandError(
            "stale_revision",
            f"对局已更新：当前版本为 {source_state['revision']}，动作基于 {expected_revision}。",
        )
    actor_id = str(command.get("actor_id", "")).strip()
    if not actor_id:
        raise CommandError("missing_actor_id", "动作缺少 actor_id。")
    state = deepcopy(source_state)
    state["revision"] = source_state["revision"] + 1
    player = _player(state, actor_id)
    action = command.get("action")
    if action == "roll":
        _act_roll(state, player)
    elif action == "move":
        _act_move(state, player, command)
    elif action == "penalty_return":
        _act_penalty_return(state, player, command)
    else:
        raise CommandError("unknown_action", "不支持这个飞行棋动作。")
    stored = deepcopy(command)
    stored["occurred_at_ms"] = time.time_ns() // 1_000_000
    state["command_log"].append(stored)
    state["applied_commands"][command_id] = {
        "canonical": _canonical_command(command),
        "revision": state["revision"],
    }
    _assert_state(state)
    return state, {"duplicate": False, "revision": state["revision"]}


def legal_moves(state: dict[str, Any], player_id: str) -> list[dict[str, Any]]:
    try:
        player = _player(state, player_id)
    except CommandError:
        return []
    if state["phase"] == "round_over":
        return []
    if state["current_player_id"] != player_id:
        return []
    if state["phase"] == "awaiting_roll":
        return [{"action": "roll"}]
    if state["phase"] == "awaiting_move":
        return [
            {"action": "move", "piece_id": piece["id"], "piece_number": piece["number"]}
            for piece in _movable_pieces(state, player)
        ]
    if state["phase"] == "awaiting_penalty":
        return [
            {
                "action": "penalty_return",
                "piece_id": piece["id"],
                "piece_number": piece["number"],
            }
            for piece in _active_penalty_pieces(player)
        ]
    return []


def _project_piece(player: dict[str, Any], piece: dict[str, Any]) -> dict[str, Any]:
    progress = int(piece["progress"])
    projected = {
        "id": piece["id"],
        "number": piece["number"],
        "progress": progress,
        "zone": _zone(progress),
        "finished": progress == GOAL_PROGRESS,
    }
    if 1 <= progress <= MAIN_STEPS:
        projected["outer_index"] = _outer_index(player, progress)
    if MAIN_STEPS < progress < GOAL_PROGRESS:
        projected["home_step"] = progress - MAIN_STEPS
    return projected


def project_view(state: dict[str, Any], viewer_id: str | None) -> dict[str, Any]:
    if viewer_id is not None:
        _player(state, viewer_id)
    moves = legal_moves(state, viewer_id) if viewer_id is not None else []
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "status": "finished" if state["phase"] == "round_over" else "active",
        "phase": state["phase"],
        "round": state["round"],
        "rules": deepcopy(state["rules"]),
        "viewer_id": viewer_id,
        "current_player_id": state["current_player_id"],
        "dice": state["dice"],
        "last_roll": deepcopy(state["last_roll"]),
        "consecutive_sixes": state["consecutive_sixes"],
        "winner_id": state["winner_id"],
        "players": [
            {
                "id": player["id"],
                "name": player["name"],
                "seat": player["seat"],
                "controller_type": player["controller_type"],
                "accent": player["accent"],
                "wins": player["wins"],
                "hangar_count": sum(piece["progress"] < 0 for piece in player["pieces"]),
                "goal_count": sum(piece["progress"] == GOAL_PROGRESS for piece in player["pieces"]),
                "pieces": [_project_piece(player, piece) for piece in player["pieces"]],
            }
            for player in state["players"]
        ],
        "board": {
            "outer_length": OUTER_LENGTH,
            "main_steps": MAIN_STEPS,
            "home_steps": HOME_STEPS,
            "goal_progress": GOAL_PROGRESS,
            "start_indices": list(START_INDICES),
            "own_color_progress": list(OWN_COLOR_PROGRESS),
            "flight_source_progress": FLIGHT_SOURCE_PROGRESS,
            "flight_dest_progress": FLIGHT_DEST_PROGRESS,
            "home_cross_progress": HOME_CROSS_PROGRESS,
        },
        "last_move": deepcopy(state["last_move"]),
        "legal_actions": list(dict.fromkeys(str(move["action"]) for move in moves)),
        "legal_piece_ids": [
            str(move["piece_id"]) for move in moves if "piece_id" in move
        ],
        "legal_moves": deepcopy(moves),
        "recent_events": deepcopy(state["public_events"][-10:]),
    }


def project_replay(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "round": state["round"],
        "events": deepcopy(state["public_events"]),
        "rounds": deepcopy(state["rounds"]),
    }


def _assert_state(state: dict[str, Any]) -> None:
    if not MIN_PLAYER_COUNT <= len(state["players"]) <= MAX_PLAYER_COUNT:
        raise AssertionError("Flying Chess requires two to four players")
    piece_ids: set[str] = set()
    for player in state["players"]:
        if len(player["pieces"]) != PIECES_PER_PLAYER:
            raise AssertionError("Flying Chess requires four pieces per player")
        for piece in player["pieces"]:
            if piece["id"] in piece_ids:
                raise AssertionError("Flying Chess piece IDs must be unique")
            piece_ids.add(piece["id"])
            if not -1 <= piece["progress"] <= GOAL_PROGRESS:
                raise AssertionError("Flying Chess piece progress out of range")
    if state["phase"] == "awaiting_roll" and state["dice"] is not None:
        raise AssertionError("awaiting_roll must not retain a die")
    if state["phase"] in {"awaiting_move", "awaiting_penalty"} and not 1 <= int(state["dice"] or 0) <= 6:
        raise AssertionError("move and penalty phases require a die")
    last_roll = state.get("last_roll")
    if last_roll is not None:
        if last_roll.get("player_id") not in state["turn_order"]:
            raise AssertionError("last roll requires a player")
        if not 1 <= int(last_roll.get("dice", 0)) <= 6:
            raise AssertionError("last roll requires a valid die")
    if state["phase"] == "round_over":
        if state["current_player_id"] is not None or state["winner_id"] is None:
            raise AssertionError("round_over requires only a winner")
        winner = _player(state, state["winner_id"])
        if any(piece["progress"] != GOAL_PROGRESS for piece in winner["pieces"]):
            raise AssertionError("winner must have four finished pieces")
    elif state["current_player_id"] not in state["turn_order"]:
        raise AssertionError("active phase requires a current player")
    if not 0 <= state["consecutive_sixes"] <= 3:
        raise AssertionError("invalid consecutive-six count")
    if len(state["command_log"]) != state["revision"]:
        raise AssertionError("revision must match command count")
    if len(state["applied_commands"]) != state["revision"]:
        raise AssertionError("every revision must have one idempotency record")
