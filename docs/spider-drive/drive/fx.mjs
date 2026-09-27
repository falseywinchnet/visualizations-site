// Pooled billboard particles (dust, mud, splash, spray, exhaust, smoke, flame, embers, leaves,
// blasts, rain) and a moving tyre-track texture for the terrain shader.
import * as T from 'three';
import {shared} from './materials.mjs';
import {clamp,mix} from './noise.mjs';

function atlas(){const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
 // 0 soft puff
 let gr=g.createRadialGradient(32,32,2,32,32,31);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.5,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
 // 1 leaf
 g.save();g.translate(96,32);g.rotate(.6);g.fillStyle='#fff';g.beginPath();g.ellipse(0,0,20,9,0,0,Math.PI*2);g.fill();g.restore();
 // 2 streak
 gr=g.createLinearGradient(160,0,160,64);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.5,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(158,0,4,64);
 // 3 flame tongue
 gr=g.createRadialGradient(224,40,1,224,36,30);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.8)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.beginPath();g.ellipse(224,36,18,28,0,0,Math.PI*2);g.fill();
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
class Pool{
 constructor(scene,tex,n,additive){
  this.n=n;const g=new T.InstancedBufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));g.setIndex([0,1,2,0,2,3]);
  this.p=new Float32Array(n*3);this.c=new Float32Array(n*4);this.s=new Float32Array(n*3);// size, rotation, frame
  g.setAttribute('ip',new T.InstancedBufferAttribute(this.p,3).setUsage(T.DynamicDrawUsage));g.setAttribute('ic',new T.InstancedBufferAttribute(this.c,4).setUsage(T.DynamicDrawUsage));g.setAttribute('is',new T.InstancedBufferAttribute(this.s,3).setUsage(T.DynamicDrawUsage));
  g.instanceCount=0;
  const m=new T.ShaderMaterial({uniforms:{tA:{value:tex},uFogColor:{value:new T.Color()},uFogDensity:{value:0}},transparent:true,depthWrite:false,blending:additive?T.AdditiveBlending:T.NormalBlending,
   vertexShader:`#include <common>
attribute vec3 ip;attribute vec4 ic;attribute vec3 is;varying vec2 vUv;varying vec4 vC;varying float vFog;
#include <logdepthbuf_pars_vertex>
void main(){vec4 mv=viewMatrix*vec4(ip,1.0);float r=is.y;vec2 q=position.xy;if(is.z>1.5&&is.z<2.5){q.x*=.08;}vec2 rq=vec2(q.x*cos(r)-q.y*sin(r),q.x*sin(r)+q.y*cos(r));if(is.z>1.5&&is.z<2.5)rq=q;mv.xy+=rq*is.x;gl_Position=projectionMatrix*mv;
 vUv=vec2((position.x+.5+is.z)/4.0,position.y+.5);vC=ic;vFog=length(mv.xyz);
#include <logdepthbuf_vertex>
}`,
   fragmentShader:`uniform sampler2D tA;uniform vec3 uFogColor;uniform float uFogDensity;varying vec2 vUv;varying vec4 vC;varying float vFog;
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
 vec4 t=texture2D(tA,vUv);float f=1.0-exp(-uFogDensity*uFogDensity*vFog*vFog);vec3 col=mix(vC.rgb,uFogColor,${additive?'0.0':'f'});gl_FragColor=vec4(col*${additive?'(1.0-f)':'1.0'},t.a*vC.a);if(gl_FragColor.a<.004)discard;
 #include <colorspace_fragment>
}`});
  this.mesh=new T.Mesh(g,m);this.mesh.frustumCulled=false;this.mesh.renderOrder=5;scene.add(this.mesh);this.g=g;
  this.v=new Float32Array(n*3);this.life=new Float32Array(n);this.age=new Float32Array(n);this.type=new Uint8Array(n);this.size0=new Float32Array(n);this.size1=new Float32Array(n);this.col=new Float32Array(n*4);this.spin=new Float32Array(n);this.count=0;this.cursor=0;
 }
 spawn(x,y,z,vx,vy,vz,life,s0,s1,r,g,b,a,type,frame=0,spin=0){
  let i;if(this.count<this.n)i=this.count++;else{i=this.cursor;this.cursor=(this.cursor+1)%this.n;}
  this.p[i*3]=x;this.p[i*3+1]=y;this.p[i*3+2]=z;this.v[i*3]=vx;this.v[i*3+1]=vy;this.v[i*3+2]=vz;this.life[i]=life;this.age[i]=0;this.size0[i]=s0;this.size1[i]=s1;this.col[i*4]=r;this.col[i*4+1]=g;this.col[i*4+2]=b;this.col[i*4+3]=a;this.type[i]=type;this.s[i*3+1]=Math.random()*6.28;this.s[i*3+2]=frame;this.spin[i]=spin;
 }
 update(dt,wind){
  let n=this.count;
  for(let i=0;i<n;i++){
   this.age[i]+=dt;if(this.age[i]>=this.life[i]){// swap-remove
    n--;if(i!==n){for(const [arr,k] of [[this.p,3],[this.v,3],[this.col,4],[this.s,3]])for(let j=0;j<k;j++)arr[i*k+j]=arr[n*k+j];this.life[i]=this.life[n];this.age[i]=this.age[n];this.type[i]=this.type[n];this.size0[i]=this.size0[n];this.size1[i]=this.size1[n];this.spin[i]=this.spin[n];i--;}continue;}
   const t=this.age[i]/this.life[i],ty=this.type[i];
   const drag=ty===1?1.6:ty===2?.4:ty===3?.9:ty===5?.3:ty===6?2.2:.8,grav=ty===2?-9.8:ty===3?-9.8:ty===5?2.6:ty===6?.6:ty===4?-.4:ty===7?-1.2:ty===8?-22:0;
   const k=Math.exp(-drag*dt);this.v[i*3]=this.v[i*3]*k+wind[0]*(1-k)*.6;this.v[i*3+1]=this.v[i*3+1]*k+grav*dt;this.v[i*3+2]=this.v[i*3+2]*k+wind[1]*(1-k)*.6;
   if(ty===7){this.v[i*3]+=Math.sin(this.age[i]*9+i)*dt*3;this.v[i*3+2]+=Math.cos(this.age[i]*7+i)*dt*3;}
   this.p[i*3]+=this.v[i*3]*dt;this.p[i*3+1]+=this.v[i*3+1]*dt;this.p[i*3+2]+=this.v[i*3+2]*dt;
   this.s[i*3]=mix(this.size0[i],this.size1[i],Math.sqrt(t));this.s[i*3+1]+=this.spin[i]*dt;
   const fade=ty===5?Math.sin(t*Math.PI):ty===4?(1-t)*(1-t):t<.1?t/.1:1-(t-.1)/.9;
   this.c[i*4]=this.col[i*4];this.c[i*4+1]=this.col[i*4+1];this.c[i*4+2]=this.col[i*4+2];this.c[i*4+3]=this.col[i*4+3]*fade;
   if(ty===5){// flame: yellow -> orange -> dark red
    this.c[i*4]=1;this.c[i*4+1]=mix(.85,.25,t);this.c[i*4+2]=mix(.4,.02,t);}
  }
  this.count=n;this.g.instanceCount=n;
  for(const a of ['ip','ic','is']){const at=this.g.attributes[a];at.needsUpdate=true;at.addUpdateRange?.(0,n*at.itemSize);}
 }
}
export class FX{
 constructor(scene,terrain){
  this.scene=scene;this.t=terrain;const tex=atlas();
  this.soft=new Pool(scene,tex,7000,false);this.add=new Pool(scene,tex,3000,true);
  this.wind=[1.2,.5];this.rainOn=0;
  // tyre-track canvas: 512 px over 256 m, recentred as the Spider moves
  this.trackC=document.createElement('canvas');this.trackC.width=this.trackC.height=512;this.tg=this.trackC.getContext('2d');this.tg.fillStyle='#000';this.tg.fillRect(0,0,512,512);
  this.trackT=new T.CanvasTexture(this.trackC);this.trackT.colorSpace=T.NoColorSpace;this.trackT.magFilter=T.LinearFilter;shared.uTrack.value=this.trackT;shared.uTrackOn.value=1;this.tc={x:0,z:0};this.trackDirty=0;
 }
 // ---- emitters
 dust(x,y,z,amount,col=[.55,.48,.38]){const n=Math.ceil(amount*3);for(let k=0;k<n;k++)this.soft.spawn(x+(Math.random()-.5),y+.2,z+(Math.random()-.5),(Math.random()-.5)*2,.6+Math.random()*1.2,(Math.random()-.5)*2,2.5+Math.random()*2.5,1.2,5+Math.random()*4,col[0],col[1],col[2],.22*Math.min(1,amount),1);}
 mud(x,y,z,vx,vz,amount){for(let k=0;k<amount;k++)this.soft.spawn(x,y+.3,z,vx*.3+(Math.random()-.5)*3,2+Math.random()*3,vz*.3+(Math.random()-.5)*3,1+Math.random(),.12,.2,.2,.15,.1,.95,2);}
 splash(x,y,z,vx,vz,amount){for(let k=0;k<amount;k++)this.soft.spawn(x+(Math.random()-.5)*.6,y,z+(Math.random()-.5)*.6,vx*.4+(Math.random()-.5)*2.5,2+Math.random()*3.5,vz*.4+(Math.random()-.5)*2.5,.8+Math.random()*.7,.3,1.4,.85,.9,.92,.55,3);}
 spray(x,y,z,dx,dy,dz,speed){for(let k=0;k<5;k++){const j=.06;this.soft.spawn(x,y,z,(dx+(Math.random()-.5)*j)*speed,(dy+(Math.random()-.5)*j)*speed,(dz+(Math.random()-.5)*j)*speed,1.8+Math.random()*.6,.25,2.2,.86,.92,.96,.5,3);}}
 exhaust(x,y,z,load){if(Math.random()>.35+load*.6)return;this.soft.spawn(x,y,z,(Math.random()-.5)*.4,1.8+load*2,(Math.random()-.5)*.4,1.2+load,.3,1.6+load*2,.18,.17,.16,.14+load*.2,4);}
 smoke(x,y,z,s=1,dark=.3){this.soft.spawn(x+(Math.random()-.5)*4*s,y,z+(Math.random()-.5)*4*s,(Math.random()-.5),3+Math.random()*3,(Math.random()-.5),9+Math.random()*7,3*s,24*s,mix(.5,.18,dark),mix(.46,.16,dark),mix(.42,.15,dark),.34,6);}
 flame(x,y,z,s=1){for(let k=0;k<2;k++)this.add.spawn(x+(Math.random()-.5)*4*s,y+Math.random()*.6+k*1.2*s,z+(Math.random()-.5)*4*s,(Math.random()-.5)*.6,2.2+Math.random()*3,(Math.random()-.5)*.6,.7+Math.random()*.7,2.6*s,.7*s,1,.7,.3,.85,5,3,(Math.random()-.5)*2);}
 ember(x,y,z){this.add.spawn(x,y,z,(Math.random()-.5)*3+this.wind[0],3+Math.random()*4,(Math.random()-.5)*3+this.wind[1],2+Math.random()*2,.12,.05,1,.55,.15,1,6);}
 leaves(x,y,z,n=12){for(let k=0;k<n;k++){const g=Math.random();this.soft.spawn(x+(Math.random()-.5)*3,y+(Math.random()-.5)*2,z+(Math.random()-.5)*3,(Math.random()-.5)*3,Math.random()*2,(Math.random()-.5)*3,3+Math.random()*3,.18,.16,mix(.25,.55,g),mix(.45,.35,g),.12,1,7,1,(Math.random()-.5)*8);}}
 blast(x,y,z){for(let k=0;k<40;k++)this.soft.spawn(x,y+.5,z,(Math.random()-.5)*14,4+Math.random()*12,(Math.random()-.5)*14,2+Math.random()*3,1.5,9,.35,.3,.25,.6,1);
  for(let k=0;k<30;k++)this.soft.spawn(x,y+.5,z,(Math.random()-.5)*24,8+Math.random()*16,(Math.random()-.5)*24,1.5+Math.random(),.25,.3,.15,.12,.1,1,2);
  for(let k=0;k<14;k++)this.add.spawn(x,y+1,z,(Math.random()-.5)*6,Math.random()*6,(Math.random()-.5)*6,.25+Math.random()*.3,4,10,1,.8,.4,1,5,3);}
 // ---- per frame: rain around the camera, tyre tracks, wind
 update(dt,cam,G){
  const w=this.wind;
  if(this.rainOn>0){const n=Math.floor(this.rainOn*140*dt*60/60*3);for(let k=0;k<n;k++){const x=cam.position.x+(Math.random()-.5)*40,z=cam.position.z+(Math.random()-.5)*40;this.soft.spawn(x,cam.position.y+10+Math.random()*6,z,w[0]*.6,-14,w[1]*.6,1.4,.9,.9,.75,.8,.85,.35,8,2);}}
  const sp=G.spider;
  if(sp&&G.state==='drive'){
   const speed=sp.speed();
   // wheels: dust, mud, splash, tracks
   for(const wh of sp.wheels){if(!wh.contact&&!wh.water)continue;const s=wh.surface||{};const slipV=Math.abs(wh.slip)*speed+speed*.25;
    if(wh.water>.2){if(speed>.8&&Math.random()<.6)this.splash(wh.cp[0],wh.hub[1]-1.35+wh.water,wh.cp[2],sp.vel[0],sp.vel[2],Math.ceil(speed*.8));}
    else if(s.dust>0&&speed>1.5&&Math.random()<s.dust*.35*(1-(G.atmo?.weather==='rain'?.8:0)))this.dust(wh.cp[0],wh.cp[1],wh.cp[2],Math.min(1.2,slipV*.1*s.dust),s.color?[s.color[0]*1.1+.1,s.color[1]*1.1+.08,s.color[2]*1.1+.06]:undefined);
    if(s.soft>.7&&speed>1&&Math.random()<.25)this.mud(wh.cp[0],wh.cp[1],wh.cp[2],sp.vel[0],sp.vel[2],2);
    if(wh.contact&&(s.soft>.2||s.name==='Cropland')&&speed>.3)this.track(wh.cp[0],wh.cp[2],s.soft);}
   // brushing through canopies sheds leaves over the cabin
   if(sp.brush>.12&&speed>.8&&Math.random()<Math.min(1,sp.brush)){const R=G.model.cabin;const p=R.localToWorld(new T.Vector3((Math.random()-.5)*3,5.4,(Math.random()-.5)*9));this.leaves(p.x,p.y,p.z,3);}
   // exhaust
   if(G.model&&!sp.engine.stalled){const R=G.model.root;for(const e of G.model.exhausts){const p=R.localToWorld(e.clone());this.exhaust(p.x,p.y,p.z,sp.engine.load);}}
  }
  this.soft.update(dt,w);this.add.update(dt,w);
  const fog=G.scene?.fog;for(const p of [this.soft,this.add]){p.mesh.material.uniforms.uFogColor.value.copy(fog?fog.color:new T.Color());p.mesh.material.uniforms.uFogDensity.value=fog?fog.density:0;}
  if(this.trackDirty>0){this.trackT.needsUpdate=true;this.trackDirty=0;}
  if(sp){const dx=sp.pos[0]-this.tc.x,dz=sp.pos[2]-this.tc.z;if(Math.abs(dx)>64||Math.abs(dz)>64){const sx=Math.round(dx/64)*64,sz=Math.round(dz/64)*64;this.tg.globalCompositeOperation='copy';this.tg.drawImage(this.trackC,-sx*2,-sz*2);this.tg.globalCompositeOperation='source-over';this.tg.fillStyle='#000';if(sx>0)this.tg.fillRect(512-sx*2,0,sx*2,512);if(sx<0)this.tg.fillRect(0,0,-sx*2,512);if(sz>0)this.tg.fillRect(0,512-sz*2,512,sz*2);if(sz<0)this.tg.fillRect(0,0,512,-sz*2);this.tc.x+=sx;this.tc.z+=sz;this.trackDirty=1;}
   shared.uTrackRect.value.set(this.tc.x-128,this.tc.z-128,256,256);}
 }
 track(x,z,soft){const px=(x-this.tc.x+128)*2,pz=(z-this.tc.z+128)*2;if(px<0||pz<0||px>512||pz>512)return;this.tg.fillStyle=`rgba(255,255,255,${.05+soft*.1})`;this.tg.beginPath();this.tg.arc(px,pz,.9,0,Math.PI*2);this.tg.fill();this.trackDirty=1;}
}
