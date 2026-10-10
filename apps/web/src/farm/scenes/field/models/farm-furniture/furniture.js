import { T, kit, colors, pot, pumpkin, ghost, branch, mesh } from "./model-kit.js";
import { buildFlowerStand } from "./flower-stand.js";
import { buildHalloweenLamp } from "./halloween-lamps.js";

function seating(g, rocking = false, frame = colors.wood, slats = frame) {
  const { block, rod, mat } = kit(g), w = rocking ? .65 : 1.5;
  for (const x of [-w / 2, w / 2]) { for (const z of [-.23, .23]) rod([x, .06, z], [x, .55, z], .036, frame); rod([x, .47, -.25], [x, 1.02, -.32], .038, frame); if (rocking) branch(g, mat(colors.edge), [[x, .09, -.48], [x, .025, 0], [x, .09, .48]], .035); }
  for (let n = 0; n < 5; n++) block([0, .50, -.22 + n * .105], [w + .14, .05, .082], slats);
  for (let n = 0; n < 3; n++) block([0, .65 + n * .14, -.29], [w + .14, .095, .045], slats);
}

function wheel(g, x, z) {
  const w = new T.Group(); kit(g); g.add(w); w.position.set(x, .25, z); const { ring, rod } = kit(w), o = ring([0, 0, 0], .22, .035, colors.edge);
  o.rotation.set(0, 0, 0);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; rod([0, 0, 0], [Math.cos(a) * .21, Math.sin(a) * .21, 0], .012, colors.wood); }
  return o;
}

