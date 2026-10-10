import test from 'node:test';
import assert from 'node:assert/strict';
import {Spider,setBody,DT,GEOM} from '../docs/spider-drive/drive/physics.mjs';
import {BODIES,BODY_SURFACES} from '../docs/spider-drive/drive/bodies.mjs';
import {tireForces,tireGrip,stepWheel,TIRE,tireNormalResponse,tireRadialStiffness} from '../docs/spider-drive/drive/tires.mjs';

const surface=BODY_SURFACES.titan.sand;
const env={ground:()=>0,normal:()=>[0,1,0],surface:()=>surface,obstacles:()=>[]};
function settled(){
 setBody(BODIES.titan);const s=new Spider(env);
 for(let i=0;i<300;i++){s.control();for(let j=0;j<4;j++)s.step(DT);}
 return s;
}
for(const lateral of [0,2,-5])test(`wheel angular impulse matches applied tire force at ${lateral} m/s sideslip`,()=>{
 const s=settled();s.vel=[lateral,0,-10];s.w=[0,0,0];s.hold=false;s.ctl.assist=false;
 const before=s.wheels.map(w=>{w.omega=10/GEOM.R;w.targetOmega=12/GEOM.R;w.Ti=0;return {omega:w.omega,sink:w.sink,pressure:w.pressure};});
 s.step(DT);
 for(const [i,w] of s.wheels.entries()){
  const b=before[i],pfac=(2.5-b.pressure)/1.7;
  const roll=(surface.roll*(1+.6*pfac*(1-surface.soft))+b.sink*.35)*w.load*GEOM.R*Math.tanh(b.omega*3);
  const expected=DT*(w.torque-GEOM.R*w.fx-roll),actual=300*(w.omega-b.omega);
  assert.ok(Math.abs(actual-expected)<1e-5,`wheel ${i}: angular impulse residual ${actual-expected} N m s`);
 }
});

test('overloaded tires never gain grip when transitioning to sliding',()=>{
 for(const body of Object.values(BODY_SURFACES))for(const surface of Object.values(body))
 for(const pressure of [.8,1.6,2.5])for(const ratio of [.01,1,4,8,20]){
  const {peak,slide}=tireGrip(surface,pressure,6000*ratio,6000);
  assert.ok(peak>=0&&slide>=0&&slide<=peak);
  assert.ok(Math.abs(slide/peak-surface.slide/surface.mu)<1e-12);
 }
});

test('combined-slip forces dissipate energy and stay inside the grip budget',()=>{
 for(const vx of [-20,-.01,0,.01,20])for(const vy of [-10,0,10])for(const omega of [-30,0,30])
 for(const load of [0,6000,40000,800000]){
  const p={radius:1.7,vx,vy,load,mu:.7,muSlide:.5};const f=tireForces(omega,p);
  assert.ok(Number.isFinite(f.fx+f.fy+f.slip+f.slipAngle));
  assert.ok(Math.hypot(f.fx,f.fy)<=p.mu*load+1e-8);
  assert.ok(f.fx*(vx-p.radius*omega)+f.fy*vy<=1e-8);
  if(load===0)assert.equal(Math.hypot(f.fx,f.fy),0);
 }
});

test('implicit spin balances angular impulse through drive, brake, reversal and lost grip',()=>{
 for(const vx of [-20,0,20])for(const vy of [-10,0,10])for(const omega of [-20,0,20])
 for(const load of [0,6000,40000,800000])for(const grip of [0,.25,1])for(const dt of [1/120,1/240,1/480]){
  const p={omega,dt,radius:1.7,vx,vy,load,mu:.7,muSlide:.5,grip,target:-omega,gain:14000,integral:2000,torqueLimit:52000,rolling:0};
  const r=stepWheel(p);
  const residual=TIRE.inertia*(r.omega-omega)-dt*(r.torque-p.radius*r.fx);
  assert.ok(Number.isFinite(residual));assert.ok(Math.abs(residual)<1e-5,`angular impulse residual ${residual}`);
  assert.ok(Math.abs(r.torque)<=p.torqueLimit);
  assert.ok(Math.hypot(r.fx,r.fy)<=p.mu*load*grip+1e-8);
 }
});

