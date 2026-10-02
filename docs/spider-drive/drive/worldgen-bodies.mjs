// Off-world generators: the floor of a mare crater on the Moon, the lava plains under the Olympus Mons
// scarp on Mars, and the equatorial dune country of Titan with a methane lake. Each returns the same
// world record the Earth generator does (drive/worldgen.mjs), so terrain, scenery, map and missions
// read it unchanged; the body-specific parts ride in `body`, `biomeLabels`, `biomeRGB`, `craters`,
// `rangeOut` and the site and building types. Pure JS: runs in the worker and in Node.
import {Noise,rng,hash2,clamp,mix,smoothstep} from './noise.mjs';
import {GENERATOR_VERSION,WORLD,bilinear} from './worldgen.mjs';

const {half,N,cell}=WORLD;
const idx=(x,z)=>clamp(Math.floor((z+half)/cell),0,N-1)*N+clamp(Math.floor((x+half)/cell),0,N-1);
// A crater's relief at distance d from its centre: parabolic bowl to a raised rim, ejecta falling off as
// (r/d)^3 to about 2.5 radii. depth/diameter 0.2 and rim 0.04 D when fresh (Pike 1977); degraded ones
// are shallower with softened rims.
export function craterRelief(d,D,fresh){const r=D*.5,dep=D*(.06+.14*fresh),rim=D*(.012+.028*fresh);
 if(d<r){const u=d/r;return -dep+(dep+rim)*u*u*(fresh>.5?1:(.6+.4*u));}
 if(d<r*2.6){const k=r/d;return rim*k*k*k*smoothstep(2.6,1.6,d/r);}return 0;}
// resample a polyline every 4 m and build a track record with a smoothed, grade-limited profile
function track(id,name,pts,hAt,gmax=.22){
 let P=pts;for(let pass=0;pass<2;pass++){const o=[P[0]];for(let k=0;k<P.length-1;k++){const p=P[k],q=P[k+1];o.push([p[0]*.75+q[0]*.25,p[1]*.75+q[1]*.25],[p[0]*.25+q[0]*.75,p[1]*.25+q[1]*.75]);}o.push(P[P.length-1]);P=o;}
 const rs=[P[0]];for(let k=1;k<P.length;k++){let a=rs[rs.length-1];const b=P[k];let d=Math.hypot(b[0]-a[0],b[1]-a[1]);while(d>=4){const t=4/d;a=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];rs.push(a);d-=4;}}rs.push(P[P.length-1]);
 const n=rs.length,prof=new Float32Array(n);for(let k=0;k<n;k++)prof[k]=hAt(rs[k][0],rs[k][1]);
 const sm=new Float32Array(n);for(let k=0;k<n;k++){let s=0,c=0;for(let j=-5;j<=5;j++){const q=clamp(k+j,0,n-1);s+=prof[q];c++;}sm[k]=s/c;}
 for(let it=0;it<3;it++){for(let q=1;q<n;q++)sm[q]=clamp(sm[q],sm[q-1]-gmax*4,sm[q-1]+gmax*4);for(let q=n-2;q>=0;q--)sm[q]=clamp(sm[q],sm[q+1]-gmax*4,sm[q+1]+gmax*4);}
 const xz=new Float32Array(n*2);for(let q=0;q<n;q++){xz[q*2]=rs[q][0];xz[q*2+1]=rs[q][1];}
 return {id,kind:'track',name,width:4.2,n,xz,y:sm,bridges:[]};
}
// a gently wandering line between two points (tracks are not ruler straight)
function wander(a,b,noise,amp){const L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(2,Math.ceil(L/60)),nx=-(b[1]-a[1])/L,nz=(b[0]-a[0])/L,out=[];
 for(let k=0;k<=n;k++){const t=k/n,w=Math.sin(t*Math.PI)*noise.fbm(t*2.3+a[0]*.001,a[1]*.001,2)*amp;out.push([a[0]+(b[0]-a[0])*t+nx*w,a[1]+(b[1]-a[1])*t+nz*w]);}return out;}
