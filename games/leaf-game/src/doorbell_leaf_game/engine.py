"""Pure, JSON-serializable rules for the four-player Doorbell Leaf Game."""

from __future__ import annotations

from copy import deepcopy
import json
import random
from typing import Any
from uuid import uuid4


RULES_VERSION = "doorbell.where-winds-meet.v1"
PLAYER_COUNT = 4
INITIAL_HAND_SIZE = 13
MAX_PLAY_SIZE = 16
PILE_RISK_NUMERATOR = 3
PILE_RISK_DENOMINATOR = 2
INITIAL_POISON_CHANCE = 25
POISON_CHANCE_STEP = 25
KNOCKOUT_AT = 100
FINAL_CHALLENGE_WINDOW_MS = 3_000
MARKED_CARD_ID = "number-1-1"
CONTROLLER_TYPES = {"human", "resident"}


class CommandError(ValueError):
    """A stable, user-actionable rule rejection."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _card_sort_key(card: dict[str, Any]) -> tuple[int, int, str]:
    if card["kind"] == "wild":
        return (11, 0, card["id"])
    return (int(card["rank"]), 0 if card.get("marked") else 1, card["id"])


def _make_deck() -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for rank in range(1, 11):
        for copy_index in range(1, 5):
            card_id = f"number-{rank}-{copy_index}"
            cards.append(
                {
                    "id": card_id,
                    "kind": "number",
                    "rank": rank,
                    "marked": card_id == MARKED_CARD_ID,
                }
            )
    for copy_index in range(1, 13):
        cards.append(
            {
                "id": f"wild-{copy_index}",
                "kind": "wild",
                "rank": None,
                "marked": False,
            }
        )
    return cards


def _normalise_players(players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(players) != PLAYER_COUNT:
        raise CommandError("invalid_player_count", "叶子戏固定需要四名玩家。")

    seen: set[str] = set()
    normalised: list[dict[str, Any]] = []
    for index, player in enumerate(players):
        if not isinstance(player, dict):
            raise CommandError("invalid_player", "每名叶子戏玩家都必须是对象。")
        player_id = str(player.get("id", "")).strip()
        name = str(player.get("name", "")).strip()
        if not player_id or player_id in seen:
            raise CommandError("invalid_player_id", "四名玩家必须使用互不重复的非空 ID。")
        if not name:
            raise CommandError("invalid_player_name", "玩家昵称不能为空。")
        controller_type = str(player.get("controller_type", "human")).strip()
        if controller_type not in CONTROLLER_TYPES:
            raise CommandError(
                "invalid_controller_type", "座位控制类型只能是 human 或 resident。"
            )
        seen.add(player_id)
        normalised.append(
            {
                "id": player_id,
                "name": name,
                "seat": index,
                "controller_type": controller_type,
                "accent": str(
                    player.get("accent") or ("coral", "mint", "sky", "gold")[index]
                ),
                "hand": [],
                "drunkenness": 0,
                "poison_chance": INITIAL_POISON_CHANCE,
                "knocked_out": False,
            }
        )
    return normalised


def create_game(
    players: list[dict[str, Any]],
    *,
    seed: int = 1,
    game_id: str | None = None,
) -> dict[str, Any]:
    """Create a deterministic four-player game with all 52 cards dealt."""

    state_players = _normalise_players(players)
    rng = random.Random(seed)
    deck = _make_deck()
    rng.shuffle(deck)

    for index, card in enumerate(deck):
        state_players[index % PLAYER_COUNT]["hand"].append(card)
    for player in state_players:
        player["hand"].sort(key=_card_sort_key)

    dealer = next(
        player for player in state_players if any(card.get("marked") for card in player["hand"])
    )
    state: dict[str, Any] = {
        "game_id": game_id or f"leaf-{uuid4().hex[:12]}",
        "rules_version": RULES_VERSION,
        "revision": 0,
        "status": "active",
        "phase": "lead",
        "seed": seed,
        "rules": {
            "player_count": PLAYER_COUNT,
            "initial_hand_size": INITIAL_HAND_SIZE,
            "max_play_size": MAX_PLAY_SIZE,
            "pile_risk_numerator": PILE_RISK_NUMERATOR,
            "pile_risk_denominator": PILE_RISK_DENOMINATOR,
            "initial_poison_chance": INITIAL_POISON_CHANCE,
            "poison_chance_step": POISON_CHANCE_STEP,
            "knockout_at": KNOCKOUT_AT,
            "final_challenge_window_ms": FINAL_CHALLENGE_WINDOW_MS,
            "drinking_policy": "pile-risk-and-poison-roll",
        },
        "players": state_players,
        "dealer_id": dealer["id"],
        "current_player_id": dealer["id"],
        "declared_rank": None,
        "pile": [],
        "last_play_index": None,
        "pending_winner_id": None,
        "final_challenge_deadline_ms": None,
        "winner_id": None,
        "last_resolution": None,
        "clock_ms": 0,
        "drink_roll_index": 0,
        "public_events": [
            {
                "type": "game_started",
                "dealer_id": dealer["id"],
                "player_ids": [player["id"] for player in state_players],
            }
        ],
        "command_log": [],
        "applied_commands": {},
    }
    _assert_state(state)
    return state


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    for player in state["players"]:
        if player["id"] == player_id:
            return player
    raise CommandError("unknown_actor", "对局中没有这名玩家。")


def _active_players(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [player for player in state["players"] if not player["knocked_out"]]


def _next_active_id(state: dict[str, Any], after_player_id: str) -> str:
    players = state["players"]
    start = next(index for index, player in enumerate(players) if player["id"] == after_player_id)
    for offset in range(1, len(players) + 1):
        candidate = players[(start + offset) % len(players)]
        if not candidate["knocked_out"]:
            return str(candidate["id"])
    raise CommandError("no_active_player", "对局中已没有可行动玩家。")


def _canonical_command(command: dict[str, Any]) -> str:
    return json.dumps(command, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _require_command_envelope(state: dict[str, Any], command: dict[str, Any]) -> str:
    command_id = str(command.get("command_id", "")).strip()
    if not command_id:
        raise CommandError("missing_command_id", "动作缺少 command_id。")
    expected_revision = command.get("expected_revision")
    if not isinstance(expected_revision, int):
        raise CommandError("missing_expected_revision", "动作缺少整数 expected_revision。")
    if expected_revision != state["revision"]:
        raise CommandError(
            "stale_revision",
            f"对局已更新：当前版本为 {state['revision']}，动作基于 {expected_revision}。",
        )
    if state["status"] != "active":
        raise CommandError("game_finished", "这局已经结束。")
    return command_id


def _require_base_command(state: dict[str, Any], command: dict[str, Any]) -> tuple[str, str]:
    command_id = _require_command_envelope(state, command)
    actor_id = str(command.get("actor_id", "")).strip()
    if not actor_id:
        raise CommandError("missing_actor_id", "动作缺少 actor_id。")
    _player(state, actor_id)
    if actor_id != state["current_player_id"]:
        raise CommandError("not_your_turn", "现在不是这名玩家的行动回合。")
    return command_id, actor_id


def _require_system_command(state: dict[str, Any], command: dict[str, Any]) -> str:
    command_id = _require_command_envelope(state, command)
    if command.get("actor_id") != "system":
        raise CommandError("system_action_required", "最后一手超时只能由牌局服务结算。")
    return command_id


def _selected_cards(player: dict[str, Any], card_ids: Any) -> list[dict[str, Any]]:
    if not isinstance(card_ids, list) or not 1 <= len(card_ids) <= MAX_PLAY_SIZE:
        raise CommandError("invalid_play_size", f"每次必须盖下 1–{MAX_PLAY_SIZE} 张牌。")
    normalised = [str(card_id) for card_id in card_ids]
    if len(set(normalised)) != len(normalised):
        raise CommandError("duplicate_card", "同一张牌不能重复选择。")
    by_id = {card["id"]: card for card in player["hand"]}
    if any(card_id not in by_id for card_id in normalised):
        raise CommandError("card_not_in_hand", "所选牌中包含不在当前手牌里的牌。")
    return [by_id[card_id] for card_id in normalised]


def _place_cards(
    state: dict[str, Any],
    actor_id: str,
    cards: list[dict[str, Any]],
    declared_rank: int,
    now_ms: int,
) -> None:
    player = _player(state, actor_id)
    selected_ids = {card["id"] for card in cards}
    player["hand"] = [card for card in player["hand"] if card["id"] not in selected_ids]
    play = {
        "actor_id": actor_id,
        "declared_rank": declared_rank,
        "card_count": len(cards),
        "cards": cards,
    }
    state["pile"].append(play)
    state["last_play_index"] = len(state["pile"]) - 1
    state["public_events"].append(
        {
            "type": "cards_played",
            "actor_id": actor_id,
            "declared_rank": declared_rank,
            "card_count": len(cards),
        }
    )
    state["current_player_id"] = _next_active_id(state, actor_id)
    if not player["hand"]:
        state["pending_winner_id"] = actor_id
        state["phase"] = "final_challenge"
        state["final_challenge_deadline_ms"] = (
            now_ms + int(state["rules"]["final_challenge_window_ms"])
        )
    else:
        state["phase"] = "follow"


def _pile_cards(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [card for play in state["pile"] for card in play["cards"]]


def _finish(state: dict[str, Any], winner_id: str, reason: str) -> None:
    state["status"] = "finished"
    state["phase"] = "finished"
    state["winner_id"] = winner_id
    state["current_player_id"] = None
    state["dealer_id"] = None
    state["pending_winner_id"] = None
    state["final_challenge_deadline_ms"] = None
    state["public_events"].append(
        {"type": "game_finished", "winner_id": winner_id, "reason": reason}
    )


def _finish_if_last_active(state: dict[str, Any]) -> bool:
    active = _active_players(state)
    if len(active) == 1:
        _finish(state, active[0]["id"], "last_conscious_player")
        return True
    return False


def _pile_risk(card_count: int) -> int:
    return (card_count * PILE_RISK_NUMERATOR + PILE_RISK_DENOMINATOR - 1) // PILE_RISK_DENOMINATOR


def _next_drink_roll(state: dict[str, Any]) -> tuple[int, int]:
    roll_index = int(state["drink_roll_index"])
    roll = random.Random(f"{state['seed']}:drink:{roll_index}").randint(1, 100)
    state["drink_roll_index"] = roll_index + 1
    return roll_index, roll


def _drink_and_collect(state: dict[str, Any], loser_id: str) -> dict[str, Any]:
    loser = _player(state, loser_id)
    cards = _pile_cards(state)
    loser["hand"].extend(cards)
    loser["hand"].sort(key=_card_sort_key)
    state["pile"] = []
    state["last_play_index"] = None
    gained = _pile_risk(len(cards))
    before = int(loser["drunkenness"])
    loser["drunkenness"] = min(int(state["rules"]["knockout_at"]), before + gained)
    poison_chance_before = int(loser["poison_chance"])
    roll_index, poison_roll = _next_drink_roll(state)
    poisoned = poison_roll <= poison_chance_before
    meter_knockout = loser["drunkenness"] >= int(state["rules"]["knockout_at"])
    loser["knocked_out"] = poisoned or meter_knockout
    if not loser["knocked_out"]:
        loser["poison_chance"] = min(
            100,
            poison_chance_before + int(state["rules"]["poison_chance_step"]),
        )
    return {
        "loser_id": loser_id,
        "collected_card_count": len(cards),
        "drunkenness_before": before,
        "pile_risk": gained,
        "drunkenness_after": loser["drunkenness"],
        "poison_chance_before": poison_chance_before,
        "poison_chance_after": loser["poison_chance"],
        "poison_roll_index": roll_index,
        "poison_roll": poison_roll,
        "poisoned": poisoned,
        "knockout_reason": "poison" if poisoned else "drunkenness" if meter_knockout else None,
        "knocked_out": loser["knocked_out"],
    }


def _start_round(state: dict[str, Any], dealer_id: str) -> None:
    state["pile"] = []
    state["last_play_index"] = None
    state["declared_rank"] = None
    state["pending_winner_id"] = None
    state["final_challenge_deadline_ms"] = None
    state["dealer_id"] = dealer_id
    state["current_player_id"] = dealer_id
    state["phase"] = "lead"


def _challenge(state: dict[str, Any], actor_id: str, now_ms: int) -> None:
    if state["phase"] not in {"follow", "final_challenge"} or state["last_play_index"] is None:
        raise CommandError("challenge_unavailable", "当前没有可质疑的上一手牌。")
    deadline = state["final_challenge_deadline_ms"]
    if state["phase"] == "final_challenge" and deadline is not None and now_ms >= int(deadline):
        raise CommandError("challenge_window_closed", "最后一手的质疑时间已经结束。")
    challenged_play = state["pile"][state["last_play_index"]]
    challenged_id = challenged_play["actor_id"]
    if challenged_id == actor_id:
        raise CommandError("cannot_challenge_self", "不能质疑自己刚盖下的牌。")
    declared_rank = int(state["declared_rank"])
    truthful = all(
        card["kind"] == "wild" or card["rank"] == declared_rank
        for card in challenged_play["cards"]
    )
    winner_id = challenged_id if truthful else actor_id
    loser_id = actor_id if truthful else challenged_id
    pending_winner_id = state["pending_winner_id"]
    revealed_cards = deepcopy(challenged_play["cards"])
    drink = _drink_and_collect(state, loser_id)
    resolution = {
        "type": "challenge",
        "challenger_id": actor_id,
        "challenged_id": challenged_id,
        "declared_rank": declared_rank,
        "truthful": truthful,
        "winner_id": winner_id,
        **drink,
        "revealed_cards": revealed_cards,
    }
    state["last_resolution"] = resolution
    state["public_events"].append(deepcopy(resolution))

    if pending_winner_id == challenged_id and truthful:
        _finish(state, challenged_id, "empty_hand_confirmed_by_failed_challenge")
        return
    if _finish_if_last_active(state):
        return
    next_dealer = winner_id
    if _player(state, next_dealer)["knocked_out"]:
        next_dealer = _next_active_id(state, next_dealer)
    _start_round(state, next_dealer)


def _concede(state: dict[str, Any], actor_id: str) -> None:
    if state["phase"] != "follow" or not state["pile"]:
        raise CommandError("concede_unavailable", "当前不能认罚。")
    drink = _drink_and_collect(state, actor_id)
    resolution = {
        "type": "concede",
        "winner_id": actor_id,
        **drink,
        "revealed_cards": [],
    }
    state["last_resolution"] = resolution
    state["public_events"].append(deepcopy(resolution))
    if _finish_if_last_active(state):
        return
    next_dealer = actor_id
    if _player(state, actor_id)["knocked_out"]:
        next_dealer = _next_active_id(state, actor_id)
    _start_round(state, next_dealer)


def _resolve_final_timeout(state: dict[str, Any], now_ms: int) -> None:
    if state["phase"] != "final_challenge" or not state["pending_winner_id"]:
        raise CommandError("final_timeout_unavailable", "当前没有等待结算的最后一手。")
    deadline = state["final_challenge_deadline_ms"]
    if deadline is None or now_ms < int(deadline):
        raise CommandError("challenge_window_open", "最后一手仍在质疑时间内。")
    winner_id = state["pending_winner_id"]
    state["last_resolution"] = {
        "type": "final_play_uncontested",
        "winner_id": winner_id,
        "revealed_cards": [],
    }
    state["public_events"].append(deepcopy(state["last_resolution"]))
    _finish(state, winner_id, "empty_hand_uncontested")


def apply_command(
    source_state: dict[str, Any], command: dict[str, Any], *, now_ms: int = 0
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Apply one idempotent command and return a new state plus command metadata."""

    state = deepcopy(source_state)
    command_id = str(command.get("command_id", "")).strip()
    if command_id and command_id in state["applied_commands"]:
        previous = state["applied_commands"][command_id]
        if previous["canonical"] != _canonical_command(command):
            raise CommandError("command_id_conflict", "同一 command_id 已用于不同动作。")
        return state, {"duplicate": True, "revision": state["revision"]}

    action = command.get("action")
    resolved_now_ms = max(int(state.get("clock_ms", 0)), int(now_ms))
    if action == "resolve_final_timeout":
        command_id = _require_system_command(state, command)
        actor_id = "system"
    else:
        command_id, actor_id = _require_base_command(state, command)

    if action == "lead":
        if state["phase"] != "lead" or actor_id != state["dealer_id"]:
            raise CommandError("lead_unavailable", "只有当前主家可以开新一轮。")
        declared_rank = command.get("declared_rank")
        if not isinstance(declared_rank, int) or not 1 <= declared_rank <= 10:
            raise CommandError("invalid_declared_rank", "主家必须选择 1–10 的点数。")
        cards = _selected_cards(_player(state, actor_id), command.get("card_ids"))
        state["declared_rank"] = declared_rank
        _place_cards(state, actor_id, cards, declared_rank, resolved_now_ms)
    elif action == "follow":
        if state["phase"] != "follow" or state["declared_rank"] is None:
            raise CommandError("follow_unavailable", "当前不能跟牌。")
        cards = _selected_cards(_player(state, actor_id), command.get("card_ids"))
        _place_cards(state, actor_id, cards, int(state["declared_rank"]), resolved_now_ms)
    elif action == "challenge":
        _challenge(state, actor_id, resolved_now_ms)
    elif action == "concede":
        _concede(state, actor_id)
    elif action == "resolve_final_timeout":
        _resolve_final_timeout(state, resolved_now_ms)
    else:
        raise CommandError("unknown_action", "不支持这个叶子戏动作。")

    state["clock_ms"] = resolved_now_ms
    state["revision"] += 1
    stored_command = deepcopy(command)
    stored_command["occurred_at_ms"] = resolved_now_ms
    state["command_log"].append(stored_command)
    state["applied_commands"][command_id] = {
        "canonical": _canonical_command(command),
        "revision": state["revision"],
    }
    _assert_state(state)
    return state, {"duplicate": False, "revision": state["revision"]}


