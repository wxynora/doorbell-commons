"""Trusted standalone boundary. Caller identity must be bound by a future room adapter."""
from copy import deepcopy
import random
from .cedar import Mahjong


def create_game(game_id, players, seed=None):
    if not isinstance(game_id, str) or not game_id:
        raise ValueError("缺少对局编号")
    if not isinstance(players, list) or len(players) != 4:
        raise ValueError("麻将需要四名玩家")
    if any(not isinstance(p, dict) or not isinstance(p.get("id"), str) or not p["id"]
           or not isinstance(p.get("name"), str) or not p["name"]
           or p.get("controller_type") not in ("human", "resident") for p in players):
        raise ValueError("玩家资料无效")
    if len({p["id"] for p in players}) != 4:
        raise ValueError("玩家编号不能重复")
    participants = [{"player_id": p["id"], "display_name": p["name"],
                     "controller_type": p["controller_type"], "seat_index": i}
                    for i, p in enumerate(players)]
    return {"game_id": game_id, "revision": 0, "participants": participants,
            "state": Mahjong(random.Random(seed) if seed is not None else None).initialize(participants),
            "receipts": {}}


def project_view(game, viewer_id):
    plugin = Mahjong()
    viewer = next((p for p in game["participants"] if p["player_id"] == viewer_id), None)
    return {"game_id": game["game_id"], "revision": game["revision"],
            "participants": deepcopy(game["participants"]),
            "public": plugin.public_state(game["state"], game["participants"]),
            "private": plugin.private_state(game["state"], viewer, game["participants"]) if viewer else None,
            "viewer_id": viewer_id if viewer else None}


def apply_command(game, command):
    if not isinstance(command, dict) or set(command) != {"command_id", "revision", "actor_id", "action_id"}:
        raise ValueError("行动字段不完整")
    command_id = command["command_id"]
    if not isinstance(command_id, str) or not command_id:
        raise ValueError("缺少行动编号")
    previous = game["receipts"].get(command_id)
    if previous is not None:
        if previous != command:
            raise ValueError("行动编号已用于不同内容")
        return game
    if type(command["revision"]) is not int or command["revision"] != game["revision"]:
        raise ValueError("局面已更新")
    actor = next((p for p in game["participants"] if p["player_id"] == command["actor_id"]), None)
    if actor is None:
        raise ValueError("不在本桌")
    plugin = Mahjong()
    move = {"action": "act", "action_id": command["action_id"]}
    plugin.validate_action(game["state"], move, actor)
    applied = plugin.apply_action(game["state"], move, actor)
    updated = deepcopy(game)
    updated["state"] = applied.state
    updated["revision"] += 1
    updated["receipts"][command_id] = deepcopy(command)
    return updated
