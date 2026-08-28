import { strict as assert } from "node:assert";
import test from "node:test";
import type { WerewolfMove, WerewolfView } from "./werewolf-client";
import {
  chooseResidentMove,
  moveByAction,
  phaseCopy,
  residentSpeech,
  targetMove,
} from "./werewolf-interaction";

function viewWith(phase: WerewolfView["phase"], moves: WerewolfMove[]): WerewolfView {
  return {
    game_id: "werewolf-test",
    rules_version: "doorbell.werewolf.simple.v1",
    revision: 3,
    status: phase === "round_over" ? "finished" : "active",
    phase,
    day: 1,
    night: 1,
    viewer_id: "p1",
    current_player_id: phase === "round_over" ? null : "p1",
    winner: null,
    result: null,
    players: [
      {
        id: "p1",
        name: "桃桃",
        seat: 0,
        controller_type: "resident",
        accent: "coral",
        alive: true,
        death: null,
        role: "seer",
        role_name: "预言家",
      },
      {
        id: "p2",
        name: "团团",
        seat: 1,
        controller_type: "human",
        accent: "gold",
        alive: true,
        death: null,
        role: null,
        role_name: null,
      },
    ],
    private: {
      role: "seer",
      role_name: "预言家",
      team: "villagers",
      seer_checks: [{ night: 1, target_id: "p2", is_wolf: true }],
    },
    last_deaths: [],
    rules: { min_player_count: 6, max_player_count: 12, player_count: 8, role_deck: [] },
    legal_actions: [...new Set(moves.map((move) => move.action))],
    legal_moves: moves,
    recent_events: [],
  };
}

test("player targets use only authoritative legal moves", () => {
  const vote = { action: "vote", target_id: "p2", label: "投票给 团团" } as const;
  const view = viewWith("day_vote", [vote]);
  assert.deepEqual(targetMove(view, "p2"), vote);
  assert.equal(targetMove(view, "missing"), null);
});

test("witch and hunter controls resolve by exact action", () => {
  const pass = { action: "witch", use: "pass", label: "不用药" } as const;
  const heal = { action: "witch", use: "heal", target_id: "p2", label: "救下 团团" } as const;
  const view = viewWith("night_witch", [pass, heal]);
  assert.deepEqual(moveByAction(view, "witch", "heal"), heal);
  assert.deepEqual(chooseResidentMove(view), heal);
});

test("resident discussion produces a public speech without pretending to be a model", () => {
  const view = viewWith("discussion", [
    { action: "speak", label: "公开发言" },
    { action: "pass_speech", label: "过麦" },
  ]);
  const move = chooseResidentMove(view);
  assert.equal(move?.action, "speak");
  assert.equal(move && "text" in move ? move.text : null, residentSpeech(view));
});

test("seer resident votes for a known living wolf when legal", () => {
  const wolfVote = { action: "vote", target_id: "p2", label: "投票给 团团" } as const;
  assert.deepEqual(chooseResidentMove(viewWith("day_vote", [wolfVote])), wolfVote);
  assert.match(phaseCopy(viewWith("day_vote", [wolfVote])).instruction, /点一名玩家/);
});
