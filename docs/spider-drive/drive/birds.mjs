// Wildlife: small flocks perched on the ground and in tree tops that take off when the Spider comes close,
// fly off in a loose group and settle again further on, plus a pair of raptors soaring high over the country.
// One instanced mesh; wings flap in the vertex shader from a per-bird (flying, frequency, phase) attribute.
import * as T from 'three';
import {shared} from './materials.mjs';
import {clamp,mix} from './noise.mjs';

const MAX=220;
function birdGeometry(){
 // body: a flattened diamond along -z (forward); wings: two quads with a 'wing' weight at the tips
 const P=[],N=[],W=[],I=[];const v=(x,y,z,w=0)=>{P.push(x,y,z);N.push(0,1,0);W.push(w);return P.length/3-1;};
 const nose=v(0,0,-.17),tail=v(0,.01,.14),l=v(-.045,-.01,-.02),r=v(.045,-.01,-.02),top=v(0,.035,-.04),bot=v(0,-.03,-.03);
 I.push(nose,l,top,nose,top,r,tail,top,l,tail,r,top,nose,bot,l,nose,r,bot,tail,l,bot,tail,bot,r);
 for(const s of [-1,1]){const a=v(s*.04,.01,-.07,.1),b=v(s*.04,.01,.05,.1),c=v(s*.36,.03,.0,1),d=v(s*.36,.03,-.1,1),e=v(s*.2,.02,-.1,.55),f=v(s*.2,.02,.06,.55);
  if(s<0)I.push(a,e,f,a,f,b,e,d,c,e,c,f);else I.push(a,f,e,a,b,f,e,c,d,e,f,c);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('normal',new T.Float32BufferAttribute(N,3));g.setAttribute('wing',new T.Float32BufferAttribute(W,1));g.setIndex(I);
 const st=new T.InstancedBufferAttribute(new Float32Array(MAX*4),4);st.setUsage(T.DynamicDrawUsage);g.setAttribute('st',st);return g;
}
function birdMaterial(){
 const m=new T.MeshStandardMaterial({color:0x1b1a18,roughness:.9,metalness:0,side:T.DoubleSide});
 m.onBeforeCompile=sh=>{sh.uniforms.uTime=shared.uTime;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float wing;attribute vec4 st;uniform float uTime;')
  .replace('#include <begin_vertex>',`#include <begin_vertex>
  {float fly=st.x;float a=sin(uTime*st.y+st.z)*(.3+.75*fly)*wing;/* flap: tips lead, folded when perched */
   float fold=mix(.3,1.0,fly);transformed.x*=mix(1.0,fold,wing);transformed.y+=abs(transformed.x)*sin(a)*1.1*wing;transformed.x*=cos(a*.6);
   transformed*=st.w;}`);};
 m.customProgramCacheKey=()=>'bird';return m;
}
export class Birds{
 constructor(scene,terrain,env){
  this.scene=scene;this.t=terrain;this.env=env;this.enabled=true;
  this.mesh=new T.InstancedMesh(birdGeometry(),birdMaterial(),MAX);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=false;this.mesh.receiveShadow=false;this.mesh.name='birds';scene.add(this.mesh);
  this.flocks=[];this.raptors=[];this.events=[];this.t0=0;this.spawnT=0;
  this._m=new T.Matrix4();this._q=new T.Quaternion();this._e=new T.Euler();this._p=new T.Vector3();this._s=new T.Vector3();
  const rng=this.rng=(()=>{let s=12345;return()=>(s=(s*16807)%2147483647)/2147483647;})();
  for(let k=0;k<2;k++)this.raptors.push({x:0,z:0,y:0,ang:rng()*6.28,r:70+rng()*50,h:70+rng()*40,phase:rng()*6.28,freq:3.2,fly:.25,sc:2.2,cx:0,cz:0,heading:0,bank:0});
 }
 // a perch: open ground or a tree top, away from water
 perch(x,z){
  const w=this.env.water(x,z,{});if(w.kind&&w.depth>.05)return null;
  const g=this.env.ground(x,z,1e9);let y=g+.05,tree=false;
  const obs=this.env.obstacles?this.env.obstacles(x,z,12):null;
  if(obs)for(const o of obs){if(o.type==='canopy'&&Math.hypot(o.x-x,o.z-z)<o.r*.6){y=Math.max(y,o.cy+o.r*.9);tree=true;}}
  return {y,tree};
 }
 spawnFlock(sp,heading){
  const r=this.rng,d=90+r()*200,a=heading+(r()-.5)*2.6,x=sp.pos[0]+Math.sin(a)*d,z=sp.pos[2]-Math.cos(a)*d;
  const p=this.perch(x,z);if(!p)return;
  const n=3+Math.floor(r()*7),birds=[];const kind=r()<.25?'dove':'starling';
  for(let i=0;i<n;i++){const ox=(r()-.5)*(p.tree?3:7),oz=(r()-.5)*(p.tree?3:7);const q=this.perch(x+ox,z+oz)||p;
   birds.push({x:x+ox,y:q.y,z:z+oz,vx:0,vy:0,vz:0,heading:r()*6.28,bank:0,fly:0,phase:r()*6.28,freq:kind==='dove'?11:14,sc:kind==='dove'?1.6:1.25,delay:0,t:0,hop:r()*4,land:null});}
  this.flocks.push({x,z,y:p.y,birds,state:'perched',kind,age:0});
 }
 startle(f,sp){
  const r=this.rng;f.state='flying';
  // away from the Spider, then a landing spot 150-300 m on in that general direction
  const ax=f.x-sp.pos[0],az=f.z-sp.pos[2],al=Math.hypot(ax,az)||1,dir=Math.atan2(ax/al,-az/al)+(r()-.5)*1.4;
  const ld=150+r()*150,lx=f.x+Math.sin(dir)*ld,lz=f.z-Math.cos(dir)*ld;const lp=this.perch(lx,lz)||{y:this.env.ground(lx,lz,1e9)+.05};
  f.land=[lx,lp.y,lz];f.climb=14+r()*14;
  f.birds.forEach((b,i)=>{b.delay=r()*.7;b.t=0;b.heading=dir+(r()-.5)*.8;const sp0=7+r()*4;b.vx=Math.sin(b.heading)*sp0;b.vz=-Math.cos(b.heading)*sp0;b.vy=2.5+r()*2;b.land=[lx+(r()-.5)*8,lp.y,lz+(r()-.5)*8];b.fly=1;b.freq=f.kind==='dove'?11:14;});
  this.events.push({type:'flock',n:f.birds.length,x:f.x,z:f.z});
 }
 update(dt,sp,cam,G){
  if(!this.enabled||!sp){this.mesh.count=0;return;}
  dt=Math.min(dt,.05);this.t0+=dt;const r=this.rng;const speed=Math.hypot(sp.vel[0],sp.vel[2]),heading=sp.heading?sp.heading():0;
  // population: keep a handful of flocks around, mostly ahead
  this.spawnT-=dt;if(this.spawnT<=0){this.spawnT=1.2;const near=this.flocks.filter(f=>Math.hypot(f.x-sp.pos[0],f.z-sp.pos[2])<320).length;if(near<6&&this.flocks.length<9)this.spawnFlock(sp,heading);}
  this.flocks=this.flocks.filter(f=>{f.age+=dt;const d=Math.hypot(f.x-sp.pos[0],f.z-sp.pos[2]);return !(d>480&&f.age>4);});
  for(const f of this.flocks){
   if(f.state==='perched'){
    const d=Math.hypot(f.x-sp.pos[0],f.z-sp.pos[2]);
    // startle radius grows with speed; an engine at idle next to them is tolerated for a while
    if(d<34+speed*1.6){this.startle(f,sp);continue;}
    for(const b of f.birds){b.hop-=dt;if(b.hop<0){b.hop=2+r()*6;b.heading+=(r()-.5)*1.5;b.vy=1.6;}
     if(b.vy>0||b.y>f.y+.001){b.vy-=9.81*dt;b.y+=b.vy*dt;if(b.y<=f.y){b.y=f.y;b.vy=0;}}}
   }else{
    let allDown=true,cx=0,cz=0;
    for(const b of f.birds){cx+=b.x;cz+=b.z;
     if(b.delay>0){b.delay-=dt;allDown=false;continue;}
     b.t+=dt;
     const dx=b.land[0]-b.x,dz=b.land[2]-b.z,dh=Math.hypot(dx,dz);const g=this.env.ground(b.x,b.z,1e9);
     // steer toward the landing spot; climb first, then glide down over the last 60 m
     const want=Math.atan2(dx,-dz);let da=want-b.heading;da=Math.atan2(Math.sin(da),Math.cos(da));
     const turn=clamp(da,-1,1)*(1.6+.4*Math.sin(b.phase+this.t0*2))*dt;b.heading+=turn;b.bank=mix(b.bank,-clamp(da,-1,1)*.7,dt*3);
     const cruise=11+Math.sin(b.phase)*1.5,hv=Math.hypot(b.vx,b.vz),sp1=mix(hv,dh<40?7:cruise,dt*1.5);
     b.vx=Math.sin(b.heading)*sp1;b.vz=-Math.cos(b.heading)*sp1;
     const targetY=dh>60?Math.max(g,b.land[1])+f.climb*clamp(b.t/3,.3,1):mix(b.land[1],Math.max(g+4,b.land[1]+4),clamp((dh-4)/56,0,1));
     b.vy=mix(b.vy,clamp((targetY-b.y)*1.4,-5,5),dt*2.5);b.y+=b.vy*dt;if(b.y<g+.3){b.y=g+.3;b.vy=Math.max(0,b.vy);}
     b.x+=b.vx*dt;b.z+=b.vz*dt;
     b.fly=dh<10&&Math.abs(b.y-b.land[1])<1.5?mix(b.fly,.4,dt*4):1;b.freq=b.vy>.5?(f.kind==='dove'?12:15):(f.kind==='dove'?8:10);
     if(dh<2.5&&Math.abs(b.y-b.land[1])<1.2){b.x=b.land[0];b.z=b.land[2];b.y=b.land[1];b.vx=b.vz=b.vy=0;b.fly=0;b.bank=0;}else allDown=false;
     if(b.t>40){b.x=b.land[0];b.z=b.land[2];b.y=b.land[1];b.vx=b.vz=b.vy=0;b.fly=0;}
    }
    f.x=cx/f.birds.length;f.z=cz/f.birds.length;
    if(allDown){f.state='perched';f.y=f.land[1];for(const b of f.birds)b.hop=1+r()*4;}
   }
  }
  // raptors: slow circles that drift with the Spider
  for(const R of this.raptors){R.cx=mix(R.cx,sp.pos[0],dt*.05);R.cz=mix(R.cz,sp.pos[2],dt*.05);R.ang+=dt*(13/R.r);const px=R.cx+Math.cos(R.ang)*R.r,pz=R.cz+Math.sin(R.ang)*R.r;
   R.heading=Math.atan2(px-R.x,-(pz-R.z));R.x=px;R.z=pz;const g=this.env.ground(px,pz,1e9);R.y=mix(R.y||g+R.h,g+R.h+Math.sin(this.t0*.3+R.phase)*6,dt*.5);R.bank=.35;R.fly=.12+.12*(Math.sin(this.t0*.7+R.phase)>.6?1:0);}
  // write instances
  let n=0;const M=this._m,Q=this._q,E=this._e,P=this._p,S=this._s,st=this.mesh.geometry.attributes.st;
  const put=(b,fly,freq,sc)=>{if(n>=MAX)return;E.set(-Math.atan2(b.vy||0,Math.hypot(b.vx||0,b.vz||0)||1)*.6,b.heading,b.bank||0,'YXZ');Q.setFromEuler(E);P.set(b.x,b.y+.1*sc,b.z);S.set(1,1,1);M.compose(P,Q,S);this.mesh.setMatrixAt(n,M);st.setXYZW(n,fly,freq,b.phase,sc);n++;};
  for(const f of this.flocks)for(const b of f.birds)put(b,b.fly,b.freq,b.sc);
  for(const R of this.raptors)put(R,R.fly,R.freq,R.sc);
  this.mesh.count=n;this.mesh.instanceMatrix.needsUpdate=true;st.needsUpdate=true;
 }
}
