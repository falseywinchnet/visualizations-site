// Deterministic vegetation and ground-clutter placement. Pure JS: the terrain worker uses it to
// build render instance lists and the main thread uses the SAME function for physics colliders.
import {hash2,clamp,mix,smoothstep} from './noise.mjs';

export const SPECIES=[
 {id:0,name:'conifer',tree:true,h:[9,24],trunk:[.18,.42]},
 {id:1,name:'broadleaf',tree:true,h:[8,17],trunk:[.2,.5]},
 {id:2,name:'birch',tree:true,h:[7,14],trunk:[.12,.24]},
 {id:3,name:'snag',tree:true,h:[6,14],trunk:[.15,.35]},
 {id:4,name:'shrub'},{id:5,name:'sage'},{id:6,name:'grass'},{id:7,name:'reeds'},
 {id:8,name:'corn'},{id:9,name:'wheat'},{id:10,name:'boulder'},{id:11,name:'log'},
 {id:12,name:'drygrass'},{id:13,name:'yucca'},{id:14,name:'sapling',tree:true,h:[2.5,5.5],trunk:[.04,.1]},
 {id:15,name:'cornfar'},{id:16,name:'flowers'},
];
export const SP=Object.fromEntries(SPECIES.map(s=>[s.name,s.id]));
export const CHUNK=64;
// instance record stride: x,y,z,rot,scale,tint,aux
export const STRIDE=7;

