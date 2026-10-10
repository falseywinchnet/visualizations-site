// Deterministic scenario measurements. Optional argument selects a baseline module.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {BODIES,BODY_SURFACES} from '../docs/spider-drive/drive/bodies.mjs';
const {Spider,setBody,DT,GEOM}=await import(process.argv[2]&&process.argv[2]!=='-'?pathToFileURL(resolve(process.argv[2])).href:'../docs/spider-drive/drive/physics.mjs');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const earth={name:'Test dirt',mu:.7,slide:.56,roll:.03,soft:.25};
const rows=[],tires=process.argv[3]==='standard'?'standard':'compliant';
for(const body of Object.keys(BODIES))for(const scenario of ['drop','corrugation','one-sided-bump','side-landing','side-landing-hard']){
 setBody(BODIES[body]);let active=false;
 const ground=(x,z)=>{
  if(!active)return 0;const distance=-z;
  if(scenario==='corrugation')return .18*smooth((distance-12)/6)*Math.sin(distance*Math.PI/3)**2*(.3+.7*smooth(-x));
  if(scenario==='one-sided-bump'&&distance>30&&distance<36)return .65*Math.sin((distance-30)*Math.PI/6)**2*smooth(-x);
  return 0;
 };
 const normal=(x,z)=>{const e=.01,a=ground(x-e,z)-ground(x+e,z),b=ground(x,z-e)-ground(x,z+e),l=Math.hypot(a,2*e,b);return [a/l,2*e/l,b/l];};
 const env={ground,normal,surface:()=>body==='earth'?earth:BODY_SURFACES[body].sand||BODY_SURFACES[body].regolith,obstacles:()=>[]};
 const s=new Spider(env,{tires});
 const tick=()=>{s.control();for(let i=0;i<4;i++)s.step(DT);};
 for(let i=0;i<360;i++)tick();active=true;
 if(scenario==='drop')s.pos[1]+=.6;
 if(scenario.startsWith('side-landing')){
  const a=35*Math.PI/180;s.q=[0,0,Math.sin(a/2),Math.cos(a/2)];
  const lowest=Math.min(...s.wheels.map(w=>s.toWorld(s.hubBody(w))[1]-GEOM.R));
  s.pos[1]+=.05-lowest;s.w=[0,0,scenario==='side-landing-hard'?1:.6];
 }
 if(scenario==='corrugation'||scenario==='one-sided-bump'){
  const v=30/3.6;s.vel=[0,0,-v];s.vcmd=v;s.ctl.limit=v;s.ctl.throttle=1;
  for(const w of s.wheels)w.omega=v/GEOM.R;
 }
 let peakTilt=0,peakUpAccel=0,peakWheelLoad=0,airWheelSeconds=0,airAllSeconds=0,peakDeflection=0;
 for(let i=0;i<720;i++){
  tick();const n=s.wheels.filter(w=>w.contact&&w.load>1).length;
  airWheelSeconds+=(6-n)/60;if(n===0)airAllSeconds+=1/60;
  peakTilt=Math.max(peakTilt,Math.acos(clamp(s.R[4],-1,1))*180/Math.PI);
  peakUpAccel=Math.max(peakUpAccel,s.acc[1]);
  peakWheelLoad=Math.max(peakWheelLoad,...s.wheels.map(w=>w.load));
  peakDeflection=Math.max(peakDeflection,...s.wheels.map(w=>w.deflection));
 }
 const round=x=>+x.toFixed(3);
 rows.push({body,scenario,peakTilt:round(peakTilt),peakUpAccel:round(peakUpAccel),peakWheelLoad:round(peakWheelLoad),airWheelSeconds:round(airWheelSeconds),airAllSeconds:round(airAllSeconds),peakDeflection:round(peakDeflection),overturned:s.overturned,finalKmh:round(s.speed()*3.6)});
}
console.log(JSON.stringify(rows,null,2));
