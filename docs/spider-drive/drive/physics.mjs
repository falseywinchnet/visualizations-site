// Spider vehicle dynamics. Pure JS, deterministic, no three.js. Metres, kilograms, seconds.
// Body frame: x right, y up, z back (forward is -Z); origin at the ground reference under the
// cabin centre. Chassis is a 6-DOF rigid body; each wheel has an unsprung DOF along its strut
// and a spin DOF. Struts are hydropneumatic (oil setpoint + nitrogen accumulator). A 60 Hz
// controller does levelling, load allocation, skyhook damping and step climbing.
// This is a speculative concept model: plausible physics, not a validated vehicle.

export const GEOM=Object.freeze({R:1.7,tireWidth:.76,halfTrack:4.5,roadHalfTrack:3.0,splay:5.5*Math.PI/180,stations:[-4.7,0,4.7],stroke:3.6,hubTop:3.24,plateY:6.11,topPlate:6.4,belly:2.6,cabinY:4.2,cabinR:1.6,cabinHalf:5.4,wheelbase:9.4,maxLock:40*Math.PI/180,carriageMax:2.0,intakeY:7.3});
export const DT=1/240;
// Self-righting arms: two curved telescoping fingers hung from the top frame beside the pod, at one station just
// behind the middle legs. Each sleeve hangs down the side of the pod, clear of it (the pod slides on its carriage;
// the arms do not), and its finger pokes up out of the sleeve's top and slides out along a circle centred off on the
// far side of the pod, so it arcs up over the roof and out past the far side's legs. Five segments slide out in turn,
// base first, with a broad rubber fingertip shoe on the last. Stowed, everything sits inside the machine's outline:
// on its roof or side it lies on its own frame, not on the arms.
//  - On its side, the finger on the high side reaches over the roof and its shoe levers the top edge up off the
//    ground; the machine pivots on its low-side tyres until it falls back onto its wheels (legs retracted: a high pivot).
//  - On its roof, the finger on the high side (either, on the level) pokes straight down past the roof, lifts that
//    edge and carries the machine over its far side like a wheel rim, onto that side and on over onto its wheels.
const D2R=Math.PI/180;
export const ARM=Object.freeze({cy:4.2,cx:[-2.6,2.6],R:5.0,z:1.3,tip:[20*D2R,160*D2R],dir:[1,-1],sleeve:35*D2R,L:36*D2R,S:31*D2R,n:5,
 rTube:[.2,.18,.16,.145,.13,.115],pad:{w:1.6,half:3.4*D2R,rin:.12,rout:.32},max:155*D2R,out:20*D2R,ret:45*D2R,acc:14*D2R,F:4.5e5,mu:.8,mass:900});
export function armOffsets(E,out=[0,0,0,0,0,0]){let acc=0;out[0]=0;for(let j=1;j<=ARM.n;j++){acc+=clamp(E-(j-1)*ARM.S,0,ARM.S);out[j]=acc;}return out;}
let G=9.81,RHO=1000,AIR=1.2,SEALED=false;/* gravity, liquid and air density of the body the machine is on; SEALED: off Earth there is no oxygen to burn, so the drive is electric from a closed-cycle fuel-cell pack and battery (no intake to drown, full torque from standstill) */
export const isElectric=()=>SEALED;
const STOPC=2.5e5;/* strut end-stop cushion damping */
const PISTON=.0095,PN0=1.55e6,GAMMA=1.3,UNSPRUNG=820;/* hub motor, brake, rim and a fluid-ballasted tyre */
// charged for the body it stands on: accumulator pre-charge with g (a leg's share of the weight still sits mid-stroke),
// the same gas volume, damper bleed with its square root (the tyres keep the pressures the driver sets). The machine is then the
// same machine in proportion to its weight: its ride and its hops scale as the ground's do (speed with the square
// root of g), and a bump in low gravity does not hand back more than that gravity can hold down.
let PN=PN0,VSC=1,DSC=1,TSC=1;
export function setBody(b){G=b.g;RHO=b.liquid?b.liquid.rho:1000;AIR=b.air;SEALED=b.id!=='earth';const r=G/9.81;PN=PN0*r;VSC=1;DSC=Math.sqrt(r);TSC=1;}
export const bodyG=()=>G;
const clamp=(v,a,b)=>v<a?a:v>b?b:v,mix=(a,b,t)=>a+(b-a)*t;
// ---- small vector helpers (arrays)
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const len=a=>Math.hypot(a[0],a[1],a[2]),norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
function qmat(q){const [x,y,z,w]=q,xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;
 return [1-2*(yy+zz),2*(xy-wz),2*(xz+wy), 2*(xy+wz),1-2*(xx+zz),2*(yz-wx), 2*(xz-wy),2*(yz+wx),1-2*(xx+yy)];}
