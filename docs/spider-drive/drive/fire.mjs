// Wildfire cellular model on a 256 x 256 grid of 8 m cells. Fuel from the biome grids, spread
// driven by wind, slope and moisture, ember spotting from crown fires, knock-down by water.
import * as T from 'three';
import {shared} from './materials.mjs';
import {clamp,mix,rng} from './noise.mjs';
const N=256,C=8;
export class Fire{
 constructor(terrain,cx,cz,{wind=[1,0],windSpeed=6,seed=1}={}){
  this.t=terrain;this.x0=cx-N*C/2;this.z0=cz-N*C/2;this.wind=wind;this.ws=windSpeed;this.r=rng(seed);
  const M=N*N;this.fuel=new Float32Array(M);this.moist=new Float32Array(M);this.h=new Float32Array(M);this.kind=new Uint8Array(M);
  this.state=new Uint8Array(M);this.prog=new Float32Array(M);this.burnT=new Float32Array(M);this.I=new Float32Array(M);this.char=new Float32Array(M);this.wet=new Float32Array(M);
  const wt={};
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i,x=this.x0+(i+.5)*C,z=this.z0+(j+.5)*C;
   this.h[k]=terrain.base(x,z);if(!terrain.inside(x,z)){this.fuel[k]=0;continue;}
   terrain.weights(x,z,wt);let f=0,kind=0;
   const water=terrain.water(x,z,{});if(water.kind&&water.depth>.1){this.fuel[k]=0;continue;}
   const r=terrain.roadNear(x,z);if(r&&r.d<1){this.fuel[k]=0;continue;}
   if(wt.farm>.5){const fl=terrain.field(x,z);f=[.72,.66,.5,.08][fl.crop];kind=1;}
   else{f=Math.max(wt.forest*1.0,wt.scrub*.92,(1-wt.rock)*(1-wt.snow)*.55*(1-wt.desert*.7));kind=wt.forest>.45?3:wt.scrub>.4?2:1;}
   f*=(1-wt.rock)*(1-wt.snow)*(1-wt.marsh*.8);
   this.fuel[k]=clamp(f,0,1);this.kind[k]=kind;this.moist[k]=clamp(wt.moisture*.45+wt.marsh*.5,0,.95);}
  this.active=[];this.tex=new T.DataTexture(new Uint8Array(M*4),N,N);this.tex.magFilter=T.LinearFilter;this.tex.minFilter=T.LinearFilter;this.tex.needsUpdate=true;
  shared.uBurn.value=this.tex;shared.uBurnRect.value.set(this.x0,this.z0,N*C,N*C);shared.uBurnOn.value=1;
  this.burnedArea=0;this.saved=0;this.t0=0;
 }
 dispose(){shared.uBurnOn.value=0;}
 idx(x,z){const i=Math.floor((x-this.x0)/C),j=Math.floor((z-this.z0)/C);if(i<0||j<0||i>=N||j>=N)return -1;return j*N+i;}
 cellXZ(k){return [this.x0+(k%N+.5)*C,this.z0+((k/N|0)+.5)*C];}
 ignite(x,z,r=12){const c=this.idx(x,z);if(c<0)return;const R=Math.ceil(r/C),ci=c%N,cj=(c/N)|0;for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){if(i*i+j*j>R*R)continue;const k=(cj+j)*N+ci+i;if(k<0||k>=N*N)continue;if(this.fuel[k]>.05&&this.state[k]===0)this.light(k);}}
 light(k){this.state[k]=1;this.I[k]=.2;const kind=this.kind[k];this.burnT[k]=(kind===3?85:kind===2?45:kind===1?22:25)*(.7+this.r()*.6);this.active.push(k);}
 // overlay for terrain surfaces: {burn, wet}
 at(x,z){const k=this.idx(x,z);if(k<0)return null;return {burn:this.state[k]===2?1:this.state[k]===1?.6:0,wet:this.wet[k],burning:this.state[k]===1?this.I[k]:0};}
 step(dt){
  this.t0+=dt;const wx=this.wind[0],wz=this.wind[1],ws=this.ws;const next=[];
  const R0=.16,cw=.42;
  for(const k of this.active){
   if(this.state[k]!==1)continue;
   this.burnT[k]-=dt;const kind=this.kind[k];
   // intensity ramps up, then decays at the end of the burn
   this.I[k]=clamp(this.I[k]+dt*.35,0,1)*(this.burnT[k]<8?this.burnT[k]/8:1);
   if(this.burnT[k]<=0){this.state[k]=2;this.char[k]=1;this.I[k]=0;this.burnedArea+=C*C;continue;}
   next.push(k);
   const i=k%N,j=(k/N)|0;
   for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ni=i+di,nj=j+dj;if(ni<0||nj<0||ni>=N||nj>=N)continue;const n=nj*N+ni;if(this.state[n]!==0||this.fuel[n]<.03)continue;
    const d=Math.hypot(di,dj),cos=(di*wx+dj*wz)/d,up=(this.h[n]-this.h[k])/(d*C);
    const rate=R0*this.fuel[n]*(1+cw*ws*Math.pow(Math.max(0,cos),1.5))*Math.exp(3.2*clamp(up,-.4,.6))*(1-this.moist[n])*(1-this.wet[n])/d*this.I[k]*(this.kind[n]===3?.55:1);
    this.prog[n]+=rate*dt;if(this.prog[n]>=1){this.light(n);next.push(n);}}
   // ember spotting from crown fires
   if(kind===3&&this.I[k]>.8&&this.r()<.0025*dt*4){const dist=60+this.r()*260,lat=(this.r()-.5)*.5;const [x,z]=this.cellXZ(k);this.ignite(x+(wx+wz*lat)*dist,z+(wz-wx*lat)*dist,6);}
  }
  // new ignitions were pushed by light(); dedupe active list
  const set=new Set(next);for(const k of this.active)if(this.state[k]===1)set.add(k);this.active=[...set];
  // wet cells slowly dry
  this.upload();
 }
 upload(){const d=this.tex.image.data;for(let k=0;k<N*N;k++){const o=k*4;d[o]=this.state[k]===1?Math.round(this.I[k]*255):0;d[o+1]=Math.round(clamp(this.char[k]+(this.state[k]===1?.35:0),0,1)*255);d[o+2]=Math.round(this.wet[k]*255);d[o+3]=255;}this.tex.needsUpdate=true;}
 // knock down cells in a cone from the monitor nozzle
 douse(x,z,dx,dz,range=46,half=.2){let hit=0;const i0=Math.floor((x-range-this.x0)/C),i1=Math.floor((x+range-this.x0)/C),j0=Math.floor((z-range-this.z0)/C),j1=Math.floor((z+range-this.z0)/C);
  for(let j=Math.max(0,j0);j<=Math.min(N-1,j1);j++)for(let i=Math.max(0,i0);i<=Math.min(N-1,i1);i++){const k=j*N+i,[cx,cz]=this.cellXZ(k),vx=cx-x,vz=cz-z,d=Math.hypot(vx,vz);if(d>range||d<3)continue;const cos=(vx*dx+vz*dz)/d;if(cos<Math.cos(half))continue;
   this.wet[k]=Math.min(1,this.wet[k]+.35);this.moist[k]=Math.max(this.moist[k],.9);if(this.state[k]===1){this.I[k]-=.5;if(this.I[k]<=0){this.state[k]=2;this.char[k]=.7;hit++;}}}
  return hit;}
 burningNear(x,z,r){let s=0,nearest=1e9;const R=Math.ceil(r/C),c=this.idx(x,z);if(c<0)return {heat:0,nearest};const ci=c%N,cj=(c/N)|0;for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){const ni=ci+i,nj=cj+j;if(ni<0||nj<0||ni>=N||nj>=N)continue;const k=nj*N+ni;if(this.state[k]!==1)continue;const d=Math.hypot(i,j)*C;nearest=Math.min(nearest,d);s+=this.I[k]/(1+d*d/40);}return {heat:s,nearest};}
 // arrival estimate of the front at (x,z): distance to the nearest burning cell over a typical spread rate
 eta(x,z){let best=1e9;for(const k of this.active){if(this.state[k]!==1)continue;const [cx,cz]=this.cellXZ(k);const d=Math.hypot(cx-x,cz-z);if(d<best)best=d;}return {dist:best,eta:best/Math.max(.4,.45*(1+.42*this.ws*.5))};}
 sampleBurning(n){const out=[];const A=this.active;if(!A.length)return out;for(let q=0;q<n;q++){const k=A[Math.floor(this.r()*A.length)];if(this.state[k]===1)out.push(k);}return out;}
}
