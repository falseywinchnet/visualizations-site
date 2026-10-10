import './three-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const T=await import('three');
const {Vegetation}=await import('../docs/spider-drive/drive/vegetation-render.mjs');
const {CHUNK}=await import('../docs/spider-drive/drive/vegetation.mjs');
const {pruneCoveredTerrain}=await import('../docs/spider-drive/drive/scenery.mjs');
const {SpiderModel}=await import('../docs/spider-drive/drive/vehicle.mjs');
const {Spider}=await import('../docs/spider-drive/drive/physics.mjs');
const {Pool}=await import('../docs/spider-drive/drive/fx.mjs');

function makeQueue(quality='high'){
 const v=Object.create(Vegetation.prototype),sent=[];
 Object.assign(v,{chunks:new Map(),near:new Map(),pendingF:new Set(),pendingN:new Set(),falling:[],last:new T.Vector3(),dirty:false,rr:0,workers:[{postMessage:m=>sent.push(m)}],rebuild(){}});
 v.cfg(quality);return {v,sent};
}
// Brute-force original request policy, independent of the cached queue.
function referenceRequests(v,cx,cz){
 const req=[],rT=Math.ceil(v.Rt/CHUNK),rN=Math.ceil(Math.max(v.Rg,v.Rc)/CHUNK)+2;
 for(let j=-rT;j<=rT;j++)for(let i=-rT;i<=rT;i++){const d=Math.hypot(i,j)*CHUNK,k=v.key(cx+i,cz+j);if(d<=v.Rt+CHUNK&&!v.chunks.has(k)&&!v.pendingF.has(k))req.push([d,cx+i,cz+j,k,false]);}
 for(let j=-rN;j<=rN;j++)for(let i=-rN;i<=rN;i++){const k=v.key(cx+i,cz+j);if(!v.near.has(k)&&!v.pendingN.has(k))req.push([Math.hypot(i,j)*CHUNK-40,cx+i,cz+j,k,true]);}
 return req.sort((a,b)=>a[0]-b[0]).slice(0,Math.max(0,14-v.pendingF.size-v.pendingN.size)).map(([,cx,cz,key,nearOnly])=>({type:'veg',key,cx,cz,nearOnly,far:!nearOnly}));
}
test('vegetation requests retain nearest-first ordering through arrivals, movement, quality and eviction',()=>{
 const {v,sent}=makeQueue();
 for(let frame=0;frame<130;frame++){
  const cx=frame<45?0:frame<95?-2:13,cz=frame<95?-1:9,cam=new T.Vector3(cx*CHUNK+3,0,cz*CHUNK+3);
  if(frame===65)v.cfg('low');if(frame===95)v.cfg('medium');
  if(frame===85)for(let k=10000;k<10430;k++)v.near.set(k,[]);
  // Complete a varying number of jobs, including out-of-order completions.
  for(const [pending,ready]of [[v.pendingN,v.near],[v.pendingF,v.chunks]])for(const key of [...pending].reverse().slice(0,frame%8)){pending.delete(key);ready.set(key,[]);}
  const expected=referenceRequests(v,cx,cz);sent.length=0;v.update(cam,[cam.x,0,cam.z],0);
  assert.deepEqual(sent,expected,`frame ${frame}`);
  assert.ok(v.pendingF.size+v.pendingN.size<=14);
 }
});
test('stationary vegetation frames reuse the request queue without scanning maps',()=>{
 const {v}=makeQueue();v.update(new T.Vector3(),[0,0,0],0);const queue=v._requests;
 let lookups=0;for(const map of [v.chunks,v.near]){const has=map.has.bind(map);map.has=k=>{lookups++;return has(k);};}
 for(let i=0;i<120;i++)v.update(new T.Vector3(),[0,0,0],0);
 assert.equal(v._requests,queue);assert.equal(lookups,0);
});
function slowPrune(show,nodes){for(const k of [...show]){const u=nodes.get(k).userData;for(const k2 of show){const v=nodes.get(k2).userData;if(k!==k2&&v.level>u.level&&v.x0>=u.x0&&v.x0<u.x0+u.size&&v.z0>=u.z0&&v.z0<u.z0+u.size)show.delete(k2);}}return show;}
test('ancestor lookup preserves terrain coverage for random nested tiles and insertion orders',()=>{
 let seed=711;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 for(let trial=0;trial<50;trial++){
  const nodes=new Map();for(let n=0;n<500;n++){const level=trial===0?9:1+Math.floor(rand()*9),size=32768/2**level,i=Math.floor(rand()*2**level),j=Math.floor(rand()*2**level);nodes.set(level*1e8+i*1e4+j,{userData:{level,size,x0:-16384+i*size,z0:-16384+j*size}});}
  if(trial===1)nodes.set(0,{userData:{level:0,size:32768,x0:-16384,z0:-16384}});
  const before=new Set(nodes.keys());assert.deepEqual(pruneCoveredTerrain(new Set(before),nodes),slowPrune(new Set(before),nodes));
 }
});
test('tyre deformation uses current-frame spin, steering, body and suspension transforms',()=>{
 const model=new SpiderModel(),sp=new Spider({ground:()=>0,normal:()=>[0,1,0],surface:()=>({}),obstacles:()=>[]});
 const scene=new T.Scene();scene.add(model.root);model.update(sp,0);scene.updateMatrixWorld(true);
 sp.q=[.08,.15,-.03,Math.sqrt(1-.08**2-.15**2-.03**2)];sp.steer=[.3,-.2,0];sp.carriage=.8;
 for(let i=0;i<6;i++){sp.wheels[i].spin=.7+i*.4;sp.wheels[i].e=.2+i*.4;sp.wheels[i].cn=[.1,Math.sqrt(.95),.2];sp.wheels[i].contact=true;}
 model.update(sp,1/60);const before=model.wheels.map(w=>w.tireMat.userData.down.value.clone());scene.updateMatrixWorld(true);
 for(let i=0;i<6;i++){const expected=new T.Vector3(...sp.wheels[i].cn).negate().transformDirection(model.wheels[i].spin.matrixWorld.clone().invert());assert.ok(before[i].distanceTo(expected)<1e-12);}
});
test('empty particle pools do not upload capacity; live and swap-removed particles still upload',()=>{
 const p=new Pool(new T.Scene(),new T.Texture(),7000,false),attrs=Object.values(p.g.attributes).filter(a=>a.isInstancedBufferAttribute);
 for(let i=0;i<120;i++)p.update(1/60,[0,0]);assert.ok(attrs.every(a=>a.version===0&&a.updateRanges.length===0));
 const spawn=life=>p.spawn(1,2,3,1,2,3,life,1,2,1,.5,.2,1,1);
 spawn(.01);spawn(2);p.update(.02,[1,1]);assert.equal(p.g.instanceCount,1);assert.ok(p.p.slice(0,3).every(Number.isFinite));
 for(const a of attrs)assert.deepEqual(a.updateRanges,[{start:0,count:a.itemSize}]);
 p.update(.02,[1,1]);for(const a of attrs)assert.equal(a.updateRanges.length,1);
 p.update(3,[1,1]);assert.equal(p.g.instanceCount,0);assert.ok(attrs.every(a=>a.updateRanges.length===0));
 const versions=attrs.map(a=>a.version);p.update(.1,[0,0]);assert.deepEqual(attrs.map(a=>a.version),versions);
});
