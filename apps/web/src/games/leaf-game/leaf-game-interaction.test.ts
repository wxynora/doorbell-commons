import assert from "node:assert/strict";
import test from "node:test";
import type { LeafGameView } from "./leaf-game-client";
import { chooseResidentMove, resolveSelectedPlayAction } from "./leaf-game-interaction";

test("one through sixteen selected cards submit through the table when legal", () => {
  assert.equal(resolveSelectedPlayAction(["lead"], 1, 16, false), "lead");
  assert.equal(resolveSelectedPlayAction(["follow"], 3, 16, false), "follow");
  assert.equal(resolveSelectedPlayAction(["follow"], 16, 16, false), "follow");
});

test("selected cards cannot submit outside the legal count or turn", () => {
  assert.equal(resolveSelectedPlayAction(["follow"], 0, 16, false), null);
  assert.equal(resolveSelectedPlayAction(["follow"], 17, 16, false), null);
  assert.equal(resolveSelectedPlayAction(["follow"], 3, 16, true), null);
  assert.equal(resolveSelectedPlayAction(["challenge", "concede"], 3, 16, false), null);
});

test("resident seats choose one legal move from their own projected hand", () => {
  const view = {
    viewer_id: "p2",
    legal_actions: ["lead"],
    players: [
      {
        id: "p2",
        controller_type: "resident",
        hand: [{ id: "number-7-1", kind: "number", rank: 7, marked: false }],
      },
    ],
  } as LeafGameView;
  assert.deepEqual(chooseResidentMove(view), {
    action: "lead",
    cardIds: ["number-7-1"],
    declaredRank: 7,
  });
});
