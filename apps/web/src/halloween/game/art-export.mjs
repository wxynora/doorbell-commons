import * as THREE from 'three';
import { createCandy, createIngredient, disposeScene } from './three-models.mjs';
import { SHAPES, COLORS } from './catalog.mjs';
import {COOKING_MOLDS} from '../shared/cooking-rules.mjs';
import { MATERIALS } from '../shared/materials.mjs';
import { createFoodModel, createPileFoodModel } from './food-models.mjs';
import { createPileFoodModel as newPile } from './pantry-objects-v5.mjs';
import { createSweet } from './candy-models-v2.mjs';
import { studioEnvironment } from './model-kit-v4.mjs';
export async function exportArt() {
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(320, 320); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();const environment=studioEnvironment(renderer);scene.environment=environment.texture;scene.environmentIntensity=.65;let camera = new THREE.PerspectiveCamera(32, 1, .1, 20);
  camera.position.set(1.2, 1.1, 4.2); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#ffffff', '#a699b6', 2));
  const light = new THREE.DirectionalLight('#ffffff', 2.4); light.position.set(-3, 5, 5); scene.add(light);
  const artMode=new URLSearchParams(location.search).get('export-art'),gameOnly=artMode?.startsWith('game'),gameFlat=['game-flat','game-v4','game-v5'].includes(artMode),newGame=['game-v4','game-v5'].includes(artMode),newCandy=['candy-v2','candy-v3'].includes(artMode),expanded=artMode==='candy-v3';
  if(newGame)camera=new THREE.OrthographicCamera(-1.16,1.16,1.16,-1.16,.1,20);
  if(gameFlat){camera.position.set(0,4.3,newGame?0:.6);camera.up.set(0,0,-1);camera.lookAt(0,0,0);}
  const objects = gameOnly ? Object.entries(MATERIALS).flatMap(([tier,names])=>names.map(name=>({kind:'game-objects',name:`m${Object.values(MATERIALS).flat().indexOf(name)}`,object:(newGame?newPile:gameFlat?createPileFoodModel:createFoodModel)(name,tier)}))) : [
    ...(expanded?COOKING_MOLDS:SHAPES).flatMap(shape => COLORS.map(color => ({ kind: 'candies', name: `${shape.id}-${color.id}`, object: (newCandy?createSweet:createCandy)(shape.id, color.id, .75) }))),
    ...(newCandy?[]:Object.entries(MATERIALS).flatMap(([tier, names]) => names.map(name => ({ kind: 'ingredients', name: `m${Object.values(MATERIALS).flat().indexOf(name)}`, object: createIngredient(name, tier) })))),
  ];
  const filter=new URLSearchParams(location.search).get('only')?.split(',');
  for (const item of objects) {
    if(filter&&!filter.includes(item.name))continue;
    if (item.kind === 'ingredients' || item.kind === 'game-objects') { const size = new THREE.Box3().setFromObject(item.object).getSize(new THREE.Vector3()); item.object.scale.setScalar(1.85 / Math.max(size.x, size.y, size.z)); }
    const bounds = new THREE.Box3().setFromObject(item.object), center = bounds.getCenter(new THREE.Vector3());
    item.object.position.sub(center); scene.add(item.object); renderer.render(scene, camera);
    const response = await fetch('/__halloween_art', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: item.kind, version: item.kind==='game-objects'?(artMode==='game-v5'?'v5':newGame?'v4':gameFlat?'v3':'v2'):expanded?'v3':newCandy?'v2':'v1', name: item.name, png: canvas.toDataURL('image/png') }) });
    if (!response.ok) throw Error('art_export_failed'); scene.remove(item.object); disposeScene(item.object);
  }
  environment.dispose();renderer.dispose(); canvas.remove(); document.body.dataset.artExport = 'complete'; document.body.textContent = `${objects.length}款真实3D缩略图已导出`;
}
