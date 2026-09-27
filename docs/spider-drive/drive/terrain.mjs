// Runtime terrain queries over the generated world: render height, physics ground,
// surfaces, water, biome weights, fields and feature labels. Pure JS (Node-testable).
import {Noise,hash2,clamp,mix,smooth,smoothstep} from './noise.mjs';
import {bicubic,bilinear} from './worldgen.mjs';

export const SURFACES={
 asphalt:{name:'Asphalt',mu:.95,slide:.8,roll:.012,soft:0,dust:.05,color:[.25,.25,.24]},
 gravel:{name:'Gravel',mu:.74,slide:.6,roll:.024,soft:.1,dust:.7,color:[.55,.5,.43]},
 dirt:{name:'Dirt track',mu:.7,slide:.56,roll:.03,soft:.25,dust:1,color:[.47,.37,.26]},
 grass:{name:'Grass',mu:.62,slide:.46,roll:.04,soft:.3,dust:.25,color:[.4,.5,.25]},
 crop:{name:'Cropland',mu:.6,slide:.45,roll:.05,soft:.45,dust:.6,color:[.45,.4,.25]},
 mud:{name:'Mud',mu:.4,slide:.3,roll:.11,soft:1,dust:0,color:[.3,.24,.17]},
 sand:{name:'Sand',mu:.56,slide:.46,roll:.1,soft:.8,dust:1.2,color:[.76,.66,.48]},
 rock:{name:'Rock',mu:.82,slide:.66,roll:.018,soft:0,dust:.2,color:[.5,.48,.45]},
 snow:{name:'Snow',mu:.42,slide:.3,roll:.06,soft:.6,dust:0,color:[.9,.92,.95]},
 riverbed:{name:'Riverbed',mu:.5,slide:.4,roll:.07,soft:.55,dust:0,color:[.4,.37,.3]},
 ash:{name:'Ash',mu:.55,slide:.44,roll:.045,soft:.35,dust:1.4,color:[.16,.15,.14]},
};
const smin=(a,b,k)=>{const q=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-q*q*k*.25;};
const BIOME_LABEL=['Snowfield','Alpine tundra','Cliffs and bare rock','Scree slopes','Conifer forest','Mixed forest','Broadleaf woods','Riverside woods','Marsh','Meadow','Farmland','Scrub hills','Badlands','Lake'];
export const CROPS=['corn','wheat','pasture','fallow'];

