import { strict as assert } from "node:assert";
import test from "node:test";
import type { DdzView } from "./doudizhu-client";
import { chooseResidentMove, resolveSelectedMove, tableOpponents } from "./doudizhu-interaction";

function view(): DdzView {
  return {
    game_id: "g1",
    rules_version: "v1",
    revision: 2,
    status: "active",
    phase: "playing",
    round: 1,
    viewer_id: "p1",
    current_player_id: "p1",
    leader_id: "p1",
    landlord_id: "p1",
    players: [
      {
        id: "p1",
        name: "一",
        seat: 0,
        controller_type: "human",
        accent: "coral",
        is_landlord: true,
        bid: 1,
        passed: false,
        played_count: 0,
        score: 0,
        hand_count: 2,
        hand: [],
      },
      {
        id: "p2",
        name: "二",
        seat: 1,
        controller_type: "resident",
        accent: "sky",
        is_landlord: false,
        bid: 0,
        passed: false,
        played_count: 0,
        score: 0,
        hand_count: 17,
      },
      {
        id: "p3",
        name: "三",
        seat: 2,
        controller_type: "human",
        accent: "gold",
        is_landlord: false,
        bid: 0,
        passed: false,
        played_count: 0,
        score: 0,
        hand_count: 17,
      },
    ],
    bids: [],
    high_bid: null,
    base: 1,
    bottom_cards: null,
    field: null,
    last_to_play: null,
    pile_count: 0,
    pass_streak: 0,
    bombs: 0,
    multiplier: 1,
    spring: false,
    anti_spring: false,
    round_winner: null,
    last_results: null,
    winner_id: null,
    legal_actions: ["play"],
    legal_bid_values: [],
    legal_moves: [
      {
        action: "play",
        card_ids: ["S3"],
        as: "single",
        combo: { type: "single", size: 1, main_rank: 3, length: 1, cards: ["S3"], label: "单张" },
      },
      {
        action: "play",
        card_ids: ["S4", "H4"],
        as: "pair",
        combo: {
          type: "pair",
          size: 2,
          main_rank: 4,
          length: 1,
          cards: ["S4", "H4"],
          label: "对子",
        },
      },
    ],
    recent_events: [],
  };
}

test("multi-card selection resolves only as one legal play", () => {
  const current = view();
  assert.equal(resolveSelectedMove(current, ["H4", "S4"])?.action, "play");
  assert.equal(resolveSelectedMove(current, ["S3", "S4"]), null);
});

test("resident chooses a legal ordinary play before bombs", () => {
  assert.deepEqual(chooseResidentMove(view()), view().legal_moves[0]);
});

test("opponents retain clockwise seat order around the viewer", () => {
  assert.deepEqual(
    tableOpponents(view()).map((player) => player?.id),
    ["p2", "p3"],
  );
});
