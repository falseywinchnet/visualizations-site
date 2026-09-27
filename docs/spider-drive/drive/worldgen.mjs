// Spider drive world generator. Pure JS (runs in a module worker and in Node tests).
// A 6144 m square of country: macro provinces -> implicit stream-power erosion on a
// priority-flooded drainage network -> lakes -> channel network -> climate and biome
// grids -> towns, graded roads, bridges and special sites. Deterministic from a seed.
import {Noise,rng,hash2,clamp,mix,smooth,smoothstep} from './noise.mjs';

export const GENERATOR_VERSION=8;
export const WORLD=Object.freeze({size:6144,half:3072,N:512,cell:12,N0:256,cell0:24});

// ---------------------------------------------------------------- binary heap
class Heap{
 constructor(cap){this.k=new Float64Array(cap);this.v=new Int32Array(cap);this.n=0;}
 push(v,k){let i=this.n++;const K=this.k,V=this.v;while(i>0){const p=(i-1)>>1;if(K[p]<=k)break;K[i]=K[p];V[i]=V[p];i=p;}K[i]=k;V[i]=v;}
 pop(){const K=this.k,V=this.v,top=V[0];this.lastKey=K[0];const n=--this.n;if(n>0){const k=K[n],v=V[n];let i=0;for(;;){let c=2*i+1;if(c>=n)break;if(c+1<n&&K[c+1]<K[c])c++;if(K[c]>=k)break;K[i]=K[c];V[i]=V[c];i=c;}K[i]=k;V[i]=v;}return top;}
}
const DX=[1,-1,0,0,1,1,-1,-1],DZ=[0,0,1,-1,1,-1,1,-1],DD=[1,1,1,1,Math.SQRT2,Math.SQRT2,Math.SQRT2,Math.SQRT2];

// Priority-flood from seed cells. Fills depressions (with eps gradient if eps>0),
// writes filled heights, pop order (a valid receiver-first stack) and flood parents.
function priorityFlood(h,N,seed,eps,fill,order,parent,heap){
 const done=new Uint8Array(N*N);heap.n=0;let count=0;
 for(let i=0;i<N*N;i++)if(seed[i]){fill[i]=h[i];parent[i]=i;done[i]=1;heap.push(i,h[i]);}
 while(heap.n){
  const c=heap.pop(),fc=fill[c];order[count++]=c;const cx=c%N,cz=(c/N)|0;
  for(let d=0;d<8;d++){const x=cx+DX[d],z=cz+DZ[d];if(x<0||z<0||x>=N||z>=N)continue;const n=z*N+x;if(done[n])continue;done[n]=1;
   const f=h[n]>fc+eps*DD[d]?h[n]:fc+eps*DD[d];fill[n]=f;parent[n]=c;heap.push(n,f);}
 }
 return count;
}
// Steepest descent receivers on the filled surface (fallback: flood parent).
function receivers(fill,N,cell,seed,parent,recv,rdist){
 for(let i=0;i<N*N;i++){
  if(seed[i]){recv[i]=i;rdist[i]=cell;continue;}
  const x=i%N,z=(i/N)|0,f=fill[i];let best=-1,bs=0,bd=cell;
  for(let d=0;d<8;d++){const nx=x+DX[d],nz=z+DZ[d];if(nx<0||nz<0||nx>=N||nz>=N)continue;const n=nz*N+nx,s=(f-fill[n])/DD[d];if(s>bs){bs=s;best=n;bd=DD[d]*cell;}}
  if(best<0){best=parent[i];const px=best%N,pz=(best/N)|0;bd=Math.hypot(px-x,pz-z)*cell;}
  recv[i]=best;rdist[i]=bd;
 }
}
function accumulate(order,count,recv,base,Q){Q.set(base);for(let k=count-1;k>=0;k--){const i=order[k],r=recv[i];if(r!==i)Q[r]+=Q[i];}}

// Catmull-Rom bicubic sampling of an N x N grid in cell coordinates.
function cr(p0,p1,p2,p3,t){return p1+.5*t*(p2-p0+t*(2*p0-5*p1+4*p2-p3+t*(3*(p1-p2)+p3-p0)));}
export function bicubic(g,N,fx,fz){
 fx=clamp(fx,0,N-1.0001);fz=clamp(fz,0,N-1.0001);const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;const r=[0,0,0,0];
 for(let j=-1;j<=2;j++){const z=clamp(iz+j,0,N-1)*N;r[j+1]=cr(g[z+clamp(ix-1,0,N-1)],g[z+ix],g[z+clamp(ix+1,0,N-1)],g[z+clamp(ix+2,0,N-1)],tx);}
 return cr(r[0],r[1],r[2],r[3],tz);
}
export function bilinear(g,N,fx,fz){
 fx=clamp(fx,0,N-1.0001);fz=clamp(fz,0,N-1.0001);const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz,i=iz*N+ix;
 return mix(mix(g[i],g[i+1],tx),mix(g[i+N],g[i+N+1],tx),tz);
}
const TOWN_A=['Cedar','Willow','Stone','Aspen','Harlan','Marrow','Juniper','Bell','Tamsin','Oxbow','Larkin','Fallow','Garnet','Hollis'];
const TOWN_B=['Crossing','Hollow','Junction','Ford','Mill','Springs','Bend','Flats','Gap','Landing'];
const RIVER_NAMES=['Tallow River','Greywater','Kestrel River','Sable River','Long Water','Alder Fork','Tern River','Blackwater','Coldwater Fork','Hollin River','Mercy River','Otter Fork','Rook River','Silver Fork','Wyn River','Ashby Fork'];
const CREEK_NAMES=['Birch','Mill','Stony','Cold','Bear','Otter','Fern','Sand','Rattle','Clear','Hazel','Deer','Crane','Flint','Moss','Tanner','Wren','Sorrel'];

