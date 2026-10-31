import * as THREE from 'three';
import {paint,extrude,piece} from './model-kit-v4.mjs';

export const CHIIKAWA_HEADS=new Set(['chiikawa','hachiware','usagi']);
function shape(commands,scale){const s=new THREE.Shape();for(const [method,...p]of commands)s[method](...p.map(v=>v*scale));s.closePath();return s;}
const cheeks=[['bezierCurveTo',.98,.16,.88,-.31,.53,-.51],['bezierCurveTo',.28,-.67,-.28,-.67,-.53,-.51],['bezierCurveTo',-.88,-.31,-.98,.16,-.77,.48]];
const paths={
 chiikawa:[['moveTo',-.77,.48],['quadraticCurveTo',-.65,.70,-.48,.76],['bezierCurveTo',-.66,.94,-.48,1.13,-.34,.98],['quadraticCurveTo',-.29,.91,-.32,.82],['quadraticCurveTo',0,.91,.32,.82],['bezierCurveTo',.29,1.03,.45,1.12,.55,.97],['quadraticCurveTo',.61,.86,.48,.76],['quadraticCurveTo',.67,.70,.77,.48],...cheeks],
 hachiware:[['moveTo',-.77,.48],['quadraticCurveTo',-.75,.82,-.61,1.04],['quadraticCurveTo',-.55,1.16,-.31,.85],['quadraticCurveTo',0,.93,.31,.85],['quadraticCurveTo',.55,1.16,.61,1.04],['quadraticCurveTo',.75,.82,.77,.48],...cheeks],
 usagi:[['moveTo',-.77,.48],['quadraticCurveTo',-.57,.70,-.31,.74],['bezierCurveTo',-.42,1.15,-.42,1.77,-.26,1.80],['bezierCurveTo',-.09,1.81,-.11,1.15,-.12,.78],['quadraticCurveTo',0,.80,.12,.78],['bezierCurveTo',.11,1.15,.09,1.81,.26,1.80],['bezierCurveTo',.42,1.77,.42,1.15,.31,.74],['quadraticCurveTo',.57,.70,.77,.48],...cheeks],
};
export function chiikawaHead(id,size){return shape(paths[id],size*.72);}

export function addChiikawaFace(root,id,size,z){
 const s=size*.72;
 // Thin raised sugar details stay on the face rather than refracting behind it.
 const icing=color=>paint(color,'glaze',{roughness:.4,transparent:true,opacity:1,depthWrite:true});
 const dark=icing('#573a35'),white=icing('#fff8eb'),pink=icing('#efb2bc'),blue=icing('#82b3ce');
 const patch=(commands,mat,layer=0)=>root.add(extrude(shape(commands,s),size*.012,mat,[0,0,z+layer],size*.004));
 const oval=(x,y,rx,ry,mat,layer=0)=>{const p=new THREE.Shape();p.absellipse(x*s,y*s,rx*s,ry*s,0,Math.PI*2);root.add(extrude(p,size*.01,mat,[0,0,z+layer],size*.003));};
 const line=(points,r=.014,mat=dark,layer=.02)=>root.add(piece(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(x*s,y*s,z+layer))),16,r*s,6,false),mat));
 if(id==='hachiware')patch([['moveTo',-.73,.50],['quadraticCurveTo',-.73,.79,-.59,1.02],['quadraticCurveTo',-.54,1.08,-.30,.82],['quadraticCurveTo',0,.90,.30,.82],['quadraticCurveTo',.54,1.08,.59,1.02],['quadraticCurveTo',.73,.79,.73,.50],['bezierCurveTo',.48,.44,.18,.52,0,.72],['bezierCurveTo',-.18,.52,-.48,.44,-.73,.50]],blue);
 if(id==='usagi')for(const side of[-1,1])patch([['moveTo',side*.18,.82],['bezierCurveTo',side*.16,1.15,side*.16,1.69,side*.26,1.70],['bezierCurveTo',side*.35,1.67,side*.35,1.12,side*.28,.81]],pink);
 const eyeY=id==='usagi'?.18:.16;
 for(const side of[-1,1]){
  oval(side*.29,eyeY,.096,.105,dark,.01);
  oval(side*.29,eyeY+.025,.050,.034,white,.028);
  line([[side*.33,eyeY-.052],[side*.29,eyeY-.059],[side*.25,eyeY-.052]],.009,white,.04);
  oval(side*.53,-.04,.16,.105,pink);
  for(let i=0;i<3;i++){const x=side*.53+(i-1)*.07;line([[x+.014,-.002],[x-.007,-.069]],.009,dark,.022);}
  if(id==='usagi')line([[side*.19,.54],[side*.36,.50],[side*.47,.36]],.013);
  else if(id==='chiikawa')line([[side*.21,.43],[side*.29,.45],[side*.36,.44]],.012);
 }
 line([[-.11,.005],[-.10,-.045],[-.055,-.06],[0,-.025],[.055,-.06],[.10,-.045],[.11,.005]],.018);
 if(id==='hachiware'){
  patch([['moveTo',-.065,-.067],['quadraticCurveTo',0,-.11,.065,-.067],['quadraticCurveTo',.055,-.19,0,-.19],['quadraticCurveTo',-.055,-.19,-.065,-.067]],dark,.01);
  oval(0,-.152,.033,.018,pink,.03);
 }else line([[-.035,-.14],[0,-.15],[.035,-.14]],.012);
}
