// Module worker: generates the world off the main thread, streaming progress and hillshade previews.
import {generateWorld,transferList} from './worldgen.mjs';
import {generateBody} from './worldgen-bodies.mjs';
self.onmessage=e=>{
 const {seed,body}=e.data;
 try{
  const prog=p=>{if(p.preview){const d=p.preview.data;self.postMessage({type:'preview',stage:p.stage,iteration:p.iteration,w:p.preview.w,h:p.preview.h,data:d},[d.buffer]);}else self.postMessage({type:'progress',stage:p.stage,p:p.p});};
  const world=body&&body!=='earth'?generateBody(body,seed,prog):generateWorld(seed,prog);
  self.postMessage({type:'done',world},transferList(world));
 }catch(err){self.postMessage({type:'error',message:String(err&&err.stack||err)});}
};
