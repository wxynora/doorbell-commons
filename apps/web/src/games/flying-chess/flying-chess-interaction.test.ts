import { strict as assert } from "node:assert";
import test from "node:test";
import type { FlyingView } from "./flying-chess-client";
import {
  chooseResidentMove,
  HOME_POINTS,
  launchRotation,
  moveActionLabel,
  moveForPiece,
  pointForPiece,
  TRACK_POINTS,
} from "./flying-chess-interaction";

function view(): FlyingView {
  return {
    game_id: "g1",
    rules_version: "v1",
    revision: 2,
    status: "active",
    phase: "awaiting_move",
    round: 1,
    viewer_id: "p1",
    current_player_id: "p2",
    dice: 4,
    last_roll: null,
    consecutive_sixes: 0,
    winner_id: null,
    players: [
      {
        id: "p1",
        name: "桃桃",
        seat: 0,
        controller_type: "human",
        accent: "coral",
        wins: 0,
        hangar_count: 4,
        goal_count: 0,
        pieces: [],
      },
      {
        id: "p2",
        name: "团团",
        seat: 1,
        controller_type: "resident",
        accent: "gold",
        wins: 0,
        hangar_count: 2,
        goal_count: 0,
        pieces: [
          { id: "a", number: 1, progress: 8, zone: "track", finished: false, outer_index: 20 },
          { id: "b", number: 2, progress: 23, zone: "track", finished: false, outer_index: 35 },
        ],
      },
      {
        id: "p3",
        name: "蓝莓",
        seat: 2,
        controller_type: "human",
        accent: "sky",
        wins: 0,
        hangar_count: 4,
        goal_count: 0,
        pieces: [],
      },
      {
        id: "p4",
        name: "青柠",
        seat: 3,
        controller_type: "resident",
        accent: "mint",
        wins: 0,
        hangar_count: 4,
        goal_count: 0,
        pieces: [],
      },
    ],
    board: {
      outer_length: 52,
      main_steps: 50,
      home_steps: 6,
      goal_progress: 57,
      start_indices: [0, 13, 26, 39],
      own_color_progress: [2, 6, 10],
      flight_source_progress: 18,
      flight_dest_progress: 30,
      home_cross_progress: 54,
    },
    last_move: null,
    legal_actions: ["move"],
    legal_piece_ids: ["a", "b"],
    legal_moves: [
      { action: "move", piece_id: "a", piece_number: 1 },
      { action: "move", piece_id: "b", piece_number: 2 },
    ],
    recent_events: [],
  };
}

test("board path contains all 52 distinct outer cells", () => {
  assert.equal(TRACK_POINTS.length, 52);
  assert.equal(new Set(TRACK_POINTS.map((point) => `${point.x},${point.y}`)).size, 52);
});

test("each drawn flight path crosses the opposite home lane fourth cell", () => {
  const current = view();
  current.board.start_indices.forEach((start, seat) => {
    const source =
      TRACK_POINTS[(start + current.board.flight_source_progress - 1) % current.board.outer_length];
    const destination =
      TRACK_POINTS[(start + current.board.flight_dest_progress - 1) % current.board.outer_length];
    const crossing = HOME_POINTS[(seat + 2) % 4]?.[3];
    assert.ok(source && destination && crossing);
    const crossProduct =
      (destination.x - source.x) * (crossing.y - source.y) -
      (destination.y - source.y) * (crossing.x - source.x);
    assert.ok(Math.abs(crossProduct) < 1e-9, `seat ${seat} path misses crossing cell`);
  });
});

test("piece positions resolve across track and hangar", () => {
  const current = view();
  const player = current.players[1];
  assert.ok(player);
  const piece = player.pieces[0];
  assert.ok(piece);
  assert.deepEqual(pointForPiece(player, piece), TRACK_POINTS[20]);
  assert.deepEqual(
    pointForPiece(player, { id: "c", number: 3, progress: -1, zone: "hangar", finished: false }),
    { x: 1.7, y: 4.2 },
  );
});

test("launch arrows point from every hangar toward its route", () => {
  assert.deepEqual([0, 1, 2, 3].map(launchRotation), [0, 90, 180, 270]);
});

test("piece action labels distinguish takeoff, movement, and penalty", () => {
  const current = view();
  assert.equal(
    moveActionLabel(current, { action: "move", piece_id: "a", piece_number: 1 }),
    "前进",
  );
  const player = current.players[1];
  assert.ok(player);
  const piece = player.pieces[0];
  assert.ok(piece);
  piece.zone = "hangar";
  assert.equal(
    moveActionLabel(current, { action: "move", piece_id: "a", piece_number: 1 }),
    "起飞",
  );
  assert.equal(
    moveActionLabel(current, { action: "penalty_return", piece_id: "a", piece_number: 1 }),
    "返航",
  );
});

test("legal piece action and resident choice use the authoritative move list", () => {
  const current = view();
  assert.equal(moveForPiece(current, "a")?.action, "move");
  assert.equal(moveForPiece(current, "missing"), null);
  assert.deepEqual(chooseResidentMove(current), {
    action: "move",
    piece_id: "b",
    piece_number: 2,
  });
});
