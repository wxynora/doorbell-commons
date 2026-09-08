import * as T from 'three';
import {createCottage,setRoofColor} from './cottage.js';
import {box,mesh,beam,Instances,leafGeometry,seededRandom} from './primitives.js';
import {addSeasonalCover} from './seasonal-cover.js';

export function setStudyCanopy(house,floral=false){
  house.getObjectByName('plain-house-canopy').visible=!floral;
  house.getObjectByName('floral-house-canopy').visible=floral;
}

// Local appearance study only; no layout, inventory or purchase writes.
export function createHouseStudy(parent,mat,level=1){
  const {house,glow}=createCottage(parent,mat);
  glow.name='cottage-exterior-light';
  house.position.set(0,.24,0);
  // The original cottage stays untouched; remove its glazing mullions in this study.
  for(const child of [...house.children]){
    const p=child.position;
    const frontMullion=Math.abs(p.x+.67)<1e-6&&Math.abs(p.y-1.55)<1e-6&&Math.abs(p.z-1.63)<1e-6;
    const sideMullion=Math.abs(Math.abs(p.x)-2.14)<1e-6&&Math.abs(p.y-1.75)<1e-6&&Math.abs(p.z+.25)<1e-6;
    const paintedReflection=Math.abs(p.x+1.05)<1e-6&&Math.abs(p.y-1.84)<1e-6&&Math.abs(p.z-1.55)<1e-6;
    if(frontMullion||sideMullion||paintedReflection)house.remove(child);
  }
  box(house,mat('#bc925b'),[-.77,1.55,1.63],[.035,1.37,.055]);
  for(const side of [-1,1])box(house,mat('#bc925b'),[side*2.12,1.75,-.25],[.05,.85,.035]);
  house.updateMatrixWorld(true);
  // Replace the transverse roof only. The entrance, window and porch stay facing +z.
  for(const child of [...house.children]){
    if(child.isMesh){
      const bounds=new T.Box3().setFromObject(child);
      if(child.userData.roofSurface||bounds.min.y-house.position.y>=2.58)house.remove(child);
    }
  }
  const wall=mat('#e8dbbb'),wood=mat('#bc925b'),edge=mat('#f0e4c8');
  const details=house.getObjectByName('cottage-garden-details');
  // Remove only the original short door awning in this local model.
  for(const child of [...details.children]){
    const oldAwningBrace=child.geometry?.type==='CylinderGeometry'&&Math.abs(child.position.x-1.9)<1e-6&&Math.abs(child.position.y-2.135)<1e-6&&Math.abs(child.position.z-2.04)<1e-6;
    if(child.userData.roofSurface)details.remove(child);
    if(oldAwningBrace)child.material=mat('#eee5d2');
  }
  const plain=new T.Group(),floral=new T.Group();
  plain.name='plain-house-canopy';floral.name='floral-house-canopy';house.add(plain,floral);
  for(const [group,isFloral] of [[plain,false],[floral,true]]){
    const slab=box(group,mat('#eee5d2'),[-.05,2.48,2.03],[4.3,.1,1.03],true);
    slab.rotation.x=.13;
    addSeasonalCover(slab,{width:4.3,depth:1.03,top:.06,seed:841});
    for(const x of [-2.03,1.95])beam(group,mat('#eee5d2'),[x,2.1,1.6],[x,2.43,2.44],.035);
    if(isFloral){
      box(slab,mat('#eee5d2'),[0,-.12,.5],[4.3,.24,.05]);
      const random=seededRandom(518),leaves=new Instances(slab,leafGeometry(),mat('#ffffff'));
      const petals=new Instances(slab,new T.SphereGeometry(1,6,4),mat('#ffffff'));
      function rose(x,y,z,r){
        // Layered petals read as small rose clusters, not upright bedding plants.
        for(let ring=0;ring<2;ring++)for(let p=0;p<5;p++){
          const a=p*6.283/5+ring*.6,s=r*(ring?.56:1);
          petals.add([x+Math.cos(a)*s*.7,y+Math.sin(a)*s*.6,z+ring*r*.35],[s*.67,s*.59,s*.36],[.2,a,.3],ring?'#f7ddcd':(Math.floor(x*13)%2?'#eab6ca':'#f4e8ce'));
        }
      }
      function cluster(x,y,z,r,count){
        for(let i=0;i<count;i++){
          const a=random()*6.283,d=Math.sqrt(random())*r;
          leaves.add([x+Math.cos(a)*d,y+(random()-.35)*r,z+Math.sin(a)*d*.8],[.1+random()*.09,.15+random()*.13,.11],[.6+random()*1.4,random()*6.283,random()-.5],['#4f774c','#739652','#9bb974','#84a960'][i%4]);
        }
        for(let i=0;i<3;i++)rose(x+(random()-.5)*r*1.4,y+.12+random()*.08,z+r*.66,.065+random()*.025);
      }
      // Uneven overlapping masses follow the fascia; no straight planter rim or soil.
      for(let i=0;i<16;i++){
        const x=-2.03+i*.27,r=.17+random()*.1;
        cluster(x,.13+Math.sin(i*1.6)*.045,.33+Math.sin(i*.9)*.12,r,28);
        if(i%3===0)cluster(x,.14,-.15,.21,22);
      }
      // Long corner falls, short scallops between them; the entrance stays clear.
      for(const [x,length] of [[-2.02,1.18],[-1.67,.35],[-.63,.24],[.35,.28],[1.98,.89]]){
        let prev=[x,.13,.41];
        for(let j=1;j<=7;j++){
          const t=j/7,p=[x+Math.sin(t*5+x)*.075,.13-t*length,.51+Math.sin(t*3)*.07];
          beam(slab,mat('#617b43'),prev,p,.012);prev=p;
          cluster(...p,.15-t*.06,13);
        }
      }
      // A separate low leafy layer fills the bare top without relocating existing blooms.
      const fillRandom=seededRandom(519),cover=new Instances(slab,leafGeometry(),mat('#ffffff'));
      for(let row=0;row<10;row++)for(let col=0;col<30;col++)for(let layer=0;layer<2;layer++){
        const x=-2.02+col*.139+(fillRandom()-.5)*.08;
        const z=-.43+row*.09+(fillRandom()-.5)*.055;
        cover.add([x,.075+layer*.07+fillRandom()*.035,z],[.17+fillRandom()*.08,.22+fillRandom()*.1,.16],[.95+fillRandom()*.5,fillRandom()*6.283,(fillRandom()-.5)*.5],['#648a48','#83a956','#a1bc71','#739951'][(row+col+layer)%4]);
      }
      cover.finish().name='canopy-leafy-underlay';
      leaves.finish().name='canopy-climbing-leaves';petals.finish().name='canopy-rose-clusters';
    }
  }
  setStudyCanopy(house,false);
  {
    box(house,edge,[-2.06,1.33,2.43],[.1,2.22,.1],true).name='left-canopy-post';
  }
  const roofGroup=new T.Group();roofGroup.name='front-facing-gable-roof';house.add(roofGroup);
  for(const z of [-1.55,1.55]){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([-2.05,2.72,z,2.05,2.72,z,0,3.84,z],3));g.computeVertexNormals();
    mesh(roofGroup,g,new T.MeshToonMaterial({color:'#e8dbbb',side:T.DoubleSide}));
  }
  for(const side of [-1,1]){
    const p=box(roofGroup,mat('#91bca9').clone(),[side*1.13,3.33,0],[2.6,.12,3.8],true);
    p.rotation.z=-side*.5;p.userData.roofSurface=true;
    for(let row=0;row<10;row++)for(let col=0;col<7;col++)
      box(p,mat('#91bca9').clone(),[-1.11+col*.37,.078,-1.71+row*.38],[.36,.024,.37]).userData.roofAccent=true;
    addSeasonalCover(p,{width:2.6,depth:3.8,top:.1,seed:842+side});
    for(const z of [-1.92,1.92])beam(roofGroup,edge,[side*2.3,2.69,z],[0,3.96,z],.045);
    beam(roofGroup,edge,[side*2.3,2.69,-1.93],[side*2.3,2.69,1.93],.05);
  }
  beam(roofGroup,mat('#91bca9').clone(),[0,3.98,-1.96],[0,3.98,1.96],.055).userData.roofSurface=true;
  // Small timber vent decorates the gable, not an added habitable storey.
  mesh(roofGroup,new T.CylinderGeometry(.23,.23,.07,24),wood,[0,3.2,1.6]).rotation.x=Math.PI/2;
  mesh(roofGroup,new T.CylinderGeometry(.17,.17,.075,24),mat('#697c70'),[0,3.2,1.64]).rotation.x=Math.PI/2;
  for(const y of [3.12,3.2,3.28])box(roofGroup,wood,[0,y,1.69],[.3,.024,.025]);
  const glass=new T.MeshStandardMaterial({color:'#c2ddd5',roughness:.18,metalness:0,transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide});
  // Illuminate the view behind the clear pane, not the pane itself. Reuse the
  // existing night controller without adding a light for each window.
  const roomWall=mat('#9d987f').clone();
  roomWall.emissive.set('#e7b66c');roomWall.emissiveIntensity=0;
  roomWall.userData.windowGlow=true;
  const interiorMaterials=new Map(),warmTint=new T.Color('#ffdda6');
  function warmInterior(room){
    room.traverse(object=>{
      if(!object.isMesh||object.material===roomWall)return;
      const original=object.material;
      if(!interiorMaterials.has(original)){
        const material=original.clone();
        material.emissive.copy(material.color).multiply(warmTint).multiplyScalar(.55);
        material.emissiveIntensity=0;material.userData.windowGlow=true;
        interiorMaterials.set(original,material);
      }
      object.material=interiorMaterials.get(original);
    });
  }
  let windowIndex=0;
  function window(parent,x,y,z,w,h,crossbar=true,backDepth=-.032){
    for(const side of [-1,1])box(parent,wood,[x+side*(w+.07)/2,y,z],[.07,h+.15,.13],true);
    for(const side of [-1,1])box(parent,wood,[x,y+side*(h+.07)/2,z],[w+.15,.07,.13],true);
    const room=new T.Group();room.name='window-display-interior';room.position.set(x,y,z);parent.add(room);
    box(room,roomWall,[0,0,backDepth],[w,h,.012]);
    box(room,mat('#dacba7'),[0,-h*.36,.002],[w,.06,.085]);
    // Exterior-study placeholders only; the actual interior will be designed separately.
    const variant=windowIndex++%4;room.userData.placeholderVariant=variant;
    const shelf=-h*.36;
    if(variant===0){
      for(let i=0;i<3;i++)box(room,mat(['#9aa897','#c1937b','#d2b77e'][i]),[-w*.2+i*.065,shelf+.12,.025],[.05,.19+i*.025,.04]);
    }else if(variant===1){
      for(let i=0;i<3;i++){
        const book=box(room,mat(['#9baeb8','#d1aa90','#a4af93'][i]),[-w*.2+i*.018,shelf+.055+i*.043,.025],[.29-i*.025,.038,.065]);
        book.name='window-stacked-book';
      }
    }else if(variant===2){
      mesh(room,new T.SphereGeometry(1,12,8),mat('#c9b3a8'),[w*.15,shelf+.11,.025],[.085,.11,.035]);
    }else{
      box(room,mat('#b2bca5'),[0,shelf+.085,.025],[w*.56,.12,.05]);
      box(room,mat('#d8b6a5'),[-w*.1,shelf+.18,.03],[.16,.12,.04]);
    }
    warmInterior(room);
    box(parent,glass,[x,y,z+.075],[w,h,.03]);
    box(parent,wood,[x,y,z+.055],[.035,h+.07,.08]);
    box(parent,wood,[x,y-h/2-.1,z+.05],[w+.3,.1,.28],true);
  }
  function flowerBox(parent,x,y,z,w){
    box(parent,mat('#91bca9').clone(),[x,y,z],[w,.18,.25],true).userData.roofAccent=true;
    box(parent,mat('#66583e'),[x,y+.092,z],[w-.08,.02,.19]);
    for(let i=0;i<Math.round(w*14);i++){
      const px=x-w*.43+i/(Math.round(w*14)-1)*w*.86;
      mesh(parent,new T.SphereGeometry(1,6,4),mat(i%2?'#93ac6b':'#6f905a'),[px,y+.16,z],[.085,.085,.095]);
      for(let p=0;p<5;p++){
        const a=p*Math.PI*2/5;
        mesh(parent,new T.SphereGeometry(1,6,4),mat(['#f0b6c9','#f8e2b7','#c5b6dc'][i%3]),[px+Math.cos(a)*.033,y+.235+Math.sin(i)*.025,z+Math.sin(a)*.033],[.032,.025,.029]);
      }
    }
  }
  if(level>=2){
    // A low reading-room wing broadens the ground floor instead of stretching it.
    const wing=new T.Group();wing.name='ground-floor-reading-wing';house.add(wing);
    box(wing,wall,[2.75,.09,-.15],[1.55,.18,3.08],true);
    box(wing,wall,[2.75,level===3?1.43:1.28,-.15],[1.5,level===3?2.7:2.4,3.0],true);
    if(level===2){
    for(const z of [-1.65,1.35]){
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute([2,2.48,z,3.5,2.48,z,3.5,2.56,z,2,2.48,z,3.5,2.56,z,2,2.94,z],3));g.computeVertexNormals();
      mesh(wing,g,new T.MeshToonMaterial({color:'#e8dbbb',side:T.DoubleSide}));
    }
    const wingRoof=box(wing,mat('#91bca9').clone(),[2.77,2.75,-.15],[1.92,.1,3.4],true);
    wingRoof.rotation.z=-.25;wingRoof.userData.roofSurface=true;
    addSeasonalCover(wingRoof,{width:1.92,depth:3.4,top:.09,seed:846});
    for(let row=0;row<9;row++)for(let col=0;col<5;col++)
      box(wingRoof,mat('#91bca9').clone(),[-.75+col*.375,.067,-1.5+row*.375],[.365,.025,.365]).userData.roofAccent=true;
    }
    window(wing,2.73,1.45,1.43,.95,1.24,false);flowerBox(wing,2.73,.69,1.65,1.16);
    const wingSide=new T.Group();wingSide.position.set(3.51,0,-.2);wingSide.rotation.y=Math.PI/2;wing.add(wingSide);
    // This side wall reaches x=3.5: keep the display backing beyond that wall,
    // but still behind the clear pane (whose inner face is local z=.06).
    window(wingSide,0,1.47,0,1.72,1.16,true,.012);
    for(const z of [-1.66,1.36])box(wing,edge,[3.51,level===3?1.42:1.27,z],[.1,level===3?2.75:2.45,.1],true);
    box(wing,edge,[2.75,.32,1.4],[1.57,.13,.09],true);
    box(house,wall,[2.77,.13,1.94],[1.53,.26,.94],true);
    for(let z=1.55;z<2.4;z+=.13)box(house,wall,[2.77,.28,z],[1.53,.06,.115]);
  }
  if(level===3){
    const upper=new T.Group();upper.name='recessed-upper-storey';house.add(upper);
    // Keep the approved ground floor; the upper floor is smaller and set back.
    roofGroup.scale.set(.81,1,.86);roofGroup.position.set(-.24,1.55,-.16);
    for(const child of details.children)if(child.position.y>3){child.position.x=child.position.x*.81-.24;child.position.z=child.position.z*.86-.16;child.position.y+=1.55;}
    box(upper,wall,[-1.86,3.495,-.16],[.08,1.55,2.67],true);
    for(const z of [-1.455,1.135])box(upper,wall,[-.24,3.495,z],[3.32,1.55,.08],true);
    // Real opening on the east wall; no opaque building box behind the open door.
    box(upper,wall,[1.38,3.495,-1.16],[.08,1.55,.67],true);
    box(upper,wall,[1.38,3.495,.73],[.08,1.55,.89],true);
    box(upper,wall,[1.38,4.225,-.28],[.08,.09,1.1]);
    box(upper,mat('#cbb996'),[-.24,2.86,-.16],[3.24,.08,2.59]);
    const room=new T.Group();room.name='upstairs-reading-room';room.position.set(-.9,0,.45);upper.add(room);
    // Keep the doorway sightline open; interior placeholders sit deeper to the side.
    box(room,mat('#d4c5a5'),[.77,3.13,-.32],[.52,.2,.83],true);
    box(room,mat('#a7b79b'),[.54,3.33,-.32],[.12,.43,.83]);
    box(room,mat('#d3a98c'),[.77,3.28,-.56],[.25,.19,.22]);
    box(room,wood,[.9,3.11,.34],[.35,.055,.32]);
    box(room,wood,[.9,2.97,.34],[.05,.25,.05]);
    mesh(room,new T.CylinderGeometry(.11,.16,.18,12),mat('#f0dfb2'),[.9,3.43,.34]);
    beam(room,wood,[.9,3.13,.34],[.9,3.38,.34],.014);
    warmInterior(room);
    for(const y of [2.77,4.25])box(upper,edge,[-.24,y,-.16],[3.44,.105,2.78],true);
    window(upper,-1.04,3.5,1.235,.82,.92,false);
    window(upper,.57,3.48,1.235,.8,1.04,false);
    for(const x of [-1.88,1.4])box(upper,edge,[x,3.5,1.21],[.09,1.48,.085],true);
    const upstairsSide=new T.Group();upstairsSide.position.set(1.455,0,-.28);upstairsSide.rotation.y=Math.PI/2;upper.add(upstairsSide);
    for(const x of [-.53,.53])box(upstairsSide,edge,[x,3.52,0],[.08,1.39,.12],true);
    for(const y of [2.865,4.175])box(upstairsSide,edge,[0,y,0],[1.13,.08,.12],true);
    for(const side of [-1,1]){
      const door=new T.Group();door.name=`open-terrace-door-${side}`;door.position.set(side*.49,2.9,.035);door.rotation.y=side*Math.PI*.62;upstairsSide.add(door);
      for(const x of [.022,.468])box(door,edge,[-side*x,.61,0],[.044,1.22,.055],true);
      for(const y of [.025,1.195])box(door,edge,[-side*.245,y,0],[.49,.05,.055],true);
      box(door,glass,[-side*.245,.61,0],[.402,1.12,.018]);
      box(door,mat('#927349'),[-side*.415,.6,.055],[.025,.09,.035]);
    }
    upstairsSide.name='terrace-glass-door';
    flowerBox(upper,-1.04,2.9,1.48,1.03);
    const terrace=new T.Group();terrace.name='side-roof-terrace';house.add(terrace);
    box(terrace,edge,[2.54,2.83,-.15],[2.2,.1,3.24],true);
    for(let i=0;i<16;i++)box(terrace,mat(i%2?'#d9cba9':'#e1d4b4'),[2.54,2.89,-1.65+i*.2],[2.12,.035,.188]);
    const railingWhite=mat('#f7f5ef');
    for(const z of [-1.7,1.4]){
      for(const x of [1.48,3.59])box(terrace,railingWhite,[x,3.26,z],[.09,.74,.09],true);
      for(let i=1;i<11;i++)box(terrace,railingWhite,[1.48+i*.192,3.23,z],[.045,.61,.045]);
      box(terrace,railingWhite,[2.535,3.65,z],[2.22,.075,.1],true);
    }
    for(let i=1;i<16;i++)box(terrace,railingWhite,[3.59,3.23,-1.7+i*.194],[.045,.61,.045]);
    box(terrace,railingWhite,[3.59,3.65,-.15],[.1,.075,3.24],true);
    const garden=new T.Group();garden.name='terrace-plants';terrace.add(garden);
    const gardenLeaves=new Instances(garden,leafGeometry(),mat('#ffffff'));
    const gardenBlooms=new Instances(garden,new T.SphereGeometry(1,6,4),mat('#ffffff'));
    const gardenRandom=seededRandom(880);
    function gardenTuft(x,y,z,r,count,bloom=true){
      for(let i=0;i<count;i++){
        const a=gardenRandom()*6.283,d=Math.sqrt(gardenRandom())*r;
        gardenLeaves.add([x+Math.cos(a)*d,y+gardenRandom()*r*.5,z+Math.sin(a)*d],[.1+gardenRandom()*.055,.16+gardenRandom()*.12,.1],[.5+gardenRandom(),a,gardenRandom()-.5],['#648647','#86a85e','#a1ba79'][i%3]);
      }
      if(bloom)for(let f=0;f<3;f++){
        const fx=x+(gardenRandom()-.5)*r*1.5,fz=z+(gardenRandom()-.5)*r*1.5;
        for(let p=0;p<5;p++){const a=p*6.283/5;gardenBlooms.add([fx+Math.cos(a)*.035,y+r*.5+.16,fz+Math.sin(a)*.035],[.037,.028,.03],[0,a,0],f%2?'#f0bdce':'#f5e5c6');}
      }
    }
    // Flowering groundcover follows the rail foot; leave the top handrails exposed.
    for(let i=0;i<9;i++)gardenTuft(1.66+i*.225,2.96,1.43,.16,18);
    for(let i=0;i<13;i++)gardenTuft(3.6,2.96,-1.5+i*.225,.17,20);
    for(const z of [-1.34,1.05]){
      mesh(garden,new T.CylinderGeometry(.18,.13,.27,12),mat('#c59e7c'),[3.28,3.04,z]);
      gardenTuft(3.28,3.18,z,.23,48);
    }
    for(const [z,length,steps] of [[-1.28,.72,7],[.14,.28,4],[1.2,.48,5]]){
      for(let i=0;i<steps;i++){
        const t=i/(steps-1);
        gardenTuft(3.65+Math.sin(t*4+z)*.035,2.94-t*length,z+Math.sin(t*3+z)*.035,.11-t*.055,10,i%2===0);
      }
    }
    gardenLeaves.finish();gardenBlooms.finish();
    // Seal the exposed ground-floor shoulders underneath the recessed storey.
    box(house,edge,[0,2.73,0],[4.15,.08,3.15],true);
    // Align the west exterior (-2.05) with the ground floor; keep the terrace doorway fixed.
    const westAlignment=3.47/3.32;
    upper.scale.x=westAlignment;upper.position.x=1.42*(1-westAlignment);
    roofGroup.scale.x*=westAlignment;
    roofGroup.position.x=1.42+(roofGroup.position.x-1.42)*westAlignment;
  }
  // Local material replacement, never mutate the shared original cottage palette.
  house.traverse(object=>{
    if(!object.isMesh||!object.material?.color)return;
    if(['e8dbbb','f0e4c8'].includes(object.material.color.getHexString())){
      object.material=object.material.clone();object.material.color.set('#eee5d2');
    }
  });
  setRoofColor(house,'mint');
  return house;
}
