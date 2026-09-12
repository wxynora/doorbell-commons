"""Doorbell's JSON-serializable Monopoly-style authoritative rules engine.

Rules and default data are adapted from 29-Cu/bisca under CC BY 4.0.
"""

from __future__ import annotations

from copy import deepcopy
import json
import time
from typing import Any
from uuid import uuid4

from .defaults import DEFAULT_BOARD, DEFAULT_CARDS, DEFAULT_CONFIG


RULES_VERSION = "doorbell.bisca.monopoly.v1"
DECK_LABEL = {"chance": "机会", "community": "命运"}
ACCENTS = ("coral", "sky", "gold", "mint")


class CommandError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _u32(value: int) -> int:
    return value & 0xFFFFFFFF


def _hash_seed(seed: object) -> int:
    value = str("bisca" if seed is None else seed)
    result = 2_166_136_261
    for char in value:
        result ^= ord(char)
        result = _u32(result * 16_777_619)
    return result


def _create_rng_state(seed: object) -> list[int]:
    value = _hash_seed(seed)
    result: list[int] = []
    for _ in range(4):
        value = _u32(value ^ _u32(value << 13))
        value = _u32(value ^ (value >> 17))
        value = _u32(value ^ _u32(value << 5))
        result.append(value)
    if not any(result):
        result[0] = 0x9E3779B9
    return result


def _rng_next(rng_state: list[int]) -> tuple[list[int], int]:
    x, y, z, w = (_u32(value) for value in rng_state)
    temp = _u32(x ^ _u32(x << 11))
    next_w = _u32(w ^ (w >> 19) ^ temp ^ (temp >> 8))
    return [y, z, w, next_w], next_w


def _random_int(state: dict[str, Any], upper: int) -> int:
    if upper <= 0:
        raise CommandError("invalid_random_range", "随机范围必须大于零。")
    state["rng_state"], value = _rng_next(state["rng_state"])
    return value % upper


def _shuffle(state: dict[str, Any], values: list[Any]) -> list[Any]:
    result = list(values)
    for index in range(len(result) - 1, 0, -1):
        target = _random_int(state, index + 1)
        result[index], result[target] = result[target], result[index]
    return result


def _normalise_board(source: object) -> list[dict[str, Any]]:
    raw = source.get("cells") if isinstance(source, dict) else source
    if not isinstance(raw, list) or len(raw) != 40:
        raise CommandError("invalid_board", "大富翁棋盘必须正好包含 40 格。")
    board: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise CommandError("invalid_board", f"棋盘第 {index} 格不是对象。")
        cell = deepcopy(item)
        if cell.get("idx", index) != index:
            raise CommandError("invalid_board", "棋盘格 idx 必须从 0 到 39 连续排列。")
        cell["idx"] = index
        cell.setdefault("type", "parking")
        cell.setdefault("name", "空地")
        cell.setdefault("short_name", cell.get("shortName", str(cell["name"])[:2]))
        if "houseCost" in cell and "house_cost" not in cell:
            cell["house_cost"] = cell.pop("houseCost")
        board.append(cell)
    return board


def _normalise_cards(source: object) -> dict[str, list[dict[str, Any]]]:
    raw = source if isinstance(source, dict) else {}
    result: dict[str, list[dict[str, Any]]] = {"chance": [], "community": []}
    seen: set[str] = set()
    for deck_name in result:
        deck = raw.get(deck_name, [])
        if not isinstance(deck, list):
            raise CommandError("invalid_cards", f"{DECK_LABEL[deck_name]}牌堆不是数组。")
        for item in deck:
            if not isinstance(item, dict) or not str(item.get("id", "")).strip():
                raise CommandError("invalid_cards", f"{DECK_LABEL[deck_name]}牌缺少 id。")
            card = deepcopy(item)
            card_id = str(card["id"])
            if card_id in seen:
                raise CommandError("invalid_cards", f"卡牌 id 重复：{card_id}")
            seen.add(card_id)
            effect = card.get("effect")
            if isinstance(effect, dict):
                if "collectGo" in effect and "collect_go" not in effect:
                    effect["collect_go"] = effect.pop("collectGo")
                if "perHouse" in effect and "per_house" not in effect:
                    effect["per_house"] = effect.pop("perHouse")
                if "perHotel" in effect and "per_hotel" not in effect:
                    effect["per_hotel"] = effect.pop("perHotel")
            result[deck_name].append(card)
    return result


def _normalise_config(source: object) -> dict[str, Any]:
    config = deepcopy(DEFAULT_CONFIG)
    if source is None:
        return config
    if not isinstance(source, dict):
        raise CommandError("invalid_rules", "大富翁规则必须是对象。")
    aliases = {
        "startCash": "start_cash",
        "luxuryTax": "luxury_tax",
        "maxHouses": "max_houses",
        "jailMaxTurns": "jail_max_turns",
        "railRents": "rail_rents",
        "utilMultipliers": "util_multipliers",
        "jailCell": "jail_cell",
    }
    for key, value in source.items():
        config[aliases.get(key, key)] = deepcopy(value)
    for key in ("start_cash", "salary", "bail", "luxury_tax", "max_houses", "jail_max_turns"):
        if not isinstance(config.get(key), int) or config[key] < 0:
            raise CommandError("invalid_rules", f"规则 {key} 必须是非负整数。")
    return config


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    for player in state["players"]:
        if player["id"] == player_id:
            return player
    raise CommandError("player_not_found", "没有找到这名玩家。")


