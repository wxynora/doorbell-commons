import * as T from 'three';
import {box,mesh,beam,branch,leafGeometry,seededRandom} from './primitives.js';

export const GARDEN_TRIO={
  double_swing:{name:'双人秋千',cells:[3,2]},
  floral_arch:{name:'花藤拱门',cells:[2,1]},
  garden_mailbox:{name:'庭院信箱',cells:[1,1]},
};

export function buildGardenTrio(root,id,mat){
  const ivory=mat('#eee8da'),wood=mat('#b88e64'),mint=mat('#96b5a0'),brass=mat('#ba985b');
  const random=seededRandom(735),leaves=[],petals=[];
  const greens=['#527955','#70975f','#91ae71','#a6bc82'];
  function greenery(points,flowerRate=3){
    points.forEach(([x,y,z],i)=>{
      for(let j=0;j<7;j++){
        leaves.push({p:[x+(random()-.5)*.18,y+(random()-.5)*.15,z+(random()-.5)*.16],s:[.08+random()*.05,.12+random()*.08,.12],r:[random()*2.8,random()*6.28,random()*6.28],c:greens[(i+j)%greens.length]});
      }
      if(i%flowerRate===0){
        const size=.025+random()*.017,c=['#f1b6c3','#f6d4d9','#fff1d8'][i%3];
        for(let k=0;k<5;k++){const a=k*Math.PI*2/5;petals.push({p:[x+Math.cos(a)*size,y+.045+Math.sin(a)*size,z+.09],s:[size*.9,size*.72,size*.38],r:[0,0,a],c});}
        petals.push({p:[x,y+.045,z+.102],s:[.012,.012,.01],r:[0,0,0],c:'#e2bd6c'});
      }
    });
  }
  if(id==='floral_arch'){
    for(const z of [-.22,.22]){
      for(const x of [-.73,.73]){box(root,ivory,[x,.70,z],[.085,1.4,.085]);box(root,ivory,[x,.055,z],[.15,.11,.15]);}
      const curve=new T.EllipseCurve(0,1.4,.73,.73,0,Math.PI,false,0);
      const path=new T.CatmullRomCurve3(curve.getPoints(24).map(p=>new T.Vector3(p.x,p.y,z)));
      mesh(root,new T.TubeGeometry(path,24,.047,6,false),ivory);
    }
    for(const x of [-.73,.73]){
      for(let y=.30;y<1.4;y+=.28){beam(root,ivory,[x,y,-.22],[x,y+.22,.22],.018);beam(root,ivory,[x,y,.22],[x,y+.22,-.22],.018);}
    }
    for(let i=0;i<=8;i++){const a=i/8*Math.PI;beam(root,ivory,[Math.cos(a)*.73,1.4+Math.sin(a)*.73,-.22],[Math.cos(a)*.73,1.4+Math.sin(a)*.73,.22],.023);}
    const top=[];for(let i=0;i<=35;i++){const a=i/35*Math.PI;top.push([Math.cos(a)*.76,1.42+Math.sin(a)*.76,.21]);}greenery(top,2);
    for(const [x,length] of [[-.76,1.22],[.76,.78]]){
      const vine=[];for(let i=0;i<=14;i++)vine.push([x+Math.sin(i*.75)*.035,1.44-i/14*length,.24+Math.cos(i*.8)*.025]);
      branch(root,mat('#608055'),vine,.013);greenery(vine,4);
    }
  }
  if(id==='double_swing'){
    const ivory=mat('#ffffff'),wood=ivory;
    for(const x of [-1.13,1.13]){
      for(const z of [-.61,.61])beam(root,ivory,[x,0,z],[x,1.83,0],.057);
      beam(root,wood,[x,.40,-.48],[x,.40,.48],.038);
    }
    box(root,wood,[0,1.87,0],[2.55,.13,.15]);
    for(const x of [-1.13,1.13])beam(root,ivory,[x,1.44,0],[x-Math.sign(x)*.3,1.83,0],.033);
    const swing=new T.Group();swing.name='double-swing-seat';swing.position.y=1.81;swing.userData.gardenSwing=true;root.add(swing);
    for(const x of [-.79,.79]){
      for(const z of [-.19,.25])beam(swing,ivory,[x,0,0],[x,-1.22,z],.014);
      box(swing,wood,[x,-1.17,.015],[.06,.12,.59]);
      box(swing,ivory,[x,-.89,.02],[.07,.07,.63]);
      for(const z of [-.2,.25])box(swing,ivory,[x,-1.05,z],[.04,.30,.04]);
    }
    for(let i=0;i<6;i++)box(swing,wood,[0,-1.28,-.22+i*.095],[1.65,.055,.077]);
    for(let i=0;i<10;i++){const slat=box(swing,ivory,[-.72+i*.16,-1.0,-.245],[.11,.50,.035]);slat.rotation.x=-.14;}
    box(swing,wood,[0,-.735,-.28],[1.70,.06,.055]);
    for(const x of [-.4,.4]){
      mesh(swing,new T.SphereGeometry(1,12,8),ivory,[x,-1.205,.02],[.375,.075,.24]);
    }
    const bunny=new T.Group();bunny.name='pink-bunny-plush';bunny.position.set(.38,-1.13,.055);swing.add(bunny);
    const pink=mat('#efd0db'),inner=mat('#dba8be'),belly=mat('#f8e4e9');
    const plush=(material,p,s)=>mesh(bunny,new T.SphereGeometry(1,12,8),material,p,s);
    plush(pink,[0,.13,0],[.115,.15,.09]);
    plush(belly,[0,.12,.075],[.075,.10,.022]);
    plush(pink,[0,.32,.015],[.13,.115,.105]);
    for(const x of [-.062,.062]){
      const ear=plush(pink,[x,.48,.008],[.044,.14,.038]);ear.rotation.z=x<0?.14:-.14;
      const lining=plush(inner,[x,.486,.038],[.023,.105,.01]);lining.rotation.z=ear.rotation.z;
      plush(pink,[x*.95,.025,.085],[.061,.040,.073]);
      const arm=plush(pink,[x*1.7,.15,.035],[.04,.085,.044]);arm.rotation.z=x<0?-.25:.25;
      plush(mat('#72565d'),[x*.78,.335,.112],[.010,.013,.006]);
      plush(inner,[x*1.2,.303,.106],[.023,.012,.006]);
    }
    plush(inner,[0,.31,.122],[.012,.009,.007]);
    plush(belly,[0,.083,-.083],[.046,.046,.044]);
    const flowers=[];for(let i=0;i<22;i++)flowers.push([-1.16+i*.11,1.92+Math.sin(i*.25)*.035,.03]);greenery(flowers,3);
    greenery(Array.from({length:7},(_,i)=>[-1.14,1.78-i*.073,.07]),4);
  }
  if(id==='garden_mailbox'){
    const ivory=mat('#bc5553'),wood=ivory,brass=ivory;
    box(root,wood,[0,.43,0],[.13,.86,.13]);box(root,ivory,[0,.06,0],[.27,.12,.27]);
    box(root,mat('#bc5553'),[0,.98,0],[.50,.46,.39]);
    for(const x of [-.148,.148]){const roof=box(root,ivory,[x,1.25,0],[.34,.055,.49]);roof.rotation.z=x<0?.42:-.42;}
    box(root,wood,[0,.73,0],[.56,.055,.45]);
    box(root,mat('#673c37'),[0,1.05,.20],[.32,.035,.014]);
    mesh(root,new T.SphereGeometry(.022,8,6),brass,[.19,.86,.218]);
    box(root,brass,[.271,1.09,0],[.025,.29,.025]);box(root,ivory,[.271,1.22,.075],[.027,.12,.16]);
    const bird=new T.Group();bird.name='mailbox-roof-bird';bird.position.set(-.025,1.365,.035);root.add(bird);
    const feather=mat('#f4ead9'),wing=mat('#dcd1bb');
    mesh(bird,new T.SphereGeometry(1,10,7),feather,[0,.062,0],[.070,.070,.10]);
    mesh(bird,new T.SphereGeometry(.055,10,7),feather,[0,.137,.055]);
    for(const x of [-.063,.063]){
      const w=mesh(bird,new T.SphereGeometry(1,10,6),wing,[x,.061,-.013],[.018,.046,.070]);w.rotation.x=-.3;
      mesh(bird,new T.SphereGeometry(.005,6,4),mat('#514b45'),[x*.62,.146,.089]);
      beam(bird,mat('#c8a36b'),[x*.43,0,.025],[x*.43,-.017,.07],.006);
    }
    const beak=mesh(bird,new T.ConeGeometry(.015,.04,6),mat('#d7af67'),[0,.13,.115]);beak.rotation.x=Math.PI/2;
    const tail=mesh(bird,new T.SphereGeometry(1,8,5),wing,[0,.077,-.102],[.036,.014,.075]);tail.rotation.x=-.3;
  }
  function batch(entries,geometry){
    if(!entries.length)return;
    const material=mat('#ffffff').clone();material.side=T.DoubleSide;
    const out=new T.InstancedMesh(geometry,material,entries.length),dummy=new T.Object3D();
    entries.forEach((e,i)=>{dummy.position.set(...e.p);dummy.rotation.set(...e.r);dummy.scale.set(...e.s);dummy.updateMatrix();out.setMatrixAt(i,dummy.matrix);out.setColorAt(i,new T.Color(e.c));});
    out.castShadow=true;out.receiveShadow=true;root.add(out);
  }
  batch(leaves,leafGeometry());batch(petals,new T.SphereGeometry(1,6,4));
  if(id==='floral_arch')root.scale.x=.90;
}