// ------------------------------------------------------------------ generator
export function generateWorld(seed=711,onProgress=()=>{}){
 const T0=Date.now(),timings={};let tMark=T0;const mark=n=>{const t=Date.now();timings[n]=t-tMark;tMark=t;};
 const {half,N,cell,N0,cell0}=WORLD;const R=rng(seed*7919+13),noise=new Noise(seed),n2=new Noise(seed+101),n3=new Noise(seed+202);
 // Province layout: mountain side, dry corner, wet side.
 const theta=R()*Math.PI*2,mdx=Math.cos(theta),mdz=Math.sin(theta);// toward mountains
 const dryA=theta+(R()<.5?1:-1)*Math.PI*.62,ddx=Math.cos(dryA),ddz=Math.sin(dryA);// toward dry corner
 const wdx=-ddx,wdz=-ddz;// wet side opposite the dry corner
 // wind blows from the wet side toward the dry side
 const windX=ddx,windZ=ddz;
 const provinces={mountain:[mdx,mdz],dry:[ddx,ddz],wet:[wdx,wdz],wind:[windX,windZ]};
 const macro=(x,z)=>{// x,z in metres
  const wx=x+noise.fbm(x/2600,z/2600,3)*700,wz=z+noise.fbm(x/2600+9,z/2600-4,3)*700;
  const u=(wx*mdx+wz*mdz)/half;// -1 lowland side .. +1 mountain side
  const mountain=smoothstep(.05,.85,u);
  const ridges=noise.ridged(wx/1500,wz/1500,5,2.05,.5);
  const hills=.5+.5*n2.fbm(wx/1100,wz/1100,4);
  const dryness=smoothstep(.15,.9,(wx*ddx+wz*ddz)/half+noise.fbm(x/1800,z/1800,2)*.25);
  const wet=smoothstep(.1,.9,(wx*wdx+wz*wdz)/half);
  const mesa=dryness*(1-mountain*.7);
  let U=.018+.06*hills*(1-mountain)+mountain*(.42+.6*ridges)+mesa*.16+wet*.07*hills;
  U*=1-smoothstep(-.6,-1.05,u)*.6;// the basin toward the outlet side stays low
  return {U,mountain,dryness,mesa,wet,ridges,u};
 };
 onProgress({stage:'Raising the country',p:.02});
 // ---- coarse grids
 const C=N0*N0,h0=new Float64Array(C),U0=new Float32Array(C),K0=new Float32Array(C),P0=new Float32Array(C),D0=new Float32Array(C),dry0=new Float32Array(C);
 for(let j=0;j<N0;j++)for(let i=0;i<N0;i++){
  const x=-half+(i+.5)*cell0,z=-half+(j+.5)*cell0,m=macro(x,z),k=j*N0+i;
  U0[k]=m.U;dry0[k]=m.mesa;
  const hard=.5+.5*n3.fbm(x/900,z/900,3);
  K0[k]=(.55+.9*(1-hard))*(1+m.wet*.35)*(1-m.mountain*.25);
  P0[k]=clamp(.55+.75*m.wet-.45*m.dryness+.35*m.mountain,.2,1.8);
  D0[k]=(.07+.1*(1-hard))*(1+m.wet*.5)*(1-m.mesa*.5);
  h0[k]=m.U*60+noise.fbm(x/700,z/700,5)*4+n2.fbm(x/240,z/240,3)*1.2;
 }
 // ---- outlets and inlet
 const sideCell=(s,t)=>{// s: 0 north(z-),1 south,2 west,3 east ; t in [0,1)
  const k=Math.floor(t*N0);return s===0?k:s===1?(N0-1)*N0+k:s===2?k*N0:k*N0+N0-1;};
 const sideOf=(dx,dz)=>Math.abs(dx)>Math.abs(dz)?(dx>0?3:2):(dz>0?1:0);
 const outletSide=sideOf(-mdx,-mdz),inletSide=sideOf(mdx,mdz)===outletSide?(outletSide^1):sideOf(mdx+.8*wdx,mdz+.8*wdz);
 const outletT=.35+R()*.3,inletT=.3+R()*.4;
 const seed0=new Uint8Array(C);
 const markOutlet=(side,t,w,N_,arr)=>{for(let k=-w;k<=w;k++){const tt=clamp(t+k/N_,0,.999);const kk=Math.floor(tt*N_);const c=side===0?kk:side===1?(N_-1)*N_+kk:side===2?kk*N_:kk*N_+N_-1;arr[c]=1;}};
 markOutlet(outletSide,outletT,10,N0,seed0);
 const minorSide=(outletSide+2)%4===inletSide?(outletSide+3)%4:(outletSide+2)%4;const minorT=.2+R()*.6;markOutlet(minorSide,minorT,3,N0,seed0);
 // The inlet cell: a big river enters from upstream country beyond the map.
 let inlet0=sideCell(inletSide,inletT);
 const INLET_AREA=200e6;// m^2 of upstream catchment
 // Carve an initial gentle corridor from inlet toward the outlet so the trunk is antecedent.
 {
  const ix=inlet0%N0,iz=(inlet0/N0)|0,oc=sideCell(outletSide,outletT),ox=oc%N0,oz=(oc/N0)|0;
  for(let j=0;j<N0;j++)for(let i=0;i<N0;i++){
   const ax=ox-ix,az=oz-iz,L2=ax*ax+az*az,t=clamp(((i-ix)*ax+(j-iz)*az)/L2,0,1);
   const wob=noise.fbm(t*3.1,.7,2)*38;
   const px=ix+ax*t+(-az/Math.sqrt(L2))*wob,pz=iz+az*t+(ax/Math.sqrt(L2))*wob,d=Math.hypot(i-px,j-pz);
   const k=j*N0+i,f=Math.exp(-(d*d)/(2*14*14));h0[k]*=1-.75*f;U0[k]*=1-.55*f;
  }
 }
 mark('setup');
 // ---- implicit stream-power erosion (Braun & Willett 2013), n=1, m=.5
 const heap=new Heap(N*N);
 const erode=(h,U,K,P,D,dry,Ng,cellM,seedMask,inletCell,iters,eps,progress0,progress1,preview)=>{
  const M=Ng*Ng,fill=new Float64Array(M),order=new Int32Array(M),parent=new Int32Array(M),recv=new Int32Array(M),rdist=new Float32Array(M),Q=new Float64Array(M),base=new Float64Array(M),lap=new Float64Array(M);
  for(let i=0;i<M;i++)base[i]=cellM*cellM*P[i];base[inletCell]+=INLET_AREA;
  const dt=1,Kdt=.055;
  for(let it=0;it<iters;it++){
   const count=priorityFlood(h,Ng,seedMask,eps,fill,order,parent,heap);
   receivers(fill,Ng,cellM,seedMask,parent,recv,rdist);accumulate(order,count,recv,base,Q);
   let hmax=1;for(let i=0;i<M;i++){h[i]=fill[i];if(h[i]>hmax)hmax=h[i];}
   const band=Math.max(6,hmax/13);
   for(let k=0;k<count;k++){
    const i=order[k],r=recv[i];if(r===i){h[i]=Math.min(h[i],fill[i]);continue;}
    let Ke=K[i];if(dry[i]>.05){const b=((h[i]/band+noise.simplex(i%Ng*.05,(i/Ng|0)*.05)*.18)%1+1)%1;Ke*=1+dry[i]*((b<.32?.18:1.7)-1);}
    const F=Kdt*Ke*Math.sqrt(Q[i])/rdist[i];
    const hn=(h[i]+dt*U[i]+F*h[r])/(1+F);h[i]=Math.max(hn,h[r]+1e-6);
   }
   // hillslope diffusion
   for(let z=0;z<Ng;z++)for(let x=0;x<Ng;x++){const i=z*Ng+x;if(seedMask[i]){lap[i]=0;continue;}const a=h[i-(x>0?1:0)],b=h[i+(x<Ng-1?1:0)],c=h[i-(z>0?Ng:0)],d=h[i+(z<Ng-1?Ng:0)];lap[i]=a+b+c+d-4*h[i];}
   for(let i=0;i<M;i++)h[i]+=D[i]*lap[i];
   if((it%6===0||it===iters-1)){onProgress({stage:'Carving the watershed',p:progress0+(progress1-progress0)*(it+1)/iters});if(preview)preview(h,Q,Ng,it);}
  }
  const count=priorityFlood(h,Ng,seedMask,eps,fill,order,parent,heap);receivers(fill,Ng,cellM,seedMask,parent,recv,rdist);accumulate(order,count,recv,base,Q);
  return {fill,order,count,recv,rdist,Q};
 };
 const previewImage=(h,Q,Ng,it)=>{
  const S=128,img=new Uint8ClampedArray(S*S*4),st=Ng/S;let hmax=1;for(let i=0;i<h.length;i+=7)if(h[i]>hmax)hmax=h[i];
  for(let j=0;j<S;j++)for(let i=0;i<S;i++){
   const x=Math.min(Ng-2,Math.floor(i*st)),z=Math.min(Ng-2,Math.floor(j*st)),k=z*Ng+x;
   const sx=(h[k+1]-h[k])/hmax*40,sz=(h[k+Ng]-h[k])/hmax*40,shade=clamp(.62+(-sx*.7-sz*.7)*2.2,0,1),e=h[k]/hmax;
   let r=mix(110,236,e)*shade,g=mix(126,224,e)*shade,b=mix(96,200,e)*shade;
   const q=Q[k];if(q>1.2e6){const w=clamp(Math.log(q/1.2e6)/3,0,1);r=mix(r,70,w);g=mix(g,150,w);b=mix(b,200,w);}
   const o=(j*S+i)*4;img[o]=r;img[o+1]=g;img[o+2]=b;img[o+3]=255;
  }
  onProgress({stage:'Carving the watershed',preview:{w:S,h:S,data:img},iteration:it});
 };
 erode(h0,U0,K0,P0,D0,dry0,N0,cell0,seed0,inlet0,120,1e-3,.05,.55,previewImage);
 mark('erosionCoarse');
 // ---- refine to 512 at 12 m
 const M=N*N,h=new Float64Array(M),U=new Float32Array(M),K=new Float32Array(M),P=new Float32Array(M),D=new Float32Array(M),dry=new Float32Array(M),hard=new Float32Array(M),wetG=new Float32Array(M),mountG=new Float32Array(M);
 const h0f=new Float32Array(h0);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  const k=j*N+i,fx=(i+.5)/2-.5,fz=(j+.5)/2-.5,x=-half+(i+.5)*cell,z=-half+(j+.5)*cell;
  h[k]=bicubic(h0f,N0,fx,fz)+noise.fbm(x/130,z/130,3)*.25;
  U[k]=bilinear(U0,N0,fx,fz);K[k]=bilinear(K0,N0,fx,fz);P[k]=bilinear(P0,N0,fx,fz);D[k]=bilinear(D0,N0,fx,fz)*.8;dry[k]=bilinear(dry0,N0,fx,fz);
  const m=macro(x,z);hard[k]=.5+.5*n3.fbm(x/900,z/900,3);wetG[k]=m.wet;mountG[k]=m.mountain;
 }
 const seed1=new Uint8Array(M);markOutlet(outletSide,outletT,20,N,seed1);markOutlet(minorSide,minorT,6,N,seed1);
 const inlet=(()=>{const x=(inlet0%N0)*2,z=((inlet0/N0)|0)*2;return z*N+x;})();
 let route=erode(h,U,K,P,D,dry,N,cell,seed1,inlet,18,1e-3,.55,.72,null);
 mark('erosionFine');
 // ---- rescale to target relief, thermal talus
 let hmin=Infinity,hs=[];for(let i=0;i<M;i++){if(h[i]<hmin)hmin=h[i];}
 for(let i=0;i<M;i+=13)hs.push(h[i]);hs.sort((a,b)=>a-b);const p999=hs[Math.floor(hs.length*.998)];
 const peak=680+R()*120,scale=(peak-18)/(p999-hmin);
 for(let i=0;i<M;i++){const v=(h[i]-hmin)*scale;h[i]=18+v*(1-.12*Math.exp(-v/40));}// slight valley-floor flattening
 for(let pass=0;pass<24;pass++){
  for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++){
   const i=z*N+x,tanMax=mix(.6,1.8,smoothstep(.66,.92,hard[i])*mountG[i])*(dry[i]>.3?1.5:1),lim=tanMax*cell;
   for(let d=0;d<4;d++){const n=i+DX[d]+DZ[d]*N,diff=h[i]-h[n];if(diff>lim){const m=(diff-lim)*.3;h[i]-=m;h[n]+=m;}}
  }
 }
 onProgress({stage:'Filling the lakes',p:.74});
 mark('rescale');
 // ---- lakes: natural dams in valley reaches
 const fill=new Float64Array(M),order=new Int32Array(M),parent=new Int32Array(M),recv=new Int32Array(M),rdist=new Float32Array(M),Q=new Float64Array(M),base=new Float64Array(M);
 for(let i=0;i<M;i++)base[i]=cell*cell*P[i];base[inlet]+=INLET_AREA;
 const routeAll=eps=>{const c=priorityFlood(h,N,seed1,eps,fill,order,parent,heap);receivers(fill,N,cell,seed1,parent,recv,rdist);accumulate(order,c,recv,base,Q);return c;};
 routeAll(1e-4);for(let i=0;i<M;i++)h[i]=fill[i];
 let count=routeAll(1e-4);
 const lakeId=new Int16Array(M).fill(-1),lakes=[];
 const cx=i=>-half+(i%N+.5)*cell,cz=i=>-half+((i/N|0)+.5)*cell;
 {
  // candidate dam sites along creeks/streams with gentle slope, away from borders
  const cands=[];
  for(let i=0;i<M;i++){const q=Q[i]/1e6;if(q<1.2||q>60)continue;const x=i%N,z=(i/N)|0;if(x<40||z<40||x>N-40||z>N-40)continue;const r=recv[i];const s=(h[i]-h[r])/rdist[i];if(s>.03)continue;cands.push(i);}
  const picks=[];const want=2+Math.floor(R()*2);
  for(let tries=0;tries<400&&picks.length<want&&cands.length;tries++){
   const i=cands[Math.floor(R()*cands.length)];const x=cx(i),z=cz(i);
   if(picks.some(p=>Math.hypot(cx(p)-x,cz(p)-z)<1400))continue;
   if(Q[i]>80e6)continue;// not on the trunk river
   // flow direction
   const r=recv[i],fx=cx(r)-x,fz=cz(r)-z,fl=Math.hypot(fx,fz)||1,px=-fz/fl,pz=fx/fl;
   const depth=7+R()*9,L=h[i]+depth;
   // flood fill upstream-connected cells below L (from the dam cell's upstream side)
   const stack=[],seen=new Uint8Array(M),cells=[];
   for(let d=0;d<8;d++){const n=i+DX[d]+DZ[d]*N;if(recv[n]===i&&h[n]<L){stack.push(n);seen[n]=1;}}
   let ok=true;
   while(stack.length){const c=stack.pop();cells.push(c);if(cells.length>5200||Q[c]>Q[i]*1.02){ok=false;break;}const X=c%N,Z=(c/N)|0;if(X<3||Z<3||X>N-4||Z>N-4){ok=false;break;}
    for(let d=0;d<4;d++){const n=c+DX[d]+DZ[d]*N;if(seen[n]||n===i)continue;seen[n]=1;// stay on the upstream side of the dam line
     const side=(cx(n)-x)*fx+(cz(n)-z)*fz;if(side>0&&Math.abs((cx(n)-x)*px+(cz(n)-z)*pz)<400)continue;
     if(h[n]<L)stack.push(n);}
   }
   if(!ok||cells.length<140)continue;
   // dam line across the valley: raise terrain to L+2 except an outflow notch at L
   const id=lakes.length;let damCells=0;
   for(let s=-420;s<=420;s+=cell*.5){const X=Math.round((x+px*s+half)/cell-.5),Z=Math.round((z+pz*s+half)/cell-.5);if(X<1||Z<1||X>N-2||Z>N-2)continue;
    for(let t=-1;t<=1;t++){const k=(Z+Math.round(pz*0))*N+X;const kk=k+Math.round(fx/fl*t)+Math.round(fz/fl*t)*N;if(lakeId[kk]>=0)continue;const notch=Math.abs(s)<cell*1.2;const target=notch?L:L+2.2-Math.abs(t)*.6;if(h[kk]<target){h[kk]=target;damCells++;}}}
   let sx=0,sz=0;for(const c of cells){lakeId[c]=id;sx+=cx(c);sz+=cz(c);}
   // deepen toward the centre of the basin
   lakes.push({id,level:L,x:sx/cells.length,z:sz/cells.length,cells:cells.length,area:cells.length*cell*cell,damX:x,damZ:z,outflow:[x+fx/fl*cell*1.5,z+fz/fl*cell*1.5],name:''});
   picks.push(i);
  }
  // shape lake beds: distance to shore via BFS inside the lake
  const dist=new Float32Array(M).fill(1e9),q=[];
  for(let i=0;i<M;i++)if(lakeId[i]>=0){const X=i%N,Z=(i/N)|0;for(let d=0;d<4;d++){const n=(Z+DZ[d])*N+X+DX[d];if(lakeId[n]!==lakeId[i]){dist[i]=cell*.5;q.push(i);break;}}}
  for(let qi=0;qi<q.length;qi++){const c=q[qi],X=c%N,Z=(c/N)|0;for(let d=0;d<4;d++){const n=(Z+DZ[d])*N+X+DX[d];if(lakeId[n]===lakeId[c]&&dist[n]>dist[c]+cell){dist[n]=dist[c]+cell;q.push(n);}}}
  for(let i=0;i<M;i++)if(lakeId[i]>=0){const L=lakes[lakeId[i]].level,bed=L-Math.min(14,1.2+dist[i]*.09);h[i]=Math.min(h[i],bed);}
 }
 mark('lakes');
 // natural ponds from any remaining pits (no-eps flood)
 count=routeAll(0);
 {
  const seenP=new Uint8Array(M);
  for(let i=0;i<M;i++){if(seenP[i]||lakeId[i]>=0||fill[i]-h[i]<.8)continue;const st=[i],cells=[];seenP[i]=1;const L=fill[i];
   while(st.length){const c=st.pop();cells.push(c);const X=c%N,Z=(c/N)|0;for(let d=0;d<4;d++){const x=X+DX[d],z=Z+DZ[d];if(x<0||z<0||x>=N||z>=N)continue;const n=z*N+x;if(!seenP[n]&&fill[n]-h[n]>.05&&Math.abs(fill[n]-L)<.01&&lakeId[n]<0){seenP[n]=1;st.push(n);}}}
   if(cells.length>=25&&cells.length<3000){const id=lakes.length;let sx=0,sz=0;for(const c of cells){lakeId[c]=id;sx+=cx(c);sz+=cz(c);}lakes.push({id,level:L,x:sx/cells.length,z:sz/cells.length,cells:cells.length,area:cells.length*cell*cell,pond:true,name:''});}
  }
 }
 count=routeAll(1e-4);
 mark('ponds');
 onProgress({stage:'Tracing rivers and creeks',p:.8});
 // ---- channel network
 const KM2=1e6,TH_GULLY=.08*KM2,TH_CREEK=.6*KM2,TH_STREAM=8*KM2,TH_RIVER=40*KM2;
 const isCh=new Uint8Array(M);for(let i=0;i<M;i++)if(Q[i]>=TH_GULLY&&lakeId[i]<0&&!seed1[i])isCh[i]=1;
 // main donor per cell = channel donor with the largest discharge
 const mainDonor=new Int32Array(M).fill(-1),nDonors=new Uint8Array(M);
 for(let i=0;i<M;i++){if(!isCh[i])continue;const r=recv[i];if(r===i)continue;nDonors[r]++;if(mainDonor[r]<0||Q[i]>Q[mainDonor[r]])mainDonor[r]=i;}
 const channels=[];const chAt=new Int32Array(M).fill(-1);
 // heads: channel cells without channel donors, processed by descending Q so the trunk gets index 0
 const heads=[];for(let i=0;i<M;i++)if(isCh[i]&&mainDonor[i]<0)heads.push(i);
 heads.sort((a,b)=>Q[b]-Q[a]);
 // process in order of decreasing *terminal* discharge so trunks come first
 for(const head of heads){
  const cells=[];let c=head,end='outlet',joinCh=-1,joinIdx=-1;
  for(let guard=0;guard<M;guard++){
   cells.push(c);chAt[c]=channels.length;const r=recv[c];
   if(r===c){end='outlet';break;}
   if(lakeId[r]>=0){cells.push(r);end='lake';joinCh=-2-lakeId[r];break;}
   if(!isCh[r]){end='sink';break;}
   if(mainDonor[r]!==c){cells.push(r);end='join';break;}
   c=r;
  }
  if(cells.length<3&&end!=='join'&&end!=='lake')continue;
  channels.push({cells,end,head});
 }
 mark('channelTrace');
 // geometry: smoothing, meanders, levels, widths
 const H32=new Float32Array(h);
 const chan=[];let trunk=0;
 for(let ci=0;ci<channels.length;ci++){
  const {cells,end}=channels[ci];
  let pts=cells.map(c=>[cx(c),cz(c),H32[c],Q[c]]);
  if(cells[0]===inlet){// extend beyond the border so the river enters from off-map
   const dx=pts[0][0]-pts[1][0],dz=pts[0][1]-pts[1][1];pts.unshift([pts[0][0]+dx*8,pts[0][1]+dz*8,pts[0][2]+.5,pts[0][3]]);}
  if(end==='outlet'){const n=pts.length,dx=pts[n-1][0]-pts[n-2][0],dz=pts[n-1][1]-pts[n-2][1];pts.push([pts[n-1][0]+dx*8,pts[n-1][1]+dz*8,pts[n-1][2]-.3,pts[n-1][3]]);}
  for(let pass=0;pass<2;pass++){// Chaikin
   const o=[pts[0]];for(let k=0;k<pts.length-1;k++){const a=pts[k],b=pts[k+1];o.push(a.map((v,j)=>v*.75+b[j]*.25),a.map((v,j)=>v*.25+b[j]*.75));}o.push(pts[pts.length-1]);pts=o;}
  // resample at ~ spacing
  const qEnd=pts[pts.length-1][3],w0=2.8*Math.sqrt(qEnd/KM2);
  const cls=qEnd>=TH_RIVER?3:qEnd>=TH_STREAM?2:qEnd>=TH_CREEK?1:0;
  const spacing=cls===3?10:cls===2?7:5;
  const rs=[pts[0]];let acc=0;
  for(let k=1;k<pts.length;k++){const a=rs[rs.length-1],b=pts[k];let d=Math.hypot(b[0]-a[0],b[1]-a[1]);
   while(d>=spacing){const t=spacing/d;const p=a.map((v,j)=>v+(b[j]-v)*t);rs.push(p);d-=spacing;const aa=rs[rs.length-1];if(d<spacing)break;}
  }
  if(Math.hypot(rs[rs.length-1][0]-pts[pts.length-1][0],rs[rs.length-1][1]-pts[pts.length-1][1])>.5)rs.push(pts[pts.length-1]);
  // meanders on low-gradient reaches
  const n=rs.length;if(n<3)continue;
  const len=[0];for(let k=1;k<n;k++)len.push(len[k-1]+Math.hypot(rs[k][0]-rs[k-1][0],rs[k][1]-rs[k-1][1]));
  const out=[];
  const phase=hash2(ci,7,seed)*6.28;
  for(let k=0;k<n;k++){
   const a=rs[Math.max(0,k-1)],b=rs[Math.min(n-1,k+1)],tx=b[0]-a[0],tz=b[1]-a[1],tl=Math.hypot(tx,tz)||1;
   const q=rs[k][3],w=Math.max(1.2,2.8*Math.sqrt(q/KM2));
   const up=rs[Math.max(0,k-6)][2],dn=rs[Math.min(n-1,k+6)][2],dl=len[Math.min(n-1,k+6)]-len[Math.max(0,k-6)]||1,grad=Math.max(0,(up-dn)/dl);
   const lowGrad=cls>=1?1-smoothstep(.002,.012,grad):0;
   const taper=smoothstep(0,60,len[k])*smoothstep(0,60,len[n-1]-len[k]);
   const amp=(w>18?.8*w:1.5*w)*lowGrad*taper*Math.min(1,cls>=1?1:0);
   const wl=11*w+30,m=amp*Math.sin(len[k]/wl*6.283+phase)*(1+.3*Math.sin(len[k]/wl*2.1+phase*2));
   out.push([rs[k][0]-tz/tl*m,rs[k][1]+tx/tl*m,rs[k][2],q,grad]);
  }
  // water level, width, depth
  const P=new Float32Array(out.length*8);// x,z,level,width,depth,q,speed,bedGrad
  let level=Infinity;
  for(let k=0;k<out.length;k++){
   const [x,z,hh,q,g]=out[k],w=cls===0?4+8*smoothstep(TH_GULLY,TH_CREEK,q):Math.max(2.2,2.8*Math.sqrt(q/KM2)),dep=cls===0?1.5+2.5*smoothstep(TH_GULLY,TH_CREEK,q):Math.max(.45,.35*Math.pow(q/KM2,.35)+.25);
   level=Math.min(level,hh-(cls===0?0:.25));
   const o=k*8;P[o]=x;P[o+1]=z;P[o+2]=level;P[o+3]=w;P[o+4]=dep;P[o+5]=q/KM2;P[o+6]=cls===0?0:clamp((q/KM2)*.12/(w*dep)+.25+g*25,.2,3.2);P[o+7]=g;
  }
  chan.push({i:chan.length,src:ci,cls,end,endCh:-1,P,n:out.length,q:qEnd/KM2,length:len[n-1],name:''});
 }
 // junction linking + tributary levels: end level = main-channel level at the junction, then backward max
 const chanBySrc=new Map(chan.map(c=>[c.src,c]));
 const findNearest=(c,x,z)=>{let best=-1,bd=1e9;for(let k=0;k<c.n;k++){const d=Math.hypot(c.P[k*8]-x,c.P[k*8+1]-z);if(d<bd){bd=d;best=k;}}return best;};
 // process trunks first (larger q) so their levels are final
 const byQ=[...chan].sort((a,b)=>b.q-a.q);
 for(const c of byQ){
  const src=channels[c.src],n=c.n;let endLevel=null;
  if(src.end==='join'){const jc=chAt[src.cells[src.cells.length-1]];const m=chanBySrc.get(jc);if(m){c.endCh=m.i;const k=findNearest(m,c.P[(n-1)*8],c.P[(n-1)*8+1]);endLevel=m.P[k*8+2];c.joinIdx=k;
    // snap the tributary end onto the main centre line
    c.P[(n-1)*8]=m.P[k*8];c.P[(n-1)*8+1]=m.P[k*8+1];}}
  else if(src.end==='lake'){const L=lakes[-2-(-2-lakeId[src.cells[src.cells.length-1]])];const lk=lakes[lakeId[src.cells[src.cells.length-1]]];if(lk){endLevel=lk.level;c.endLake=lk.id;}}
  if(endLevel!==null&&c.cls>0){c.P[(n-1)*8+2]=endLevel;for(let k=n-2;k>=0;k--){const o=k*8;c.P[o+2]=Math.max(c.P[o+2],c.P[o+8+2]);}}
  // lake outflow: channels starting at a lake outflow begin at the lake level
 }
 for(const lk of lakes){if(lk.pond)continue;let best=null,bd=1e9;for(const c of chan){if(c.cls===0)continue;const d=Math.hypot(c.P[0]-lk.outflow[0],c.P[1]-lk.outflow[1]);if(d<bd){bd=d;best=c;}}if(best&&bd<60){best.fromLake=lk.id;best.P[2]=Math.min(best.P[2],lk.level);for(let k=1;k<best.n;k++)best.P[k*8+2]=Math.min(best.P[k*8+2],best.P[(k-1)*8+2]);}}
 trunk=byQ[0]?.i??0;
 // names
 {let rn=0,cn=0;const nr=rng(seed+55);for(const c of byQ){if(c.cls===3)c.name=RIVER_NAMES[(rn+++Math.floor(nr()*5))%RIVER_NAMES.length];else if(c.cls>=1)c.name=CREEK_NAMES[(cn++*7+Math.floor(nr()*18))%CREEK_NAMES.length]+(c.cls===2?' Brook':' Creek');}
  const LN=['Mirror Lake','Heron Lake','Cold Tarn','Stillwater','Alder Pond','Black Pool'],lo=Math.floor(nr()*6);let li=0;for(const l of lakes)l.name=l.pond?'Pond':LN[(lo+li++)%LN.length];}
 mark('channelGeom');
 // raster of channels (index of the most important channel, level, distance) for later passes
 const chRaster=new Int32Array(M).fill(-1),chLevel=new Float32Array(M).fill(-1e9),chWidth=new Float32Array(M);
 for(const c of [...chan].sort((a,b)=>a.q-b.q)){for(let k=0;k<c.n;k++){const o=k*8,x=c.P[o],z=c.P[o+1],w=c.P[o+3];const r=Math.ceil((w*.5+cell)/cell);const X=Math.floor((x+half)/cell),Z=Math.floor((z+half)/cell);
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){const xx=X+dx,zz=Z+dz;if(xx<0||zz<0||xx>=N||zz>=N)continue;const d=Math.hypot(cx(zz*N+xx)-x,cz(zz*N+xx)-z);if(d<=w*.5+cell*.75){const k2=zz*N+xx;chRaster[k2]=c.i;chLevel[k2]=c.cls>0?c.P[o+2]:-1e9;chWidth[k2]=w;}}}}
 // distance to water (rivers/creeks/lakes) via chamfer transform
 const wdist=new Float32Array(M).fill(1e9);
 for(let i=0;i<M;i++){const c=chRaster[i];if((c>=0&&chan[c].cls>=1)||lakeId[i]>=0)wdist[i]=0;}
 const chamfer=g=>{for(let z=0;z<N;z++)for(let x=0;x<N;x++){const i=z*N+x;let v=g[i];if(x>0)v=Math.min(v,g[i-1]+cell);if(z>0){v=Math.min(v,g[i-N]+cell);if(x>0)v=Math.min(v,g[i-N-1]+cell*1.414);if(x<N-1)v=Math.min(v,g[i-N+1]+cell*1.414);}g[i]=v;}
  for(let z=N-1;z>=0;z--)for(let x=N-1;x>=0;x--){const i=z*N+x;let v=g[i];if(x<N-1)v=Math.min(v,g[i+1]+cell);if(z<N-1){v=Math.min(v,g[i+N]+cell);if(x<N-1)v=Math.min(v,g[i+N+1]+cell*1.414);if(x>0)v=Math.min(v,g[i+N-1]+cell*1.414);}g[i]=v;}};
 chamfer(wdist);
 // nearest water level propagated (for "height above water")
 onProgress({stage:'Reading the climate',p:.84});
 // ---- climate
 const slope=new Float32Array(M);
 for(let z=0;z<N;z++)for(let x=0;x<N;x++){const i=z*N+x,a=h[z*N+Math.max(0,x-1)],b=h[z*N+Math.min(N-1,x+1)],c=h[Math.max(0,z-1)*N+x],d=h[Math.min(N-1,z+1)*N+x];slope[i]=Math.hypot(b-a,d-c)/(2*cell);}
 const moist=new Float32Array(M),temp=new Float32Array(M);
 for(let z=0;z<N;z++)for(let x=0;x<N;x++){
  const i=z*N+x,X=cx(i),Z=cz(i);
  const side=.5+.5*clamp((X*wdx+Z*wdz)/half,-1,1);
  let up=0;for(let s=1;s<=10;s++){const ux=X-windX*s*70,uz=Z-windZ*s*70;const fi=(ux+half)/cell-.5,fj=(uz+half)/cell-.5;const hu=bilinear(h,N,fi,fj);up=Math.max(up,(hu-h[i])/(s*70));}
  const gx=(h[z*N+Math.min(N-1,x+1)]-h[z*N+Math.max(0,x-1)])/(2*cell),gz=(h[Math.min(N-1,z+1)*N+x]-h[Math.max(0,z-1)*N+x])/(2*cell);
  const windward=clamp((gx*windX+gz*windZ)*2.5,-.3,.35);
  const nearW=Math.exp(-wdist[i]/140),acc=clamp(Math.log(Q[i]/(cell*cell))/12,0,1);
  let m=.18+.6*side+windward-clamp(up*1.6,0,.35)+.22*nearW+.12*acc+.08*noise.fbm(X/900,Z/900,3)-.35*dry[i];
  moist[i]=clamp(m,0,1);
  temp[i]=clamp(1-(h[i]-18)/820+.08*n2.fbm(X/700,Z/700,2),0,1);
 }
 mark('climate');
 // ---- towns
 onProgress({stage:'Founding the towns',p:.87});
 const towns=[];
 {
  const cand=[];const S=8;
  for(let z=S*3;z<N-S*3;z+=S)for(let x=S*3;x<N-S*3;x+=S){
   const i=z*N+x;if(lakeId[i]>=0)continue;let sm=0,hmax=-1e9,hmin=1e9;
   for(let dz=-8;dz<=8;dz+=4)for(let dx=-8;dx<=8;dx+=4){const k=(z+dz)*N+x+dx;sm+=slope[k];hmax=Math.max(hmax,h[k]);hmin=Math.min(hmin,h[k]);}
   sm/=25;const wd=wdist[i];
   if(sm>.07||hmax-hmin>16||h[i]>330||wd<90||wd>900||dry[i]>.55||mountG[i]>.6)continue;
   // height above nearest water: sample the river level near
   const score=(1-sm/.07)*1.2+(1-Math.abs(wd-260)/700)+(1-h[i]/330)*.6+hash2(x,z,seed+9)*.5+moist[i]*.4;
   cand.push({i,x:cx(i),z:cz(i),score});
  }
  cand.sort((a,b)=>b.score-a.score);
  const want=4+Math.floor(R()*3);
  for(const c of cand){if(towns.length>=want)break;if(Math.hypot(c.x,c.z)>half-350)continue;if(towns.some(t=>Math.hypot(t.x-c.x,t.z-c.z)<1250))continue;
   // floodplain check: level of nearest channel
   towns.push({x:c.x,z:c.z,y:h[c.i],name:''});}
  const nr=rng(seed+77);const used=new Set();
  for(const t of towns){let nm;do{nm=TOWN_A[Math.floor(nr()*TOWN_A.length)]+' '+TOWN_B[Math.floor(nr()*TOWN_B.length)];}while(used.has(nm.split(' ')[0]));used.add(nm.split(' ')[0]);t.name=nm;}
 }
 // town pads: level the town area
 for(const t of towns){let s=0,n=0;const X=Math.floor((t.x+half)/cell),Z=Math.floor((t.z+half)/cell);for(let dz=-6;dz<=6;dz++)for(let dx=-6;dx<=6;dx++){s+=h[(Z+dz)*N+X+dx];n++;}t.y=s/n+.4;t.r=150;}
 mark('towns');
 // ---- roads (A* on 128^2)
 onProgress({stage:'Surveying the roads',p:.9});
 const G=128,gc=WORLD.size/G,gH=new Float32Array(G*G),gLake=new Uint8Array(G*G),gRiver=new Float32Array(G*G);
 for(let j=0;j<G;j++)for(let i=0;i<G;i++){const fx=(i+.5)*gc/cell-.5,fz=(j+.5)*gc/cell-.5;gH[j*G+i]=bilinear(h,N,fx,fz);
  let lake=0,riv=0;for(let dz=0;dz<4;dz++)for(let dx=0;dx<4;dx++){const k=(j*4+dz)*N+i*4+dx;if(lakeId[k]>=0&&!lakes[lakeId[k]].pond)lake++;const c=chRaster[k];if(c>=0&&chan[c].cls>=1)riv=Math.max(riv,chWidth[k]);}
  gLake[j*G+i]=lake>2?1:0;gRiver[j*G+i]=riv;}
 const astar=(sx,sz,tx,tz,forbidFn)=>{
  const s=clamp(Math.floor((sz+half)/gc),0,G-1)*G+clamp(Math.floor((sx+half)/gc),0,G-1),t=clamp(Math.floor((tz+half)/gc),0,G-1)*G+clamp(Math.floor((tx+half)/gc),0,G-1);
  const gs=new Float64Array(G*G).fill(Infinity),from=new Int32Array(G*G).fill(-1),closed=new Uint8Array(G*G),hp=new Heap(G*G*8);gs[s]=0;hp.push(s,0);
  const TX=t%G,TZ=(t/G)|0;
  while(hp.n){const c=hp.pop();if(c===t)break;if(closed[c])continue;closed[c]=1;const X=c%G,Z=(c/G)|0;
   for(let d=0;d<8;d++){const x=X+DX[d],z=Z+DZ[d];if(x<0||z<0||x>=G||z>=G)continue;const n=z*G+x;if(closed[n]||gLake[n])continue;
    const dist=DD[d]*gc,sl=Math.abs(gH[n]-gH[c])/dist;if(sl>.32)continue;
    let cost=dist*(1+40*sl*sl);if(gRiver[n]>5)cost+=gRiver[n]>30?900:300;
    // prefer existing roads (reuse)
    if(forbidFn)cost*=forbidFn(n);
    const g=gs[c]+cost;if(g<gs[n]){gs[n]=g;from[n]=c;const hx=Math.hypot(x-TX,z-TZ)*gc;hp.push(n,g+hx);}}
  }
  if(from[t]<0&&s!==t)return null;const path=[];for(let c=t;c>=0;c=from[c]){path.push(c);if(c===s)break;}path.reverse();
  return path.map(c=>[-half+(c%G+.5)*gc,-half+((c/G|0)+.5)*gc]);
 };
 const roadUse=new Float32Array(G*G).fill(1);
 const roads=[];
 const hAt=(x,z)=>bilinear(h,N,(x+half)/cell-.5,(z+half)/cell-.5);
 const slopeLine=(a,b)=>{const L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(2,Math.ceil(L/12));let prev=hAt(a[0],a[1]),mx=0;for(let k=1;k<=n;k++){const t=k/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,hh=hAt(x,z);mx=Math.max(mx,Math.abs(hh-prev)/(L/n));prev=hh;const i=clamp(Math.floor((z+half)/cell),0,N-1)*N+clamp(Math.floor((x+half)/cell),0,N-1);if(lakeId[i]>=0)return 9;}return mx;};
 const buildRoad=(path,kind,name)=>{
  if(!path||path.length<2)return null;
  // string pull
  const pts=[path[0]];let a=0;
  while(a<path.length-1){let b=Math.min(path.length-1,a+1);for(let c=Math.min(path.length-1,a+9);c>a+1;c--){if(slopeLine(path[a],path[c])<.1){b=c;break;}}pts.push(path[b]);a=b;}
  let P=pts;for(let pass=0;pass<3;pass++){const o=[P[0]];for(let k=0;k<P.length-1;k++){const p=P[k],q=P[k+1];o.push([p[0]*.75+q[0]*.25,p[1]*.75+q[1]*.25],[p[0]*.25+q[0]*.75,p[1]*.25+q[1]*.75]);}o.push(P[P.length-1]);P=o;}
  // resample every 4 m
  const rs=[P[0]];for(let k=1;k<P.length;k++){let a=rs[rs.length-1];const b=P[k];let d=Math.hypot(b[0]-a[0],b[1]-a[1]);while(d>=4){const t=4/d;a=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];rs.push(a);d-=4;}}rs.push(P[P.length-1]);
  const n=rs.length,prof=new Float32Array(n);for(let k=0;k<n;k++)prof[k]=hAt(rs[k][0],rs[k][1]);
  // town pads pull the profile to pad level
  for(let k=0;k<n;k++)for(const t of towns){const d=Math.hypot(rs[k][0]-t.x,rs[k][1]-t.z);if(d<t.r+40)prof[k]=mix(t.y,prof[k],smoothstep(t.r-40,t.r+40,d));}
  const sm=new Float32Array(n);for(let k=0;k<n;k++){let s=0,c=0;for(let j=-7;j<=7;j++){const q=clamp(k+j,0,n-1);s+=prof[q];c++;}sm[k]=s/c;}
  const g=kind==='track'?.18:.12;
  // bridges
  const bridges=[];let k=0;
  while(k<n){const [x,z]=rs[k];const i=clamp(Math.floor((z+half)/cell),0,N-1)*N+clamp(Math.floor((x+half)/cell),0,N-1);const c=chRaster[i];
   if(c>=0&&chan[c].cls>=1&&chWidth[i]>(kind==='track'?9999:5)){let e=k;while(e<n-1){const [x2,z2]=rs[e+1];const i2=clamp(Math.floor((z2+half)/cell),0,N-1)*N+clamp(Math.floor((x2+half)/cell),0,N-1);if(chRaster[i2]>=0&&chan[chRaster[i2]].cls>=1)e++;else break;}
    const s0=Math.max(0,k-3),s1=Math.min(n-1,e+3);let wl=-1e9;for(let q=k;q<=e;q++){const [xq,zq]=rs[q];const iq=clamp(Math.floor((zq+half)/cell),0,N-1)*N+clamp(Math.floor((xq+half)/cell),0,N-1);wl=Math.max(wl,chLevel[iq]);}
    const deck=Math.max(wl+3.2,sm[s0],sm[s1]);for(let q=s0;q<=s1;q++)sm[q]=deck;
    bridges.push({s0,s1,deck,x0:rs[s0][0],z0:rs[s0][1],x1:rs[s1][0],z1:rs[s1][1],water:wl,channel:c,name:chan[c].name});k=s1+1;continue;}
   k++;}
  const fixed=new Uint8Array(n);for(const b of bridges)for(let q=b.s0;q<=b.s1;q++)fixed[q]=1;
  for(let it=0;it<3;it++){for(let q=1;q<n;q++)if(!fixed[q])sm[q]=clamp(sm[q],sm[q-1]-g*4,sm[q-1]+g*4);for(let q=n-2;q>=0;q--)if(!fixed[q])sm[q]=clamp(sm[q],sm[q+1]-g*4,sm[q+1]+g*4);}
  const xz=new Float32Array(n*2);for(let q=0;q<n;q++){xz[q*2]=rs[q][0];xz[q*2+1]=rs[q][1];}
  const road={id:roads.length,kind,name,width:kind==='main'?7.2:kind==='minor'?5.2:3.6,n,xz,y:sm,bridges};
  roads.push(road);
  for(let q=0;q<n;q+=3){const X=clamp(Math.floor((rs[q][0]+half)/gc),0,G-1),Z=clamp(Math.floor((rs[q][1]+half)/gc),0,G-1);roadUse[Z*G+X]=.45;}
  return road;
 };
 {
  // minimum spanning tree over towns (Prim)
  const n=towns.length,inT=new Uint8Array(n),edges=[];inT[0]=1;
  for(let c=1;c<n;c++){let best=null;for(let a=0;a<n;a++)if(inT[a])for(let b=0;b<n;b++)if(!inT[b]){const d=Math.hypot(towns[a].x-towns[b].x,towns[a].z-towns[b].z);if(!best||d<best[2])best=[a,b,d];}if(!best)break;inT[best[1]]=1;edges.push(best);}
  // extra edges
  const extra=[];for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){if(edges.some(e=>(e[0]===a&&e[1]===b)||(e[0]===b&&e[1]===a)))continue;extra.push([a,b,Math.hypot(towns[a].x-towns[b].x,towns[a].z-towns[b].z)]);}
  extra.sort((a,b)=>a[2]-b[2]);edges.push(...extra.slice(0,1+(R()<.5?1:0)).filter(e=>e[2]<3600));
  for(const [a,b] of edges){const p=astar(towns[a].x,towns[a].z,towns[b].x,towns[b].z,c=>roadUse[c]);buildRoad(p,'main',`${towns[a].name.split(' ')[0]} – ${towns[b].name.split(' ')[0]} road`);}
  // two roads leaving the map
  const exits=[];for(let s=0;s<4;s++){if(s===sideOf(mdx,mdz))continue;let best=null;for(let t=.15;t<.86;t+=.05){const x=s===2?-half+30:s===3?half-30:-half+t*WORLD.size,z=s===0?-half+30:s===1?half-30:-half+t*WORLD.size;const hh=hAt(x,z);const i=clamp(Math.floor((z+half)/cell),0,N-1)*N+clamp(Math.floor((x+half)/cell),0,N-1);if(lakeId[i]>=0)continue;const sc=hh+hash2(s,Math.round(t*100),seed)*60;if(!best||sc<best.sc)best={x,z,sc};}if(best)exits.push(best);}
  exits.sort(()=>R()-.5);
  for(const e of exits.slice(0,2)){let bt=null,bd=1e9;for(const t of towns){const d=Math.hypot(t.x-e.x,t.z-e.z);if(d<bd){bd=d;bt=t;}}if(!bt)continue;const p=astar(bt.x,bt.z,e.x,e.z,c=>roadUse[c]);if(p){const dx=e.x===half-30?1:e.x===-half+30?-1:0,dz=e.z===half-30?1:e.z===-half+30?-1:0;p.push([e.x+dx*400,e.z+dz*400]);buildRoad(p,'minor',`Route out (${bt.name.split(' ')[0]})`);}}
 }
 mark('roads');
 // ---- farm mask, forest, biomes
 onProgress({stage:'Planting fields and forests',p:.94});
 const roadDist=new Float32Array(M).fill(1e9);for(const r of roads)for(let q=0;q<r.n;q+=2){const X=Math.floor((r.xz[q*2]+half)/cell),Z=Math.floor((r.xz[q*2+1]+half)/cell);if(X>=0&&Z>=0&&X<N&&Z<N)roadDist[Z*N+X]=0;}chamfer(roadDist);
 const townDist=new Float32Array(M).fill(1e9);for(const t of towns){const X=Math.floor((t.x+half)/cell),Z=Math.floor((t.z+half)/cell);townDist[Z*N+X]=0;}chamfer(townDist);
 const farm=new Float32Array(M),forest=new Float32Array(M),rock=new Float32Array(M),marsh=new Float32Array(M),snow=new Float32Array(M),scrub=new Float32Array(M),desert=new Float32Array(M),biome=new Uint8Array(M);
 // grid of lake/water level near each cell for marsh test
 for(let z=0;z<N;z++)for(let x=0;x<N;x++){
  const i=z*N+x,X=cx(i),Z=cz(i),s=slope[i],m=moist[i],t=temp[i],nz=noise.fbm(X/420,Z/420,3),nz2=n2.fbm(X/160,Z/160,2);
  const flat=1-smoothstep(.05,.14,s);
  const nearTown=Math.exp(-townDist[i]/2200),nearRoad=Math.exp(-roadDist[i]/900);
  const f=flat*smoothstep(.22,.4,m)*(1-smoothstep(.85,1,m))*(1-smoothstep(260,380,h[i]))*clamp(nearTown*1.3+nearRoad*.7,0,1)*(1-smoothstep(.3,.6,dry[i]))*smoothstep(28,70,wdist[i])*clamp(.75+nz*.8,0,1);
  farm[i]=lakeId[i]>=0?0:clamp(f*1.8-.25,0,1);
  const rk=clamp(smoothstep(.55,1.05,s)*(.6+.6*hard[i])+smoothstep(.75,.95,dry[i])*smoothstep(.35,.7,s),0,1);rock[i]=rk;
  snow[i]=smoothstep(.2,.12,t+nz2*.03)*(1-smoothstep(.9,1.4,s));
  const mh=wdist[i]<220?1:0;marsh[i]=lakeId[i]>=0?0:flat*Math.exp(-wdist[i]/55)*smoothstep(.45,.7,m)*(1-farm[i])*(h[i]<420?1:0)*clamp(.6+nz2,0,1);
  desert[i]=smoothstep(.22,.08,m)*(1-rk*.5);
  scrub[i]=smoothstep(.12,.3,m)*(1-smoothstep(.36,.52,m))*(1-farm[i])*(1-snow[i]);
  const fo=smoothstep(.4,.62,m+nz*.18)*(1-smoothstep(.16,.26,t))*(1-rk)*(1-farm[i])*(1-marsh[i]*.7)*(1-smoothstep(.9,1.3,s))*(townDist[i]<220?0:1);
  forest[i]=lakeId[i]>=0?0:clamp(fo*1.25,0,1);
  // biome id for labels: 0 snow,1 tundra,2 rock,3 scree,4 conifer,5 mixed,6 deciduous,7 riparian,8 marsh,9 meadow,10 farmland,11 scrub,12 desert/badlands,13 lake
  let b=9;
  if(lakeId[i]>=0)b=13;else if(snow[i]>.5)b=0;else if(rk>.55)b=2;else if(farm[i]>.5)b=10;else if(marsh[i]>.45)b=8;
  else if(forest[i]>.45){b=wdist[i]<60?7:t<.45?4:t<.65?5:6;}else if(t<.25)b=1;else if(desert[i]>.5)b=dry[i]>.3?12:11;else if(scrub[i]>.5)b=11;else if(rk>.3)b=3;
  biome[i]=b;
 }
 mark('biomes');
 // ---- special sites and tracks
 const sites=[];
 const nearestRoadPoint=(x,z,kinds=['main','minor'])=>{let best=null;for(const r of roads){if(!kinds.includes(r.kind))continue;for(let q=0;q<r.n;q+=2){const d=Math.hypot(r.xz[q*2]-x,r.xz[q*2+1]-z);if(!best||d<best.d)best={d,x:r.xz[q*2],z:r.xz[q*2+1],road:r.id,q};}}return best;};
 const flatSpot=(x,z,rad=36)=>{let best=null;for(let a=0;a<24;a++){const ang=a*.785,rr=(a>>3)*rad;const X=x+Math.cos(ang)*rr,Z=z+Math.sin(ang)*rr;const i=clamp(Math.floor((Z+half)/cell),0,N-1)*N+clamp(Math.floor((X+half)/cell),0,N-1);if(lakeId[i]>=0||wdist[i]<40)continue;const s=slope[i];if(!best||s<best.s)best={x:X,z:Z,s};}return best||{x,z,s:1};};
 {
  // fire station: town nearest the scrub/forest belt ; hospital: another town edge
  const townScore=t=>{let f=0;const X=Math.floor((t.x+half)/cell),Z=Math.floor((t.z+half)/cell);for(let dz=-60;dz<=60;dz+=6)for(let dx=-60;dx<=60;dx+=6){const k=clamp(Z+dz,0,N-1)*N+clamp(X+dx,0,N-1);f+=forest[k]+scrub[k];}return f;};
  const ts=[...towns].map((t,i)=>({t,i,s:townScore(t)})).sort((a,b)=>b.s-a.s);
  if(ts[0]){const t=ts[0].t,p=flatSpot(t.x+60,t.z+40,20);sites.push({type:'fire-station',name:`${t.name.split(' ')[0]} Fire Station`,x:p.x,z:p.z,town:ts[0].i});}
  const ht=ts[ts.length-1]||ts[0];if(ht){const t=ht.t,p=flatSpot(t.x-90,t.z-70,24);sites.push({type:'hospital',name:`${t.name.split(' ')[0]} Field Hospital`,x:p.x,z:p.z,town:ht.i,helipad:true});}
  // staging area: open low ground far from the mountains
  let best=null;for(let k=0;k<400;k++){const X=-half+400+R()*(WORLD.size-800),Z=-half+400+R()*(WORLD.size-800);const i=Math.floor((Z+half)/cell)*N+Math.floor((X+half)/cell);if(lakeId[i]>=0||wdist[i]<150||slope[i]>.05||forest[i]>.3)continue;const u=(X*mdx+Z*mdz)/half;const sc=-u+hash2(k,3,seed)*.3-Math.min(...towns.map(t=>Math.hypot(t.x-X,t.z-Z)))/-4000;if(towns.some(t=>Math.hypot(t.x-X,t.z-Z)<500))continue;if(!best||sc>best.sc)best={x:X,z:Z,sc};}
  if(best)sites.push({type:'staging',name:'Forward Staging Area',x:best.x,z:best.z});
  // ranger lookout: a high point with moderate slope toward the mountain side, not the highest peaks
  best=null;for(let k=0;k<600;k++){const X=-half+300+R()*(WORLD.size-600),Z=-half+300+R()*(WORLD.size-600);const i=Math.floor((Z+half)/cell)*N+Math.floor((X+half)/cell);if(slope[i]>.22||h[i]>560||snow[i]>.2)continue;let prom=0;for(let a=0;a<8;a++){const d=hAt(X+Math.cos(a*.785)*300,Z+Math.sin(a*.785)*300);prom+=h[i]-d;}if(prom<40*8)continue;const sc=prom/8+h[i]*.2;if(!best||sc>best.sc)best={x:X,z:Z,sc};}
  if(best)sites.push({type:'lookout',name:'Signal Ridge Lookout',x:best.x,z:best.z});
  // trailheads at forest edges near roads
  let th=0;for(let k=0;k<800&&th<2;k++){const r=roads[Math.floor(R()*roads.length)];if(!r)break;const q=Math.floor(R()*r.n);const X=r.xz[q*2],Z=r.xz[q*2+1];const i=clamp(Math.floor((Z+half)/cell),0,N-1)*N+clamp(Math.floor((X+half)/cell),0,N-1);let f=0;for(let a=0;a<8;a++){const k2=clamp(Math.floor((Z+Math.sin(a)*150+half)/cell),0,N-1)*N+clamp(Math.floor((X+Math.cos(a)*150+half)/cell),0,N-1);f+=forest[k2];}if(f<3.5||towns.some(t=>Math.hypot(t.x-X,t.z-Z)<600)||sites.some(s=>Math.hypot(s.x-X,s.z-Z)<900))continue;const p=flatSpot(X+18,Z+18,12);sites.push({type:'trailhead',name:['Pinecone','Falls','Long Ridge','Owl Creek'][th]+' Trailhead',x:p.x,z:p.z});th++;}
  // tracks from each non-town site to the nearest road
  for(const s of sites){if(s.type==='fire-station'||s.type==='hospital')continue;const rp=nearestRoadPoint(s.x,s.z);if(!rp||rp.d<25)continue;const p=astar(s.x,s.z,rp.x,rp.z,c=>roadUse[c]);if(p){p[0]=[s.x,s.z];p[p.length-1]=[rp.x,rp.z];const r=buildRoad(p,'track',`${s.name} track`);if(r)s.track=r.id;}}
 }
 mark('sites');
 // ---- buildings in towns
 onProgress({stage:'Raising barns and houses',p:.97});
 const buildings=[];
 for(let ti=0;ti<towns.length;ti++){
  const t=towns[ti],br=rng(seed*31+ti*977);const nearRoads=roads.filter(r=>r.kind!=='track');
  const placed=[];const tryPlace=(b)=>{for(const o of placed)if(Math.hypot(o.x-b.x,o.z-b.z)<(Math.max(o.w,o.d)+Math.max(b.w,b.d))*.62)return false;
   for(const r of roads){for(let q=0;q<r.n;q+=2){if(Math.hypot(r.xz[q*2]-b.x,r.xz[q*2+1]-b.z)<r.width*.5+Math.max(b.w,b.d)*.6+2)return false;}}
   const i=clamp(Math.floor((b.z+half)/cell),0,N-1)*N+clamp(Math.floor((b.x+half)/cell),0,N-1);if(lakeId[i]>=0||wdist[i]<25)return false;placed.push(b);return true;};
  // central civic buildings
  const types=['church','store','hall','house','house','house','house','house','barn','silo','house','house','watertower','house','barn','house','shed','house','house','shed'];
  for(let k=0;k<types.length;k++){
   const type=types[k];
   for(let tries=0;tries<30;tries++){
    // along the nearest road through town
    let rx=t.x,rz=t.z,ang=br()*6.28;
    let best=null;for(const r of nearRoads)for(let q=0;q<r.n;q+=3){const d=Math.hypot(r.xz[q*2]-t.x,r.xz[q*2+1]-t.z);if(d<t.r*(type==='barn'||type==='silo'?1.25:.95)&&br()<.05){best={r,q};}}
    if(best){const {r,q}=best,q2=Math.min(r.n-1,q+1),q1=Math.max(0,q-1),dx=r.xz[q2*2]-r.xz[q1*2],dz=r.xz[q2*2+1]-r.xz[q1*2+1],dl=Math.hypot(dx,dz)||1,side=br()<.5?-1:1;const off=r.width*.5+8+br()*10;rx=r.xz[q*2]-dz/dl*off*side;rz=r.xz[q*2+1]+dx/dl*off*side;ang=Math.atan2(dx,dz);}
    else{const a=br()*6.28,d=30+br()*t.r*.8;rx=t.x+Math.cos(a)*d;rz=t.z+Math.sin(a)*d;}
    const dims={house:[8+br()*4,9+br()*5,4.5+br()*2.5],church:[10,18,9],store:[12,14,5],hall:[14,18,6],barn:[12+br()*4,18+br()*6,8+br()*2],silo:[5,5,14+br()*6],watertower:[6,6,20],shed:[5,6,3.5]}[type];
    const b={type,x:rx,z:rz,w:dims[0],d:dims[1],h:dims[2],rot:ang+(br()<.2?Math.PI/2:0),y:t.y,town:ti,seed:Math.floor(br()*1e6)};
    if(tryPlace(b)){buildings.push(b);break;}
   }
  }
  // site buildings
  for(const s of sites)if(s.town===ti){const kind=s.type==='fire-station'?'firestation':'clinic';const b={type:kind,x:s.x,z:s.z,w:kind==='firestation'?16:14,d:kind==='firestation'?20:22,h:kind==='firestation'?7:6,rot:0,y:t.y,town:ti,seed:ti};buildings.push(b);}
 }
 mark('buildings');
 // ---- pack
 onProgress({stage:'Ready',p:1});
 const f32=a=>a instanceof Float32Array?a:new Float32Array(a);
 const u8=a=>{const o=new Uint8Array(a.length);for(let i=0;i<a.length;i++)o[i]=clamp(Math.round(a[i]*255),0,255);return o;};
 const world={version:GENERATOR_VERSION,seed,N,cell,half,size:WORLD.size,
  height:f32(h),lakeId,channelIndex:chRaster,wdist,roadDist,
  grids:{moisture:u8(moist),temperature:u8(temp),forest:u8(forest),farm:u8(farm),rock:u8(rock),marsh:u8(marsh),snow:u8(snow),scrub:u8(scrub),desert:u8(desert),dry:u8(dry),hard:u8(hard),slope:f32(slope)},
  biome,discharge:new Float32Array(Q.length).map((_,i)=>Q[i]/KM2),
  channels:chan.map(c=>({i:c.i,cls:c.cls,n:c.n,P:c.P,q:c.q,name:c.name,endCh:c.endCh,joinIdx:c.joinIdx??-1,endLake:c.endLake??-1,fromLake:c.fromLake??-1,length:c.length})),trunk,
  lakes,towns,roads,buildings,sites,provinces,inlet:[cx(inlet),cz(inlet)],outlet:{side:outletSide,t:outletT},timings};
 timings.total=Date.now()-T0;
 return world;
}
// Transferables for postMessage.
export function transferList(w){const list=[w.height.buffer,w.lakeId.buffer,w.channelIndex.buffer,w.wdist.buffer,w.roadDist.buffer,w.biome.buffer,w.discharge.buffer];for(const k in w.grids)list.push(w.grids[k].buffer);for(const c of w.channels)list.push(c.P.buffer);for(const r of w.roads){list.push(r.xz.buffer,r.y.buffer);}return list;}
