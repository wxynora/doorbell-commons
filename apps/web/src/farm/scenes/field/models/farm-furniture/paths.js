import { T, kit, pumpkin } from "./model-kit.js";

export function buildPath(id) {
  const root = new T.Group(), { block, cyl, rod } = kit(root);
  if (id === "log_steps") for (let i = 0; i < 3; i++) { const x = i % 2 ? .17 : -.12, z = -.3 + i * .29; cyl([x, .035, z], .22, .07, "#957954"); cyl([x, .073, z], .18, .008, "#cbb58a"); }
  if (id === "moss_path" || id === "pumpkin_path") {
    for (let i = 0; i < 4; i++) { const x = (i % 2 - .5) * .40, z = (Math.floor(i / 2) - .5) * .41, s = cyl([x, .035, z], .23, .07, "#aaa998"); s.scale.z = .78; }
    if (id === "moss_path") for (let j = 0; j < 9; j++) block([Math.sin(j * 2.4) * .37, .045, Math.cos(j * 2.4) * .37], [.11, .02, .09], "#899765");
    else for (const z of [-.29, .29]) pumpkin(root, [.38, .07, z], .105);
  }
  if (id === "checker_tiles" || id === "web_tiles") {
    for (let i = 0; i < 9; i++) block([(i % 3 - 1) * .30, .025, (Math.floor(i / 3) - 1) * .30], [.29, .05, .29], id === "web_tiles" ? "#81778e" : i % 2 ? "#abae9b" : "#e0d5b9");
    if (id === "web_tiles") { for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; rod([0, .056, 0], [Math.cos(a) * .40, .056, Math.sin(a) * .40], .005, "#d4cadb"); } for (const r of [.13, .26, .39]) for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4, b = (j + 1) * Math.PI / 4; rod([Math.cos(a) * r, .056, Math.sin(a) * r], [Math.cos(b) * r, .056, Math.sin(b) * r], .004, "#d4cadb"); } }
  }
  return root;
}
