// Vegetation rendering: procedural species meshes and card textures, instanced LODs, rendered
// impostors, wind and the brush shader (corn parts under the belly, branches sweep the glass).
import * as T from 'three';
import {SPECIES,SP,CHUNK,STRIDE,placeChunk,collidersFrom,capHeight} from './vegetation.mjs';
import {rng,mix,clamp} from './noise.mjs';
import {shared} from './materials.mjs';

export const pushers={value:Array.from({length:20},()=>new T.Vector4(0,-1e4,0,0))};
// ------------------------------------------------------------ canvas textures
function canvasTex(w,h,draw,srgb=true){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);const t=new T.CanvasTexture(c);if(srgb)t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;t.generateMipmaps=true;return t;}
const hsl=(h,s,l,a=1)=>`hsla(${h},${s}%,${l}%,${a})`;
function leafCluster(hue=[88,112],light=[18,38],n=90,shape='round'){return canvasTex(256,256,(g,w,h)=>{const r=rng(hue[0]*7+n);
 for(let k=0;k<n;k++){const a=r()*Math.PI*2,d=Math.pow(r(),.6)*w*.44,x=w/2+Math.cos(a)*d,y=h/2+Math.sin(a)*d*.9;const L=mix(light[0],light[1],r())*(1-d/w*.6);
  g.save();g.translate(x,y);g.rotate(r()*Math.PI*2);g.fillStyle=hsl(mix(hue[0],hue[1],r()),mix(35,60,r()),L);
  g.beginPath();if(shape==='round')g.ellipse(0,0,w*.045,w*.022,0,0,Math.PI*2);else g.ellipse(0,0,w*.03,w*.012,0,0,Math.PI*2);g.fill();
  g.strokeStyle=hsl(hue[0],30,L*.6,.5);g.lineWidth=1;g.beginPath();g.moveTo(-w*.04,0);g.lineTo(w*.04,0);g.stroke();g.restore();}
 g.globalCompositeOperation='destination-in';const gr=g.createRadialGradient(w/2,h/2,w*.2,w/2,h/2,w*.5);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(.85,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,w,h);});}
function needleBranch(){return canvasTex(256,256,(g,w,h)=>{const r=rng(5);
 for(let b=0;b<3;b++){const y0=h*(.25+b*.25);g.strokeStyle='#3b2f24';g.lineWidth=3;g.beginPath();g.moveTo(0,y0);g.quadraticCurveTo(w*.5,y0+h*.05,w,y0+h*.12);g.stroke();
  for(let k=0;k<160;k++){const t=r(),x=t*w,y=y0+t*t*h*.12;const L=mix(14,30,r());g.strokeStyle=hsl(mix(120,150,r()),mix(25,45,r()),L);g.lineWidth=1.6;const a=(r()<.5?-1:1)*mix(.5,1.2,r())+Math.PI*.1,len=mix(10,26,r())*(1-t*.4);g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*len*.4,y+Math.sin(a)*len);g.stroke();}}});}
function bladeTex(hue,light,count=26,tall=1,heads=null){return canvasTex(128,256,(g,w,h)=>{const r=rng(hue+count);
 for(let k=0;k<count;k++){const x=w*.1+r()*w*.8,lean=(r()-.5)*w*.5,top=h*(1-tall*mix(.55,1,r()));g.fillStyle=hsl(hue+(r()-.5)*14,mix(30,55,r()),mix(light[0],light[1],r()));
  g.beginPath();g.moveTo(x-2.5,h);g.quadraticCurveTo(x+lean*.3,h*.6,x+lean,top);g.quadraticCurveTo(x+lean*.3+1,h*.6,x+2.5,h);g.fill();
  if(heads){g.fillStyle=heads;g.beginPath();g.ellipse(x+lean,top+8,3,10,lean/w,0,Math.PI*2);g.fill();}}});}
function flowerTex(){return canvasTex(128,256,(g,w,h)=>{const r=rng(9);g.drawImage(bladeTex(95,[28,45],22,.7).image,0,0);const cols=['#f4e04d','#e8e8f0','#c74b8a','#e0762c','#8a6ae0'];for(let k=0;k<14;k++){g.fillStyle=cols[Math.floor(r()*cols.length)];g.beginPath();g.arc(w*.1+r()*w*.8,h*.35+r()*h*.35,3+r()*3,0,Math.PI*2);g.fill();}});}
function cornPlantTex(){return canvasTex(128,256,(g,w,h)=>{const r=rng(3);
 g.strokeStyle='#5d7a2c';g.lineWidth=5;g.beginPath();g.moveTo(w/2,h);g.lineTo(w/2+2,h*.08);g.stroke();
 for(let k=0;k<9;k++){const y=h*(.9-k*.085),s=k%2?1:-1,len=w*mix(.35,.5,r());g.fillStyle=hsl(mix(78,96,r()),mix(40,58,r()),mix(26,40,r()));g.beginPath();g.moveTo(w/2,y);g.quadraticCurveTo(w/2+s*len*.7,y-h*.08,w/2+s*len,y+h*.06);g.quadraticCurveTo(w/2+s*len*.6,y-h*.03,w/2,y+6);g.fill();}
 g.fillStyle='#c8b36a';for(let k=0;k<7;k++){g.fillRect(w/2-10+k*3,h*.02,1.5,h*.07);}g.fillStyle='#d9c27a';g.beginPath();g.ellipse(w/2+10,h*.45,5,16,.3,0,Math.PI*2);g.fill();});}
