import * as THREE from 'three';

// Convert a real object's world-space bounds into fractions of its canvas.
export function projectKeyboardBounds(camera, bounds) {
  camera.updateMatrixWorld();
  let left=1,top=1,right=0,bottom=0;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const point=new THREE.Vector3(x,y,z).project(camera);
    const px=(point.x+1)/2,py=(1-point.y)/2;
    left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
  }
  return {left:Math.max(0,left),top:Math.max(0,top),right:Math.min(1,right),bottom:Math.min(1,bottom)};
}