function pack(seed,body,h,grids,biome,extra){
 const u8=a=>{const o=new Uint8Array(a.length);for(let i=0;i<a.length;i++)o[i]=clamp(Math.round(a[i]*255),0,255);return o;};
 const M=N*N,g={};for(const k of ['moisture','temperature','forest','farm','rock','marsh','snow','scrub','desert','dry','hard'])g[k]=u8(grids[k]||new Float32Array(M));
 g.slope=grids.slope;
 return {version:GENERATOR_VERSION,seed,body,N,cell,half,size:WORLD.size,height:h,lakeId:extra.lakeId||new Int32Array(M).fill(-1),channelIndex:new Int32Array(M).fill(-1),wdist:new Float32Array(M).fill(1e4),roadDist:new Float32Array(M).fill(1e4),
  grids:g,biome,discharge:new Float32Array(M),channels:extra.channels||[],trunk:-1,lakes:extra.lakes||[],towns:[],roads:extra.roads||[],buildings:extra.buildings||[],sites:extra.sites||[],
  provinces:{mountain:extra.mountain||[1,0],dry:[0,1],wet:[0,-1],wind:extra.wind||[.6,.3]},inlet:[0,0],outlet:{side:0,t:.5},timings:{},
  biomeLabels:extra.biomeLabels,biomeRGB:extra.biomeRGB,craters:extra.craters||[],rangeOut:extra.rangeOut,names:extra.names||{}};
}
function slopeGrid(h){const s=new Float32Array(N*N);for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=h[j*N+Math.min(N-1,i+1)]-h[j*N+Math.max(0,i-1)],b=h[Math.min(N-1,j+1)*N+i]-h[Math.max(0,j-1)*N+i];s[j*N+i]=Math.hypot(a,b)/(2*cell);}return s;}
// a flat spot near (x,z): lowest slope within rad
function flatNear(h,sl,x,z,rad){let best=null;for(let a=0;a<32;a++){const ang=a*.196,rr=(a>>3)*rad/3;const X=x+Math.cos(ang)*rr,Z=z+Math.sin(ang)*rr;if(Math.abs(X)>half-200||Math.abs(Z)>half-200)continue;const s=sl[idx(X,Z)];if(!best||s<best.s)best={x:X,z:Z,s};}return best||{x,z};}
// habitat cluster: modules, tanks, arrays, a pad, an antenna; building records the scenery knows how to draw
function base(x,z,y,rot,body,R){
 const B=[],add=(type,lx,lz,w,d,hh,r=0)=>{const c=Math.cos(rot),s=Math.sin(rot);B.push({type,x:x+lx*c+lz*s,z:z-lx*s+lz*c,w,d,h:hh,rot:rot+r,y,town:0,seed:Math.floor(R()*1e6)});};
 add('hab',0,0,5,16,4.6);add('hab',8,2,5,14,4.6);add('hab',-8,-1,5,12,4.6);add('node',4,8,6,6,5.2);add('node',-4,-8,6,6,5.2);
 add('tank',16,-8,4,4,6);add('tank',21,-8,4,4,6);add('airlock',0,-11,4,5,3.4);
 for(let k=0;k<(body==='mars'?6:body==='moon'?5:2);k++)add('array',-30+k*7,22,6,14,2.4);
 add('antenna',26,14,2,2,14);add('pad',0,-46,30,30,.2);if(body==='titan')add('dome',14,-2,12,12,7);if(body==='moon')add('berm',0,30,46,6,3);
 return B;}

