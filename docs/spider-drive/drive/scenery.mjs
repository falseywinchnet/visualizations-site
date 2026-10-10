// Terrain quadtree LOD (meshed in workers), rivers and lakes, bridges, towns and roadside details.
import * as T from 'three';
import {terrainMaterial,waterMaterial,roadMaterial,shared} from './materials.mjs';
import {deckWidth} from './terrain.mjs';
import {hash2,clamp,mix,rng} from './noise.mjs';

const ROOT=32768,MAXL=9,NODE_N=64;// 64 m leaves at 1 m spacing (64x64 quads per node: a quarter of the draw calls of 32x32 nodes)
const nodeKey=(l,i,j)=>l*1e8+i*1e4+j;
export function pruneCoveredTerrain(show,nodes){
 // A tile has at most MAXL ancestors. Look those up directly instead of
 // comparing every visible tile with every other tile.
 for(const k of show){const u=nodes.get(k).userData;let i=(u.x0+ROOT/2)/u.size,j=(u.z0+ROOT/2)/u.size;
  for(let l=u.level-1;l>=0;l--){i>>=1;j>>=1;if(show.has(nodeKey(l,i,j))){show.delete(k);break;}}}
 return show;
}
export class Scenery{
 constructor(scene,terrain,{texArray,waterNormals,workers,quality='medium',body=null}){
  this.scene=scene;this.t=terrain;this.w=terrain.w;this.workers=workers;this.quality=quality;this.body=body;this.off=!!(body&&body.id!=='earth');
  this.mat=terrainMaterial(texArray,this.w.seed);this.nodes=new Map();this.pending=new Map();this.visible=new Set();
  this.group=new T.Group();this.group.name='terrain';scene.add(this.group);
  this.K=quality==='low'?.65:quality==='high'?.95:.8;this.inflight=0;this.maxInflight=16;this.frame=0;
  for(const wk of workers)wk.addEventListener('message',e=>{if(e.data.type==='node')this._onNode(e.data);});
  this.waterMat=waterMaterial(waterNormals);
  this.texArray=texArray;this.buildWater();this.buildRoads();this.buildBridges();this.buildTowns();this.buildRoadside();this.buildSites();this.buildBoundary();
  this.rr=0;
 }
 setQuality(q){this.quality=q;this.K=q==='low'?.65:q==='high'?.95:.8;}
 key(l,i,j){return nodeKey(l,i,j);}
 _onNode(d){
  this.inflight--;const p=this.pending.get(d.key);this.pending.delete(d.key);if(!p)return;
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(d.pos,3));g.setAttribute('normal',new T.BufferAttribute(d.nrm,3,true));
  g.setAttribute('tint',new T.BufferAttribute(d.col,4,true));g.setAttribute('spl',new T.BufferAttribute(d.spl,4,true));g.setAttribute('ext',new T.BufferAttribute(d.ext,4,true));
  g.setIndex(new T.BufferAttribute(d.idx,1));
  const c=new T.Vector3(p.x0+p.size/2,(d.ymin+d.ymax)/2,p.z0+p.size/2);g.boundingSphere=new T.Sphere(c,Math.hypot(p.size*.71,(d.ymax-d.ymin)/2+1));
  g.boundingBox=new T.Box3(new T.Vector3(p.x0,d.ymin,p.z0),new T.Vector3(p.x0+p.size,d.ymax,p.z0+p.size));
  const m=new T.Mesh(g,this.mat);m.receiveShadow=true;m.castShadow=p.level>=MAXL-1;/* only the near terrain self-shadows; far nodes are under the shadow map's reach anyway */m.matrixAutoUpdate=false;m.visible=false;
  m.userData={level:p.level,x0:p.x0,z0:p.z0,size:p.size,ymax:d.ymax,ymin:d.ymin,used:this.frame};
  this.group.add(m);this.nodes.set(d.key,m);this._dirty=true;
 }
 request(l,i,j,prio){const k=this.key(l,i,j);if(this.nodes.has(k)||this.pending.has(k))return;const size=ROOT/2**l;this.queue.push({k,l,level:l,i,j,size,x0:-ROOT/2+i*size,z0:-ROOT/2+j*size,prio});}
 // desired leaves from the camera position
 update(cam,budgetMs=3){
  this.frame++;
  // re-select only when the camera moved or meshes arrived; otherwise just keep dispatching
  if(this._lc&&!this._dirty&&Math.abs(cam.x-this._lc.x)+Math.abs(cam.y-this._lc.y)+Math.abs(cam.z-this._lc.z)<1.5){this.dispatch();return this.queue.length===0&&this.pending.size===0;}
  this._lc={x:cam.x,y:cam.y,z:cam.z};this._dirty=false;
  const cx=cam.x,cz=cam.z,cy=cam.y;this.queue=[];const leaves=[];
  const est=(x0,z0,s)=>{const x=clamp(cx,x0,x0+s),z=clamp(cz,z0,z0+s);return this.t.base(x,z);};
  const visit=(l,i,j)=>{const s=ROOT/2**l,x0=-ROOT/2+i*s,z0=-ROOT/2+j*s;const dx=Math.max(x0-cx,0,cx-(x0+s)),dz=Math.max(z0-cz,0,cz-(z0+s));
   const hd=Math.hypot(dx,dz);const k=this.key(l,i,j);const n=this.nodes.get(k);const top=n?n.userData.ymax:est(x0,z0,s);const dy=Math.max(0,cy-top-20);const d=Math.hypot(hd,dy);
   if(l<MAXL&&d<s*this.K){for(let q=0;q<4;q++)visit(l+1,i*2+(q&1),j*2+(q>>1));}else leaves.push([l,i,j,d]);};
  visit(0,0,0);
  const want=new Set();
  for(const [l,i,j,d] of leaves){want.add(this.key(l,i,j));this.request(l,i,j,l<=3?-1e9+l:d/(ROOT/2**l));}
  // fallback coverage: nearest ready ancestor, else keep previously visible descendants
  const show=new Set();
  for(const [l,i,j] of leaves){const k=this.key(l,i,j);if(this.nodes.has(k)){show.add(k);continue;}
   let found=false;
   for(let L=l-1,I=i>>1,J=j>>1;L>=0;L--,I>>=1,J>>=1){const ak=this.key(L,I,J);if(this.nodes.has(ak)){show.add(ak);found=true;break;}}
   if(!found)for(const v of this.visible){const u=this.nodes.get(v)?.userData;if(u&&u.level>l&&u.x0>=-ROOT/2+i*(ROOT/2**l)&&u.x0<-ROOT/2+(i+1)*(ROOT/2**l)&&u.z0>=-ROOT/2+j*(ROOT/2**l)&&u.z0<-ROOT/2+(j+1)*(ROOT/2**l))show.add(v);}
  }
  pruneCoveredTerrain(show,this.nodes);
  for(const k of this.visible)if(!show.has(k)){const m=this.nodes.get(k);if(m)m.visible=false;}
  for(const k of show){const m=this.nodes.get(k);m.visible=true;m.userData.used=this.frame;}
  this.visible=show;
  this.queue.sort((a,b)=>a.prio-b.prio);
  this.dispatch();
  // evict unused
  if(this.nodes.size>700){const arr=[...this.nodes].filter(([k,m])=>!show.has(k)).sort((a,b)=>a[1].userData.used-b[1].userData.used);for(const [k,m] of arr.slice(0,this.nodes.size-600)){m.geometry.dispose();this.group.remove(m);this.nodes.delete(k);}}
  this.stats={nodes:this.nodes.size,visible:show.size,pending:this.pending.size,queued:this.queue.length};
  return this.queue.length===0&&this.pending.size===0;
 }
 dispatch(){while(this.queue.length&&this.inflight<this.maxInflight){const r=this.queue.shift();if(this.nodes.has(r.k)||this.pending.has(r.k))continue;this.inflight++;this.pending.set(r.k,r);const wk=this.workers[this.rr++%this.workers.length];wk.postMessage({type:'node',key:r.k,x0:r.x0,z0:r.z0,size:r.size,n:NODE_N});}}
 // ---------------------------------------------------------------- water
 buildWater(){
  const t=this.t,W=this.w;
  const P=[],F=[],D=[],I=[],K=[];// K: flood weight
  for(const c of W.channels){if(c.cls<1)continue;
   const n=c.n,S=c.cls===3?[-1.25,-1,-.75,-.5,-.25,0,.25,.5,.75,1,1.25]:[-1.6,-1.2,-.6,0,.6,1.2,1.6];const cols=S.length;const base=P.length/3;
   for(let k=0;k<n;k++){const o=k*8,a=Math.max(0,k-1),b=Math.min(n-1,k+1),dx=c.P[b*8]-c.P[a*8],dz=c.P[b*8+1]-c.P[a*8+1],dl=Math.hypot(dx,dz)||1,nx=-dz/dl,nz=dx/dl;
    const w=c.P[o+3],L=c.P[o+2],dep=c.P[o+4],sp=c.P[o+6],m=2.5+w*.12;
    for(const s of S){const off=Math.abs(s)<=1?s*w*.5:Math.sign(s)*(w*.5+m*(Math.abs(s)-1)/.3);P.push(c.P[o]+nx*off,L,c.P[o+1]+nz*off);F.push(dx/dl*sp,dz/dl*sp);const q=Math.abs(off)/(w*.5);D.push(q<=1?dep*(1-q*q):-(Math.abs(off)-w*.5)*.4);K.push(c.cls>=2?1:.4);}
   }
   for(let k=0;k<n-1;k++)for(let s=0;s<cols-1;s++){const a=base+k*cols+s,b=a+1,cc=a+cols,d=cc+1;I.push(a,cc,b,b,cc,d);}
  }
  // lakes: 12 m grid over lake cells (dilated), depth from the terrain
  for(const lk of W.lakes){const N=W.N,cell=W.cell,half=W.half;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
   for(let i=0;i<N*N;i++)if(W.lakeId[i]===lk.id){const x=i%N,z=(i/N)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
   if(x0>x1)continue;x0-=2;z0-=2;x1+=3;z1+=3;const cols=x1-x0+1,base=P.length/3;
   const inL=(x,z)=>{for(let dz=-2;dz<=1;dz++)for(let dx=-2;dx<=1;dx++){const X=x+dx,Z=z+dz;if(X>=0&&Z>=0&&X<N&&Z<N&&W.lakeId[Z*N+X]===lk.id)return true;}return false;};
   for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const wx=-half+x*cell,wz=-half+z*cell;P.push(wx,lk.level,wz);F.push(.05,.03);D.push(lk.level-t.height(wx,wz));K.push(0);}
   for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){if(!inL(x,z))continue;const a=base+(z-z0)*cols+(x-x0),b=a+1,c=a+cols,d=c+1;I.push(a,c,b,b,c,d);}
  }
  // split into ~600 m cells so the camera only draws the water it can see
  const cells=new Map();for(let t=0;t<I.length;t+=3){const a=I[t],b=I[t+1],c=I[t+2];const cx=(P[a*3]+P[b*3]+P[c*3])/3,cz=(P[a*3+2]+P[b*3+2]+P[c*3+2])/3;const key=Math.floor((cx+20000)/600)*1000+Math.floor((cz+20000)/600);let L=cells.get(key);if(!L)cells.set(key,L=[]);L.push(a,b,c);}
  this.water=new T.Group();this.water.name='water';this.scene.add(this.water);this.waterParts=[];
  for(const L of cells.values()){const map=new Map(),p=[],f=[],d=[],kw=[],idx=[];for(const v of L){let n=map.get(v);if(n===undefined){n=map.size;map.set(v,n);p.push(P[v*3],P[v*3+1],P[v*3+2]);f.push(F[v*2],F[v*2+1]);d.push(D[v]);kw.push(K[v]);}idx.push(n);}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('flow',new T.Float32BufferAttribute(f,2));g.setAttribute('depth',new T.Float32BufferAttribute(d,1));g.setAttribute('floodW',new T.Float32BufferAttribute(kw,1));
   g.setIndex(idx.length>65535?new T.Uint32BufferAttribute(idx,1):new T.Uint16BufferAttribute(idx,1));g.computeBoundingSphere();
   const m=new T.Mesh(g,this.waterMat);m.renderOrder=2;m.matrixAutoUpdate=false;this.water.add(m);this.waterParts.push({g,base:Float32Array.from(p),depthBase:Float32Array.from(d)});}
 }
 setFlood(boost){for(const W of this.waterParts){const p=W.g.attributes.position,k=W.g.attributes.floodW,d=W.g.attributes.depth;
  for(let i=0;i<p.count;i++){p.array[i*3+1]=W.base[i*3+1]+boost*k.array[i];d.array[i]=W.depthBase[i]+boost*k.array[i];}
  p.needsUpdate=true;d.needsUpdate=true;W.g.computeBoundingSphere();}shared.uFloodTint.value=boost>0?.8:0;}
 // ---------------------------------------------------------------- roads
 // Each road is a ribbon mesh laid on its graded formation (the terrain under it is the same profile), so
 // the carriageway and its markings stay crisp at any terrain LOD. Bridge spans are drawn with their bridge.
 static crown(r){return r.kind==='track'?.03:.05;}
 static ribbon(r,k0,k1,lift=0){
  const hw=r.width*.5,cr=Scenery.crown(r),S=[-1,-.92,-.5,0,.5,.92,1],P=[],U=[],I=[];let v=0;
  for(let k=k0;k<=k1;k++){const a=Math.max(0,k-1),b=Math.min(r.n-1,k+1),dx=r.xz[b*2]-r.xz[a*2],dz=r.xz[b*2+1]-r.xz[a*2+1],dl=Math.hypot(dx,dz)||1,nx=-dz/dl,nz=dx/dl;
   if(k>k0)v+=Math.hypot(r.xz[k*2]-r.xz[k*2-2],r.xz[k*2+1]-r.xz[k*2-1]);
   for(const q of S){const lat=q*hw;P.push(r.xz[k*2]+nx*lat,r.y[k]+cr*(1-q*q)+.06+lift,r.xz[k*2+1]+nz*lat);U.push((q+1)/2,v);}}
  const C=S.length;for(let k=0;k<k1-k0;k++)for(let q=0;q<C-1;q++){const a=k*C+q,b=a+1,c=a+C,d=c+1;I.push(a,b,c,b,d,c);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('uv',new T.Float32BufferAttribute(U,2));g.setIndex(I);g.computeVertexNormals();g.computeBoundingSphere();return g;}
 buildRoads(){
  this.roadMats={main:roadMaterial(this.texArray,0),minor:roadMaterial(this.texArray,1),track:roadMaterial(this.texArray,2,this.body)};
  this.roadGroup=new T.Group();this.roadGroup.name='roads';this.scene.add(this.roadGroup);
  for(const r of this.w.roads){
   // runs of samples off the bridges, and off stretches another (earlier) road already covers: roads
   // that share an alignment are drawn once
   const skip=new Uint8Array(r.n);for(const b of r.bridges)for(let q=b.s0+1;q<b.s1;q++)skip[q]=1;
   const rn=[];for(let q=0;q<r.n;q++){if(skip[q])continue;for(const o of this.t.roadsNear(r.xz[q*2],r.xz[q*2+1],rn))if(o.r.id<r.id&&o.d<-.5&&(o.r.kind==='main'||o.r.kind===r.kind)&&o.r._skip&&!o.r._skip[o.k]&&!o.r._skip[Math.min(o.r.n-1,o.k+1)]){skip[q]=2;break;}}/* only where that road is drawn itself */
   r._skip=skip;
   const spans=[];let k0=-1;for(let q=0;q<r.n;q++){const on=!skip[q];if(on&&k0<0)k0=q;if((!on||q===r.n-1)&&k0>=0){spans.push([Math.max(0,k0-2),Math.min(r.n-1,q+2)]);k0=-1;}/* overlap the neighbour by two samples: no square step at a merge */}
   for(const [a,b] of spans){if(b<=a)continue;const m=new T.Mesh(Scenery.ribbon(r,a,b,(r.id%5)*.004),this.roadMats[r.kind]);m.receiveShadow=true;m.renderOrder=1;m.matrixAutoUpdate=false;this.roadGroup.add(m);}}
 }
 // ---------------------------------------------------------------- bridges
 // Deck, kerbs, rails and girders follow the road's own samples across the span; piers stand where the
 // ground drops away; earth ramps (terrain.mjs) carry the road up to the deck at both ends.
 buildBridges(){
  const conc=new T.MeshStandardMaterial({color:0x9a9790,roughness:.85}),steel=new T.MeshStandardMaterial({color:0x5b6a70,roughness:.5,metalness:.6}),deckM=new T.MeshStandardMaterial({color:0x6d6c68,roughness:.9});
  this.bridgeGroup=new T.Group();this.bridgeGroup.name='bridges';this.scene.add(this.bridgeGroup);this.bridges=[];
  // extrude a cross-section (pairs of [lateral, height] around a closed outline) along road samples
  const extrude=(r,k0,k1,sec,y0)=>{const P=[],I=[];const C=sec.length;
   for(let k=k0;k<=k1;k++){const a=Math.max(0,k-1),b=Math.min(r.n-1,k+1),dx=r.xz[b*2]-r.xz[a*2],dz=r.xz[b*2+1]-r.xz[a*2+1],dl=Math.hypot(dx,dz)||1,nx=-dz/dl,nz=dx/dl;
    // extend the ends a little so neighbouring spans and ramps overlap
    let ex=0,ez=0;if(k===k0){ex=-dx/dl*1.2;ez=-dz/dl*1.2;}if(k===k1){ex=dx/dl*1.2;ez=dz/dl*1.2;}
    for(const [lat,h] of sec)P.push(r.xz[k*2]+nx*lat+ex,y0(k)+h,r.xz[k*2+1]+nz*lat+ez);}
   for(let k=0;k<k1-k0;k++)for(let q=0;q<C;q++){const q2=(q+1)%C,a=k*C+q,b=k*C+q2,c=a+C,d=b+C;I.push(a,b,c,b,d,c);}
   // end caps
   const cap=(o,flip)=>{for(let q=1;q<C-1;q++)flip?I.push(o,o+q+1,o+q):I.push(o,o+q,o+q+1);};cap(0,false);cap((k1-k0)*C,true);
   let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setIndex(I);g=g.toNonIndexed();g.computeVertexNormals();g.computeBoundingSphere();return g;};
  for(const r of this.w.roads)r.bridges.forEach((b,bi)=>{if(b.shared)return;/* this road rides another road's bridge */
   const g=new T.Group();g.name=`${b.name} bridge`;const W=deckWidth(r),hw=W/2,cr=Scenery.crown(r);
   const top=k=>r.y[k]+cr;// deck surface level with the crown of the approach
   const k0=b.s0,k1=b.s1;
   const add=(geo,m,shadow=true)=>{const o=new T.Mesh(geo,m);o.castShadow=shadow;o.receiveShadow=true;o.matrixAutoUpdate=false;g.add(o);return o;};
   add(extrude(r,k0,k1,[[-hw,0],[hw,0],[hw,-.55],[-hw,-.55]],top),deckM);// deck slab
   add(extrude(r,k0,k1,[[-hw*.72,-.5],[hw*.72,-.5],[hw*.6,-1.7],[-hw*.6,-1.7]],top),conc);// box girder
   for(const s of [-1,1]){add(extrude(r,k0,k1,[[s*hw,0],[s*(hw-.45),0],[s*(hw-.45),.32],[s*hw,.32]].map(([l,h])=>[l,h]),top),conc);// kerb
    add(extrude(r,k0,k1,[[s*(hw-.12),1.05],[s*(hw-.02),1.05],[s*(hw-.02),1.17],[s*(hw-.12),1.17]],top),steel,false);// rail
    add(extrude(r,k0,k1,[[s*(hw-.12),.62],[s*(hw-.02),.62],[s*(hw-.02),.7],[s*(hw-.12),.7]],top),steel,false);}// mid rail
   // posts and piers
   const postG=new T.BoxGeometry(.12,1.1,.12),posts=[];let acc=0;
   for(let k=k0;k<=k1;k++){if(k>k0)acc+=4;const a=Math.max(0,k-1),bb=Math.min(r.n-1,k+1),dx=r.xz[bb*2]-r.xz[a*2],dz=r.xz[bb*2+1]-r.xz[a*2+1],dl=Math.hypot(dx,dz)||1,nx=-dz/dl,nz=dx/dl;
    for(const s of [-1,1]){const p=new T.Matrix4().makeTranslation(r.xz[k*2]+nx*s*(hw-.07),top(k)+.6,r.xz[k*2+1]+nz*s*(hw-.07));posts.push(p);
     if(k%2===0&&k<k1){const p2=new T.Matrix4().makeTranslation(r.xz[k*2]+dx/dl*2+nx*s*(hw-.07),top(k)+.6,r.xz[k*2+1]+dz/dl*2+nz*s*(hw-.07));posts.push(p2);}}
    const interior=k>k0+1&&k<k1-1&&(k-k0)%4===2;
    if(interior){const bed=this.t.height(r.xz[k*2],r.xz[k*2+1]),h=top(k)-1.7-bed;if(h>.8){const pier=new T.Mesh(new T.BoxGeometry(W*.55,h+1,1.3),conc);pier.position.set(r.xz[k*2],bed+h/2-.5,r.xz[k*2+1]);pier.rotation.y=Math.atan2(nx,nz);pier.castShadow=true;pier.receiveShadow=true;g.add(pier);
     const capG=new T.Mesh(new T.BoxGeometry(W*.7,.5,1.6),conc);capG.position.set(r.xz[k*2],top(k)-1.85,r.xz[k*2+1]);capG.rotation.y=pier.rotation.y;g.add(capG);}}}
   const im=new T.InstancedMesh(postG,steel,posts.length);posts.forEach((p,i)=>im.setMatrixAt(i,p));im.castShadow=false;g.add(im);
   // carriageway on the deck
   const road=new T.Mesh(Scenery.ribbon(r,k0,k1,0),this.roadMats[r.kind]);road.receiveShadow=true;road.renderOrder=1;road.matrixAutoUpdate=false;g.add(road);
   this.bridgeGroup.add(g);this.bridges.push({g,road:r.id,index:bi,b,r});
  });
 }
 washOut(roadId,index){const br=this.bridges.find(b=>b.road===roadId&&b.index===index);if(br){br.g.visible=false;
  // broken stubs where the deck tore away from the ramps
  const r=br.r,b=br.b,stubM=new T.MeshStandardMaterial({color:0x6d6c68,roughness:.9}),W=deckWidth(r);
  for(const [k,kin] of [[b.s0,b.s0+1],[b.s1,b.s1-1]]){const dx=r.xz[kin*2]-r.xz[k*2],dz=r.xz[kin*2+1]-r.xz[k*2+1],dl=Math.hypot(dx,dz)||1;const st=new T.Mesh(new T.BoxGeometry(W*.9,.55,3),stubM);st.position.set(r.xz[k*2]+dx/dl*1.5,r.y[k]+Scenery.crown(r)-.3,r.xz[k*2+1]+dz/dl*1.5);st.rotation.y=Math.atan2(dx,dz);st.rotation.x=.2;st.castShadow=true;this.bridgeGroup.add(st);}}
  this.t.bridgeRemoved.add(roadId+':'+index);this.t.tiles.clear();}
 // ---------------------------------------------------------------- towns
 buildTowns(){
  const walls=[],roofs=[],trims=[],glass=[];const colors={walls:[],roofs:[]};
  const add=(arr,geo,m4,color)=>{const g=geo.index?geo.toNonIndexed():geo;g.applyMatrix4(m4);if(color){const c=new Float32Array(g.attributes.position.count*3);for(let i=0;i<c.length;i+=3){c[i]=color.r;c[i+1]=color.g;c[i+2]=color.b;}g.setAttribute('color',new T.BufferAttribute(c,3));}arr.push(g);};
  const M=new T.Matrix4(),Q=new T.Quaternion(),Sv=new T.Vector3(),Pv=new T.Vector3();
  const place=(b,lx,ly,lz,rot=0,s=[1,1,1])=>{const c=Math.cos(b.rot),si=Math.sin(b.rot);Pv.set(b.x+lx*c+lz*si,b.y+ly,b.z-lx*si+lz*c);Q.setFromAxisAngle(new T.Vector3(0,1,0),b.rot+rot);Sv.set(...s);return M.compose(Pv,Q,Sv).clone();};
  const gable=(w,d,h)=>{const g=new T.BufferGeometry();const x=w/2+.35,z=d/2+.35,v=[-x,0,-z, x,0,-z, 0,h,-z, -x,0,z, x,0,z, 0,h,z];const tri=[0,2,1, 3,4,5, 0,3,5, 0,5,2, 1,2,5, 1,5,4];const p=[];for(const i of tri)p.push(v[i*3],v[i*3+1],v[i*3+2]);g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;};
  const wallPal=[0xd9d2c3,0xc9b99c,0xa7b3b5,0xe6e0d4,0xb68a6a,0x9fae96,0xd8c7a0];const roofPal=[0x5b4038,0x4a4f55,0x6d3b2f,0x3d4a3c,0x7a6a58];
  for(const b of this.w.buildings){
   const r=rng(b.seed||1);const wc=new T.Color(wallPal[Math.floor(r()*wallPal.length)]),rc=new T.Color(roofPal[Math.floor(r()*roofPal.length)]);
   b.y=this.t.height(b.x,b.z);
   const box=(w,h,d,lx,ly,lz,arr,col)=>add(arr,new T.BoxGeometry(w,h,d),place(b,lx,ly,lz),col);
   switch(b.type){
    case 'barn':{wc.set(0x8c2f22);box(b.w,b.h*.6,b.d,0,b.h*.3,0,walls,wc);add(roofs,gable(b.w,b.d,b.h*.45),place(b,0,b.h*.6,0),rc.set(0x3a3d40));box(b.w*.4,b.h*.45,.1,0,b.h*.22,b.d/2+.02,trims,new T.Color(0xe8e2d0));break;}
    case 'silo':{add(walls,new T.CylinderGeometry(b.w/2,b.w/2,b.h,16),place(b,0,b.h/2,0),new T.Color(0xb8bcbc));add(roofs,new T.SphereGeometry(b.w/2,16,8,0,Math.PI*2,0,Math.PI/2),place(b,0,b.h,0),new T.Color(0x9aa0a0));break;}
    case 'watertower':{for(const [x,z] of [[-2,-2],[2,-2],[-2,2],[2,2]])add(trims,new T.CylinderGeometry(.18,.25,b.h*.7,6),place(b,x*.8,b.h*.35,z*.8),new T.Color(0x6a6f70));add(walls,new T.CylinderGeometry(3.2,3.2,5,16),place(b,0,b.h*.7+2.5,0),new T.Color(0xa9b4b8));add(roofs,new T.ConeGeometry(3.4,1.8,16),place(b,0,b.h*.7+5.9,0),new T.Color(0x6d7478));break;}
    case 'church':{box(b.w,b.h*.6,b.d,0,b.h*.3,0,walls,new T.Color(0xece8de));add(roofs,gable(b.w,b.d,b.h*.4),place(b,0,b.h*.6,0),rc);box(3,b.h*1.1,3,0,b.h*.55,-b.d/2+1.5,walls,new T.Color(0xece8de));add(roofs,new T.ConeGeometry(2.3,5,4),place(b,0,b.h*1.1+2.5,-b.d/2+1.5,Math.PI/4),rc);break;}
    case 'firestation':{box(b.w,b.h,b.d,0,b.h/2,0,walls,new T.Color(0xb24a3a));box(b.w+.6,.4,b.d+.6,0,b.h+.2,0,roofs,new T.Color(0x3c3c3c));for(const x of [-4,0,4])box(3.2,3.8,.1,x,1.9,b.d/2+.03,glass,new T.Color(0xcfd5d8));break;}
    case 'clinic':{box(b.w,b.h,b.d,0,b.h/2,0,walls,new T.Color(0xeeeeea));box(b.w+.6,.4,b.d+.6,0,b.h+.2,0,roofs,new T.Color(0x555a5e));box(2.6,.8,.1,0,b.h-1,b.d/2+.03,trims,new T.Color(0xc0302a));box(.8,2.6,.1,0,b.h-1,b.d/2+.04,trims,new T.Color(0xc0302a));break;}
    case 'shed':{box(b.w,b.h,b.d,0,b.h/2,0,walls,new T.Color(0x7d6a55));add(roofs,gable(b.w,b.d,1.2),place(b,0,b.h,0),rc);break;}
    // ---- off-world base modules
    case 'hab':{// horizontal pressurised cylinder on cradles, end caps, a row of small ports
     add(walls,new T.CylinderGeometry(b.w/2,b.w/2,b.d-1,20).rotateX(Math.PI/2),place(b,0,b.w/2+.6,0),new T.Color(0xdedad2));for(const s of [-1,1])add(walls,new T.SphereGeometry(b.w/2,20,10,0,Math.PI*2,0,Math.PI/2).rotateX(s>0?Math.PI/2:-Math.PI/2),place(b,0,b.w/2+.6,s*(b.d-1)/2),new T.Color(0xd4d0c8));
     for(const z of [-b.d*.3,0,b.d*.3])box(.6,.6,.1,0,b.w/2+.6,z,trims,new T.Color(0x2a3440));for(const z of [-b.d*.3,b.d*.3])box(b.w*.9,.6,1.2,0,.3,z,trims,new T.Color(0x6a6f70));
     for(const z of [-b.d*.25,b.d*.25])for(const s of [-1,1])box(.1,.7,.9,s*(b.w/2+.01),b.w/2+1.1,z,glass,new T.Color(0x9ab0bb));break;}
    case 'node':{add(walls,new T.CylinderGeometry(b.w/2,b.w/2,b.h*.75,16),place(b,0,b.h*.375,0),new T.Color(0xcfd3d6));add(roofs,new T.SphereGeometry(b.w/2,16,8,0,Math.PI*2,0,Math.PI/2),place(b,0,b.h*.75,0),new T.Color(0xb8bcbc));box(.8,1.6,.1,0,b.h*.5,b.w/2+.02,glass,new T.Color(0x9ab0bb));break;}
    case 'tank':{add(walls,new T.CylinderGeometry(b.w/2,b.w/2,b.h-b.w/2,16),place(b,0,(b.h-b.w/2)/2+.3,0),new T.Color(0xb0b6b8));add(roofs,new T.SphereGeometry(b.w/2,16,8,0,Math.PI*2,0,Math.PI/2),place(b,0,b.h-b.w/2+.3,0),new T.Color(0xa0a6a8));for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]])box(.25,.4,.25,x*b.w*.35,.2,z*b.w*.35,trims,new T.Color(0x5a5e60));break;}
    case 'airlock':{box(b.w,b.h,b.d,0,b.h/2,0,walls,new T.Color(0x8a8f94));box(1.4,2.2,.12,0,1.3,b.d/2+.04,trims,new T.Color(0xc0302a));box(b.w*.6,.3,.3,0,b.h+.15,0,trims,new T.Color(0x5a5e60));break;}
    case 'array':{// solar array: dark panel tilted to the sun on a pair of legs
     for(const s of [-1,1])add(trims,new T.CylinderGeometry(.08,.1,1.6,6),place(b,s*b.w*.4,.8,0),new T.Color(0x777b7e));const pm=place(b,0,1.9,0);pm.multiply(new T.Matrix4().makeRotationX(-.55));add(glass,new T.BoxGeometry(b.w,.08,b.d),pm,new T.Color(0x18264a));break;}
    case 'antenna':{add(trims,new T.CylinderGeometry(.14,.22,b.h,8),place(b,0,b.h/2,0),new T.Color(0x9a9ea0));for(let k=1;k<4;k++)add(trims,new T.CylinderGeometry(.03,.03,2.2,4).rotateZ(Math.PI/2),place(b,0,b.h*k/4,0,k*.7),new T.Color(0x8a8e90));
     const dm=place(b,0,b.h+.6,0);dm.multiply(new T.Matrix4().makeRotationX(-.9));add(walls,new T.SphereGeometry(1.6,16,8,0,Math.PI*2,0,Math.PI*.3),dm,new T.Color(0xe8e8e4));break;}
    case 'pad':{add(roofs,new T.CylinderGeometry(b.w/2,b.w/2,.25,24),place(b,0,.12,0),new T.Color(0x5c5a56));for(let k=0;k<8;k++){const a=k/8*6.283;box(.5,.5,.5,Math.cos(a)*(b.w/2-.6),.45,Math.sin(a)*(b.w/2-.6),trims,new T.Color(0xf0b040));}break;}
    case 'dome':{// greenhouse dome, lit from inside
     add(glass,new T.SphereGeometry(b.w/2,24,12,0,Math.PI*2,0,Math.PI/2),place(b,0,.4,0),new T.Color(0xc8d8c0));add(roofs,new T.CylinderGeometry(b.w/2+.3,b.w/2+.3,.5,24),place(b,0,.2,0),new T.Color(0x6a6f70));break;}
    case 'berm':{// radiation berm of piled regolith along the habitat
     const bm=new T.CylinderGeometry(b.h,b.h*1.6,b.w,12,1,false,0,Math.PI).rotateZ(Math.PI/2).rotateX(Math.PI/2);add(walls,bm,place(b,0,0,0),new T.Color(this.body?new T.Color(...this.body.tint).multiplyScalar(.9):0x888888));break;}
    default:{// house, store, hall
     const h=b.h;box(b.w,h,b.d,0,h/2,0,walls,wc);
     if(b.type==='store'||b.type==='hall'){box(b.w+.4,.5,b.d+.4,0,h+.25,0,roofs,rc);}else add(roofs,gable(b.w,b.d,Math.min(4,b.w*.45)),place(b,0,h,0),rc);
     // windows and a door
     const nwin=Math.max(1,Math.floor(b.d/4));for(let k=0;k<nwin;k++){const z=-b.d/2+(k+.5)*b.d/nwin;for(const s of [-1,1])box(.08,1.1,1.2,s*(b.w/2+.02),h*.55,z,glass,new T.Color(0x9ab0bb));}
     box(1.1,2.1,.08,0,1.05,b.d/2+.02,trims,new T.Color(0x5a4636));
     if(h>6)for(let k=0;k<nwin;k++){const z=-b.d/2+(k+.5)*b.d/nwin;for(const s of [-1,1])box(.08,1.1,1.2,s*(b.w/2+.02),h*.82,z,glass,new T.Color(0x9ab0bb));}
    }
   }
  }
  const merge=(arr,mat,name)=>{if(!arr.length)return;const g=mergeNonIndexed(arr);const m=new T.Mesh(g,mat);m.castShadow=m.receiveShadow=true;m.name=name;this.scene.add(m);return m;};
  this.townMeshes=[merge(walls,new T.MeshStandardMaterial({vertexColors:true,roughness:.85}),'walls'),merge(roofs,new T.MeshStandardMaterial({vertexColors:true,roughness:.7}),'roofs'),merge(trims,new T.MeshStandardMaterial({vertexColors:true,roughness:.7}),'trims'),
   this.windows=merge(glass,new T.MeshStandardMaterial({vertexColors:true,roughness:.15,metalness:.3,emissive:0xffc070,emissiveIntensity:0}),'windows')];
 }
 setNight(k){if(this.windows)this.windows.material.emissiveIntensity=k*1.4;}
 // ---------------------------------------------------------------- roadside: power poles and field fences
 buildRoadside(){
  const poles=[],wires=[];
  for(const r of this.w.roads){if(r.kind!=='main')continue;let acc=0;
   for(let k=1;k<r.n;k++){acc+=4;if(acc<48)continue;acc=0;if(r.onBridge&&r.onBridge[k]>=0)continue;const dx=r.xz[k*2]-r.xz[k*2-2],dz=r.xz[k*2+1]-r.xz[k*2-1],l=Math.hypot(dx,dz)||1;const off=r.width*.5+3.2;const x=r.xz[k*2]+dz/l*off,z=r.xz[k*2+1]-dx/l*off;
    const y=this.t.height(x,z);poles.push([x,y,z,Math.atan2(dx,dz)]);}}
  const pg=new T.CylinderGeometry(.12,.16,9,6);pg.translate(0,4.5,0);const cg=new T.BoxGeometry(2.2,.12,.12);cg.translate(0,8.4,0);
  const pm=new T.MeshStandardMaterial({color:0x5e4a38,roughness:.9});
  const ip=new T.InstancedMesh(pg,pm,poles.length),ic=new T.InstancedMesh(cg,pm,poles.length);const M=new T.Matrix4(),Q=new T.Quaternion();
  poles.forEach((p,i)=>{Q.setFromAxisAngle(new T.Vector3(0,1,0),p[3]+Math.PI/2);M.compose(new T.Vector3(p[0],p[1],p[2]),Q,new T.Vector3(1,1,1));ip.setMatrixAt(i,M);ic.setMatrixAt(i,M);});
  ip.castShadow=ic.castShadow=true;this.scene.add(ip,ic);
  // sagging wires between consecutive poles
  const wp=[];for(let i=1;i<poles.length;i++){const a=poles[i-1],b=poles[i];if(Math.hypot(a[0]-b[0],a[2]-b[2])>70)continue;for(const s of [-.9,.9]){const ax=a[0]+Math.cos(a[3])*s,az=a[2]-Math.sin(a[3])*s,bx=b[0]+Math.cos(b[3])*s,bz=b[2]-Math.sin(b[3])*s;for(let k=0;k<8;k++){const t0=k/8,t1=(k+1)/8,sag=u=>-1.4*4*u*(1-u);wp.push(mix(ax,bx,t0),mix(a[1],b[1],t0)+8.45+sag(t0),mix(az,bz,t0),mix(ax,bx,t1),mix(a[1],b[1],t1)+8.45+sag(t1),mix(az,bz,t1));}}}
  const wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(wp,3));this.scene.add(new T.LineSegments(wg,new T.LineBasicMaterial({color:0x222222,transparent:true,opacity:.6})));
 }
 // ---------------------------------------------------------------- special sites
 buildSites(){
  this.siteGroup=new T.Group();this.scene.add(this.siteGroup);
  const tent=new T.MeshStandardMaterial({color:0x5d6348,roughness:.95}),metal=new T.MeshStandardMaterial({color:0x7a7f80,roughness:.6,metalness:.4}),paint=new T.MeshStandardMaterial({color:0xe8e4d8,roughness:.8}),wood=new T.MeshStandardMaterial({color:0x7a5a3c,roughness:.9});
  for(const s of this.w.sites){const y=this.t.height(s.x,s.z),g=new T.Group();g.position.set(s.x,y,s.z);
   if(this.off){this.bodySite(s,g,{metal,paint});this.siteGroup.add(g);continue;}
   if(s.type==='staging'){for(let k=0;k<5;k++){const tn=new T.Mesh(new T.CylinderGeometry(0,4,3,4,1),tent);tn.position.set((k-2)*9,1.5,(k%2)*8-4);tn.rotation.y=Math.PI/4;tn.castShadow=true;g.add(tn);}
    for(let k=0;k<3;k++){const tr=new T.Mesh(new T.BoxGeometry(2.6,2.6,6.5),tent);tr.position.set(-14+k*7,1.5,14);tr.castShadow=true;g.add(tr);}const pole=new T.Mesh(new T.CylinderGeometry(.06,.06,9),metal);pole.position.set(18,4.5,0);g.add(pole);}
   else if(s.type==='lookout'){for(const [x,z] of [[-2,-2],[2,-2],[-2,2],[2,2]]){const l=new T.Mesh(new T.CylinderGeometry(.15,.2,12,6),wood);l.position.set(x,6,z);g.add(l);}const cab=new T.Mesh(new T.BoxGeometry(5.5,3,5.5),wood);cab.position.y=13.5;cab.castShadow=true;g.add(cab);const rf=new T.Mesh(new T.ConeGeometry(4.5,2,4),metal);rf.position.y=16;rf.rotation.y=Math.PI/4;g.add(rf);}
   else if(s.type==='trailhead'){const b=new T.Mesh(new T.BoxGeometry(2.4,1.4,.15),wood);b.position.set(0,1.6,0);g.add(b);for(const x of [-1,1]){const p=new T.Mesh(new T.CylinderGeometry(.08,.08,2.4),wood);p.position.set(x,1.2,0);g.add(p);}}
   else if(s.type==='hospital'&&s.helipad){const pad=new T.Mesh(new T.CylinderGeometry(9,9,.2,32),paint);pad.position.set(28,.15,0);pad.receiveShadow=true;g.add(pad);const H=new T.Mesh(new T.BoxGeometry(1,.05,5),new T.MeshStandardMaterial({color:0xc03028}));H.position.set(28,.27,0);g.add(H);for(const x of [-1.6,1.6]){const s2=new T.Mesh(new T.BoxGeometry(1,.05,5),H.material);s2.position.set(28+x,.27,0);s2.rotation.y=Math.PI/2*0;g.add(s2);}s.pad=[s.x+28,s.z];}
   this.siteGroup.add(g);}
 }
 // props at the off-world sites: survey tripods, a relay mast, an old descent stage, a dead rover, a drill
 // derrick, the probe, lit landing pad
 bodySite(s,g,{metal,paint}){
  const mk=(geo,m,x,y,z,rot=0)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.rotation.y=rot;o.castShadow=true;g.add(o);return o;};
  const gold=new T.MeshStandardMaterial({color:0xc9a44a,roughness:.35,metalness:.8}),white=new T.MeshStandardMaterial({color:0xe6e6e0,roughness:.6}),dark=new T.MeshStandardMaterial({color:0x2a2e33,roughness:.7});
  const tripod=()=>{for(let k=0;k<3;k++){const a=k/3*6.283;const l=mk(new T.CylinderGeometry(.04,.05,2.4,5),metal,Math.cos(a)*.6,1.1,Math.sin(a)*.6);l.rotation.z=Math.cos(a)*.45;l.rotation.x=-Math.sin(a)*.45;}mk(new T.BoxGeometry(.4,.3,.4),dark,0,2.35,0);mk(new T.BoxGeometry(.9,.5,.05),paint,0,1.6,.35);};
  switch(s.type){
   case 'staging':{mk(new T.CylinderGeometry(.08,.1,14,6),metal,24,7,-6);const lamp=mk(new T.BoxGeometry(1.2,.4,.6),dark,24,14.2,-6);lamp.material=new T.MeshStandardMaterial({color:0x333,emissive:0xfff3d0,emissiveIntensity:1.2});for(const x of [-30,30])mk(new T.CylinderGeometry(.05,.05,3,5),metal,x,1.5,20);break;}
   case 'landing':{mk(new T.CylinderGeometry(16,16,.3,8),new T.MeshStandardMaterial({color:0x4a4846,roughness:.9}),0,.15,0);for(let k=0;k<8;k++){const a=k/8*6.283;mk(new T.BoxGeometry(.6,.6,.6),new T.MeshStandardMaterial({color:0x222,emissive:0xff9030,emissiveIntensity:1.5}),Math.cos(a)*15,.6,Math.sin(a)*15);}mk(new T.BoxGeometry(1.2,.05,8),paint,0,.32,0);mk(new T.BoxGeometry(1.2,.05,8),paint,0,.32,0,Math.PI/2);break;}
   case 'relay':{mk(new T.CylinderGeometry(.12,.25,22,8),metal,0,11,0);const d=mk(new T.SphereGeometry(1.8,16,8,0,Math.PI*2,0,Math.PI*.3),white,0,22.8,0);d.rotation.x=-.7;for(let k=0;k<3;k++){const a=k/3*6.283;const w=mk(new T.CylinderGeometry(.015,.015,24,3),dark,Math.cos(a)*4,11,Math.sin(a)*4);w.rotation.z=Math.cos(a)*.35;w.rotation.x=-Math.sin(a)*.35;}mk(new T.BoxGeometry(2,1.2,1.4),dark,2.5,.6,0);break;}
   case 'lander':{mk(new T.BoxGeometry(4.2,2.2,4.2),gold,0,2.6,0);mk(new T.CylinderGeometry(.9,1.4,1.6,12),dark,0,.8,0);for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const l=mk(new T.CylinderGeometry(.09,.11,3.4,6),metal,x*2.8,1.4,z*2.8);l.rotation.z=x*.5;l.rotation.x=-z*.5;mk(new T.CylinderGeometry(.6,.6,.12,10),metal,x*3.6,.06,z*3.6);}mk(new T.BoxGeometry(.6,.6,.6),white,1.6,4,1.6);break;}
   case 'rover':{mk(new T.BoxGeometry(2.6,.8,3.4),white,0,1.3,0);mk(new T.BoxGeometry(2.8,.08,2.6),dark,0,2.2,-.2);mk(new T.CylinderGeometry(.08,.08,1.8,6),metal,-.8,2.9,-1.2);mk(new T.BoxGeometry(.6,.3,.3),dark,-.8,3.8,-1.2);for(const z of [-1.2,0,1.2])for(const s of [-1,1])mk(new T.CylinderGeometry(.5,.5,.3,12).rotateZ(Math.PI/2),dark,s*1.5,.5,z);break;}
   case 'drill':{for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const l=mk(new T.CylinderGeometry(.08,.1,9,6),metal,x*1.6,4.5,z*1.6);l.rotation.z=x*.17;l.rotation.x=-z*.17;}mk(new T.BoxGeometry(2.2,.6,2.2),dark,0,9.2,0);mk(new T.CylinderGeometry(.12,.12,8,8),metal,0,4,0);mk(new T.BoxGeometry(3,1.6,2),white,4,.8,0);for(let k=0;k<3;k++)mk(new T.CylinderGeometry(.5,.5,1.2,10),white,-4+k*1.2,.6,2.5);break;}
   case 'probe':{mk(new T.CylinderGeometry(1.3,1.1,.9,20),gold,0,.5,0);mk(new T.CylinderGeometry(.9,1.3,.4,20),white,0,1.15,0);mk(new T.CylinderGeometry(.03,.03,1.2,4),metal,.5,1.9,.3);break;}
   case 'shore':case 'channel':case 'crest':case 'rim':case 'fresh':case 'scarp':{tripod();break;}
  }
 }
 buildBoundary(){
  const pts=[];const h=this.w.half-72;const m=new T.MeshStandardMaterial({color:0xd0402c,emissive:0x401008,roughness:.6});const geo=new T.CylinderGeometry(.18,.18,3.2,6);geo.translate(0,1.6,0);
  for(let s=-h;s<=h;s+=96)for(const [x,z] of [[s,-h],[s,h],[-h,s],[h,s]])pts.push([x,z]);
  const im=new T.InstancedMesh(geo,m,pts.length);const M=new T.Matrix4();pts.forEach((p,i)=>{M.makeTranslation(p[0],this.t.height(p[0],p[1]),p[1]);im.setMatrixAt(i,M);});this.scene.add(im);
 }
}
export function mergeNonIndexed(geos){
 let n=0;for(const g of geos)n+=g.attributes.position.count;
 const P=new Float32Array(n*3),N=new Float32Array(n*3),C=new Float32Array(n*3);let o=0;
 for(const g of geos){if(!g.attributes.normal)g.computeVertexNormals();P.set(g.attributes.position.array,o*3);N.set(g.attributes.normal.array,o*3);if(g.attributes.color)C.set(g.attributes.color.array,o*3);else C.fill(1,o*3,(o+g.attributes.position.count)*3);o+=g.attributes.position.count;g.dispose();}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(P,3));g.setAttribute('normal',new T.BufferAttribute(N,3));g.setAttribute('color',new T.BufferAttribute(C,3));g.computeBoundingSphere();return g;
}
