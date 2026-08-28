import { strict as assert } from "node:assert";
import test from "node:test";
import type { UnoMove, UnoView } from "./uno-client";
import {
  chooseResidentMove,
  colorChoicesForCard,
  playForCard,
  playsForCard,
} from "./uno-interaction";

function viewWith(moves: UnoMove[]): UnoView {
  return {
    game_id: "uno-test",
    rules_version: "doorbell.bisca.uno.v2",
    revision: 0,
    status: "active",
    phase: "playing",
    round: 1,
    viewer_id: "p2",
    current_player_id: "p2",
    leader_id: "p1",
    direction: 1,
    direction_label: "顺时针",
    players: [
      {
        id: "p2",
        name: "团团",
        seat: 1,
        controller_type: "resident",
        accent: "sky",
        score: 0,
        hand_count: 3,
        uno: false,
        uno_missed: false,
        hand: [
          {
            id: "W#1",
            color: null,
            value: "W",
            kind: "wild",
            number: null,
            points: 50,
            wild: true,
            label: "万能",
          },
          {
            id: "G5#1",
            color: "G",
            value: "5",
            kind: "number",
            number: 5,
            points: 5,
            wild: false,
            label: "绿5",
          },
          {
            id: "G7#1",
            color: "G",
            value: "7",
            kind: "number",
            number: 7,
            points: 7,
            wild: false,
            label: "绿7",
          },
        ],
      },
    ],
    top_card: null,
    active_color: "R",
    active_color_name: "红",
    deck_count: 80,
    discard_count: 1,
    pending: null,
    uno_catch: null,
    last_results: null,
    rounds: [],
    rules: { stack_draw2: false },
    legal_actions: [...new Set(moves.map((move) => move.action))],
    legal_moves: moves,
    recent_events: [],
  };
}

test("normal cards use only the authoritative legal move", () => {
  const normal = { action: "play", card_id: "R5#1", label: "红5" } as const;
  const view = viewWith([normal, { action: "draw", label: "摸一张" }]);
  assert.deepEqual(playsForCard(view, "R5#1"), [normal]);
  assert.deepEqual(playForCard(view, "R5#1"), normal);
  assert.equal(playForCard(view, "B9#1"), null);
});

test("wild cards only offer colors from authoritative legal moves", () => {
  const moves: UnoMove[] = [
    { action: "play", card_id: "W#1", color: "R", label: "万能变红" },
    { action: "play", card_id: "W#1", color: "G", label: "万能变绿" },
    { action: "play", card_id: "W#1", color: "B", label: "万能变蓝" },
    { action: "play", card_id: "W#1", color: "Y", label: "万能变黄" },
  ];
  const view = viewWith(moves);
  assert.deepEqual(colorChoicesForCard(view, "W#1"), ["R", "G", "B", "Y"]);
  assert.deepEqual(playForCard(view, "W#1", "B"), moves[2]);
});

test("resident choices stay legal and prefer the strongest remaining color", () => {
  const moves: UnoMove[] = [
    { action: "play", card_id: "W#1", color: "R", label: "万能变红" },
    { action: "play", card_id: "W#1", color: "G", label: "万能变绿" },
    { action: "play", card_id: "W#1", color: "B", label: "万能变蓝" },
    { action: "play", card_id: "W#1", color: "Y", label: "万能变黄" },
    { action: "draw", label: "摸一张" },
  ];
  assert.deepEqual(chooseResidentMove(viewWith(moves)), moves[1]);
  const draw = { action: "draw", label: "摸一张" } as const;
  assert.deepEqual(chooseResidentMove(viewWith([draw])), draw);
});

test("local resident policy does not force UNO calls or catches", () => {
  const catchUno = {
    action: "catch_uno",
    offender_id: "p1",
    label: "抓 玩家1 漏喊",
  } as const;
  const callUno = { action: "call_uno", label: "喊 UNO" } as const;
  const play = { action: "play", card_id: "G5#1", label: "绿5" } as const;
  assert.deepEqual(chooseResidentMove(viewWith([catchUno, play])), play);
  assert.deepEqual(chooseResidentMove(viewWith([callUno, play])), play);
  assert.equal(chooseResidentMove(viewWith([catchUno])), null);
  assert.equal(chooseResidentMove(viewWith([callUno])), null);
});