def _public_card(card: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": card["kind"],
        "rank": card["rank"],
        "marked": bool(card.get("marked")),
    }


def _public_resolution(resolution: dict[str, Any] | None) -> dict[str, Any] | None:
    if resolution is None:
        return None
    public = {
        key: deepcopy(value)
        for key, value in resolution.items()
        if key != "revealed_cards"
    }
    public["revealed_cards"] = [
        _public_card(card) for card in resolution.get("revealed_cards", [])
    ]
    return public


def _legal_actions(state: dict[str, Any], viewer_id: str | None, now_ms: int) -> list[str]:
    if state["status"] != "active" or viewer_id != state["current_player_id"]:
        return []
    if state["phase"] == "lead":
        return ["lead"]
    if state["phase"] == "follow":
        return ["follow", "challenge", "concede"]
    if state["phase"] == "final_challenge":
        deadline = state["final_challenge_deadline_ms"]
        return ["challenge"] if deadline is not None and now_ms < int(deadline) else []
    return []


def project_view(
    state: dict[str, Any], viewer_id: str | None, *, now_ms: int | None = None
) -> dict[str, Any]:
    """Project a player or spectator view without leaking covered cards."""

    resolved_now_ms = max(int(state.get("clock_ms", 0)), int(now_ms or 0))
    if viewer_id is not None:
        _player(state, viewer_id)
    players = []
    for player in state["players"]:
        projected = {
            "id": player["id"],
            "name": player["name"],
            "seat": player["seat"],
            "controller_type": player["controller_type"],
            "accent": player["accent"],
            "hand_count": len(player["hand"]),
            "drunkenness": player["drunkenness"],
            "poison_chance": player["poison_chance"],
            "knocked_out": player["knocked_out"],
        }
        if player["id"] == viewer_id:
            projected["hand"] = deepcopy(player["hand"])
        players.append(projected)

    pile = [
        {
            "actor_id": play["actor_id"],
            "declared_rank": play["declared_rank"],
            "card_count": play["card_count"],
        }
        for play in state["pile"]
    ]
    deadline = state["final_challenge_deadline_ms"]
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "status": state["status"],
        "phase": state["phase"],
        "rules": deepcopy(state["rules"]),
        "players": players,
        "viewer_id": viewer_id,
        "dealer_id": state["dealer_id"],
        "current_player_id": state["current_player_id"],
        "declared_rank": state["declared_rank"],
        "pile": pile,
        "pile_card_count": sum(play["card_count"] for play in pile),
        "pile_risk_percent": _pile_risk(sum(play["card_count"] for play in pile)),
        "pending_winner_id": state["pending_winner_id"],
        "final_challenge_deadline_ms": deadline,
        "final_challenge_remaining_ms": (
            max(0, int(deadline) - resolved_now_ms) if deadline is not None else None
        ),
        "server_now_ms": resolved_now_ms,
        "winner_id": state["winner_id"],
        "last_resolution": _public_resolution(state["last_resolution"]),
        "legal_actions": _legal_actions(state, viewer_id, resolved_now_ms),
    }