const mv=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const mtv=(m,v)=>[m[0]*v[0]+m[3]*v[1]+m[6]*v[2],m[1]*v[0]+m[4]*v[1]+m[7]*v[2],m[2]*v[0]+m[5]*v[1]+m[8]*v[2]];
function inv3(m){const [a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,det=a*A+b*B+c*C,s=1/det;
 return [A*s,-(b*i-c*h)*s,(b*f-c*e)*s, B*s,(a*i-c*g)*s,-(a*f-c*d)*s, C*s,-(a*h-b*g)*s,(a*e-b*d)*s];}
function qmul(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function qnorm(q){const l=Math.hypot(...q);return [q[0]/l,q[1]/l,q[2]/l,q[3]/l];}
function qyaw(y){return [0,Math.sin(y/2),0,Math.cos(y/2)];}

export const VARIANTS={
 scout:{name:'Scout',crew:6,payload:[],tank:0},
 troop:{name:'Troop carrier',crew:8,payload:[{m:600,pos:[0,4.2,0],size:[3.2,3.2,10.4],moves:true}],tank:0},
 rescue:{name:'Rescue',crew:4,payload:[{m:320,pos:[0,3.3,1.2],size:[.8,.4,2.2],moves:true}],tank:0},
 fire:{name:'Fire support',crew:6,payload:[{m:420,pos:[0,6.9,.2],size:[2.2,.6,8],moves:false}],tank:3500},
};
export const PRESSURES={road:2.5,terrain:1.6,soft:.8};

export class Spider{
 constructor(env,opts={}){
  this.env=env;this.variant=opts.variant||'scout';this.crewCount=opts.crew??VARIANTS[this.variant].crew;
  this.water=VARIANTS[this.variant].tank;// litres ~ kg
  this.carriage=0;this.carriageTarget=0;
  // controls & modes
  this.ctl={throttle:0,steer:0,brake:false,limit:40/3.6,retraction:.5,assist:true,climb:true,suspension:'auto',tire:'terrain',lift:[false,false,false],carriageManual:null,track:1};this.trackFrac=1;this.wheelTrack=[1,1,1,1,1,1];this.trackSeq=null;this._trackReq=1;
  this.t=0;this.wheels=[];
  for(let i=0;i<6;i++)this.wheels.push({pair:i>>1,side:(i&1)?1:-1,e:GEOM.stroke/2,ev:0,eset:GEOM.stroke/2+.15,spin:0,omega:0,load:0,contact:false,pressure:1.6,sink:0,slip:0,slipAngle:0,surface:null,anchor:null,disabled:false,lifted:false,gas:PN,deflection:0,cp:[0,0,0],cn:[0,1,0],hub:[0,0,0],mount:[0,0,0],water:0,torque:0,depthUnder:0});
  this.steer=[0,0,0];// plate angles (front, middle, rear=0)
  this.pos=[0,0,0];this.vel=[0,0,0];this.q=[0,0,0,1];this.w=[0,0,0];this.acc=[0,0,0];
  this.arms=[{ext:0,rate:0,load:0,touch:0},{ext:0,rate:0,load:0,touch:0}];this.sr=null;
  this.engine={rpm:550,load:0,stalled:false,stallTimer:0,pump:0,off:false,crank:0,boost:0,heat:0};this.vcmd=0;this.hold=true;
  this.hull=100;this.damage=[];this.events=[];this.cabinAcc=[0,0,0];this.jerk=0;this.comfort=1;
  this.climbState=null;this.message='Ready';this.messageT=0;this.overturned=false;this.flooded=0;this.brush=0;this.breaks=0;
  this.distance=0;this.maxTilt=0;this.impacts=0;this.integ=[0,0,0];
  this.suspMode='soft';this.Vn=.006*VSC;this.dampC1=5200*DSC;this.dampC2=2600;this.kGas=GAMMA*PN*PISTON*PISTON/this.Vn;
  this.recomputeMass();
  this.place(opts.x??0,opts.z??0,opts.yaw??0);
 }
 // ---------------------------------------------------------------- mass model
 recomputeMass(){
  const items=[
   {m:5000,pos:[0,4.2,0],size:[3.0,3.2,10.8],moves:true},// cabin shell, seats, glazing
   {m:2500,pos:[0,6.2,0],size:[2.6,.5,10.4],moves:false},// overhead plates, crossbars, top cover
   {m:650,pos:[0,3.8,4.4],size:[1.2,.9,1.1],moves:true},// power pack (turbo diesel V8 on Earth, fuel-cell stack and battery elsewhere), pumps, reservoir, cooling (light for what it is: a concession, so a rear leg can be walked on its own)
   {m:3000,pos:[0,4.3,0],size:[9.2,2.6,9.4],moves:false},// leg barrels, knee braces, arms, slide gear
   {m:7500,pos:[0,2.95,0],size:[2.4,.5,9.4],moves:true},// keel: battery bank, hydraulic reservoir, ballast tanks and armour under the floor
   {m:ARM.mass,pos:[0,4.6,ARM.z],size:[4.6,3.2,.6],moves:false},// self-righting arms, hung either side of the pod
   {m:this.crewCount*110,pos:[0,3.7,-.8],size:[1.4,1,7],moves:true},
   ...VARIANTS[this.variant].payload];
  if(this.water>0)items.push({m:this.water,pos:[0,7.1,.2],size:[2.2,.9*Math.max(.1,this.water/3500),7.6],moves:false,slosh:true});
  let M=0,c=[0,0,0];
  for(const it of items){const p=it.moves?[it.pos[0],it.pos[1],it.pos[2]+this.carriage]:it.pos;it._p=p;M+=it.m;c=add(c,scl(p,it.m));}
  c=scl(c,1/M);const I=[0,0,0,0,0,0,0,0,0];
  for(const it of items){const r=sub(it._p,c),[sx,sy,sz]=it.size,m=it.m;
   I[0]+=m*(sy*sy+sz*sz)/12+m*(r[1]*r[1]+r[2]*r[2]);I[4]+=m*(sx*sx+sz*sz)/12+m*(r[0]*r[0]+r[2]*r[2]);I[8]+=m*(sx*sx+sy*sy)/12+m*(r[0]*r[0]+r[1]*r[1]);
   I[1]-=m*r[0]*r[1];I[3]-=m*r[0]*r[1];I[2]-=m*r[0]*r[2];I[6]-=m*r[0]*r[2];I[5]-=m*r[1]*r[2];I[7]-=m*r[1]*r[2];}
  const unsprung=6*UNSPRUNG;
  // the wheel assemblies slide only along their struts: across them (body x and z) they move with the frame, so they
  // add to its inertia as points that carry those two components of their motion (along the strut they are the
  // unsprung DOF). Without this the frame rolls as if 5 t of hub, motor and tyre out at the legs weighed nothing.
  if(this.wheels?.length===6)for(const wh of this.wheels){const h=this.hubBody(wh,GEOM.stroke/2),rx=h[0]-c[0],ry=h[1]-c[1],rz=h[2]-c[2],m=UNSPRUNG;
   I[0]+=m*ry*ry;I[4]+=m*(rx*rx+rz*rz);I[8]+=m*ry*ry;I[1]-=m*rx*ry;I[3]-=m*rx*ry;I[5]-=m*ry*rz;I[7]-=m*ry*rz;}
  if(this.com){// keep the body origin fixed when the CoM moves
   const R=qmat(this.q),origin=sub(this.pos,mv(R,this.com));this.pos=add(origin,mv(R,c));}
  this.mass=M;this.com=c;this.Ib=I;this.IbInv=inv3(I);this.totalMass=M+unsprung;this.items=items;
 }
 // ---------------------------------------------------------------- placement
 // ignition: stopping is refused mid-manoeuvre (a lifted leg needs the pump to come back down)
 setEngine(on){const E=this.engine;
  if(on){if(!E.off||E.crank>0)return;if(E.stalled){this.say('Engine is flooded: wait for it to clear',2);return;}E.crank=SEALED?.45:1.1;this.events.push({type:'starter'});this.say(SEALED?'Power pack: closing contactors':'Starting',1.2);return;}
  if(E.off)return;if(this.trackSeq||this.climbState||this.wheels.some(w=>w.lifted)){this.say(SEALED?'Set the legs down before switching the drive off':'Set the legs down before stopping the engine',2.5);return;}
  E.off=true;E.crank=0;this.events.push({type:'engineStop'});this.say(SEALED?'Drive power off: brakes held':'Engine off: brakes held',2);}
 place(x,z,yaw=0){
  this.cancelTrack(true);this.engine.off=false;this.engine.crank=0;
  this.vel=[0,0,0];this.w=[0,0,0];this.vcmd=0;this.overturned=false;this.integ=[0,0,0];if(this.arms)for(const a of this.arms){a.ext=0;a.rate=0;}this.sr=null;
  // fit the terrain plane under the six tyres and stand on it at nominal posture
  const q0=qyaw(-yaw),R0=qmat(q0),hf=[-R0[2],0,-R0[8]],hr=[R0[0],0,R0[6]];
  const P=[];for(const wh of this.wheels){const hb=this.hubBody(wh,GEOM.stroke/2),hw=mv(R0,hb);P.push([hw[0],hw[2],this.env.ground(x+hw[0],z+hw[2],1e9)]);}
  let n=0,sx=0,sz=0,sg=0,sxx=0,szz=0,sxz=0,sxg=0,szg=0;for(const [px,pz,g] of P){const a=px*hr[0]+pz*hr[2],b=px*hf[0]+pz*hf[2];n++;sx+=a;sz+=b;sg+=g;sxx+=a*a;szz+=b*b;sxz+=a*b;sxg+=a*g;szg+=b*g;}
  const r=mv(inv3([sxx,sxz,sx,sxz,szz,sz,sx,sz,n]),[sxg,szg,sg]);
  const roll=Math.atan(r[0]),pitch=Math.atan(r[1]);// start parallel to the ground; the controller levels from there
  const qr=[Math.sin(-roll/2)*hf[0],0,Math.sin(-roll/2)*hf[2],Math.cos(roll/2)];
  const qp=[Math.sin(pitch/2)*hr[0],0,Math.sin(pitch/2)*hr[2],Math.cos(pitch/2)];
  this.q=qnorm(qmul(qp,qmul(qr,q0)));
  const R=qmat(this.q);let need=-1e9;
  for(const wh of this.wheels){const hb=this.hubBody(wh,GEOM.stroke/2),hw=mv(R,hb);const g=this.env.ground(x+hw[0],z+hw[2],1e9);need=Math.max(need,g+GEOM.R-hw[1]);}
  for(const wh of this.wheels){wh.e=GEOM.stroke/2;wh.eset=GEOM.stroke/2+.15;wh.ev=0;wh.omega=0;wh.anchor=null;}
  this.pos=add([x,need+.03,z],mv(R,this.com));this.climbState=null;
  for(const wh of this.wheels){wh.pressure=PRESSURES[this.ctl.tire];}
 }
 get R(){return qmat(this.q);}
 origin(R=qmat(this.q)){return sub(this.pos,mv(R,this.com));}
 // track: legs slide in along telescoping arms for roads (narrower, less lock, less side stability)
 // abandon any track change; with snap, bring all six legs to one track (after a recovery or restart)
 cancelTrack(snap){if(!this.wheelTrack)return;for(const w of this.wheels)if(!w.disabled)w.lifted=false;this.trackSeq=null;if(snap){const f=this.trackFrac>=.5?1:0;this.wheelTrack.fill(f);this.trackFrac=f;this._trackReq=f;this.ctl.track=f;this._hp=null;}}
 ht(i){const f=i===undefined?this.trackFrac:this.wheelTrack[i];return GEOM.roadHalfTrack+(GEOM.halfTrack-GEOM.roadHalfTrack)*f;}
 // legs are splayed: each strut runs down and outward at GEOM.splay, so the tyre steps out as the leg extends
 // (ht is the tyre's lateral offset at mid-stroke)
 hubBody(wh,e=wh.e){const d=this.steer[wh.pair],zs=GEOM.stations[wh.pair],h=this.ht(this.wheels.indexOf(wh))+Math.sin(GEOM.splay)*(e-GEOM.stroke/2);return [wh.side*h*Math.cos(d),GEOM.hubTop-Math.cos(GEOM.splay)*e,zs-wh.side*h*Math.sin(d)];}
 strutAxis(wh){const d=this.steer[wh.pair],sn=Math.sin(GEOM.splay);return [wh.side*sn*Math.cos(d),Math.cos(GEOM.splay),-wh.side*sn*Math.sin(d)];}// body frame, hub -> mount
 toWorld(pb,R=qmat(this.q),o=this.origin(R)){return add(o,mv(R,pb));}
 pointVel(pw){return add(this.vel,cross(this.w,sub(pw,this.pos)));}
 // ---------------------------------------------------------------- gas spring
 volume(){const soft=this.suspMode==='soft';return soft?.006:.0025;}
 gasForce(wh,e){const Vn=this.Vn,raw=Vn-PISTON*(wh.eset-e),v=clamp(raw,Vn*.12,Vn*1.25);const P=PN*Math.pow(Vn/v,GAMMA);wh.gas=P;let F=P*PISTON;if(raw>Vn*1.25)F-=3e6*(raw-Vn*1.25)/PISTON;return F;}// oil lock once the accumulator is empty of oil
 gasStiffness(wh,e){const Vn=this.Vn,raw=Vn-PISTON*(wh.eset-e),v=clamp(raw,Vn*.12,Vn*1.25);return GAMMA*PN*Math.pow(Vn/v,GAMMA)*PISTON*PISTON/v+(raw>Vn*1.25?3e6:0);}
 // setpoint giving force F at extension e
 esetFor(F,e){const Vn=this.Vn,r=Math.pow(PN*PISTON/Math.max(F,500),1/GAMMA);return e+(Vn/PISTON)*(1-r);}
 // ---------------------------------------------------------------- step
 step(dt=DT){
  this.t+=dt;const R=qmat(this.q),o=this.origin(R),up=[R[1],R[4],R[7]];
  const F=[0,-G*this.mass,0];let T=[0,0,0];
  const applyAt=(f,pw)=>{F[0]+=f[0];F[1]+=f[1];F[2]+=f[2];const r=sub(pw,this.pos);const t=cross(r,f);T[0]+=t[0];T[1]+=t[1];T[2]+=t[2];};
  const env=this.env,Rw=GEOM.R;
  let drivePower=0;
  for(let i=0;i<6;i++){
   const wh=this.wheels[i],pair=wh.pair,d=this.steer[pair];
   const hT=this.ht(i)-Math.sin(GEOM.splay)*GEOM.stroke/2,mb=[wh.side*hT*Math.cos(d),GEOM.hubTop,GEOM.stations[pair]-wh.side*hT*Math.sin(d)];
   const ax=mv(R,this.strutAxis(wh));/* strut axis in the world: the unsprung DOF slides along it */
   const M=add(o,mv(R,mb)),hub=sub(M,scl(ax,wh.e));wh.mount=M;wh.hub=hub;wh.axis=ax;
   const vM=this.pointVel(M),vH=sub(vM,scl(ax,wh.ev));
   const fb=[-Math.sin(d),0,-Math.cos(d)],fw=mv(R,fb);
   let fh=[fw[0],0,fw[2]];const fl=Math.hypot(fh[0],fh[2])||1;fh=[fh[0]/fl,0,fh[2]/fl];
   // ---- contact: circle vs height profile along the wheel's line, split into a ground patch and an edge patch
   // (a tyre pressed against a step face climbs it by the friction at the edge, which points up the face)
   const pg={pen:-1,p:null,ax:0,ay:0,az:0},pe={pen:-1,p:null,ax:0,ay:0,az:0,above:0};const sink=wh.sink;let gSup=-1e9;
   // a tyre is a disc, not a ball: as its axle tips toward the vertical (the machine on its side) the reach toward the
   // ground shrinks from the radius to half the tread width (unchanged for ordinary roll and splay)
   const axl=mv(R,[Math.cos(d),0,-Math.sin(d)]),ka=Math.abs(axl[1]),Rc=ka<.35?Rw:Math.min(Rw,Rw*Math.sqrt(1-ka*ka)+GEOM.tireWidth*.5*ka);
   for(let k=-6;k<=6;k++){const s=k/6*Rc*.98,gx=hub[0]+fh[0]*s,gz=hub[2]+fh[2]*s,gy=env.ground(gx,gz,hub[1])-sink;
    gSup=Math.max(gSup,gy+Math.sqrt(Math.max(0,Rc*Rc-s*s))-Rc);// where a rigid tyre of this radius rests on the profile
    let p,nx,ny,nz,py;
    if(gy>hub[1]){// solid column reaches above the hub: nearest point is level with the hub
     if(Math.abs(s)<.12){p=Rc+(gy-hub[1]);nx=0;ny=1;nz=0;py=gy;}else{p=Rc-Math.abs(s);nx=-fh[0]*Math.sign(s);ny=0;nz=-fh[2]*Math.sign(s);py=hub[1];}}
    else{const dx=hub[0]-gx,dy=hub[1]-gy,dz=hub[2]-gz,dd=Math.hypot(dx,dy,dz)||1e-6;p=Rc-dd;nx=dx/dd;ny=dy/dd;nz=dz/dd;py=gy;}
    const P=(ny<.35&&Math.abs(s)>.3)?pe:pg;// only a genuinely steep face counts as an edge patch
    if(p>P.pen){P.pen=p;P.p=[gx,py,gz];}if(P===pe&&p>0)pe.above=Math.max(pe.above,gy-hub[1]);
    if(p>0){P.ax+=nx*p;P.ay+=ny*p;P.az+=nz*p;}}
   wh.gSup=gSup;
   // two patches only when they are distinct contacts; otherwise one blended contact as before
   if(pg.pen>0&&pe.pen>0&&Math.hypot(pg.p[0]-pe.p[0],pg.p[1]-pe.p[1],pg.p[2]-pe.p[2])<.6){if(pe.pen>pg.pen){pg.pen=pe.pen;pg.p=pe.p;}pg.ax+=pe.ax;pg.ay+=pe.ay;pg.az+=pe.az;pe.pen=-1;}
   const patches=[];for(const P of [pg,pe])if(P.pen>0){const l=Math.hypot(P.ax,P.ay,P.az)||1;patches.push({pen:P.pen,n:[P.ax/l,P.ay/l,P.az/l],pt:P.p,grip:P===pe?clamp((1.2-(pe.above||0))/.3,0,1):1});}/* no clawing up a face that towers over the hub */
   const pen=patches.length?Math.max(...patches.map(q=>q.pen)):-1;
   let Fn=0,cn=[0,1,0],cpt=hub;
   wh.contact=pen>0;
   let tf=[0,0,0];// tyre force on wheel
   if(pen>0){
    const nt=env.normal(patches[0].pt[0],patches[0].pt[2]);const lh=[-fh[2],0,fh[0]];const lat=dot(nt,lh);
    const kt=mix(260e3,620e3,(wh.pressure-.8)/1.7)*TSC;/* the big carcass damps wheel hop */
    for(const q of patches){q.n=norm(add(q.n,scl(lh,lat*(q===patches[0]?1:0))));const pdot=-dot(vH,q.n);
     // struck across the strut (on its side, landing on a wheel's flank) the blow goes straight into the frame,
     // not through the strut's damper: the crushing sidewall and the sloshing ballast fluid soak it instead
     const cross_=1-Math.abs(dot(q.n,ax)),ct=9000*DSC+9e4*cross_*cross_;
     q.Fn=kt*q.pen+ct*pdot+(q.pen>.3?Math.max(0,(q.pen-.3)*2.5e6+1.5e5*pdot):0)/* crushed to the rim: steel into dirt */;if(q.Fn<0)q.Fn=0;if(q.Fn>8e5)q.Fn=8e5;
     q.t=norm(sub(fw,scl(q.n,dot(fw,q.n))));q.l=cross(q.n,q.t);Fn+=q.Fn;}
    if(Fn>8e5){const k=8e5/Fn;for(const q of patches)q.Fn*=k;Fn=8e5;}
    // resultant normal and contact point (load weighted) stand for the tyre in the strut and HUD
    {let nn=[0,0,0],pp=[0,0,0];const w0=Fn||1;for(const q of patches){nn=add(nn,scl(q.n,q.Fn||1e-6));pp=add(pp,scl(q.pt,(q.Fn||1e-6)/w0));}cn=norm(nn);cpt=Fn>0?pp:patches[0].pt;}
    wh.deflection=pen;
    // ---- friction (slip measured along the load-weighted tangent)
    let t=[0,0,0],l=[0,0,0];for(const q of patches){const wq=(q.Fn||1e-6)/(Fn||1e-6);t=add(t,scl(q.t,wq));l=add(l,scl(q.l,wq));}t=norm(t);l=norm(l);
    const vx=dot(vH,t),vy=dot(vH,l);
    const surf=wh.surface||{mu:.65,slide:.5,roll:.04,soft:.3};
    const pfac=(2.5-wh.pressure)/1.7;
    const Fnom=this.totalMass*G/6;
    // 3.4 m lugged agricultural tyres bite harder than the surface's reference tyre, more so aired down on soft ground
    const lug=1.2+.35*pfac*surf.soft;let mu=surf.mu*lug*(1+.22*pfac*surf.soft)*clamp(1-.07*(Fn/Fnom-1),.55,1.1);/* load sensitivity, bounded: a tyre crushed far past its share (a machine lying on it) must not go to negative grip */const muS=surf.slide*lug*(1+.22*pfac*surf.soft);
    // Kevlar-belted lugged tyres: stiff carcass for high speed, sharper cornering response, no grip loss wading
    const Ck=10,Ca=9.5;const den=Math.max(Math.abs(vx),1.5);
    let Fx,Fy;
    if(this.hold&&!wh.disabled&&!wh.lifted){wh.Ti=0;
     // low-speed sticky anchor holds on slopes without creep
     if(!wh.anchor)wh.anchor=cpt.slice();
     const dA=sub(cpt,wh.anchor);const ka=Math.min(3.2e5,Fn*14),ca=Math.min(4e4,Fn*2.2);
     Fx=-(ka*dot(dA,t)+ca*vx);Fy=-(ka*dot(dA,l)+ca*vy);
     const lim=mu*Fn,mag=Math.hypot(Fx,Fy);if(mag>lim&&mag>0){wh.anchor=null;Fx*=lim/mag;Fy*=lim/mag;}
     wh.omega=0;wh.slip=0;wh.slipAngle=0;
    }else{
     wh.anchor=null;
     // spin DOF, implicit against the linearised longitudinal force
     const I=300;const kap=(wh.omega*Rw-vx)/den;const F0=Ck*Fn*kap;const D=Ck*Fn*Rw/den;// dFx/domega
     const roll=(surf.roll*(1+.6*pfac*(1-surf.soft))+wh.sink*.35)*Fn*Rw*Math.tanh(wh.omega*3);
     let Tm=0,Tmax=wh.disabled||this.engine.stalled?0:Math.min(52000*(1+.3*(this.engine.boost||0)),1.25*mu*Fn*Rw+2500);
     // engine power shared by the six hub motors caps motoring torque (braking is hydrostatic and free)
     const Tpow=this.engine.off?0:(this.engine.Pavail??8e5)/6/Math.max(Math.abs(wh.omega),1.5);/* engine off: the hydrostatic brakes still hold, nothing drives */
     const wT=wh.targetOmega||0;const Kp=14000;
     // unsaturated implicit solution with PI control: the integral is the drive holding pressure (or current)
     // against a load, so a wheel held back below its commanded speed (a steep pitch from a standstill) works up to
     // full torque instead of stalling on a fixed speed error
     const Ti=wh.Ti||0;
     let om=(I*wh.omega+DT*(Kp*wT+Ti-Rw*(F0-D*wh.omega)-roll))/(I+DT*(Rw*D+Kp));Tm=Kp*(wT-om)+Ti;
     const motoring=Tm*(wh.omega||wh.targetOmega||1)>0,Tlim=motoring?Math.min(Tmax,Tpow):Tmax;
     let sat=false;if(Math.abs(Tm)>Tlim){sat=true;Tm=Math.sign(Tm)*Tlim;om=(I*wh.omega+DT*(Tm-Rw*(F0-D*wh.omega)-roll))/(I+DT*Rw*D);}
     {const e=wT-om;if(!(sat&&Math.sign(e)===Math.sign(Ti||e)))wh.Ti=clamp(Ti+(e*Math.sign(Ti||e)<0?1.2e5:4e4)*e*DT,-Tlim,Tlim);/* builds over about a second; lets go three times faster once the wheel is over its speed */else wh.Ti=clamp(Ti,-Tlim,Tlim);}/* anti-windup */
     // traction control trims torque on excessive slip
     const kn=(om*Rw-vx)/den;if(Math.abs(kn)>.15&&this.ctl.assist){const s=.15/Math.abs(kn);Tm*=s;om=(I*wh.omega+DT*(Tm-Rw*(F0-D*wh.omega)-roll))/(I+DT*Rw*D);}
     wh.omega=om;wh.torque=Tm;drivePower+=Math.max(0,Tm*om);
     const kap2=(om*Rw-vx)/den;Fx=Ck*Fn*kap2;Fy=-Ca*Fn*Math.atan2(vy,den);
     const mag=Math.hypot(Fx,Fy),lim=mu*Fn;
     if(mag>lim){const rho=mag/lim,me=mix(mu,muS,clamp((rho-1)/2.5,0,1))*Fn;Fx*=me/mag;Fy*=me/mag;}
     wh.slip=kap2;wh.slipAngle=Math.atan2(vy,den);
    }
    wh.spin+=wh.omega*DT;
    // each patch carries its share of the tyre force along its own surface
    for(const q of patches){const sh=Fn>0?q.Fn/Fn:1/patches.length;tf=add(tf,add(add(scl(q.n,q.Fn),scl(q.t,Fx*sh*q.grip)),scl(q.l,Fy*sh*q.grip)));}
    wh.fx=Fx;wh.fy=Fy;
   }else{wh.deflection=0;wh.anchor=null;wh.Ti=0;const I=300;const wT=wh.targetOmega||0,al=wh.disabled||this.engine.stalled?0:clamp((wT-wh.omega)*8,-20,20);wh.omega+=al*DT;wh.spin+=wh.omega*DT;wh.fx=wh.fy=0;
    // in the air the hub motor's torque reacts on the frame: drive the wheels up and the nose lifts, brake them and it drops
    T[0]+=I*al*axl[0];T[1]+=I*al*axl[1];T[2]+=I*al*axl[2];}
   wh.load=Fn;wh.cp=cpt;wh.cn=cn;
   // ---- unsprung DOF along the strut, implicit
   const mU=UNSPRUNG,cnU=dot(cn,ax);
   const Fs=this.strutForce(wh,wh.e,wh.ev);
   const aMu=dot(this.acc,ax);
   const tu=dot(tf,ax);
   const f0=mU*aMu-tu+mU*G*ax[1]+Fs;
   const Ks=this.gasStiffness(wh,wh.e)+(wh.e<0||wh.e>GEOM.stroke?9e5:0),Kt=pen>0?mix(260e3,620e3,(wh.pressure-.8)/1.7)*TSC*cnU*cnU:0;
   const Cs=this.strutDamping(wh.ev)+(wh.e<0||wh.e>GEOM.stroke?STOPC:0),Ct=pen>0?9000*DSC*cnU*cnU:0;
   const Kk=Ks+Kt,Cc=Cs+Ct;
   const evn=(mU*wh.ev+DT*(f0+Cc*wh.ev))/(mU+DT*Cc+DT*DT*Kk);
   wh.ev=evn;wh.e+=DT*evn;if(wh.e<-.08){wh.e=-.08;wh.ev=Math.max(0,wh.ev);}if(wh.e>GEOM.stroke+.08){wh.e=GEOM.stroke+.08;wh.ev=Math.min(0,wh.ev);}
   const Fs2=this.strutForce(wh,wh.e,wh.ev);wh.strut=Fs2;
   // body: strut force at the mount, tyre force components across the strut at the contact
   applyAt(scl(ax,Fs2),M);
   {const gw=UNSPRUNG*G,ga=ax[1]*gw;applyAt([ax[0]*ga,-gw+ax[1]*ga,ax[2]*ga],hub);}/* the assembly's weight across its strut bears on the frame (along it, on the strut) */
   if(pen>0){const perp=sub(tf,scl(ax,tu));applyAt(perp,cpt);}
  }
  // ---- hull contacts
  this.hullContacts(R,o,applyAt);
  // ---- self-righting arms
  for(const a of this.arms){a.ext=clamp(a.ext+a.rate*DT,0,ARM.max);if((a.ext<=0&&a.rate<0)||(a.ext>=ARM.max&&a.rate>0))a.rate=0;}
  this.armContacts(R,o,applyAt,up);
  // ---- obstacles
  this.obstacleContacts(R,o,applyAt);
  // ---- water
  this.waterForces(R,o,applyAt);
  // ---- aerodynamic drag (small)
  {const v=this.vel,sp=len(v);if(sp>.1&&AIR>0){const k=.5*AIR*1.1*18;applyAt(scl(v,-k*sp),this.pos);}}
  // ---- integrate
  // along the body's up axis (the struts) the frame carries only itself; across it the wheel assemblies come along
  const Fu=dot(F,up),a=add(scl(up,Fu/this.mass),scl(sub(F,scl(up,Fu)),1/this.totalMass));
  const prevAcc=this.acc;this.acc=[a[0],a[1]+G*0,a[2]];
  this.vel=add(this.vel,scl(a,DT));
  const IbInvW=(()=>{// R * IbInv * R^T
   const A=this.IbInv,B=[0,0,0,0,0,0,0,0,0];for(let r=0;r<3;r++)for(let c=0;c<3;c++){let s=0;for(let k=0;k<3;k++)for(let m=0;m<3;m++)s+=R[r*3+k]*A[k*3+m]*R[c*3+m];B[r*3+c]=s;}return B;})();
  // gyroscopic term
  const wb=mtv(R,this.w),Lb=mv(this.Ib,wb),gyro=mv(R,cross(wb,Lb));
  const alpha=mv(IbInvW,sub(T,gyro));
  this.w=add(this.w,scl(alpha,DT));
  const wl=len(this.w);if(wl>6)this.w=scl(this.w,6/wl);
  this.pos=add(this.pos,scl(this.vel,DT));
  const dq=qmul([this.w[0]*.5*DT,this.w[1]*.5*DT,this.w[2]*.5*DT,0],this.q);this.q=qnorm([this.q[0]+dq[0],this.q[1]+dq[1],this.q[2]+dq[2],this.q[3]+dq[3]]);
  // ---- comfort metrics (cabin acceleration at the seats, minus gravity)
  const ca=a;this.jerk=mix(this.jerk,len(sub(ca,this.cabinAcc))/DT,.02);this.cabinAcc=mix3(this.cabinAcc,ca,.05);
  this.engine.drivePower=drivePower;
  const hs=Math.hypot(this.vel[0],this.vel[2]);this.distance+=hs*DT;
  if(!isFinite(this.pos[0]+this.pos[1]+this.pos[2]+this.q[0]+this.w[0]))this.panic();
 }
 panic(){const x=this.lastSafe?.[0]??0,z=this.lastSafe?.[1]??0;for(const wh of this.wheels){wh.e=GEOM.stroke/2;wh.ev=0;wh.omega=0;wh.eset=GEOM.stroke/2+.15;}this.place(x,z,this.lastSafe?.[2]??0);this.say('Recovered from a numerical fault',3);}
 // ---------------------------------------------------------------- self-righting arm contacts
 armContacts(R,o,applyAt,up){
  const A=this.arms;if(up[1]>.45&&A[0].ext<.004&&A[1].ext<.004){A[0].load=A[1].load=A[0].touch=A[1].touch=0;this.armScrape=0;return;}
  const off=this._aoff||(this._aoff=[0,0,0,0,0,0]),samp=this._asmp||(this._asmp=[]);let scrape=0;const P=ARM.pad;
  for(let i=0;i<2;i++){const a=A[i],d=ARM.dir[i],Ra=ARM.R,cx=ARM.cx[i];a.load=0;a.touch=0;armOffsets(a.ext,off);
   // the segment now sliding (those beyond it ride along); the ones behind it are still
   let m=ARM.n+1;for(let j=1;j<=ARM.n;j++)if(off[j]-off[j-1]<ARM.S-1e-6){m=j;break;}
   // samples: [s, z, radius of the outer surface, moving]
   samp.length=0;
   for(let s=-ARM.sleeve+.03;s<0;s+=.09)samp.push(s,ARM.z,ARM.rTube[0],0);
   for(let k=1;k<=ARM.n;k++){const s0=off[k-1],s1=off[k];if(s1-s0<1e-4)continue;const nS=Math.max(1,Math.ceil((s1-s0)/.08));for(let q=1;q<=nS;q++)samp.push(s0+(s1-s0)*q/nS,ARM.z,ARM.rTube[k],k>=m?1:0);}
   // the fingertip shoe on the last segment: always moving with the extension
   for(const ds of [-P.half,0,P.half])for(const dz of [-P.w*.45,0,P.w*.45])samp.push(a.ext+ds,ARM.z+dz,P.rout,1);
   for(let q=0;q<samp.length;q+=4){const s=samp[q],th=ARM.tip[i]+d*s,c=Math.cos(th),sn=Math.sin(th),rad=samp[q+2];
    const pb=[cx+Ra*c,ARM.cy+Ra*sn,samp[q+1]],pw=add(o,mv(R,pb));
    // the point of the surface nearest the ground: out along the radius where it faces down, else straight down
    const rw=mv(R,[c,sn,0]),f0=Math.max(0,-rw[1]);const cp=add(pw,scl(rw,rad*f0));cp[1]-=rad*(1-f0);
    const g=this.env.ground(cp[0],cp[2],cp[1]);const dpen=g-cp[1];if(dpen<=0)continue;
    const n=this.env.normal(cp[0],cp[2]);
    const tw=mv(R,[-sn*d,c*d,0]),vs=samp[q+3]?a.rate*Ra:0;
    const v=add(this.pointVel(cp),scl(tw,vs)),vn=dot(v,n);
    let Fn=1.1e6*dpen-1.6e5*vn;if(Fn<=0)continue;/* steel into dirt: heavily damped, next to no rebound */Fn=Math.min(Fn,2.5e6);
    const vt=sub(v,scl(n,vn)),vtl=len(vt);let f=scl(n,Fn);
    if(vtl>1e-4){const fr=Math.min(ARM.mu*Fn,vtl*1.5e5);f=sub(f,scl(vt,fr/vtl));if(vs!==0)scrape=Math.max(scrape,Math.min(1,vtl*.6+Fn/4e5));}
    applyAt(f,cp);a.touch++;if(vs!==0)a.load+=Math.abs(dot(f,tw));
   }
   // relief valve: a finger loaded along its path past what the drive holds is pushed back into its sleeve
   if(a.load>ARM.F*1.15&&a.ext>0){a.ext=Math.max(0,a.ext-(a.load-ARM.F*1.15)/(4e6*Ra));if(a.rate>0)a.rate=0;}
  }
  this.armScrape=scrape;
 }
 strutForce(wh,e,ev){
  let F=this.gasForce(wh,e);
  // end stops are hydraulic cushions: stiff, and they take the energy rather than handing it back
  if(e<0)F+=Math.max(0,9e5*(-e)-STOPC*ev);
  if(e>GEOM.stroke)F-=Math.max(0,9e5*(e-GEOM.stroke)+STOPC*ev);
  F-=this.dampC1*ev+this.dampC2*ev*Math.abs(ev);
  return F;
 }
 strutDamping(ev){return this.dampC1+2*this.dampC2*Math.abs(ev);}
 hullPoints(){
  if(this._hp)return this._hp;const P=[];
  for(const z of [-4.8,-3,-1,1,3,4.8])for(const x of [-.9,0,.9])P.push([x,GEOM.belly+.05+Math.abs(x)*.25,z]);
  P.push([0,4.2,-5.4],[0,4.2,5.4],[-1.3,4.4,-4.6],[1.3,4.4,-4.6],[-1.3,4.4,4.6],[1.3,4.4,4.6]);
  for(const z of [-5,0,5])for(const x of [-1.3,1.3])P.push([x,6.45,z]);
  for(const z of GEOM.stations)for(const x of [-this.ht(),this.ht()])P.push([x,GEOM.plateY+.2,z]);// strut tops (rollover)
  for(const z of GEOM.stations)for(const x of [-2.6,2.6])P.push([x,6.3,z]);
  return this._hp=P;
 }
 hullContacts(R,o,applyAt){
  let hit=0;
  for(const pb of this.hullPoints()){
   const pw=add(o,mv(R,pb)),g=this.env.ground(pw[0],pw[2],pw[1]);if(pw[1]>=g)continue;
   const d=g-pw[1],n=this.env.normal(pw[0],pw[2]),v=this.pointVel(pw),vn=dot(v,n);
   let Fn=4.5e5*d-1.3e5*vn;if(Fn<0)continue;/* a 20 t frame ploughing into dirt: the ground gives, it does not spring back */Fn=Math.min(Fn,this.mass*(Math.max(0,-vn)+Math.min(d,.3)*3)/DT/8,1.2e6);
   const vt=sub(v,scl(n,vn)),vtl=len(vt);let f=scl(n,Fn);
   if(vtl>1e-3){const fr=Math.min(.55*Fn,vtl*6e4);f=sub(f,scl(vt,fr/vtl));}
   applyAt(f,pw);hit=Math.max(hit,Math.abs(vn));
  }
  if(hit>2.2&&this.t-(this._lastHull||0)>.4){this._lastHull=this.t;const dmg=Math.min(18,(hit-2.2)*6);this.hurtHull(dmg);this.impacts++;this.events.push({type:'impact',strength:hit});}
  this.bellyScrape=hit;
 }
 spheres(R,o){
  const S=[];for(const wh of this.wheels)S.push({p:wh.hub,r:GEOM.R,part:'wheel',wh});
  for(const z of [-4.2,-2.1,0,2.1,4.2])S.push({p:add(o,mv(R,[0,4.2,z+this.carriage])),r:1.55,part:'cabin'});
  for(const z of [-4,0,4])S.push({p:add(o,mv(R,[0,6.2,z])),r:1.3,part:'top'});
  for(const wh of this.wheels){const m=wh.mount;S.push({p:add(scl(m,.5),scl(wh.hub,.5)),r:.35,part:'leg'});S.push({p:m,r:.45,part:'knee'});}
  for(const z of GEOM.stations)for(const s of [-1,1])S.push({p:add(o,mv(R,[s*2.6,6.1,z])),r:.4,part:'arm'});
  return S;
 }
 obstacleContacts(R,o,applyAt){
  // the obstacle list is gathered once per control tick (60 Hz) with a margin, not every physics step
  if(!this._obsT||this._obsT!==this._ctlTick){this._obsT=this._ctlTick;this._obs=this.env.obstacles?this.env.obstacles(this.pos[0],this.pos[2],16):null;if(this._obs)this._obs=this._obs.slice();}
  const list=this._obs;this.brush=0;if(!list||!list.length)return;
  const S=this.spheres(R,o);
  for(const ob of list){
   if(ob.broken)continue;
   for(const s of S){
    if(ob.type==='trunk'){
     if(s.p[1]<ob.y-.5||s.p[1]>ob.y+ob.h+s.r)continue;
     const dx=s.p[0]-ob.x,dz=s.p[2]-ob.z,d=Math.hypot(dx,dz),rr=s.r+ob.r;
     if(d<rr&&d>1e-4){const nx=dx/d,nz=dz/d,pen=rr-d,v=this.pointVel(s.p),vn=v[0]*nx+v[2]*nz;
      let Fn=2.4e6*pen-6e4*vn;if(Fn<0)continue;Fn=Math.min(Fn,this.mass*(Math.max(0,-vn)+Math.min(pen,.3)*3)/DT/6);
      if(ob.breakable){const imp=Fn*DT;ob._imp=(ob._imp||0)*.9+imp;ob._F=(ob._F||0)+(Fn-(ob._F||0))*DT/.12;/* rammed (impulse) or shoved over (sustained push) */
       if(ob._imp>ob.strength||ob._F>(ob.fbreak||1e9)){ob.broken=true;this.breaks++;this.events.push({type:'break',ob,dir:[-nx,-nz],speed:Math.hypot(this.vel[0],this.vel[2])});if(this.env.onBreak)this.env.onBreak(ob,-nx,-nz);continue;}}
      const tx=-nz,tz=nx,vtt=v[0]*tx+v[2]*tz;const fr=clamp(-vtt*4e4,-.4*Fn,.4*Fn);
      applyAt([nx*Fn+tx*fr,0,nz*Fn+tz*fr],s.p);if(vn<-2.2&&this.t-(this._lastHit||0)>1){this._lastHit=this.t;this.hurtHull(Math.min(12,(-vn-2.2)*3));this.impacts++;this.events.push({type:'impact',strength:-vn,ob});}}
    }else if(ob.type==='box'){
     const c=Math.cos(ob.rot),sn=Math.sin(ob.rot),lx=(s.p[0]-ob.x)*c-(s.p[2]-ob.z)*sn,lz=(s.p[0]-ob.x)*sn+(s.p[2]-ob.z)*c;
     if(s.p[1]>ob.y+ob.h+s.r||s.p[1]<ob.y-1)continue;
     const qx=clamp(lx,-ob.w/2,ob.w/2),qz=clamp(lz,-ob.d/2,ob.d/2),dx=lx-qx,dz=lz-qz,d=Math.hypot(dx,dz);
     let nlx,nlz,pen;
     if(d>1e-4){if(d>=s.r)continue;nlx=dx/d;nlz=dz/d;pen=s.r-d;}else{// centre inside: push out the nearest face
      const ex=ob.w/2-Math.abs(lx),ez=ob.d/2-Math.abs(lz);if(ex<ez){nlx=Math.sign(lx)||1;nlz=0;pen=ex+s.r;}else{nlx=0;nlz=Math.sign(lz)||1;pen=ez+s.r;}}
     const nx=nlx*c+nlz*sn,nz=-nlx*sn+nlz*c,v=this.pointVel(s.p),vn=v[0]*nx+v[2]*nz;
     let Fn=2.4e6*pen-6e4*vn;if(Fn<0)continue;Fn=Math.min(Fn,this.mass*(Math.max(0,-vn)+Math.min(pen,.3)*3)/DT/6);applyAt([nx*Fn,0,nz*Fn],s.p);
     if(vn<-2.2&&this.t-(this._lastHit||0)>1){this._lastHit=this.t;this.hurtHull(Math.min(14,(-vn-2.2)*3.5));this.impacts++;this.events.push({type:'impact',strength:-vn,ob});}
    }else if(ob.type==='canopy'){
     if(s.part!=='cabin'&&s.part!=='top')continue;
     const dx=s.p[0]-ob.x,dy=s.p[1]-ob.cy,dz=s.p[2]-ob.z,d=Math.hypot(dx,dy*1.3,dz),rr=s.r+ob.r;
     if(d<rr){const ov=(rr-d)/rr;this.brush+=ov;const v=this.pointVel(s.p);applyAt(scl(v,-ov*2500),s.p);}
    }
   }
  }
 }
 waterForces(R,o,applyAt){
  const env=this.env;if(!env.water)return;
  this.flooded=0;let deepest=0;
  const wtmp=this._wt||(this._wt={});
  for(const wh of this.wheels){
   const w=env.water(wh.hub[0],wh.hub[2],wtmp);wh.water=0;if(!w.kind)continue;
   const sub_=clamp((w.level-(wh.hub[1]-GEOM.R))/(2*GEOM.R),0,1);if(sub_<=0)continue;wh.water=sub_*2*GEOM.R;deepest=Math.max(deepest,w.level-(wh.hub[1]-GEOM.R));
   // ballasted tyres: partial buoyancy
   const areaFrac=sub_<.5?(sub_*2)**1.5*.5:1-((1-sub_)*2)**1.5*.5;
   const vol=Math.PI*GEOM.R*GEOM.R*GEOM.tireWidth*areaFrac;
   const buoy=RHO*G*vol*.08;/* heavily ballasted tyres keep their bite in water */applyAt([0,buoy,0],wh.hub);
   // drag relative to current: side area of the tyre, frontal area of the leg
   const v=this.pointVel(wh.hub),rel=[v[0]-w.fx,0,v[2]-w.fz],rs=Math.hypot(rel[0],rel[2]);
   if(rs>.01){const R_=this.R,right=[R_[0],R_[3],R_[6]],side=Math.abs((rel[0]*right[0]+rel[2]*right[2])/rs);const A=mix(GEOM.tireWidth*2*GEOM.R+.3,Math.PI*GEOM.R*GEOM.R*.9,side)*areaFrac;const f=.5*RHO*(this.cabinWet?.32:.12)*A*rs;/* slim legs and edge-on tyres cut through until the hull is in the water */applyAt([-rel[0]*f,0,-rel[2]*f],wh.hub);}/* edge-on tyre and slender leg: low drag head-on */
  }
  // cabin: the pod is sealed. Its displacement would float the machine, so once it is more than half under the
  // ballast tanks in the keel flood (about 12 s) and it drives on along the bottom, slowly, on what grip is left
  const cabinPts=[-4,-2,0,2,4];let wet=0,subF=0;
  for(const z of cabinPts){const pw=add(o,mv(R,[0,GEOM.cabinY,z+this.carriage]));const w=env.water(pw[0],pw[2],wtmp);if(!w.kind)continue;
   const depth=w.level-(pw[1]-GEOM.cabinR);if(depth<=0)continue;const f=clamp(depth/(2*GEOM.cabinR),0,1);wet=Math.max(wet,depth);subF+=f/cabinPts.length;
   const vol=Math.PI*GEOM.cabinR*GEOM.cabinR*2.16*f;/* 2.16 m of pod per sample point */applyAt([0,RHO*G*vol*.45*(1-.8*(this.ballast||0)),0],pw);/* the keel, drive gear and fittings take over half the volume; flooded tanks cancel most of the rest */
   // form drag of a blunt 3.2 m pod pushed through water
   {const v=this.pointVel(pw),rel=[v[0]-w.fx,0,v[2]-w.fz],rs=Math.hypot(rel[0],rel[2]);if(rs>.01){const k=.5*RHO*1.05*(3.2*2.16*f)*rs;applyAt([-rel[0]*k,0,-rel[2]*k],pw);}}
   {const v=this.pointVel(pw);applyAt([0,-v[1]*9000*f,0],pw);}/* vertical damping */
  }
  this.ballast=clamp((this.ballast||0)+(subF>.15?DT/10:subF<.05?-DT/25:0),0,1);this.submerged=subF;/* tanks flood as soon as the pod wets, pump out once it is clear */
  // the pod stays dry; the air intake is a snorkel on the roof deck (body y 7.3), so the engine runs until the roof goes under
  this.flooded=0;
  const intake=add(o,mv(R,[0,GEOM.intakeY,4.6+this.carriage])),iw=env.water(intake[0],intake[2],wtmp);
  if(!SEALED&&iw.kind&&iw.level>intake[1]&&!this.engine.stalled){this.engine.stalled=true;this.engine.stallTimer=6;this.say('Engine stalled: the roof intake is under water',5);this.events.push({type:'stall'});}
  this.cabinWet=wet>.05;
  this.wading=deepest;this.maxWade=Math.max(this.maxWade||0,deepest);
 }
 // ---------------------------------------------------------------- controller (60 Hz)
 say(m,t=2.5){this.message=m;this.messageT=t;}
 get g(){return G;}
 control(dt=1/60){
  this._ctlTick=(this._ctlTick||0)+1;
  const c=this.ctl,R=qmat(this.q),o=this.origin(R),env=this.env;
  const fwd=[-R[2],-R[5],-R[8]],right=[R[0],R[3],R[6]],up=[R[1],R[4],R[7]];
  const hf=norm([fwd[0],0,fwd[2]]),hr=[-hf[2],0,hf[0]];
  const vfwd=dot(this.vel,hf),speed=Math.hypot(this.vel[0],this.vel[2]);this.groundUnder=env.ground(this.pos[0],this.pos[2],this.pos[1]);
  if(this.messageT>0){this.messageT-=dt;if(this.messageT<=0)this.message='';}
  // ---- surfaces, water under each wheel (cached at 60 Hz)
  for(const wh of this.wheels){const h=wh.hub;wh.surface=env.surface(h[0],h[2]);
   const soft=wh.surface.soft||0,Fnom=this.totalMass*G/6;const target=wh.contact?soft*.16*clamp(wh.load/Fnom,0,2.5)*Math.sqrt(1.6/wh.pressure):0;wh.sink=mix(wh.sink,target,1-Math.exp(-dt*1.6));}
  // ---- suspension mode
  const latAcc=Math.abs(dot(this.acc,hr));
  const rollRate=Math.abs(dot(this.w,hf))+Math.abs(dot(this.w,hr))*.5;this._rr=mix(this._rr||0,rollRate,.1);
  // auto mode with hysteresis: firm comes in quickly, soft only after a calm spell
  if(c.suspension==='auto'){const wantFirm=speed>6.5||latAcc>1.6||this._rr>.2||(this.water>1500&&speed>4),calm=speed<5&&latAcc<1&&this._rr<.12&&!(this.water>1500&&speed>3);
   this._calmT=calm?(this._calmT||0)+dt:0;if(wantFirm)this.suspMode='firm';else if(this._calmT>1.5)this.suspMode='soft';}
  else this.suspMode=c.suspension;
  const Vn=(this.suspMode==='soft'?.006:.0025)*VSC;
  // switching accumulators happens at the pressure the struts already hold: re-base each setpoint so the
  // force at the present extension is unchanged (only the stiffness changes; no jolt)
  // (same gas volume ratio v/Vn => same pressure: eset-e scales with Vn)
  if(Vn!==this.Vn){const k=Vn/this.Vn;for(const wh of this.wheels)wh.eset=wh.e+(wh.eset-wh.e)*k;this.Vn=Vn;}
  const kGas=GAMMA*PN*PISTON*PISTON/this.Vn;this.kGas=kGas;
  this.dampC1=(this.suspMode==='soft'?8000:12500)*DSC;this.dampC2=this.suspMode==='soft'?3200:4600;
  // ---- CTIS
  const pTarget=PRESSURES[c.tire];let hiss=0;for(const wh of this.wheels){const d=pTarget-wh.pressure;if(Math.abs(d)>.005){wh.pressure+=clamp(d,-.35*dt,.28*dt);hiss=1;}}this.hiss=hiss;
  const safe=c.tire==="soft"?60/3.6:c.tire==="terrain"?110/3.6:145/3.6;/* Kevlar-belted: rated well past the drivetrain */this.safeSpeed=safe;
  // ---- engine
  const E=this.engine;
  /* ignition: the starter cranks for a second before the engine catches */
  if(E.off&&E.crank>0){E.crank-=dt;if(E.crank<=0){E.off=false;E.crank=0;this.events.push({type:'engineCatch'});this.say(SEALED?'Drive power on':'Engine running',1.5);}}
  if(E.stalled){E.stallTimer-=dt;E.rpm=mix(E.rpm,0,1-Math.exp(-dt*3));if(E.stallTimer<=0){const intake=add(o,mv(R,[0,GEOM.intakeY,4.6+this.carriage])),iw=env.water?env.water(intake[0],intake[2],{}):{};if(!iw.kind||iw.level<intake[1]-.2){E.stalled=false;this.say('Engine restarted',2);}else E.stallTimer=2;}}
  // ---- steering: speed-sensitive lock, slew-limited, exact middle angle
  // speed-sensitive lock: keep the steady-state lateral acceleration near 3.5 m/s^2 (a tall machine)
  // track change: the legs slide on the arms at a crawl (the tyres scrub sideways)
  // track change (G): raise the body once, walk the legs across unit by unit (middle pair, front pair, then each
  // rear leg on its own under the engine), then settle back to the ride height once. Only legs not already at the
  // target move, so a half-finished change (stopped, recovered, restarted) is completed or reversed cleanly.
  {// an aborted walk walks the moved legs back by itself, so the machine is never left on a mixed track
   const AB=this._autoBack;if(AB&&!this.trackSeq){AB.t+=dt;if(AB.t>1.5){this._autoBack=null;if(speed<1.2&&!this.overturned){c.track=AB.tgt;this._backNext=true;}}}
   const tgt=c.track>=.5?1:0;
   if(tgt!==this._trackReq&&!this.trackSeq){const why=E.off?'Start the engine to change the track (I)':speed>1.2?'Stop to change the track':c.retraction>=.95?'Raise the cabin off full retraction to change the track':this.climbState?'Finish the climb first':null;
    if(why){c.track=this._trackReq;this.say(why,2.5);}
    else{this._trackReq=tgt;const order=[[2,3],[0,1],[4],[5]].filter(U=>U.some(i=>Math.abs(this.wheelTrack[i]-tgt)>1e-3));
     if(!order.length)this.say(tgt?'Track already wide':'Track already narrow',2);
     else{this.trackSeq={tgt,order,k:0,phase:'raise',t:0,back:!!this._backNext};this._backNext=false;this.say(this.trackSeq.back?'Walking the legs back':tgt?'Track out: raising, then walking the legs wide':'Track in: raising, then walking the legs narrow',2.5);}}}
   const Q=this.trackSeq;
   if(Q){Q.t+=dt;
    const abort=m=>{for(const w of this.wheels)if(!w.disabled)w.lifted=false;this.trackSeq=null;this._trackReq=Q.tgt;c.track=Q.tgt;const mixed=this.wheelTrack.some(v=>Math.abs(v-this.wheelTrack[0])>1e-3);
     if(mixed&&!Q.back){this._autoBack={tgt:1-Q.tgt,t:0};this.say(m+': walking the legs back',3.5);}else this.say(m+(mixed?'. G walks the legs back':''),3.5);};
    if(Q.t>10&&Q.phase!=='settle')abort('Track change stalled: legs set down');
    else if(speed>2||this.overturned)abort('Track change interrupted');
    else if(Q.phase==='raise'){Q.carriage=0;let m=0,n=0;for(const w of this.wheels)if(!w.lifted){m+=w.e;n++;}if((m/n>GEOM.stroke-.75&&(this._levErr??0)<.025&&len(this.w)<.03)||Q.t>9){Q.phase='shift';/* up, and settled level (with assist off the levelling only starts with the walk) */Q.t=0;Q.holdE=this.wheels.map(w=>w.e);Q.att=[this.roll||0,this.pitch||0];}}
    else if(Q.phase==='settle'){Q.carriage=undefined;if(Q.t>1.5){this.trackSeq=null;this.say(Q.tgt?'Track wide':'Track narrow: road width',2);}}
    else{const U=Q.order[Q.k],W=U.map(i=>this.wheels[i]),p=U[0]>>1;Q.carriage=U.length===1?-1.2:p===0?GEOM.carriageMax:0;
     if(Q.phase==='shift'){if(Math.abs(this.carriage-Q.carriage)<.08||Q.t>9){const rx=[],rz=[];for(let i=0;i<6;i++){const q=this.wheels[i].contact?this.wheels[i].cp:this.wheels[i].hub,rr=sub(q,this.pos);rx.push(dot(rr,[-hf[2],0,hf[0]]));rz.push(dot(rr,hf));}
       const idx=[];for(let i=0;i<6;i++)if(!U.includes(i)&&!this.wheels[i].disabled)idx.push(i);
       if(supportMargin(rx,rz,idx)<.3||W.some(w=>w.e<1.1))abort('Cannot lift those legs here: find level ground');/* a leg already near its top cannot draw its tyre clear */else{Q.phase='lift';Q.t=0;for(const w of W)w.lifted=true;}}}
     else if((Q.phase==='lift'||Q.phase==='slide')&&(Math.abs((this.pitch||0)-(Q.att?.[1]??0))>7||Math.abs((this.roll||0)-(Q.att?.[0]??0))>7))/* tilting away from the stance it was raised to (on a side slope that stance is already tilted) */abort('Body tilting: legs set down, track change stopped');
     else if(Q.phase==='lift'){let clear=true;for(const w of W){const needHub=this.env.ground(w.hub[0],w.hub[2],1e9)+GEOM.R+.35;w.liftE=clamp(w.eset-(needHub-w.hub[1]),-.3,GEOM.stroke);if(w.contact||w.hub[1]<needHub-.15)clear=false;}
      if(clear&&Q.t>.4){Q.phase='slide';Q.t=0;}else if(Q.t>5)abort('Could not lift the legs clear');}
     else if(Q.phase==='slide'){let done=true;for(const w of W){const needHub=this.env.ground(w.hub[0],w.hub[2],1e9)+GEOM.R+.35;w.liftE=Math.min(w.liftE??GEOM.stroke,clamp(w.eset-(needHub-w.hub[1]),-.3,GEOM.stroke));}/* keep the tyre clear of ground rising under it as it slides */for(const i of U){this.wheelTrack[i]+=clamp(Q.tgt-this.wheelTrack[i],-dt*.9,dt*.9);if(Math.abs(this.wheelTrack[i]-Q.tgt)>1e-3)done=false;else this.wheelTrack[i]=Q.tgt;}this._hp=null;if(done){Q.phase='lower';Q.t=0;for(const w of W)w.lifted=false;}}
     else if(Q.phase==='lower'){const Fn=this.totalMass*G/6;if(W.every(w=>w.load>.35*Fn)||Q.t>3){Q.k++;Q.t=0;Q.phase=Q.k>=Q.order.length?'settle':'shift';}}}}
   this.trackFrac=this.wheelTrack.reduce((a,b)=>a+b,0)/6;}
  // speed-sensitive lock from what the machine can actually take: the lesser of the tyres' grip and the
  // lateral acceleration that would lift the inside wheels at this track and centre-of-mass height (with a
  // margin), so a low, wide stance corners hard and a tall, narrow one is held back
  const trF=this.trackFrac,cmH=clamp(this.pos[1]-(this.groundUnder??(this.pos[1]-4.8)),2.5,9),htm=this.ht();
  const muAvg=this.wheels.reduce((a,w)=>a+(w.surface?.mu||.6),0)/6*1.2;
  const aMax=Math.max(2.2*Math.min(1,G/9.81),Math.min(muAvg*G*.8,G*htm*.8/cmH));this.aLatMax=aMax;/* the floor shrinks with gravity: a sixth of the weight is a sixth of the grip */
  const lock=Math.min(GEOM.maxLock*(.5+.5*trF),Math.max(1.5*Math.PI/180,Math.atan(GEOM.wheelbase*aMax/Math.max(1e-3,speed*speed))));
  const dTarget=clamp(c.steer,-1,1)*lock;
  {const sr=Math.min(30*Math.PI/180,Math.max(4*Math.PI/180,lock/.75))*dt;this.steer[0]+=clamp(dTarget-this.steer[0],-sr,sr);}/* electro-hydraulic plate steering: slewing 20 t of plate and legs takes ~0.75 s to reach whatever lock the speed allows, never faster than 30 deg/s */
  this.steer[1]=Math.atan(Math.tan(this.steer[0])/2);this.steer[2]=0;
  // ---- longitudinal command (hydrostatic: release = controlled stop)
  let vt=c.throttle*c.limit;if(c.brake)vt=0;const gov=this.gov={};const tag=(n,v0)=>{if(Math.abs(vt)<Math.abs(v0)-.05)gov[n]=+(vt*3.6).toFixed(0);};
  if(this.climbState&&this.climbState.cap!==undefined)vt=clamp(vt,-this.climbState.cap,this.climbState.cap);
  if(this.trackSeq)vt=0;
  // terrain preview: cap speed so the vertical acceleration over the ground ahead stays tolerable
  const gk=Math.min(1,G/9.81);/* braking and look-ahead scale with the weight on the tyres: a sixth of the g is a sixth of the stopping power and six times the distance */
  if(c.assist&&Math.abs(vt)>2.5){const dir=vt>0?1:-1;let kmax=0,kfine=0,hazard=1e9,ledgeCap=1e9;const hx0=[-hf[2],0,hf[0]];
   for(const lat of [-this.ht(),0,this.ht()]){let prevG=null,prevH=null,g0=null;const dMax=Math.max(24,Math.abs(vfwd)*3.2/gk);for(let d=4;d<=dMax;d+=6){const x=this.pos[0]+hf[0]*d*dir+hx0[0]*lat,z=this.pos[2]+hf[2]*d*dir+hx0[2]*lat,h=env.ground(x,z,1e9);if(prevH!==null){const g=(h-prevH)/6;if(prevG!==null)kmax=Math.max(kmax,Math.abs(g-prevG)/6);prevG=g;if(g0===null)g0=g;if(Math.abs(h-prevH)>1.9&&Math.abs(g)>.7&&Math.abs(g-g0)>.45&&d-6<hazard)hazard=d-6;}prevH=h;}
    let hp=null,gp0=null,gpp=null;for(let d=2;d<=dMax;d+=3){const x=this.pos[0]+hf[0]*d*dir+hx0[0]*lat,z=this.pos[2]+hf[2]*d*dir+hx0[2]*lat,h=env.ground(x,z,1e9);if(hp!==null){const g=(h-hp)/3;if(gp0===null)gp0=g;if(gpp!==null&&d<28)kfine=Math.max(kfine,Math.abs(g-gpp)/3);gpp=g;if(Math.abs(h-hp)>1.9&&Math.abs(g)>.9&&Math.abs(g-gp0)>.45&&d-3<hazard)hazard=d-3;const dh=Math.abs((h-hp)-gp0*3);/* a riser is a break from the local slope, not the slope itself */if(dh>.6){const vs=Math.max(2.4,7-3.3*(dh-.6)),va=Math.sqrt(vs*vs+2*3*gk*Math.max(0,d-8));if(va<ledgeCap)ledgeCap=va;}}hp=h;}}
   /* ledges: meet each riser at a speed the tyres and struts can take, sized to its height */
   if(ledgeCap<Math.abs(vt)){const v0=vt;vt=Math.sign(vt)*ledgeCap;tag('ledge',v0);}
   /* a cliff or wall ahead (a sharp break in grade, more than ~1.9 m within 6 m): arrive slowly enough to stop or to start a climb */
   if(hazard<1e9){const vh=Math.max(1.2,Math.sqrt(2*3.5*gk*Math.max(0,hazard-7)));if(Math.abs(vt)>vh){const v0=vt;vt=Math.sign(vt)*vh;tag('hazard',v0);}this.hazardAhead=hazard;}else this.hazardAhead=null;
   let vcap=Math.max(4,Math.sqrt(Math.min(8,G*.85)/Math.max(kmax,1e-3)));if(gk<1)vcap=Math.min(vcap,Math.max(3,Math.sqrt(G*1.3/Math.max(kfine,1e-3))));/* in low gravity the tyres leave the ground over 3 m bumps the suspension would simply soak at home *//* 2.4 m of travel soaks most of it; and over a crest the tyres leave the ground once v²·curvature passes g, so low gravity holds speed down on rolling ground */this.previewCap=vcap;if(Math.abs(vt)>vcap){const v0=vt;vt=Math.sign(vt)*vcap;tag('rough',v0);if(this.t-(this._pmsg||0)>6&&vcap<c.limit*.6){this._pmsg=this.t;this.say('Rough ground ahead: assist is easing off',2);}}}else this.previewCap=null;
  if(this.dropWarn&&vt>0){const v0=vt;vt=Math.min(vt,.9);tag('drop',v0);}
  // airborne: no drive can act anyway; land with a lower target so each hop bleeds speed instead of building roll
  {const nc=this.wheels.filter(w=>w.contact).length;this.airT=nc<=2?(this.airT||0)+dt:0;if(c.assist&&this.airT>.3&&Math.abs(vt)>Math.max(2,speed*.7)){const v0=vt;vt=Math.sign(vt)*Math.max(2,speed*.7);tag('air',v0);}}
  // side-slope governor: slow down as the roll the levelling cannot remove and the tip margin say the slope is getting serious
  if(c.assist){const r=Math.abs(this.roll||0),tm=this.tipMargin??9;let cap=1e9;if(r>10)cap=Math.min(cap,Math.max(3,14-(r-10)*.9));if(tm<2.2)cap=Math.min(cap,Math.max(1.5,(tm-.9)*7));if(Math.abs(vt)>cap){const v0=vt;vt=Math.sign(vt)*cap;tag(r>8?'sideRoll':'sideTip',v0);if(cap<6&&this.t-(this._sideMsg||0)>6){this._sideMsg=this.t;this.say('Side slope: holding speed down',2);}}}
  // anti-flip: the drive is strong enough to walk up a wall; ease off as the nose climbs and the tip margin shrinks
  if(c.assist&&!this.climbState&&(this.probeRise||0)>1.65&&(this.probeSteep||0)>1.1&&vt>0){const v0=vt;vt=Math.min(vt,.4);tag('wall',v0);}/* a wall beyond reach: do not power into it */
  if(c.assist&&!this.climbState){const p=(this.pitch||0)*Math.sign(vt||0);if(p>24&&(this.tipMargin??9)<1.9){const k=clamp(((this.tipMargin??9)-.9)/1,0,1)*clamp((40-p)/14,0,1);const v0=vt;vt*=k;tag('flip',v0);if(Math.abs(this.vcmd)>Math.abs(vt))this.vcmd=vt;if(k<.6&&this.t-(this._flipMsg||0)>5){this._flipMsg=this.t;this.say('Too steep: easing off before she goes over backwards',2.5);}}}
  // attitude envelope: predict the ground the six tyres will stand on along the present arc and stop short of
  // any pose the legs cannot level, the tyres cannot hold sideways, or that leaves too little tip margin.
  // At low speed this is the only look-ahead, so it runs whatever the speed.
  if(c.assist&&!this.climbState&&!this.trackSeq&&Math.abs(vt)>.01){const dir=Math.sign(vt);
   if(!this._envT||this.t-this._envT>.05||this._envDir!==dir){this._envT=this.t;this._envDir=dir;this._env=this.envelope(dir,Math.max(9,Math.abs(vfwd)*2.6/gk+4));}
   const ev=this._env;let cap=1e9;
   if(ev.d0>=1)cap=ev.improves?.8:0;/* already outside: only a move that makes things better */
   else if(ev.s<1e9)cap=Math.sqrt(2*2.2*gk*Math.max(0,ev.s-ev.step-1.5));
   if(ev.d0<1)cap=Math.min(cap,Math.max(1.2,ev.legCap));
   if(ev.wStop<1e9)cap=Math.min(cap,Math.sqrt(2*.9*Math.max(0,ev.wStop-14)));/* deep water ahead: gentle stop, 14 m short */
   if(Math.abs(vt)>cap){const v0=vt;vt=Math.sign(vt)*cap;tag('envelope',v0);if(Math.abs(this.vcmd)>cap+.5)this.vcmd=Math.sign(this.vcmd)*(cap+.5);
    if(cap<1.5&&this.t-(this._envMsg||0)>4){this._envMsg=this.t;this.say(ev.why==='water'?'Water deeper than the roof intake that way':ev.why==='slide'?'Side slope too steep for the tyres that way: steer away or back out':ev.why==='pitch'?'Too steep that way for the legs to level: steer away or back out':'Too much tilt that way: steer away or back out',3);}}}
  if(E.stalled||E.off||this.sr)vt=0;
  const bk=1+.7*(this.engine.boost||0);const ak=Math.max(.35,gk);const accel=c.brake||(this.hazardAhead!=null&&Math.abs(vt)<Math.abs(this.vcmd))?5.5*ak:(Math.abs(vt)>Math.abs(this.vcmd)&&Math.sign(vt||1)===Math.sign(this.vcmd||vt||1)?3.6*bk*ak:3.2*bk*ak);
  this.vcmd+=clamp(vt-this.vcmd,-accel*dt,accel*dt);
  this.hold=Math.abs(this.vcmd)<.03&&Math.abs(vt)<.01&&speed<.6;
  // speed loop integral (hydrostatic drive tracks the commanded ground speed)
  /* a stop request still closes the loop on ground speed: no rolling away downhill on the drive's proportional slack */
  if(this.hold)this.vInt=0;else this.vInt=clamp((this.vInt||0)+(this.vcmd-vfwd)*dt*(Math.abs(this.vcmd)<.1?3:1.2),-1.5,1.5);
  const vEff=this.vcmd+(this.vInt||0);
  // per-wheel target spin from the rear-axle turning centre
  const tf=Math.tan(this.steer[0]),Rc=Math.abs(tf)>1e-4?GEOM.wheelbase/tf:1e9;// turning centre at x=-Rc (left positive steer)
  const zr=GEOM.stations[2],dRef=Math.hypot(Rc,zr);
  for(const wh of this.wheels){const hb=this.hubBody(wh);const di=Math.hypot(hb[0]+Rc,hb[2]-zr);wh.targetOmega=wh.lifted||wh.disabled?0:vEff*(Math.abs(Rc)>1e8?1:di/dRef)/GEOM.R;}
  // power limit: scale targets if the demanded power exceeds the engine
  // turbo: overboost on demand (Shift). Extra power and torque while the charge-air heat budget lasts
  // (about 9 s flat out), then it cuts until the intercooler catches up (below 55%)
  {const want=!!c.boost&&!E.off&&!E.stalled&&!this.hold;if(want&&!E.cut)E.heat=Math.min(1,E.heat+dt/9);else E.heat=Math.max(0,E.heat-dt/16);
   if(E.heat>=1)E.cut=true;if(E.cut&&E.heat<.55)E.cut=false;const on=want&&!E.cut;E.boost=mix(E.boost,on?1:0,1-Math.exp(-dt*(on?4:2.5)));
   if(on&&!this._boostMsg){this._boostMsg=true;}if(!want)this._boostMsg=false;}
  const Pmax=1250e3*(1+.6*E.boost)*(SEALED?(E.off?0:1):clamp(E.rpm/1600,.3,1))-(E.pump||0);/* electric: full power at any speed */
  E.Pavail=Math.max(6e4,Pmax);
  // ---- active suspension: ground under each tyre, terrain plane, levelling
  // (assist off leaves the legs passive while driving, but walking the legs or lifting a pair is a commanded manoeuvre:
  // the legs are servoed for it whatever the assist setting, or the body could never be held level on five legs)
  const lev=c.assist||!!this.trackSeq||this.wheels.some(w=>w.lifted);
  if(lev&&!c.assist)this._stance=this.wheels.map(w=>w.eset);else if(c.assist||speed>=1.5)this._stance=null;
  const wheels=this.wheels,active=wheels.map(w=>!w.lifted&&!w.disabled);
  const gH=[],hx=[],hz=[];
  for(const wh of wheels){const hb=this.hubBody(wh),rel=mv(R,[hb[0],0,hb[2]]);hx.push(dot(rel,hr));hz.push(dot(rel,hf));gH.push(wh.gSup??(env.ground(wh.hub[0],wh.hub[2],wh.hub[1])-wh.sink));/* the tyre rests on edges, not on the point below the hub */}
  // least squares plane g = a*x + b*z + c over supported wheels
  const fit=(vals,mask)=>{let n=0,sx=0,sz=0,sg=0,sxx=0,szz=0,sxz=0,sxg=0,szg=0;for(let i=0;i<6;i++){if(!mask[i])continue;n++;sx+=hx[i];sz+=hz[i];sg+=vals[i];sxx+=hx[i]*hx[i];szz+=hz[i]*hz[i];sxz+=hx[i]*hz[i];sxg+=hx[i]*vals[i];szg+=hz[i]*vals[i];}
   const M=[sxx,sxz,sx,sxz,szz,sz,sx,sz,n];const iM=inv3(M);const r=mv(iM,[sxg,szg,sg]);return {a:r[0],b:r[1],c:r[2]};};
  // a tyre over ground its leg cannot reach (an edge, a hole) takes no part in levelling or load sharing; it
  // reaches down for the ground instead. Without this the plane fit tilts the body toward the drop.
  const reach=active.slice();
  for(let pass=0;pass<2;pass++){if(reach.filter(Boolean).length<=4)break;const pl=fit(gH,reach);let worst=-1,wr=0;for(let i=0;i<6;i++)if(reach[i]){const res=gH[i]-(pl.a*hx[i]+pl.b*hz[i]+pl.c);if(res<wr){wr=res;worst=i;}}if(wr<-(GEOM.stroke*.5+.5))reach[worst]=false;else break;}
  this.overhang=active.map((a,i)=>a&&!reach[i]);
  const all=[1,1,1,1,1,1];const tp=fit(gH,reach.filter(Boolean).length>=4?reach:all);/* lifted tyres do not define the ground plane */
  // requested ride height
  let sReq=c.retraction;if(this.climbState)sReq=0;
  if(this.trackSeq&&this.trackSeq.phase!=='settle')sReq=Math.min(sReq,.6/GEOM.stroke);/* raised once, leaving the planted legs 0.6 m to take up a lifted unit's load *//* the other legs carry the body up while a pair is off the ground */
  // wade assist: look ahead for water and raise the cabin so the belly clears it
  if(lev){let dW=0;const wt2=this._wt2||(this._wt2={}),dir=vfwd>=0?1:-1;for(const d of [0,6,12,18,26]){const x=this.pos[0]+hf[0]*d*dir,z=this.pos[2]+hf[2]*d*dir,w=env.water?env.water(x,z,wt2):null;if(w&&w.kind){const g=env.ground(x,z,1e9);dW=Math.max(dW,w.level-g);}}
   this.wadeAhead=dW;if(dW>.4){const lowC=GEOM.belly-(GEOM.hubTop-GEOM.R),need=dW+.45,sMax=clamp(1-(need-lowC)/GEOM.stroke,0,1);if(sReq>sMax){sReq=sMax;if(this.t-(this._wadeMsg||0)>8){this._wadeMsg=this.t;this.say(`Water ${dW.toFixed(1)} m deep ahead: raising the cabin`,2.5);}}}}
  // kinematic lateral acceleration (speed x yaw rate): no feedback from body sway
  const latK=clamp(vfwd*this.w[1]/G,-.5,.5);this.latG=latK;
  // rollover guard: static margin from the CoM to the edge of the full six-tyre support polygon
  {const rxA=[],rzA=[],all6=[];for(let i=0;i<6;i++){const q=wheels[i].contact?wheels[i].cp:sub(wheels[i].hub,[0,GEOM.R,0]),rr=sub(q,this.pos);rxA.push(dot(rr,hr));rzA.push(dot(rr,hf));if(reach[i])all6.push(i);}this.tipMargin=supportMargin(rxA,rzA,all6);}
  if(lev&&this.tipMargin<2.6&&!this.climbState){sReq=clamp(sReq+(2.6-this.tipMargin)*.6,0,1);if(this.tipMargin<.9&&this.t-(this._tipMsg||0)>4){this._tipMsg=this.t;this.say('Rollover risk: lowering the cabin',2.5);}}
  const eNom=GEOM.stroke*(1-sReq);
  // body attitude target: level fraction f by bisection so every leg stays within stroke
  const margin=this.climbState||sReq<.04?.06:.16,lo=margin,hi=GEOM.stroke-(this.trackSeq&&this.trackSeq.phase!=='raise'&&this.trackSeq.order[this.trackSeq.k]?.length===1?.35:margin);/* walking a rear leg on its own: the five planted legs keep some stroke in hand to take its load (on a side slope the downhill ones would otherwise be at full stretch) */
  const tanOf=v=>v/Math.sqrt(Math.max(1e-6,1-v*v));
  const aB=tanOf(right[1]),bB=tanOf(fwd[1]),upY=Math.max(.3,up[1]);
  const eTouch=wheels.map((wh,i)=>wh.e+(wh.hub[1]-(gH[i]+GEOM.R-.035))/(Math.max(.3,wh.axis?wh.axis[1]:upY)));this.eTouch=eTouch;
  // feedforward from the terrain: e_i = hubTop - (g_i + R) + a*x_i + b*z_i + y0, plus lean and the
  // attitude integrator; the level fraction f is the largest that keeps all of it inside the stroke
  const lean=lev?clamp(latK*.45,-.14,.14):0;/* bank into the turn */
  const cS=Math.cos(GEOM.splay);/* a splayed leg lifts the hub cos(splay) per metre of stroke */
  const need=f=>gH.map((g,i)=>(GEOM.hubTop-(g+GEOM.R-.035)+((1-f)*tp.a+lean+this.integ[1])*hx[i]+((1-f)*tp.b+this.integ[2])*hz[i])/cS);
  const feasible=f=>{const e=need(f);let mx=-1e9,mn=1e9;for(let i=0;i<6;i++)if(reach[i]){mx=Math.max(mx,e[i]);mn=Math.min(mn,e[i]);}return mx-mn<=hi-lo-.06;};
  let f=0;if(lev){if(feasible(1))f=1;else{let a=0,b=1;for(let k=0;k<12;k++){const m=(a+b)/2;if(feasible(m))a=m;else b=m;}f=a;}}
  this.levelFraction=f;
  const aT=(1-f)*tp.a+lean,bT=(1-f)*tp.b;this.targetSlopes=[aT,bT];this._levErr=Math.abs(aT-aB)+Math.abs(bT-bB);
  // attitude integrator closes the loop on the measured body tilt (compliance, deflection, sinkage)
  const sat=wheels.some((w,i)=>reach[i]&&(w.e>GEOM.stroke-.12||w.e<.1));
  if(lev&&!sat&&!this.engine.off&&(!this.hold||Math.abs(aT-aB)+Math.abs(bT-bB)>.02)){const fk=Math.sqrt(Math.min(1,G/9.81));/* the machine answers more slowly in low gravity (its ride scales with the square root of g): so does the trim, or it chases its own lag into a rock */this.integ[1]=clamp(this.integ[1]+(aT-aB)*dt*.7*fk,-.12,.12);this.integ[2]=clamp(this.integ[2]+(bT-bB)*dt*.7*fk,-.12,.12);}
  if(!lev){this.integ[1]*=.98;this.integ[2]*=.98;}
  const eRaw=need(f);
  let mean=0,na=0,mx=-1e9,mn=1e9;for(let i=0;i<6;i++)if(reach[i]){mean+=eRaw[i];na++;mx=Math.max(mx,eRaw[i]);mn=Math.min(mn,eRaw[i]);}mean/=na||1;
  let shift=eNom-mean;if(mx+shift>hi)shift=hi-mx;if(mn+shift<lo)shift=Math.max(lo-mn,Math.min(shift,hi-mx));
  const eGoal=eRaw.map((v,i)=>reach[i]||!active[i]?clamp(v+shift,-.05,GEOM.stroke+.05):GEOM.stroke-.1);
  // coordinated slew: every leg covers the same fraction of its move per step, bounded by the
  // slew rate and by the pump flow the extending legs would need
  if(!this.eTs)this.eTs=wheels.map(w=>w.e);
  const Qmax0=.032*(SEALED?1:clamp(E.rpm/1350,.6,1));
  let maxD=0,extSum=0;for(let i=0;i<6;i++){if(!reach[i])continue;const d=eGoal[i]-this.eTs[i];maxD=Math.max(maxD,Math.abs(d));if(d>0)extSum+=d;}
  let alpha=1;const slew=1.0;if(maxD>slew*dt)alpha=slew*dt/maxD;if(extSum*alpha*PISTON>Qmax0*dt*.9)alpha=Math.min(alpha,Qmax0*dt*.9/(extSum*PISTON));
  const Fnom6=this.totalMass*G/6;
  const eT=eGoal.map((g,i)=>{const wh=wheels[i];if(!active[i]){this.eTs[i]=wh.e;return wh.e;}
   if(!reach[i]){const v=this.eTs[i]+clamp(g-this.eTs[i],-1.2*dt,.8*dt);this.eTs[i]=v;return v;}
   let v=this.eTs[i]+(g-this.eTs[i])*alpha;
   // a supporting tyre that has gone light reaches for the ground instead of hanging
   // (not when the tyre is light because the Spider is starting to tip: reaching down would push it over)
   if(lev&&wh.load<.25*Fnom6&&v<eTouch[i]+.03&&(this.tipMargin??9)>(this.climbState?.6:1.6))v=Math.min(eTouch[i]+.03,v+1.2*dt);
   this.eTs[i]=v;return v;});
  // during a track change the planted legs hold the raised stance exactly (load-compensated), leveller paused
  if(this.engine.off)for(let i=0;i<6;i++){eT[i]=wheels[i].e;this.eTs[i]=wheels[i].e;}/* engine off: the levelling waits, and restarts from where the legs stand */
  const TQ=this.trackSeq;if(TQ&&TQ.holdE)for(let i=0;i<6;i++)if(!wheels[i].lifted){if(TQ.phase==='lower'&&TQ.order[TQ.k]?.includes(i))TQ.holdE[i]=Math.max(TQ.holdE[i],Math.min(GEOM.stroke-.1,eTouch[i]+.1));/* set down on a slope, the moved leg reaches for ground lower than where it stood, and holds there */eT[i]=TQ.holdE[i];this.eTs[i]=TQ.holdE[i];}
  // ---- load allocation: minimum-variance loads satisfying force and moment balance about the CoM
  const W=this.totalMass*G*Math.max(.3,1+dot(this.acc,[0,1,0])/G*.0);
  const comH=[0,0];// CoM horizontal is at 0 in hr/hf coords relative to pos
  const rx=[],rz=[];for(let i=0;i<6;i++){const p=wheels[i].contact?wheels[i].cp:wheels[i].hub;const rr=sub(p,this.pos);// project along gravity
   rx.push(dot(rr,hr));rz.push(dot(rr,hf));}
  const anyLift=wheels.some(w=>w.lifted);const idx=[];for(let i=0;i<6;i++)if(reach[i])idx.push(i);/* every supporting leg gets its share, so a hanging tyre is pressed back down */
  const idxC=idx.filter(i=>wheels[i].contact);/* with a pair up, a skipping tyre keeps its share */// lifted legs are already out of the allocation (not active)
  const Ft=new Array(6).fill(0);
  if(idx.length>=3){const n=idx.length,Fb=W/n;// A = [1;rx;rz], b=[W,0,0]
   let S=[0,0,0,0,0,0,0,0,0],r0=[0,0,0];
   for(const i of idx){const a=[1,rx[i],rz[i]];for(let p=0;p<3;p++)for(let q=0;q<3;q++)S[p*3+q]+=a[p]*a[q];r0[0]+=Fb;r0[1]+=Fb*rx[i];r0[2]+=Fb*rz[i];}
   const res=[W-r0[0],0-r0[1],0-r0[2]],lam=mv(inv3(S),res);
   for(const i of idx)Ft[i]=Math.max(W*.02,Fb+lam[0]+lam[1]*rx[i]+lam[2]*rz[i]);
   this.allocOK=true;
  }else{for(let i=0;i<6;i++)if(active[i])Ft[i]=W/Math.max(1,active.filter(Boolean).length);this.allocOK=false;}
  // support polygon margin (for the HUD and the climb logic)
  this.supportMargin=supportMargin(rx,rz,idxC);
  {let cz=0,n=0;for(const i of idxC){cz+=rz[i];n++;}this.supportCentroid=n>=4?-cz/n:undefined;}// body-z offset of the support centroid from the CoM
  // ---- heave integral on the supporting legs' extension error, and setpoint synthesis
  const cm=wheels.map((w,i)=>active[i]&&w.contact);let he=0,hn=0;for(let i=0;i<6;i++)if(cm[i]){he+=eT[i]-wheels[i].e;hn++;}
  const nearStop=wheels.some((w,i)=>cm[i]&&(w.e>GEOM.stroke-.1||w.e<.08));
  if(hn&&!this.engine.off&&!(nearStop&&Math.sign(he)===Math.sign(this.integ[0]||he)))this.integ[0]=clamp(this.integ[0]+he/hn*dt*1.2*Math.sqrt(Math.min(1,G/9.81)),-.25,.25);
  let pumpDemand=0;const newSet=[];const tipped=up[1]<.5&&!this.sr;
  for(let i=0;i<6;i++){
   const wh=wheels[i];let target;
   if(wh.disabled){target=-.1;}
   else if(wh.lifted){target=wh.liftE??.15;}
   else{
    // position servo with an accumulator: hold eT under the present (smoothed) load, blended toward
    // the minimum-variance allocation so no tyre carries the vehicle on a crest or hangs in a hollow
    if(!this.Fsm)this.Fsm=wheels.map(()=>Fnom6);
    this.Fsm[i]+=(wh.load-this.Fsm[i])*(1-Math.exp(-dt/.9));
    const Fuse=clamp(anyLift?this.Fsm[i]*.2+(Ft[i]||Fnom6)*.8:this.Fsm[i]*.65+(Ft[i]||Fnom6)*.35,.5*Fnom6,3.4*Fnom6);// with a pair lifting, pre-load the others to their new share
    const ff=this.esetFor(Fuse-UNSPRUNG*G,eT[i]);
    const modal=TQ&&TQ.holdE?0:this.integ[0];
    const loadTrim=0;
    const vUp=this.pointVel(wh.mount)[1],vDb=Math.sign(vUp)*Math.max(0,Math.abs(vUp)-.04);const sky=lev?clamp(-vDb*.45,-.35,.35):0;
    target=ff+modal+loadTrim+sky;
    // keep each strut's loaded equilibrium off its end stops
    const Fl=Math.max(this.Fsm[i]-UNSPRUNG*G,.6*Fnom6);/* smoothed: a skipping tyre must not drop the strut's ceiling */target=clamp(target,this.esetFor(Fl,.08),this.esetFor(Fl,GEOM.stroke-.08));
    if(!lev)target=this._stance&&speed<1.5?this._stance[i]:this.esetFor(W/6-UNSPRUNG*G,eNom)+this.integ[0]*.5;/* assist off: after a walk the legs keep the stance they were walked in until the machine drives off */
   }
   newSet.push(clamp(target,-.3,GEOM.stroke+.5));// accumulator setpoint headroom above the stroke for loaded legs
  }
  // pump budget: extension under load costs flow; retraction is fast
  const Qmax=.032*(SEALED?1:clamp(E.rpm/1350,.6,1));
  let ext=0;for(let i=0;i<6;i++){const d=newSet[i]-wheels[i].eset;if(d>0)ext+=d;}
  const cap=Qmax*dt/PISTON;const s=ext>cap?cap/ext:1;
  for(let i=0;i<6;i++){const wh=wheels[i],d=newSet[i]-wh.eset;wh.liftT=wh.lifted?(wh.liftT||0)+dt:0;const unload=wh.liftT>0&&wh.liftT<3&&wh.load>.12*this.totalMass*G/6;// hand the load over gently, then snatch the tyre up
   let dd=d>0?Math.min(d*s,1.0*dt):Math.max(d,-(unload?.22:1.2)*dt);if(E.off||tipped)dd=0;/* no pump: the valves close and the accumulators hold the stance; over on its side the levelling has nothing to level and would only lever the machine about */wh.eset+=dd;if(d>0&&!E.off)pumpDemand+=dd*PISTON/dt;wh.valve=Math.sign(dd);}
  // levelling corrections chatter up and down; the accumulators absorb that, so the pump (and the engine)
  // only see the smoothed flow, and small trims are carried by the accumulators alone
  pumpDemand+=(Math.abs(this.arms[0].rate)+Math.abs(this.arms[1].rate))*.03;/* the arm drives run off the same pump */
  E.pumpSm=(E.pumpSm||0)+(pumpDemand-(E.pumpSm||0))*(1-Math.exp(-dt/.8));
  E.pumpFlow=E.pumpSm;E.pump=E.pumpSm*9e6;
  // engine rpm (a big-bore turbo diesel: 550 idle, 1900 governed): set by the drive demand; hydraulics add a little
  const drive=clamp((E.drivePower||0)/1250e3,0,1),pumpF=clamp((E.pumpSm-.2*Qmax)/(.8*Qmax),0,1);
  // a climb puts the engine in work mode (high idle) so the pump has full flow for the load transfers
  const rpmT=E.stalled?0:E.off?(E.crank>0?170:0):Math.max(this.climbState||pumpF>.25?1250:0,550+(1350+250*E.boost)*Math.max(drive*1.1,pumpF*.3,Math.abs(this.vcmd)/28*.7));
  E.rpm=mix(E.rpm,rpmT,1-Math.exp(-dt*(rpmT>E.rpm?2.2:1.6)));E.load=Math.max(drive,pumpF*.5);
  // ---- carriage
  this.updateCarriage(dt);
  // ---- step climbing
  this.climbLogic(dt,R,o,hf,gH,vfwd);
  // ---- attitude, tilt, comfort
  const roll=Math.asin(clamp(dot(right,[0,1,0]),-1,1))*180/Math.PI,pitch=Math.asin(clamp(dot(fwd,[0,1,0]),-1,1))*180/Math.PI;
  this.roll=roll;this.pitch=pitch;this.maxTilt=Math.max(this.maxTilt,Math.hypot(roll,pitch));
  const tilt=Math.hypot(roll,pitch);
  const cab=len(this.cabinAcc);const discomfort=clamp(cab/3.5,0,1)*.5+clamp(this.jerk/25,0,1)*.3+clamp((tilt-6)/20,0,1)*.4;
  this.comfort=mix(this.comfort,1-clamp(discomfort,0,1),1-Math.exp(-dt*1.2));
  if(up[1]<.5&&!this.overturned){this.overturned=true;if(!this.sr)this.say('Overturned. Q: self-righting arms · X: crane recovery',8);this.events.push({type:'overturn'});}
  if(this.overturned&&!this.sr&&up[1]>.9&&speed<1.5){this.overturned=false;this.say('Back on its wheels',2.5);}
  this.selfRight(dt,up,right);
  if(!this.overturned&&speed<1&&tilt<8&&this.t-(this._safeT||0)>2){this._safeT=this.t;this.lastSafe=[this.pos[0],this.pos[2],this.heading()];}
  // warnings
  if(speed>safe+1&&c.tire!=='road'&&!this.message)this.say(`Tyre pressure ${wheels[0].pressure.toFixed(1)} bar: keep under ${Math.round(safe*3.6)} km/h`,1.2);
  if((this.submerged||0)>.5&&this.t-(this._floodMsg||0)>6){this._floodMsg=this.t;this.say(this.ballast>.95?'Submerged: ballast tanks full, crawling on the bottom':'Submerged: flooding the ballast tanks to stay down',3);}
  // pair lift requests from the driver
  for(let p=0;p<3;p++){if(c.lift[p]&&this.engine.off&&!wheels[p*2].lifted){c.lift[p]=false;this.say('Start the engine to lift a leg (I)',2);}const want=c.lift[p];for(const k of [0,1]){const wh=wheels[p*2+k];if(want&&!wh.lifted&&!this.climbState&&!this.trackSeq){if(this.canLift(p,rx,rz)){wh.lifted=true;wh.liftE=.1;}else if(k===0){c.lift[p]=false;this.say(`Lifting the ${['front','middle','rear'][p]} pair would tip the Spider`,2.5);}}else if(!want&&wh.lifted&&!this.climbState&&!this.trackSeq&&!wh.disabled){wh.lifted=false;}}}
 }
 // ---------------------------------------------------------------- self-righting
 // Q: on its side or roof, an arm reaches over and brings the machine back down onto its wheels; standing, both arms
 // run a short test cycle. Again while running: stop and stow.
 requestSelfRight(){
  const S=this.sr;
  if(S){if(S.phase!=='stow'){S.phase='stow';S.abort=true;this.say('Self-righting stopped: stowing the arms',2);}return;}
  if(this.engine.stalled){this.say('The arms need hydraulic pressure: the engine is flooded',2.5);return;}
  if(this.engine.off)this.setEngine(true);
  const R=qmat(this.q),up=[R[1],R[4],R[7]],right=[R[0],R[3],R[6]],tilt=Math.acos(clamp(up[1],-1,1));
  this.cancelTrack(true);this.climbState=null;for(const w of this.wheels)if(!w.disabled)w.lifted=false;this.ctl.lift=[false,false,false];
  if(tilt<35*D2R&&!this.overturned){if(this.speed()>1.5){this.say('Stop to run the arm test',2);return;}this.sr={mode:'test',phase:'out',t:0};this.say('Self-righting arms: test cycle',2.5);this.events.push({type:'arm',k:'start'});return;}
  this.sr=this.planRight(right,1);this.say(`Self-righting: ${this.sr.arm===0?'right':'left'} arm ${this.sr.roof?'rolling her over':'reaching over'}`,3);this.events.push({type:'arm',k:'start'});
 }
 // Either way the arm on the high side works (right side up: the right arm, which curls over to the left).
 planRight(right,tries){const up=qmat(this.q)[4],tilt=Math.acos(clamp(up,-1,1));
  // on a side the arm on the high side levers; on the roof (more than 125 deg over) the arm on the high side rolls it
  // over the low side (the downhill way); on the level, the right arm
  const roof=tilt>125*D2R,arm=right[1]>=0?0:1;
  return {mode:'right',phase:'wait',arm,roof,t:0,stuck:0,tries};}
 selfRight(dt,up,right){
  const S=this.sr,A=this.arms,E=this.engine;
  const stage=a=>Math.min(ARM.n,Math.floor(a.ext/ARM.S+1e-6));
  for(const a of A){const st=stage(a);if(a._st!==undefined&&st!==a._st)this.events.push({type:'arm',k:'clunk'});a._st=st;}
  if(!S){for(const a of A)a.rate=a.ext>0?-ARM.ret:0;return;}
  S.t+=dt;const tilt=Math.acos(clamp(up[1],-1,1)),power=(E.off||E.stalled?0:1)*Math.min(1,Math.sqrt(G/9.81)*1.15);/* low gravity: a slower arm, or the shoe slips on what little weight it carries */
  if(S.mode==='test'){const T=25*D2R;/* the two paths cross over the roof further out */
   if(S.phase==='out'){for(const a of A)a.rate=a.ext<T?ARM.out*power:0;if(A.every(a=>a.ext>=T)){S.phase='hold';S.th=S.t;}}
   else if(S.phase==='hold'){for(const a of A)a.rate=0;if(S.t-S.th>1.4)S.phase='stow';}
   if(S.phase==='stow'){for(const a of A)a.rate=a.ext>0?-ARM.ret*.6*power:0;if(A.every(a=>a.ext<=0)){this.sr=null;this.events.push({type:'arm',k:'stow'});if(!S.abort)this.say('Arms stowed',1.5);}}
   return;}
  const a=A[S.arm],b=A[1-S.arm];b.rate=b.ext>0?-ARM.ret*power:0;
  // on the roof the carriage brings the centre of mass over the arms' station, so the machine stands level on the broad
  // fingertip shoe instead of dropping onto one end of its roof (and then yawing round that end rather than rolling)
  if(S.roof){const mm=this.items.filter(it=>it.moves).reduce((s,it)=>s+it.m,0);S.carriage=clamp(this.carriage+(ARM.z-this.com[2])*this.mass/mm,-GEOM.carriageMax,GEOM.carriageMax);}
  // legs retracted: the machine comes down over its low-side tyres, and a short leg puts that pivot high, nearer the
  // centre of mass (only when it is really down: part-way over it is still standing on those legs)
  if(!S.ok&&tilt>75*D2R){S.le=S.le??(this.wheels.reduce((s,w)=>s+w.eset,0)/6);S.le+=clamp(.1-S.le,-1.2*dt,1.2*dt);for(const w of this.wheels)if(!w.disabled)w.eset=Math.min(w.eset,S.le);}
  // still rolling or rocking from the fall: let it come to rest first, then choose the arm for how it lies
  if(S.phase==='wait'){a.rate=0;const wl=len(this.w);S.calm=wl<.12?(S.calm||0)+dt:0;if((S.calm>.6&&(!S.roof||Math.abs(this.com[2]-ARM.z)<.1))||S.t>12){const p=this.planRight(right,S.tries);S.arm=p.arm;S.roof=p.roof;S.phase='out';S.t0=S.t;}else if(this.messageT<=0)this.say('Self-righting: waiting for her to settle',1);}
  if(S.phase==='out'){
   // the drive ramps (its acceleration scaled to gravity: the shoe can only grip with what weight it carries)
   const stall=clamp((ARM.F-a.load)/(.35*ARM.F),0,1),want=a.ext<ARM.max?ARM.out*stall*power:0,acc=ARM.acc*Math.min(1,G/9.81)*dt;a.rate+=clamp(want-a.rate,-acc*3,acc);
   if(this.messageT<=0&&this.t-(S.msgT||0)>2.5){S.msgT=this.t;this.say(`Self-righting: ${Math.round(a.ext/ARM.max*100)}% reach, ${Math.round(tilt/D2R)} deg over`,1.2);}
   // over the balance point: the arm lifts off as the machine falls onto its wheels
   if(a.touch>0)S.touched=true;
   if(tilt<28*D2R||(S.touched&&tilt<50*D2R&&a.touch===0)){S.phase='stow';S.ok=true;S.ts=S.t;this.say('Coming over: stowing the arm',2.5);}
   else if(a.ext>=ARM.max-1e-3||stall<.05){S.stuck+=dt;if(S.stuck>3){S.phase='stow';S.ok=false;}}else S.stuck=0;
   if(S.t>50/Math.min(1,Math.sqrt(G/9.81)*1.15)){S.phase='stow';S.ok=false;}}
  if(S.phase==='stow'){
   // after a good roll, let it settle on its wheels before pulling the arm in (pulling in a loaded arm would roll it back)
   const hold=S.ok&&!S.abort&&a.touch>0&&tilt>12*D2R&&S.t-S.ts<4/Math.min(1,Math.sqrt(G/9.81));a.rate=hold?0:(a.ext>0?-ARM.ret*power:0);
   if(a.ext<=0&&b.ext<=0){this.events.push({type:'arm',k:'stow'});
    if(S.abort){this.sr=null;return;}
    if(up[1]>.8){this.sr=null;this.overturned=false;this.say('Back on its wheels: arms stowed',3);this.righted=(this.righted||0)+1;this.events.push({type:'righted'});}
    else if(S.tries<3){this.sr=this.planRight(right,S.tries+1);this.say('Self-righting: trying again',3);}
    else{this.sr=null;this.say('The arms cannot right it here: crane recovery (X)',6);}}}
 }
 canLift(p,rx,rz){const idx=[];for(let i=0;i<6;i++)if((i>>1)!==p&&!this.wheels[i].disabled&&!this.wheels[i].lifted)idx.push(i);return supportMargin(rx,rz,idx)>.35;}
 updateCarriage(dt){
  // load optimisation: trim the cabin carriage so the CoM sits over the centroid of the supporting tyres
  let target=this.carriageTarget;
  if(this.ctl.carriageManual!=null)target=this.ctl.carriageManual;
  else if(this.supportCentroid!==undefined&&this.ctl.assist){const mm=this.items.filter(it=>it.moves).reduce((a,it)=>a+it.m,0);target=clamp(this.carriage+this.supportCentroid*this.mass/mm*.5,-GEOM.carriageMax,GEOM.carriageMax);}
  else if(!this.ctl.assist)target=0;
  if(this.climbState?.carriage!==undefined)target=this.climbState.carriage;
  if(this.trackSeq?.carriage!==undefined)target=this.trackSeq.carriage;
  if(this.sr?.carriage!==undefined)target=this.sr.carriage;
  // disabled legs: move the cabin toward the remaining supports
  const dis=this.wheels.map(w=>w.disabled);if(dis[0]||dis[1])target=GEOM.carriageMax;else if(dis[4]||dis[5])target=-GEOM.carriageMax;
  this.carriageTarget=clamp(target,-GEOM.carriageMax,GEOM.carriageMax);
  const d=this.carriageTarget-this.carriage;if(Math.abs(d)>1e-4){const cr=this.trackSeq?1.1:.5;this.carriage+=clamp(d,-cr*dt,cr*dt);this.recomputeMass();}
 }
 // Step climbing: crawl -> (carriage shift) -> lift pair -> advance -> place -> next pair.
 climbLogic(dt,R,o,hf,gHs,vfwd){
  /* rises are measured from the ground under the hubs: a tyre already up the face must not shrink the step */
  const gH=this.wheels.map(w=>this.env.ground(w.hub[0],w.hub[2],1e9)-w.sink);
  const c=this.ctl,wheels=this.wheels;this.dropWarn=false;
  const dir=c.throttle>=0?1:-1;
  const kR=GEOM.R/1.35;// probe distances were tuned for a 1.35 m tyre
  const probe=(i,dist)=>{const h=wheels[i].hub;return this.env.ground(h[0]+hf[0]*dist*kR*dir,h[2]+hf[2]*dist*kR*dir,1e9);};
  const lead=dir>0?0:2;
  // look for rises and drops ahead of the leading pair
  let rise=0,drop=0,top=-1e9,steep=0;
  for(const i of [lead*2,lead*2+1]){const g0=gH[i]+wheels[i].sink;let prev=g0,pd=0;for(const d of [.9,1.2,1.5,1.8,2.1,2.4,3.0]){const g=probe(i,d);rise=Math.max(rise,g-g0);drop=Math.max(drop,g0-g);top=Math.max(top,g);steep=Math.max(steep,Math.abs(g-prev)/(d-pd));prev=g;pd=d;}}
  this.probeSteep=steep;
  this.probeRise=rise;this.probeDrop=drop;
  const reach=1.6;/* the lift needs leg in hand on the other pairs: 1.6 m steps */
  if(!this.climbState){
   if(drop>reach+.15&&steep>1&&c.throttle!==0){this.dropWarn=true;if(this.t-(this._dropMsg||0)>3){this._dropMsg=this.t;this.say(`Drop of ${drop.toFixed(1)} m ahead exceeds leg reach`,2.5);}}
   // only when driving over it has actually stalled: the tyres climb most ledges on their own
   this.stallT=(c.throttle!==0&&Math.abs(vfwd)<.3&&Math.abs(this.vcmd)>.8)?(this.stallT||0)+dt:0;
   if(rise>.72*kR&&steep>1.1&&Math.abs(this.roll||0)<12&&c.throttle!==0&&this.stallT>2.5&&wheels.filter(w=>w.contact).length>=4){
    if(rise>reach+.05){c.throttle!==0&&this.t-(this._riseMsg||0)>3&&(this._riseMsg=this.t,this.say(`Rise of ${rise.toFixed(1)} m is beyond reach: find another route`,3));return;}
    if(c.climb&&c.assist){this.climbState={pair:dir>0?0:2,dir,phase:'approach',top,cap:.8,t:0};this.say(`Climbing a ${rise.toFixed(1)} m step`,2.5);}
   }
   return;
  }
  const S=this.climbState;S.t+=dt;
  if(c.throttle===0||Math.sign(c.throttle)!==S.dir){if(S.t>1){this.endClimb();}return;}
  const p=S.pair,i0=p*2,i1=p*2+1,W=[wheels[i0],wheels[i1]];
  const rx=[],rz=[];for(let i=0;i<6;i++){const q=wheels[i].contact?wheels[i].cp:wheels[i].hub,rr=sub(q,this.pos);rx.push(dot(rr,[-hf[2],0,hf[0]]));rz.push(dot(rr,hf));}
  // step top for this pair: the higher ground just ahead of it
  const localRise=()=>{let r=0,tp=-1e9;for(const i of [i0,i1]){const g0=gH[i]+wheels[i].sink;for(const d of [.9,1.5,2.1]){const g=probe(i,d);r=Math.max(r,g-g0);tp=Math.max(tp,g);}}return {r,tp};};
  const needCarriage=p===0?(S.dir>0?GEOM.carriageMax:-GEOM.carriageMax):p===2?(S.dir>0?-GEOM.carriageMax:GEOM.carriageMax):0;
  switch(S.phase){
   case 'approach':{S.cap=.7;const lr=localRise();
    if(lr.r<.55*kR){// no face in front of this pair (yet): keep rolling, maybe the pair already cleared
     if(S.seenFace)this.nextPair();break;}
    S.seenFace=true;S.top=lr.tp;
    // at the face when the tyre is pressed against it (contact normal points back) or distance small
    const front=W.some(w=>w.contact&&dot(w.cn,hf)*S.dir<-.25)||Math.abs(vfwd)<.12&&S.t>1.5;
    if(front){S.phase='shift';S.carriage=needCarriage;S.cap=0;S.t=0;}
    break;}
   case 'shift':S.cap=0;if(Math.abs(this.carriage-S.carriage)<.05||S.t>6){const idx=[];for(let i=0;i<6;i++)if((i>>1)!==p&&!wheels[i].disabled)idx.push(i);const m=supportMargin(rx,rz,idx);
     if(m<.4){this.say('Cannot lift: centre of mass outside the remaining support',3);this.endClimb();break;}
     S.phase='lift';S.t=0;for(const w of W){w.lifted=true;}}
    break;
   case 'lift':{S.cap=0;if(Math.abs(this.pitch||0)>10||Math.abs(this.roll||0)>10){for(const w of W)w.lifted=false;S.phase='settle';S.t=0;S.retries=(S.retries||0)+1;break;}// retract until the tyre bottom clears the top + 0.25
    // safety: if the remaining support loses a tyre, put the pair back down and let it settle
    {let sup=0;for(let i=0;i<6;i++)if((i>>1)!==p&&wheels[i].contact&&wheels[i].load>1500)sup++;S.lost=sup<4?(S.lost||0)+dt:0;if(S.lost>.5&&S.t>.6){for(const w of W)w.lifted=false;S.phase='settle';S.t=0;S.retries=(S.retries||0)+1;if(S.retries>3){this.say('Cannot hold the lift: support is unstable',3);this.endClimb();}break;}}
    let done=true;for(const w of W){const needHub=S.top+GEOM.R+.16;const dy=needHub-w.hub[1];w.liftE=clamp(w.eset-dy,-.3,GEOM.stroke);/* move the setpoint: a hanging strut sits below it */if(dy>.1)done=false;}
    if(done){S.phase='advance';S.t=0;}else if(S.t>8||W.some(w=>w.e<.02&&w.hub[1]<S.top+GEOM.R)){this.say('Step is beyond reach',3);for(const w of W)w.lifted=false;this.endClimb();}break;}
   case 'advance':{if(Math.abs(this.pitch||0)>10||Math.abs(this.roll||0)>10){for(const w of W)w.lifted=false;S.phase='settle';S.t=0;S.retries=(S.retries||0)+1;break;}let clear=true;for(const w of W){const needHub=S.top+GEOM.R+.18;w.liftE=clamp(w.eset-(needHub-w.hub[1]),-.3,GEOM.stroke);if(w.hub[1]<needHub-.12)clear=false;}
    S.cap=clear?.55:0;// never drive the lifted tyres into the edge
    // lifted wheels over the top?
    const over=W.every(w=>this.env.ground(w.hub[0],w.hub[2],1e9)>S.top-.35&&this.env.ground(w.hub[0]-hf[0]*.9*S.dir,w.hub[2]-hf[2]*.9*S.dir,1e9)>S.top-.5);
    if(over||S.t>12){S.phase='place';S.t=0;for(const w of W)w.lifted=false;}break;}
   case 'settle':{S.cap=0;if(S.t>2.5){S.phase='shift';S.t=0;}break;}
   case 'place':{S.cap=0;const Fnom=this.totalMass*G/6;if(W.every(w=>w.load>.3*Fnom)||S.t>6){this.nextPair();}break;}
  }
 }
 nextPair(){const S=this.climbState;const np=S.pair+S.dir;if(np<0||np>2){this.endClimb();this.say('Step cleared',2);return;}S.pair=np;S.phase='approach';S.seenFace=false;S.t=0;S.carriage=0;S.cap=.7;}
 endClimb(){for(const w of this.wheels)if(!w.disabled)w.lifted=false;this.climbState=null;}
 // ---------------------------------------------------------------- public
 // armour: every hit is scaled here (a heavy machine, roughly five times tougher than first modelled)
 hurtHull(x){this.hull=Math.max(0,this.hull-x/5);}
 recover(x,z,yaw){this.hull=Math.max(this.hull,25);for(const wh of this.wheels){wh.e=GEOM.stroke/2;wh.eset=GEOM.stroke/2+.15;wh.ev=0;wh.omega=0;wh.sink=0;}this.climbState=null;this.engine.stalled=false;this.place(x,z,yaw);this.say('Craned upright on clear ground',3);}
 disableLeg(i){const wh=this.wheels[i];if(wh.disabled)return;wh.disabled=true;wh.lifted=true;this.say(`${['Front','Middle','Rear'][wh.pair]} ${wh.side<0?'left':'right'} leg disabled: carriage compensating`,4);this.events.push({type:'leg',i});}
 setVariant(v){this.variant=v;this.water=VARIANTS[v].tank;this.crewCount=VARIANTS[v].crew;this.recomputeMass();}
 attitude(){return {roll:this.roll||0,pitch:this.pitch||0};}
 // Attitude envelope along the present steering arc (dir +1 forward, -1 back, up to sMax metres).
 // Danger 1 = the limit: residual roll or pitch the legs cannot level out, a side slope steeper than the
 // tyres can hold, or the tip margin the residual tilt leaves at this centre-of-mass height.
 envelope(dir,sMax){
  const R=qmat(this.q),o=this.origin(R),env=this.env,fw=[-R[2],0,-R[8]],fl=Math.hypot(fw[0],fw[2])||1;
  let hf=[fw[0]/fl,0,fw[2]/fl],hr=[-hf[2],0,hf[0]],p=[o[0],0,o[2]];
  const tf=Math.tan(this.steer[0]),Rc=Math.abs(tf)>1e-4?GEOM.wheelbase/tf:1e9;
  const comH=clamp(this.pos[1]-env.ground(this.pos[0],this.pos[2],this.pos[1]),2,9);
  const sf=this.wheels.map(w=>w.surface?.mu||.6),mu=sf.reduce((a,b)=>a+b,0)/6*1.25;
  const hts=[0,1,2,3,4,5].map(i=>this.ht(i)),htm=hts.reduce((a,b)=>a+b,0)/6;
  const lev=GEOM.stroke-.5,cb=-this.com[2],wtmp=this._ewt||(this._ewt={}),wadeMax=SEALED?1e9:GEOM.intakeY-(GEOM.hubTop-GEOM.R)+GEOM.stroke-.6;/* roof intake at full extension, less a margin: deeper than that stalls the engine */
  const danger=()=>{const A=[],B=[],Gs=[];
   for(let i=0;i<6;i++){const wh=this.wheels[i],a=wh.side*hts[i],b=-GEOM.stations[wh.pair],x=p[0]+hr[0]*a+hf[0]*b,z=p[2]+hr[2]*a+hf[2]*b;A.push(a);B.push(b-cb);Gs.push(env.ground(x,z,1e9));}
   // plane through the tyres the legs can reach: drop any far below the fit (over an edge) and refit
   let S=[0,1,2,3,4,5],r=null;
   for(let pass=0;pass<3;pass++){let n=0,sa=0,sb=0,sg=0,saa=0,sbb=0,sab=0,sag=0,sbg=0;for(const i of S){const a=A[i],b=B[i],g=Gs[i];n++;sa+=a;sb+=b;sg+=g;saa+=a*a;sbb+=b*b;sab+=a*b;sag+=a*g;sbg+=b*g;}
    r=mv(inv3([saa,sab,sa,sab,sbb,sb,sa,sb,n]),[sag,sbg,sg]);if(!isFinite(r[0]+r[1]+r[2]))r=[0,0,sg/n];
    let worst=-1,wr=0;for(const i of S){const res=Gs[i]-(r[0]*A[i]+r[1]*B[i]+r[2]);if(res<wr){wr=res;worst=i;}}
    if(wr<-(lev*.5+.4)&&S.length>3)S=S.filter(i=>i!==worst);else break;}
   const lat=Math.abs(r[0]),lon=Math.abs(r[1]);
   const rho=Math.atan(Math.max(0,lat*2*htm-lev)/(2*htm)),pit=Math.atan(Math.max(0,lon*GEOM.wheelbase-lev)/GEOM.wheelbase);
   // the residual tilt carries the centre of mass downhill; measure what is left of the support polygon
   const cx=-Math.sign(r[0])*comH*Math.tan(rho),cz=-Math.sign(r[1])*comH*Math.tan(pit);
   const m=S.length>=3?supportMargin(A.map(v=>v-cx),B.map(v=>v-cz),S):-1;
   const dTip=(3-m)/2,dRoll=rho/(16*Math.PI/180),dSlide=lat/(mu*.9),dPitch=pit/(26*Math.PI/180);
   let dWat=0;if(env.water){const w=env.water(p[0],p[2],wtmp);if(w.kind)dWat=Math.max(0,w.level-env.ground(p[0],p[2],1e9))/wadeMax;}
   const d=Math.max(dTip,dRoll,dSlide,dPitch,dWat);const gm=Gs.reduce((a,b)=>a+b,0)/6;return {d,why:d===dWat?'water':d===dSlide?'slide':d===dPitch?'pitch':'roll',rel:Gs.map(g=>g-gm)};};
  const D0=danger();let s=1e9,why=D0.why;const step=Math.max(1.5,Math.min(6,sMax/14));let dNear=null,dPrev=D0.d,mono=true,legCap=1e9;
  // water deeper than the intake is probed much further out (80 m): grip is poor once the pod is wet, so the
  // stop has to begin early, and depth changes slowly enough that a far probe is meaningful
  let wStop=1e9;
  for(let q=step;q<=Math.max(sMax,80)+1e-6;q+=step){const a=dir*step/Rc;p=[p[0]+hf[0]*dir*step,0,p[2]+hf[2]*dir*step];const c=Math.cos(a),sn=Math.sin(a);const nf=[hf[0]*c-hr[0]*sn,0,hf[2]*c-hr[2]*sn],nr=[hr[0]*c+hf[0]*sn,0,hr[2]*c+hf[2]*sn];hf=nf;hr=nr;
   if(q>sMax+1e-6){if(env.water){const w=env.water(p[0],p[2],wtmp);if(w.kind&&w.level-env.ground(p[0],p[2],1e9)>wadeMax*.95){wStop=q;break;}}continue;}
   const D=danger();if(D.why==='water'&&D.d>=.95&&wStop>q)wStop=q;if(dNear===null)dNear=D.d;
   // ground falling away under a tyre faster than its leg can follow (~1 m/s) leaves it hanging: slow so each leg keeps up
   for(let i=0;i<6;i++){const drop=D0.rel[i]-D.rel[i];if(drop>.6){const c=1.1*q/(drop-.4);const vb=Math.sqrt(c*c+2*2.5*Math.min(1,G/9.81)*Math.max(0,q-3));if(vb<legCap)legCap=vb;}}
   if(q<=3*step+1e-6&&D.d>dPrev-.03)mono=false;dPrev=D.d;if(D.d>=1&&D0.d<1){s=q;why=D.why;break;}if(q>=3*step-1e-6&&D0.d>=1)break;}
  return {d0:D0.d,s,why,step,legCap,wStop,improves:D0.d>=1&&mono};/* outside the envelope: only a path that keeps getting better */
 }
 heading(){const R=qmat(this.q);return Math.atan2(-R[2],R[8]);}// compass: 0 = facing -Z (north), clockwise toward +X (east)
 speed(){return Math.hypot(this.vel[0],this.vel[2]);}
 telemetry(){return {pos:this.pos,vel:this.vel,rpm:this.engine.rpm,pump:this.engine.pumpFlow,carriage:this.carriage,level:this.levelFraction,feet:this.wheels.map(w=>({load:w.load,e:w.e,eset:w.eset,gas:w.gas/1e5,pressure:w.pressure,slip:w.slip,contact:w.contact,surface:w.surface?.name,sink:w.sink,lifted:w.lifted,disabled:w.disabled}))};}
}
function mix3(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
// Least-squares fit of per-leg values to heave + roll(x) + pitch(z) modes.
function fitModes(v,hx,hz,mask){let n=0,sx=0,sz=0,sg=0,sxx=0,szz=0,sxz=0,sxg=0,szg=0;for(let i=0;i<6;i++){if(!mask[i])continue;n++;sx+=hx[i];sz+=hz[i];sg+=v[i];sxx+=hx[i]*hx[i];szz+=hz[i]*hz[i];sxz+=hx[i]*hz[i];sxg+=hx[i]*v[i];szg+=hz[i]*v[i];}
 if(n<3)return [0,0,0];const r=mv(inv3([n,sx,sz,sx,sxx,sxz,sz,sxz,szz]),[sg,sxg,szg]);return r;}
// Distance from the CoM (origin of rx,rz) to the edge of the convex support polygon (negative = outside).
export function supportMargin(rx,rz,idx){
 if(idx.length<3)return -1;const pts=idx.map(i=>[rx[i],rz[i]]);
 pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lower=[],upper=[];for(const p of pts){while(lower.length>=2&&cr(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
 for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>=2&&cr(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
 const hull=lower.slice(0,-1).concat(upper.slice(0,-1));if(hull.length<3)return -1;
 let m=1e9;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],ex=b[0]-a[0],ez=b[1]-a[1],l=Math.hypot(ex,ez)||1;const d=((0-a[0])*ez-(0-a[1])*ex)/l;m=Math.min(m,-d);}
 return m;
}