// ------------------------------------------------------------------ the Moon
export function generateMoon(seed,onProgress=()=>{}){
 const R=rng(seed*7919+31),noise=new Noise(seed+900),n2=new Noise(seed+901);const M=N*N,h=new Float32Array(M);
 onProgress({stage:'Laying the mare floor',p:.05});
 // mare floor inside a 20 km complex crater: gentle undulation, a wrinkle ridge, the terraced wall beyond the map
 const ridgeA=R()*Math.PI,rc=Math.cos(ridgeA),rs=Math.sin(ridgeA);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=-half+(i+.5)*cell,z=-half+(j+.5)*cell;
  let v=noise.fbm(x/1800,z/1800,4)*14+n2.fbm(x/420,z/420,3)*3.5;
  const u=x*rc+z*rs+noise.fbm(x/900,z/900,2)*260;v+=28*Math.exp(-(u*u)/(2*160*160))*(.6+.4*n2.fbm(x/700,z/700,2));/* wrinkle ridge */
  h[j*N+i]=v;}
 // crater population: power law from 70 m to 1500 m, a few fresh with rays
 onProgress({stage:'Cratering',p:.3});
 const craters=[];for(let k=0;k<150;k++){const u=R();const D=clamp(70*Math.pow(1/(1-u*.995),1/1.7),70,1500);const x=(R()*2-1)*(half+600),z=(R()*2-1)*(half+600);const fresh=R()<.07?.75+R()*.25:R()<.5?.12+R()*.25:.3+R()*.3;craters.push({x,z,D,fresh,name:''});}
 craters.sort((a,b)=>b.D-a.D);const names=['Harlan','Osgood','Tamsin','Brill','Kesteven','Varda','Mallory','Aldous'];craters.slice(0,8).forEach((c,i)=>c.name=names[i]);
 for(const c of craters){const reach=c.D*1.35;const i0=Math.max(0,Math.floor((c.x-reach+half)/cell)),i1=Math.min(N-1,Math.ceil((c.x+reach+half)/cell)),j0=Math.max(0,Math.floor((c.z-reach+half)/cell)),j1=Math.min(N-1,Math.ceil((c.z+reach+half)/cell));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=-half+(i+.5)*cell,z=-half+(j+.5)*cell;const d=Math.hypot(x-c.x,z-c.z);h[j*N+i]+=craterRelief(d,c.D,c.fresh);}}
 const sl=slopeGrid(h);
 // grids: 'dry' carries ray brightness, 'rock' boulder density (fresh ejecta and ridge), 'hard' packed ground
 const ray=new Float32Array(M),rock=new Float32Array(M),hard=new Float32Array(M),biome=new Uint8Array(M);
 const freshC=craters.filter(c=>c.fresh>.7&&c.D>250);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=-half+(i+.5)*cell,z=-half+(j+.5)*cell,k=j*N+i;let rb=0,rk=.02+sl[k]*.6;
  for(const c of freshC){const d=Math.hypot(x-c.x,z-c.z),r=c.D*.5;if(d<r*9){const a=Math.atan2(z-c.z,x-c.x);const rays=Math.pow(Math.max(0,Math.cos(a*7+c.x*.01)*.5+.5),6)*.7+Math.pow(Math.max(0,Math.cos(a*11+c.z*.01)*.5+.5),8)*.5;rb=Math.max(rb,smoothstep(9,1.2,d/r)*(d<r*1.6?1:rays));rk=Math.max(rk,smoothstep(2.6,1,d/r)*.8);}}
  for(const c of craters){if(c.fresh<=.7&&c.D>400){const d=Math.hypot(x-c.x,z-c.z)/(c.D*.5);if(d>.9&&d<1.5)rk=Math.max(rk,.25*c.fresh);}}
  ray[k]=rb;rock[k]=clamp(rk+noise.fbm(x/300,z/300,2)*.08,0,1);hard[k]=.3+.4*smoothstep(0,.06,sl[k]);
  let b=0;for(const c of craters){if(c.D<200)continue;const d=Math.hypot(x-c.x,z-c.z)/(c.D*.5);if(d<.85){b=2;break;}if(d<1.25){b=3;break;}}if(!b&&rb>.25)b=1;biome[k]=b;}
 // base on a flat near the centre, sites out in the country, tracks between them
 onProgress({stage:'Setting up the base',p:.75});
 const hAt=(x,z)=>bilinear(h,N,(x+half)/cell-.5,(z+half)/cell-.5);
 const b0=flatNear(h,sl,R()*600-300,R()*600-300,400);const big=craters.find(c=>c.D>700&&Math.hypot(c.x,c.z)<2200)||craters[0];
 const sites=[{type:'staging',name:'Harlan Base',x:b0.x,z:b0.z},{type:'landing',name:'Landing pad',x:b0.x+Math.cos(R()*6)*420,z:b0.z+Math.sin(R()*6)*420}];
 {const a=Math.atan2(b0.z-big.z,b0.x-big.x);sites.push({type:'rim',name:`${big.name} rim`,x:big.x+Math.cos(a)*big.D*.52,z:big.z+Math.sin(a)*big.D*.52,crater:big});}
 const fc=freshC[0];if(fc)sites.push({type:'fresh',name:`${fc.name||'Fresh'} crater`,x:fc.x+fc.D*.6,z:fc.z});
 {const a=R()*6.28;const p=flatNear(h,sl,Math.cos(a)*2100,Math.sin(a)*2100,300);sites.push({type:'relay',name:'Relay mast',x:p.x,z:p.z});}
 {const a=R()*6.28;const p=flatNear(h,sl,Math.cos(a)*1500,Math.sin(a)*1500,300);sites.push({type:'lander',name:'Old descent stage',x:p.x,z:p.z});}
 const roads=[];for(const s of sites.slice(1)){roads.push(track(roads.length,`${s.name} track`,wander([b0.x,b0.z],[s.x,s.z],noise,90),hAt,.2));}
 const buildings=base(b0.x,b0.z,hAt(b0.x,b0.z),R()*6.28,'moon',R);
 const grids={rock,dry:ray,hard,slope:sl,desert:new Float32Array(M),moisture:new Float32Array(M),temperature:new Float32Array(M)};
 onProgress({stage:'Ready',p:1});
 return pack(seed,'moon',h,grids,biome,{roads,buildings,sites,craters,wind:[0,0],biomeLabels:['Mare floor','Ray-dusted mare','Crater floor','Crater rim'],biomeRGB:[[86,86,84],[132,132,128],[70,70,68],[110,110,106]],rangeOut:{type:'craterWall',r0:half+900,h:1800},names:{liquid:null}});
}

