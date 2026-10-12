import * as T from "three";
import { mesh, beam } from "./primitives.js";

export const DEFAULT_WATERING_CAN_POSITION = Object.freeze({x:-.65,z:4.73,rotation:0});
export function createWateringCan(root,mat) {
  const can=new T.Group();can.name="watering-can";
  can.userData.cells=[1,1];can.userData.label="移动水壶";
  root.add(can);applyWateringCanLayout(can);
  const metal=mat("#93a9a4");
  mesh(can,new T.CylinderGeometry(.14,.18,.3,14),metal,[0,.17,0]);
  beam(can,metal,[.12,.14,0],[.37,.32,0],.045);
  const handle=mesh(can,new T.TorusGeometry(.17,.018,5,18,Math.PI*1.7),metal,[-.08,.23,0]);
  handle.rotation.y=Math.PI/2;
  can.traverse(object=>{if(object.isMesh)object.userData.wateringCan=true;});
  return can;
}
export function captureWateringCan(can,committed) {
  const pose={x:can.position.x,z:can.position.z,rotation:can.rotation.y};
  return committed||Object.keys(pose).some(key=>pose[key]!==DEFAULT_WATERING_CAN_POSITION[key])?pose:undefined;
}
export function applyWateringCanLayout(can,pose=DEFAULT_WATERING_CAN_POSITION) {
  can.position.set(pose.x,.26,pose.z);can.rotation.y=pose.rotation;
}
