"""Doorbell Commons standalone UNO rules engine.

Adapted from 29-Cu/bisca's CC BY 4.0 UNO engine. See
games/uno/THIRD_PARTY_NOTICES.md for attribution and modifications.
"""

from __future__ import annotations

from copy import deepcopy
import json
import time
from typing import Any
from uuid import uuid4


RULES_VERSION = "doorbell.bisca.uno.v2"
COLORS = ("R", "G", "B", "Y")
COLOR_NAMES = {"R": "红", "G": "绿", "B": "蓝", "Y": "黄"}
COLOR_ORDER = {color: index for index, color in enumerate(COLORS)}
ACTION_NAMES = {"S": "跳过", "R": "反转", "D": "+2"}
VALUE_ORDER = {"S": 10, "R": 11, "D": 12}
DEFAULT_RULES = {"stack_draw2": False}
ACCENTS = ("coral", "sky", "gold", "mint")


def _build_deck() -> tuple[str, ...]:
    cards: list[str] = []
    for color in COLORS:
        cards.append(f"{color}0#1")
        for number in range(1, 10):
            cards.extend((f"{color}{number}#1", f"{color}{number}#2"))
        for value in ("S", "R", "D"):
            cards.extend((f"{color}{value}#1", f"{color}{value}#2"))
    cards.extend(f"W#{index}" for index in range(1, 5))
    cards.extend(f"WD#{index}" for index in range(1, 5))
    return tuple(cards)


ALL_CARDS = _build_deck()
CARD_SET = frozenset(ALL_CARDS)


class CommandError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def parse_card(card_id: object) -> dict[str, Any] | None:
    if not isinstance(card_id, str) or card_id not in CARD_SET:
        return None
    base = card_id.split("#", 1)[0]
    if base in {"W", "WD"}:
        return {
            "id": card_id,
            "color": None,
            "value": base,
            "kind": "wild" if base == "W" else "wild4",
            "number": None,
            "points": 50,
            "wild": True,
        }
    color = base[0]
    value = base[1:]
    if value in ACTION_NAMES:
        return {
            "id": card_id,
            "color": color,
            "value": value,
            "kind": {"S": "skip", "R": "reverse", "D": "draw2"}[value],
            "number": None,
            "points": 20,
            "wild": False,
        }
    number = int(value)
    return {
        "id": card_id,
        "color": color,
        "value": value,
        "kind": "number",
        "number": number,
        "points": number,
        "wild": False,
    }


def card_label(card_id: str) -> str:
    card = parse_card(card_id)
    if card is None:
        return str(card_id)
    if card["kind"] == "wild":
        return "万能"
    if card["kind"] == "wild4":
        return "万能+4"
    return f"{COLOR_NAMES[str(card['color'])]}{ACTION_NAMES.get(str(card['value']), card['value'])}"


def _card_sort_key(card_id: str) -> tuple[int, int, str]:
    card = parse_card(card_id)
    if card is None:
        return (99, 99, str(card_id))
    if card["wild"]:
        return (4, 0 if card["kind"] == "wild" else 1, card_id)
    value = str(card["value"])
    order = VALUE_ORDER[value] if value in VALUE_ORDER else int(card["number"])
    return (COLOR_ORDER[str(card["color"])], order, card_id)


def sort_cards(cards: list[str]) -> list[str]:
    return sorted(cards, key=_card_sort_key)


def _hash_seed(seed: object) -> int:
    value = str("bisca" if seed is None else seed)
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


def _shuffle(state: dict[str, Any], cards: list[str] | tuple[str, ...]) -> list[str]:
    shuffled = list(cards)
    for index in range(len(shuffled) - 1, 0, -1):
        swap = _rng_next(state) % (index + 1)
        shuffled[index], shuffled[swap] = shuffled[swap], shuffled[index]
    return shuffled


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    player = next((item for item in state["players"] if item["id"] == player_id), None)
    if player is None:
        raise CommandError("player_not_found", "没有找到这名 UNO 玩家。")
    return player


def _seat_at(state: dict[str, Any], from_id: str, steps: int) -> str:
    order = state["turn_order"]
    start = order.index(from_id)
    return order[(start + int(state["direction"]) * steps) % len(order)]