def _active_players(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [player for player in state["players"] if not player["bankrupt"]]


def _cell(state: dict[str, Any], cell_idx: int) -> dict[str, Any]:
    if not 0 <= cell_idx < len(state["board"]):
        raise CommandError("invalid_cell", "棋盘上没有这一格。")
    return state["board"][cell_idx]


def _cell_name(state: dict[str, Any], cell_idx: int) -> str:
    return str(_cell(state, cell_idx)["name"])


def _money(amount: int) -> str:
    return f"{amount} 钞"


def _ownership(state: dict[str, Any], cell_idx: int) -> dict[str, Any] | None:
    return state["cells"].get(str(cell_idx))


def _owned_cells(state: dict[str, Any], player_id: str) -> list[int]:
    return sorted(
        int(cell_idx)
        for cell_idx, ownership in state["cells"].items()
        if ownership["owner"] == player_id
    )


def _group_cells(state: dict[str, Any], group: str | None) -> list[int]:
    if not group:
        return []
    return [
        index
        for index, cell in enumerate(state["board"])
        if cell["type"] == "prop" and cell.get("group") == group
    ]


def _group_fully_owned(state: dict[str, Any], group: str | None, player_id: str) -> bool:
    cells = _group_cells(state, group)
    return bool(cells) and all(
        _ownership(state, cell_idx)
        and _ownership(state, cell_idx)["owner"] == player_id
        for cell_idx in cells
    )


def _count_type_owned(state: dict[str, Any], cell_type: str, player_id: str) -> int:
    return sum(
        1
        for index, cell in enumerate(state["board"])
        if cell["type"] == cell_type
        and _ownership(state, index)
        and _ownership(state, index)["owner"] == player_id
    )


def _houses(state: dict[str, Any], cell_idx: int) -> int:
    ownership = _ownership(state, cell_idx)
    return int(ownership["houses"]) if ownership else 0


def _house_cost(state: dict[str, Any], cell_idx: int) -> int:
    return int(_cell(state, cell_idx).get("house_cost", 0))


def _dice_sum(state: dict[str, Any]) -> int:
    return sum(state["dice"]) if state["dice"] else 0


def rent_for(state: dict[str, Any], cell_idx: int) -> int:
    ownership = _ownership(state, cell_idx)
    cell = _cell(state, cell_idx)
    if not ownership:
        return 0
    if cell["type"] == "prop":
        rents = cell.get("rents", [])
        houses = int(ownership.get("houses", 0))
        if houses > 0:
            return int(rents[min(houses, len(rents) - 1)]) if rents else 0
        base = int(rents[0]) if rents else 0
        return base * 2 if _group_fully_owned(state, cell.get("group"), ownership["owner"]) else base
    if cell["type"] == "rail":
        table = cell.get("rents") or state["rules"]["rail_rents"]
        count = _count_type_owned(state, "rail", ownership["owner"])
        return int(table[min(count, len(table)) - 1]) if count and table else 0
    if cell["type"] == "util":
        multipliers = cell.get("multipliers") or state["rules"]["util_multipliers"]
        count = _count_type_owned(state, "util", ownership["owner"])
        return _dice_sum(state) * int(multipliers[min(count, len(multipliers)) - 1]) if count else 0
    return 0


def _event(state: dict[str, Any], event_type: str, text: str, **fields: Any) -> dict[str, Any]:
    entry = {
        "seq": len(state["public_events"]) + 1,
        "revision": state["revision"],
        "type": event_type,
        "text": text,
        **fields,
    }
    state["public_events"].append(entry)
    return entry


def _sellable_cells(state: dict[str, Any], player: dict[str, Any]) -> list[int]:
    result: list[int] = []
    for cell_idx in _owned_cells(state, player["id"]):
        if _houses(state, cell_idx) <= 0:
            continue
        peers = _group_cells(state, _cell(state, cell_idx).get("group"))
        if _houses(state, cell_idx) >= max((_houses(state, peer) for peer in peers), default=0):
            result.append(cell_idx)
    return result


def _auto_sell_houses(
    state: dict[str, Any], player: dict[str, Any], needed_cash: int
) -> None:
    while player["cash"] < needed_cash:
        candidates = _sellable_cells(state, player)
        if not candidates:
            break
        candidates.sort(
            key=lambda idx: (-_house_cost(state, idx), -_houses(state, idx), idx)
        )
        cell_idx = candidates[0]
        refund = _house_cost(state, cell_idx) // 2
        state["cells"][str(cell_idx)]["houses"] -= 1
        player["cash"] += refund
        _event(
            state,
            "sell_house",
            f"{player['name']} 被迫变卖 {_cell_name(state, cell_idx)} 的房子，回收 {_money(refund)}。",
            player_id=player["id"],
            cell_idx=cell_idx,
        )


def _pay(
    state: dict[str, Any],
    payer: dict[str, Any],
    receiver: dict[str, Any] | None,
    amount: int,
) -> bool:
    if amount <= 0:
        return True
    if payer["cash"] < amount:
        _auto_sell_houses(state, payer, amount)
    if payer["cash"] >= amount:
        payer["cash"] -= amount
        if receiver:
            receiver["cash"] += amount
        return True
    debt = {
        "player_id": payer["id"],
        "amount": amount,
        "creditor": receiver["id"] if receiver else None,
    }
    if state["pending_debt"] is None:
        state["pending_debt"] = debt
    else:
        state["debt_queue"].append(debt)
    _event(
        state,
        "debt",
        f"{payer['name']} 掏不出 {_money(amount)}，只能宣布破产。",
        player_id=payer["id"],
        amount=amount,
    )
    return False


def _gain(state: dict[str, Any], player: dict[str, Any], amount: int, text: str) -> None:
    player["cash"] += amount
    _event(state, "money", text, player_id=player["id"], amount=amount)


def _jail_index(state: dict[str, Any]) -> int:
    configured = state["rules"].get("jail_cell")
    if isinstance(configured, int):
        return configured
    for index, cell in enumerate(state["board"]):
        if cell["type"] == "jail":
            return index
    return 0


def _send_to_jail(state: dict[str, Any], player: dict[str, Any]) -> None:
    player["pos"] = _jail_index(state)
    player["in_jail"] = True
    player["jail_turns"] = 0
    state["doubles_count"] = 0
    state["extra_roll"] = False
    _event(state, "jail", f"{player['name']} 被送进监狱。", player_id=player["id"])


def _move_player(
    state: dict[str, Any], player: dict[str, Any], steps: int, *, collect_go: bool = True
) -> None:
    board_size = len(state["board"])
    previous = int(player["pos"])
    player["pos"] = (previous + steps) % board_size
    _event(
        state,
        "move",
        f"{player['name']} 走到 {_cell_name(state, player['pos'])}。",
        player_id=player["id"],
        from_cell=previous,
        to_cell=player["pos"],
    )
    if steps > 0 and previous + steps >= board_size and collect_go:
        salary = int(state["rules"]["salary"])
        _gain(
            state,
            player,
            salary,
            f"{player['name']} 路过起点，领到 {_money(salary)}。",
        )
    _resolve_landing(state, player)


def _move_to(
    state: dict[str, Any], player: dict[str, Any], target: int, *, collect_go: bool
) -> None:
    board_size = len(state["board"])
    steps = (target - int(player["pos"])) % board_size
    if steps:
        _move_player(state, player, steps, collect_go=collect_go)
        return
    _event(
        state,
        "move",
        f"{player['name']} 停在 {_cell_name(state, player['pos'])}。",
        player_id=player["id"],
        to_cell=player["pos"],
    )
    if collect_go and _cell(state, player["pos"])["type"] == "go":
        salary = int(state["rules"]["salary"])
        _gain(state, player, salary, f"{player['name']} 回到起点，领到 {_money(salary)}。")
    _resolve_landing(state, player)


def _draw_card(state: dict[str, Any], deck_name: str) -> None:
    deck = state["decks"][deck_name]
    if not deck["draw"]:
        deck["draw"] = _shuffle(state, deck["discard"])
        deck["discard"] = []
    if not deck["draw"]:
        _event(state, "card", f"{DECK_LABEL[deck_name]}牌堆空了，什么也没发生。")
        return
    card_id = deck["draw"].pop(0)
    card = next(
        (item for item in state["cards"][deck_name] if item["id"] == card_id), None
    )
    if card is None:
        _event(state, "card", f"{DECK_LABEL[deck_name]}牌 {card_id} 找不到牌面。")
        return
    state["pending_card"] = {"deck": deck_name, "card": deepcopy(card)}
    _event(
        state,
        "card",
        f"抽到{DECK_LABEL[deck_name]}：{card['text']}",
        deck=deck_name,
        card_id=card_id,
    )


def _charge_rent(state: dict[str, Any], player: dict[str, Any], cell_idx: int) -> None:
    ownership = _ownership(state, cell_idx)
    if not ownership or ownership["owner"] == player["id"]:
        return
    owner = _player(state, ownership["owner"])
    if owner["bankrupt"]:
        return
    amount = rent_for(state, cell_idx)
    if amount <= 0:
        return
    _event(
        state,
        "rent",
        f"{player['name']} 踩中 {owner['name']} 的 {_cell_name(state, cell_idx)}，付租金 {_money(amount)}。",
        player_id=player["id"],
        owner_id=owner["id"],
        cell_idx=cell_idx,
        amount=amount,
    )
    _pay(state, player, owner, amount)


def _resolve_landing(state: dict[str, Any], player: dict[str, Any]) -> None:
    cell_idx = int(player["pos"])
    cell = _cell(state, cell_idx)
    cell_type = cell["type"]
    if cell_type in {"prop", "rail", "util"}:
        ownership = _ownership(state, cell_idx)
        if ownership is None:
            state["phase"] = "awaiting_buy"
        elif ownership["owner"] != player["id"]:
            _charge_rent(state, player, cell_idx)
    elif cell_type == "tax":
        amount = int(cell.get("amount", 0))
        if amount > 0:
            _event(
                state,
                "tax",
                f"{player['name']} 缴纳{cell['name']} {_money(amount)}。",
                player_id=player["id"],
                amount=amount,
            )
            _pay(state, player, None, amount)
    elif cell_type == "luxury_tax":
        amount = int(state["rules"].get("luxury_tax", cell.get("amount", 0)))
        flavors = cell.get("flavor") or []
        flavor = flavors[_random_int(state, len(flavors))] if flavors else "账单到了"
        _event(
            state,
            "luxury_tax",
            f"{player['name']} 踩到{cell['name']}：{flavor}（{_money(amount)}）",
            player_id=player["id"],
            amount=amount,
        )
        _pay(state, player, None, amount)
    elif cell_type == "chance":
        _draw_card(state, "chance")
    elif cell_type == "community":
        _draw_card(state, "community")
    elif cell_type == "goto_jail":
        _send_to_jail(state, player)


def _apply_card_effect(
    state: dict[str, Any], player: dict[str, Any], deck_name: str, card: dict[str, Any]
) -> None:
    effect = card.get("effect") or {}
    effect_type = effect.get("type")
    if effect_type == "money":
        amount = int(effect.get("amount", 0))
        if amount >= 0:
            _gain(state, player, amount, f"{player['name']} 进账 {_money(amount)}。")
        else:
            _event(
                state,
                "money",
                f"{player['name']} 支出 {_money(-amount)}。",
                player_id=player["id"],
                amount=amount,
            )
            _pay(state, player, None, -amount)
    elif effect_type == "move_to":
        _move_to(
            state,
            player,
            int(effect.get("cell", 0)),
            collect_go=effect.get("collect_go") is not False,
        )
    elif effect_type == "move_rel":
        steps = int(effect.get("n", 0))
        if steps:
            _move_player(state, player, steps, collect_go=steps > 0)
    elif effect_type == "goto_jail":
        _send_to_jail(state, player)
    elif effect_type == "get_out_free":
        player["get_out_free"] += 1
        player["jail_cards"].append({"deck": deck_name, "id": card["id"]})
        _event(
            state,
            "card",
            f"{player['name']} 收好一张出狱卡。",
            player_id=player["id"],
        )
    elif effect_type == "per_player":
        amount = int(effect.get("amount", 0))
        others = [item for item in _active_players(state) if item["id"] != player["id"]]
        if amount > 0:
            for other in others:
                _event(
                    state,
                    "money",
                    f"{other['name']} 付给 {player['name']} {_money(amount)}。",
                )
                _pay(state, other, player, amount)
        elif amount < 0:
            for other in others:
                _event(
                    state,
                    "money",
                    f"{player['name']} 付给 {other['name']} {_money(-amount)}。",
                )
                if not _pay(state, player, other, -amount):
                    break
    elif effect_type == "repairs":
        houses = 0
        hotels = 0
        for cell_idx in _owned_cells(state, player["id"]):
            count = _houses(state, cell_idx)
            if count >= state["rules"]["max_houses"]:
                hotels += 1
            else:
                houses += count
        total = houses * int(effect.get("per_house", 0)) + hotels * int(
            effect.get("per_hotel", 0)
        )
        _event(
            state,
            "repairs",
            f"{player['name']} 修缮 {houses} 栋房、{hotels} 座旅馆，共 {_money(total)}。",
            player_id=player["id"],
            amount=total,
        )
        if total > 0:
            _pay(state, player, None, total)
    else:
        _event(state, "card", "这张牌上什么也没写。")


def _settle_phase(state: dict[str, Any]) -> None:
    if state["phase"] != "game_over" and state["phase"] != "awaiting_buy":
        state["phase"] = "awaiting_end"


def _check_game_over(state: dict[str, Any]) -> bool:
    alive = _active_players(state)
    if len(alive) > 1:
        return False
    state["winner_id"] = alive[0]["id"] if alive else None
    state["phase"] = "game_over"
    state["pending_card"] = None
    text = f"{alive[0]['name']} 赢下整局！" if alive else "所有人都破产了，无人获胜。"
    _event(state, "game_over", text, winner_id=state["winner_id"])
    return True


def _advance_turn(state: dict[str, Any]) -> None:
    state["doubles_count"] = 0
    state["extra_roll"] = False
    current_index = next(
        (index for index, player in enumerate(state["players"]) if player["id"] == state["current_player_id"]),
        0,
    )
    for offset in range(1, len(state["players"]) + 1):
        candidate = state["players"][(current_index + offset) % len(state["players"])]
        if not candidate["bankrupt"]:
            state["current_player_id"] = candidate["id"]
            break
    state["phase"] = "awaiting_roll"
    state["dice"] = None
    current = _player(state, state["current_player_id"])
    _event(state, "turn", f"轮到 {current['name']} 行动。", player_id=current["id"])


def _liquidate(
    state: dict[str, Any], player: dict[str, Any], creditor_id: str | None
) -> None:
    creditor = _player(state, creditor_id) if creditor_id else None
    if creditor and creditor["bankrupt"]:
        creditor = None
    for cell_idx in _owned_cells(state, player["id"]):
        count = _houses(state, cell_idx)
        if count > 0:
            refund = (_house_cost(state, cell_idx) // 2) * count
            state["cells"][str(cell_idx)]["houses"] = 0
            player["cash"] += refund
            _event(
                state,
                "sell_house",
                f"清算：{_cell_name(state, cell_idx)} 的 {count} 栋房折现 {_money(refund)}。",
            )
    properties = _owned_cells(state, player["id"])
    for cell_idx in properties:
        if creditor:
            state["cells"][str(cell_idx)]["owner"] = creditor["id"]
        else:
            del state["cells"][str(cell_idx)]
    if properties:
        target = f"转给 {creditor['name']}" if creditor else "收归银行"
        _event(state, "bankrupt", f"{player['name']} 的 {len(properties)} 处地产{target}。")
    if creditor and player["cash"] > 0:
        creditor["cash"] += player["cash"]
        _event(
            state,
            "bankrupt",
            f"{player['name']} 的现金 {_money(player['cash'])} 归 {creditor['name']}。",
        )
    for jail_card in player["jail_cards"]:
        state["decks"][jail_card["deck"]]["discard"].append(jail_card["id"])
    player.update(
        {
            "jail_cards": [],
            "get_out_free": 0,
            "cash": 0,
            "in_jail": False,
            "jail_turns": 0,
            "bankrupt": True,
        }
    )
    _event(
        state,
        "bankrupt",
        f"{player['name']} 宣布破产，退出牌局。",
        player_id=player["id"],
    )


def _act_roll(state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]) -> None:
    if state["phase"] != "awaiting_roll":
        raise CommandError("roll_unavailable", "现在不是掷骰子的时候。")
    first = 1 + _random_int(state, 6)
    second = 1 + _random_int(state, 6)
    state["dice"] = [first, second]
    total = first + second
    is_double = first == second
    suffix = "（双数）" if is_double else ""
    _event(
        state,
        "roll",
        f"{player['name']} 掷出 {first} + {second} = {total}{suffix}。",
        player_id=player["id"],
        dice=[first, second],
    )
    if player["in_jail"]:
        state["extra_roll"] = False
        if is_double:
            player["in_jail"] = False
            player["jail_turns"] = 0
            _event(state, "jail", f"{player['name']} 掷出双数，出狱！")
            _move_player(state, player, total)
        else:
            player["jail_turns"] += 1
            if player["jail_turns"] >= state["rules"]["jail_max_turns"]:
                bail = int(state["rules"]["bail"])
                _event(
                    state,
                    "jail",
                    f"{player['name']} 蹲满 {state['rules']['jail_max_turns']} 回合，强制交保释金 {_money(bail)}。",
                )
                paid = _pay(state, player, None, bail)
                player["in_jail"] = False
                player["jail_turns"] = 0
                if paid:
                    _move_player(state, player, total)
            else:
                _event(
                    state,
                    "jail",
                    f"{player['name']} 没掷出双数，继续蹲（第 {player['jail_turns']} 回合）。",
                )
        _settle_phase(state)
        return
    if is_double:
        state["doubles_count"] += 1
        if state["doubles_count"] >= 3:
            _event(state, "jail", f"{player['name']} 连掷三次双数，直接进监狱。")
            _send_to_jail(state, player)
            _settle_phase(state)
            return
        state["extra_roll"] = True
    else:
        state["doubles_count"] = 0
        state["extra_roll"] = False
    _move_player(state, player, total)
    _settle_phase(state)


def _act_buy(state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]) -> None:
    if state["phase"] != "awaiting_buy":
        raise CommandError("buy_unavailable", "现在没有可以买的地。")
    cell_idx = int(player["pos"])
    cell = _cell(state, cell_idx)
    if cell["type"] not in {"prop", "rail", "util"} or _ownership(state, cell_idx):
        raise CommandError("buy_unavailable", "这块地不能购买。")
    price = int(cell.get("price", 0))
    if player["cash"] < price:
        raise CommandError("insufficient_cash", f"现金不足，买不起{cell['name']}。")
    player["cash"] -= price
    state["cells"][str(cell_idx)] = {"owner": player["id"], "houses": 0}
    state["phase"] = "awaiting_end"
    _event(
        state,
        "buy",
        f"{player['name']} 买下 {cell['name']}，花费 {_money(price)}。",
        player_id=player["id"],
        cell_idx=cell_idx,
        amount=price,
    )


