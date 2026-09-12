"""Doorbell Commons standalone Dou Dizhu rules engine.

Adapted from 29-Cu/bisca's CC BY 4.0 Dou Dizhu engine. See
games/doudizhu/THIRD_PARTY_NOTICES.md for attribution and modifications.
"""

from __future__ import annotations

from copy import deepcopy
from itertools import combinations
import json
import time
from typing import Any
from uuid import uuid4


RULES_VERSION = "doorbell.bisca.doudizhu.v1"
SUITS = ("S", "H", "D", "C")
SUIT_SYMBOLS = {"S": "♠", "H": "♥", "D": "♦", "C": "♣"}
SUIT_ORDER = {"S": 0, "H": 1, "D": 2, "C": 3, "X": 4}
RANK_SYMBOLS = {11: "J", 12: "Q", 13: "K", 14: "A", 15: "2"}
JOKER_SMALL = 16
JOKER_BIG = 17
MAX_RUN_RANK = 14
ALL_CARDS = tuple(
    [f"{suit}{rank}" for suit in SUITS for rank in range(3, 16)] + ["X1", "X2"]
)
DEFAULT_RULES = {"allow_four_two": True}
TYPE_LABELS = {
    "single": "单张",
    "pair": "对子",
    "triple": "三条",
    "triple_one": "三带一",
    "triple_pair": "三带对",
    "straight": "顺子",
    "pair_straight": "连对",
    "plane": "飞机",
    "plane_one": "飞机带单",
    "plane_pair": "飞机带对",
    "four_two_single": "四带二",
    "four_two_pair": "四带两对",
    "bomb": "炸弹",
    "rocket": "王炸",
}
TYPE_ORDER = tuple(TYPE_LABELS)


class CommandError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


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


def _random_index(state: dict[str, Any], size: int) -> int:
    return _rng_next(state) % size


def _shuffle(state: dict[str, Any], cards: tuple[str, ...]) -> list[str]:
    shuffled = list(cards)
    for index in range(len(shuffled) - 1, 0, -1):
        swap = _random_index(state, index + 1)
        shuffled[index], shuffled[swap] = shuffled[swap], shuffled[index]
    return shuffled


def parse_card(card_id: object) -> dict[str, Any] | None:
    if not isinstance(card_id, str) or len(card_id) < 2:
        return None
    suit = card_id[0]
    if suit == "X":
        if card_id == "X1":
            return {"id": card_id, "suit": "X", "rank": JOKER_SMALL, "joker": True}
        if card_id == "X2":
            return {"id": card_id, "suit": "X", "rank": JOKER_BIG, "joker": True}
        return None
    if suit not in SUITS:
        return None
    try:
        rank = int(card_id[1:])
    except ValueError:
        return None
    if not 3 <= rank <= 15:
        return None
    return {"id": card_id, "suit": suit, "rank": rank, "joker": False}


def card_label(card_id: str) -> str:
    card = parse_card(card_id)
    if card is None:
        return str(card_id)
    if card["joker"]:
        return "小王" if card_id == "X1" else "大王"
    return f"{SUIT_SYMBOLS[card['suit']]}{RANK_SYMBOLS.get(card['rank'], card['rank'])}"


def cards_label(card_ids: list[str]) -> str:
    return "".join(card_label(card_id) for card_id in card_ids)


def _card_sort_key(card_id: str) -> tuple[int, int, str]:
    card = parse_card(card_id)
    if card is None:
        return (-1, -1, str(card_id))
    return (int(card["rank"]), SUIT_ORDER[str(card["suit"])], str(card["id"]))


def sort_cards(card_ids: list[str]) -> list[str]:
    return sorted(card_ids, key=_card_sort_key)


def _normalise_rules(rules: dict[str, Any] | None) -> dict[str, bool]:
    source = rules or {}
    return {
        key: bool(source[key]) if key in source else bool(default)
        for key, default in DEFAULT_RULES.items()
    }


def _combo(type_name: str, cards: list[str], main_rank: int, length: int = 1) -> dict[str, Any]:
    ordered = sort_cards(cards)
    return {
        "type": type_name,
        "size": len(ordered),
        "main_rank": main_rank,
        "length": length,
        "cards": ordered,
        "label": TYPE_LABELS[type_name],
    }