// Returns {lists: Float32Array per species (or null)} for a 64 m chunk. `near` adds grass/corn/reeds.
export function placeChunk(t,cx,cz,opts={}){
 const seed=t.w.seed,x0=cx*CHUNK,z0=cz*CHUNK;const out=SPECIES.map(()=>[]);
 if(Math.abs(x0+32)>t.half+900||Math.abs(z0+32)>t.half+900)return pack(out);
 const inside=t.inside(x0+32,z0+32,-40);
 const wt={};t._vn=t._vn||[];
 const push=(sp,x,y,z,rot,sc,tint,aux=0)=>{out[sp].push(x,y,z,rot,sc,tint,aux);};
 const roadClear=(x,z,m)=>{const r=t.roadNear(x,z);return !(r&&r.d<m);};
 const townNear=(x,z)=>{for(const tw of t.w.towns){const d=Math.hypot(x-tw.x,z-tw.z);if(d<tw.r+10)return d/tw.r;}return 9;};
 const buildingNear=(x,z,m)=>{for(const b of t.w.buildings){if(Math.abs(b.x-x)<30&&Math.abs(b.z-z)<30&&Math.hypot(b.x-x,b.z-z)<Math.max(b.w,b.d)*.7+m)return true;}return false;};
 if(t.body&&t.body!=='earth'){bodyChunk(t,x0,z0,push,wt,opts,roadClear,buildingNear);return pack(out);}
 const burn=t.overlay?t.overlay:null;
 // ---- trees, saplings, logs, snags on a jittered 5.33 m lattice
 const S=16/3;
 if(!opts.nearOnly)for(let j=0;j<12;j++)for(let i=0;i<12;i++){
  const gx=Math.floor(x0/S)+i,gz=Math.floor(z0/S)+j,r1=hash2(gx,gz,seed+11),r2=hash2(gx,gz,seed+12),r3=hash2(gx,gz,seed+13),r4=hash2(gx,gz,seed+14);
  const x=gx*S+r1*S*.9,z=gz*S+r2*S*.9;if(x<x0||z<z0||x>=x0+CHUNK||z>=z0+CHUNK)continue;
  if(!inside&&!t.inside(x,z,-600))continue;
  t.weights(x,z,wt);
  let rho=wt.forest*.92;
  const f=wt.farm>.45?t.field(x,z):null;
  if(f){rho=f.blockEdge<3.5&&f.blockEdge>.8?.42:0;}// hedgerow trees along farm block edges
  const near=t.channelsNear(x,z,t._vn||(t._vn=[]));let riparian=0,inWater=false;
  for(const c of near){if(c.c.cls>=1){const e=c.d-c.w*.5;if(e<1.5){inWater=true;break;}riparian=Math.max(riparian,(1-smoothstep(4,26,e))*smoothstep(.35,.6,wt.moisture));}if(c.c.cls===0&&c.d<c.w*.6){inWater=true;break;}}
  if(inWater)continue;
  rho=Math.max(rho,riparian*.7)+(1-wt.farm)*(1-wt.rock)*.018;
  const td=townNear(x,z);if(td<1.1)rho=td<.9?.05:rho*.4;
  if(r3>rho)continue;
  if(!roadClear(x,z,4.5)||wt.snow>.55||t.grid('slope',x,z)>1.15)continue;
  if(td<1.1&&buildingNear(x,z,4))continue;
  if(t.inside(x,z)){const k=Math.floor((z+t.half)/t.cell)*t.N+Math.floor((x+t.half)/t.cell);if(t.w.lakeId[k]>=0)continue;}
  const y=t.height(x,z);
  // species by climate
  const T=wt.temperature,M=wt.moisture;
  const pCon=clamp(smoothstep(.62,.36,T)*1.1+wt.rock*.3+(wt.dry>.4?.3:0),0,1),pBirch=riparian>.4?.5:smoothstep(.5,.65,M)*.18;
  let sp=r4<pCon?SP.conifer:r4<pCon+pBirch*(1-pCon)?SP.birch:SP.broadleaf;
  const rs=hash2(gx,gz,seed+15);
  if(rs<.035||(wt.desert>.5&&rs<.3))sp=SP.snag;
  let sapling=false;if(sp!==SP.snag&&rs>.86){sapling=true;}
  if(f||riparian>.4)sapling=sapling&&rs>.93;
  const def=SPECIES[sapling?SP.sapling:sp];const hS=mix(def.h[0],def.h[1],hash2(gx,gz,seed+16))*(1-wt.rock*.25)*(T<.3?.8:1);
  const tint=hash2(gx,gz,seed+17);
  if(sapling)push(SP.sapling,x,y,z,r1*6.283,hS,tint,sp);else push(sp,x,y,z,r1*6.283,hS,tint);
  // fallen logs on the forest floor
  if(wt.forest>.55&&hash2(gx,gz,seed+18)<.05){const a=hash2(gx,gz,seed+19)*6.283,lx=x+Math.cos(a)*3,lz=z+Math.sin(a)*3;if(roadClear(lx,lz,6))push(SP.log,lx,t.height(lx,lz),lz,a,4+hash2(gx,gz,seed+20)*6,tint,.2+hash2(gx,gz,seed+21)*.25);}
 }
 // ---- shrubs, sage, yucca, boulders on a 4 m lattice
 if(!opts.nearOnly)for(let j=0;j<16;j++)for(let i=0;i<16;i++){
  const gx=Math.floor(x0/4)+i,gz=Math.floor(z0/4)+j,r1=hash2(gx,gz,seed+31),r2=hash2(gx,gz,seed+32),r3=hash2(gx,gz,seed+33),r4=hash2(gx,gz,seed+34);
  const x=gx*4+r1*3.6,z=gz*4+r2*3.6;if(!t.inside(x,z,-600))continue;
  t.weights(x,z,wt);
  const sl=t.grid('slope',x,z);
  const tp=t.terraceParams(x,z);
  // boulders: rock country, scree below cliffs, riverbeds
  const pb=wt.rock*.14+tp.w*.1+(wt.dry>.5?.03:0)+.004;
  if(r3<pb){if(!roadClear(x,z,4))continue;if(townNear(x,z)<1.05)continue;const sc=.45+Math.pow(r4,2.2)*2.6;push(SP.boulder,x,t.height(x,z)-sc*.25,z,r1*6.283,sc,r2,hash2(gx,gz,seed+35));continue;}
  let ps=wt.scrub*.55+wt.forest*.12+(1-wt.farm)*.03,sp=SP.shrub;
  if(wt.dry>.35||wt.desert>.4){ps=wt.scrub*.45+wt.desert*.25;sp=r4<.12&&wt.desert>.4?SP.yucca:SP.sage;}
  if(wt.farm>.45){const f=t.field(x,z);ps=f.blockEdge<4.5?.5:f.edge<2.5&&f.crop!==2?.04:0;}
  if(wt.snow>.4||sl>1.1)continue;
  if(r3>pb+ps)continue;
  if(!roadClear(x,z,5))continue;const td=townNear(x,z);if(td<1&&(td<.85||buildingNear(x,z,3)))continue;
  let wet=false;for(const c of t.channelsNear(x,z,t._vn)){if(c.c.cls>=1&&c.d<c.w*.5+1){wet=true;break;}}if(wet)continue;
  push(sp,x,t.height(x,z),z,r1*6.283,.6+r4*1.2,r2);
 }
 // ---- near-field ground cover
 if(opts.near||opts.nearOnly){
  // grass clumps / flowers / wheat / reeds on a 1.6 m lattice
  const G=1.6,n=CHUNK/G;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const gx=Math.floor(x0/G)+i,gz=Math.floor(z0/G)+j,r1=hash2(gx,gz,seed+51),r2=hash2(gx,gz,seed+52),r3=hash2(gx,gz,seed+53);
   const x=gx*G+r1*G,z=gz*G+r2*G;if(!t.inside(x,z,-200))continue;
   t.weights(x,z,wt);if(wt.snow>.5||wt.rock>.6)continue;
   const r=t.roadNear(x,z);if(r&&r.d<(r.r.kind==='main'?.8:.25))continue;
   let sp=-1,p=0;
   const near=t.channelsNear(x,z,t._vn);let edge=99,inW=false;for(const c of near){if(c.c.cls>=1){const e=c.d-c.w*.5;if(e<0){inW=true;}edge=Math.min(edge,Math.abs(e));}}
   if(inW||edge<.7)continue;/* nothing grows in the channel or on its lip */
   if(edge<4.5&&wt.moisture>.3||wt.marsh>.4){sp=SP.reeds;p=.55;}
   else if(wt.farm>.45){const f=t.field(x,z);if(f.edge<1.4){sp=SP.grass;p=.6;}else if(f.crop===1){sp=SP.wheat;p=.95;}else if(f.crop===2){sp=SP.grass;p=.55;}else if(f.crop===3){sp=SP.drygrass;p=.12;}else continue;}
   else{const dryish=wt.moisture<.3||wt.desert>.3;sp=dryish?SP.drygrass:SP.grass;p=(1-wt.forest*.6)*(dryish?.45:.8)*(1-wt.rock);if(!dryish&&r3>.93&&wt.forest<.4){sp=SP.flowers;p=1;}}
   const tn=townNear(x,z);if(tn<.9)p*=.4;
   if(r3>p&&sp!==SP.flowers)continue;
   push(sp,x,t.height(x,z),z,r1*6.283,.7+r2*.6,r3);
  }
  // corn rows: 0.76 m row spacing along each field's row direction, 1.6 m segments
  cornRows(t,x0,z0,push,wt);
 }
 if(opts.far){cornFar(t,x0,z0,push,wt);}
 return pack(out);
}
// Off Earth nothing grows. Boulders only: dense in fresh ejecta and on the Moon's ridge, sparse on the Mars
// plains with more on the lava lobes, small ice cobbles on Titan's interdune flats and none on the dunes.
function bodyChunk(t,x0,z0,push,wt,opts,roadClear,buildingNear){
 if(opts.nearOnly)return;const seed=t.w.seed,b=t.body;
 const stage=t.w.sites.find(s=>s.type==='staging');
 for(let j=0;j<16;j++)for(let i=0;i<16;i++){
  const gx=Math.floor(x0/4)+i,gz=Math.floor(z0/4)+j,r1=hash2(gx,gz,seed+31),r2=hash2(gx,gz,seed+32),r3=hash2(gx,gz,seed+33),r4=hash2(gx,gz,seed+34);
  const x=gx*4+r1*3.6,z=gz*4+r2*3.6;if(!t.inside(x,z,-600))continue;
  t.weights(x,z,wt);const sl=t.grid('slope',x,z);
  let pb,smax;
  if(b==='moon'){pb=wt.rock*.22+(wt.dry>.4?.06:0)+.006;smax=3.4;}
  else if(b==='mars'){pb=wt.rock*.14*(1-wt.desert)+.004;smax=2.6;}
  else{pb=(1-wt.desert)*.09+wt.rock*.05;smax=.9;}
  if(r3>pb)continue;
  if(!roadClear(x,z,4)||buildingNear(x,z,3))continue;if(stage&&Math.hypot(x-stage.x,z-stage.z)<80)continue;
  if(t.inside(x,z)){const k=Math.floor((z+t.half)/t.cell)*t.N+Math.floor((x+t.half)/t.cell);if(t.w.lakeId[k]>=0)continue;}
  let wet=false;for(const c of t.channelsNear(x,z,t._vn)){if(c.d<c.w*.5+1){wet=true;break;}}if(wet)continue;
  const sc=.4+Math.pow(r4,2.4)*smax;push(SP.boulder,x,t.height(x,z)-sc*.25,z,r1*6.283,sc,r2,hash2(gx,gz,seed+35));
 }
}
function inCorn(t,x,z,wt){t.weights(x,z,wt);if(wt.farm<.45)return null;const f=t.field(x,z);if(f.crop!==0||f.edge<2.2)return null;return f;}
function cornRows(t,x0,z0,push,wt){
 // group by the field's row angle: sample the chunk on an 8 m grid to find corn fields' row directions
 const angles=new Set();for(let z=z0+4;z<z0+CHUNK;z+=12)for(let x=x0+4;x<x0+CHUNK;x+=12){const f=inCorn(t,x,z,wt);if(f)angles.add(Math.round(f.rowAngle*1000)/1000);}
 for(const a of angles){
  const ca=Math.cos(a),sa=Math.sin(a),RS=.76,SEG=1.6;
  // project chunk corners into (s along rows, p across rows)
  let smin=1e9,smax=-1e9,pmin=1e9,pmax=-1e9;for(const [x,z] of [[x0,z0],[x0+CHUNK,z0],[x0,z0+CHUNK],[x0+CHUNK,z0+CHUNK]]){const s=x*ca+z*sa,p=-x*sa+z*ca;smin=Math.min(smin,s);smax=Math.max(smax,s);pmin=Math.min(pmin,p);pmax=Math.max(pmax,p);}
  for(let k=Math.ceil(pmin/RS);k*RS<=pmax;k++){const p=k*RS;
   for(let m=Math.ceil(smin/SEG);m*SEG<=smax;m++){const s=(m+.5)*SEG;const x=s*ca-p*sa,z=s*sa+p*ca;if(x<x0||z<z0||x>=x0+CHUNK||z>=z0+CHUNK)continue;
    const f=inCorn(t,x,z,wt);if(!f||Math.abs(f.rowAngle-a)>.002)continue;const r=t.roadNear(x,z);if(r&&r.d<2.5)continue;
    const h=hash2(k,m,t.w.seed+71);if(h<.035)continue;// gaps
    push(SP.corn,x,t.height(x,z),z,a,.88+h*.24,hash2(k,m,t.w.seed+72),0);}
  }
 }
}
function cornFar(t,x0,z0,push,wt){
 const angles=new Set();for(let z=z0+4;z<z0+CHUNK;z+=12)for(let x=x0+4;x<x0+CHUNK;x+=12){const f=inCorn(t,x,z,wt);if(f)angles.add(Math.round(f.rowAngle*1000)/1000);}
 for(const a of angles){const ca=Math.cos(a),sa=Math.sin(a),RS=1.52,SEG=6;
  let smin=1e9,smax=-1e9,pmin=1e9,pmax=-1e9;for(const [x,z] of [[x0,z0],[x0+CHUNK,z0],[x0,z0+CHUNK],[x0+CHUNK,z0+CHUNK]]){const s=x*ca+z*sa,p=-x*sa+z*ca;smin=Math.min(smin,s);smax=Math.max(smax,s);pmin=Math.min(pmin,p);pmax=Math.max(pmax,p);}
  for(let k=Math.ceil(pmin/RS);k*RS<=pmax;k++){const p=k*RS;for(let m=Math.ceil(smin/SEG);m*SEG<=smax;m++){const s=(m+.5)*SEG;const x=s*ca-p*sa,z=s*sa+p*ca;if(x<x0||z<z0||x>=x0+CHUNK||z>=z0+CHUNK)continue;const f=inCorn(t,x,z,wt);if(!f||Math.abs(f.rowAngle-a)>.002)continue;const r=t.roadNear(x,z);if(r&&r.d<2.5)continue;push(SP.cornfar,x,t.height(x,z),z,a,1,hash2(k,m,t.w.seed+73),0);}}
 }
}
function pack(out){return out.map(a=>a.length?Float32Array.from(a):null);}

