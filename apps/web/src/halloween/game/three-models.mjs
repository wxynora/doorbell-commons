import * as THREE from 'three';
import { COLORS } from './catalog.mjs';

export const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .58, ...extra });
export function mesh(geometry, mat, position = [0, 0, 0], scale = null) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(...position); if (scale) object.scale.set(...scale);
  object.castShadow = true; object.receiveShadow = true; return object;
}
export const sphere = (r, mat, position, scale) => mesh(new THREE.SphereGeometry(r, 20, 14), mat, position, scale);
export const cylinder = (top, bottom, h, mat, position, segments = 24) => mesh(new THREE.CylinderGeometry(top, bottom, h, segments), mat, position);
export const box = (w, h, d, mat, position) => mesh(new THREE.BoxGeometry(w, h, d), mat, position);

function roundedRect(w, h, radius) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2, r = radius;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
export function softBox(w, h, d, color, position = [0, 0, 0], radius = .12) {
  const geometry = new THREE.ExtrudeGeometry(roundedRect(w, d, radius), {
    depth: h, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: Math.min(radius / 2, h / 3), bevelThickness: Math.min(radius / 2, h / 3), curveSegments: 10,
  });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -h / 2, 0);
  return mesh(geometry, typeof color === 'object' ? color : material(color), position);
}

export function candyShape(id, size = 1) {
  const shape = new THREE.Shape();
  if (id === 'star') {
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .45 : 1;
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
  } else if (id === 'heart') {
    shape.moveTo(0, -.9);
    shape.bezierCurveTo(-1.45, .05, -.8, 1.35, 0, .55);
    shape.bezierCurveTo(.8, 1.35, 1.45, .05, 0, -.9);
  } else if (id === 'pumpkin') {
    shape.moveTo(0, .78);
    shape.bezierCurveTo(-.8, 1.15, -1.16, .47, -.95, -.25);
    shape.bezierCurveTo(-.78, -1, -.32, -1.03, 0, -.82);
    shape.bezierCurveTo(.32, -1.03, .78, -1, .95, -.25);
    shape.bezierCurveTo(1.16, .47, .8, 1.15, 0, .78);
  } else if (id === 'ghost') {
    shape.moveTo(-.77, -.8);
    shape.bezierCurveTo(-.65, -.25, -.82, .35, -.5, .75);
    shape.bezierCurveTo(-.17, 1.12, .45, 1.03, .64, .53);
    shape.bezierCurveTo(.82, .05, .59, -.36, .83, -.8);
    shape.quadraticCurveTo(.57, -.55, .31, -.83);
    shape.quadraticCurveTo(0, -.55, -.28, -.85);
    shape.quadraticCurveTo(-.52, -.59, -.77, -.8);
  } else throw new TypeError('unknown_candy_shape');
  const points = shape.getPoints(64);
  const scaled = new THREE.Shape(points.map(point => point.multiplyScalar(size)));
  return scaled;
}

export function createCandy(id, colorId, size = .4) {
  const color = COLORS.find(color => color.id === colorId)?.hex;
  if (!color) throw new TypeError('unknown_candy_color');
  const group = new THREE.Group();
  const geometry = new THREE.ExtrudeGeometry(candyShape(id, size), { depth: size * .36, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: size * .1, bevelThickness: size * .08, curveSegments: 20 });
  geometry.translate(0, 0, -size * .18);
  const body = mesh(geometry, new THREE.MeshPhysicalMaterial({ color, roughness: .24, clearcoat: .85, clearcoatRoughness: .2, metalness: 0, transmission: .03, thickness: .3 }));
  group.add(body);
  if (id === 'ghost') {
    const eye = material('#4c293c');
    for (const x of [-.24, .24]) group.add(sphere(size * .075, eye, [size * x, size * .22, size * .28], [1, 1.15, .45]));
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(size * .12, size * .025, 6, 12, Math.PI), eye);
    mouth.rotation.z = Math.PI; mouth.position.set(0, -size * .02, size * .3); group.add(mouth);
  }
  if (id === 'pumpkin') {
    const stem = softBox(size * .18, size * .11, size * .28, '#699977');
    stem.rotation.x = Math.PI / 2; stem.rotation.z = -.2; stem.position.set(size * .04, size * .88, size * .12); group.add(stem);
  }
  return group;
}