test('an unpowered spinning tire slows without friction adding rotational energy',()=>{
 for(const initial of [-30,30]){
  let omega=initial;
  // 9000 N m s initial momentum needs ~1.8 s at the sliding torque limit.
  for(let i=0;i<720;i++){
   const r=stepWheel({omega,dt:DT,radius:1.7,vx:0,vy:0,load:6000,mu:.7,muSlide:.5});
   assert.ok(Math.abs(r.omega)<=Math.abs(omega)+1e-9);omega=r.omega;
  }
  assert.ok(Math.abs(omega)<1e-6);
 }
});

test('traction control retains braking torque that recovers existing wheelspin',()=>{
 const torque=[];
 for(const assist of [false,true]){
  const s=settled();s.vel=[0,0,-10];s.w=[0,0,0];s.hold=false;s.ctl.assist=assist;
  for(const w of s.wheels){w.omega=25/GEOM.R;w.targetOmega=0;w.Ti=0;}
  s.step(DT);torque.push(s.wheels.map(w=>w.torque));
 }
 for(let i=0;i<6;i++){assert.ok(torque[0][i]<0);assert.equal(torque[0][i],torque[1][i]);}
});

test('radial spring is progressive, pressure dependent and softer than the sidewall',()=>{
 let previousPressure=0;
 for(const pressure of [.8,1.6,2.5]){
  assert.ok(tireRadialStiffness(pressure)>previousPressure);previousPressure=tireRadialStiffness(pressure);
  let previousForce=0,previousStiffness=0;
  for(const penetration of [.01,.05,.1,.2,.3,.4]){
   const tread=tireNormalResponse({pressure,penetration,speed:0});
   const side=tireNormalResponse({pressure,penetration,speed:0,sidewall:1});
   assert.ok(tread.force>previousForce&&tread.stiffness>previousStiffness);
   assert.ok(side.force>tread.force);previousForce=tread.force;previousStiffness=tread.stiffness;
   const e=1e-6,after=tireNormalResponse({pressure,penetration:penetration+e,speed:0});
   assert.ok(Math.abs((after.force-tread.force)/e/tread.stiffness-1)<1e-4);
  }
 }
});

test('normal response is unilateral and its damper opposes compression and rebound',()=>{
 for(const pressure of [.8,1.6,2.5])for(const penetration of [-.01,0,.05,.2,.45,.5])for(const speed of [-5,0,5]){
  const r=tireNormalResponse({pressure,penetration,speed}),spring=tireNormalResponse({pressure,penetration,speed:0});
  assert.ok(r.force>=0&&r.force<=800000);
  if(penetration<=0)assert.equal(r.force,0);
  assert.ok((r.force-spring.force)*speed>=-1e-8);
 }
});

test('rim cushion has no force discontinuity at its engagement depth',()=>{
 for(const speed of [-1,0,1]){
  const below=tireNormalResponse({pressure:1.6,penetration:.45-1e-8,speed});
  const above=tireNormalResponse({pressure:1.6,penetration:.45+1e-8,speed});
  assert.ok(Math.abs(above.force-below.force)<.1);
 }
});

for(const tires of ['standard','compliant'])for(const body of Object.values(BODIES))test(`${body.name}, ${tires}: settles, drives, turns, stops and reverses`,()=>{
 setBody(body);const s=new Spider(env,{tires});
 const advance=seconds=>{for(let i=0;i<seconds*60;i++){s.control();for(let j=0;j<4;j++)s.step(DT);assert.ok(s.pos.every(Number.isFinite));assert.ok(!s.overturned);}};
 advance(8);assert.ok(s.speed()<.1);assert.equal(s.wheels.filter(w=>w.contact).length,6);
 const supported=s.wheels.reduce((sum,w)=>sum+w.load,0);
 assert.ok(Math.abs(supported/(s.totalMass*body.g)-1)<.1);
 s.ctl.limit=20/3.6;s.ctl.throttle=1;advance(25);assert.ok(s.speed()>4);
 const h=s.heading();s.ctl.steer=1;advance(8);
 assert.ok(Math.abs(Math.atan2(Math.sin(s.heading()-h),Math.cos(s.heading()-h)))>.3);
 s.ctl.steer=0;s.ctl.brake=true;advance(20);assert.ok(s.speed()<.2);
 s.ctl.brake=false;s.ctl.throttle=-1;advance(15);
 const R=s.R;assert.ok(s.vel[0]*-R[2]+s.vel[2]*-R[8]<-2);
});