// Physics colliders from a chunk's lists: trunks (breakable saplings), boulders (ground caps),
// logs (ground caps), canopies (brush).
export function collidersFrom(lists,key){
 const trunks=[],caps=[],canopies=[];
 const tree=(sp,L)=>{if(!L)return;const def=SPECIES[sp];for(let k=0;k<L.length;k+=STRIDE){const x=L[k],y=L[k+1],z=L[k+2],h=L[k+4],r=mix(def.trunk[0],def.trunk[1],L[k+5])*(h/def.h[1]);
  trunks.push({type:'trunk',x,y,z,r:Math.max(.05,r),h:h*.7,breakable:sp===SP.sapling||r<.45,strength:3.5e4*Math.pow(Math.max(.05,r)/.1,3),fbreak:15e3*Math.pow(Math.max(.05,r)/.1,2.5),sp,key,idx:k/STRIDE});
  if(sp!==SP.snag){const cr=sp===SP.conifer?h*.2:h*.3;canopies.push({type:'canopy',x,z,cy:y+h*(sp===SP.conifer?.55:.66),r:cr,sp,key,idx:k/STRIDE});}}};
 for(const sp of [SP.conifer,SP.broadleaf,SP.birch,SP.snag,SP.sapling])tree(sp,lists[sp]);
 const B=lists[SP.boulder];if(B)for(let k=0;k<B.length;k+=STRIDE){const s=B[k+4];caps.push({kind:'boulder',x:B[k],y:B[k+1],z:B[k+2],rx:s*.9,rz:s*.75,h:s*.85,rot:B[k+3]});}
 const Lg=lists[SP.log];if(Lg)for(let k=0;k<Lg.length;k+=STRIDE){caps.push({kind:'log',x:Lg[k],y:Lg[k+1],z:Lg[k+2],len:Lg[k+4],r:Lg[k+6],rot:Lg[k+3]});}
 return {trunks,caps,canopies};
}
// Height contribution of ground caps (boulders, logs) at x,z.
export function capHeight(caps,x,z){
 let top=-1e9;
 for(const c of caps){
  if(c.kind==='boulder'){const dx=x-c.x,dz=z-c.z;if(Math.abs(dx)>c.rx+.1||Math.abs(dz)>c.rx+.1)continue;const co=Math.cos(c.rot),si=Math.sin(c.rot),u=(dx*co-dz*si)/c.rx,v=(dx*si+dz*co)/c.rz,q=1-u*u-v*v;if(q>0)top=Math.max(top,c.y+c.h*Math.sqrt(q));}
  else{const co=Math.cos(c.rot),si=Math.sin(c.rot),dx=x-c.x,dz=z-c.z,a=dx*co+dz*si,b=-dx*si+dz*co;if(Math.abs(a)>c.len*.5||Math.abs(b)>c.r)continue;top=Math.max(top,c.y+c.r+Math.sqrt(c.r*c.r-b*b));}
 }
 return top;
}
