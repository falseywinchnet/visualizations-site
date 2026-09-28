// The Spider: detailed three.js model driven by the physics state.
// Body frame matches physics.mjs: x right, y up, z back; origin at the ground reference.
import * as T from 'three';
import {GEOM} from './physics.mjs';
import {mergeNonIndexed} from './scenery.mjs';

const LEG_X=4.02,AXLE=GEOM.halfTrack-LEG_X,PLATE=GEOM.plateY,RIM_R=GEOM.R*.58;
const mixN=(a,b,t)=>a+(b-a)*t;
const LIVERY={scout:{paint:0x55604a,accent:0x2c3329},troop:{paint:0x4a5240,accent:0x2a2f27},rescue:{paint:0xd8d6cf,accent:0xc2412d},fire:{paint:0xa8321f,accent:0xe6d9b8}};
const UNIFORM={scout:[0x5d6a4c,0x3b4436],troop:[0x55603f,0x2f3a2a],rescue:[0xd06a28,0xf2f2ee],fire:[0xb8872e,0xd8c56a]};

export class SpiderModel{
 constructor({variant='scout',envMap=null}={}){
  this.variant=variant;this.root=new T.Group();this.root.name='Spider';
  const liv=LIVERY[variant];
  this.dirt={value:.15};this.wet={value:0};this.groundY={value:0};
  const dirty=(m)=>{m.onBeforeCompile=sh=>{sh.uniforms.uDirt=this.dirt;sh.uniforms.uWetV=this.wet;sh.uniforms.uGroundY=this.groundY;
   sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWp=(modelMatrix*vec4(transformed,1.0)).xyz;');
   sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vWp;uniform float uDirt;uniform float uWetV;uniform float uGroundY;
float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
   .replace('#include <map_fragment>',`#include <map_fragment>
{float hgt=vWp.y-uGroundY;float n=n3(vWp*3.1)*.6+n3(vWp*11.0)*.4;float d=clamp(uDirt*(1.4-hgt*.28)+(n-.5)*.9,0.0,1.0)*step(.02,uDirt);
 d*=smoothstep(.0,.35,d);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.23,.18,.12)*(.8+.4*n),d*.85);vDirtF=d;}`)
   .replace('void main() {','float vDirtF;\nvoid main() {')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.95,vDirtF);roughnessFactor=mix(roughnessFactor,.25,uWetV);');};
   m.customProgramCacheKey=()=>'dirty-'+m.uuid.slice(0,4);return m;};
  const M=this.mats={
   paint:dirty(new T.MeshStandardMaterial({color:liv.paint,roughness:.55,metalness:.35})),
   accent:dirty(new T.MeshStandardMaterial({color:liv.accent,roughness:.5,metalness:.3})),
   frame:dirty(new T.MeshStandardMaterial({color:0x3d4540,roughness:.5,metalness:.7})),
   dark:new T.MeshStandardMaterial({color:0x1d2224,roughness:.6,metalness:.4}),
   chrome:new T.MeshStandardMaterial({color:0xdfe6e6,roughness:.12,metalness:1}),
   brass:new T.MeshStandardMaterial({color:0xb08d4f,roughness:.35,metalness:.9}),
   rubber:dirty(new T.MeshStandardMaterial({color:0x2a2a27,roughness:.9,metalness:0})),
   redPaint:new T.MeshStandardMaterial({color:0xa3261b,roughness:.45,metalness:.2}),
   aramid:dirty(new T.MeshStandardMaterial({color:0xc9a227,roughness:.55,metalness:.1})),
   webbing:new T.MeshStandardMaterial({color:0x3c3f2e,roughness:.9}),
   lamp:new T.MeshStandardMaterial({color:0xfff4dc,emissive:0xfff0d0,emissiveIntensity:.6,roughness:.4}),
   hose:new T.MeshStandardMaterial({color:0x151617,roughness:.7}),
   rim:dirty(new T.MeshStandardMaterial({color:0x6b7064,roughness:.45,metalness:.7})),
   glass:new T.MeshStandardMaterial({color:0x9cc6c8,roughness:.04,metalness:.15,transparent:true,opacity:.16,depthWrite:false,side:T.DoubleSide,envMapIntensity:1.6}),
   seat:new T.MeshStandardMaterial({color:0x2d2f2c,roughness:.7}),
   floorGlass:new T.MeshStandardMaterial({color:0x9ab8b8,roughness:.08,metalness:.1,transparent:true,opacity:.22,depthWrite:false}),
   grate:new T.MeshStandardMaterial({color:0x2a2e2d,roughness:.5,metalness:.8}),
   screen:new T.MeshStandardMaterial({color:0x103030,emissive:0x2fbfa8,emissiveIntensity:1.2,roughness:.3}),
   amber:new T.MeshStandardMaterial({color:0x332200,emissive:0xffa630,emissiveIntensity:0}),
   headlamp:new T.MeshStandardMaterial({color:0x3a3c3c,emissive:0xfff2d0,emissiveIntensity:0,roughness:.2,metalness:.6}),
   red:new T.MeshStandardMaterial({color:0x440000,emissive:0xff2a1a,emissiveIntensity:0}),
   blue:new T.MeshStandardMaterial({color:0x000a33,emissive:0x2a6aff,emissiveIntensity:0}),
   engine:new T.MeshStandardMaterial({color:0x2e3336,roughness:.45,metalness:.8}),
   tank:dirty(new T.MeshStandardMaterial({color:variant==='fire'?0xd9d3c0:0x7f8a72,roughness:.5,metalness:.4})),
  };
  if(envMap)for(const k in M)M[k].envMap=envMap;
  this.pairs=[];this.legs=[];this.wheels=[];this.lights={};
  this.buildTop();this.buildCabin();this.buildPairs();this.buildVariant();
  // merge static parts per material to keep draw calls low
  const keep=new Set([this.hatch,this.gauge,this.searchlight,...this.legs.map(l=>l.rod),...this.legs.map(l=>l.stage),...this.legs.map(l=>l.stage2),...this.wheels.map(w=>w.tire),...this.lights.head,...this.lights.nose,...this.lights.tail,...this.lights.beacons,...(this.lights.bar||[])]);
  const groups=[this.top,this.cabin,...this.seats,...this.pairs,...this.legs.map(l=>l.leg),...this.legs.map(l=>l.hub),...this.wheels.map(w=>w.spin)];
  this.cabin.children.filter(c=>c.isGroup&&c!==this.ladder&&!this.seats.includes(c)).forEach(g=>groups.push(g));
  for(const g of groups)mergeByMaterial(g,keep);
  this.root.traverse(o=>{if(o.isMesh){o.castShadow=o.material!==M.glass&&o.material!==M.floorGlass;o.receiveShadow=true;}});
 }
 // ------------------------------------------------------------ helpers
 mesh(g,m,p=[0,0,0],parent=this.root,r){const o=new T.Mesh(g,m);o.position.set(...p);if(r)o.rotation.set(...r);parent.add(o);return o;}
 box(s,p,m,parent,r){return this.mesh(new T.BoxGeometry(...s),m,p,parent,r);}
 rod(a,b,r,m,parent=this.root,seg=10){const av=new T.Vector3(...a),bv=new T.Vector3(...b),v=bv.clone().sub(av);const o=this.mesh(new T.CylinderGeometry(r,r,v.length(),seg),m,av.clone().add(bv).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;}
 tube(pts,r,m,parent=this.root,closed=false,seg=64){return this.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p)),closed),seg,r,8,closed),m,[0,0,0],parent);}
 // ------------------------------------------------------------ overhead structure
 buildTop(){
  const M=this.mats,top=this.top=new T.Group();top.name='Overhead structure';this.root.add(top);
  // continuous top plate with panel seams and a raised spine
  const plate=this.box([2.7,.1,9.9],[0,GEOM.topPlate,.45],M.paint,top);plate.name='Continuous top plate';
  for(const z of [-3.2,-1.2,1.2,3.6])this.box([2.72,.02,.04],[0,GEOM.topPlate+.06,z],M.dark,top);
  this.box([.5,.18,9.5],[0,GEOM.topPlate+.12,.45],M.accent,top);
  for(const s of [-1,1]){this.box([.12,.3,10.8],[s*1.35,GEOM.topPlate-.1,0],M.frame,top);// side rails
   this.rod([s*1.25,6.05,-5],[s*1.25,6.05,5],.07,M.frame,top);}
  // longitudinal carriage slide rails under the plate (the cabin hangs from these)
  for(const s of [-1,1]){this.box([.18,.14,10.4],[s*.72,5.93,0],M.chrome,top);}
  // plate bearings at the stations
  GEOM.stations.forEach((z,i)=>{this.mesh(new T.CylinderGeometry(.82,.82,.14,40),M.frame,[0,PLATE+.12,z],top);this.mesh(new T.CylinderGeometry(.7,.7,.06,40),M.chrome,[0,PLATE+.2,z],top);});
  // hydraulic manifold, pump, reservoir, cooler behind the cabin on top
  this.box([1.3,.45,.9],[0,GEOM.topPlate+.3,4.6],M.engine,top);this.mesh(new T.CylinderGeometry(.28,.28,1.2,16),M.frame,[.5,GEOM.topPlate+.4,3.6],top,[0,0,Math.PI/2]);
  const cool=this.box([2.1,.55,.12],[0,GEOM.topPlate+.4,5.28],M.dark,top);for(let k=0;k<9;k++)this.box([2.0,.02,.05],[0,GEOM.topPlate+.2+k*.05,5.35],M.frame,top);
  // exhaust stacks rising behind the V8
  this.exhausts=[];for(const s of [-1,1]){const e=this.rod([s*.62,4.2,5.2],[s*.72,GEOM.topPlate+.95,5.25],.075,M.dark,top);this.mesh(new T.CylinderGeometry(.09,.075,.25,10),M.chrome,[s*.72,GEOM.topPlate+1.05,5.25],top);this.exhausts.push(new T.Vector3(s*.72,GEOM.topPlate+1.2,5.25));}
  // work lights and beacons along the plate
  this.lights.work=[];for(const z of [-5.2,5.2])for(const s of [-1,1]){const l=this.box([.28,.16,.12],[s*1.0,GEOM.topPlate+.18,z],M.headlamp,top);this.lights.work.push(l);}
  this.lights.beacons=[];for(const z of [-4.8,4.8]){const b=this.mesh(new T.CylinderGeometry(.11,.13,.18,12),M.amber,[0,GEOM.topPlate+.32,z],top);this.lights.beacons.push(b);}
  // front crossmember with a bank of forward floodlights angled at the ground ahead
  this.box([2.9,.22,.24],[0,GEOM.topPlate-.08,-5.3],M.frame,top);for(const s of [-1,1])this.rod([s*1.35,GEOM.topPlate-.1,-5.3],[s*1.25,GEOM.topPlate-.1,-4.4],.06,M.frame,top,8);
  this.lights.head=this.lights.head||[];this.lampMounts=[];
  for(const x of [-1.2,-.78,.78,1.2]){const g=new T.Group();g.position.set(x,GEOM.topPlate+.12,-5.36);g.rotation.x=-.22;top.add(g);
   this.box([.34,.26,.2],[0,0,0],M.dark,g);this.box([.36,.03,.24],[0,.14,-.02],M.frame,g);for(let k=-1;k<=1;k++)this.box([.02,.22,.03],[k*.1,0,-.11],M.frame,g);
   const face=this.box([.3,.2,.02],[0,0,-.105],M.headlamp,g);this.lights.head.push(face);}
  this.lampMounts.push({parent:top,pos:[-.95,GEOM.topPlate+.1,-5.5],aim:[-3,0,-24],angle:.62,power:1.2},{parent:top,pos:[.95,GEOM.topPlate+.1,-5.5],aim:[3,0,-24],angle:.62,power:1.2});
  // antenna whips
  for(const s of [-1,1])this.rod([s*1.2,GEOM.topPlate+.1,3],[s*1.35,GEOM.topPlate+2.4,3.4],.012,M.dark,top,4);
 }
 // ------------------------------------------------------------ cabin (slides on the carriage)
 buildCabin(){
  const M=this.mats,cab=this.cabin=new T.Group();cab.name='Cocoon cabin';this.root.add(cab);
  const Y=GEOM.cabinY,RX=1.5,RY=1.6;
  const sections=[[-5.45,.02],[-5.3,.42],[-5.0,.72],[-4.6,.9],[-4.1,.98],[-3,1],[-1.5,1],[0,1],[1.5,1],[3,1],[4.1,.98],[4.6,.9],[5.0,.72],[5.3,.42],[5.45,.02]];
  const n=56;const pts=[];for(const [z,s] of sections)for(let j=0;j<=n;j++){const a=j/n*Math.PI*2;pts.push(RX*s*Math.cos(a),Y+RY*s*Math.sin(a),z);}
  const glassIdx=[],panelIdx=[],accentIdx=[];
  for(let i=0;i<sections.length-1;i++)for(let j=0;j<n;j++){
   const a=i*(n+1)+j,b=a+n+1,z=(sections[i][0]+sections[i+1][0])/2,sc=(sections[i][1]+sections[i+1][1])/2,ang=(j+.5)/n*Math.PI*2,y=Y+RY*Math.sin(ang),ya=Y+RY*sc*Math.sin(ang),side=Math.abs(Math.cos(ang));
   const f=[a,b,a+1,b,b+1,a+1];
   // rear pod enclosed (engine bay), middle lower panels solid, nose open for the downward view under an upper shield
   let kind='glass';
   if(z>3.9)kind='panel';else if(z>-3.9&&y<Y-.55&&side>.35)kind='panel';else if(z<-4.5&&ya>Y+1.05&&sc>.6)kind='panel';else if(y<Y-1.35&&z>-4.0)kind='panel';
   if(kind==='panel'&&z>3.9&&y<Y-.2)kind='accent';
   (kind==='glass'?glassIdx:kind==='panel'?panelIdx:accentIdx).push(...f);
  }
  const mk=(idx,mat,name)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setIndex(idx);g.computeVertexNormals();const m=this.mesh(g,mat,[0,0,0],cab);m.name=name;return m;};
  const shellMat=M.paint.clone();shellMat.side=T.DoubleSide;shellMat.onBeforeCompile=M.paint.onBeforeCompile;shellMat.customProgramCacheKey=M.paint.customProgramCacheKey;
  this.glassShell=mk(glassIdx,M.glass,'Glazing');mk(panelIdx,shellMat,'Protective panels');mk(accentIdx,M.accent,'Engine bay panels');
  // heavy hoop ribs and longerons (the concept's cage)
  for(const [z,s] of sections.slice(2,-2)){if(z>-4.3&&z<-3.2)continue;const ring=[];for(let j=0;j<=64;j++){const a=j/64*Math.PI*2;ring.push([RX*s*1.01*Math.cos(a),Y+RY*s*1.01*Math.sin(a),z]);}this.tube(ring,.04,M.frame,cab,true,64);}
  for(const a of [Math.PI*.5,Math.PI*.22,Math.PI*.78,-Math.PI*.12,Math.PI*1.12]){const line=sections.slice(1,-1).map(([z,s])=>[RX*s*1.015*Math.cos(a),Y+RY*s*1.015*Math.sin(a),z]);this.tube(line,.032,M.frame,cab,false,48);}
  // carriage hangers: trolleys riding the two overhead slide rails, a crossbeam, and a saddle clamped over each main hoop
  for(const z of [-3,0,3]){
   for(const x of [-.72,.72]){this.box([.36,.3,.8],[x,5.95,z],M.frame,cab);for(const dz of [-.26,.26])this.mesh(new T.CylinderGeometry(.09,.09,.42,12),M.dark,[x,5.95,z+dz],cab,[0,0,Math.PI/2]);
    this.rod([x,5.82,z],[x*1.25,Y+RY*.93,z],.07,M.paint,cab,8);}
   this.box([1.9,.16,.22],[0,5.78,z],M.paint,cab);
   const arc=[];for(let k=0;k<=16;k++){const a=.42+k/16*(Math.PI-.84);arc.push([RX*1.045*Math.cos(a),Y+RY*1.045*Math.sin(a),z]);}this.tube(arc,.075,M.paint,cab,false,32);
   for(const x of [-1,1])this.mesh(new T.CylinderGeometry(.1,.1,.24,10),M.frame,[x*RX*1.045*Math.cos(.42),Y+RY*1.045*Math.sin(.42),z],cab,[Math.PI/2,0,0]);}
  // floor with glass panels down the centre (the downward view)
  const fy=2.75;this.box([2.1,.06,8],[-0,fy-.05,-.6],M.grate,cab).visible=false;
  for(const s of [-1,1])this.box([.78,.08,8.2],[s*.72,fy,-.6],M.grate,cab);
  this.box([.62,.03,8.2],[0,fy+.02,-.6],M.floorGlass,cab);for(let z=-4.6;z<=3.4;z+=.8)this.box([.64,.05,.05],[0,fy+.03,z],M.frame,cab);
  this.rod([-.32,fy+.05,-4.7],[-.32,fy+.05,3.5],.025,M.frame,cab,6);this.rod([.32,fy+.05,-4.7],[.32,fy+.05,3.5],.025,M.frame,cab,6);
  // seats: two columns, four rows
  this.seats=[];const rows=[-3.6,-1.85,-.1,1.65];
  for(const z of rows)for(const x of [-.62,.62]){const g=new T.Group();g.position.set(x,fy+.05,z);cab.add(g);
   this.box([.6,.14,.58],[0,.42,0],M.seat,g);const back=this.box([.62,.8,.14],[0,.88,.3],M.seat,g);back.rotation.x=-.14;this.box([.34,.26,.12],[0,1.38,.36],M.seat,g);
   for(const s of [-1,1]){this.box([.08,.16,.46],[s*.3,.62,-.02],M.seat,g);this.rod([s*.22,.36,-.2],[s*.22,0,-.26],.022,M.frame,g,6);this.rod([s*.22,.36,.22],[s*.22,0,.26],.022,M.frame,g,6);}
   // four-point harness
   this.rod([-.12,1.2,.22],[.08,.5,-.2],.018,M.accent,g,4);this.rod([.12,1.2,.22],[-.08,.5,-.2],.018,M.accent,g,4);
   this.seats.push(g);}
  // console, screens, joysticks
  const con=this.box([.62,.1,.26],[-.62,fy+.62,-4.5],M.dark,cab);con.rotation.x=.55;this.rod([-.62,fy+.05,-4.4],[-.62,fy+.56,-4.46],.04,M.frame,cab,6);
  for(let i=0;i<2;i++){const s=this.box([.2,.12,.02],[-.74+i*.24,fy+.68,-4.6],M.screen,cab);s.rotation.x=.55;}
  for(const x of [-.62,.62]){this.rod([x+.28,fy+.62,-3.9],[x+.26,fy+.98,-3.94],.025,M.dark,cab,6);this.mesh(new T.SphereGeometry(.05,10,8),M.dark,[x+.26,fy+1.0,-3.94],cab);}
  // ---- interior fit-out
  {const I=new T.Group();I.name='Interior';cab.add(I);
   // dash across the nose: angled panel, screen cluster, switch banks, driver yoke and pedals
   // low binnacles either side of the floor glass so the view down past the nose stays clear
   for(const x of [-.72,.72]){const d=this.box([.62,.22,.08],[x,fy+.5,-4.4],M.dark,I);d.rotation.x=-.9;
    for(let k=0;k<2;k++){const sc=this.box([.22,.13,.02],[x-.13+k*.26,fy+.53,-4.37],M.screen,I);sc.rotation.x=-.9;}
    for(let k=0;k<5;k++){const b=this.box([.04,.025,.04],[x-.2+k*.1,fy+.4,-4.3],k%2?M.chrome:M.screen,I);b.rotation.x=-.9;}
    this.box([.62,.05,.26],[x,fy+.36,-4.28],M.frame,I);}
   this.rod([-.62,fy+.38,-4.2],[-.62,fy+.62,-4.02],.03,M.frame,I,8);this.mesh(new T.TorusGeometry(.14,.022,8,24,Math.PI*1.3),M.dark,[-.62,fy+.66,-4.0],I,[.7,0,Math.PI*1.35]);// yoke
   for(const x of [-.78,-.62,-.46])this.box([.08,.03,.16],[x,fy+.12,-4.2],M.chrome,I,[-.5,0,0]);// pedals
   // overhead: grab rails with hanging straps, console with switches, lamp strips
   for(const x of [-.95,.95]){this.rod([x,Y+1.18,-4.2],[x,Y+1.18,3.6],.022,M.chrome,I,6);for(let z=-3.6;z<3.6;z+=.9)this.box([.04,.22,.03],[x,Y+1.06,z],M.webbing,I);
    this.box([.05,.03,7.2],[x*.55,Y+1.5,-.3],M.lamp,I);}
   this.box([.5,.06,2.2],[0,Y+1.52,-3.3],M.dark,I);for(let k=0;k<10;k++)this.box([.04,.03,.04],[-.18+(k%5)*.09,Y+1.48,-3.9+Math.floor(k/5)*.25],M.screen,I);
   // cable conduits along the upper hull
   for(const x of [-1.22,1.22])this.rod([x,Y+.85,-4.3],[x,Y+.85,3.8],.03,M.hose,I,6);
   // side equipment: extinguishers, first aid, radio rack, stowage nets, helmet hooks
   for(const [x,z] of [[-1.25,-2.7],[1.25,2.9]]){this.mesh(new T.CylinderGeometry(.08,.08,.5,12),M.redPaint,[x,Y-.2,z],I);this.mesh(new T.CylinderGeometry(.03,.03,.08,8),M.dark,[x,Y+.09,z],I);this.box([.06,.05,.2],[x,Y-.35,z],M.frame,I);}
   this.box([.1,.3,.42],[1.3,Y+.25,-2.7],M.lamp.clone(),I).material.color.set(0xf2f2ee);this.box([.11,.08,.08],[1.3,Y+.25,-2.7],M.redPaint,I);
   const rack=new T.Group();rack.position.set(-1.1,Y-.1,3.25);I.add(rack);this.box([.3,1.1,.6],[0,0,0],M.frame,rack);for(let k=0;k<4;k++){this.box([.02,.18,.5],[.16,-.4+k*.26,0],M.dark,rack);this.box([.02,.05,.12],[.17,-.4+k*.26,-.15],M.screen,rack);}
   for(const x of [-1.28,1.28])for(let z=-1.6;z<2.4;z+=1.75){for(let k=0;k<4;k++)this.rod([x,Y-.45+k*.2,z],[x,Y-.45+k*.2,z+1.1],.008,M.webbing,I,4);for(let k=0;k<5;k++)this.rod([x,Y-.45,z+k*.27],[x,Y+.15,z+k*.27],.008,M.webbing,I,4);}
   for(let z=-3.2;z<2;z+=1.75)for(const x of [-1.2,1.2]){this.rod([x,Y+.55,z],[x*.93,Y+.6,z],.015,M.chrome,I,4);}
   // rear bulkhead to the engine bay with a hatch door
   this.box([2.6,2.4,.06],[0,Y+.05,3.9],M.frame,I);this.box([.8,1.5,.04],[0,Y-.2,3.86],M.accent,I);this.rod([.3,Y-.2,3.82],[.3,Y+.1,3.82],.02,M.chrome,I,6);
   for(let k=0;k<3;k++)this.box([.8,.02,.05],[0,Y-.8+k*.6,3.84],M.dark,I);
   // tread plate on the walkways, riveted
   for(const sx of [-1,1])for(let z=-4.4;z<3.5;z+=.4)this.box([.7,.012,.03],[sx*.72,fy+.045,z],M.chrome,I);
  }
  // upper nose shield support and the front hoop
  
  // V8 behind the passengers (visible through the rear glass band): block, heads, intake, headers
  const eng=new T.Group();eng.position.set(0,3.55,4.45);cab.add(eng);
  this.box([.7,.55,1.0],[0,0,0],M.engine,eng);for(const s of [-1,1]){const head=this.box([.34,.24,1.02],[s*.36,.36,0],M.engine,eng);head.rotation.z=s*.52;for(let k=0;k<4;k++){this.rod([s*.5,.3,-.36+k*.24],[s*.78,-.05,-.36+k*.24],.045,M.chrome,eng,6);}this.rod([s*.78,-.05,-.4],[s*.8,-.12,.7],.07,M.dark,eng,8);}
  this.box([.34,.2,.8],[0,.52,0],M.brass,eng);this.mesh(new T.CylinderGeometry(.18,.18,.12,14),M.dark,[0,.7,0],eng);
  for(let k=0;k<4;k++)for(const s of [-1,1])this.rod([s*.08,.6,-.3+k*.2],[s*.22,.46,-.3+k*.2],.035,M.brass,eng,6);// intake runners
  // front accessory drive: crank, water pump, alternator and hydraulic pump pulleys with a serpentine belt
  const pul=[[0,-.1,.11],[0,.22,.09],[.3,.28,.08],[-.3,.3,.1]];for(const [x,y,r] of pul)this.mesh(new T.CylinderGeometry(r,r,.05,16),M.chrome,[x,y,-.56],eng,[Math.PI/2,0,0]);
  this.tube([[0,-.21,-.6],[.38,.28,-.6],[0,.31,-.6],[-.4,.3,-.6],[0,-.21,-.6]],.012,M.hose,eng,true,40);
  this.mesh(new T.CylinderGeometry(.13,.13,.26,14),M.frame,[.3,.28,-.42],eng,[Math.PI/2,0,0]);// alternator
  const hp=this.mesh(new T.CylinderGeometry(.16,.16,.44,16),M.accent,[-.3,.3,-.36],eng,[Math.PI/2,0,0]);// main hydraulic pump
  this.tube([[-.3,.46,-.3],[-.2,.8,-.1],[.1,.9,.3],[.4,.7,.6]],.035,M.hose,eng,false,20);this.tube([[-.42,.3,-.2],[-.6,.5,.2],[-.6,.8,.6]],.035,M.hose,eng,false,20);
  // radiator and fan shroud behind, oil filter, dipstick
  this.box([.72,.56,.08],[0,.12,.56],M.dark,eng);for(let k=0;k<9;k++)this.box([.68,.015,.03],[0,-.12+k*.06,.6],M.frame,eng);
  this.mesh(new T.CylinderGeometry(.24,.24,.1,24,1,true),M.frame,[0,.12,.48],eng,[Math.PI/2,0,0]).material=M.frame;
  this.mesh(new T.CylinderGeometry(.07,.07,.16,10),M.redPaint,[.4,-.2,.1],eng);this.rod([-.2,.1,-.4],[-.28,.55,-.45],.01,M.brass,eng,4);
  // underside hatch and the ladder
  this.hatch=this.mesh(new T.CylinderGeometry(.48,.48,.07,28),M.accent,[0,2.62,.8],cab);this.hatch.name='Underside hatch';
  this.ladder=new T.Group();this.ladder.position.set(0,2.6,.8);cab.add(this.ladder);
  // telescoping ladder: rails stretch to the ground, rungs every 0.3 m
  this.ladRails=[-.3,.3].map(x=>{const r=this.mesh(new T.CylinderGeometry(.032,.032,1,8),M.chrome,[x,-.5,.06],this.ladder);return r;});
  this.ladRungs=[];for(let k=0;k<22;k++){const r=this.mesh(new T.CylinderGeometry(.024,.024,.6,6),M.chrome,[0,0,0],this.ladder,[0,0,Math.PI/2]);this.ladRungs.push(r);}
  this.ladder.visible=false;
  // headlights in the nose
  this.lights.head=this.lights.head||[];this.lights.nose=[];const noseM=M.headlamp.clone();for(const s of [-1,1]){const h=this.mesh(new T.CylinderGeometry(.14,.14,.1,16),noseM,[s*.72,3.1,-5.12],cab,[Math.PI/2+.25,0,0]);this.lights.nose.push(h);}
  this.lights.tail=[];for(const s of [-1,1]){const h=this.box([.18,.1,.05],[s*.9,3.6,5.2],M.red,cab);this.lights.tail.push(h);}
  // crew
  this.crew=[];
 }
 setCrew(n,variant=this.variant){
  for(const c of this.crew)this.cabin.remove(c);this.crew=[];
  const [u1,u2]=UNIFORM[variant];
  for(let k=0;k<Math.min(n,this.seats.length);k++){const s=this.seats[k];const p=person(u1,u2,k,variant);p.position.copy(s.position);this.cabin.add(p);this.crew.push(p);}
 }
 // ------------------------------------------------------------ wheel pairs, legs, wheels
 buildPairs(){
  const M=this.mats;
  for(let i=0;i<3;i++){
   const z=GEOM.stations[i],g=new T.Group();g.position.set(0,PLATE,z);this.root.add(g);g.name=['Front slide plate pair','Middle slide plate pair','Rear fixed pair'][i];
   // crossbar housing the two telescoping arm beams (side by side, so both can run in past the centre)
   this.box([2.5,.5,.9],[0,.08,0],M.frame,g);for(const e of [-1,1])this.box([.12,.56,.96],[e*1.25,.08,0],M.dark,g);
   for(const s of [-1,1]){
    // fixed outer sleeve of the arm, then the sliding beam that carries the leg
    this.box([.95,.42,.4],[s*1.65,.1,s*.21],M.paint,g);this.box([.08,.48,.46],[s*2.1,.1,s*.21],M.frame,g);
    // leg: knee knuckle, barrel with accumulator, chrome rod, hub motor, axle, wheel
    const leg=new T.Group();leg.position.set(s*LEG_X,0,0);g.add(leg);
    this.box([2.5,.32,.3],[s*-1.25,.1,s*.21],M.chrome,leg);// sliding arm beam (runs into the sleeve)
    this.box([.5,.36,.34],[s*-.2,.1,s*.21],M.paint,leg);// arm head
    for(let k=0;k<5;k++)this.mesh(new T.CylinderGeometry(.03,.03,.34,6),M.dark,[s*(-.5-k*.45),.27,s*.21],leg);// rack teeth for the slide motor
    this.mesh(new T.SphereGeometry(.32,18,14),M.frame,[0,-.18,0],leg);
    this.mesh(new T.CylinderGeometry(.22,.22,.78,16),M.frame,[0,-.18,0],leg,[Math.PI/2,0,0]);// knee pin boss
    for(const zz of [-1,1])this.mesh(new T.CylinderGeometry(.1,.1,.06,12),M.chrome,[0,-.18,zz*.42],leg,[Math.PI/2,0,0]);
    const barrelTop=-.42,barrelBot=GEOM.hubTop+.78-PLATE;// clears the fork crown at full retraction
    this.rod([0,barrelTop,0],[0,barrelBot,0],.26,M.paint,leg,18);
    this.mesh(new T.CylinderGeometry(.31,.31,.2,18),M.frame,[0,barrelBot+.06,0],leg);// gland
    this.mesh(new T.CylinderGeometry(.3,.3,.14,18),M.frame,[0,barrelTop-.05,0],leg);
    for(let y=barrelTop-.7;y>barrelBot+.4;y-=.9)this.mesh(new T.CylinderGeometry(.285,.285,.06,18),M.frame,[0,y,0],leg);// barrel hoops
    // knee braces: twin tubes from the arm down to a collar on the barrel, with a gusset plate between
    const kx=-.85,ky=-.02,by_=-1.1;// short enough to clear the cabin at road track
    for(const zz of [-1,1]){this.rod([s*kx,ky,zz*.17],[s*-.3,by_,zz*.17],.1,M.paint,leg,10);
     this.mesh(new T.CylinderGeometry(.13,.13,.1,12),M.frame,[s*kx,ky,zz*.17],leg,[Math.PI/2,0,0]);}
    this.mesh(new T.CylinderGeometry(.3,.3,.34,18),M.frame,[0,by_,0],leg);// brace collar
    this.mesh(new T.CylinderGeometry(.08,.08,.5,10),M.chrome,[s*-.3,by_,0],leg,[Math.PI/2,0,0]);// collar pin
    // a strut web between the twin braces, tying them into one knee truss
    for(const t of [.35,.7])this.rod([s*mixN(kx,-.3,t),mixN(ky,by_,t),-.17],[s*mixN(kx,-.3,t),mixN(ky,by_,t),.17],.05,M.frame,leg,6);
    this.rod([s*mixN(kx,-.3,.35),mixN(ky,by_,.35),0],[s*-.05,mixN(ky,by_,.35),0],.06,M.frame,leg,8);
    // accumulator (the pneumatic spring) and its hoses, forward of the braces
    const acc=this.mesh(new T.SphereGeometry(.28,18,14),M.accent,[s*-.42,barrelTop-.7,.58],leg);
    this.rod([s*-.25,barrelTop-.62,.4],[0,barrelTop-.5,.2],.055,M.frame,leg,6);
    this.tube([[0,barrelBot+.35,.26],[s*-.12,barrelTop-1.6,.4],[s*-.3,barrelTop-.4,.5],[s*-.65,.12,.2]],.038,M.hose,leg,false,24);
    this.tube([[0,barrelBot+.6,-.26],[s*-.14,barrelTop-1.3,-.38],[s*-.34,barrelTop-.3,-.34],[s*-.6,.1,-.16]],.034,M.hose,leg,false,24);
    // three-stage telescopic leg: two sleeves run out of the barrel, the chrome rod out of the inner sleeve
    const stage=this.mesh(new T.CylinderGeometry(.215,.215,1,16),M.chrome,[0,0,0],leg);stage.name='Leg sleeve';
    const stage2=this.mesh(new T.CylinderGeometry(.19,.19,1,16),M.chrome,[0,0,0],leg);stage2.name='Leg sleeve 2';
    const rod=this.mesh(new T.CylinderGeometry(.16,.16,1,16),M.chrome,[0,0,0],leg);rod.name='Chrome rod';
    const hub=new T.Group();leg.add(hub);
    this.mesh(new T.CylinderGeometry(.44,.44,.5,20),M.engine,[s*.14,0,0],hub,[0,0,Math.PI/2]);// hub motor
    for(let k=0;k<10;k++){const a=k/10*Math.PI*2;this.box([.46,.05,.05],[s*.14,Math.cos(a)*.44,Math.sin(a)*.44],M.frame,hub,[a,0,0]);}// cooling fins
    this.mesh(new T.CylinderGeometry(.13,.13,AXLE,12),M.chrome,[s*AXLE*.5,0,0],hub,[0,0,Math.PI/2]);
    this.box([.34,.62,.46],[0,.42,0],M.frame,hub);// fork crown
    this.box([.2,.2,.9],[0,.18,0],M.frame,hub);// torque arm
    const wheel=new T.Group();wheel.position.set(s*AXLE,0,0);hub.add(wheel);
    const spin=new T.Group();wheel.add(spin);
    const tireMat=M.rubber.clone();tireMat.onBeforeCompile=tireShader(M.rubber.onBeforeCompile);tireMat.customProgramCacheKey=()=>'tire';tireMat.userData.flat={value:0};tireMat.userData.down={value:new T.Vector3(0,-1,0)};
    const tire=this.mesh(tireGeometry(),tireMat,[0,0,0],spin);tire.name='Tyre';
    this.buildRim(spin,s);
    // Kevlar-belted tyre: a woven aramid band on both sidewalls
    for(const e of [-1,1]){const bandR=(RIM_R+GEOM.R)/2+.05;this.mesh(new T.TorusGeometry(bandR,.035,6,72),M.aramid,[e*GEOM.tireWidth*.53,0,0],spin,[0,Math.PI/2,0]);}
    // front pair: a driving-lamp pod on each knee that turns with the steering
    if(i===0){const pod=new T.Group();pod.position.set(0,-.05,-.52);leg.add(pod);this.box([.12,.12,.3],[0,0,.18],M.frame,pod);
     this.mesh(new T.CylinderGeometry(.19,.16,.26,18),M.dark,[0,0,-.02],pod,[Math.PI/2,0,0]);const f=this.mesh(new T.CylinderGeometry(.16,.16,.02,18),M.headlamp,[0,0,-.16],pod,[Math.PI/2,0,0]);this.lights.head.push(f);
     this.lampMounts.push({parent:leg,pos:[0,-.05,-.7],aim:[s*1.5,-8,-30],angle:.42,power:1,steer:true});}
    this.legs.push({pair:i,side:s,leg,rod,stage,stage2,hub,barrelBot,acc});this.wheels.push({spin,tire,tireMat,side:s,wheel});
   }
   this.pairs.push(g);
  }
 }
 buildRim(parent,s){
  const M=this.mats,Rb=RIM_R,W=GEOM.tireWidth*.94;
  const shell=this.mesh(new T.CylinderGeometry(Rb,Rb,W,40,1,true),M.rim,[0,0,0],parent,[0,0,Math.PI/2]);shell.material.side=T.DoubleSide;
  for(const e of [-1,1])this.mesh(new T.TorusGeometry(Rb+.03,.04,8,48),M.rim,[e*W*.5,0,0],parent,[0,Math.PI/2,0]);// bead flanges
  // centre disc set outboard with a drop centre, and pressed spokes back to the rim well
  {const pr=[[0,.2],[.34,.2],[.4,.16],[.56,.13],[Rb*.8,.06],[Rb*.97,-.04],[Rb*.99,-.1]].map(([r,x])=>new T.Vector2(r,x*s));
   const lg=new T.LatheGeometry(s>0?pr:pr.slice().reverse(),48);lg.rotateZ(-Math.PI/2);const d=this.mesh(lg,M.rim,[0,0,0],parent);d.material=M.rim;
   // stiffening ribs and vent slots pressed into the dish
   for(let k=0;k<10;k++){const a=(k+.5)/10*Math.PI*2,r=(.56+Rb*.8)/2;this.box([.05,.09,Rb*.8-.56],[s*.12,Math.cos(a)*r,Math.sin(a)*r],M.frame,parent,[a,0,0]);
    const a2=k/10*Math.PI*2;this.mesh(new T.CylinderGeometry(.07,.07,.02,10),M.dark,[s*.105,Math.cos(a2)*r,Math.sin(a2)*r],parent,[0,0,Math.PI/2]);}}
  // outer beadlock ring and its bolts
  this.mesh(new T.TorusGeometry(Rb+.02,.05,8,48),M.frame,[s*W*.52,0,0],parent,[0,Math.PI/2,0]);
  for(let k=0;k<20;k++){const a=k/20*Math.PI*2;this.mesh(new T.CylinderGeometry(.022,.022,.06,6),M.chrome,[s*(W*.52+.03),Math.cos(a)*(Rb+.02),Math.sin(a)*(Rb+.02)],parent,[0,0,Math.PI/2]);}
  // hub cap, wheel studs, valve stem
  this.mesh(new T.CylinderGeometry(.3,.36,.24,18),M.engine,[s*.2,0,0],parent,[0,0,Math.PI/2]);
  for(let k=0;k<10;k++){const a=k/10*Math.PI*2;this.mesh(new T.CylinderGeometry(.03,.03,.1,6),M.chrome,[s*.2,Math.cos(a)*.44,Math.sin(a)*.44],parent,[0,0,Math.PI/2]);}
  this.mesh(new T.CylinderGeometry(.018,.018,.14,6),M.chrome,[s*.14,Rb*.9,0],parent,[0,0,Math.PI/2]);
 }
 // ------------------------------------------------------------ variant equipment
 buildVariant(){
  const M=this.mats,v=this.variant,top=this.top,Y=GEOM.topPlate;
  this.tankGroup=null;this.monitor=null;
  if(v==='fire'){
   const tk=this.tankGroup=new T.Group();tk.position.set(0,Y+.1,.2);top.add(tk);
   const shape=new T.Shape();const w=1.1,h=.45,r=.3;shape.moveTo(-w+r,-h);shape.lineTo(w-r,-h);shape.quadraticCurveTo(w,-h,w,-h+r);shape.lineTo(w,h-r);shape.quadraticCurveTo(w,h,w-r,h);shape.lineTo(-w+r,h);shape.quadraticCurveTo(-w,h,-w,h-r);shape.lineTo(-w,-h+r);shape.quadraticCurveTo(-w,-h,-w+r,-h);
   const g=new T.ExtrudeGeometry(shape,{depth:7.6,bevelEnabled:true,bevelSize:.12,bevelThickness:.12,bevelSegments:3,curveSegments:8});g.translate(0,.5,-3.8);this.mesh(g,M.tank,[0,0,0],tk).name='Removable water reservoir';
   for(const z of [-3,-1,1,3])this.box([2.5,.08,.1],[0,1.02,z],M.frame,tk);for(const z of [-3.4,3.4])for(const s of [-1,1])this.box([.12,.5,.12],[s*1.1,.2,z],M.frame,tk);
   // water level gauge strip
   this.gauge=this.box([.06,.7,.04],[1.24,.5,3.9],M.screen,tk);
   // monitor (water cannon) at the front of the tank
   const mon=this.monitor=new T.Group();mon.position.set(0,Y+.35,-4.6);top.add(mon);
   this.mesh(new T.CylinderGeometry(.22,.26,.3,16),M.brass,[0,0,0],mon);const barrel=new T.Group();barrel.position.y=.2;mon.add(barrel);this.monitorBarrel=barrel;
   this.rod([0,0,0],[0,.35,-1.2],.08,M.brass,barrel,10);this.mesh(new T.CylinderGeometry(.11,.07,.25,12),M.chrome,[0,.42,-1.35],barrel,[Math.PI/2-.28,0,0]);
   // hose reel
   this.mesh(new T.CylinderGeometry(.45,.45,.5,20),M.accent,[0,Y+.55,4.3],top,[0,0,Math.PI/2]);
   // draft intake hose coiled at the side
   this.intake=this.tube([[1.3,Y-.1,4],[1.6,Y-1.5,4.3],[1.55,3.2,4.1],[1.5,2.6,3.8]],.07,M.hose,top,false,20);
  }
  if(v==='rescue'){
   const bar=new T.Group();bar.position.set(0,Y+.28,-4.2);top.add(bar);this.box([2.0,.14,.3],[0,0,0],M.dark,bar);
   this.lights.bar=[];for(let k=0;k<6;k++){const l=this.box([.28,.12,.28],[-.8+k*.32,.1,0],k%2?M.red:M.headlamp,bar);this.lights.bar.push(l);}
   this.searchlight=this.mesh(new T.CylinderGeometry(.18,.24,.3,16),M.headlamp,[.9,Y+.5,-5],top,[Math.PI/2,0,0]);
   // litter inside the cabin on the right rear
   const lit=this.box([.62,.12,2.1],[.62,3.2,2.5],M.accent,this.cabin);this.box([.5,.18,.35],[.62,3.36,1.6],M.seat,this.cabin);
   for(const s of [-1,1])this.box([1.8,.02,.05],[s*.0,GEOM.topPlate+.06,-2.6+s*.1],M.accent,top);
  }
  if(v==='troop'){
   // armour panels bolted over the lower glazing and a remote weapon station (not modelled as usable)
   for(const s of [-1,1]){for(let k=0;k<5;k++){const p=this.box([.08,.62,1.3],[s*1.47,3.55,-3.4+k*1.65],M.paint,this.cabin);p.rotation.z=s*.18;}}
   const rws=new T.Group();rws.position.set(0,Y+.25,-3.2);top.add(rws);this.box([.9,.45,.9],[0,.1,0],M.accent,rws);this.rod([.1,.3,0],[.1,.38,-1.3],.05,M.dark,rws,8);this.box([.3,.3,.4],[-.35,.35,-.2],M.dark,rws);this.turret=rws;
  }
  if(v==='scout'||v==='troop'){
   // sensor mast with an electro-optical ball
   // compact electro-optical turret on the front crossmember, between the lamp banks
   const mast=new T.Group();mast.position.set(0,Y+.02,-5.3);top.add(mast);this.mesh(new T.CylinderGeometry(.16,.2,.16,14),M.frame,[0,.08,0],mast);
   const ball=this.mesh(new T.SphereGeometry(.22,20,14),M.dark,[0,.34,0],mast);this.mesh(new T.CylinderGeometry(.08,.08,.05,14),M.screen,[0,.34,-.21],mast,[Math.PI/2,0,0]);this.sensor=ball;this.sensorMast=mast;
  }
 }
 // ------------------------------------------------------------ per-frame update from physics
 update(sp,dt,opts={}){
  const R=sp.R,o=sp.origin(R);
  this.root.position.set(o[0],o[1],o[2]);this.root.quaternion.set(sp.q[0],sp.q[1],sp.q[2],sp.q[3]);
  this.cabin.position.z=sp.carriage;
  this.pairs[0].rotation.y=sp.steer[0];this.pairs[1].rotation.y=sp.steer[1];this.pairs[2].rotation.y=0;
  const tmpDown=new T.Vector3();
  this.root.updateMatrixWorld();
  for(let i=0;i<6;i++){
   const w=sp.wheels[i],L=this.legs[i],W=this.wheels[i];
   L.leg.position.x=L.side*(sp.ht(i)-AXLE);// telescoping arms: road track to full width
   const hubY=GEOM.hubTop-w.e-PLATE;// relative to the plate group
   L.hub.position.y=hubY;
   const rodTop=L.barrelBot+.1,len=Math.max(.05,rodTop-hubY-.2);L.rod.scale.y=len;L.rod.position.y=hubY+.2+len/2;const sl=Math.max(.05,len*.36),sl2=Math.max(.05,len*.68);L.stage.scale.y=sl;L.stage.position.y=rodTop-sl/2;L.stage2.scale.y=sl2;L.stage2.position.y=rodTop-sl2/2;
   W.spin.rotation.x=-w.spin;
   // tyre flat spot: deflection toward the contact normal (in the spinning tyre's local frame)
   W.tireMat.userData.flat.value=w.contact?Math.min(.3,w.deflection||0):0;
   tmpDown.set(-w.cn[0],-w.cn[1],-w.cn[2]);const inv=new T.Matrix4().copy(W.spin.matrixWorld).invert();tmpDown.transformDirection(inv);W.tireMat.userData.down.value.copy(tmpDown);
  }
  // hatch and ladder
  const want=opts.ladder?1:0;this._lad=(this._lad??0)+(want-(this._lad??0))*Math.min(1,dt*1.2);
  this.ladder.visible=this._lad>.02;this.hatch.position.x=this._lad*.9;
  if(this.ladder.visible){let e=0;for(const w of sp.wheels)e+=w.e;const L=(2.6-(GEOM.hubTop-e/6-GEOM.R)+.1)*this._lad,tilt=.12;
   for(const r of this.ladRails){r.scale.y=L;r.position.y=-L/2;r.position.z=L/2*tilt;r.rotation.x=-tilt;}
   this.ladRungs.forEach((r,k)=>{const y=.3+k*.3;r.visible=y<L-.3;r.position.set(0,-y,y*tilt);});}
  // lights
  const t=performance.now()/1000;
  const night=opts.night||0;for(const h of this.lights.head)h.material.emissiveIntensity=opts.headlights?4:0;for(const h of this.lights.nose)h.material.emissiveIntensity=opts.headlights?.8:0;for(const h of this.lights.tail)h.material.emissiveIntensity=opts.headlights?2.5:(opts.braking?3:.2);
  for(const w of this.lights.work)w.material.emissiveIntensity=opts.worklights?3:0;
  this.lights.beacons.forEach((b,k)=>{b.material.emissiveIntensity=opts.beacons?(Math.sin(t*7+k*Math.PI)>.3?5:.2):0;});
  if(this.lights.bar)this.lights.bar.forEach((b,k)=>{b.material.emissiveIntensity=opts.beacons?((Math.floor(t*6)+k)%3===0?6:.3):0;});
  if(this.gauge&&sp.water!==undefined){this.gauge.scale.y=Math.max(.02,sp.water/3500);this.gauge.position.y=.15+.35*this.gauge.scale.y;}
  if(this.sensor)this.sensorMast.rotation.y=Math.sin(t*.3)*.6+(opts.sensorYaw||0);
  if(this.monitorBarrel&&opts.monitorAim){this.monitor.rotation.y=opts.monitorAim[0];this.monitorBarrel.rotation.x=opts.monitorAim[1];}
  this.groundY.value=opts.groundY??o[1];
  this.dirt.value=opts.dirt??this.dirt.value;this.wet.value=opts.wet??0;
 }
 worldPoint(local,parent=this.root){return parent.localToWorld(new T.Vector3(...local));}
}
// tyre: agricultural chevron tread on a rounded carcass; the flat spot is applied in the vertex shader
function tireGeometry(){
 const R=GEOM.R,W=GEOM.tireWidth,seg=200,prof=[],Rb=RIM_R+.02,rs=.2,hw=W*.5;
 // cross-section from the inner bead, up the sidewall, over a rounded shoulder, across the tread, and back down
 const side=(sgn,up)=>{const n=7;for(let k=0;k<=n;k++){const t=up?k/n:1-k/n;const r=Rb+(R-rs-Rb)*t;prof.push([sgn*(hw*(1+.07*Math.sin(Math.PI*t))),r,0]);}};
 const shoulder=(sgn,out)=>{const n=5;for(let k=1;k<n;k++){const a=(out?k/n:1-k/n)*Math.PI/2;prof.push([sgn*(hw-rs+Math.cos(a)*rs),R-rs+Math.sin(a)*rs,1]);}};
 side(-1,true);shoulder(-1,true);for(let k=0;k<=8;k++){const x=-(hw-rs)+k/8*2*(hw-rs);prof.push([x,R,1]);}shoulder(1,false);side(1,false);
 const pos=[],idx=[],nLug=24;
 for(let i=0;i<=seg;i++){const th=i/seg*Math.PI*2;for(const [x,r,tr] of prof){
  // chevron lugs slanted from the centre line toward each shoulder
  const ph=(th*nLug/(Math.PI*2)+Math.abs(x)*3.4);const lug=((ph%1)+1)%1<.34&&Math.abs(x)>.03?1:0;
  const rr=r-tr*.08+tr*lug*.1;
  pos.push(x,Math.cos(th)*rr,Math.sin(th)*rr);}}
 const C=prof.length;for(let i=0;i<seg;i++)for(let k=0;k<C-1;k++){const a=i*C+k,b=a+C;idx.push(a,b,a+1,b,b+1,a+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function tireShader(prev){return function(sh){prev&&prev.call(this,sh);sh.uniforms.uFlat=this.userData.flat;sh.uniforms.uDown=this.userData.down;
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uFlat;uniform vec3 uDown;').replace('#include <begin_vertex>',`#include <begin_vertex>
{float lim=${(GEOM.R+.02).toFixed(3)}-uFlat;float d=dot(transformed,uDown);if(d>lim){transformed-=uDown*(d-lim);transformed.x*=1.0+(d-lim)*.6;}}`);};}
// a seated crew member, merged into one mesh with vertex colours
function person(u1,u2,k,variant){
 const parts=[];const col=(c)=>new T.Color(c);const skin=[0xc89f7e,0x8d5f42,0xe0b894,0x6b4430,0xb88763][k%5];
 const add=(g,p,c,r)=>{if(r)g.rotateX(r[0]).rotateY(r[1]).rotateZ(r[2]);g.translate(...p);const n=g.index?g.toNonIndexed():g;const cc=col(c),a=new Float32Array(n.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=cc.r;a[i+1]=cc.g;a[i+2]=cc.b;}n.setAttribute('color',new T.BufferAttribute(a,3));parts.push(n);};
 add(new T.CylinderGeometry(.19,.16,.62,10),[0,.88,.1],u1,[-.12,0,0]);// torso
 add(new T.BoxGeometry(.4,.22,.3),[0,1.12,.06],u2);// vest / shoulders
 add(new T.SphereGeometry(.12,12,10),[0,1.34,.02],skin);// head
 add(new T.SphereGeometry(.14,12,8,0,Math.PI*2,0,Math.PI*.55),[0,1.37,.03],variant==='rescue'?0xf2f2ee:variant==='fire'?0xd9b43a:0x4a543e);// helmet
 for(const s of [-1,1]){add(new T.CylinderGeometry(.075,.07,.44,8),[s*.1,.52,-.18],u1,[Math.PI/2,0,0]);add(new T.CylinderGeometry(.065,.055,.44,8),[s*.1,.28,-.42],u1);add(new T.BoxGeometry(.11,.08,.24),[s*.1,.06,-.48],0x1c1c1a);
  add(new T.CylinderGeometry(.055,.05,.34,8),[s*.23,.95,-.06],u1,[.5,0,s*.15]);add(new T.CylinderGeometry(.05,.045,.3,8),[s*.21,.8,-.28],u1,[1.3,0,0]);add(new T.SphereGeometry(.05,8,6),[s*.2,.78,-.44],skin);}
 const g=mergeNonIndexed(parts);const m=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:.8}));m.castShadow=true;return m;
}

function mergeByMaterial(parent,keep){
 const buckets=new Map();
 for(const c of [...parent.children]){if(!c.isMesh||keep.has(c)||c.children.length||c.name==='Glazing')continue;const k=c.material.uuid;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(c);}
 for(const [k,list] of buckets){if(list.length<2)continue;const geos=[];
  for(const c of list){c.updateMatrix();let g=c.geometry.index?c.geometry.toNonIndexed():c.geometry.clone();for(const a of Object.keys(g.attributes))if(!['position','normal','uv'].includes(a))g.deleteAttribute(a);if(!g.attributes.uv)g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));g.applyMatrix4(c.matrix);geos.push(g);parent.remove(c);}
  let n=0;for(const g of geos)n+=g.attributes.position.count;const P=new Float32Array(n*3),N=new Float32Array(n*3),U=new Float32Array(n*2);let o=0;
  for(const g of geos){P.set(g.attributes.position.array,o*3);N.set(g.attributes.normal.array,o*3);U.set(g.attributes.uv.array,o*2);o+=g.attributes.position.count;}
  const mg=new T.BufferGeometry();mg.setAttribute('position',new T.BufferAttribute(P,3));mg.setAttribute('normal',new T.BufferAttribute(N,3));mg.setAttribute('uv',new T.BufferAttribute(U,2));mg.computeBoundingSphere();
  const m=new T.Mesh(mg,list[0].material);m.name=list.map(c=>c.name).filter(Boolean)[0]||'';parent.add(m);}
}