def _act_decline(state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]) -> None:
    if state["phase"] != "awaiting_buy":
        raise CommandError("decline_unavailable", "现在没有要不要买的问题。")
    _event(
        state,
        "decline",
        f"{player['name']} 放弃购买 {_cell_name(state, player['pos'])}。",
        player_id=player["id"],
        cell_idx=player["pos"],
    )
    state["phase"] = "awaiting_end"


def buildable_cells(state: dict[str, Any], player_id: str) -> list[int]:
    try:
        player = _player(state, player_id)
    except CommandError:
        return []
    if player["in_jail"] or state["phase"] not in {"awaiting_roll", "awaiting_end"}:
        return []
    result: list[int] = []
    for cell_idx in _owned_cells(state, player_id):
        cell = _cell(state, cell_idx)
        ownership = _ownership(state, cell_idx)
        if cell["type"] != "prop" or not ownership:
            continue
        if not _group_fully_owned(state, cell.get("group"), player_id):
            continue
        if ownership["houses"] >= state["rules"]["max_houses"]:
            continue
        peers = _group_cells(state, cell.get("group"))
        minimum = min((_houses(state, peer) for peer in peers), default=0)
        if ownership["houses"] + 1 - minimum > 1:
            continue
        if player["cash"] >= _house_cost(state, cell_idx):
            result.append(cell_idx)
    return result