def _event(state: dict[str, Any], event_type: str, text: str, **details: Any) -> None:
    state["event_seq"] += 1
    entry = {
        "seq": state["event_seq"],
        "revision": state["revision"],
        "type": event_type,
        "text": text,
        **details,
    }
    state["public_events"].append(entry)
    if len(state["public_events"]) > 400:
        state["public_events"] = state["public_events"][-400:]


def _normalise_players(players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(players, list) or not 2 <= len(players) <= 4:
        raise CommandError("invalid_players", "UNO 玩家人数必须是 2～4 人。")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, source in enumerate(players):
        if not isinstance(source, dict):
            raise CommandError("invalid_player", "UNO 玩家资料必须是对象。")
        player_id = str(source.get("id", "")).strip()
        if not player_id:
            raise CommandError("invalid_player", "UNO 玩家缺少 id。")
        if player_id in seen:
            raise CommandError("duplicate_player", f"UNO 玩家 id 重复：{player_id}")
        controller_type = source.get("controller_type")
        if controller_type not in {"human", "resident"}:
            raise CommandError(
                "invalid_controller_type", "UNO 参与者类型必须由接入层提供 human 或 resident。"
            )
        seen.add(player_id)
        result.append(
            {
                "id": player_id,
                "name": str(source.get("name") or f"玩家{index + 1}"),
                "seat": index,
                "controller_type": controller_type,
                "accent": (
                    source.get("accent")
                    if source.get("accent") in ACCENTS
                    else ACCENTS[index]
                ),
                "hand": [],
                "score": 0,
                "uno_called": False,
            }
        )
    return result


def _draw_cards(state: dict[str, Any], player: dict[str, Any], count: int) -> list[str]:
    cards: list[str] = []
    for _ in range(count):
        if not state["deck"]:
            if len(state["discard"]) <= 1:
                break
            top = state["discard"][-1]
            rest = state["discard"][:-1]
            state["discard"] = [top]
            state["deck"] = _shuffle(state, rest)
            _event(
                state,
                "reshuffle",
                f"牌库摸空了，把弃牌堆 {len(rest)} 张洗回牌库。",
            )
        cards.append(state["deck"].pop())
    if cards:
        player["hand"] = sort_cards([*player["hand"], *cards])
        player["uno_called"] = False
    return cards


def _top_card(state: dict[str, Any]) -> str | None:
    return state["discard"][-1] if state["discard"] else None


def _resolve_effect(state: dict[str, Any], actor_id: str, card_id: str) -> None:
    card = parse_card(card_id)
    assert card is not None
    player_count = len(state["turn_order"])
    if card["kind"] == "reverse":
        state["direction"] *= -1
        state["current_player_id"] = _seat_at(
            state, actor_id, 2 if player_count == 2 else 1
        )
        if player_count == 2:
            _event(
                state,
                "reverse",
                f"两人局反转等同跳过，轮到 {_player(state, state['current_player_id'])['name']}。",
            )
        else:
            direction = "顺时针" if state["direction"] > 0 else "逆时针"
            _event(state, "reverse", f"出牌方向改为{direction}。")
        return
    if card["kind"] == "skip":
        victim_id = _seat_at(state, actor_id, 1)
        state["current_player_id"] = _seat_at(state, actor_id, 2)
        _event(state, "skip", f"{_player(state, victim_id)['name']} 被跳过。")
        return
    if card["kind"] == "draw2":
        victim_id = _seat_at(state, actor_id, 1)
        drawn = _draw_cards(state, _player(state, victim_id), 2)
        state["current_player_id"] = _seat_at(state, actor_id, 2)
        _event(
            state,
            "draw2",
            f"{_player(state, victim_id)['name']} 摸 {len(drawn)} 张并跳过。",
            player_id=victim_id,
            count=len(drawn),
        )
        return
    if card["kind"] == "wild4":
        victim_id = _seat_at(state, actor_id, 1)
        drawn = _draw_cards(state, _player(state, victim_id), 4)
        state["current_player_id"] = _seat_at(state, actor_id, 2)
        _event(
            state,
            "wild4",
            f"{_player(state, victim_id)['name']} 摸 {len(drawn)} 张并跳过。",
            player_id=victim_id,
            count=len(drawn),
        )
        return
    state["current_player_id"] = _seat_at(state, actor_id, 1)


def _flip_starter(state: dict[str, Any]) -> None:
    held: list[str] = []
    top: str | None = None
    while state["deck"]:
        card_id = state["deck"].pop()
        card = parse_card(card_id)
        assert card is not None
        if card["wild"]:
            held.append(card_id)
            continue
        top = card_id
        break
    if held:
        state["deck"] = _shuffle(state, [*state["deck"], *held])
        _event(state, "flip", f"翻到 {len(held)} 张万能牌，放回牌库重翻。")
    if top is None:
        raise AssertionError("UNO deck did not contain a starter card")
    card = parse_card(top)
    assert card is not None
    state["discard"] = [top]
    state["active_color"] = card["color"]
    _event(
        state,
        "flip",
        f"翻开 {card_label(top)}，当前颜色是{COLOR_NAMES[str(card['color'])]}。",
        card_id=top,
    )
    leader_index = state["turn_order"].index(state["leader_id"])
    dealer_id = state["turn_order"][(leader_index - 1) % len(state["turn_order"])]
    state["current_player_id"] = state["leader_id"]
    _resolve_effect(state, dealer_id, top)


def _start_round(state: dict[str, Any]) -> None:
    state["phase"] = "playing"
    state["direction"] = 1
    state["current_player_id"] = state["leader_id"]
    state["pending"] = None
    state["uno_precalled_id"] = None
    state["uno_catch"] = None
    state["last_results"] = None
    state["discard"] = []
    for player in state["players"]:
        player["hand"] = []
        player["uno_called"] = False
    state["deck"] = _shuffle(state, ALL_CARDS)
    start = state["turn_order"].index(state["leader_id"])
    for _ in range(7):
        for offset in range(len(state["turn_order"])):
            player_id = state["turn_order"][(start + offset) % len(state["turn_order"])]
            _player(state, player_id)["hand"].append(state["deck"].pop())
    for player in state["players"]:
        player["hand"] = sort_cards(player["hand"])
    _event(
        state,
        "deal",
        f"第 {state['round']} 局发牌，每人 7 张，{_player(state, state['leader_id'])['name']} 是首家。",
    )
    _flip_starter(state)
    _event(state, "turn", f"轮到 {_player(state, state['current_player_id'])['name']}。")


def create_game(
    players: list[dict[str, Any]],
    *,
    seed: object = 1,
    game_id: str | None = None,
    rules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalised = _normalise_players(players)
    if rules is not None and not isinstance(rules, dict):
        raise CommandError("invalid_rules", "UNO 规则必须是对象。")
    if rules and bool(rules.get("stack_draw2")):
        raise CommandError("unsupported_rule", "UNO 首版固定不启用 +2 叠加。")
    state: dict[str, Any] = {
        "game_id": game_id or f"uno-{uuid4().hex}",
        "rules_version": RULES_VERSION,
        "created_at_ms": time.time_ns() // 1_000_000,
        "revision": 0,
        "phase": "playing",
        "round": 1,
        "turn_order": [player["id"] for player in normalised],
        "current_player_id": None,
        "leader_id": None,
        "direction": 1,
        "players": normalised,
        "deck": [],
        "discard": [],
        "active_color": None,
        "pending": None,
        "uno_precalled_id": None,
        "uno_catch": None,
        "last_results": None,
        "rounds": [],
        "rules": deepcopy(DEFAULT_RULES),
        "public_events": [],
        "event_seq": 0,
        "rng_state": _create_rng_state(seed),
        "command_log": [],
        "applied_commands": {},
    }
    state["leader_id"] = state["turn_order"][_rng_next(state) % len(state["turn_order"])]
    _event(
        state,
        "start",
        f"UNO 开局：{'、'.join(player['name'] for player in normalised)}。",
    )
    _start_round(state)
    _assert_state(state)
    return state


def play_error(state: dict[str, Any], player: dict[str, Any], card_id: object) -> str | None:
    card = parse_card(card_id)
    if card is None:
        return "不认识这张 UNO 牌。"
    if card_id not in player["hand"]:
        return f"手里没有 {card_label(str(card_id))}。"
    pending = state["pending"]
    if pending and pending["player_id"] == player["id"] and pending["card_id"] != card_id:
        return f"摸牌后只能出刚摸到的 {card_label(pending['card_id'])}，或保留它。"
    if card["kind"] == "wild":
        return None
    if card["kind"] == "wild4":
        has_active_color = any(
            parsed is not None
            and not parsed["wild"]
            and parsed["color"] == state["active_color"]
            for parsed in (parse_card(item) for item in player["hand"])
        )
        return (
            f"手里还有{COLOR_NAMES[str(state['active_color'])]}牌，不能出万能+4。"
            if has_active_color
            else None
        )
    if card["color"] == state["active_color"]:
        return None
    top = parse_card(_top_card(state))
    if top is not None and not top["wild"] and top["value"] == card["value"]:
        return None
    return f"{card_label(str(card_id))} 与当前颜色、顶牌都不匹配。"


def _can_play(state: dict[str, Any], player: dict[str, Any], card_id: str) -> bool:
    return play_error(state, player, card_id) is None


def _finalise_round(state: dict[str, Any], winner: dict[str, Any]) -> None:
    gain = sum(
        sum(int(parse_card(card_id)["points"]) for card_id in player["hand"])
        for player in state["players"]
        if player["id"] != winner["id"]
    )
    winner["score"] += gain
    rows = []
    for player in state["players"]:
        hand_points = sum(int(parse_card(card_id)["points"]) for card_id in player["hand"])
        rows.append(
            {
                "player_id": player["id"],
                "name": player["name"],
                "hand_count": len(player["hand"]),
                "hand_points": hand_points,
                "gain": gain if player["id"] == winner["id"] else 0,
                "score": player["score"],
            }
        )
    result = {
        "round": state["round"],
        "winner_id": winner["id"],
        "gain": gain,
        "players": rows,
    }
    state["last_results"] = result
    state["rounds"].append(deepcopy(result))
    state["phase"] = "round_over"
    state["current_player_id"] = None
    state["pending"] = None
    state["uno_precalled_id"] = None
    state["uno_catch"] = None
    rest = "，".join(
        f"{row['name']} {row['hand_points']} 分"
        for row in rows
        if row["player_id"] != winner["id"]
    )
    _event(
        state,
        "round_over",
        f"{winner['name']} 出完手牌，获得 {gain} 分（{rest}）。",
        winner_id=winner["id"],
        gain=gain,
    )


def _expire_uno_catch_for_action(state: dict[str, Any], actor_id: str) -> None:
    window = state["uno_catch"]
    if window and window["next_player_id"] == actor_id:
        offender = _player(state, window["offender_id"])
        state["uno_catch"] = None
        _event(state, "uno_safe", f"没有人抓 {offender['name']} 漏喊，抓牌窗口结束。")


def _act_call_uno(state: dict[str, Any], player: dict[str, Any]) -> None:
    if state["phase"] != "playing":
        raise CommandError("call_uno_unavailable", "现在不能喊 UNO。")
    window = state["uno_catch"]
    if window and window["offender_id"] == player["id"]:
        state["uno_catch"] = None
        player["uno_called"] = True
        _event(state, "uno", f"UNO！{player['name']} 及时补喊。", player_id=player["id"])
        return
    if state["current_player_id"] != player["id"] or len(player["hand"]) != 2:
        raise CommandError("call_uno_unavailable", "只有轮到自己且准备打到一张牌时才能喊 UNO。")
    _expire_uno_catch_for_action(state, player["id"])
    if state["uno_precalled_id"] == player["id"]:
        raise CommandError("uno_already_called", "已经喊过 UNO 了。")
    state["uno_precalled_id"] = player["id"]
    _event(state, "uno", f"UNO！{player['name']} 喊牌。", player_id=player["id"])


def _act_catch_uno(state: dict[str, Any], player: dict[str, Any]) -> None:
    if state["phase"] != "playing" or not state["uno_catch"]:
        raise CommandError("catch_uno_unavailable", "现在没有可以抓的漏喊。")
    window = state["uno_catch"]
    if window["offender_id"] == player["id"]:
        raise CommandError("cannot_catch_self", "不能抓自己漏喊 UNO。")
    offender = _player(state, window["offender_id"])
    drawn = _draw_cards(state, offender, 2)
    offender["uno_called"] = False
    state["uno_catch"] = None
    _event(
        state,
        "catch_uno",
        f"{player['name']} 抓到 {offender['name']} 漏喊 UNO，{offender['name']} 摸 {len(drawn)} 张。",
        player_id=player["id"],
        offender_id=offender["id"],
        count=len(drawn),
    )


def _act_play(state: dict[str, Any], player: dict[str, Any], command: dict[str, Any]) -> None:
    if state["phase"] != "playing":
        raise CommandError("play_unavailable", "现在不能出牌。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家。")
    _expire_uno_catch_for_action(state, player["id"])
    card_id = command.get("card_id")
    error = play_error(state, player, card_id)
    if error:
        raise CommandError("illegal_play", error)
    card = parse_card(card_id)
    assert card is not None and isinstance(card_id, str)
    color = command.get("color")
    if card["wild"] and color not in COLORS:
        raise CommandError("missing_color", "出万能牌时必须选择红、绿、蓝或黄。")
    state["pending"] = None
    called_uno = state["uno_precalled_id"] == player["id"]
    if called_uno:
        state["uno_precalled_id"] = None
    player["hand"].remove(card_id)
    player["uno_called"] = False
    state["discard"].append(card_id)
    state["active_color"] = color if card["wild"] else card["color"]
    text = f"{player['name']} 出 {card_label(card_id)}"
    if card["wild"]:
        text += f"，指定{COLOR_NAMES[str(color)]}色"
    _event(state, "play", f"{text}。", player_id=player["id"], card_id=card_id)
    _resolve_effect(state, player["id"], card_id)
    if not player["hand"]:
        _finalise_round(state, player)
        return
    if len(player["hand"]) == 1:
        if called_uno:
            player["uno_called"] = True
            _event(
                state,
                "uno",
                f"UNO！{player['name']} 只剩一张牌。",
                player_id=player["id"],
            )
        else:
            state["uno_catch"] = {
                "offender_id": player["id"],
                "next_player_id": state["current_player_id"],
            }
            _event(
                state,
                "uno_missed",
                f"{player['name']} 只剩一张牌，但还没喊 UNO！",
                player_id=player["id"],
            )
    _event(state, "turn", f"轮到 {_player(state, state['current_player_id'])['name']}。")


def _act_draw(state: dict[str, Any], player: dict[str, Any]) -> None:
    if state["phase"] != "playing":
        raise CommandError("draw_unavailable", "现在不能摸牌。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家。")
    _expire_uno_catch_for_action(state, player["id"])
    if state["uno_precalled_id"] == player["id"]:
        state["uno_precalled_id"] = None
    if state["pending"]:
        raise CommandError("pending_draw", "刚摸到的牌还没有处理。")
    drawn = _draw_cards(state, player, 1)
    if not drawn:
        state["current_player_id"] = _seat_at(state, player["id"], 1)
        _event(state, "draw", f"{player['name']} 无牌可摸，只能结束回合。")
        _event(state, "turn", f"轮到 {_player(state, state['current_player_id'])['name']}。")
        return
    card_id = drawn[0]
    _event(state, "draw", f"{player['name']} 摸了一张。", player_id=player["id"])
    if _can_play(state, player, card_id):
        state["pending"] = {"player_id": player["id"], "card_id": card_id}
        _event(state, "pending", f"{player['name']} 摸到的牌可以出，也可以保留。")
        return
    state["current_player_id"] = _seat_at(state, player["id"], 1)
    _event(
        state,
        "turn",
        f"摸到的牌不能出，轮到 {_player(state, state['current_player_id'])['name']}。",
    )


def _act_keep(state: dict[str, Any], player: dict[str, Any]) -> None:
    pending = state["pending"]
    if state["phase"] != "playing" or not pending or pending["player_id"] != player["id"]:
        raise CommandError("keep_unavailable", "现在没有刚摸到的牌需要保留。")
    state["pending"] = None
    if state["uno_precalled_id"] == player["id"]:
        state["uno_precalled_id"] = None
    state["current_player_id"] = _seat_at(state, player["id"], 1)
    _event(state, "keep", f"{player['name']} 保留刚摸到的牌。", player_id=player["id"])
    _event(state, "turn", f"轮到 {_player(state, state['current_player_id'])['name']}。")


def _act_next_round(state: dict[str, Any]) -> None:
    if state["phase"] != "round_over":
        raise CommandError("next_round_unavailable", "这一局还没有结束。")
    leader_index = state["turn_order"].index(state["leader_id"])
    state["leader_id"] = state["turn_order"][(leader_index + 1) % len(state["turn_order"])]
    state["round"] += 1
    _start_round(state)


def _canonical_command(command: dict[str, Any]) -> str:
    return json.dumps(command, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def apply_command(
    source_state: dict[str, Any], command: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(command, dict):
        raise CommandError("invalid_command", "UNO 动作必须是对象。")
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
    player = _player(state, actor_id)
    action = command.get("action")
    if action == "play":
        _act_play(state, player, command)
    elif action == "draw":
        _act_draw(state, player)
    elif action == "keep":
        _act_keep(state, player)
    elif action == "call_uno":
        _act_call_uno(state, player)
    elif action == "catch_uno":
        _act_catch_uno(state, player)
    elif action == "next_round":
        _act_next_round(state)
    else:
        raise CommandError("unknown_action", "不支持这个 UNO 动作。")
    state["revision"] += 1
    stored = deepcopy(command)
    stored["occurred_at_ms"] = time.time_ns() // 1_000_000
    state["command_log"].append(stored)
    state["applied_commands"][command_id] = {
        "canonical": _canonical_command(command),
        "revision": state["revision"],
    }
    _assert_state(state)
    return state, {"duplicate": False, "revision": state["revision"]}


def _play_move(card_id: str, color: str | None = None) -> dict[str, Any]:
    move: dict[str, Any] = {
        "action": "play",
        "card_id": card_id,
        "label": card_label(card_id),
    }
    if color is not None:
        move["color"] = color
        move["label"] = f"{card_label(card_id)}变{COLOR_NAMES[color]}"
    return move


def legal_moves(state: dict[str, Any], player_id: str) -> list[dict[str, Any]]:
    try:
        player = _player(state, player_id)
    except CommandError:
        return []
    if state["phase"] == "round_over":
        return [{"action": "next_round", "label": "开下一局"}]
    if state["phase"] != "playing":
        return []
    candidates: list[dict[str, Any]] = []
    window = state["uno_catch"]
    if window:
        if window["offender_id"] == player_id:
            candidates.append({"action": "call_uno", "label": "喊 UNO"})
        else:
            offender = _player(state, window["offender_id"])
            candidates.append(
                {
                    "action": "catch_uno",
                    "offender_id": offender["id"],
                    "label": f"抓 {offender['name']} 漏喊",
                }
            )
    if state["current_player_id"] != player_id:
        return candidates
    if len(player["hand"]) == 2 and state["uno_precalled_id"] != player_id:
        candidates.append({"action": "call_uno", "label": "喊 UNO"})
    pending = state["pending"]
    card_ids = [pending["card_id"]] if pending and pending["player_id"] == player_id else player["hand"]
    for card_id in sort_cards(card_ids):
        if not _can_play(state, player, card_id):
            continue
        card = parse_card(card_id)
        assert card is not None
        if card["wild"]:
            candidates.extend(_play_move(card_id, color) for color in COLORS)
        else:
            candidates.append(_play_move(card_id))
    if pending and pending["player_id"] == player_id:
        candidates.append({"action": "keep", "label": "保留并结束回合"})
    else:
        candidates.append({"action": "draw", "label": "摸一张"})
    return candidates


def _public_card(card_id: str) -> dict[str, Any]:
    card = parse_card(card_id)
    assert card is not None
    return {**card, "label": card_label(card_id)}


def project_view(state: dict[str, Any], viewer_id: str | None) -> dict[str, Any]:
    if viewer_id is not None:
        _player(state, viewer_id)
    players = []
    for player in state["players"]:
        public = {
            "id": player["id"],
            "name": player["name"],
            "seat": player["seat"],
            "controller_type": player["controller_type"],
            "accent": player["accent"],
            "score": player["score"],
            "hand_count": len(player["hand"]),
            "uno": len(player["hand"]) == 1 and bool(player["uno_called"]),
            "uno_missed": bool(
                state["uno_catch"] and state["uno_catch"]["offender_id"] == player["id"]
            ),
        }
        if player["id"] == viewer_id:
            public["hand"] = [_public_card(card_id) for card_id in player["hand"]]
        players.append(public)
    moves = legal_moves(state, viewer_id) if viewer_id is not None else []
    pending = state["pending"]
    top = _top_card(state)
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "status": "active",
        "phase": state["phase"],
        "round": state["round"],
        "viewer_id": viewer_id,
        "current_player_id": state["current_player_id"],
        "leader_id": state["leader_id"],
        "direction": state["direction"],
        "direction_label": "顺时针" if state["direction"] > 0 else "逆时针",
        "players": players,
        "top_card": _public_card(top) if top else None,
        "active_color": state["active_color"],
        "active_color_name": COLOR_NAMES.get(state["active_color"]),
        "deck_count": len(state["deck"]),
        "discard_count": len(state["discard"]),
        "pending": (
            {
                "player_id": pending["player_id"],
                "mine": pending["player_id"] == viewer_id,
                "card_id": pending["card_id"] if pending["player_id"] == viewer_id else None,
            }
            if pending
            else None
        ),
        "uno_catch": (
            {
                "offender_id": state["uno_catch"]["offender_id"],
                "offender_name": _player(state, state["uno_catch"]["offender_id"])["name"],
                "next_player_id": state["uno_catch"]["next_player_id"],
            }
            if state["uno_catch"]
            else None
        ),
        "last_results": deepcopy(state["last_results"]),
        "rounds": deepcopy(state["rounds"]),
        "rules": deepcopy(state["rules"]),
        "legal_actions": list(dict.fromkeys(str(move["action"]) for move in moves)),
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
    cards = [card_id for player in state["players"] for card_id in player["hand"]]
    cards.extend(state["deck"])
    cards.extend(state["discard"])
    if len(cards) != 108 or len(set(cards)) != 108 or set(cards) != CARD_SET:
        raise AssertionError("UNO card conservation violated")
    if state["phase"] == "playing" and state["current_player_id"] is None:
        raise AssertionError("UNO playing phase needs a current player")
    if state["phase"] == "round_over" and state["current_player_id"] is not None:
        raise AssertionError("UNO round over must not have a current player")
    if state["active_color"] not in COLORS:
        raise AssertionError("UNO active color is invalid")
    if any(player["uno_called"] and len(player["hand"]) != 1 for player in state["players"]):
        raise AssertionError("UNO call marker needs exactly one card")
    if state["uno_precalled_id"] is not None:
        caller = _player(state, state["uno_precalled_id"])
        if state["current_player_id"] != caller["id"] or len(caller["hand"]) != 2:
            raise AssertionError("UNO precall must belong to the current two-card player")
    if state["uno_catch"] is not None:
        offender = _player(state, state["uno_catch"]["offender_id"])
        _player(state, state["uno_catch"]["next_player_id"])
        if len(offender["hand"]) != 1 or offender["uno_called"]:
            raise AssertionError("UNO catch window needs one uncalled card")
        if state["current_player_id"] != state["uno_catch"]["next_player_id"]:
            raise AssertionError("UNO catch window must close before the next player changes")
    if len(state["command_log"]) != state["revision"]:
        raise AssertionError("UNO revision must match command count")
    if len(state["applied_commands"]) != state["revision"]:
        raise AssertionError("UNO revisions must each have an idempotency record")