def combo_candidates(
    card_ids: list[str], rules: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    resolved_rules = _normalise_rules(rules)
    if not isinstance(card_ids, list) or not card_ids:
        return []
    if len(set(card_ids)) != len(card_ids):
        return []
    parsed = [parse_card(card_id) for card_id in card_ids]
    if any(card is None for card in parsed):
        return []
    cards = [card for card in parsed if card is not None]
    count: dict[int, int] = {}
    for card in cards:
        rank = int(card["rank"])
        count[rank] = count.get(rank, 0) + 1
    size = len(cards)
    result: list[dict[str, Any]] = []

    if size == 2 and count.get(JOKER_SMALL) == 1 and count.get(JOKER_BIG) == 1:
        result.append(_combo("rocket", card_ids, JOKER_BIG))

    if len(count) == 1:
        rank = int(cards[0]["rank"])
        type_name = {1: "single", 2: "pair", 3: "triple", 4: "bomb"}.get(size)
        if type_name:
            result.append(_combo(type_name, card_ids, rank))

    if size in {4, 5}:
        for rank, amount in count.items():
            if amount != 3:
                continue
            if size == 4 and len(count) == 2:
                result.append(_combo("triple_one", card_ids, rank))
            if size == 5 and len(count) == 2:
                other = next((value for other_rank, value in count.items() if other_rank != rank), 0)
                if other == 2:
                    result.append(_combo("triple_pair", card_ids, rank))

    ranks = sorted(count)
    if (
        size >= 5
        and len(ranks) == size
        and ranks[-1] <= MAX_RUN_RANK
        and ranks[-1] - ranks[0] == size - 1
    ):
        result.append(_combo("straight", card_ids, ranks[-1], size))

    if size >= 6 and size % 2 == 0:
        pair_count = size // 2
        if (
            len(ranks) == pair_count
            and all(count[rank] == 2 for rank in ranks)
            and ranks[-1] <= MAX_RUN_RANK
            and ranks[-1] - ranks[0] == pair_count - 1
        ):
            result.append(_combo("pair_straight", card_ids, ranks[-1], pair_count))

    triple_ranks = sorted(
        rank for rank, amount in count.items() if amount >= 3 and rank <= MAX_RUN_RANK
    )
    for start in range(len(triple_ranks)):
        for end in range(start + 1, len(triple_ranks)):
            if triple_ranks[end] != triple_ranks[end - 1] + 1:
                break
            run = triple_ranks[start : end + 1]
            run_set = set(run)
            groups = len(run)
            remainder: list[tuple[int, int]] = []
            remainder_total = 0
            for rank, amount in count.items():
                left = amount - (3 if rank in run_set else 0)
                if left > 0:
                    remainder.append((rank, left))
                    remainder_total += left
            main_rank = run[-1]
            if size == 3 * groups and remainder_total == 0:
                result.append(_combo("plane", card_ids, main_rank, groups))
            if (
                size == 4 * groups
                and remainder_total == groups
                and all(rank not in run_set and amount <= 2 for rank, amount in remainder)
            ):
                result.append(_combo("plane_one", card_ids, main_rank, groups))
            if (
                size == 5 * groups
                and remainder_total == 2 * groups
                and len(remainder) == groups
                and all(rank not in run_set and amount == 2 for rank, amount in remainder)
            ):
                result.append(_combo("plane_pair", card_ids, main_rank, groups))

    if resolved_rules["allow_four_two"]:
        for rank, amount in count.items():
            if amount != 4:
                continue
            rest = [(other_rank, value) for other_rank, value in count.items() if other_rank != rank]
            if size == 6:
                result.append(_combo("four_two_single", card_ids, rank))
            if size == 8 and len(rest) == 2 and all(value == 2 for _, value in rest):
                result.append(_combo("four_two_pair", card_ids, rank))
    return result


def combo_of(
    card_ids: list[str],
    rules: dict[str, Any] | None = None,
    *,
    as_type: str | None = None,
) -> dict[str, Any] | None:
    candidates = combo_candidates(card_ids, rules)
    if as_type is not None:
        return next((combo for combo in candidates if combo["type"] == as_type), None)
    return candidates[0] if candidates else None


def beats(
    challenger: dict[str, Any] | list[str],
    field: dict[str, Any] | list[str] | None,
    rules: dict[str, Any] | None = None,
) -> bool:
    challenger_combo = (
        combo_of(challenger, rules) if isinstance(challenger, list) else challenger
    )
    if challenger_combo is None:
        return False
    field_combo = combo_of(field, rules) if isinstance(field, list) else field
    if field_combo is None:
        return True
    if challenger_combo["type"] == "rocket":
        return True
    if field_combo["type"] == "rocket":
        return False
    if challenger_combo["type"] == "bomb" and field_combo["type"] != "bomb":
        return True
    if field_combo["type"] == "bomb" and challenger_combo["type"] != "bomb":
        return False
    return bool(
        challenger_combo["type"] == field_combo["type"]
        and challenger_combo["size"] == field_combo["size"]
        and challenger_combo["main_rank"] > field_combo["main_rank"]
    )


def enumerate_combos(
    hand: list[str],
    rules: dict[str, Any] | None = None,
    field: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    resolved_rules = _normalise_rules(rules)
    if field and field["type"] == "rocket":
        return []
    by_rank: dict[int, list[str]] = {}
    for card_id in sort_cards(hand):
        card = parse_card(card_id)
        if card is not None:
            by_rank.setdefault(int(card["rank"]), []).append(card_id)
    ranks = sorted(by_rank)
    result: list[dict[str, Any]] = []
    seen: set[str] = set()

    def count(rank: int) -> int:
        return len(by_rank.get(rank, []))

    def canonical(rank: int, amount: int) -> list[str]:
        return by_rank[rank][:amount]

    def needed(type_name: str, size: int) -> bool:
        return field is None or (field["type"] == type_name and field["size"] == size)

    def add(type_name: str, cards: list[str], main_rank: int, length: int = 1) -> None:
        if (
            field
            and field["type"] == type_name
            and field["size"] == len(cards)
            and main_rank <= field["main_rank"]
        ):
            return
        combo = _combo(type_name, cards, main_rank, length)
        key = f"{type_name}|{','.join(combo['cards'])}"
        if key not in seen:
            seen.add(key)
            result.append(combo)

    for rank in ranks:
        if needed("single", 1):
            add("single", canonical(rank, 1), rank)
        if count(rank) >= 2 and needed("pair", 2):
            add("pair", canonical(rank, 2), rank)
        if count(rank) >= 3 and needed("triple", 3):
            add("triple", canonical(rank, 3), rank)
        if count(rank) >= 4:
            add("bomb", canonical(rank, 4), rank)
    if JOKER_SMALL in by_rank and JOKER_BIG in by_rank:
        add("rocket", ["X1", "X2"], JOKER_BIG)

    for triple_rank in ranks:
        if count(triple_rank) < 3:
            continue
        for rank in ranks:
            if rank == triple_rank:
                continue
            if needed("triple_one", 4):
                add(
                    "triple_one",
                    canonical(triple_rank, 3) + canonical(rank, 1),
                    triple_rank,
                )
            if count(rank) >= 2 and needed("triple_pair", 5):
                add(
                    "triple_pair",
                    canonical(triple_rank, 3) + canonical(rank, 2),
                    triple_rank,
                )

    for length in range(5, 13):
        if not needed("straight", length):
            continue
        for low in range(3, MAX_RUN_RANK - length + 2):
            run = list(range(low, low + length))
            if all(rank in by_rank for rank in run):
                add("straight", [canonical(rank, 1)[0] for rank in run], run[-1], length)

    for length in range(3, 11):
        if not needed("pair_straight", length * 2):
            continue
        for low in range(3, MAX_RUN_RANK - length + 2):
            run = list(range(low, low + length))
            if all(count(rank) >= 2 for rank in run):
                cards = [card for rank in run for card in canonical(rank, 2)]
                add("pair_straight", cards, run[-1], length)

    for groups in range(2, 7):
        for low in range(3, MAX_RUN_RANK - groups + 2):
            run = list(range(low, low + groups))
            if not all(count(rank) >= 3 for rank in run):
                continue
            body = [card for rank in run for card in canonical(rank, 3)]
            run_set = set(run)
            main_rank = run[-1]
            if needed("plane", 3 * groups):
                add("plane", body, main_rank, groups)
            if needed("plane_one", 4 * groups):
                pool = [rank for rank in ranks if rank not in run_set]
                for wings in combinations(pool, groups):
                    add(
                        "plane_one",
                        body + [canonical(rank, 1)[0] for rank in wings],
                        main_rank,
                        groups,
                    )
            if needed("plane_pair", 5 * groups):
                pool = [rank for rank in ranks if rank not in run_set and count(rank) >= 2]
                for wings in combinations(pool, groups):
                    cards = body + [card for rank in wings for card in canonical(rank, 2)]
                    add("plane_pair", cards, main_rank, groups)

    if resolved_rules["allow_four_two"]:
        for four_rank in ranks:
            if count(four_rank) < 4:
                continue
            body = canonical(four_rank, 4)
            pool = [rank for rank in ranks if rank != four_rank]
            if needed("four_two_single", 6):
                for wings in combinations(pool, 2):
                    add(
                        "four_two_single",
                        body + [canonical(rank, 1)[0] for rank in wings],
                        four_rank,
                    )
                for rank in pool:
                    if count(rank) >= 2:
                        add("four_two_single", body + canonical(rank, 2), four_rank)
            if needed("four_two_pair", 8):
                pair_pool = [rank for rank in pool if count(rank) >= 2]
                for wings in combinations(pair_pool, 2):
                    add(
                        "four_two_pair",
                        body + [card for rank in wings for card in canonical(rank, 2)],
                        four_rank,
                    )

    result.sort(
        key=lambda combo: (
            TYPE_ORDER.index(combo["type"]),
            combo["size"],
            combo["main_rank"],
            ",".join(combo["cards"]),
        )
    )
    return result


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    player = next((item for item in state["players"] if item["id"] == player_id), None)
    if player is None:
        raise CommandError("player_not_found", "没有这名斗地主玩家。")
    return player


def _next_seat(state: dict[str, Any], player_id: str) -> str:
    order = state["turn_order"]
    index = order.index(player_id) if player_id in order else 0
    return str(order[(index + 1) % len(order)])


def _event(state: dict[str, Any], type_name: str, text: str, **extra: Any) -> None:
    event = {
        "seq": len(state["public_events"]) + 1,
        "revision": state["revision"],
        "type": type_name,
        "text": text,
        **deepcopy(extra),
    }
    state["public_events"].append(event)


def _deal_round(state: dict[str, Any]) -> None:
    deck = _shuffle(state, ALL_CARDS)
    for player in state["players"]:
        player["hand"] = []
    start = state["turn_order"].index(state["bid_starter"])
    for index in range(51):
        player_id = state["turn_order"][(start + index) % 3]
        _player(state, player_id)["hand"].append(deck[index])
    for player in state["players"]:
        player["hand"] = sort_cards(player["hand"])
    state["bottom"] = sort_cards(deck[51:])
    state["bottom_dealt"] = False


def _start_round(state: dict[str, Any]) -> None:
    state.update(
        {
            "phase": "bidding",
            "field": None,
            "last_to_play": None,
            "leader_id": None,
            "pass_streak": 0,
            "pile": [],
            "bombs": 0,
            "base": None,
            "landlord_id": None,
            "spring": False,
            "anti_spring": False,
            "round_winner": None,
            "last_results": None,
            "bids": [],
            "high_bid": None,
        }
    )
    for player in state["players"]:
        player.update(
            {
                "hand": [],
                "bid": None,
                "is_landlord": False,
                "played_count": 0,
                "passed": False,
            }
        )
    if state["bid_starter"] is None:
        state["bid_starter"] = state["turn_order"][_random_index(state, 3)]
    state["current_player_id"] = state["bid_starter"]
    _deal_round(state)
    _event(state, "deal", f"第 {state['round']} 局发牌完毕，每人 17 张，另留 3 张底牌。")


def create_game(
    players: list[dict[str, Any]],
    *,
    seed: object = 1,
    game_id: str | None = None,
    rules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(players, list) or len(players) != 3:
        raise CommandError("invalid_player_count", "斗地主必须恰好三名玩家。")
    ids: set[str] = set()
    prepared: list[dict[str, Any]] = []
    accents = ("coral", "sky", "gold")
    for seat, source in enumerate(players):
        if not isinstance(source, dict):
            raise CommandError("invalid_player", "每名斗地主玩家都必须是对象。")
        player_id = str(source.get("id", f"player-{seat + 1}")).strip()
        if not player_id or player_id in ids:
            raise CommandError("invalid_player_id", "斗地主玩家 ID 不能为空或重复。")
        controller_type = str(source.get("controller_type", "human")).strip()
        if controller_type not in {"human", "resident"}:
            raise CommandError(
                "invalid_controller_type", "座位控制类型只能是 human 或 resident。"
            )
        ids.add(player_id)
        prepared.append(
            {
                "id": player_id,
                "name": str(source.get("name", f"玩家{seat + 1}")),
                "seat": seat,
                "controller_type": controller_type,
                "accent": str(source.get("accent", accents[seat])),
                "hand": [],
                "bid": None,
                "is_landlord": False,
                "played_count": 0,
                "passed": False,
                "score": 0,
            }
        )
    state: dict[str, Any] = {
        "game_id": game_id or f"ddz-{uuid4()}",
        "rules_version": RULES_VERSION,
        "rules": _normalise_rules(rules),
        "created_at_ms": time.time_ns() // 1_000_000,
        "revision": 0,
        "phase": "bidding",
        "round": 1,
        "turn_order": [player["id"] for player in prepared],
        "current_player_id": None,
        "leader_id": None,
        "players": prepared,
        "field": None,
        "last_to_play": None,
        "pass_streak": 0,
        "bottom": [],
        "bottom_dealt": False,
        "landlord_id": None,
        "bid_starter": None,
        "bids": [],
        "high_bid": None,
        "base": None,
        "bombs": 0,
        "spring": False,
        "anti_spring": False,
        "pile": [],
        "round_winner": None,
        "last_results": None,
        "rounds": [],
        "winner_id": None,
        "rng_state": _create_rng_state(seed),
        "public_events": [],
        "command_log": [],
        "applied_commands": {},
    }
    _event(state, "start", "斗地主开局，三名玩家已经入座。")
    _start_round(state)
    _assert_state(state)
    return state


def _set_landlord(state: dict[str, Any], player: dict[str, Any]) -> None:
    state["landlord_id"] = player["id"]
    player["is_landlord"] = True
    state["base"] = int(state["high_bid"]["value"] if state["high_bid"] else player["bid"] or 1)
    player["hand"] = sort_cards(player["hand"] + state["bottom"])
    state["bottom_dealt"] = True
    state["phase"] = "playing"
    state["leader_id"] = player["id"]
    state["current_player_id"] = player["id"]
    state["field"] = None
    state["last_to_play"] = None
    state["pass_streak"] = 0
    _event(
        state,
        "landlord",
        f"{player['name']} 以 {state['base']} 分成为地主。",
        player_id=player["id"],
        base=state["base"],
        bottom_cards=state["bottom"],
    )


def _redeal(state: dict[str, Any]) -> None:
    _event(state, "redeal", "三家都不叫，重新发牌。")
    state["bid_starter"] = _next_seat(state, state["bid_starter"])
    state["bids"] = []
    state["high_bid"] = None
    for player in state["players"]:
        player["bid"] = None
    state["current_player_id"] = state["bid_starter"]
    _deal_round(state)


def _act_bid(state: dict[str, Any], player: dict[str, Any], command: dict[str, Any]) -> None:
    if state["phase"] != "bidding":
        raise CommandError("bid_unavailable", "现在不是叫分阶段。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家叫分。")
    value = command.get("value")
    if not isinstance(value, int) or not 0 <= value <= 3:
        raise CommandError("invalid_bid", "叫分只能是 0、1、2 或 3。")
    if value > 0 and state["high_bid"] and value <= state["high_bid"]["value"]:
        raise CommandError("bid_not_higher", "新的叫分必须高于当前最高分。")
    player["bid"] = value
    state["bids"].append({"player_id": player["id"], "value": value})
    _event(
        state,
        "bid",
        f"{player['name']} {'不叫' if value == 0 else f'叫 {value} 分'}。",
        player_id=player["id"],
        value=value,
    )
    if value > 0 and (not state["high_bid"] or value > state["high_bid"]["value"]):
        state["high_bid"] = {"player_id": player["id"], "value": value}
    if value == 3:
        _set_landlord(state, player)
        return
    if len(state["bids"]) >= 3:
        if state["high_bid"] is None:
            _redeal(state)
        else:
            _set_landlord(state, _player(state, state["high_bid"]["player_id"]))
        return
    state["current_player_id"] = _next_seat(state, player["id"])


def _follow_error(state: dict[str, Any], combo: dict[str, Any]) -> str | None:
    field = state["field"]["combo"]
    if combo["type"] == "rocket":
        return None
    if field["type"] == "rocket":
        return "王炸谁也压不住。"
    if combo["type"] == "bomb" and field["type"] != "bomb":
        return None
    if field["type"] == "bomb" and combo["type"] != "bomb":
        return "场上是炸弹，只能用更大的炸弹或王炸。"
    if combo["type"] != field["type"] or combo["size"] != field["size"]:
        return "跟牌必须同牌型、同张数，或者使用炸弹／王炸。"
    if combo["main_rank"] <= field["main_rank"]:
        return "这手牌压不过场上的牌。"
    return None


def _finalize_round(state: dict[str, Any], winner: dict[str, Any]) -> None:
    landlord = _player(state, state["landlord_id"])
    landlord_won = winner["id"] == state["landlord_id"]
    farmers = [player for player in state["players"] if not player["is_landlord"]]
    state["spring"] = landlord_won and all(player["played_count"] == 0 for player in farmers)
    state["anti_spring"] = not landlord_won and landlord["played_count"] == 1
    multiplier = (2 ** state["bombs"]) * (2 if state["spring"] or state["anti_spring"] else 1)
    base = int(state["base"] or 1)
    results = []
    for player in state["players"]:
        unit = 2 if player["is_landlord"] else 1
        delta = (1 if landlord_won == player["is_landlord"] else -1) * unit * base * multiplier
        player["score"] += delta
        results.append(
            {
                "player_id": player["id"],
                "name": player["name"],
                "is_landlord": player["is_landlord"],
                "delta": delta,
                "score": player["score"],
            }
        )
    state["round_winner"] = "landlord" if landlord_won else "farmer"
    state["last_results"] = results
    state["rounds"].append(
        {
            "round": state["round"],
            "landlord_id": state["landlord_id"],
            "base": base,
            "bombs": state["bombs"],
            "multiplier": multiplier,
            "spring": state["spring"],
            "anti_spring": state["anti_spring"],
            "winner": state["round_winner"],
            "results": deepcopy(results),
        }
    )
    state["phase"] = "round_over"
    state["current_player_id"] = None
    _event(
        state,
        "round_over",
        f"第 {state['round']} 局结束，{'地主' if landlord_won else '农民'}获胜。",
        winner=state["round_winner"],
        spring=state["spring"],
        anti_spring=state["anti_spring"],
        base=base,
        multiplier=multiplier,
        results=results,
    )


def _act_play(state: dict[str, Any], player: dict[str, Any], command: dict[str, Any]) -> None:
    if state["phase"] != "playing":
        raise CommandError("play_unavailable", "现在不是出牌阶段。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家出牌。")
    card_ids = command.get("card_ids")
    if not isinstance(card_ids, list) or not card_ids:
        raise CommandError("empty_play", "至少要出一张牌。")
    selected = [str(card_id) for card_id in card_ids]
    if len(set(selected)) != len(selected):
        raise CommandError("duplicate_card", "同一张牌不能重复选择。")
    if any(card_id not in player["hand"] for card_id in selected):
        raise CommandError("card_not_in_hand", "所选牌中包含不在当前手牌里的牌。")
    candidates = combo_candidates(selected, state["rules"])
    if command.get("as"):
        candidates = [combo for combo in candidates if combo["type"] == command["as"]]
    if not candidates:
        raise CommandError("invalid_combo", "这不是合法的斗地主牌型。")
    combo = candidates[0]
    if state["field"] is not None:
        combo = next(
            (candidate for candidate in candidates if _follow_error(state, candidate) is None),
            None,
        )
        if combo is None:
            raise CommandError("cannot_beat", _follow_error(state, candidates[0]) or "压不过。")
    player["hand"] = [card_id for card_id in player["hand"] if card_id not in selected]
    player["played_count"] += 1
    player["passed"] = False
    state["pile"].extend(combo["cards"])
    state["field"] = {
        "cards": list(combo["cards"]),
        "by": player["id"],
        "combo": deepcopy(combo),
    }
    state["last_to_play"] = player["id"]
    state["pass_streak"] = 0
    _event(
        state,
        "play",
        f"{player['name']} 出 {cards_label(combo['cards'])}（{combo['label']}）。",
        player_id=player["id"],
        cards=combo["cards"],
        combo=combo,
    )
    if combo["type"] in {"bomb", "rocket"}:
        state["bombs"] += 1
        _event(
            state,
            "bomb",
            f"{'王炸' if combo['type'] == 'rocket' else '炸弹'}，倍数翻到 {2 ** state['bombs']}。",
            bombs=state["bombs"],
            multiplier=2 ** state["bombs"],
        )
    if not player["hand"]:
        _finalize_round(state, player)
        return
    state["current_player_id"] = _next_seat(state, player["id"])


def _act_pass(state: dict[str, Any], player: dict[str, Any]) -> None:
    if state["phase"] != "playing":
        raise CommandError("pass_unavailable", "现在不是出牌阶段。")
    if state["current_player_id"] != player["id"]:
        raise CommandError("not_your_turn", "还没轮到这名玩家。")
    if state["field"] is None:
        raise CommandError("leader_must_play", "领出者不能过牌。")
    player["passed"] = True
    state["pass_streak"] += 1
    _event(state, "pass", f"{player['name']} 选择不出。", player_id=player["id"])
    if state["pass_streak"] >= 2:
        owner_id = state["last_to_play"]
        state["field"] = None
        state["pass_streak"] = 0
        for item in state["players"]:
            item["passed"] = False
        state["leader_id"] = owner_id
        state["current_player_id"] = owner_id
        _event(state, "clear", f"其余两家都不出，{_player(state, owner_id)['name']} 重新领出。")
        return
    state["current_player_id"] = _next_seat(state, player["id"])


def _act_next_round(state: dict[str, Any]) -> None:
    if state["phase"] != "round_over":
        raise CommandError("next_round_unavailable", "这一局还没有结束。")
    state["bid_starter"] = (
        state["landlord_id"]
        if state["round_winner"] == "landlord"
        else _next_seat(state, state["landlord_id"])
    )
    state["round"] += 1
    _start_round(state)


def _act_end_match(state: dict[str, Any]) -> None:
    board = sorted(
        state["players"],
        key=lambda player: (-player["score"], state["turn_order"].index(player["id"])),
    )
    state["winner_id"] = board[0]["id"] if board else None
    state["phase"] = "game_over"
    state["current_player_id"] = None
    _event(state, "game_over", "整场斗地主已经收盘。", winner_id=state["winner_id"])


def _canonical_command(command: dict[str, Any]) -> str:
    return json.dumps(command, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def apply_command(
    source_state: dict[str, Any], command: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
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
    if source_state["phase"] == "game_over":
        raise CommandError("game_finished", "这场斗地主已经结束。")
    actor_id = str(command.get("actor_id", "")).strip()
    if not actor_id:
        raise CommandError("missing_actor_id", "动作缺少 actor_id。")
    state = deepcopy(source_state)
    player = _player(state, actor_id)
    action = command.get("action")
    if action == "bid":
        _act_bid(state, player, command)
    elif action == "play":
        _act_play(state, player, command)
    elif action == "pass":
        _act_pass(state, player)
    elif action == "next_round":
        _act_next_round(state)
    elif action == "end_match":
        _act_end_match(state)
    else:
        raise CommandError("unknown_action", "不支持这个斗地主动作。")
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


def legal_moves(state: dict[str, Any], player_id: str) -> list[dict[str, Any]]:
    try:
        player = _player(state, player_id)
    except CommandError:
        return []
    if state["phase"] == "game_over":
        return []
    if state["phase"] == "round_over":
        return [{"action": "next_round"}]
    if state["current_player_id"] != player_id:
        return []
    if state["phase"] == "bidding":
        floor = int(state["high_bid"]["value"] if state["high_bid"] else 0)
        return [{"action": "bid", "value": value} for value in [0, *range(floor + 1, 4)]]
    field = state["field"]["combo"] if state["field"] else None
    moves = [
        {
            "action": "play",
            "card_ids": combo["cards"],
            "as": combo["type"],
            "combo": combo,
        }
        for combo in enumerate_combos(player["hand"], state["rules"], field)
    ]
    if state["field"] is not None:
        moves.append({"action": "pass"})
    return moves


def _public_card(card_id: str) -> dict[str, Any]:
    card = parse_card(card_id)
    assert card is not None
    return {**card, "label": card_label(card_id)}


def _legal_action_projection(state: dict[str, Any], viewer_id: str | None) -> tuple[list[str], list[int]]:
    if viewer_id is None:
        return [], []
    moves = legal_moves(state, viewer_id)
    actions = list(dict.fromkeys(str(move["action"]) for move in moves))
    bids = [int(move["value"]) for move in moves if move["action"] == "bid"]
    return actions, bids


def project_view(state: dict[str, Any], viewer_id: str | None) -> dict[str, Any]:
    if viewer_id is not None:
        _player(state, viewer_id)
    legal_actions, legal_bid_values = _legal_action_projection(state, viewer_id)
    players = []
    for player in state["players"]:
        public = {
            "id": player["id"],
            "name": player["name"],
            "seat": player["seat"],
            "controller_type": player["controller_type"],
            "accent": player["accent"],
            "is_landlord": player["is_landlord"],
            "bid": player["bid"],
            "passed": player["passed"],
            "played_count": player["played_count"],
            "score": player["score"],
            "hand_count": len(player["hand"]),
        }
        if player["id"] == viewer_id:
            public["hand"] = [_public_card(card_id) for card_id in player["hand"]]
        players.append(public)
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "status": "finished" if state["phase"] == "game_over" else "active",
        "phase": state["phase"],
        "round": state["round"],
        "rules": deepcopy(state["rules"]),
        "viewer_id": viewer_id,
        "current_player_id": state["current_player_id"],
        "leader_id": state["leader_id"],
        "landlord_id": state["landlord_id"],
        "players": players,
        "bids": deepcopy(state["bids"]),
        "high_bid": deepcopy(state["high_bid"]),
        "base": state["base"],
        "bottom_cards": (
            [_public_card(card_id) for card_id in state["bottom"]]
            if state["bottom_dealt"]
            else None
        ),
        "field": (
            {
                "cards": [_public_card(card_id) for card_id in state["field"]["cards"]],
                "by": state["field"]["by"],
                "combo": deepcopy(state["field"]["combo"]),
            }
            if state["field"]
            else None
        ),
        "last_to_play": state["last_to_play"],
        "pile_count": len(state["pile"]),
        "pass_streak": state["pass_streak"],
        "bombs": state["bombs"],
        "multiplier": 2 ** state["bombs"],
        "spring": state["spring"],
        "anti_spring": state["anti_spring"],
        "round_winner": state["round_winner"],
        "last_results": deepcopy(state["last_results"]),
        "winner_id": state["winner_id"],
        "legal_actions": legal_actions,
        "legal_bid_values": legal_bid_values,
        "legal_moves": deepcopy(legal_moves(state, viewer_id)) if viewer_id is not None else [],
        "recent_events": deepcopy(state["public_events"][-8:]),
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
    cards.extend(state["pile"])
    if not state["bottom_dealt"]:
        cards.extend(state["bottom"])
    if len(cards) != 54 or len(set(cards)) != 54 or set(cards) != set(ALL_CARDS):
        raise AssertionError("Dou Dizhu card conservation violated")
    if state["phase"] == "playing" and (
        state["landlord_id"] is None or state["base"] is None
    ):
        raise AssertionError("playing phase requires a landlord and base score")
    if state["phase"] in {"bidding", "playing"} and state["current_player_id"] is None:
        raise AssertionError("active turn phase requires a current player")
    if len(state["command_log"]) != state["revision"]:
        raise AssertionError("revision must match applied command count")
    if len(state["applied_commands"]) != state["revision"]:
        raise AssertionError("every revision must have one idempotency record")
    if sum(player["score"] for player in state["players"]) != 0:
        raise AssertionError("Dou Dizhu scoring must remain zero-sum")