def _act_build(state: dict[str, Any], player: dict[str, Any], command: dict[str, Any]) -> None:
    cell_idx = command.get("cell_idx")
    if not isinstance(cell_idx, int) or cell_idx not in buildable_cells(state, player["id"]):
        raise CommandError("build_unavailable", "现在不能在这一格盖房。")
    ownership = _ownership(state, cell_idx)
    assert ownership is not None
    cost = _house_cost(state, cell_idx)
    player["cash"] -= cost
    ownership["houses"] += 1
    building = "旅馆" if ownership["houses"] >= state["rules"]["max_houses"] else f"第 {ownership['houses']} 栋房"
    _event(
        state,
        "build",
        f"{player['name']} 在 {_cell_name(state, cell_idx)} 盖了{building}，花费 {_money(cost)}。",
        player_id=player["id"],
        cell_idx=cell_idx,
        houses=ownership["houses"],
    )


def _act_sell_house(
    state: dict[str, Any], player: dict[str, Any], command: dict[str, Any]
) -> None:
    cell_idx = command.get("cell_idx")
    if (
        not isinstance(cell_idx, int)
        or state["phase"] not in {"awaiting_roll", "awaiting_end"}
        or cell_idx not in _sellable_cells(state, player)
    ):
        raise CommandError("sell_unavailable", "现在不能卖这一格的房子。")
    refund = _house_cost(state, cell_idx) // 2
    state["cells"][str(cell_idx)]["houses"] -= 1
    player["cash"] += refund
    _event(
        state,
        "sell_house",
        f"{player['name']} 卖掉 {_cell_name(state, cell_idx)} 的一栋房，回收 {_money(refund)}。",
        player_id=player["id"],
        cell_idx=cell_idx,
    )


