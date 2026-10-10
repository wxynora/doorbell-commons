import { T, kit, mesh, branch, ghost } from "./model-kit.js";

function jackLantern(parent, p, size) {
  const g = new T.Group(); g.position.set(...p); g.scale.setScalar(size); parent.add(g); const { mat, ball, rod } = kit(g);
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; ball([Math.cos(a) * .32, .59, Math.sin(a) * .32], [.55, .59, .55], i % 2 ? "#d99451" : "#e3a35b"); }
  branch(g, mat("#7d8150"), [[0, 1.12, 0], [.035, 1.30, -.01], [.15, 1.36, -.02]], .065);
  const glow = new T.MeshToonMaterial({ color: "#ffe0a0", emissive: "#f9b94d", emissiveIntensity: .65, side: T.DoubleSide });
  function face(shape, x, y, z, angle = 0) { const outline = mesh(g, new T.ShapeGeometry(shape), mat("#765132"), [x, y, z - .008]); outline.scale.set(1.15, 1.15, 1); outline.rotation.y = angle; const o = mesh(g, new T.ShapeGeometry(shape), glow, [x, y, z]); o.rotation.y = angle; }
  const eye = new T.Shape(); eye.moveTo(-.10, -.07); eye.lineTo(.09, -.07); eye.lineTo(.025, .105); eye.closePath(); face(eye, -.25, .75, .79, -.23); face(eye, .25, .75, .79, .23);
  const nose = new T.Shape(); nose.moveTo(-.055, 0); nose.lineTo(.055, 0); nose.lineTo(0, .085); nose.closePath(); face(nose, 0, .52, .875);
  const mouth = new T.Shape(); mouth.moveTo(-.28, .045); mouth.quadraticCurveTo(0, -.17, .28, .045); mouth.lineTo(.22, .095); mouth.lineTo(.10, .05); mouth.lineTo(.10, -.005); mouth.lineTo(.035, -.005); mouth.lineTo(.035, .045); mouth.lineTo(-.13, .04); mouth.lineTo(-.13, .085); mouth.closePath(); face(mouth, 0, .35, .79);
  g.userData.lamp = true; return g;
}

function smallCat(parent) {
  const g = new T.Group(); parent.add(g); const { ball, mat } = kit(g), fur = "#514b59";
  ball([0, .20, 0], [.125, .19, .115], fur); ball([0, .43, .02], [.15, .125, .12], fur);
  for (const x of [-.087, .087]) { const ear = mesh(g, new T.ConeGeometry(.061, .14, 3), mat(fur), [x, .57, .006]); ear.rotation.y = .3; ball([x * .66, .45, .132], [.020, .025, .007], "#d6bf7a"); ball([x * .66, .45, .139], [.006, .02, .004], "#524850"); ball([x * .65, .034, .08], [.043, .034, .062], fur); }
  ball([0, .402, .147], [.014, .009, .008], "#b38898"); branch(g, mat(fur), [[.08, .07, -.03], [.26, .1, -.04], [.27, .3, -.07], [.20, .33, -.07]], .03); return g;
}

export function buildHalloweenLamp(g, id) {
  const { cyl, ring, mat, rod, ball } = kit(g);
  if (id === "cat_pumpkin") { jackLantern(g, [-.22, 0, -.03], .61); const cat = smallCat(g); cat.position.set(.48, 0, .26); cat.rotation.y = -.17; }
  if (id === "ghost_lamp") { cyl([0, .055, 0], .28, .11, "#95849d"); ring([0, .115, 0], .23, .023, "#c4ac84"); const body = ghost(g, [0, .14, 0], 1.05); body.traverse(o => { if (o.isMesh && o.material.color.getHexString() === "f5efdf") { const light = o.material.clone(); light.color.set("#fff0ca"); light.emissive.set("#ffd796"); light.emissiveIntensity = .38; o.material = light; } }); for (const x of [-.22, .22]) ball([x, .40, 0], [.07, .045, .055], "#f8e5bc"); g.userData.lamp = true; }
  if (id === "pumpkin_lamppost") { cyl([-.16, .06, 0], .22, .12, "#8b7b92"); cyl([-.16, .16, 0], .12, .12, "#75657f"); rod([-.16, .2, 0], [-.16, 1.73, 0], .042, "#76667f"); branch(g, mat("#76667f"), [[-.16, 1.69, 0], [-.15, 1.96, 0], [.08, 2.08, 0], [.39, 1.98, 0], [.42, 1.85, 0]], .033); ring([-.16, .32, 0], .066, .018, "#c4ac84"); ring([-.16, 1.6, 0], .06, .017, "#c4ac84"); rod([.42, 1.87, 0], [.42, 1.73, 0], .012, "#a09276"); ring([.42, 1.65, 0], .10, .012, "#a09276"); jackLantern(g, [.42, 1.22, 0], .31); }
}