export class Terrain{
 constructor(world){
  this.w=world;const {N,cell,half}=world;this.N=N;this.cell=cell;this.half=half;
  this.noise=new Noise(world.seed+303);this.n2=new Noise(world.seed+404);
  this.overlay=null;// optional function(x,z)->{burn:0..1,wet:0..1} set by missions
  this.floodBoost=0;// swiftwater flood level offset for rivers
  this.bridgeRemoved=new Set();// washed-out bridges (road.id:index)
  this._buildChannelIndex();this._buildRoadIndex();
  this.tiles=new Map();this.tileOrder=[];this.maxTiles=160;
  this.extraFeatures=[];// physics-only boulders/logs registered by vegetation
 }
 // ---------------------------------------------------------------- indices
 _buildChannelIndex(){
  const B=64,half=this.half,G=Math.ceil((this.half*2+2400)/B);this.cB=B;this.cG=G;this.cOff=this.half+1200;
  const buckets=new Map();const segs=[];// segment: channel, k
  for(const c of this.w.channels){
   const pad=c.cls===3?55:c.cls===2?32:c.cls===1?22:14;
   for(let k=0;k<c.n-1;k++){
    const o=k*8,x0=c.P[o],z0=c.P[o+1],x1=c.P[o+8],z1=c.P[o+9],w=Math.max(c.P[o+3],c.P[o+11]),r=w*.5+pad;
    const id=segs.length/2;segs.push(c.i,k);
    const bx0=Math.floor((Math.min(x0,x1)-r+this.cOff)/B),bx1=Math.floor((Math.max(x0,x1)+r+this.cOff)/B),bz0=Math.floor((Math.min(z0,z1)-r+this.cOff)/B),bz1=Math.floor((Math.max(z0,z1)+r+this.cOff)/B);
    for(let bz=bz0;bz<=bz1;bz++)for(let bx=bx0;bx<=bx1;bx++){const key=bz*G+bx;let a=buckets.get(key);if(!a)buckets.set(key,a=[]);a.push(id);}
   }
  }
  this.segs=Int32Array.from(segs);this.cBuckets=buckets;
 }
 _buildRoadIndex(){
  const B=64,G=Math.ceil((this.half*2+2400)/B);this.rB=B;this.rG=G;
  const buckets=new Map(),segs=[];
  for(const r of this.w.roads){
   const pad=r.width*.5+9;
   for(let k=0;k<r.n-1;k++){
    const x0=r.xz[k*2],z0=r.xz[k*2+1],x1=r.xz[k*2+2],z1=r.xz[k*2+3];const id=segs.length/2;segs.push(r.id,k);
    const bx0=Math.floor((Math.min(x0,x1)-pad+this.cOff)/B),bx1=Math.floor((Math.max(x0,x1)+pad+this.cOff)/B),bz0=Math.floor((Math.min(z0,z1)-pad+this.cOff)/B),bz1=Math.floor((Math.max(z0,z1)+pad+this.cOff)/B);
    for(let bz=bz0;bz<=bz1;bz++)for(let bx=bx0;bx<=bx1;bx++){const key=bz*G+bx;let a=buckets.get(key);if(!a)buckets.set(key,a=[]);a.push(id);}
   }
   // mark bridge sample ranges
   r.onBridge=new Int16Array(r.n).fill(-1);r.bridges.forEach((b,bi)=>{for(let q=b.s0;q<=b.s1;q++)r.onBridge[q]=bi;});
  }
  this.rsegs=Int32Array.from(segs);this.rBuckets=buckets;
 }
 // ---------------------------------------------------------------- grids
 gx(x){return (x+this.half)/this.cell-.5;}
 grid(name,x,z){const g=this.w.grids[name];const v=bilinear(g,this.N,this.gx(x),this.gx(z));return g instanceof Uint8Array?v/255:v;}
 inside(x,z,m=0){return Math.abs(x)<this.half-m&&Math.abs(z)<this.half-m;}
 // base height: bicubic world grid, rising into distant ranges outside the map
 base(x,z){
  const h=bicubic(this.w.height,this.N,this.gx(x),this.gx(z));
  const ox=Math.max(0,Math.abs(x)-this.half+30),oz=Math.max(0,Math.abs(z)-this.half+30),out=Math.hypot(ox,oz);
  if(out<=0)return h;
  // keep the trunk river valley open where it enters and leaves
  let open=1;for(const p of this._riverGates()){const dx=x-p[0],dz=z-p[1],t=dx*p[2]+dz*p[3];if(t>0){const lat=Math.abs(-dx*p[3]+dz*p[2]);open=Math.min(open,smoothstep(120+t*.18,520+t*.4,lat));}}
  const ridge=this.noise.ridged(x/2200,z/2200,5)*1;const rise=smoothstep(0,2600,out)*(260+900*ridge)*open+out*.03*open;
  return h+rise;
 }
 _riverGates(){
  if(this._gates)return this._gates;const g=[];
  for(const c of this.w.channels){if(c.cls<3)continue;const n=c.n;for(const [a,b] of [[0,1],[n-1,n-2]]){const x=c.P[a*8],z=c.P[a*8+1];if(Math.abs(x)<this.half-40&&Math.abs(z)<this.half-40)continue;const dx=x-c.P[b*8],dz=z-c.P[b*8+1],l=Math.hypot(dx,dz)||1;g.push([x,z,dx/l,dz/l]);}}
  return this._gates=g;
 }
 // ---------------------------------------------------------------- channels
 channelsNear(x,z,out){
  out.length=0;const key=Math.floor((z+this.cOff)/this.cB)*this.cG+Math.floor((x+this.cOff)/this.cB);const a=this.cBuckets.get(key);if(!a)return out;
  const segs=this.segs,chs=this.w.channels;
  for(let q=0;q<a.length;q++){const s=a[q],c=chs[segs[s*2]],k=segs[s*2+1],o=k*8,P=c.P;
   const x0=P[o],z0=P[o+1],dx=P[o+8]-x0,dz=P[o+9]-z0,L2=dx*dx+dz*dz||1;let t=((x-x0)*dx+(z-z0)*dz)/L2;t=t<0?0:t>1?1:t;
   const px=x0+dx*t,pz=z0+dz*t,d=Math.hypot(x-px,z-pz);
   // keep the nearest segment per channel
   let found=-1;for(let j=0;j<out.length;j++)if(out[j].c===c){found=j;break;}
   if(found>=0&&out[found].d<=d)continue;
   const rec={c,k,t,d,level:P[o+2]+(P[o+10]-P[o+2])*t,w:P[o+3]+(P[o+11]-P[o+3])*t,dep:P[o+4]+(P[o+12]-P[o+4])*t,speed:P[o+6]+(P[o+14]-P[o+6])*t,fx:dx/Math.sqrt(L2),fz:dz/Math.sqrt(L2),
    side:Math.sign((x-px)*-dz+(z-pz)*dx)};
   if(found>=0)out[found]=rec;else out.push(rec);
  }
  return out;
 }
 // ---------------------------------------------------------------- roads
 roadNear(x,z){
  const key=Math.floor((z+this.cOff)/this.rB)*this.rG+Math.floor((x+this.cOff)/this.rB);const a=this.rBuckets.get(key);if(!a)return null;
  let best=null,bd=1e9;const segs=this.rsegs,roads=this.w.roads;
  for(let q=0;q<a.length;q++){const s=a[q],r=roads[segs[s*2]],k=segs[s*2+1];const x0=r.xz[k*2],z0=r.xz[k*2+1],dx=r.xz[k*2+2]-x0,dz=r.xz[k*2+3]-z0,L2=dx*dx+dz*dz||1;let t=((x-x0)*dx+(z-z0)*dz)/L2;t=t<0?0:t>1?1:t;
   const d=Math.hypot(x-x0-dx*t,z-z0-dz*t)-r.width*.5;if(d<bd){bd=d;best={r,k,t,d,y:r.y[k]+(r.y[k+1]-r.y[k])*t,dx:dx/Math.sqrt(L2),dz:dz/Math.sqrt(L2),signed:Math.sign((x-x0)*-dz+(z-z0)*dx)*(d+r.width*.5)};}}
  return best;
 }
 bridgeAt(road,k){const bi=road.onBridge[k];if(bi<0)return null;if(this.bridgeRemoved.has(road.id+':'+bi))return null;return road.bridges[bi];}
 // ---------------------------------------------------------------- height
 terraceParams(x,z){
  const dry=this.grid('dry',x,z),hard=this.grid('hard',x,z),sl=this.grid('slope',x,z);
  const w=smoothstep(.25,.55,dry)*smoothstep(.08,.22,sl)+smoothstep(.62,.8,hard)*smoothstep(.35,.7,sl)*.8;
  const cliffy=smoothstep(.45,.75,this.n2.fbm(x/520,z/520,2)*.5+.5+hard*.3);
  return {w:clamp(w,0,1),H:mix(1.6,11,cliffy)};
 }
 height(x,z,info){
  let h=this.base(x,z);
  const inside=this.inside(x,z);
  const rock=inside?this.grid('rock',x,z):.6,farm=inside?this.grid('farm',x,z):0;
  const rough=mix(.45,1.25,rock)*(1-farm*.75);
  const n=this.noise;
  h+=(n.fbm(x/64,z/64,2)*1.4+n.simplex(x/16,z/16)*.38+n.simplex(x/4.3,z/4.3)*.07)*rough;
  // strata terraces in mesa country and hard-rock bands
  if(inside){const tp=this.terraceParams(x,z);if(tp.w>.02){const H=tp.H,s=(h+n.simplex(x/90,z/90)*H*.25)/H,f=s-Math.floor(s),riser=H>5?.22:.4;const tt=f<1-riser?0:(f-(1-riser))/riser;const ht=(Math.floor(s)+smooth(tt))*H;h=mix(h,ht,tp.w);if(info){info.terrace=tp.w;info.riser=H;}}}
  // town pads
  if(inside)for(const t of this.w.towns){const d=Math.hypot(x-t.x,z-t.z);if(d<t.r+70)h=mix(t.y,h,smoothstep(t.r-50,t.r+70,d));}
  // channel carving
  if(inside||Math.abs(x)<this.half+600&&Math.abs(z)<this.half+600){
   const near=this.channelsNear(x,z,this._cn||(this._cn=[]));
   // floodplain: keep banks just above water
   for(const c of near){if(c.c.cls===0)continue;const L=c.level,hw=c.w*.5;if(c.d>hw+1&&c.d<hw+c.w*1.2+14){const fp=L+.3+(c.d-hw)*.015;const wgt=1-smoothstep(hw+c.w*.6+6,hw+c.w*1.2+14,c.d);if(h<fp)h=mix(h,fp,wgt*.85);}}
   for(const c of near){
    const hw=c.w*.5,cls=c.c.cls;let prof;
    if(cls===0){const dep=c.dep*.8,bed=c.level-dep,fb=Math.max(1.6,c.w*.3),sw=Math.min(2*dep/c.w*1.1,.55),r0=2.5,dd=Math.max(0,c.d-fb*.5);prof=bed+(dd<r0?dd*dd/(2*r0)*sw:(dd-r0*.5)*sw);}
    else{const L=c.level;prof=c.d<hw?L-c.dep*(1-(c.d/hw)**2):L+.12+(c.d-hw)*(cls===3?.22:cls===2?.35:.55);}
    h=smin(h,prof,cls===0?.8:1.4);
    if(info&&c.d<hw+2&&(!info.channel||c.c.cls>info.channel.c.cls))info.channel=c;
   }
  }
  // roads: cut and fill
  const r=this.roadNear(x,z);
  if(r&&r.d<7){const br=this.bridgeAt(r.r,r.k)||this.bridgeAt(r.r,Math.min(r.r.n-1,r.k+1));
   if(!br){const wgt=1-smoothstep(0,6.5,r.d);const top=r.y+(r.r.kind==='main'?.18:.08)*(r.d<0?1:0);h=mix(h,top,wgt);}
   if(info){info.road=r;info.bridge=br;}}
  return h;
 }
 // physics ground: render height plus bridge decks
 groundHeight(x,z,yHint=1e9){
  const h=this.tileHeight(x,z);
  const r=this.roadNear(x,z);
  if(r&&r.d<.6){const br=this.bridgeAt(r.r,r.k);if(br){const deck=r.y+.35;if(yHint>deck-1.2&&deck>h)return deck;}}
  return h;
 }
 // ---------------------------------------------------------------- 1 m tile cache
 tile(tx,tz){
  const key=tx*100003+tz;let t=this.tiles.get(key);if(t){t.used=this.frame||0;return t;}
  const S=65,a=new Float32Array(S*S),x0=tx*64,z0=tz*64;for(let j=0;j<S;j++)for(let i=0;i<S;i++)a[j*S+i]=this.height(x0+i,z0+j);
  t={a,used:this.frame||0,tx,tz};this.tiles.set(key,t);
  if(this.tiles.size>this.maxTiles){let old=null;for(const [k,v] of this.tiles)if(!old||v.used<old[1].used)old=[k,v];this.tiles.delete(old[0]);}
  return t;
 }
 hasTile(x,z){return this.tiles.has(Math.floor(x/64)*100003+Math.floor(z/64));}
 // Same triangle split as the render mesh: quads split along the (i+1,j)-(i,j+1) diagonal.
 tileHeight(x,z){
  const tx=Math.floor(x/64),tz=Math.floor(z/64),t=this.tile(tx,tz),lx=x-tx*64,lz=z-tz*64,i=Math.min(63,Math.floor(lx)),j=Math.min(63,Math.floor(lz)),fx=lx-i,fz=lz-j,a=t.a,o=j*65+i;
  if(fx+fz<1)return a[o]+(a[o+1]-a[o])*fx+(a[o+65]-a[o])*fz;
  return a[o+66]+(a[o+65]-a[o+66])*(1-fx)+(a[o+1]-a[o+66])*(1-fz);
 }
 normal(x,z,e=1){const hx=this.tileHeight(x+e,z)-this.tileHeight(x-e,z),hz=this.tileHeight(x,z+e)-this.tileHeight(x,z-e),l=Math.hypot(hx,2*e,hz);return [-hx/l,2*e/l,-hz/l];}
 // ---------------------------------------------------------------- water
 water(x,z,out={}){
  out.level=-1e9;out.depth=0;out.fx=0;out.fz=0;out.speed=0;out.kind=null;out.name='';
  if(this.inside(x,z)){const i=Math.floor((z+this.half)/this.cell)*this.N+Math.floor((x+this.half)/this.cell),lk=this.w.lakeId[i];
   if(lk>=0){const L=this.w.lakes[lk];out.level=L.level;out.kind='lake';out.name=L.name;}}
  const near=this.channelsNear(x,z,this._wn||(this._wn=[]));
  for(const c of near){if(c.c.cls===0||c.d>c.w*.5+1.5)continue;const L=c.level+this.floodBoost*(c.c.cls>=2?1:.4);if(L>out.level){out.level=L;out.kind=c.c.cls===3?'river':c.c.cls===2?'stream':'creek';out.name=c.c.name;const sp=c.speed*(1+this.floodBoost*.45);out.speed=sp;out.fx=c.fx*sp;out.fz=c.fz*sp;out.w=c.w;}}
  if(out.kind){out.depth=Math.max(0,out.level-this.tileHeight(x,z));}
  return out;
 }
 // ---------------------------------------------------------------- fields
 field(x,z){
  const B=480,bi=Math.floor(x/B),bj=Math.floor(z/B),seed=this.w.seed;
  const ang=(hash2(bi,bj,seed+5)<.5?0:Math.PI/2)+(hash2(bi,bj,seed+6)-.5)*.5;
  const ca=Math.cos(ang),sa=Math.sin(ang),lx=x-bi*B,lz=z-bj*B,u=lx*ca+lz*sa,v=-lx*sa+lz*ca;
  const su=70+hash2(bi,bj,seed+7)*70,sv=150+hash2(bi,bj,seed+8)*140;
  const iu=Math.floor(u/su),iv=Math.floor(v/sv),fu=u-iu*su,fv=v-iv*sv;
  const id=hash2(bi*97+iu,bj*89+iv,seed+9),r=hash2(bi*31+iu,bj*37+iv,seed+10);
  const crop=r<.46?0:r<.7?1:r<.88?2:3;
  const edge=Math.min(fu,su-fu,fv,sv-fv);// metres from the field boundary
  const blockEdge=Math.min(lx,B-lx,lz,B-lz);
  return {crop,cropName:CROPS[crop],angle:ang,rowAngle:hash2(bi*5+iu,bj*3+iv,seed+11)<.2?ang+Math.PI/2:ang,edge,blockEdge,id,u,v};
 }
 // ---------------------------------------------------------------- biome and surface
 weights(x,z,out={}){
  if(!this.inside(x,z)){out.forest=.2;out.farm=0;out.rock=.7;out.snow=0;out.marsh=0;out.scrub=.2;out.desert=0;out.moisture=.4;out.temperature=.4;out.dry=0;return out;}
  for(const k of ['forest','farm','rock','snow','marsh','scrub','desert','moisture','temperature','dry'])out[k]=this.grid(k,x,z);
  return out;
 }
 surface(x,z,wt){
  const r=this.roadNear(x,z);
  if(r&&r.d<.4){if(this.bridgeAt(r.r,r.k))return SURFACES.asphalt;return r.r.kind==='main'?SURFACES.asphalt:r.r.kind==='minor'?SURFACES.gravel:SURFACES.dirt;}
  const o=this.overlay?this.overlay(x,z):null;if(o&&o.burn>.5)return SURFACES.ash;
  const w=wt||this.weights(x,z,this._sw||(this._sw={}));
  const near=this.channelsNear(x,z,this._sn||(this._sn=[]));for(const c of near){if(c.c.cls>0&&c.d<c.w*.5+.5)return SURFACES.riverbed;if(c.c.cls===0&&c.d<c.w*.35)return SURFACES.dirt;if(c.c.cls>0&&c.d<c.w*.5+4)return (o&&o.wet>.5)||this.floodBoost>0?SURFACES.mud:SURFACES.sand;}
  if(w.snow>.5)return SURFACES.snow;
  const sl=this.grid('slope',x,z);if(w.rock>.5||sl>.9)return SURFACES.rock;
  if(w.marsh>.45)return SURFACES.mud;
  if(w.desert>.55)return SURFACES.sand;
  if(w.farm>.5){const f=this.field(x,z);return f.crop===3?SURFACES.dirt:SURFACES.crop;}
  if(o&&o.wet>.6)return SURFACES.mud;
  return SURFACES.grass;
 }
 biomeLabel(x,z){if(!this.inside(x,z))return 'Beyond the operations area';const i=Math.floor((z+this.half)/this.cell)*this.N+Math.floor((x+this.half)/this.cell);return BIOME_LABEL[this.w.biome[i]];}
 feature(x,z){
  for(const t of this.w.towns)if(Math.hypot(x-t.x,z-t.z)<t.r)return {type:'town',label:t.name};
  for(const s of this.w.sites)if(Math.hypot(x-s.x,z-s.z)<60)return {type:'site',label:s.name};
  const r=this.roadNear(x,z);
  if(r&&r.d<1.5){const br=this.bridgeAt(r.r,r.k);if(br)return {type:'bridge',label:`${br.name} bridge`};if(r.r.bridges.some((b,bi)=>this.bridgeRemoved.has(r.r.id+':'+bi)&&r.k>=b.s0-2&&r.k<=b.s1+2))return {type:'washout',label:'Washed-out bridge'};return {type:'road',label:r.r.name};}
  const wtr=this.water(x,z,this._fw||(this._fw={}));
  if(wtr.kind&&wtr.depth>.05)return {type:'water',label:wtr.kind==='lake'?wtr.name:`${wtr.name||'Creek'} ${wtr.depth>1.2?'crossing':'ford'}`};
  const near=this.channelsNear(x,z,this._fn||(this._fn=[]));
  for(const c of near){if(c.c.cls===0&&c.d<c.w)return {type:'gully',label:'Dry gully'};if(c.c.cls>0&&c.d<c.w*.5+40)return {type:'bank',label:`${c.c.name||'Creek'} banks`};}
  if(!this.inside(x,z,0))return {type:'edge',label:'Edge of operations area'};
  const tp=this.terraceParams(x,z);if(tp.w>.35)return {type:'cliff',label:tp.H>5?'Cliff band':'Rock ledges'};
  const b=this.biomeLabel(x,z);
  if(b==='Farmland'){const f=this.field(x,z);return {type:'farm',label:['Corn field','Wheat field','Pasture','Fallow field'][f.crop]};}
  return {type:'biome',label:b};
 }
}