def _act_end_turn(state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]) -> None:
    if state["phase"] != "awaiting_end":
        raise CommandError("end_turn_unavailable", "现在还不能结束回合。")
    if state["extra_roll"]:
        state["extra_roll"] = False
        state["phase"] = "awaiting_roll"
        _event(state, "turn", f"{player['name']} 掷出双数，再来一次。")
        return
    _advance_turn(state)


def _act_pay_bail(state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]) -> None:
    if state["phase"] != "awaiting_roll" or not player["in_jail"]:
        raise CommandError("bail_unavailable", "现在不能交保释金。")
    bail = int(state["rules"]["bail"])
    if player["cash"] < bail:
        _auto_sell_houses(state, player, bail)
    if player["cash"] < bail:
        raise CommandError("insufficient_cash", "现金不足，交不起保释金。")
    player["cash"] -= bail
    player["in_jail"] = False
    player["jail_turns"] = 0
    _event(state, "jail", f"{player['name']} 交了 {_money(bail)} 保释金，走出监狱。")


def _act_use_jail_card(
    state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]
) -> None:
    if state["phase"] != "awaiting_roll" or not player["in_jail"]:
        raise CommandError("jail_card_unavailable", "现在不能使用出狱卡。")
    if player["get_out_free"] <= 0 or not player["jail_cards"]:
        raise CommandError("jail_card_missing", "你没有出狱卡。")
    player["get_out_free"] -= 1
    jail_card = player["jail_cards"].pop(0)
    state["decks"][jail_card["deck"]]["discard"].append(jail_card["id"])
    player["in_jail"] = False
    player["jail_turns"] = 0
    _event(state, "jail", f"{player['name']} 使用出狱卡离开监狱。")


