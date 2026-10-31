import {createFoodModel} from './pantry-objects-v5.mjs';

// Keep the same physical object and hit target used throughout the activity.
// Only the desk owns these material instances; inventory templates remain shared.
export function createWorkshopIngredient(name,tier) {
  const model=createFoodModel(name,tier,[.5,.6,.5]),materials=new Map();
  model.traverse(part=>{
    if(!part.isMesh)return;
    const source=part.material;
    if(!materials.has(source)) {
      const material=source.clone();
      if(!material.transmission && !material.transparent && material.metalness<.4) {
        material.roughness=Math.max(material.roughness,.48);
        if('clearcoat' in material)material.clearcoat=Math.min(material.clearcoat,.28);
      }
      materials.set(source,material);
    }
    part.material=materials.get(source);
  });
  return model;
}