function cornRowTex(){return canvasTex(512,256,(g,w,h)=>{const r=rng(4);for(let k=0;k<20;k++){const x=k/20*w+r()*8;g.strokeStyle='#5d7a2c';g.lineWidth=4;g.beginPath();g.moveTo(x,h);g.lineTo(x+1,h*.1);g.stroke();
 for(let j=0;j<8;j++){const y=h*(.88-j*.09),s=r()<.5?-1:1,len=mix(18,34,r());g.fillStyle=hsl(mix(78,96,r()),48,mix(24,38,r()));g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+s*len*.7,y-18,x+s*len,y+12);g.quadraticCurveTo(x+s*len*.6,y-6,x,y+5);g.fill();}
 g.fillStyle='#c8b36a';g.fillRect(x-4,h*.03,8,h*.06);}});}
function barkTex(light=false){return canvasTex(64,256,(g,w,h)=>{const r=rng(light?2:1);g.fillStyle=light?'#d8d4c8':'#4a3a2c';g.fillRect(0,0,w,h);
 for(let k=0;k<120;k++){g.fillStyle=light?`rgba(20,20,20,${r()*.8})`:`rgba(${20+r()*40},${15+r()*25},${10+r()*15},${r()*.6})`;const y=r()*h;light?g.fillRect(r()*w,y,4+r()*14,1+r()*3):g.fillRect(r()*w,y,1+r()*3,6+r()*30);}});}
function yuccaTex(){return canvasTex(128,256,(g,w,h)=>{const r=rng(8);for(let k=0;k<22;k++){const a=(r()-.5)*1.6;g.strokeStyle=hsl(mix(70,95,r()),30,mix(30,45,r()));g.lineWidth=3;g.beginPath();g.moveTo(w/2,h*.95);g.lineTo(w/2+Math.sin(a)*w*.48,h*.95-Math.cos(a)*h*.8);g.stroke();}});}
// ------------------------------------------------------------ geometry builders (base at y=0)
function cardsGeo(cards){// cards: [cx,cy,cz, nx,ny,nz (normal for lighting), w,h, rotY, tilt]
 const P=[],N=[],U=[],I=[];let v=0;
 for(const c of cards){const [x,y,z,nx,ny,nz,w,h,ry,tilt]=c;const cr=Math.cos(ry),sr=Math.sin(ry),ct=Math.cos(tilt),st=Math.sin(tilt);
  const ax=[cr*w/2,0,-sr*w/2],up=[sr*st*h,ct*h,cr*st*h];
  const q=[[-1,-.5],[1,-.5],[1,.5],[-1,.5]];for(const [a,b] of q){P.push(x+ax[0]*a+up[0]*b,y+ax[1]*a+up[1]*b,z+ax[2]*a+up[2]*b);N.push(nx,ny,nz);}U.push(0,0,1,0,1,1,0,1);I.push(v,v+1,v+2,v,v+2,v+3);v+=4;}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('normal',new T.Float32BufferAttribute(N,3));g.setAttribute('uv',new T.Float32BufferAttribute(U,2));g.setIndex(I);return g;}
function crossGeo(w,h,n=2,y0=0){const cards=[];for(let k=0;k<n;k++){const a=k/n*Math.PI;cards.push([0,y0+h/2,0,Math.sin(a+Math.PI/2)*.3,.9,Math.cos(a+Math.PI/2)*.3,w,h,a,0]);}return cardsGeo(cards);}
function crownGeo(seed,count,cy,rx,ry,size,round=true){const r=rng(seed),cards=[];for(let k=0;k<count;k++){const u=r()*2-1,a=r()*Math.PI*2,rr=Math.sqrt(1-u*u),f=mix(.55,1,Math.pow(r(),.5));const dx=Math.cos(a)*rr*f,dz=Math.sin(a)*rr*f,dy=u*f;const n=new T.Vector3(dx,dy*1.2+.25,dz).normalize();cards.push([dx*rx,cy+dy*ry,dz*rx,n.x,n.y,n.z,size*mix(.8,1.2,r()),size*mix(.8,1.2,r()),r()*Math.PI*2,(r()-.5)*1.2]);}return cardsGeo(cards);}
function trunkGeo(r0,r1,h,seg=7,branches=[]){const gs=[new T.CylinderGeometry(r1,r0,h,seg,3,true).translate(0,h/2,0)];for(const b of branches){const g=new T.CylinderGeometry(b.r*.5,b.r,b.len,5,1,true);g.translate(0,b.len/2,0);g.rotateZ(b.tilt);g.rotateY(b.yaw);g.translate(0,b.y,0);gs.push(g);}return mergeGeos(gs);}
function mergeGeos(gs){let n=0,ni=0;for(const g of gs){n+=g.attributes.position.count;ni+=g.index?g.index.count:g.attributes.position.count;}const P=new Float32Array(n*3),N=new Float32Array(n*3),U=new Float32Array(n*2),I=new Uint32Array(ni);let o=0,oi=0;
 for(const g of gs){const c=g.attributes.position.count;P.set(g.attributes.position.array,o*3);if(!g.attributes.normal)g.computeVertexNormals();N.set(g.attributes.normal.array,o*3);if(g.attributes.uv)U.set(g.attributes.uv.array,o*2);if(g.index){for(let k=0;k<g.index.count;k++)I[oi++]=g.index.array[k]+o;}else for(let k=0;k<c;k++)I[oi++]=o+k;o+=c;}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(P,3));g.setAttribute('normal',new T.BufferAttribute(N,3));g.setAttribute('uv',new T.BufferAttribute(U,2));g.setIndex(new T.BufferAttribute(I,1));return g;}