// ------------------------------------------------------------------ Mars
export function generateMars(seed,onProgress=()=>{}){
 const R=rng(seed*7919+37),noise=new Noise(seed+910),n2=new Noise(seed+911);const M=N*N,h=new Float32Array(M);
 const sa=R()*Math.PI*2,sdx=Math.cos(sa),sdz=Math.sin(sa);/* toward the scarp */
 onProgress({stage:'Laying the lava plains',p:.05});
 // lobes: elongated raised flows with levees running down from the scarp side
 const lobes=[];for(let k=0;k<9;k++){const t=(R()-.5)*2*half*.9;const ox=-sdz*t,oz=sdx*t;lobes.push({ox,oz,w:220+R()*420,hgt:8+R()*22,ph:R()*6.28,len:1800+R()*3000});}
 const craters=[];for(let k=0;k<45;k++){const u=R();const D=clamp(80*Math.pow(1/(1-u*.99),1/1.9),80,900);craters.push({x:(R()*2-1)*(half+400),z:(R()*2-1)*(half+400),D,fresh:.1+R()*.3,name:''});}
 craters.sort((a,b)=>b.D-a.D);['Perrin','Lowell','Vane','Tessera','Ortega'].forEach((n,i)=>{if(craters[i])craters[i].name=n;});
 const desert=new Float32Array(M),rock=new Float32Array(M),hard=new Float32Array(M),biome=new Uint8Array(M);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=-half+(i+.5)*cell,z=-half+(j+.5)*cell,k=j*N+i;
  const u=(x*sdx+z*sdz)/half;/* -1 away .. +1 toward the scarp */
  let v=u*55+noise.fbm(x/2200,z/2200,4)*22+n2.fbm(x/380,z/380,3)*3;
  let lobe=0;for(const L of lobes){const along=(x*sdx+z*sdz),across=(x-sdx*along-L.ox)*-sdz+(z-sdz*along-L.oz)*sdx;const wob=noise.fbm(along/900+L.ph,L.ph,2)*180;const a=Math.abs(across+wob)/L.w;if(a<1){const prof=(1-a*a)*(1+.35*Math.exp(-((a-.82)*(a-.82))/.01));lobe=Math.max(lobe,prof*L.hgt*smoothstep(-1,-.1,u)*(.7+.3*n2.fbm(along/600,L.ph,2)));}}
  v+=lobe;
  // wrinkle ridges across the plain
  const w1=(x*-sdz+z*sdx)+noise.fbm(x/700,z/700,2)*300;{const q=((w1%2600+2600)%2600-1300);v+=18*Math.exp(-(q*q)/(2*120*120))*smoothstep(.5,-.3,u);}
  // the basal scarp: terraced rise beginning 1.1 km inside the map edge
  const sc=smoothstep(.62,1.05,u+noise.fbm(x/1400,z/1400,2)*.08);v+=sc*sc*1500+sc*noise.ridged(x/500,z/500,3)*120;
  h[k]=v;
  // dark sand in the lee of ridges and lobes, dust elsewhere
  const d=smoothstep(.45,.75,n2.fbm(x/520+3,z/520,3)*.5+.5)*smoothstep(.3,0,sc);desert[k]=d;
  rock[k]=clamp(smoothstep(2,12,lobe)*.5+sc*.9+noise.fbm(x/260,z/260,2)*.1,0,1);hard[k]=.5;}
 for(const c of craters){const reach=c.D*1.35;const i0=Math.max(0,Math.floor((c.x-reach+half)/cell)),i1=Math.min(N-1,Math.ceil((c.x+reach+half)/cell)),j0=Math.max(0,Math.floor((c.z-reach+half)/cell)),j1=Math.min(N-1,Math.ceil((c.z+reach+half)/cell));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=-half+(i+.5)*cell,z=-half+(j+.5)*cell;h[j*N+i]+=craterRelief(Math.hypot(x-c.x,z-c.z),c.D,c.fresh)*.8;}}
 const sl=slopeGrid(h);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i,x=-half+(i+.5)*cell,z=-half+(j+.5)*cell;const u=(x*sdx+z*sdz)/half;biome[k]=u>.62?3:desert[k]>.5?1:rock[k]>.45?2:0;if(sl[k]>.5)rock[k]=Math.max(rock[k],.8);}
 onProgress({stage:'Raising the colony',p:.75});
 const hAt=(x,z)=>bilinear(h,N,(x+half)/cell-.5,(z+half)/cell-.5);
 const b0=flatNear(h,sl,-sdx*400+(R()-.5)*400,-sdz*400+(R()-.5)*400,500);
 const sites=[{type:'staging',name:'Tharsis Station',x:b0.x,z:b0.z},{type:'landing',name:'Landing field',x:b0.x-sdx*500+sdz*120,z:b0.z-sdz*500-sdx*120}];
 sites.push({type:'scarp',name:'Scarp foot overlook',x:sdx*(half*.6)+sdz*(R()-.5)*800,z:sdz*(half*.6)-sdx*(R()-.5)*800});
 {const c=craters[0];sites.push({type:'rim',name:`${c.name} crater rim`,x:c.x+c.D*.55,z:c.z,crater:c});}
 {const a=R()*6.28;const p=flatNear(h,sl,Math.cos(a)*1800,Math.sin(a)*1800,300);sites.push({type:'rover',name:'Abandoned rover',x:p.x,z:p.z});}
 {const a=R()*6.28;const p=flatNear(h,sl,Math.cos(a)*1300,Math.sin(a)*1300,300);sites.push({type:'drill',name:'Ice drill site',x:p.x,z:p.z});}
 const roads=[];for(const s of sites.slice(1)){roads.push(track(roads.length,`${s.name} track`,wander([b0.x,b0.z],[s.x,s.z],noise,120),hAt,.2));}
 const buildings=base(b0.x,b0.z,hAt(b0.x,b0.z),R()*6.28,'mars',R);
 const grids={rock,desert,hard,slope:sl,dry:new Float32Array(M).fill(.6),moisture:new Float32Array(M),temperature:new Float32Array(M)};
 onProgress({stage:'Ready',p:1});
 return pack(seed,'mars',h,grids,biome,{roads,buildings,sites,craters,wind:[-sdz*.8,sdx*.8],mountain:[sdx,sdz],biomeLabels:['Dust plain','Dune field','Lava flow','Scarp foot'],biomeRGB:[[178,124,82],[96,74,58],[150,104,70],[132,94,66]],rangeOut:{type:'scarp',dir:[sdx,sdz],h:6500}});
}