export function buildFurniture(id, season = "summer") {
  const g = new T.Group(), { mat, ball, block, rod, cyl, ring } = kit(g);
  if (id === "garden_bench") seating(g, false, "#ffffff", "#ffffff");
  if (id === "stone_fountain" || id === "bird_bath") {
    const small = id === "bird_bath", r = small ? .38 : .73, h = small ? .83 : .45;
    cyl([0, .07, 0], r * .57, .14, "#a4a998"); cyl([0, h * .55, 0], small ? .09 : .17, h, "#b9baaa", small ? .12 : .11); cyl([0, h, 0], r, .10, "#b7b9aa"); ring([0, h + .07, 0], r, .055, "#cdccb9"); cyl([0, h + .058, 0], r * .91, .025, "#94bcb7");
    if (!small) { cyl([0, .79, 0], .075, .60, "#b8b9a8"); cyl([0, 1.02, 0], .35, .065, "#bfc1b0"); ring([0, 1.07, 0], .34, .035, "#d0cfbd"); cyl([0, 1.06, 0], .30, .013, "#aacdc8"); ball([0, 1.24, 0], [.055, .13, .055], "#b1d5d2"); for (let j = 0; j < 6; j++) { const a = j * 1.047; branch(g, mat("#b1d5d2"), [[Math.cos(a) * .31, 1.07, Math.sin(a) * .31], [Math.cos(a) * .42, .92, Math.sin(a) * .42], [Math.cos(a) * .45, .53, Math.sin(a) * .45]], .012); } }
    else { ball([.28, h + .17, .02], [.09, .075, .06], "#c2b7a0"); ball([.31, h + .24, .04], [.052, .048, .047], "#e7dbc4"); ball([.326, h + .253, .08], [.007, .007, .007], "#534c42"); }
  }
  if (id === "flower_stand") buildFlowerStand(g, season);
  if (id === "witch_cauldron") {
    for (const x of [-.31, .31]) for (const z of [-.22, .22]) rod([x, .06, z], [x, .29, z], .046, "#574e60");
    mesh(g, new T.LatheGeometry([[.22, .10], [.38, .18], [.48, .34], [.48, .46], [.43, .58], [.37, .66]].map(([r, y]) => new T.Vector2(r, y)), 20), mat("#665d73"));
    ring([0, .66, 0], .37, .06, "#82758c"); cyl([0, .67, 0], .34, .02, "#acc689");
    for (let i = 0; i < 5; i++) ball([Math.sin(i * 2.4) * .19, .72 + i * .065, Math.cos(i * 2.4) * .17], [.035, .035, .035], "#c7d897");
    for (const x of [-.5, .5]) { const r = ring([x, .48, 0], .12, .025, "#9d8d9f"); r.rotation.set(0, Math.PI / 2, 0); }
    rod([.17, .52, .12], [.45, 1.12, .17], .026, colors.wood); pumpkin(g, [-.5, 0, .4], .18);
  }
  if (["cat_pumpkin", "ghost_lamp", "pumpkin_lamppost"].includes(id)) buildHalloweenLamp(g, id);
  if (id === "ghost_rocker") { seating(g, true); ghost(g, [0, .54, .01], .88); }
  if (id === "bat_arch") {
    for (const x of [-.73, .73]) { rod([x, 0, 0], [x, 1.45, 0], .06, "#7e6e86"); pumpkin(g, [x, 0, .17], .17); }
    branch(g, mat("#7e6e86"), [[-.73, 1.43, 0], [-.55, 1.98, 0], [0, 2.2, 0], [.55, 1.98, 0], [.73, 1.43, 0]], .055);
    for (const x of [-.32, .30]) { const shape = new T.Shape(); shape.moveTo(0, 0); for (const [a, b] of [[-.23, .13], [-.2, -.03], [-.11, .01], [-.06, -.1], [0, -.03], [.06, -.1], [.11, .01], [.2, -.03], [.23, .13], [0, 0]]) shape.lineTo(a, b); mesh(g, new T.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: false }), mat("#625671"), [x, 1.83 - Math.abs(x) * .25, .03]); rod([x, 2.08, 0], [x, 1.85, 0], .007, "#a89aa8"); }
  }
  if (id === "candy_cart") {
    block([0, .48, 0], [1.15, .48, .65], "#9b839f"); block([0, .73, 0], [1.28, .07, .75], "#ddba8d");
    for (const x of [-.43, .43]) for (const z of [-.38, .38]) wheel(g, x, z);
    for (const x of [-.53, .53]) rod([x, .70, -.27], [x, 1.42, -.27], .03, colors.wood);
    for (let i = 0; i < 6; i++) block([-.5 + i * .2, 1.44, 0], [.20, .08, .82], i % 2 ? "#e3b477" : "#8b7499");
    const bulb = mat("#ffe6aa").clone(); bulb.emissive.set("#ffc46b"); bulb.emissiveIntensity = .65;
    branch(g, mat("#a19071"), [[-.59, 1.39, .43], [0, 1.31, .46], [.59, 1.39, .43]], .008);
    for (let i = 0; i < 7; i++) { const x = -.54 + i * .18, y = 1.31 + .08 * (x / .59) ** 2; rod([x, y, .45], [x, y - .065, .45], .007, "#a19071"); mesh(g, new T.SphereGeometry(1, 10, 7), bulb, [x, y - .105, .45], [.037, .048, .037]); }
    for (const x of [-.64, .64]) { rod([x, 1.42, 0], [x, 1.20, 0], .008, "#a19071"); mesh(g, new T.SphereGeometry(1, 12, 8), bulb, [x, 1.10, 0], [.066, .088, .066]); cyl([x, 1.19, 0], .037, .024, "#9e8868"); cyl([x, 1.01, 0], .033, .023, "#9e8868"); }
    for (let j = 0; j < 3; j++) { pot(g, [-.34 + j * .34, .78, 0], .45, "#e3c49a"); for (let k = 0; k < 3; k++) { const x = -.4 + j * .34 + k * .065; rod([x, .88, 0], [x, 1.13 + (k % 2) * .08, 0], .009, "#f0dfc3"); ball([x, 1.15 + (k % 2) * .08, 0], [.06, .06, .025], ["#bd8ca8", "#e1ab67", "#a4b993"][k]); } }
  }
  if (id === "haunted_lantern") {
    cyl([0, .065, 0], .32, .13, "#948399"); const house = new T.Group(); house.rotation.z = -.09; g.add(house); const k = kit(house);
    k.block([0, .48, 0], [.47, .73, .37], "#87748e"); for (const x of [-.13, .13]) { const r = k.block([x, .92, 0], [.40, .07, .51], "#685d78"); r.rotation.z = x < 0 ? .72 : -.72; }
    for (const x of [-.12, .12]) { k.block([x, .58, .19], [.11, .18, .013], "#f2d291"); k.block([x, .58, .20], [.014, .18, .012], "#7c6984"); }
    k.block([0, .23, .194], [.13, .22, .018], "#e8bc78"); k.block([.16, 1.05, -.06], [.09, .30, .09], "#87748e"); pumpkin(g, [-.26, 0, .18], .12);
  }
  return g;
}
