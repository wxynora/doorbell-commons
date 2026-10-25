import * as T from 'three';
import {createPumpkinHouse} from './fairytale-pumpkin-house.mjs';
import {createStumpHouse} from './fairytale-stump-house.mjs';
import {createMushroomHouse} from './fairytale-mushroom-house.mjs';
import {createRoseTreehouse} from './rose-treehouse.mjs';
export function createFairytaleHouse(parent,style){
  const house=new T.Group();parent.add(house);
  const build={pumpkin:createPumpkinHouse,stump:createStumpHouse,mushroom:createMushroomHouse,rose_cottage:createRoseTreehouse}[style];
  if(!build)throw Error('Unknown house style');
  build(house);house.userData.houseKind=style;
  // Keep existing lighting handles without adding shadow/light passes to the approved emissive-only model.
  for(const name of ['interior-lamp','cottage-exterior-light']){const light=new T.Object3D();light.intensity=0;light.name=name;light.visible=false;house.add(light);}
  return house;
}