def project_replay(state: dict[str, Any]) -> dict[str, Any]:
    """Return the public replay. Covered card identities never enter it."""

    events = []
    for event in state["public_events"]:
        events.append(_public_resolution(event) if "revealed_cards" in event else deepcopy(event))
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "events": events,
    }


def _assert_state(state: dict[str, Any]) -> None:
    cards = [card for player in state["players"] for card in player["hand"]]
    cards.extend(_pile_cards(state))
    ids = [card["id"] for card in cards]
    if len(ids) != 52 or len(set(ids)) != 52:
        raise AssertionError("card conservation violated")
    if state["phase"] in {"follow", "final_challenge"} and state["declared_rank"] is None:
        raise AssertionError("an active round needs a declared rank")
    if state["phase"] == "lead" and state["pile"]:
        raise AssertionError("a fresh round cannot keep covered cards")
    if state["phase"] == "final_challenge" and state["pending_winner_id"] is None:
        raise AssertionError("final challenge phase needs a pending winner")
    if state["phase"] == "final_challenge" and state["final_challenge_deadline_ms"] is None:
        raise AssertionError("final challenge phase needs a deadline")
    if state["phase"] != "final_challenge" and state["final_challenge_deadline_ms"] is not None:
        raise AssertionError("only a final challenge phase may keep a deadline")
    if state["status"] == "finished" and state["winner_id"] is None:
        raise AssertionError("a finished game needs a winner")