function labelTexture(name, color = '#3a2337') {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff0d6'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 34px "Songti SC",serif';
  const words = name.length > 5 ? [name.slice(0, Math.ceil(name.length / 2)), name.slice(Math.ceil(name.length / 2))] : [name];
  words.forEach((word, index) => ctx.fillText(word, 128, words.length === 1 ? 64 : 43 + index * 42));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
const TIER_COLOR = { N: '#e9c68a', R: '#a0ba9d', SR: '#ac96c2', SSR: '#dca785', SP: '#e6be67' };
const BERRIES = ['夜影莓', '蔓越莓', '午夜黑醋栗', '血月石榴'];

// Each catalog entry has a real food/container model; rare ingredients reuse
// coherent vessel families with their own contents, labels, colors and adornment.
export function createIngredient(name, tier = 'N') {
  const group = new THREE.Group(), accent = TIER_COLOR[tier];
  const cream = material('#f3dfba'), brown = material('#8e5735'), green = material('#65967a');
  const add = object => { group.add(object); return object; };
  const nameTag = (y, z, width = .65) => {
    const tag = mesh(new THREE.PlaneGeometry(width, width / 2), new THREE.MeshBasicMaterial({ map: labelTexture(name), side: THREE.DoubleSide }), [0, y, z]);
    add(tag);
  };
  if (name === '苹果' || name === '栗子' || name === '金南瓜籽') {
    const apple = name === '苹果', seed = name === '金南瓜籽';
    add(sphere(.43, material(apple ? '#c6635b' : seed ? '#e7bc50' : '#8f5737'), [0, .4, 0], seed ? [.8, .4, 1.1] : [1, .92, 1]));
    if (!seed) { add(cylinder(.04, .035, .23, brown, [.03, .83, 0], 8)); const leaf = add(sphere(.14, green, [.17, .84, .03], [1.6, .2, .7])); leaf.rotation.z = -.4; }
  } else if (name.includes('薄荷') || name.includes('花瓣')) {
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const leaf = add(sphere(.22, material(name.includes('花瓣') ? '#a07bb3' : name === '月影薄荷' ? '#86bdba' : '#75aa83'), [Math.cos(angle) * .19, .24 + i * .035, Math.sin(angle) * .19], [1, .14, 1.8])); leaf.rotation.y = -angle;
    }
    add(cylinder(.035, .035, .65, green, [0, .3, 0], 8));
  } else if (name === '肉桂' || name === '香草荚') {
    for (let i = 0; i < 4; i++) { const stick = add(cylinder(.055, .06, .95, material(name === '肉桂' ? '#a76c43' : '#63473a'), [(i % 2 - .5) * .15, .18 + Math.floor(i / 2) * .12, 0], 10)); stick.rotation.x = Math.PI / 2; stick.rotation.z = .08 * (i - 1); }
    const ribbon = add(new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 6, 16), material('#b488bb'))); ribbon.rotation.x = Math.PI / 2; ribbon.position.y = .22;
  } else if (name === '黄油' || name === '黑巧克力' || name === '午夜蜂巢糖' || name === '焦糖') {
    const chocolate = name === '黑巧克力', caramel = name === '焦糖';
    add(softBox(.88, .19, .6, chocolate ? '#5d3a37' : caramel ? '#cf9654' : '#f0ce7f', [0, .18, 0], .07));
    for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) add(softBox(.23, .1, .22, chocolate ? '#70453d' : '#e9bd65', [(x - 1) * .26, .31, (z - .5) * .25], .04));
  } else if (name === '玉米粒') {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) add(sphere(.115, material(i % 2 ? '#f5cf65' : '#e7b34c'), [(i - 2) * .16, .18 + row * .12, (row - 1) * .15], [1, .85, 1]));
  } else if (name === '紫薯') {
    const yam = add(sphere(.4, material('#9e708e'), [0, .33, 0], [1.3, .65, .7])); yam.rotation.y = .4;
  } else if (BERRIES.includes(name)) {
    add(cylinder(.44, .32, .2, cream, [0, .17, 0]));
    const color = name === '夜影莓' ? '#77668f' : name === '午夜黑醋栗' ? '#554665' : '#ba575e';
    for (let i = 0; i < 8; i++) { const a = i * 2.4; add(sphere(.14, material(color), [Math.sin(a) * .25, .35 + (i % 3) * .035, Math.cos(a) * .25])); }
  } else if (name.includes('奶霜') || name.includes('奶油') || name.includes('糖霜') || name === '南瓜泥') {
    add(cylinder(.4, .3, .28, material(accent), [0, .2, 0]));
    const filling = material(name === '南瓜泥' ? '#e8aa58' : '#fff0da');
    for (let i = 0; i < 4; i++) add(sphere(.31 - i * .055, filling, [Math.sin(i) * .025, .38 + i * .12, 0], [1, .55, 1]));
  } else if (name === '砂糖' || name === '红糖' || name.includes('岩盐') || name.includes('糖粉')) {
    add(cylinder(.3, .43, .58, material(name === '红糖' ? '#b99571' : '#e5d6b4'), [0, .35, 0], 10));
    add(cylinder(.32, .28, .08, material('#f3ead1'), [0, .66, 0], 12));
    nameTag(.36, .365, .57);
  } else {
    const bottle = name === '牛奶' || name.includes('糖浆') || name.includes('花蜜') || name.includes('月光露');
    const color = name === '牛奶' ? '#f8ebd6' : name.includes('星') ? '#c4a5d4' : name.includes('月') || name.includes('永夜') ? '#8274ae' : name.includes('南瓜') ? '#e7a24d' : '#dfb66d';
    add(cylinder(bottle ? .25 : .36, bottle ? .29 : .4, bottle ? .78 : .6, material(color), [0, bottle ? .47 : .37, 0]));
    add(cylinder(.31, .31, .12, brown, [0, bottle ? .93 : .74, 0]));
    const band = add(new THREE.Mesh(new THREE.TorusGeometry(bottle ? .27 : .38, .04, 6, 24), material(accent))); band.rotation.x = Math.PI / 2; band.position.y = bottle ? .81 : .64;
    nameTag(bottle ? .49 : .38, bottle ? .295 : .405, bottle ? .47 : .62);
    if (name === '蛛丝棉花糖') for (let i = 0; i < 4; i++) add(sphere(.12, cream, [Math.sin(i * 2) * .25, .89, Math.cos(i * 2) * .25]));
    if (name === '蝙蝠翼糖片') { const bat = createCandy('heart', 'plum', .2); bat.rotation.x = -Math.PI / 2; bat.position.y = .92; add(bat); }
  }
  group.userData.ingredient = name; return group;
}

export function disposeScene(scene) {
  const seen = new Set();
  scene.traverse(object => {
    if (object.geometry && !seen.has(object.geometry)) { seen.add(object.geometry); object.geometry.dispose(); }
    for (const mat of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      if (seen.has(mat)) continue; seen.add(mat); mat.map?.dispose(); mat.dispose();
    }
  });
}
