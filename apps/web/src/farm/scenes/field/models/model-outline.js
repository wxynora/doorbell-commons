import * as T from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// Created only while the browser's optional outline setting is on.
// Retain original parts/instances; restore every original geometry on disposal.
export function createModelOutline(renderer,world){
  const originals=new Map(),cache=new Map(),reduced=new Set(),modifier=new SimplifyModifier();
  const maskScene=new T.Scene();maskScene.background=new T.Color("#000000");
  const white=new T.MeshBasicMaterial({color:"#ffffff",side:T.DoubleSide,toneMapped:false});
  let entries=[];
  function geometryFor(mesh){
    const source=originals.get(mesh)??mesh.geometry;
    if(cache.has(source))return cache.get(source);
    let geometry=source;
    const count=source.attributes.position.count;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(!mesh.userData.house&&count>=18&&count<=700&&mesh.name!=="static-mesh-batch"&&source.type!=="BoxGeometry"&&source.groups.length<=1&&
      !materials.some(material=>material.isShaderMaterial||material.map)&&!source.attributes.color){
      const input=source.clone();input.deleteAttribute("uv");input.deleteAttribute("normal");
      const welded=mergeVertices(input);
      geometry=modifier.modify(welded,Math.floor(welded.attributes.position.count*.28));
      geometry.computeVertexNormals();input.dispose();welded.dispose();reduced.add(geometry);
    }
    cache.set(source,geometry);return geometry;
  }
  function refresh(){
    world.root.traverse(mesh=>{if(mesh.isMesh){if(!originals.has(mesh))originals.set(mesh,mesh.geometry);mesh.geometry=geometryFor(mesh);}});
    maskScene.clear();entries=[];
    const trees=world.root.children.filter(child=>{
      let tree=false;child.traverse(object=>{if(object.userData.seasonRole==="tree")tree=true;});return tree;
    });
    const furniture=(world.decorations??[]).filter(object=>!object.userData.groundCover&&!object.userData.decorationId?.startsWith("flowerbed"));
    const selected=new Set();
    for(const root of new Set([world.house,...trees,...furniture]))root.traverse(source=>{
      if(!source.isMesh||selected.has(source))return;selected.add(source);
      const mask=source.isInstancedMesh?new T.InstancedMesh(source.geometry,white,source.count):new T.Mesh(source.geometry,white);
      if(source.isInstancedMesh)mask.instanceMatrix=source.instanceMatrix;
      mask.matrixAutoUpdate=false;mask.frustumCulled=false;maskScene.add(mask);entries.push({source,mask});
    });
  }
  const maskTarget=new T.WebGLRenderTarget(1,1,{depthBuffer:true});maskTarget.depthTexture=new T.DepthTexture(1,1);
  const dilationTarget=new T.WebGLRenderTarget(1,1,{depthBuffer:false});
  const closedTarget=new T.WebGLRenderTarget(1,1,{depthBuffer:false});
  const colorTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:4});colorTarget.depthTexture=new T.DepthTexture(1,1);
  const vertexShader="varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";
  const closing=new T.ShaderMaterial({
    uniforms:{image:{value:maskTarget.texture},pixel:{value:new T.Vector2()},erode:{value:false}},vertexShader,
    fragmentShader:`uniform sampler2D image;uniform vec2 pixel;uniform bool erode;varying vec2 vUv;
    void main(){float result=erode?1.:0.;for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++){
      float sampleValue=texture2D(image,vUv+vec2(float(x),float(y))*pixel).r;
      result=erode?min(result,sampleValue):max(result,sampleValue);
    }gl_FragColor=vec4(vec3(result),1.);}`,depthTest:false,depthWrite:false,
  });
  const overlay=new T.ShaderMaterial({
    uniforms:{mask:{value:closedTarget.texture},maskDepth:{value:maskTarget.depthTexture},sceneDepth:{value:colorTarget.depthTexture},colorImage:{value:colorTarget.texture},pixel:{value:new T.Vector2()},ink:{value:new T.Color("#4b3022")}},vertexShader,
    fragmentShader:`uniform sampler2D mask,maskDepth,sceneDepth,colorImage;uniform vec2 pixel;uniform vec3 ink;varying vec2 vUv;
    void main(){float center=texture2D(mask,vUv).r,expanded=0.;float visibleDepth=texture2D(sceneDepth,vUv).r;
      for(int i=0;i<12;i++){
        float angle=float(i)*6.283185/12.;vec2 direction=vec2(cos(angle),sin(angle));
        vec2 outer=vUv+direction*pixel*2.8,inner=vUv+direction*pixel*1.4;
        expanded=max(expanded,texture2D(mask,outer).r*step(texture2D(maskDepth,outer).r,visibleDepth+.00008));
        expanded=max(expanded,texture2D(mask,inner).r*step(texture2D(maskDepth,inner).r,visibleDepth+.00008));
      }
      float alpha=smoothstep(.15,.85,expanded)*(1.-smoothstep(.15,.85,center));
      gl_FragColor=vec4(mix(texture2D(colorImage,vUv).rgb,ink,alpha),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,depthTest:false,depthWrite:false,
  });
  const closingQuad=new FullScreenQuad(closing),quad=new FullScreenQuad(overlay);
  const size=new T.Vector2(),bufferSize=new T.Vector2();let width=0,height=0,bufferWidth=0,bufferHeight=0;
  function resize(){
    renderer.getSize(size);renderer.getDrawingBufferSize(bufferSize);
    const w=Math.max(1,Math.round(size.x)),h=Math.max(1,Math.round(size.y));
    if(w===width&&h===height&&bufferSize.x===bufferWidth&&bufferSize.y===bufferHeight)return;
    width=w;height=h;bufferWidth=bufferSize.x;bufferHeight=bufferSize.y;
    maskTarget.setSize(w,h);dilationTarget.setSize(Math.ceil(w/2),Math.ceil(h/2));closedTarget.setSize(Math.ceil(w/2),Math.ceil(h/2));
    colorTarget.setSize(bufferWidth,bufferHeight);
    // All contour distances follow the same design-width scale, not fixed viewport pixels.
    const scale=w/1040;
    closing.uniforms.pixel.value.set(2*scale/w,2*scale/h);
    overlay.uniforms.pixel.value.set(scale/w,scale/h);
  }
  refresh();
  return {
    refresh,
    render(scene,camera){
      resize();world.root.updateMatrixWorld(true);
      for(const {source,mask}of entries){
        mask.matrix.copy(source.matrixWorld);mask.visible=true;
        for(let ancestor=source;ancestor;ancestor=ancestor.parent)if(!ancestor.visible){mask.visible=false;break;}
      }
      const target=renderer.getRenderTarget();
      renderer.setRenderTarget(maskTarget);renderer.render(maskScene,camera);
      closing.uniforms.image.value=maskTarget.texture;closing.uniforms.erode.value=false;
      renderer.setRenderTarget(dilationTarget);closingQuad.render(renderer);
      closing.uniforms.image.value=dilationTarget.texture;closing.uniforms.erode.value=true;
      renderer.setRenderTarget(closedTarget);closingQuad.render(renderer);
      renderer.setRenderTarget(colorTarget);renderer.render(scene,camera);
      renderer.setRenderTarget(target);quad.render(renderer);
    },
    dispose(){
      for(const [mesh,geometry]of originals)mesh.geometry=geometry;
      for(const geometry of reduced)geometry.dispose();
      maskScene.clear();white.dispose();maskTarget.dispose();dilationTarget.dispose();closedTarget.dispose();colorTarget.dispose();
      closing.dispose();overlay.dispose();closingQuad.dispose();quad.dispose();
    }
  };
}