def _act_card_ack(state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]) -> None:
    pending = state["pending_card"]
    if pending is None:
        raise CommandError("card_ack_unavailable", "现在没有待确认的卡牌。")
    state["pending_card"] = None
    _apply_card_effect(state, player, pending["deck"], pending["card"])
    if (pending["card"].get("effect") or {}).get("type") != "get_out_free":
        state["decks"][pending["deck"]]["discard"].append(pending["card"]["id"])
    _settle_phase(state)


def _act_declare_bankrupt(
    state: dict[str, Any], player: dict[str, Any], _: dict[str, Any]
) -> None:
    debt = state["pending_debt"]
    if not debt or debt["player_id"] != player["id"]:
        raise CommandError("bankrupt_unavailable", "你现在不能宣布破产。")
    was_current = state["current_player_id"] == player["id"]
    _liquidate(state, player, debt["creditor"])
    state["debt_queue"] = [
        item for item in state["debt_queue"] if item["player_id"] != player["id"]
    ]
    state["pending_debt"] = state["debt_queue"].pop(0) if state["debt_queue"] else None
    if _check_game_over(state):
        return
    if was_current:
        state["pending_card"] = None
        _advance_turn(state)
    else:
        _settle_phase(state)


ACTION_HANDLERS = {
    "roll": _act_roll,
    "buy": _act_buy,
    "decline": _act_decline,
    "build": _act_build,
    "sell_house": _act_sell_house,
    "end_turn": _act_end_turn,
    "pay_bail": _act_pay_bail,
    "use_jail_card": _act_use_jail_card,
    "card_ack": _act_card_ack,
    "declare_bankrupt": _act_declare_bankrupt,
}