// ------------------------------------------------------------------ Titan
export function generateTitan(seed,onProgress=()=>{}){
 const R=rng(seed*7919+41),noise=new Noise(seed+920),n2=new Noise(seed+921);const M=N*N,h=new Float32Array(M);
 const wa=R()*Math.PI*2,wx=Math.cos(wa),wz=Math.sin(wa);/* dunes run along the wind */
 onProgress({stage:'Blowing the dunes',p:.05});
 const lakeC=[(R()-.5)*1600,(R()-.5)*1600];const lakeR=1150+R()*300;
 const desert=new Float32Array(M),rock=new Float32Array(M),moist=new Float32Array(M),biome=new Uint8Array(M);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=-half+(i+.5)*cell,z=-half+(j+.5)*cell,k=j*N+i;
  const along=x*wx+z*wz,across=-x*wz+z*wx+noise.fbm(along/2600,.3,2)*420;
  const amp=70+40*n2.fbm(along/2400,across/5000,2);const ph=across/1900*6.283;
  let dune=amp*Math.pow(Math.max(0,Math.cos(ph)),1.6)*(.75+.25*noise.fbm(along/900,across/900,3));
  const flats=n2.fbm(x/600,z/600,3)*4+noise.fbm(x/140,z/140,2)*.8;
  let v=12+dune+flats+noise.fbm(x/3200,z/3200,3)*30;
  // the lake basin
  // the lake basin: dunes die out over the outer third, the floor is flat and 9 m under the liquid level
  const dl=Math.hypot(x-lakeC[0],z-lakeC[1]);const bowl=smoothstep(lakeR*1.3,lakeR*.85,dl);v=mix(v,-18+flats*.4,bowl);
  h[k]=v;desert[k]=smoothstep(8,40,dune)*(1-bowl);rock[k]=clamp(smoothstep(12,2,dune)*(.35+.35*n2.fbm(x/300,z/300,2))*(1-bowl)+bowl*(.45+.3*n2.fbm(x/220+9,z/220,2)),0,1);/* the basin floor is a cobble plain, Huygens style */}
 const sl=slopeGrid(h);
 // the lake: cells below level inside the basin
 const level=-9;const lakeId=new Int32Array(M).fill(-1);for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i,x=-half+(i+.5)*cell,z=-half+(j+.5)*cell;if(h[k]<level&&Math.hypot(x-lakeC[0],z-lakeC[1])<lakeR*1.7)lakeId[k]=0;}
 const lakes=[{id:0,level,x:lakeC[0],z:lakeC[1],r:lakeR,name:'Kraken Minor',pond:false,outflow:[lakeC[0],lakeC[1]]}];
 // methane channels: from the interdune flats down into the lake, following the grid downhill
 onProgress({stage:'Cutting the channels',p:.5});
 const hAt=(x,z)=>bilinear(h,N,(x+half)/cell-.5,(z+half)/cell-.5);
 const channels=[];const CN=['Vid Flumina','Elivagar','Hubur','Celadon'];
 for(let c=0;c<4;c++){const a=c/4*6.283+R()*.8,sx=lakeC[0]+Math.cos(a)*(lakeR*1.9+R()*900),sz=lakeC[1]+Math.sin(a)*(lakeR*1.9+R()*900);
  const pts=[];let x=sx,z=sz;for(let s=0;s<600;s++){pts.push([x,z,hAt(x,z)]);if(lakeId[idx(x,z)]>=0||Math.abs(x)>half-60||Math.abs(z)>half-60)break;
   const e=6,gx=(hAt(x+e,z)-hAt(x-e,z))/(2*e),gz=(hAt(x,z+e)-hAt(x,z-e))/(2*e);let l=Math.hypot(gx,gz);const tx=x-lakeC[0],tz=z-lakeC[1],tl=Math.hypot(tx,tz)||1;
   let dx=-gx/(l||1)*.7-tx/tl*.5+noise.fbm(x/150,z/150,2)*.4,dz=-gz/(l||1)*.7-tz/tl*.5+noise.fbm(z/150+5,x/150,2)*.4;const dl=Math.hypot(dx,dz)||1;x+=dx/dl*8;z+=dz/dl*8;}
  if(pts.length<25)continue;const n=pts.length,P=new Float32Array(n*8);let lv=1e9;
  for(let k=0;k<n;k++){const [px,pz,ph]=pts[k];lv=Math.min(lv,ph-.2);const t=k/n;const w=5+9*t,dep=.8+1.2*t;const o=k*8;P[o]=px;P[o+1]=pz;P[o+2]=Math.max(lv,level);P[o+3]=w;P[o+4]=dep;P[o+5]=.4+t;P[o+6]=.35;P[o+7]=0;}
  channels.push({i:channels.length,cls:k2cls(n),n,P,q:.6,name:CN[c],endCh:-1,joinIdx:-1,endLake:0,fromLake:-1,length:n*8});}
 function k2cls(n){return n>250?2:1;}
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i;biome[k]=lakeId[k]>=0?3:desert[k]>.4?0:rock[k]>.3?1:2;moist[k]=lakeId[k]>=0?1:0;}
 onProgress({stage:'Building the station',p:.8});
 const sa=R()*6.28;const b0=flatNear(h,sl,lakeC[0]+Math.cos(sa)*(lakeR*1.32),lakeC[1]+Math.sin(sa)*(lakeR*1.32),250);
 const sites=[{type:'staging',name:'Shoreline Station',x:b0.x,z:b0.z},{type:'landing',name:'Landing pad',x:b0.x+Math.cos(sa+1.2)*380,z:b0.z+Math.sin(sa+1.2)*380}];
 // the shore marker stands where the ground meets the liquid
 {let d=lakeR*1.3;while(d>lakeR*.5&&hAt(lakeC[0]+Math.cos(sa)*d,lakeC[1]+Math.sin(sa)*d)>level+.6)d-=10;sites.push({type:'shore',name:'Kraken Minor shore',x:lakeC[0]+Math.cos(sa)*(d+25),z:lakeC[1]+Math.sin(sa)*(d+25)});}
 {let best=null;for(let k=0;k<400;k++){const x=(R()*2-1)*2400,z=(R()*2-1)*2400;const v=hAt(x,z);if(!best||v>best.v)best={x,z,v};}sites.push({type:'crest',name:'Dune crest',x:best.x,z:best.z});}
 {const a=R()*6.28;const p=flatNear(h,sl,Math.cos(a)*1700,Math.sin(a)*1700,400);sites.push({type:'probe',name:'Huygens-class probe',x:p.x,z:p.z});}
 if(channels[0]){const c=channels[0],k=Math.floor(c.n*.5);sites.push({type:'channel',name:`${c.name} bend`,x:c.P[k*8]+30,z:c.P[k*8+1]});}
 const roads=[];for(const s of sites.slice(1)){if(s.type==='crest')continue;roads.push(track(roads.length,`${s.name} track`,wander([b0.x,b0.z],[s.x,s.z],noise,100),hAt,.2));}
 const buildings=base(b0.x,b0.z,hAt(b0.x,b0.z),R()*6.28,'titan',R);
 const grids={rock,desert,moisture:moist,hard:new Float32Array(M).fill(.4),slope:sl,dry:new Float32Array(M),temperature:new Float32Array(M)};
 onProgress({stage:'Ready',p:1});
 return pack(seed,'titan',h,grids,biome,{roads,buildings,sites,lakes,lakeId,channels,wind:[wx*.5,wz*.5],biomeLabels:['Dune','Cobble flat','Interdune','Methane lake'],biomeRGB:[[92,66,38],[150,118,78],[122,92,56],[38,30,22]],rangeOut:{type:'dunes',dir:[wx,wz]},names:{liquid:'methane'}});
}
export function generateBody(body,seed,onProgress){return body==='moon'?generateMoon(seed,onProgress):body==='mars'?generateMars(seed,onProgress):generateTitan(seed,onProgress);}
