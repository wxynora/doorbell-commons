"""One shared public projection and only changed private cards per action.

The resulting bundle stays inside the trusted server. Never broadcast the
private map: each subscriber receives only its own patch.
"""
from copy import deepcopy


def diff(old, new, path=None):
    path = [] if path is None else path
    if old == new:
        return []
    if isinstance(old, dict) and isinstance(new, dict):
        result = []
        for key in old.keys() - new.keys():
            result.append({"path": path + [key], "remove": True})
        for key, value in new.items():
            result.extend(diff(old[key], value, path + [key]) if key in old
                          else [{"path": path + [key], "value": deepcopy(value)}])
        return result
    if isinstance(old, list) and isinstance(new, list) and len(old) == len(new):
        return [change for i, value in enumerate(new)
                for change in diff(old[i], value, path + [i])]
    return [{"path": path, "value": deepcopy(new)}]


def _public(engine, kind, state, now):
    if kind == "mahjong":
        result = engine.project_view(state, None)
        result.pop("private", None)
    elif kind == "leaf-game":
        result = engine.project_view(state, None, now_ms=now)
    else:
        result = engine.project_view(state, None)
    for key in ("viewer_id", "legal_actions", "legal_moves", "legal_bid_values", "legal_piece_ids"):
        result.pop(key, None)
    if kind == "uno":
        result.pop("pending", None)
    return result


def _private(engine, kind, old, new, player_id, now, full=False):
    changes = []
    def put(path, value):
        changes.append({"path": path, "value": deepcopy(value)})
    put(["viewer_id"], player_id)
    if kind == "mahjong":
        participant = next(p for p in new["participants"] if p["player_id"] == player_id)
        plugin = engine.Mahjong()
        before, after = old["state"], new["state"]
        changed = full or any(before.get(k, {}).get(player_id) != after.get(k, {}).get(player_id)
                              for k in ("hands", "melds"))
        if changed:
            put(["private"], plugin.private_state(after, participant, new["participants"]))
        else:
            put(["private", "drawn_tile_id"], after.get("drawn_tile_id") if after.get("turn_player_id") == player_id else None)
            actions = [{k: deepcopy(v) for k, v in action.items() if k not in {
                "consume_ids", "tile_id", "meld_index", "code", "engine_tile", "offer"}}
                for action in plugin.legal_actions_for(after, player_id)]
            put(["private", "legal_actions"], actions)
        return changes
    if kind == "leaf-game":
        put(["legal_actions"], engine._legal_actions(new, player_id, max(int(new.get("clock_ms", 0)), now or 0)))
    else:
        moves = engine.legal_moves(new, player_id)
        put(["legal_moves"], moves)
        put(["legal_actions"], list(dict.fromkeys(str(m["action"]) for m in moves)))
        if kind == "doudizhu":
            put(["legal_bid_values"], [int(m["value"]) for m in moves if m["action"] == "bid"])
        if kind == "flying-chess":
            put(["legal_piece_ids"], [str(m["piece_id"]) for m in moves if "piece_id" in m])
    if kind == "uno":
        pending = new["pending"]
        put(["pending"], {"player_id": pending["player_id"], "mine": pending["player_id"] == player_id,
                         "card_id": pending["card_id"] if pending["player_id"] == player_id else None} if pending else None)
    if kind in ("uno", "doudizhu", "leaf-game"):
        index = next(i for i, p in enumerate(new["players"]) if p["id"] == player_id)
        hand = new["players"][index]["hand"]
        previous = next(p for p in old["players"] if p["id"] == player_id)["hand"]
        if full or hand != previous:
            put(["players", index, "hand"], hand if kind == "leaf-game" else [engine._public_card(card) for card in hand])
    return changes


def apply_patch(value, changes):
    value = deepcopy(value)
    for change in changes:
        path = change["path"]
        if not path:
            value = deepcopy(change["value"])
            continue
        target = value
        for key in path[:-1]:
            target = target[key]
        if change.get("remove"):
            del target[path[-1]]
        else:
            target[path[-1]] = deepcopy(change["value"])
    return value


def transition(engine, kind, old, new, actor_id, now=None):
    public_before = _public(engine, kind, old, now)
    public_after = _public(engine, kind, new, now)
    ids = [p["player_id"] for p in new["participants"]] if kind == "mahjong" else [p["id"] for p in new["players"]]
    private = {pid: _private(engine, kind, old, new, pid, now) for pid in ids}
    actor_view = apply_patch(public_after, _private(engine, kind, old, new, actor_id, now, full=True))
    public_changes = diff(public_before, public_after)
    if kind == "leaf-game":
        # Time-derived fields also advance when the underlying deadline did not.
        clock_fields = ("server_now_ms", "final_challenge_remaining_ms")
        public_changes = [c for c in public_changes if c["path"] not in [[k] for k in clock_fields]]
        public_changes.extend({"path": [key], "value": public_after[key]} for key in clock_fields)
    return {"snapshot": new, "actorView": actor_view,
            "changes": {"public": public_changes, "private": private}}