def _canonical_command(command: dict[str, Any]) -> str:
    return json.dumps(command, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _clone_state(state: dict[str, Any]) -> dict[str, Any]:
    """Copy mutable game state without re-copying immutable rule tables every turn."""
    return {
        **state,
        "dice": list(state["dice"]) if state["dice"] else None,
        "players": [
            {
                **player,
                "jail_cards": [dict(card) for card in player["jail_cards"]],
            }
            for player in state["players"]
        ],
        "cells": {
            cell_idx: dict(ownership) for cell_idx, ownership in state["cells"].items()
        },
        "decks": {
            deck_name: {
                "draw": list(deck["draw"]),
                "discard": list(deck["discard"]),
            }
            for deck_name, deck in state["decks"].items()
        },
        "pending_card": deepcopy(state["pending_card"]),
        "pending_debt": dict(state["pending_debt"]) if state["pending_debt"] else None,
        "debt_queue": [dict(debt) for debt in state["debt_queue"]],
        "rng_state": list(state["rng_state"]),
        "public_events": list(state["public_events"]),
        "command_log": list(state["command_log"]),
        "applied_commands": dict(state["applied_commands"]),
    }


def create_game(
    players: object,
    *,
    seed: object = 1,
    game_id: object = None,
    board: object = None,
    cards: object = None,
    rules: object = None,
) -> dict[str, Any]:
    if not isinstance(players, list) or not 2 <= len(players) <= 4:
        raise CommandError("invalid_players", "大富翁玩家人数必须是 2～4 人。")
    config = _normalise_config(rules)
    seats: list[dict[str, Any]] = []
    player_ids: set[str] = set()
    for index, item in enumerate(players):
        if not isinstance(item, dict):
            raise CommandError("invalid_players", "每个玩家座位都必须是对象。")
        player_id = str(item.get("id", f"player-{index + 1}")).strip()
        if not player_id:
            raise CommandError("invalid_players", "玩家 id 不能为空。")
        if player_id in player_ids:
            raise CommandError("duplicate_player", f"玩家 id 重复：{player_id}")
        player_ids.add(player_id)
        controller_type = item.get("controller_type")
        if controller_type not in {"human", "resident"}:
            raise CommandError("invalid_controller", "玩家类型必须是 human 或 resident。")
        seats.append(
            {
                "id": player_id,
                "name": str(item.get("name", f"玩家{index + 1}")),
                "seat": index,
                "controller_type": controller_type,
                "accent": item.get("accent", ACCENTS[index]),
                "cash": config["start_cash"],
                "pos": 0,
                "in_jail": False,
                "jail_turns": 0,
                "get_out_free": 0,
                "jail_cards": [],
                "bankrupt": False,
            }
        )
    state: dict[str, Any] = {
        "game_id": str(game_id or f"monopoly-{uuid4().hex[:12]}"),
        "rules_version": RULES_VERSION,
        "revision": 0,
        "status": "active",
        "created_at_ms": time.time_ns() // 1_000_000,
        "phase": "awaiting_roll",
        "current_player_id": seats[0]["id"],
        "dice": None,
        "doubles_count": 0,
        "extra_roll": False,
        "players": seats,
        "cells": {},
        "decks": {"chance": {"draw": [], "discard": []}, "community": {"draw": [], "discard": []}},
        "pending_card": None,
        "pending_debt": None,
        "debt_queue": [],
        "winner_id": None,
        "rng_state": _create_rng_state(seed),
        "board": _normalise_board(DEFAULT_BOARD if board is None else board),
        "cards": _normalise_cards(DEFAULT_CARDS if cards is None else cards),
        "rules": config,
        "public_events": [],
        "command_log": [],
        "applied_commands": {},
    }
    state["decks"]["chance"]["draw"] = _shuffle(
        state, [card["id"] for card in state["cards"]["chance"]]
    )
    state["decks"]["community"]["draw"] = _shuffle(
        state, [card["id"] for card in state["cards"]["community"]]
    )
    _event(
        state,
        "start",
        f"游戏开始：{'、'.join(player['name'] for player in seats)}，每人 {_money(config['start_cash'])}。",
    )
    _event(state, "turn", f"轮到 {seats[0]['name']} 行动。", player_id=seats[0]["id"])
    _assert_state(state)
    return state


def apply_command(
    source_state: dict[str, Any], command: object
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(command, dict):
        raise CommandError("invalid_command", "大富翁动作必须是对象。")
    command_id = str(command.get("command_id", "")).strip()
    if not command_id:
        raise CommandError("missing_command_id", "动作缺少 command_id。")
    if command_id in source_state["applied_commands"]:
        previous = source_state["applied_commands"][command_id]
        if previous["canonical"] != _canonical_command(command):
            raise CommandError("command_id_conflict", "同一 command_id 已用于不同动作。")
        return _clone_state(source_state), {
            "duplicate": True,
            "revision": source_state["revision"],
            "events": [],
        }
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
    action = command.get("action")
    if action not in ACTION_HANDLERS:
        raise CommandError("unknown_action", f"不支持这个大富翁动作：{action}")
    if source_state["phase"] == "game_over":
        raise CommandError("game_over", "这局大富翁已经结束了。")
    actor = _player(source_state, actor_id)
    if actor["bankrupt"]:
        raise CommandError("player_bankrupt", "这名玩家已经破产出局。")
    if source_state["pending_debt"]:
        debt = source_state["pending_debt"]
        if action != "declare_bankrupt":
            raise CommandError("debt_pending", "欠款未结清，现在只能宣布破产。")
        if debt["player_id"] != actor_id:
            raise CommandError("debt_pending", "要等欠债的玩家先宣布破产。")
    elif source_state["pending_card"]:
        if action != "card_ack":
            raise CommandError("card_pending", "请先处理抽到的卡牌。")
        if source_state["current_player_id"] != actor_id:
            raise CommandError("not_your_turn", "还没轮到这名玩家。")
    elif source_state["current_player_id"] != actor_id:
        raise CommandError("not_your_turn", "还没轮到这名玩家。")
    state = _clone_state(source_state)
    state["revision"] += 1
    event_start = len(state["public_events"])
    player = _player(state, actor_id)
    ACTION_HANDLERS[str(action)](state, player, command)
    stored = deepcopy(command)
    stored["occurred_at_ms"] = time.time_ns() // 1_000_000
    state["command_log"].append(stored)
    state["applied_commands"][command_id] = {
        "canonical": _canonical_command(command),
        "revision": state["revision"],
    }
    _assert_state(state)
    return state, {
        "duplicate": False,
        "revision": state["revision"],
        "events": deepcopy(state["public_events"][event_start:]),
    }


def legal_moves(state: dict[str, Any], player_id: str) -> list[dict[str, Any]]:
    if state["phase"] == "game_over":
        return []
    try:
        player = _player(state, player_id)
    except CommandError:
        return []
    if player["bankrupt"]:
        return []
    debt = state["pending_debt"]
    if debt:
        return (
            [{"action": "declare_bankrupt", "label": "宣布破产"}]
            if debt["player_id"] == player_id
            else []
        )
    if state["current_player_id"] != player_id:
        return []
    if state["pending_card"]:
        deck = state["pending_card"]["deck"]
        return [{"action": "card_ack", "label": f"收下{DECK_LABEL[deck]}牌"}]
    moves: list[dict[str, Any]] = []
    if state["phase"] == "awaiting_buy":
        cell = _cell(state, player["pos"])
        price = int(cell.get("price", 0))
        if player["cash"] >= price:
            moves.append(
                {
                    "action": "buy",
                    "cell_idx": player["pos"],
                    "amount": price,
                    "label": f"买下 {cell['short_name']} · {_money(price)}",
                }
            )
        moves.append({"action": "decline", "label": "暂不购买"})
        return moves
    if state["phase"] == "awaiting_roll":
        moves.append({"action": "roll", "label": "掷骰子"})
        if player["in_jail"]:
            bail = int(state["rules"]["bail"])
            if player["cash"] >= bail:
                moves.append({"action": "pay_bail", "amount": bail, "label": f"交保释金 · {_money(bail)}"})
            if player["get_out_free"] > 0:
                moves.append({"action": "use_jail_card", "label": "使用出狱卡"})
    elif state["phase"] == "awaiting_end":
        moves.append({"action": "end_turn", "label": "结束回合"})
    if state["phase"] in {"awaiting_roll", "awaiting_end"} and not player["in_jail"]:
        for cell_idx in buildable_cells(state, player_id):
            moves.append(
                {
                    "action": "build",
                    "cell_idx": cell_idx,
                    "amount": _house_cost(state, cell_idx),
                    "label": f"在 {_cell_name(state, cell_idx)} 盖房",
                }
            )
        for cell_idx in _sellable_cells(state, player):
            moves.append(
                {
                    "action": "sell_house",
                    "cell_idx": cell_idx,
                    "amount": _house_cost(state, cell_idx) // 2,
                    "label": f"卖掉 {_cell_name(state, cell_idx)} 一栋房",
                }
            )
    return moves


def project_view(state: dict[str, Any], viewer_id: str | None) -> dict[str, Any]:
    if viewer_id is not None:
        _player(state, viewer_id)
    cells = {
        cell_idx: {
            **deepcopy(ownership),
            "rent": rent_for(state, int(cell_idx)),
        }
        for cell_idx, ownership in state["cells"].items()
    }
    moves = legal_moves(state, viewer_id) if viewer_id is not None else []
    legal_actions = list(dict.fromkeys(str(move["action"]) for move in moves))
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "status": state["status"],
        "phase": state["phase"],
        "viewer_id": viewer_id,
        "current_player_id": state["current_player_id"],
        "players": deepcopy(state["players"]),
        "board": deepcopy(state["board"]),
        "cells": cells,
        "dice": deepcopy(state["dice"]),
        "doubles_count": state["doubles_count"],
        "extra_roll": state["extra_roll"],
        "pending_card": deepcopy(state["pending_card"]),
        "pending_debt": deepcopy(state["pending_debt"]),
        "winner_id": state["winner_id"],
        "rules": deepcopy(state["rules"]),
        "legal_actions": legal_actions,
        "legal_moves": deepcopy(moves),
        "recent_events": deepcopy(state["public_events"][-12:]),
    }


def project_replay(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "game_id": state["game_id"],
        "rules_version": state["rules_version"],
        "revision": state["revision"],
        "phase": state["phase"],
        "winner_id": state["winner_id"],
        "players": [
            {
                "id": player["id"],
                "name": player["name"],
                "cash": player["cash"],
                "bankrupt": player["bankrupt"],
            }
            for player in state["players"]
        ],
        "events": deepcopy(state["public_events"]),
    }


def _assert_state(state: dict[str, Any]) -> None:
    if len(state["board"]) != 40 or any(
        cell["idx"] != index for index, cell in enumerate(state["board"])
    ):
        raise AssertionError("Monopoly board invariant violated")
    player_ids = {player["id"] for player in state["players"]}
    if len(player_ids) != len(state["players"]):
        raise AssertionError("Monopoly player ids must stay unique")
    if state["current_player_id"] not in player_ids:
        raise AssertionError("Monopoly current player is missing")
    for cell_idx, ownership in state["cells"].items():
        index = int(cell_idx)
        if not 0 <= index < 40 or ownership["owner"] not in player_ids:
            raise AssertionError("Monopoly ownership invariant violated")
        if not 0 <= ownership["houses"] <= state["rules"]["max_houses"]:
            raise AssertionError("Monopoly house count invariant violated")
    expected_cards = {
        card["id"] for deck in state["cards"].values() for card in deck
    }
    located_cards: list[str] = []
    for deck in state["decks"].values():
        located_cards.extend(deck["draw"])
        located_cards.extend(deck["discard"])
    if state["pending_card"]:
        located_cards.append(state["pending_card"]["card"]["id"])
    for player in state["players"]:
        located_cards.extend(card["id"] for card in player["jail_cards"])
    if len(located_cards) != len(expected_cards) or set(located_cards) != expected_cards:
        raise AssertionError("Monopoly card conservation violated")
