// Module worker: terrain LOD node meshes and vegetation chunk lists, built off the main thread.
import {Terrain,ROAD} from './terrain.mjs';
import {placeChunk,SPECIES} from './vegetation.mjs';
import {smoothstep,clamp,mix} from './noise.mjs';
let t=null;
self.onmessage=e=>{
 const m=e.data;
 if(m.type==='init'){t=new Terrain(m.world);self.postMessage({type:'ready'});return;}
 if(!t)return;
 if(m.type==='node'){const r=buildNode(m.x0,m.z0,m.size,m.n||32);self.postMessage({type:'node',key:m.key,...r},[r.pos.buffer,r.nrm.buffer,r.col.buffer,r.spl.buffer,r.ext.buffer,r.idx.buffer]);return;}
 if(m.type==='veg'){const lists=placeChunk(t,m.cx,m.cz,{nearOnly:m.nearOnly,far:m.far});self.postMessage({type:'veg',key:m.key,nearOnly:m.nearOnly,lists},lists.filter(Boolean).map(a=>a.buffer));return;}
 if(m.type==='flood'){t.floodBoost=m.boost;return;}
 if(m.type==='tile'){const S=65,a=new Float32Array(S*S),x0=m.tx*64,z0=m.tz*64;for(let j=0;j<S;j++)for(let i=0;i<S;i++)a[j*S+i]=t.height(x0+i,z0+j);self.postMessage({type:'tile',tx:m.tx,tz:m.tz,a},[a.buffer]);return;}
};
// splat weights off Earth. The texture slots are remapped per body by the material (bodies.mjs layers):
// "grass" is the body's plain ground, dirt its disturbed/packed ground, sand its dune sand, rock its bedrock.
// The tint channel still colours the plain ground: rays brighten the Moon, dust reddens Mars, light shifts Titan.
function bodySplat(t,x,z,h,hx,hz,wt,col,spl,ext,o){
 const sl=Math.sqrt(hx*hx+hz*hz),b=t.body;let dirt=0,sand=0,rock=0,snow=0,cr=1,cg=1,cb=1,wet=0;
 const inside=t.inside(x,z);
 if(b==='moon'){rock=Math.max(wt.rock*.9,smoothstep(.35,.7,sl));const ray=inside?t.grid('dry',x,z):0;const hard=inside?t.grid('hard',x,z):.4;
  dirt=smoothstep(.5,.8,hard)*.5;/* packed ground reads darker */const k=.52+ray*.4+t.noise.fbm(x/23,z/23,2)*.05;cr=k;cg=k*.99;cb=k*.97;}
 else if(b==='mars'){rock=Math.max(wt.rock*.85,smoothstep(.4,.75,sl));sand=wt.desert*.95;const hard=inside?t.grid('hard',x,z):.5;dirt=smoothstep(.5,.75,hard)*.4*(1-sand);
  const k=.9+t.noise.fbm(x/40,z/40,2)*.1;cr=k*.78;cg=k*.54;cb=k*.37;}
 else{// titan
  sand=wt.desert;rock=Math.max(wt.rock*.8,smoothstep(.45,.8,sl))*(1-sand);
  const near=t.channelsNear(x,z,t._bn||(t._bn=[]));for(const c of near){const e=c.d-c.w*.5;wet=Math.max(wet,1-smoothstep(-.5,4,e));if(e<0)dirt=Math.max(dirt,.6);}
  if(inside){const k=Math.floor((z+t.half)/t.cell)*t.N+Math.floor((x+t.half)/t.cell),lk=t.w.lakeId[k];if(lk>=0){const L=t.w.lakes[lk].level;wet=Math.max(wet,1-smoothstep(L-.3,L+2,h));if(h<L+.8)dirt=Math.max(dirt,.7);}}
  const k=.9+t.noise.fbm(x/35,z/35,2)*.12;cr=k*.6;cg=k*.47;cb=k*.3;}
 let road=0;const r=t.roadNear(x,z);if(r&&r.d<ROAD.shoulder+1.5)road=(1-smoothstep(ROAD.shoulder-.6,ROAD.shoulder+.8,r.d))*.6;
 col[o]=clamp(cr,0,1)*255;col[o+1]=clamp(cg,0,1)*255;col[o+2]=clamp(cb,0,1)*255;col[o+3]=0;
 spl[o]=clamp(dirt,0,1)*255;spl[o+1]=clamp(sand,0,1)*255;spl[o+2]=clamp(rock,0,1)*255;spl[o+3]=clamp(snow,0,1)*255;
 ext[o]=road*255;ext[o+1]=clamp(wet,0,1)*255;ext[o+2]=0;ext[o+3]=0;
}
function buildNode(x0,z0,size,N){
 const st=size/N,V=N+1,B=V+2,H=new Float32Array(B*B),infoG=new Array(V*V);
 // coarse nodes: a vertex within half a cell of a creek sinks to the creek bed, so the water surface shows
 // through at every LOD (otherwise a 3 m creek falls between the samples and the mesh covers it)
 const sink=(x,z,h)=>{if(st<=1)return h;const near=t.channelsNear(x,z,t._bn2||(t._bn2=[]));for(const c of near){if(c.c.cls<1)continue;const hw=c.w*.5;if(c.d<hw+st*.6){const bed=c.level-c.dep*.7;if(bed<h)h=bed;}}return h;};
 for(let j=0;j<B;j++)for(let i=0;i<B;i++){const x=x0+(i-1)*st,z=z0+(j-1)*st;
  if(i>0&&j>0&&i<=V&&j<=V){const info={};H[j*B+i]=sink(x,z,t.height(x,z,info));infoG[(j-1)*V+i-1]=info;}else H[j*B+i]=sink(x,z,t.height(x,z));}
 const skirt=4*V,nv=V*V+skirt;
 const pos=new Float32Array(nv*3),nrm=new Int8Array(nv*3),col=new Uint8Array(nv*4),spl=new Uint8Array(nv*4),ext=new Uint8Array(nv*4);
 const wt={},wtr={};
 for(let j=0;j<V;j++)for(let i=0;i<V;i++){
  const v=j*V+i,x=x0+i*st,z=z0+j*st,h=H[(j+1)*B+i+1];
  const hx=(H[(j+1)*B+i+2]-H[(j+1)*B+i])/(2*st),hz=(H[(j+2)*B+i+1]-H[j*B+i+1])/(2*st),l=Math.hypot(hx,1,hz),ny=1/l;
  pos[v*3]=x;pos[v*3+1]=h;pos[v*3+2]=z;nrm[v*3]=Math.round(-hx/l*127);nrm[v*3+1]=Math.round(ny*127);nrm[v*3+2]=Math.round(-hz/l*127);
  const info=infoG[v];t.weights(x,z,wt);
  if(!t.earth){bodySplat(t,x,z,h,hx,hz,wt,col,spl,ext,v*4);continue;}
  const steep=smoothstep(.6,.86,1-ny)+smoothstep(.72,.5,ny)*.0;
  let rock=Math.max(wt.rock*.9,smoothstep(.5,.78,Math.sqrt(hx*hx+hz*hz)));if(info.terrace)rock=Math.max(rock,info.terrace*smoothstep(.25,.6,Math.sqrt(hx*hx+hz*hz))*smoothstep(3.5,7,info.riser||0));/* low steps stay grassy; only tall bands show rock */
  let dirt=wt.forest*.3,sand=wt.desert*.85+wt.dry*.25,snow=wt.snow*(1-smoothstep(.7,1.1,Math.sqrt(hx*hx+hz*hz)));
  // water margins
  let wet=wt.marsh*.7;const near=t.channelsNear(x,z,t._bn||(t._bn=[]));
  for(const c of near){const e=c.d-c.w*.5;if(c.c.cls>=1){wet=Math.max(wet,1-smoothstep(-.5,3+c.w*.25,e));if(e<2.5)sand=Math.max(sand,1-smoothstep(c.c.cls>=2?0:-.4,c.c.cls>=2?2.5:1.4,e));if(e<0)dirt=Math.max(dirt,.5);}else if(c.d<c.w*.5){dirt=Math.max(dirt,.8*(1-c.d/(c.w*.5)));rock=Math.max(rock,.25);}}
  if(t.inside(x,z)){const k=Math.floor((z+t.half)/t.cell)*t.N+Math.floor((x+t.half)/t.cell),lk=t.w.lakeId[k];if(lk>=0){const L=t.w.lakes[lk].level;wet=Math.max(wet,1-smoothstep(L-.2,L+1.5,h));if(h<L+.6)sand=Math.max(sand,.6);}}
  // roads
  // roads are their own meshes; the terrain shows the graded gravel shoulders (verge)
  let road=0;const r=t.roadNear(x,z);if(r&&r.d<ROAD.shoulder+1.5){road=(1-smoothstep(ROAD.shoulder-.6,ROAD.shoulder+.8,r.d))*(r.r.kind==='track'?.45:.85);}
  // fields
  // fields are drawn per pixel in the shader from the same layout function; the vertex only carries farm weight
  // grass tint from moisture / temperature / forest
  const M=wt.moisture,T=wt.temperature;
  let cr=mix(.58,.25,smoothstep(.2,.7,M)),cg=mix(.52,.42,smoothstep(.2,.7,M)),cb=mix(.3,.14,smoothstep(.2,.7,M));
  const alp=smoothstep(.45,.22,T);cr=mix(cr,.43,alp);cg=mix(cg,.45,alp);cb=mix(cb,.32,alp);
  cr=mix(cr,.2,wt.forest*.45);cg=mix(cg,.26,wt.forest*.45);cb=mix(cb,.13,wt.forest*.45);
  if(wt.marsh>.3){cr=mix(cr,.3,wt.marsh*.6);cg=mix(cg,.38,wt.marsh*.6);cb=mix(cb,.2,wt.marsh*.6);}
  const o=v*4;col[o]=cr*255;col[o+1]=cg*255;col[o+2]=cb*255;col[o+3]=Math.round(clamp(info.terrace||0,0,1)*255);
  spl[o]=clamp(dirt,0,1)*255;spl[o+1]=clamp(sand,0,1)*255;spl[o+2]=clamp(rock,0,1)*255;spl[o+3]=clamp(snow,0,1)*255;
  ext[o]=road*255;ext[o+1]=clamp(wet,0,1)*255;ext[o+2]=clamp(wt.farm,0,1)*255;ext[o+3]=0;
 }
 // skirts
 const depth=Math.max(1,st*1.5);let s=V*V;const edge=[];
 for(let i=0;i<V;i++)edge.push(i);for(let j=0;j<V;j++)edge.push(j*V+V-1);for(let i=V-1;i>=0;i--)edge.push((V-1)*V+i);for(let j=V-1;j>=0;j--)edge.push(j*V);
 const sk=[];for(const e of edge.slice(0,skirt)){pos[s*3]=pos[e*3];pos[s*3+1]=pos[e*3+1]-depth;pos[s*3+2]=pos[e*3+2];for(let k=0;k<3;k++)nrm[s*3+k]=nrm[e*3+k];for(let k=0;k<4;k++){col[s*4+k]=col[e*4+k];spl[s*4+k]=spl[e*4+k];ext[s*4+k]=ext[e*4+k];}sk.push([e,s]);s++;}
 const nIdx=N*N*6+skirt*6,idx=new Uint16Array(nIdx);let q=0;
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=j*V+i,b=a+1,c=a+V,d=c+1;idx[q++]=a;idx[q++]=c;idx[q++]=b;idx[q++]=c;idx[q++]=d;idx[q++]=b;}
 for(let k=0;k<sk.length;k++){const [e0,s0]=sk[k],[e1,s1]=sk[(k+1)%sk.length];if(k%V===V-1)continue;idx[q++]=e0;idx[q++]=e1;idx[q++]=s0;idx[q++]=e1;idx[q++]=s1;idx[q++]=s0;}
 let ymin=1e9,ymax=-1e9;for(let v=0;v<V*V;v++){const y=pos[v*3+1];if(y<ymin)ymin=y;if(y>ymax)ymax=y;}
 return {pos,nrm,col,spl,ext,idx:idx.subarray(0,q).slice(),ymin:ymin-depth,ymax};
}
