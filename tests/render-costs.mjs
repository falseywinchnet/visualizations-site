import './three-local.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw Error('Usage: node tests/render-costs.mjs /path/to/baseline/docs/spider-drive/drive');
const baseline=name=>import(pathToFileURL(resolve(process.argv[2],name)).href);
const T=await import('three');
const {Spider}=await import('../docs/spider-drive/drive/physics.mjs');
const oldV=await baseline('vegetation-render.mjs'),newV=await import('../docs/spider-drive/drive/vegetation-render.mjs');
const oldS=await baseline('scenery.mjs'),newS=await import('../docs/spider-drive/drive/scenery.mjs');
const oldM=await baseline('vehicle.mjs'),newM=await import('../docs/spider-drive/drive/vehicle.mjs');
const median=a=>a.sort((x,y)=>x-y)[a.length>>1];
function bench(fn,n=1500){for(let i=0;i<100;i++)fn();const times=[];for(let r=0;r<7;r++){const t=performance.now();for(let i=0;i<n;i++)fn();times.push((performance.now()-t)/n);}return median(times);}
function queue(V){const v=Object.create(V.prototype);Object.assign(v,{chunks:new Map(),near:new Map(),pendingF:new Set(),pendingN:new Set(),last:new T.Vector3(),falling:[],dirty:false,rr:0,workers:[{postMessage(){}}],rebuild(){}});v.cfg('high');const cam=new T.Vector3();v.update(cam,[0,0,0],0);return ()=>v.update(cam,[0,0,0],0);}
function terrain(S){const s=Object.create(S.prototype);Object.assign(s,{nodes:new Map(),pending:new Map(),visible:new Set(),frame:0,K:.95,t:{base:()=>0},dispatch(){}});const cam=new T.Vector3(2359,70,739);s.update(cam);for(const r of s.queue)s.nodes.set(r.k,{visible:false,userData:{level:r.l,x0:r.x0,z0:r.z0,size:r.size,ymin:0,ymax:0,used:0}});s._dirty=true;s.update(cam);return {n:s.visible.size,run:()=>{s._dirty=true;s.update(cam);}};}
function model(M,legacy){const m=new M(),sp=new Spider({ground:()=>0,normal:()=>[0,1,0],surface:()=>({}),obstacles:()=>[]}),scene=new T.Scene();scene.add(m.root);const fn=()=>{m.update(sp,1/60);if(legacy)m.root.updateMatrixWorld();else m.root.updateWorldMatrix(true,false);scene.updateMatrixWorld();};fn();let updates=0;const original=T.Object3D.prototype.updateMatrix;T.Object3D.prototype.updateMatrix=function(){updates++;return original.call(this);};fn();T.Object3D.prototype.updateMatrix=original;let objects=0,triangles=0;m.root.traverse(o=>{objects++;if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return {updates,objects,triangles,ms:bench(fn,300)};}
const terrainBefore=terrain(oldS.Scenery),terrainAfter=terrain(newS.Scenery);
console.log(JSON.stringify({vegetationQueue:{beforeMs:bench(queue(oldV.Vegetation)),afterMs:bench(queue(newV.Vegetation))},terrainSelection:{visibleBefore:terrainBefore.n,visibleAfter:terrainAfter.n,beforeMs:bench(terrainBefore.run),afterMs:bench(terrainAfter.run)},vehicleFrame:{before:model(oldM.SpiderModel,true),after:model(newM.SpiderModel,false)}},null,2));