function coniferGeo(seed=1){const r=rng(seed),cards=[];const tiers=8;for(let t=0;t<tiers;t++){const y=.2+t/tiers*.75,rad=(1-t/tiers)*.24+.04,n=7-Math.floor(t/3);for(let k=0;k<n;k++){const a=k/n*Math.PI*2+r()*.5+t;const dx=Math.cos(a),dz=Math.sin(a);cards.push([dx*rad*.55,y,dz*rad*.55,dx*.6,.7,dz*.6,rad*1.15,rad*1.1,-a+Math.PI/2,1.15]);}}
 cards.push([0,.96,0,0,1,0,.08,.12,0,0],[0,.96,0,0,1,0,.08,.12,Math.PI/2,0]);return cardsGeo(cards);}
function coniferCrossGeo(seed=2){const r=rng(seed),cards=[];for(let t=0;t<6;t++){const y=.25+t*.12,rad=(1-t/6)*.25+.05;for(let k=0;k<3;k++){const a=k/3*Math.PI+t*.6;cards.push([0,y,0,Math.cos(a)*.5,.7,Math.sin(a)*.5,rad*2,.22,a,0]);}}return cardsGeo(cards);}
function boulderGeo(seed){const g=new T.IcosahedronGeometry(1,1),p=g.attributes.position,r=rng(seed);for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const f=.78+.3*Math.sin(x*3.1+seed)*Math.cos(z*2.7+y*1.9)+.12*r();p.setXYZ(i,x*f,Math.max(-.2,y*f*.72),z*f*.85);}g.computeVertexNormals();return g;}
// ------------------------------------------------------------ foliage material with wind + brush
// fade ranges: vec4(inStart,inEnd,outStart,outEnd) in metres from the camera; a dithered discard crossfades LODs
export const FADE={near:{value:new T.Vector4(0,0,1e5,1e6)},imp:{value:new T.Vector4(0,0,1e5,1e6)},ground:{value:new T.Vector4(0,0,1e5,1e6)},shrub:{value:new T.Vector4(0,0,1e5,1e6)},corn:{value:new T.Vector4(0,0,1e5,1e6)},cornfar:{value:new T.Vector4(0,0,1e5,1e6)}};
function foliageMat(opts){
 const m=new T.MeshStandardMaterial({map:opts.map||null,color:opts.color||0xffffff,alphaTest:opts.alphaTest??.45,side:opts.side??T.DoubleSide,roughness:opts.rough??.85,metalness:0,transparent:false});
 const bend=opts.bend??1,push=opts.push??1,burnMode=opts.burn??0,hScale=opts.hScale??1;
 const fade=opts.fade||null;
 m.onBeforeCompile=sh=>{sh.uniforms.uTime=shared.uTime;sh.uniforms.uPush=pushers;if(fade)sh.uniforms.uFade=fade;sh.uniforms.uBurn=shared.uBurn;sh.uniforms.uBurnRect=shared.uBurnRect;sh.uniforms.uBurnOn=shared.uBurnOn;sh.uniforms.uWind=windU;
  sh.uniforms.uTrack=shared.uTrack;sh.uniforms.uTrackRect=shared.uTrackRect;
  sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
uniform float uTime;uniform vec4 uPush[20];uniform vec4 uWind;uniform sampler2D uTrack;uniform vec4 uTrackRect;varying vec3 vFW;varying float vFH;`).replace('#include <project_vertex>',`
mat4 IM=mat4(1.0);
#ifdef USE_INSTANCING
IM=instanceMatrix;
#endif
vec4 wp=modelMatrix*IM*vec4(transformed,1.0);vec3 base=(modelMatrix*IM*vec4(0.0,0.0,0.0,1.0)).xyz;
float hf=clamp(transformed.y/${hScale.toFixed(2)},0.0,1.5);float h2=hf*hf;
float ph=dot(base.xz,vec2(.071,.053));
vec2 wd=uWind.xy;float gust=.6+.4*sin(uTime*.37+ph*.3)*sin(uTime*.11+ph*.07);
wp.xz+=wd*(sin(uTime*1.3+ph)*.5+.8)*gust*h2*${(.35*bend).toFixed(3)}*uWind.z;
wp.xyz+=vec3(sin(uTime*6.1+wp.y*3.0+ph*9.0),sin(uTime*5.3+wp.x*2.0),cos(uTime*6.7+wp.z*3.0))*.02*hf*uWind.z*${bend.toFixed(2)};
// brush: tyres, legs and the cabin belly push stems and branches aside
for(int i=0;i<20;i++){vec4 P=uPush[i];if(P.w<=0.0)continue;vec3 d=wp.xyz-P.xyz;float dh=length(d.xz);float r=P.w;
 float over=r-length(d*vec3(1.0,.8,1.0));if(over>0.0){vec2 dir=dh>1e-3?d.xz/dh:vec2(1.0,0.0);float k=clamp(over/r,0.0,1.0)*${push.toFixed(2)};wp.xz+=dir*k*r*.85*hf;wp.y-=k*r*.55*h2;}}
// crushed where the tyres have passed (tyre-track texture)
${push>0.9?`{vec2 tu=(wp.xz-uTrackRect.xy)/uTrackRect.zw;if(tu.x>0.0&&tu.y>0.0&&tu.x<1.0&&tu.y<1.0){float tr=clamp(texture(uTrack,tu).r*2.2,0.0,1.0);wp.y-=tr*(wp.y-base.y)*.82;wp.xz+=vec2(sin(ph*7.0),cos(ph*5.0))*tr*hf*.5;}}`:''}
vFW=wp.xyz;vFH=hf;
vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;`);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D uBurn;uniform vec4 uBurnRect;uniform float uBurnOn;varying vec3 vFW;varying float vFH;${fade?'uniform vec4 uFade;':''}`).replace('#include <map_fragment>',`#include <map_fragment>
${fade?'{float dc=length(vFW-cameraPosition);float fa=smoothstep(uFade.x,uFade.y,dc)*(1.0-smoothstep(uFade.z,uFade.w,dc));float dth=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));if(fa<=dth)discard;}':''}
diffuseColor.rgb*=mix(.62,1.08,clamp(vFH,0.0,1.0));
if(uBurnOn>.5){vec2 bu=(vFW.xz-uBurnRect.xy)/uBurnRect.zw;if(bu.x>0.0&&bu.y>0.0&&bu.x<1.0&&bu.y<1.0){vec4 b=texture2D(uBurn,bu);
 ${burnMode===1?'if(b.g>.45)discard;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.5,.18,.03),b.r);':'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.04),b.g*.95);'}}}`);
 };
 m.customProgramCacheKey=()=>'fol-'+bend+'-'+push+'-'+burnMode+'-'+hScale+(fade?'-f':'');return m;
}
const windU={value:new T.Vector4(.8,.4,1,0)};
// ------------------------------------------------------------ the manager
export class Vegetation{
 constructor(scene,terrain,renderer,{workers,quality='medium'}){
  this.scene=scene;this.t=terrain;this.renderer=renderer;this.workers=workers;this.q=quality;this.cfg(quality);
  this.chunks=new Map();this.near=new Map();this.pendingF=new Set();this.pendingN=new Set();this.broken=new Set();this.falling=[];
  this.col=new Map();// physics colliders per chunk (main thread)
  for(const w of workers)w.addEventListener('message',e=>{const d=e.data;if(d.type!=='veg')return;if(d.nearOnly){this.pendingN.delete(d.key);this.near.set(d.key,d.lists);}else{this.pendingF.delete(d.key);this.chunks.set(d.key,d.lists);}this.dirty=true;});
  this.makeSpecies();this.last=new T.Vector3(1e9,0,1e9);this.dirty=true;this.rr=0;
 }
 // boulder colour per body: mare basalt, dust-coated Mars rock, water-ice cobbles under orange light
 setBody(B){this.rockM.color.set(B.id==='moon'?0x6a6966:B.id==='mars'?0x7c6454:B.id==='titan'?0xbfa585:0x8a857c);}
 cfg(q){this.q=q;this.Rt=q==='low'?650:q==='high'?1300:950;this.Rnear=q==='low'?130:q==='high'?240:180;this.Rg=q==='low'?95:q==='high'?200:150;this.Rc=q==='low'?85:q==='high'?170:125;this.Rcf=q==='low'?300:q==='high'?520:400;
  // staged LOD: full trees to Rnear (crossfading to impostors over the last 35 m), impostors to Rt; ground cover fades out over its last 30 m
  FADE.near.value.set(0,0,this.Rnear-35,this.Rnear);FADE.imp.value.set(this.Rnear-35,this.Rnear,this.Rt-120,this.Rt);
  FADE.ground.value.set(0,0,this.Rg-30,this.Rg);FADE.shrub.value.set(0,0,this.Rnear*1.4-40,this.Rnear*1.4);FADE.corn.value.set(0,0,this.Rc-14,this.Rc);FADE.cornfar.value.set(this.Rc-14,this.Rc,this.Rcf-60,this.Rcf);}
 makeSpecies(){
  const leaf=leafCluster([80,112],[16,34],110),birchLeaf=leafCluster([62,90],[30,50],80,'small'),sageLeaf=leafCluster([70,100],[40,58],120,'small'),shrubLeaf=leafCluster([70,110],[14,30],120);
  const needles=needleBranch(),bark=barkTex(),barkW=barkTex(true);
  const grassT=bladeTex(92,[24,44],28,.95),dryT=bladeTex(48,[48,66],24,.9),reedT=bladeTex(80,[26,40],14,1,'#5a3a22'),wheatT=bladeTex(46,[52,64],26,1,'#d2b060'),flowerT=flowerTex(),cornT=cornPlantTex(),rowT=cornRowTex(),yuccaT=yuccaTex();
  for(const t of [bark,barkW])t.wrapS=t.wrapT=T.RepeatWrapping;rowT.wrapS=T.RepeatWrapping;
  const trunkM=foliageMat({map:bark,alphaTest:0,side:T.FrontSide,bend:.35,push:.4,burn:2,hScale:1,fade:FADE.near}),trunkW=foliageMat({map:barkW,alphaTest:0,side:T.FrontSide,bend:.35,push:.4,burn:2,hScale:1,fade:FADE.near});
  const leafM=foliageMat({map:leaf,bend:1,push:.8,burn:1,hScale:1,fade:FADE.near}),needleM=foliageMat({map:needles,bend:.8,push:.7,burn:1,hScale:1,fade:FADE.near}),birchM=foliageMat({map:birchLeaf,bend:1.2,push:.9,burn:1,hScale:1,fade:FADE.near});
  const shrubM=foliageMat({map:shrubLeaf,bend:1,push:1,burn:1,hScale:1.2,fade:FADE.shrub}),sageM=foliageMat({map:sageLeaf,bend:.8,push:1,burn:1,hScale:1,fade:FADE.shrub});
  const gf={fade:FADE.ground};const grassM=foliageMat({map:grassT,bend:1.4,push:1.2,burn:1,hScale:.7,...gf}),dryM=foliageMat({map:dryT,bend:1.4,push:1.2,burn:1,hScale:.7,...gf}),reedM=foliageMat({map:reedT,bend:1.6,push:1.2,burn:1,hScale:1.6,...gf}),wheatM=foliageMat({map:wheatT,bend:1.3,push:1.3,burn:1,hScale:.9,...gf}),flowerM=foliageMat({map:flowerT,bend:1.3,push:1.2,burn:1,hScale:.7,...gf});
  const cornM=foliageMat({map:cornT,bend:.9,push:1.4,burn:1,hScale:2.3,fade:FADE.corn}),rowM=foliageMat({map:rowT,bend:.5,push:0,burn:1,hScale:2.3,fade:FADE.cornfar}),yuccaM=foliageMat({map:yuccaT,bend:.4,push:.6,burn:1,hScale:1,fade:FADE.ground});
  const rockM=this.rockM=new T.MeshStandardMaterial({color:0x8a857c,roughness:.92,flatShading:true});const logM=foliageMat({map:bark,alphaTest:0,side:T.FrontSide,bend:0,push:0,burn:2,hScale:1});
  this.mats={leafM,needleM};
  // tree parts (normalised to height 1)
  const broadTrunk=trunkGeo(.028,.016,.62,7,[{r:.012,len:.26,tilt:.7,yaw:0,y:.45},{r:.011,len:.24,tilt:.8,yaw:2.2,y:.5},{r:.01,len:.22,tilt:.75,yaw:4.3,y:.55}]);
  const coniTrunk=trunkGeo(.024,.004,.98,6),birchTrunk=trunkGeo(.018,.01,.8,6,[{r:.006,len:.18,tilt:.6,yaw:1,y:.6},{r:.006,len:.16,tilt:.7,yaw:3.5,y:.66}]);
  const snagTrunk=trunkGeo(.03,.012,.9,6,[{r:.012,len:.3,tilt:.9,yaw:.3,y:.55},{r:.01,len:.22,tilt:1.1,yaw:2.8,y:.68},{r:.008,len:.18,tilt:.7,yaw:4.6,y:.78}]);
  const D=(name,parts,opts={})=>({name,parts,...opts});
  this.defs=[];
  this.defs[SP.conifer]=D('conifer',[[coniTrunk,trunkM],[coniferGeo(3),needleM]],{imp:true});
  this.defs[SP.broadleaf]=D('broadleaf',[[broadTrunk,trunkM],[crownGeo(7,34,.68,.3,.24,.26),leafM]],{imp:true});
  this.defs[SP.birch]=D('birch',[[birchTrunk,trunkW],[crownGeo(9,26,.7,.2,.24,.19),birchM]],{imp:true});
  this.defs[SP.snag]=D('snag',[[snagTrunk,trunkM]],{imp:true});
  this.defs[SP.sapling]=D('sapling',[[broadTrunk,trunkM],[crownGeo(11,20,.66,.32,.3,.34),leafM]]);
  this.defs[SP.shrub]=D('shrub',[[crownGeo(13,16,.45,.55,.4,.55),shrubM]]);
  this.defs[SP.sage]=D('sage',[[crownGeo(15,12,.3,.5,.28,.45),sageM]]);
  this.defs[SP.grass]=D('grass',[[crossGeo(.9,.7,3),grassM]]);
  this.defs[SP.drygrass]=D('drygrass',[[crossGeo(.9,.6,3),dryM]]);
  this.defs[SP.flowers]=D('flowers',[[crossGeo(.9,.65,3),flowerM]]);
  this.defs[SP.reeds]=D('reeds',[[crossGeo(.8,1.7,3),reedM]]);
  this.defs[SP.wheat]=D('wheat',[[crossGeo(1.1,.95,3),wheatM]]);
  this.defs[SP.yucca]=D('yucca',[[crossGeo(1.2,1.1,3),yuccaM]]);
  this.defs[SP.boulder]=D('boulder',[[boulderGeo(3),rockM]]);
  this.defs[SP.log]=D('log',[[new T.CylinderGeometry(1,1,1,8,1).rotateZ(Math.PI/2),logM]]);
  // corn: 1.6 m of row with 4 plants; crossed plant cards plus arching leaf strips for the view from above
  {const cards=[];for(let k=0;k<4;k++){const x=-.6+k*.4;for(let c=0;c<3;c++){const a=c*Math.PI/3+k*.5;cards.push([x,1.15,0,Math.sin(a)*.3,.85,Math.cos(a)*.3,.8,2.3,a,0]);}for(let l=0;l<4;l++){const a=l*1.57+k*.8;cards.push([x+Math.cos(a)*.26,1.35+l*.2,Math.sin(a)*.26,0,1,0,.62,.18,-a,1.2-l*.08]);}}this.defs[SP.corn]=D('corn',[[cardsGeo(cards),cornM]]);}
  {const g=cardsGeo([[0,1.15,0,0,.9,.3,6,2.3,0,0]]);g.attributes.uv.array.forEach((v,i,a)=>{if(i%2===0)a[i]=v*3;});this.defs[SP.cornfar]=D('cornfar',[[g,rowM]]);}
  // instanced meshes: near LOD for every species, impostor LOD for trees
  this.inst=[];
  const cap=sp=>({[SP.grass]:70000,[SP.drygrass]:50000,[SP.flowers]:9000,[SP.wheat]:70000,[SP.reeds]:14000,[SP.corn]:34000,[SP.cornfar]:30000,[SP.shrub]:18000,[SP.sage]:14000,[SP.boulder]:9000,[SP.log]:2500,[SP.yucca]:2500,[SP.sapling]:4000})[sp]||9000;
  this.defs.forEach((d,sp)=>{if(!d)return;const meshes=d.parts.map(([g,m])=>{const im=new T.InstancedMesh(g,m,cap(sp));im.instanceColor=new T.InstancedBufferAttribute(new Float32Array(cap(sp)*3).fill(1),3);im.instanceColor.setUsage(T.DynamicDrawUsage);im.count=0;im.frustumCulled=false;im.castShadow=SPECIES[sp].tree||sp===SP.boulder||sp===SP.shrub;im.receiveShadow=true;im.instanceMatrix.setUsage(T.DynamicDrawUsage);this.scene.add(im);return im;});
   this.inst[sp]={meshes,cap:cap(sp)};});
  // impostors rendered from the 3D models
  this.imp=[];for(const sp of [SP.conifer,SP.broadleaf,SP.birch,SP.snag]){const tex=this.renderImpostor(this.defs[sp]);const m=foliageMat({map:tex,bend:.3,push:0,burn:1,hScale:1,alphaTest:.4,fade:FADE.imp});const g=crossGeo(sp===SP.conifer?.62:.8,1,3,0);
   const im=new T.InstancedMesh(g,m,16000);im.instanceColor=new T.InstancedBufferAttribute(new Float32Array(16000*3).fill(1),3);im.instanceColor.setUsage(T.DynamicDrawUsage);im.count=0;im.frustumCulled=false;im.castShadow=false;im.receiveShadow=false;im.instanceMatrix.setUsage(T.DynamicDrawUsage);this.scene.add(im);this.imp[sp]={mesh:im,cap:16000};}
 }
 renderImpostor(def){
  const size=256,rt=new T.WebGLRenderTarget(size,size,{samples:4});rt.texture.colorSpace=T.SRGBColorSpace;
  const sc=new T.Scene();sc.add(new T.AmbientLight(0xffffff,3.1));
  const g=new T.Group();for(const [geo,mat] of def.parts){const m2=mat.clone();m2.onBeforeCompile=()=>{};m2.customProgramCacheKey=()=>'imp'+mat.uuid;g.add(new T.Mesh(geo,m2));}sc.add(g);
  const w=def.name==='conifer'?.62:.8;const cam=new T.OrthographicCamera(-w/2,w/2,1.02,-.02,-5,5);cam.position.set(0,.5,2);cam.lookAt(0,.5,0);
  const r=this.renderer,prev=r.getRenderTarget(),pc=new T.Color();r.getClearColor(pc);const pa=r.getClearAlpha();r.setRenderTarget(rt);r.setClearColor(0x000000,0);r.clear();r.render(sc,cam);r.setRenderTarget(prev);r.setClearColor(pc,pa);
  rt.texture.generateMipmaps=true;return rt.texture;
 }
 key(cx,cz){return cx*10007+cz;}
 update(cam,vehiclePos,dt){
  // wind
  windU.value.w=0;
  // chunk requests are centred ahead of the vehicle (3 s of travel) so cover is in place before it is reached
  const vp=vehiclePos||[cam.x,0,cam.z];if(this._vp){const vx=(vp[0]-this._vp[0])/Math.max(dt,1/120),vz=(vp[2]-this._vp[2])/Math.max(dt,1/120);const k=Math.min(1,dt*4);this._vel=[(this._vel?.[0]||0)+(vx-(this._vel?.[0]||0))*k,(this._vel?.[1]||0)+(vz-(this._vel?.[1]||0))*k];}this._vp=[vp[0],vp[2]];
  const ax=cam.x+(this._vel?this._vel[0]*3:0),az=cam.z+(this._vel?this._vel[1]*3:0);
  const cx=Math.floor(ax/CHUNK),cz=Math.floor(az/CHUNK),rT=Math.ceil(this.Rt/CHUNK),rN=Math.ceil(Math.max(this.Rg,this.Rc)/CHUNK)+2;
  // request chunks, nearest first, limited in flight
  const req=[];for(let j=-rT;j<=rT;j++)for(let i=-rT;i<=rT;i++){const d=Math.hypot(i,j)*CHUNK;if(d>this.Rt+CHUNK)continue;const k=this.key(cx+i,cz+j);if(!this.chunks.has(k)&&!this.pendingF.has(k))req.push([d,cx+i,cz+j,k,false]);}
  for(let j=-rN;j<=rN;j++)for(let i=-rN;i<=rN;i++){const k=this.key(cx+i,cz+j);if(!this.near.has(k)&&!this.pendingN.has(k))req.push([Math.hypot(i,j)*CHUNK-40,cx+i,cz+j,k,true]);}
  req.sort((a,b)=>a[0]-b[0]);
  let inflight=this.pendingF.size+this.pendingN.size;
  for(const [d,x,z,k,near] of req){if(inflight>=14)break;inflight++;(near?this.pendingN:this.pendingF).add(k);this.workers[this.rr++%this.workers.length].postMessage({type:'veg',key:k,cx:x,cz:z,nearOnly:near,far:!near});}
  // evict far chunks
  if(this.chunks.size>1400)for(const [k] of this.chunks){const x=Math.floor(k/10007+.5),z=k-x*10007;if(Math.hypot(x-cx,z-cz)*CHUNK>this.Rt*1.4)this.chunks.delete(k);}
  if(this.near.size>420)for(const [k] of this.near){const x=Math.floor(k/10007+.5),z=k-x*10007;if(Math.hypot(x-cx,z-cz)*CHUNK>Math.max(this.Rg,this.Rc)*1.6+CHUNK)this.near.delete(k);}
  // rebuild instance buffers when moved or new data arrived
  const moved=Math.hypot(cam.x-this.last.x,cam.z-this.last.z);
  if(moved>10||(this.dirty&&(performance.now()-(this._lastBuild||0))>250)){this.rebuild(cam);this.last.copy(cam);this.dirty=false;this._lastBuild=performance.now();}
  this.updateFalling(dt);
 }
 // instance transforms and tints for one chunk list, computed once and then copied in bulk
 _cache(L,sp){if(L._m)return L;const n=L.length/STRIDE,mat=new Float32Array(n*16),col=new Float32Array(n*3);
  const M=new T.Matrix4(),Q=new T.Quaternion(),S=new T.Vector3(),P=new T.Vector3(),Y=new T.Vector3(0,1,0);
  for(let i=0;i<n;i++){const k=i*STRIDE,x=L[k],y=L[k+1],z=L[k+2],rot=L[k+3],s=L[k+4],tint=L[k+5],aux=L[k+6];
   P.set(x,y,z);Q.setFromAxisAngle(Y,rot);
   if(sp===SP.log){S.set(s,aux,aux);}else if(sp===SP.boulder){S.set(s,s*(.7+aux*.5),s*(.8+tint*.3));}else if(sp===SP.cornfar||sp===SP.corn){S.set(1,s,1);}else S.set(s,s,s);
   M.compose(P,Q,S);mat.set(M.elements,i*16);
   const hue=SPECIES[sp].tree?mix(.85,1.12,tint):mix(.88,1.1,tint);col[i*3]=hue;col[i*3+1]=hue*(sp===SP.conifer?1:1.02);col[i*3+2]=hue*.95;}
  L._m=mat;L._c=col;return L;}
 rebuild(cam){
  const counts=[],impC=[];for(let sp=0;sp<this.inst.length;sp++)counts[sp]=0;for(const sp of [0,1,2,3])impC[sp]=0;
  const nearR=this.Rnear;const brokenBy=new Map();for(const b of this.broken){const i=b.lastIndexOf(':');const k=+b.slice(0,i);let set=brokenBy.get(k);if(!set)brokenBy.set(k,set=new Set());set.add(+b.slice(i+1));}
  // copy instances [i0,i1) of a cached list into a species' instanced meshes (or its impostor)
  const put=(sp,L,i,imp)=>{
   if(imp){const I=this.imp[sp];if(impC[sp]>=I.cap)return;I.mesh.instanceMatrix.array.set(L._m.subarray(i*16,i*16+16),impC[sp]*16);if(I.mesh.instanceColor)I.mesh.instanceColor.array.set(L._c.subarray(i*3,i*3+3),impC[sp]*3);impC[sp]++;return;}
   const I=this.inst[sp];if(!I||counts[sp]>=I.cap)return;for(const m of I.meshes){m.instanceMatrix.array.set(L._m.subarray(i*16,i*16+16),counts[sp]*16);if(m.instanceColor)m.instanceColor.array.set(L._c.subarray(i*3,i*3+3),counts[sp]*3);}counts[sp]++;};
  const putAll=(sp,L,br)=>{const I=this.inst[sp];if(!I)return;const n=L.length/STRIDE;if(br){for(let i=0;i<n;i++)if(!br.has(i))put(sp,L,i,false);return;}
   const room=Math.min(n,I.cap-counts[sp]);if(room<=0)return;for(const m of I.meshes){m.instanceMatrix.array.set(L._m.subarray(0,room*16),counts[sp]*16);if(m.instanceColor)m.instanceColor.array.set(L._c.subarray(0,room*3),counts[sp]*3);}counts[sp]+=room;};
  const half=CHUNK*.71;
  for(const [key,lists] of this.chunks){const x=Math.floor(key/10007+.5),z=key-x*10007,cx=(x+.5)*CHUNK,cz=(z+.5)*CHUNK;const dc=Math.hypot(cx-cam.x,cz-cam.z);if(dc>this.Rt+CHUNK)continue;const br=brokenBy.get(key);
   lists.forEach((L,sp)=>{if(!L||!L.length)return;this._cache(L,sp);
    const tree=SPECIES[sp].tree&&sp!==SP.sapling;const n=L.length/STRIDE;
    if(sp===SP.cornfar){if(dc+half<this.Rc-6||dc-half>this.Rcf)return;for(let i=0;i<n;i++){const d=Math.hypot(L[i*STRIDE]-cam.x,L[i*STRIDE+2]-cam.z);if(d>=this.Rc-6&&d<=this.Rcf)put(sp,L,i,false);}return;}
    if(tree){if(dc-half>this.Rt)return;
     // whole chunk inside the near ring: one bulk copy
     if(dc+half<=nearR&&!br){putAll(sp,L,null);return;}
     for(let i=0;i<n;i++){if(br&&br.has(i))continue;const d=Math.hypot(L[i*STRIDE]-cam.x,L[i*STRIDE+2]-cam.z);if(d>this.Rt)continue;put(sp,L,i,d>nearR);}return;}
    const lim=sp===SP.boulder?this.Rt*.6:sp===SP.log?nearR*1.3:sp===SP.sapling?nearR*1.2:nearR*1.4;if(dc-half>lim)return;
    if(dc+half<=lim){putAll(sp,L,br);return;}
    for(let i=0;i<n;i++){if(br&&br.has(i))continue;if(Math.hypot(L[i*STRIDE]-cam.x,L[i*STRIDE+2]-cam.z)<lim)put(sp,L,i,false);}});}
  for(const [key,lists] of this.near){const x=Math.floor(key/10007+.5),z=key-x*10007,dc=Math.hypot((x+.5)*CHUNK-cam.x,(z+.5)*CHUNK-cam.z);
   lists.forEach((L,sp)=>{if(!L||!L.length)return;this._cache(L,sp);const lim=sp===SP.corn?this.Rc:this.Rg;if(dc-half>lim)return;if(dc+half<=lim){putAll(sp,L,null);return;}
    const n=L.length/STRIDE;for(let i=0;i<n;i++)if(Math.hypot(L[i*STRIDE]-cam.x,L[i*STRIDE+2]-cam.z)<lim)put(sp,L,i,false);});}
  this.inst.forEach((I,sp)=>{if(!I)return;for(const m of I.meshes){m.count=counts[sp];m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}});
  for(const sp of [0,1,2,3]){const I=this.imp[sp];I.mesh.count=impC[sp];I.mesh.instanceMatrix.needsUpdate=true;if(I.mesh.instanceColor)I.mesh.instanceColor.needsUpdate=true;}
  this.stats={instances:counts.reduce((a,b)=>a+(b||0),0),impostors:impC.reduce((a,b)=>a+(b||0),0),chunks:this.chunks.size,near:this.near.size};
 }
 // ------------------------------------------------------------ physics colliders (main thread, same placement)
 colliders(x,z,r=40){
  const out=[];const c0x=Math.floor((x-r)/CHUNK),c1x=Math.floor((x+r)/CHUNK),c0z=Math.floor((z-r)/CHUNK),c1z=Math.floor((z+r)/CHUNK);
  for(let cz=c0z;cz<=c1z;cz++)for(let cx=c0x;cx<=c1x;cx++){const k=this.key(cx,cz);let c=this.col.get(k);
   if(!c){const lists=this.chunks.get(k)||placeChunk(this.t,cx,cz,{});c=collidersFrom(lists,k);for(const tr of c.trunks)if(this.broken.has(k+':'+tr.idx))tr.broken=true;this.col.set(k,c);if(this.col.size>64){const first=this.col.keys().next().value;this.col.delete(first);}}
   out.push(c);}
  return out;
 }
 obstacles(x,z,r,list){list.length=0;for(const c of this.colliders(x,z,r+8)){for(const o of c.trunks)if(!o.broken&&Math.abs(o.x-x)<r&&Math.abs(o.z-z)<r)list.push(o);for(const o of c.canopies)if(Math.abs(o.x-x)<r&&Math.abs(o.z-z)<r)list.push(o);}return list;}
 capHeight(x,z){let top=-1e9;const k=this.key(Math.floor(x/CHUNK),Math.floor(z/CHUNK));const c=this.col.get(k);if(c&&c.caps.length)top=capHeight(c.caps,x,z);return top;}
 breakTree(ob,dx,dz){
  this.broken.add(ob.key+':'+ob.idx);ob.broken=true;this.dirty=true;this._lastBuild=0;
  const d=this.defs[ob.sp]||this.defs[SP.sapling];const g=new T.Group();for(const [geo,mat] of d.parts){const m=new T.Mesh(geo,mat);m.castShadow=true;g.add(m);}
  const h=ob.h/.7;g.position.set(ob.x,ob.y,ob.z);g.scale.setScalar(h);this.scene.add(g);
  const axis=new T.Vector3(dz,0,-dx).normalize();this.falling.push({g,axis,t:0,dur:1.4+Math.random()*.6,life:40});
  return {x:ob.x,y:ob.y+h*.6,z:ob.z,h};
 }
 updateFalling(dt){for(const f of this.falling){f.t+=dt;const k=Math.min(1,f.t/f.dur);const a=k*k*(Math.PI/2-.12);f.g.quaternion.setFromAxisAngle(f.axis,a);f.life-=dt;}
  this.falling=this.falling.filter(f=>{if(f.life<=0){this.scene.remove(f.g);return false;}return true;});}
}
