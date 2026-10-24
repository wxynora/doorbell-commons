import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// One small snow turret and its snow guardian, without a miniature castle yard.
export function createSmallSnowFort() {
  const root = new T.Group();
  root.name = 'small-snow-fort';
  const colors = { snow: '#f5f0de', ice: '#bdcdd9', edge: '#d6e1df', shade: '#91abb8' };
  const materials = new Map();
  const mat = color => {
    if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: .95 }));
    return materials.get(color);
  };
  function mesh(geometry, color, position = [0, 0, 0], scale = [1, 1, 1], name = '') {
    const node = new T.Mesh(geometry, typeof color === 'string' ? mat(color) : color);
    node.position.set(...position); node.scale.set(...scale); node.name = name;
    node.castShadow = true; node.receiveShadow = true; root.add(node); return node;
  }
  const ball = (color, p, s, name) => mesh(new T.SphereGeometry(1, 16, 12), color, p, s, name);
  const cylinder = (color, p, radius, height, name) => mesh(new T.CylinderGeometry(radius, radius * 1.015, height, 24), color, p, [1, 1, 1], name);
  const block = (color, p, s, radius = .035) => mesh(new RoundedBoxGeometry(...s, 2, radius), color, p);

  // A thin snow skirt follows the tower's foot, without a display pedestal.
  ball(colors.snow, [0, .035, 0], [.43, .065, .43], 'turret-snow-foot');
  // Real curved wall with an oval opening; the warm pane sits behind its reveal.
  const vertices = [], revealVertices = [];
  const point = (radius, angle, y) => [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
  const quad = (into, a, b, c, d) => into.push(...a, ...b, ...c, ...a, ...c, ...d);
  const halfAngle = Math.asin(.10 / .335);
  const angles = [...Array.from({ length: 129 }, (_, i) => -Math.PI + i * Math.PI * 2 / 128), -halfAngle, halfAngle].sort((a, b) => a - b);
  const opening = angle => {
    const x = Math.sin(angle) * .335;
    const offset = .135 * Math.sqrt(Math.max(0, 1 - (x / .10) ** 2));
    return [.48 - offset, .48 + offset];
  };
  function band(a, b, lowA, lowB, highA, highB) {
    quad(vertices, point(.335, a, lowA), point(.335, b, lowB), point(.335, b, highB), point(.335, a, highA));
    quad(vertices, point(.285, b, lowB), point(.285, a, lowA), point(.285, a, highA), point(.285, b, highB));
  }
  for (let i = 0; i < angles.length - 1; i++) {
    const a = angles[i], b = angles[i + 1];
    if ((a + b) / 2 > -halfAngle && (a + b) / 2 < halfAngle) {
      const [bottomA, topA] = opening(a), [bottomB, topB] = opening(b);
      band(a, b, .035, .035, bottomA, bottomB);
      band(a, b, topA, topB, .825, .825);
      quad(revealVertices, point(.335, a, bottomA), point(.285, a, bottomA), point(.285, b, bottomB), point(.335, b, bottomB));
      quad(revealVertices, point(.335, b, topB), point(.285, b, topB), point(.285, a, topA), point(.335, a, topA));
    } else band(a, b, .035, .035, .825, .825);
  }
  let shellMaterial;
  for (const [data, color, name] of [[vertices, colors.snow, 'small-rounded-turret'], [revealVertices, colors.ice, 'recessed-window-reveal']]) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(data, 3)); geometry.computeVertexNormals();
    const material = mat(color).clone(); material.side = T.DoubleSide;
    if (name === 'small-rounded-turret') {
      shellMaterial = material;
      material.emissive.set('#ffb85d');
      material.emissiveIntensity = 0;
      material.userData.decorationGlow = true;
      material.userData.nightIntensity = .9;
      // Warmth diffuses through the snow around the internal lamp, fading
      // through the thicker/distant parts instead of painting the wall flat.
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vSmallSnowPosition;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSmallSnowPosition = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vSmallSnowPosition;')
          .replace('#include <emissivemap_fragment>', [
            '#include <emissivemap_fragment>',
            'vec3 snowLampDistance = (vSmallSnowPosition - vec3(0.0, 0.48, 0.18)) * vec3(1.0, 1.35, 1.0);',
            'float snowTransmission = 0.10 + 0.90 * exp(-7.0 * dot(snowLampDistance, snowLampDistance));',
            'totalEmissiveRadiance *= snowTransmission;',
          ].join('\n'));
      };
      material.customProgramCacheKey = () => 'small-snow-shell-transmission-v1';
    }
    mesh(geometry, material, [0, 0, 0], [1, 1, 1], name);
  }
  cylinder(colors.edge, [0, .81, 0], .365, .10);
  cylinder(colors.snow, [0, .86, 0], .38, .12);
  cylinder(colors.shade, [0, .925, 0], .255, .016, 'turret-well');
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    const node = block(colors.snow, [Math.cos(angle) * .30, .99, Math.sin(angle) * .30], [.19, .22, .18], .05);
    node.rotation.y = -angle;
  }

  // Recessed glass transmits the internal light; snow walls still occlude it.
  const warm = mat('#e9bf75').clone();
  warm.emissive.set('#ffcf7b'); warm.emissiveIntensity = 0;
  warm.userData.decorationGlow = true; warm.userData.nightIntensity = 2.4;
  const window = ball(warm, [0, .48, .267], [.11, .15, .012], 'small-warm-window');
  window.castShadow = false;
  block(colors.edge, [0, .48, .296], [.014, .27, .014], .004);
  const tower = new T.Group(); tower.name = 'small-turret-piece';
  for (const node of [...root.children]) tower.add(node);
  tower.position.x = -.12; tower.scale.setScalar(.85); root.add(tower);
  const interior = new T.PointLight('#ffb756', 0, 1.7, 2);
  interior.name = 'small-interior-light'; interior.position.set(0, .48, .18);
  interior.visible = false; interior.castShadow = true;
  interior.shadow.mapSize.set(512, 512);
  interior.shadow.camera.near = .025; interior.shadow.camera.far = 1.7;
  interior.shadow.bias = -.00015; interior.shadow.normalBias = .002; interior.shadow.radius = 3;
  interior.userData.decorationGlow = true; interior.userData.nightIntensity = .8;
  tower.add(interior);

  const flag = new T.Group(); flag.name = 'small-blue-pennant';
  flag.position.set(0, .96, -.08); tower.add(flag);
  const pole = mesh(new T.CylinderGeometry(.012, .012, .46, 10), '#a48c71', [0, .20, 0]);
  flag.add(pole);
  const finial = ball('#e7ba68', [0, .45, 0], [.027, .027, .027]); flag.add(finial);
  const clothShape = new T.Shape();
  clothShape.moveTo(.016, .40);
  clothShape.bezierCurveTo(.11, .43, .19, .34, .29, .38);
  clothShape.lineTo(.24, .27); clothShape.lineTo(.29, .19);
  clothShape.bezierCurveTo(.18, .16, .10, .25, .016, .22); clothShape.closePath();
  const cloth = mesh(new T.ExtrudeGeometry(clothShape, { depth: .012, bevelEnabled: false, curveSegments: 10 }), '#819eaf', [0, 0, 0], [1, 1, 1], 'small-flag-cloth');
  flag.add(cloth);
  const starShape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .018 : .039;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (!i) starShape.moveTo(x, y); else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const emblem = mesh(new T.ExtrudeGeometry(starShape, { depth: .005, bevelEnabled: false }), '#e7ba68', [.12, .31, .014]);
  flag.add(emblem);

  const guard = new T.Group(); guard.name = 'small-snow-guardian';
  guard.position.set(.25, .045, .25); guard.scale.setScalar(.75); guard.rotation.y = -.12; root.add(guard);
  function guardBall(color, position, scale, name = '') {
    const node = ball(color, position, scale, name); guard.add(node); return node;
  }
  function guardBlock(color, position, size, radius = .02) {
    const node = block(color, position, size, radius); guard.add(node); return node;
  }
  guardBall(colors.snow, [0, .14, 0], [.18, .18, .17]);
  guardBall(colors.snow, [0, .365, .015], [.17, .16, .155], 'guardian-head');
  for (const x of [-.05, .05]) {
    guardBall('#535354', [x, .385, .158], [.013, .020, .009]);
    guardBall('#f0baaa', [x * 1.75, .346, .149], [.028, .013, .009]);
  }
  guardBall('#d0a16e', [0, .354, .175], [.031, .020, .037]);
  const scarf = mesh(new T.TorusGeometry(.125, .031, 6, 24), '#bd7773', [0, .243, .01]);
  scarf.rotation.x = Math.PI / 2; guard.add(scarf);
  guardBlock('#bd7773', [.095, .16, .132], [.06, .16, .04], .017).rotation.z = -.14;
  guardBall('#819eaf', [0, .49, .012], [.17, .065, .15]);
  guardBall('#819eaf', [.025, .54, .002], [.13, .075, .125]);
  guardBall(colors.snow, [.06, .615, .015], [.049, .049, .049]);
  const brim = mesh(new T.TorusGeometry(.146, .022, 6, 24), '#819eaf', [0, .487, .014]);
  brim.rotation.x = Math.PI / 2; guard.add(brim);
  guardBall(colors.snow, [0, .13, .20], [.095, .095, .095], 'hugged-snowball');
  for (const x of [-.115, .115]) guardBall(colors.snow, [x, .16, .18], [.056, .065, .055]);
  for (const x of [-.10, .10]) guardBall(colors.snow, [x, .02, .08], [.085, .04, .09]);
  root.userData.front = '+Z';
  root.userData.setNight = night => {
    warm.emissiveIntensity = night ? 2.4 : 0;
    shellMaterial.emissiveIntensity = night ? .9 : 0;
    interior.intensity = night ? .8 : 0; interior.visible = Boolean(night);
  };
  root.updateMatrixWorld(true);
  return root;
}
