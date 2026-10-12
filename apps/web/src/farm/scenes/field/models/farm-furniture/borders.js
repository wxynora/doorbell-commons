import { T, kit, colors, mesh, palette, ghost } from "./model-kit.js";

export function buildBorder(id, length = 1, paletteOverride) {
  const g = new T.Group(), { block, rod, ball } = kit(g, paletteOverride), half = length / 2;
  if (id === "stone_wall") {
    block([0, .43, 0], [length, .86, .20], "#92958b");
    for (let row = 0; row < 6; row++) for (let i = 0; i < 4; i++) {
      const w = length / 4, x = -half + w * (i + .5);
      block([x, .085 + row * .14, .015], [w - .018, .125, .25], ["#a7aa9c", "#b7b5a7", "#9da395"][(i + row) % 3]);
    }
    block([0, .89, 0], [length + .015, .08, .29], "#c3c2b3");
  } else if (id === "hedge") {
    block([0, .26, 0], [length, .45, .35], "#709054");
    for (let i = 0; i < 8; i++) ball([-half + length * (i + .5) / 8, .47, (i % 2 - .5) * .06], [length / 7, .11, .18], i % 2 ? "#91a966" : "#839e5c");
  } else {
    const c = id === "white_fence" ? colors.cream : id === "ghost_fence" ? "#80728b" : colors.wood;
    for (const x of [-half, half]) { block([x, .32, 0], [.085, .64, .085], c); ball([x, .655, 0], [.062, .045, .062], c); }
    for (const y of [.2, .46]) block([0, y, -.027], [length, .052, .055], c);
    if (id === "timber_fence") { rod([-half, .13, .015], [half, .51, .015], .027, colors.edge); rod([-half, .51, .02], [half, .13, .02], .027, colors.edge); }
    else for (let i = 0; i < 4; i++) {
      const x = -half + length * (i + .5) / 4;
      block([x, .34, .01], [.077, .52, .048], c);
      mesh(g, new T.ConeGeometry(.053, .07, 4), (paletteOverride ?? palette())(c), [x, .635, .01]).rotation.y = Math.PI / 4;
    }
    if (id === "ghost_fence") ghost(g, [0, .24, .075], .47, paletteOverride);
  }
  if (["white_fence","timber_fence","ghost_fence"].includes(id)) g.scale.set(1,1.3,1.25);
  return g;
}
