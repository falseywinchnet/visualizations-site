// The Spider: detailed three.js model driven by the physics state.
// Body frame matches physics.mjs: x right, y up, z back; origin at the ground reference.
import * as T from 'three';
import {GEOM} from './physics.mjs';
import {mergeNonIndexed} from './scenery.mjs';

const LEG_X=3.65,AXLE=GEOM.halfTrack-LEG_X,PLATE=GEOM.plateY;
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
   rubber:dirty(new T.MeshStandardMaterial({color:0x1b1c1c,roughness:.93,metalness:0})),
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
  const keep=new Set([this.hatch,this.gauge,this.searchlight,...this.legs.map(l=>l.rod),...this.wheels.map(w=>w.tire),...this.lights.head,...this.lights.tail,...this.lights.beacons,...(this.lights.bar||[])]);
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
  // upper nose shield support and the front hoop
  
  // V8 behind the passengers (visible through the rear glass band): block, heads, intake, headers
  const eng=new T.Group();eng.position.set(0,3.55,4.45);cab.add(eng);
  this.box([.7,.55,1.0],[0,0,0],M.engine,eng);for(const s of [-1,1]){const head=this.box([.34,.24,1.02],[s*.36,.36,0],M.engine,eng);head.rotation.z=s*.52;for(let k=0;k<4;k++){this.rod([s*.5,.3,-.36+k*.24],[s*.78,-.05,-.36+k*.24],.045,M.chrome,eng,6);}this.rod([s*.78,-.05,-.4],[s*.8,-.12,.7],.07,M.dark,eng,8);}
  this.box([.34,.2,.8],[0,.52,0],M.brass,eng);this.mesh(new T.CylinderGeometry(.18,.18,.12,14),M.dark,[0,.7,0],eng);
  // underside hatch and the ladder
  this.hatch=this.mesh(new T.CylinderGeometry(.48,.48,.07,28),M.accent,[0,2.62,.8],cab);this.hatch.name='Underside hatch';
  this.ladder=new T.Group();this.ladder.position.set(0,2.6,.8);cab.add(this.ladder);
  for(const x of [-.28,.28])this.rod([x,0,0],[x,-2.4,.3],.028,M.chrome,this.ladder,6);for(let y=-.25;y>-2.4;y-=.28)this.rod([-.28,y,-y*.125],[.28,y,-y*.125],.022,M.chrome,this.ladder,6);
  this.ladder.scale.y=.01;this.ladder.visible=false;
  // headlights in the nose
  this.lights.head=[];for(const s of [-1,1]){const h=this.mesh(new T.CylinderGeometry(.14,.14,.1,16),M.headlamp,[s*.72,3.1,-5.12],cab,[Math.PI/2+.25,0,0]);this.lights.head.push(h);}
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
   // short crossbar over the plate, arms out over the cabin, diagonal braces
   this.box([2.3,.26,.34],[0,.1,0],M.frame,g);
   for(const s of [-1,1]){
    const arm=this.rod([s*1.05,.12,0],[s*(LEG_X+.05),-.2,0],.14,M.paint,g,12);
    this.rod([s*1.05,-.12,.38],[s*(LEG_X-.1),-.25,.05],.06,M.frame,g,8);this.rod([s*1.05,-.12,-.38],[s*(LEG_X-.1),-.25,-.05],.06,M.frame,g,8);
    this.rod([s*.9,.3,0],[s*(LEG_X),.05,0],.05,M.frame,g,8);
    // leg: knee knuckle, barrel with accumulator, chrome rod, hub motor, axle, wheel
    const leg=new T.Group();leg.position.set(s*LEG_X,0,0);g.add(leg);
    this.mesh(new T.SphereGeometry(.24,16,12),M.frame,[0,-.22,0],leg);
    const barrelTop=-.35,barrelBot=3.62-PLATE;// body y 3.62
    this.rod([0,barrelTop,0],[0,barrelBot,0],.19,M.paint,leg,16);
    this.mesh(new T.CylinderGeometry(.23,.23,.16,16),M.frame,[0,barrelBot+.05,0],leg);
    this.mesh(new T.CylinderGeometry(.22,.22,.12,16),M.frame,[0,barrelTop-.05,0],leg);
    // accumulator (the pneumatic spring) and its hoses
    const acc=this.mesh(new T.SphereGeometry(.26,18,14),M.accent,[s*-.38,barrelTop-.55,.18],leg);
    this.rod([s*-.2,barrelTop-.5,.1],[0,barrelTop-.4,.05],.05,M.frame,leg,6);
    this.tube([[0,barrelBot+.3,-.2],[s*-.25,barrelTop-1.2,-.3],[s*-.4,barrelTop-.25,-.15],[s*-.6,.05,-.1]],.035,M.hose,leg,false,20);
    this.tube([[0,barrelBot+.5,.2],[s*-.18,barrelTop-1.0,.32],[s*-.3,barrelTop-.2,.2],[s*-.5,.05,.12]],.03,M.hose,leg,false,20);
    // emergency steps on the front-left leg
    if(i===0&&s<0)for(let k=0;k<6;k++){const y=barrelTop-.3-k*.36;this.box([.24,.04,.1],[(k%2?-.24:.24),y,0],M.chrome,leg);}
    const rod=this.mesh(new T.CylinderGeometry(.12,.12,1,14),M.chrome,[0,0,0],leg);rod.name='Chrome rod';
    const hub=new T.Group();leg.add(hub);
    this.mesh(new T.CylinderGeometry(.34,.34,.42,18),M.engine,[s*.08,0,0],hub,[0,0,Math.PI/2]);// hub motor
    this.mesh(new T.CylinderGeometry(.1,.1,AXLE,10),M.chrome,[s*AXLE*.5,0,0],hub,[0,0,Math.PI/2]);
    this.box([.2,.5,.32],[0,.35,0],M.frame,hub);// fork crown
    const wheel=new T.Group();wheel.position.set(s*AXLE,0,0);hub.add(wheel);
    const spin=new T.Group();wheel.add(spin);
    const tireMat=M.rubber.clone();tireMat.onBeforeCompile=tireShader(M.rubber.onBeforeCompile);tireMat.customProgramCacheKey=()=>'tire';tireMat.userData.flat={value:0};tireMat.userData.down={value:new T.Vector3(0,-1,0)};
    const tire=this.mesh(tireGeometry(),tireMat,[0,0,0],spin);tire.name='Tyre';
    this.buildRim(spin,s);
    this.legs.push({pair:i,side:s,leg,rod,hub,barrelBot,acc});this.wheels.push({spin,tire,tireMat,side:s,wheel});
   }
   this.pairs.push(g);
  }
 }
 buildRim(parent,s){
  const M=this.mats;
  this.mesh(new T.CylinderGeometry(.78,.78,.42,32,1,true),M.rim,[0,0,0],parent,[0,0,Math.PI/2]).material.side=T.DoubleSide;
  const disc=this.mesh(new T.CylinderGeometry(.76,.76,.05,32),M.rim,[s*.06,0,0],parent,[0,0,Math.PI/2]);
  this.mesh(new T.TorusGeometry(.8,.045,8,40),M.frame,[s*.2,0,0],parent,[0,Math.PI/2,0]);// beadlock ring
  for(let k=0;k<16;k++){const a=k/16*Math.PI*2;this.mesh(new T.CylinderGeometry(.025,.025,.05,6),M.chrome,[s*.23,Math.cos(a)*.8,Math.sin(a)*.8],parent,[0,0,Math.PI/2]);}
  for(let k=0;k<8;k++){const a=k/8*Math.PI*2;this.box([.06,.12,.52],[s*.09,Math.cos(a)*.42,Math.sin(a)*.42],M.frame,parent,[a,0,0]);}
  this.mesh(new T.CylinderGeometry(.24,.28,.2,16),M.engine,[s*.12,0,0],parent,[0,0,Math.PI/2]);
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
   const mast=new T.Group();mast.position.set(0,Y+.1,-1.2);top.add(mast);this.rod([0,0,0],[0,1.6,0],.07,M.frame,mast,8);
   const ball=this.mesh(new T.SphereGeometry(.24,20,14),M.dark,[0,1.8,0],mast);this.mesh(new T.CylinderGeometry(.09,.09,.05,14),M.screen,[0,1.8,-.23],mast,[Math.PI/2,0,0]);this.sensor=ball;this.sensorMast=mast;
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
   const hubY=GEOM.hubTop-w.e-PLATE;// relative to the plate group
   L.hub.position.y=hubY;
   const rodTop=L.barrelBot+.1,len=Math.max(.05,rodTop-hubY-.2);L.rod.scale.y=len;L.rod.position.y=hubY+.2+len/2;
   W.spin.rotation.x=-w.spin;
   // tyre flat spot: deflection toward the contact normal (in the spinning tyre's local frame)
   W.tireMat.userData.flat.value=w.contact?Math.min(.3,w.deflection||0):0;
   tmpDown.set(-w.cn[0],-w.cn[1],-w.cn[2]);const inv=new T.Matrix4().copy(W.spin.matrixWorld).invert();tmpDown.transformDirection(inv);W.tireMat.userData.down.value.copy(tmpDown);
  }
  // hatch and ladder
  const want=opts.ladder?1:0;this._lad=(this._lad??0)+(want-(this._lad??0))*Math.min(1,dt*1.2);
  this.ladder.visible=this._lad>.02;this.ladder.scale.y=Math.max(.01,this._lad);this.hatch.position.x=this._lad*.9;
  // lights
  const t=performance.now()/1000;
  const night=opts.night||0;for(const h of this.lights.head)h.material.emissiveIntensity=opts.headlights?4:0;for(const h of this.lights.tail)h.material.emissiveIntensity=opts.headlights?2.5:(opts.braking?3:.2);
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
 const R=GEOM.R,W=GEOM.tireWidth,seg=180,prof=[];
 const rows=16;for(let k=0;k<=rows;k++){const u=k/rows,a=(u-.5)*Math.PI;// cross-section from inner bead to outer bead
  const x=Math.sin(a)*W*.5,r=R-.28+Math.cos(a)*.28;prof.push([x,r,u]);}
 const pos=[],idx=[],nLug=26;
 for(let i=0;i<=seg;i++){const th=i/seg*Math.PI*2;for(const [x,r,u] of prof){
  const side=Math.abs(u-.5)*2;const tread=side<.92?1:0;
  // chevron: lugs slanted from the centre line toward each shoulder
  const ph=(th*nLug/(Math.PI*2)+Math.abs(x)*4.2);const lug=((ph%1)+1)%1<.36&&Math.abs(x)>.02?1:0;
  const rr=r+tread*lug*.055*(1-side*.6);
  pos.push(x,Math.cos(th)*rr,Math.sin(th)*rr);}}
 const C=prof.length;for(let i=0;i<seg;i++)for(let k=0;k<C-1;k++){const a=i*C+k,b=a+C;idx.push(a,b,a+1,b,b+1,a+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function tireShader(prev){return function(sh){prev&&prev.call(this,sh);sh.uniforms.uFlat=this.userData.flat;sh.uniforms.uDown=this.userData.down;
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uFlat;uniform vec3 uDown;').replace('#include <begin_vertex>',`#include <begin_vertex>
{float lim=${GEOM.R.toFixed(3)}-uFlat;float d=dot(transformed,uDown);if(d>lim){transformed-=uDown*(d-lim);transformed.x*=1.0+(d-lim)*.6;}}`);};}
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
