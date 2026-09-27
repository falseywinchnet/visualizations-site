// Spider vehicle dynamics. Pure JS, deterministic, no three.js. Metres, kilograms, seconds.
// Body frame: x right, y up, z back (forward is -Z); origin at the ground reference under the
// cabin centre. Chassis is a 6-DOF rigid body; each wheel has an unsprung DOF along its strut
// and a spin DOF. Struts are hydropneumatic (oil setpoint + nitrogen accumulator). A 60 Hz
// controller does levelling, load allocation, skyhook damping and step climbing.
// This is a speculative concept model: plausible physics, not a validated vehicle.

export const GEOM=Object.freeze({R:1.7,tireWidth:.62,halfTrack:4.8,stations:[-4.7,0,4.7],stroke:2.4,hubTop:2.64,plateY:6.11,topPlate:6.4,belly:2.6,cabinY:4.2,cabinR:1.6,cabinHalf:5.4,wheelbase:9.4,maxLock:35*Math.PI/180,carriageMax:2.0});
export const DT=1/240;
const G=9.81,RHO=1000,PISTON=.0095,PN=1.55e6,GAMMA=1.3;
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
  this.ctl={throttle:0,steer:0,brake:false,limit:40/3.6,retraction:.5,assist:true,climb:true,suspension:'auto',tire:'terrain',lift:[false,false,false],carriageManual:null};
  this.t=0;this.wheels=[];
  for(let i=0;i<6;i++)this.wheels.push({pair:i>>1,side:(i&1)?1:-1,e:1.2,ev:0,eset:1.35,spin:0,omega:0,load:0,contact:false,pressure:1.6,sink:0,slip:0,slipAngle:0,surface:null,anchor:null,disabled:false,lifted:false,gas:PN,deflection:0,cp:[0,0,0],cn:[0,1,0],hub:[0,0,0],mount:[0,0,0],water:0,torque:0,depthUnder:0});
  this.steer=[0,0,0];// plate angles (front, middle, rear=0)
  this.pos=[0,0,0];this.vel=[0,0,0];this.q=[0,0,0,1];this.w=[0,0,0];this.acc=[0,0,0];
  this.engine={rpm:600,load:0,stalled:false,stallTimer:0,pump:0};this.vcmd=0;this.hold=true;
  this.hull=100;this.damage=[];this.events=[];this.cabinAcc=[0,0,0];this.jerk=0;this.comfort=1;
  this.climbState=null;this.message='Ready';this.messageT=0;this.overturned=false;this.flooded=0;this.brush=0;this.breaks=0;
  this.distance=0;this.maxTilt=0;this.impacts=0;this.integ=[0,0,0];
  this.suspMode='soft';this.Vn=.006;this.dampC1=5200;this.dampC2=2600;this.kGas=GAMMA*PN*PISTON*PISTON/this.Vn;
  this.recomputeMass();
  this.place(opts.x??0,opts.z??0,opts.yaw??0);
 }
 // ---------------------------------------------------------------- mass model
 recomputeMass(){
  const items=[
   {m:5000,pos:[0,4.2,0],size:[3.0,3.2,10.8],moves:true},// cabin shell, seats, glazing
   {m:2500,pos:[0,6.2,0],size:[2.6,.5,10.4],moves:false},// overhead plates, crossbars, top cover
   {m:1700,pos:[0,3.8,4.4],size:[1.2,.9,1.1],moves:true},// turbo diesel V8, pumps, reservoir, cooling
   {m:2100,pos:[0,4.6,0],size:[9.2,2.6,9.4],moves:false},// leg barrels, knee braces, hub motors
   {m:this.crewCount*110,pos:[0,3.7,-.8],size:[1.4,1,7],moves:true},
   ...VARIANTS[this.variant].payload];
  if(this.water>0)items.push({m:this.water,pos:[0,7.1,.2],size:[2.2,.9*Math.max(.1,this.water/3500),7.6],moves:false,slosh:true});
  let M=0,c=[0,0,0];
  for(const it of items){const p=it.moves?[it.pos[0],it.pos[1],it.pos[2]+this.carriage]:it.pos;it._p=p;M+=it.m;c=add(c,scl(p,it.m));}
  c=scl(c,1/M);const I=[0,0,0,0,0,0,0,0,0];
  for(const it of items){const r=sub(it._p,c),[sx,sy,sz]=it.size,m=it.m;
   I[0]+=m*(sy*sy+sz*sz)/12+m*(r[1]*r[1]+r[2]*r[2]);I[4]+=m*(sx*sx+sz*sz)/12+m*(r[0]*r[0]+r[2]*r[2]);I[8]+=m*(sx*sx+sy*sy)/12+m*(r[0]*r[0]+r[1]*r[1]);
   I[1]-=m*r[0]*r[1];I[3]-=m*r[0]*r[1];I[2]-=m*r[0]*r[2];I[6]-=m*r[0]*r[2];I[5]-=m*r[1]*r[2];I[7]-=m*r[1]*r[2];}
  const unsprung=6*620;
  if(this.com){// keep the body origin fixed when the CoM moves
   const R=qmat(this.q),origin=sub(this.pos,mv(R,this.com));this.pos=add(origin,mv(R,c));}
  this.mass=M;this.com=c;this.Ib=I;this.IbInv=inv3(I);this.totalMass=M+unsprung;this.items=items;
 }
 // ---------------------------------------------------------------- placement
 place(x,z,yaw=0){
  this.vel=[0,0,0];this.w=[0,0,0];this.vcmd=0;this.overturned=false;this.integ=[0,0,0];
  // fit the terrain plane under the six tyres and stand on it at nominal posture
  const q0=qyaw(-yaw),R0=qmat(q0),hf=[-R0[2],0,-R0[8]],hr=[R0[0],0,R0[6]];
  const P=[];for(const wh of this.wheels){const hb=this.hubBody(wh,1.2),hw=mv(R0,hb);P.push([hw[0],hw[2],this.env.ground(x+hw[0],z+hw[2],1e9)]);}
  let n=0,sx=0,sz=0,sg=0,sxx=0,szz=0,sxz=0,sxg=0,szg=0;for(const [px,pz,g] of P){const a=px*hr[0]+pz*hr[2],b=px*hf[0]+pz*hf[2];n++;sx+=a;sz+=b;sg+=g;sxx+=a*a;szz+=b*b;sxz+=a*b;sxg+=a*g;szg+=b*g;}
  const r=mv(inv3([sxx,sxz,sx,sxz,szz,sz,sx,sz,n]),[sxg,szg,sg]);
  const roll=Math.atan(r[0]),pitch=Math.atan(r[1]);// start parallel to the ground; the controller levels from there
  const qr=[Math.sin(-roll/2)*hf[0],0,Math.sin(-roll/2)*hf[2],Math.cos(roll/2)];
  const qp=[Math.sin(pitch/2)*hr[0],0,Math.sin(pitch/2)*hr[2],Math.cos(pitch/2)];
  this.q=qnorm(qmul(qp,qmul(qr,q0)));
  const R=qmat(this.q);let need=-1e9;
  for(const wh of this.wheels){const hb=this.hubBody(wh,1.2),hw=mv(R,hb);const g=this.env.ground(x+hw[0],z+hw[2],1e9);need=Math.max(need,g+GEOM.R-hw[1]);}
  for(const wh of this.wheels){wh.e=1.2;wh.eset=1.35;wh.ev=0;wh.omega=0;wh.anchor=null;}
  this.pos=add([x,need+.03,z],mv(R,this.com));this.climbState=null;
  for(const wh of this.wheels){wh.pressure=PRESSURES[this.ctl.tire];}
 }
 get R(){return qmat(this.q);}
 origin(R=qmat(this.q)){return sub(this.pos,mv(R,this.com));}
 hubBody(wh,e=wh.e){const d=this.steer[wh.pair],zs=GEOM.stations[wh.pair];return [wh.side*GEOM.halfTrack*Math.cos(d),GEOM.hubTop-e,zs-wh.side*GEOM.halfTrack*Math.sin(d)];}
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
   const mb=[wh.side*GEOM.halfTrack*Math.cos(d),GEOM.hubTop,GEOM.stations[pair]-wh.side*GEOM.halfTrack*Math.sin(d)];
   const M=add(o,mv(R,mb)),hub=sub(M,scl(up,wh.e));wh.mount=M;wh.hub=hub;
   const vM=this.pointVel(M),vH=sub(vM,scl(up,wh.ev));
   const fb=[-Math.sin(d),0,-Math.cos(d)],fw=mv(R,fb);
   let fh=[fw[0],0,fw[2]];const fl=Math.hypot(fh[0],fh[2])||1;fh=[fh[0]/fl,0,fh[2]/fl];
   // ---- contact: circle vs height profile along the wheel's line
   let pen=-1,gp=null,ax=0,ay=0,az=0;const sink=wh.sink;
   for(let k=-6;k<=6;k++){const s=k/6*Rw*.98,gx=hub[0]+fh[0]*s,gz=hub[2]+fh[2]*s,gy=env.ground(gx,gz,hub[1])-sink;
    let p,nx,ny,nz,py;
    if(gy>hub[1]){// solid column reaches above the hub: nearest point is level with the hub
     if(Math.abs(s)<.12){p=Rw+(gy-hub[1]);nx=0;ny=1;nz=0;py=gy;}else{p=Rw-Math.abs(s);nx=-fh[0]*Math.sign(s);ny=0;nz=-fh[2]*Math.sign(s);py=hub[1];}}
    else{const dx=hub[0]-gx,dy=hub[1]-gy,dz=hub[2]-gz,dd=Math.hypot(dx,dy,dz)||1e-6;p=Rw-dd;nx=dx/dd;ny=dy/dd;nz=dz/dd;py=gy;}
    if(p>pen){pen=p;gp=[gx,py,gz,nx,ny,nz];}
    if(p>0){ax+=nx*p;ay+=ny*p;az+=nz*p;}}
   // penetration-weighted normal: smooth in V-shaped ditches and over edges
   if(pen>0&&gp){const l=Math.hypot(ax,ay,az);if(l>1e-6){gp[3]=ax/l;gp[4]=ay/l;gp[5]=az/l;}}
   let Fn=0,cn=[0,1,0],cpt=hub;
   wh.contact=pen>0;
   let tf=[0,0,0];// tyre force on wheel
   if(pen>0){
    cn=[gp[3],gp[4],gp[5]];
    const nt=env.normal(gp[0],gp[2]);const lh=[-fh[2],0,fh[0]];const lat=dot(nt,lh);cn=norm(add(cn,scl(lh,lat)));
    cpt=[gp[0],gp[1],gp[2]];
    const kt=mix(260e3,620e3,(wh.pressure-.8)/1.7),ct=9000;/* the big carcass damps wheel hop */
    const pdot=-dot(vH,cn);
    Fn=kt*pen+ct*pdot+(pen>.3?(pen-.3)*2.5e6:0);if(Fn<0)Fn=0;if(Fn>4.5e5)Fn=4.5e5;wh.deflection=pen;
    // ---- friction
    let t=sub(fw,scl(cn,dot(fw,cn)));t=norm(t);const l=cross(cn,t);// l points to the wheel's left? cross(up, fwd) = left
    const vx=dot(vH,t),vy=dot(vH,l);
    const surf=wh.surface||{mu:.65,slide:.5,roll:.04,soft:.3};
    const pfac=(2.5-wh.pressure)/1.7;
    const Fnom=this.totalMass*G/6;
    // 3.4 m lugged agricultural tyres bite harder than the surface's reference tyre, more so aired down on soft ground
    const lug=1.2+.12*pfac*surf.soft;let mu=surf.mu*lug*(1+.22*pfac*surf.soft)*(1-.07*(Fn/Fnom-1));const muS=surf.slide*lug*(1+.22*pfac*surf.soft);
    if(wh.water>.3)mu*=.9;
    const Ck=9,Ca=7;const den=Math.max(Math.abs(vx),1.5);
    let Fx,Fy;
    if(this.hold&&!wh.disabled&&!wh.lifted){
     // low-speed sticky anchor holds on slopes without creep
     if(!wh.anchor)wh.anchor=cpt.slice();
     const dA=sub(cpt,wh.anchor);const ka=Math.min(3.2e5,Fn*14),ca=Math.min(4e4,Fn*2.2);
     Fx=-(ka*dot(dA,t)+ca*vx);Fy=-(ka*dot(dA,l)+ca*vy);
     const lim=mu*Fn,mag=Math.hypot(Fx,Fy);if(mag>lim){wh.anchor=null;Fx*=lim/mag;Fy*=lim/mag;}
     wh.omega=0;wh.slip=0;wh.slipAngle=0;
    }else{
     wh.anchor=null;
     // spin DOF, implicit against the linearised longitudinal force
     const I=300;const kap=(wh.omega*Rw-vx)/den;const F0=Ck*Fn*kap;const D=Ck*Fn*Rw/den;// dFx/domega
     const roll=(surf.roll*(1+.6*pfac*(1-surf.soft))+wh.sink*.35)*Fn*Rw*Math.tanh(wh.omega*3);
     let Tm=0,Tmax=wh.disabled||this.engine.stalled?0:Math.min(38000,1.25*mu*Fn*Rw+2500);
     // engine power shared by the six hub motors caps motoring torque (braking is hydrostatic and free)
     const Tpow=(this.engine.Pavail??8e5)/6/Math.max(Math.abs(wh.omega),1.5);
     const wT=wh.targetOmega||0;const Kp=14000;
     // unsaturated implicit solution with P control
     let om=(I*wh.omega+DT*(Kp*wT-Rw*(F0-D*wh.omega)-roll))/(I+DT*(Rw*D+Kp));Tm=Kp*(wT-om);
     const motoring=Tm*(wh.omega||wh.targetOmega||1)>0,Tlim=motoring?Math.min(Tmax,Tpow):Tmax;
     if(Math.abs(Tm)>Tlim){Tm=Math.sign(Tm)*Tlim;om=(I*wh.omega+DT*(Tm-Rw*(F0-D*wh.omega)-roll))/(I+DT*Rw*D);}
     // traction control trims torque on excessive slip
     const kn=(om*Rw-vx)/den;if(Math.abs(kn)>.15&&this.ctl.assist){const s=.15/Math.abs(kn);Tm*=s;om=(I*wh.omega+DT*(Tm-Rw*(F0-D*wh.omega)-roll))/(I+DT*Rw*D);}
     wh.omega=om;wh.torque=Tm;drivePower+=Math.max(0,Tm*om);
     const kap2=(om*Rw-vx)/den;Fx=Ck*Fn*kap2;Fy=-Ca*Fn*Math.atan2(vy,den);
     const mag=Math.hypot(Fx,Fy),lim=mu*Fn;
     if(mag>lim){const rho=mag/lim,me=mix(mu,muS,clamp((rho-1)/2.5,0,1))*Fn;Fx*=me/mag;Fy*=me/mag;}
     wh.slip=kap2;wh.slipAngle=Math.atan2(vy,den);
    }
    wh.spin+=wh.omega*DT;
    tf=add(add(scl(cn,Fn),scl(t,Fx)),scl(l,Fy));
    wh.fx=Fx;wh.fy=Fy;
   }else{wh.deflection=0;wh.anchor=null;const I=300;const wT=wh.targetOmega||0;wh.omega+=clamp((wT-wh.omega)*8,-20,20)*DT;wh.spin+=wh.omega*DT;wh.fx=wh.fy=0;}
   wh.load=Fn;wh.cp=cpt;wh.cn=cn;
   // ---- unsprung DOF along the strut, implicit
   const mU=620,cnU=dot(cn,up);
   const Fs=this.strutForce(wh,wh.e,wh.ev);
   const aMu=dot(this.acc,up);
   const tu=dot(tf,up);
   const f0=mU*aMu-tu+mU*G*up[1]+Fs;
   const Ks=this.gasStiffness(wh,wh.e)+(wh.e<0||wh.e>GEOM.stroke?9e5:0),Kt=pen>0?mix(260e3,620e3,(wh.pressure-.8)/1.7)*cnU*cnU:0;
   const Cs=this.strutDamping(wh.ev),Ct=pen>0?9000*cnU*cnU:0;
   const Kk=Ks+Kt,Cc=Cs+Ct;
   const evn=(mU*wh.ev+DT*(f0+Cc*wh.ev))/(mU+DT*Cc+DT*DT*Kk);
   wh.ev=evn;wh.e+=DT*evn;if(wh.e<-.08){wh.e=-.08;wh.ev=Math.max(0,wh.ev);}if(wh.e>GEOM.stroke+.08){wh.e=GEOM.stroke+.08;wh.ev=Math.min(0,wh.ev);}
   const Fs2=this.strutForce(wh,wh.e,wh.ev);wh.strut=Fs2;
   // body: strut force at the mount, tyre force components across the strut at the contact
   applyAt(scl(up,Fs2),M);
   if(pen>0){const perp=sub(tf,scl(up,tu));applyAt(perp,cpt);}
  }
  // ---- hull contacts
  this.hullContacts(R,o,applyAt);
  // ---- obstacles
  this.obstacleContacts(R,o,applyAt);
  // ---- water
  this.waterForces(R,o,applyAt);
  // ---- aerodynamic drag (small)
  {const v=this.vel,sp=len(v);if(sp>.1){const k=.5*1.2*1.1*18;applyAt(scl(v,-k*sp),this.pos);}}
  // ---- integrate
  const a=scl(F,1/this.mass);
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
 panic(){const x=this.lastSafe?.[0]??0,z=this.lastSafe?.[1]??0;for(const wh of this.wheels){wh.e=1.2;wh.ev=0;wh.omega=0;wh.eset=1.35;}this.place(x,z,this.lastSafe?.[2]??0);this.say('Recovered from a numerical fault',3);}
 strutForce(wh,e,ev){
  let F=this.gasForce(wh,e);
  if(e<0)F+=9e5*(-e)+3e4*Math.max(0,-ev);
  if(e>GEOM.stroke)F-=9e5*(e-GEOM.stroke)+3e4*Math.max(0,ev);
  F-=this.dampC1*ev+this.dampC2*ev*Math.abs(ev);
  return F;
 }
 strutDamping(ev){return this.dampC1+2*this.dampC2*Math.abs(ev);}
 hullPoints(){
  if(this._hp)return this._hp;const P=[];
  for(const z of [-4.8,-3,-1,1,3,4.8])for(const x of [-.9,0,.9])P.push([x,GEOM.belly+.05+Math.abs(x)*.25,z]);
  P.push([0,4.2,-5.4],[0,4.2,5.4],[-1.3,4.4,-4.6],[1.3,4.4,-4.6],[-1.3,4.4,4.6],[1.3,4.4,4.6]);
  for(const z of [-5,0,5])for(const x of [-1.3,1.3])P.push([x,6.45,z]);
  for(const z of GEOM.stations)for(const x of [-GEOM.halfTrack,GEOM.halfTrack])P.push([x,GEOM.plateY+.2,z]);// strut tops (rollover)
  for(const z of GEOM.stations)for(const x of [-2.6,2.6])P.push([x,6.3,z]);
  return this._hp=P;
 }
 hullContacts(R,o,applyAt){
  let hit=0;
  for(const pb of this.hullPoints()){
   const pw=add(o,mv(R,pb)),g=this.env.ground(pw[0],pw[2],pw[1]);if(pw[1]>=g)continue;
   const d=g-pw[1],n=this.env.normal(pw[0],pw[2]),v=this.pointVel(pw),vn=dot(v,n);
   let Fn=4.5e5*d-3.5e4*vn;if(Fn<0)continue;Fn=Math.min(Fn,this.mass*(Math.max(0,-vn)+Math.min(d,.3)*3)/DT/8,1.2e6);
   const vt=sub(v,scl(n,vn)),vtl=len(vt);let f=scl(n,Fn);
   if(vtl>1e-3){const fr=Math.min(.55*Fn,vtl*6e4);f=sub(f,scl(vt,fr/vtl));}
   applyAt(f,pw);hit=Math.max(hit,Math.abs(vn));
  }
  if(hit>2.2&&this.t-(this._lastHull||0)>.4){this._lastHull=this.t;const dmg=Math.min(18,(hit-2.2)*6);this.hull=Math.max(0,this.hull-dmg);this.impacts++;this.events.push({type:'impact',strength:hit});}
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
  const list=this.env.obstacles?this.env.obstacles(this.pos[0],this.pos[2],14):null;this.brush=0;if(!list||!list.length)return;
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
      applyAt([nx*Fn+tx*fr,0,nz*Fn+tz*fr],s.p);if(vn<-2.2&&this.t-(this._lastHit||0)>1){this._lastHit=this.t;this.hull=Math.max(0,this.hull-Math.min(12,(-vn-2.2)*3));this.impacts++;this.events.push({type:'impact',strength:-vn,ob});}}
    }else if(ob.type==='box'){
     const c=Math.cos(ob.rot),sn=Math.sin(ob.rot),lx=(s.p[0]-ob.x)*c-(s.p[2]-ob.z)*sn,lz=(s.p[0]-ob.x)*sn+(s.p[2]-ob.z)*c;
     if(s.p[1]>ob.y+ob.h+s.r||s.p[1]<ob.y-1)continue;
     const qx=clamp(lx,-ob.w/2,ob.w/2),qz=clamp(lz,-ob.d/2,ob.d/2),dx=lx-qx,dz=lz-qz,d=Math.hypot(dx,dz);
     let nlx,nlz,pen;
     if(d>1e-4){if(d>=s.r)continue;nlx=dx/d;nlz=dz/d;pen=s.r-d;}else{// centre inside: push out the nearest face
      const ex=ob.w/2-Math.abs(lx),ez=ob.d/2-Math.abs(lz);if(ex<ez){nlx=Math.sign(lx)||1;nlz=0;pen=ex+s.r;}else{nlx=0;nlz=Math.sign(lz)||1;pen=ez+s.r;}}
     const nx=nlx*c+nlz*sn,nz=-nlx*sn+nlz*c,v=this.pointVel(s.p),vn=v[0]*nx+v[2]*nz;
     let Fn=2.4e6*pen-6e4*vn;if(Fn<0)continue;Fn=Math.min(Fn,this.mass*(Math.max(0,-vn)+Math.min(pen,.3)*3)/DT/6);applyAt([nx*Fn,0,nz*Fn],s.p);
     if(vn<-2.2&&this.t-(this._lastHit||0)>1){this._lastHit=this.t;this.hull=Math.max(0,this.hull-Math.min(14,(-vn-2.2)*3.5));this.impacts++;this.events.push({type:'impact',strength:-vn,ob});}
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
   const buoy=RHO*G*vol*.28;applyAt([0,buoy,0],wh.hub);
   // drag relative to current: side area of the tyre, frontal area of the leg
   const v=this.pointVel(wh.hub),rel=[v[0]-w.fx,0,v[2]-w.fz],rs=Math.hypot(rel[0],rel[2]);
   if(rs>.01){const R_=this.R,right=[R_[0],R_[3],R_[6]],side=Math.abs((rel[0]*right[0]+rel[2]*right[2])/rs);const A=mix(GEOM.tireWidth*2*GEOM.R+.3,Math.PI*GEOM.R*GEOM.R*.9,side)*areaFrac;const f=.5*RHO*.32*A*rs;applyAt([-rel[0]*f,0,-rel[2]*f],wh.hub);}/* edge-on tyre and slender leg: low drag head-on */
  }
  // cabin: buoyancy of the sealed lower hull and drag
  const cabinPts=[-4,-2,0,2,4];let wet=0;
  for(const z of cabinPts){const pw=add(o,mv(R,[0,GEOM.cabinY,z+this.carriage]));const w=env.water(pw[0],pw[2],wtmp);if(!w.kind)continue;
   const depth=w.level-(pw[1]-GEOM.cabinR);if(depth<=0)continue;const f=clamp(depth/(2*GEOM.cabinR),0,1);wet=Math.max(wet,depth);
   const vol=2.1*3*1.6*f*.8;applyAt([0,RHO*G*vol*.55,0],pw);
   const v=this.pointVel(pw),rel=[v[0]-w.fx,v[1]*0,v[2]-w.fz],rs=Math.hypot(rel[0],rel[2]);if(rs>.01){const k=.5*RHO*1.0*(2.1*Math.min(3.2,depth))*rs;applyAt([-rel[0]*k,0,-rel[2]*k],pw);}
   // vertical damping in water
   applyAt([0,-v[1]*6000*f,0],pw);
  }
  // cabin floor at body y 2.75, air intake at 5.05 behind the passengers
  const floorW=add(o,mv(R,[0,2.75,this.carriage])),fw=env.water(floorW[0],floorW[2],wtmp);this.flooded=fw.kind?Math.max(0,fw.level-floorW[1]):0;
  const intake=add(o,mv(R,[0,5.05,4.6+this.carriage])),iw=env.water(intake[0],intake[2],wtmp);
  if(iw.kind&&iw.level>intake[1]&&!this.engine.stalled){this.engine.stalled=true;this.engine.stallTimer=6;this.say('Engine stalled: water in the air intake',5);this.events.push({type:'stall'});}
  this.wading=deepest;this.maxWade=Math.max(this.maxWade||0,deepest);
 }
 // ---------------------------------------------------------------- controller (60 Hz)
 say(m,t=2.5){this.message=m;this.messageT=t;}
 control(dt=1/60){
  const c=this.ctl,R=qmat(this.q),o=this.origin(R),env=this.env;
  const fwd=[-R[2],-R[5],-R[8]],right=[R[0],R[3],R[6]],up=[R[1],R[4],R[7]];
  const hf=norm([fwd[0],0,fwd[2]]),hr=[-hf[2],0,hf[0]];
  const vfwd=dot(this.vel,hf),speed=Math.hypot(this.vel[0],this.vel[2]);
  if(this.messageT>0){this.messageT-=dt;if(this.messageT<=0)this.message='';}
  // ---- surfaces, water under each wheel (cached at 60 Hz)
  for(const wh of this.wheels){const h=wh.hub;wh.surface=env.surface(h[0],h[2]);
   const soft=wh.surface.soft||0,Fnom=this.totalMass*G/6;const target=wh.contact?soft*.16*clamp(wh.load/Fnom,0,2.5)*Math.sqrt(1.6/wh.pressure):0;wh.sink=mix(wh.sink,target,1-Math.exp(-dt*1.6));}
  // ---- suspension mode
  const latAcc=Math.abs(dot(this.acc,hr));
  const rollRate=Math.abs(dot(this.w,hf))+Math.abs(dot(this.w,hr))*.5;this._rr=mix(this._rr||0,rollRate,.1);
  this.suspMode=c.suspension==='auto'?(speed>6||latAcc>1.4||this._rr>.18||(this.water>1500&&speed>4)?'firm':'soft'):c.suspension;
  this.Vn=this.suspMode==='soft'?.006:.0025;
  const kGas=GAMMA*PN*PISTON*PISTON/this.Vn;this.kGas=kGas;
  this.dampC1=this.suspMode==='soft'?8000:12500;this.dampC2=this.suspMode==='soft'?3200:4600;
  // ---- CTIS
  const pTarget=PRESSURES[c.tire];let hiss=0;for(const wh of this.wheels){const d=pTarget-wh.pressure;if(Math.abs(d)>.005){wh.pressure+=clamp(d,-.35*dt,.28*dt);hiss=1;}}this.hiss=hiss;
  const safe=c.tire==="soft"?35/3.6:c.tire==="terrain"?70/3.6:105/3.6;this.safeSpeed=safe;
  // ---- engine
  const E=this.engine;
  if(E.stalled){E.stallTimer-=dt;E.rpm=mix(E.rpm,0,1-Math.exp(-dt*3));if(E.stallTimer<=0){const intake=add(o,mv(R,[0,5.05,4.6+this.carriage])),iw=env.water?env.water(intake[0],intake[2],{}):{};if(!iw.kind||iw.level<intake[1]-.2){E.stalled=false;this.say('Engine restarted',2);}else E.stallTimer=2;}}
  // ---- steering: speed-sensitive lock, slew-limited, exact middle angle
  // speed-sensitive lock: keep the steady-state lateral acceleration near 3.5 m/s^2 (a tall machine)
  const lock=Math.min(GEOM.maxLock,Math.max(1.5*Math.PI/180,Math.atan(GEOM.wheelbase*3.5/Math.max(1e-3,speed*speed))));
  const dTarget=clamp(c.steer,-1,1)*lock;
  this.steer[0]+=clamp(dTarget-this.steer[0],-25*Math.PI/180*dt,25*Math.PI/180*dt);
  this.steer[1]=Math.atan(Math.tan(this.steer[0])/2);this.steer[2]=0;
  // ---- longitudinal command (hydrostatic: release = controlled stop)
  let vt=c.throttle*c.limit;if(c.brake)vt=0;
  if(this.climbState&&this.climbState.cap!==undefined)vt=clamp(vt,-this.climbState.cap,this.climbState.cap);
  // terrain preview: cap speed so the vertical acceleration over the ground ahead stays tolerable
  if(c.assist&&Math.abs(vt)>2.5){const dir=vt>0?1:-1;let kmax=0,hazard=1e9;const hx0=[-hf[2],0,hf[0]];
   for(const lat of [-GEOM.halfTrack,0,GEOM.halfTrack]){let prevG=null,prevH=null,g0=null;const dMax=Math.max(24,Math.abs(vfwd)*3.2);for(let d=4;d<=dMax;d+=6){const x=this.pos[0]+hf[0]*d*dir+hx0[0]*lat,z=this.pos[2]+hf[2]*d*dir+hx0[2]*lat,h=env.ground(x,z,1e9);if(prevH!==null){const g=(h-prevH)/6;if(prevG!==null)kmax=Math.max(kmax,Math.abs(g-prevG)/6);prevG=g;if(g0===null)g0=g;if(Math.abs(h-prevH)>1.9&&Math.abs(g)>.7&&Math.abs(g-g0)>.45&&d-6<hazard)hazard=d-6;}prevH=h;}
    let hp=null,gp0=null;for(let d=2;d<=dMax;d+=3){const x=this.pos[0]+hf[0]*d*dir+hx0[0]*lat,z=this.pos[2]+hf[2]*d*dir+hx0[2]*lat,h=env.ground(x,z,1e9);if(hp!==null){const g=(h-hp)/3;if(gp0===null)gp0=g;if(Math.abs(h-hp)>1.9&&Math.abs(g)>.9&&Math.abs(g-gp0)>.45&&d-3<hazard)hazard=d-3;}hp=h;}}
   /* a cliff or wall ahead (a sharp break in grade, more than ~1.9 m within 6 m): arrive slowly enough to stop or to start a climb */
   if(hazard<1e9){const vh=Math.max(1.2,Math.sqrt(2*3.5*Math.max(0,hazard-7)));if(Math.abs(vt)>vh)vt=Math.sign(vt)*vh;this.hazardAhead=hazard;}else this.hazardAhead=null;
   const vcap=Math.max(4,Math.sqrt(8/Math.max(kmax,1e-3)));/* 2.4 m of travel soaks most of it */this.previewCap=vcap;if(Math.abs(vt)>vcap){vt=Math.sign(vt)*vcap;if(this.t-(this._pmsg||0)>6&&vcap<c.limit*.6){this._pmsg=this.t;this.say('Rough ground ahead: assist is easing off',2);}}}else this.previewCap=null;
  if(this.dropWarn&&vt>0)vt=Math.min(vt,.9);
  // side-slope governor: slow down as the roll the levelling cannot remove and the tip margin say the slope is getting serious
  if(c.assist){const r=Math.abs(this.roll||0),tm=this.tipMargin??9;let cap=1e9;if(r>8)cap=Math.min(cap,Math.max(2.5,16-(r-8)*1.3));if(tm<3.2)cap=Math.min(cap,Math.max(2,(tm-1.1)*7));if(Math.abs(vt)>cap){vt=Math.sign(vt)*cap;if(cap<6&&this.t-(this._sideMsg||0)>6){this._sideMsg=this.t;this.say('Side slope: holding speed down',2);}}}
  // anti-flip: the drive is strong enough to walk up a wall; ease off as the nose climbs and the tip margin shrinks
  if(c.assist&&!this.climbState&&(this.probeRise||0)>GEOM.stroke-.23&&(this.probeSteep||0)>1.1&&vt>0){vt=Math.min(vt,.4);}/* a wall beyond reach: do not power into it */
  if(c.assist&&!this.climbState){const p=(this.pitch||0)*Math.sign(vt||0);if(p>16&&(this.tipMargin??9)<3.2){const k=clamp(((this.tipMargin??9)-1.2)/2,0,1)*clamp((30-p)/14,0,1);vt*=k;if(Math.abs(this.vcmd)>Math.abs(vt))this.vcmd=vt;if(k<.6&&this.t-(this._flipMsg||0)>5){this._flipMsg=this.t;this.say('Too steep: easing off before she goes over backwards',2.5);}}}
  if(E.stalled)vt=0;
  const accel=c.brake||(this.hazardAhead!=null&&Math.abs(vt)<Math.abs(this.vcmd))?5.5:(Math.abs(vt)>Math.abs(this.vcmd)&&Math.sign(vt||1)===Math.sign(this.vcmd||vt||1)?3.6:3.2);
  this.vcmd+=clamp(vt-this.vcmd,-accel*dt,accel*dt);
  this.hold=Math.abs(this.vcmd)<.03&&Math.abs(vt)<.01&&speed<.6;
  // speed loop integral (hydrostatic drive tracks the commanded ground speed)
  if(this.hold||Math.abs(this.vcmd)<.1)this.vInt=0;else this.vInt=clamp((this.vInt||0)+(this.vcmd-vfwd)*dt*1.2,-1.5,1.5);
  const vEff=this.vcmd+(this.vInt||0);
  // per-wheel target spin from the rear-axle turning centre
  const tf=Math.tan(this.steer[0]),Rc=Math.abs(tf)>1e-4?GEOM.wheelbase/tf:1e9;// turning centre at x=-Rc (left positive steer)
  const zr=GEOM.stations[2],dRef=Math.hypot(Rc,zr);
  for(const wh of this.wheels){const hb=this.hubBody(wh);const di=Math.hypot(hb[0]+Rc,hb[2]-zr);wh.targetOmega=wh.lifted||wh.disabled?0:vEff*(Math.abs(Rc)>1e8?1:di/dRef)/GEOM.R;}
  // power limit: scale targets if the demanded power exceeds the engine
  const Pmax=950e3*clamp(E.rpm/1800,.3,1)-(E.pump||0);
  E.Pavail=Math.max(6e4,Pmax);
  // ---- active suspension: ground under each tyre, terrain plane, levelling
  const wheels=this.wheels,active=wheels.map(w=>!w.lifted&&!w.disabled);
  const gH=[],hx=[],hz=[];
  for(const wh of wheels){const hb=this.hubBody(wh),rel=mv(R,[hb[0],0,hb[2]]);hx.push(dot(rel,hr));hz.push(dot(rel,hf));gH.push(env.ground(wh.hub[0],wh.hub[2],wh.hub[1])-wh.sink);}
  // least squares plane g = a*x + b*z + c over supported wheels
  const fit=(vals,mask)=>{let n=0,sx=0,sz=0,sg=0,sxx=0,szz=0,sxz=0,sxg=0,szg=0;for(let i=0;i<6;i++){if(!mask[i])continue;n++;sx+=hx[i];sz+=hz[i];sg+=vals[i];sxx+=hx[i]*hx[i];szz+=hz[i]*hz[i];sxz+=hx[i]*hz[i];sxg+=hx[i]*vals[i];szg+=hz[i]*vals[i];}
   const M=[sxx,sxz,sx,sxz,szz,sz,sx,sz,n];const iM=inv3(M);const r=mv(iM,[sxg,szg,sg]);return {a:r[0],b:r[1],c:r[2]};};
  const all=[1,1,1,1,1,1];const tp=fit(gH,all);
  // requested ride height
  let sReq=c.retraction;if(this.climbState)sReq=0;
  // wade assist: look ahead for water and raise the cabin so the belly clears it (clearance 1.7 m lowered, 3.8 m raised)
  if(c.assist){let dW=0;const wt2=this._wt2||(this._wt2={}),dir=vfwd>=0?1:-1;for(const d of [0,6,12,18,26]){const x=this.pos[0]+hf[0]*d*dir,z=this.pos[2]+hf[2]*d*dir,w=env.water?env.water(x,z,wt2):null;if(w&&w.kind){const g=env.ground(x,z,1e9);dW=Math.max(dW,w.level-g);}}
   this.wadeAhead=dW;if(dW>.4){const need=dW+.45,sMax=clamp(1-(need-1.7)/2.1,0,1);if(sReq>sMax){sReq=sMax;if(this.t-(this._wadeMsg||0)>8){this._wadeMsg=this.t;this.say(`Water ${dW.toFixed(1)} m deep ahead: raising the cabin`,2.5);}}}}
  // kinematic lateral acceleration (speed x yaw rate): no feedback from body sway
  const latK=clamp(vfwd*this.w[1]/G,-.5,.5);this.latG=latK;
  // rollover guard: static margin from the CoM to the edge of the full six-tyre support polygon
  {const rxA=[],rzA=[],all6=[];for(let i=0;i<6;i++){const q=wheels[i].contact?wheels[i].cp:sub(wheels[i].hub,[0,GEOM.R,0]),rr=sub(q,this.pos);rxA.push(dot(rr,hr));rzA.push(dot(rr,hf));if(active[i])all6.push(i);}this.tipMargin=supportMargin(rxA,rzA,all6);}
  if(c.assist&&this.tipMargin<2.6&&!this.climbState){sReq=clamp(sReq+(2.6-this.tipMargin)*.6,0,1);if(this.tipMargin<.9&&this.t-(this._tipMsg||0)>4){this._tipMsg=this.t;this.say('Rollover risk: lowering the cabin',2.5);}}
  const eNom=GEOM.stroke*(1-sReq);
  // body attitude target: level fraction f by bisection so every leg stays within stroke
  const margin=this.climbState||sReq<.04?.06:.16,lo=margin,hi=GEOM.stroke-margin;
  const tanOf=v=>v/Math.sqrt(Math.max(1e-6,1-v*v));
  const aB=tanOf(right[1]),bB=tanOf(fwd[1]),upY=Math.max(.3,up[1]);
  const eTouch=wheels.map((wh,i)=>wh.e+(wh.hub[1]-(gH[i]+GEOM.R-.035))/upY);this.eTouch=eTouch;
  // feedforward from the terrain: e_i = hubTop - (g_i + R) + a*x_i + b*z_i + y0, plus lean and the
  // attitude integrator; the level fraction f is the largest that keeps all of it inside the stroke
  const lean=c.assist?clamp(latK*.3,-.087,.087):0;
  const need=f=>gH.map((g,i)=>GEOM.hubTop-(g+GEOM.R-.035)+((1-f)*tp.a+lean+this.integ[1])*hx[i]+((1-f)*tp.b+this.integ[2])*hz[i]);
  const feasible=f=>{const e=need(f);let mx=-1e9,mn=1e9;for(let i=0;i<6;i++)if(active[i]){mx=Math.max(mx,e[i]);mn=Math.min(mn,e[i]);}return mx-mn<=hi-lo-.06;};
  let f=0;if(c.assist){if(feasible(1))f=1;else{let a=0,b=1;for(let k=0;k<12;k++){const m=(a+b)/2;if(feasible(m))a=m;else b=m;}f=a;}}
  this.levelFraction=f;
  const aT=(1-f)*tp.a+lean,bT=(1-f)*tp.b;this.targetSlopes=[aT,bT];
  // attitude integrator closes the loop on the measured body tilt (compliance, deflection, sinkage)
  const sat=wheels.some((w,i)=>active[i]&&(w.e>GEOM.stroke-.12||w.e<.1));
  if(c.assist&&!sat&&(!this.hold||Math.abs(aT-aB)+Math.abs(bT-bB)>.02)){this.integ[1]=clamp(this.integ[1]+(aT-aB)*dt*.7,-.12,.12);this.integ[2]=clamp(this.integ[2]+(bT-bB)*dt*.7,-.12,.12);}
  if(!c.assist){this.integ[1]*=.98;this.integ[2]*=.98;}
  const eRaw=need(f);
  let mean=0,na=0,mx=-1e9,mn=1e9;for(let i=0;i<6;i++)if(active[i]){mean+=eRaw[i];na++;mx=Math.max(mx,eRaw[i]);mn=Math.min(mn,eRaw[i]);}mean/=na||1;
  let shift=eNom-mean;if(mx+shift>hi)shift=hi-mx;if(mn+shift<lo)shift=Math.max(lo-mn,Math.min(shift,hi-mx));
  const eGoal=eRaw.map(v=>clamp(v+shift,-.05,GEOM.stroke+.05));
  // coordinated slew: every leg covers the same fraction of its move per step, bounded by the
  // slew rate and by the pump flow the extending legs would need
  if(!this.eTs)this.eTs=wheels.map(w=>w.e);
  const Qmax0=.015*clamp(E.rpm/1500,.6,1);
  let maxD=0,extSum=0;for(let i=0;i<6;i++){if(!active[i])continue;const d=eGoal[i]-this.eTs[i];maxD=Math.max(maxD,Math.abs(d));if(d>0)extSum+=d;}
  let alpha=1;const slew=speed>2?.9:.35;if(maxD>slew*dt)alpha=slew*dt/maxD;if(extSum*alpha*PISTON>Qmax0*dt*.9)alpha=Math.min(alpha,Qmax0*dt*.9/(extSum*PISTON));
  const Fnom6=this.totalMass*G/6;
  const eT=eGoal.map((g,i)=>{const wh=wheels[i];if(!active[i]){this.eTs[i]=wh.e;return wh.e;}
   let v=this.eTs[i]+(g-this.eTs[i])*alpha;
   // a supporting tyre that has gone light reaches for the ground instead of hanging
   // (not when the tyre is light because the Spider is starting to tip: reaching down would push it over)
   if(c.assist&&wh.load<.25*Fnom6&&v<eTouch[i]+.03&&(this.tipMargin??9)>(this.climbState?.6:1.6))v=Math.min(eTouch[i]+.03,v+1.2*dt);
   this.eTs[i]=v;return v;});
  // ---- load allocation: minimum-variance loads satisfying force and moment balance about the CoM
  const W=this.totalMass*G*Math.max(.3,1+dot(this.acc,[0,1,0])/G*.0);
  const comH=[0,0];// CoM horizontal is at 0 in hr/hf coords relative to pos
  const rx=[],rz=[];for(let i=0;i<6;i++){const p=wheels[i].contact?wheels[i].cp:wheels[i].hub;const rr=sub(p,this.pos);// project along gravity
   rx.push(dot(rr,hr));rz.push(dot(rr,hf));}
  const idx=[];for(let i=0;i<6;i++)if(active[i]&&wheels[i].contact)idx.push(i);const anyLift=wheels.some(w=>w.lifted);// lifted legs are already out of the allocation (not active)
  const Ft=new Array(6).fill(0);
  if(idx.length>=3){const n=idx.length,Fb=W/n;// A = [1;rx;rz], b=[W,0,0]
   let S=[0,0,0,0,0,0,0,0,0],r0=[0,0,0];
   for(const i of idx){const a=[1,rx[i],rz[i]];for(let p=0;p<3;p++)for(let q=0;q<3;q++)S[p*3+q]+=a[p]*a[q];r0[0]+=Fb;r0[1]+=Fb*rx[i];r0[2]+=Fb*rz[i];}
   const res=[W-r0[0],0-r0[1],0-r0[2]],lam=mv(inv3(S),res);
   for(const i of idx)Ft[i]=Math.max(W*.02,Fb+lam[0]+lam[1]*rx[i]+lam[2]*rz[i]);
   this.allocOK=true;
  }else{for(let i=0;i<6;i++)if(active[i])Ft[i]=W/Math.max(1,active.filter(Boolean).length);this.allocOK=false;}
  // support polygon margin (for the HUD and the climb logic)
  this.supportMargin=supportMargin(rx,rz,idx);
  {let cz=0,n=0;for(const i of idx){cz+=rz[i];n++;}this.supportCentroid=n>=4?-cz/n:undefined;}// body-z offset of the support centroid from the CoM
  // ---- heave integral on the supporting legs' extension error, and setpoint synthesis
  const cm=wheels.map((w,i)=>active[i]&&w.contact);let he=0,hn=0;for(let i=0;i<6;i++)if(cm[i]){he+=eT[i]-wheels[i].e;hn++;}
  const nearStop=wheels.some((w,i)=>cm[i]&&(w.e>GEOM.stroke-.1||w.e<.08));
  if(hn&&!(nearStop&&Math.sign(he)===Math.sign(this.integ[0]||he)))this.integ[0]=clamp(this.integ[0]+he/hn*dt*1.2,-.25,.25);
  let pumpDemand=0;const newSet=[];
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
    const ff=this.esetFor(Fuse-620*G,eT[i]);
    const modal=this.integ[0];
    const loadTrim=0;
    const vUp=this.pointVel(wh.mount)[1],vDb=Math.sign(vUp)*Math.max(0,Math.abs(vUp)-.04);const sky=c.assist?clamp(-vDb*.45,-.35,.35):0;
    target=ff+modal+loadTrim+sky;
    // keep each strut's loaded equilibrium off its end stops
    const Fl=Math.max(wh.load-620*G,.6*Fnom6);target=clamp(target,this.esetFor(Fl,.08),this.esetFor(Fl,GEOM.stroke-.08));
    if(!c.assist)target=this.esetFor(W/6-620*G,eNom)+this.integ[0]*.5;
   }
   newSet.push(clamp(target,-.3,GEOM.stroke+.5));// accumulator setpoint headroom above the stroke for loaded legs
  }
  // pump budget: extension under load costs flow; retraction is fast
  const Qmax=.015*clamp(E.rpm/1500,.6,1);
  let ext=0;for(let i=0;i<6;i++){const d=newSet[i]-wheels[i].eset;if(d>0)ext+=d;}
  const cap=Qmax*dt/PISTON;const s=ext>cap?cap/ext:1;
  for(let i=0;i<6;i++){const wh=wheels[i],d=newSet[i]-wh.eset;wh.liftT=wh.lifted?(wh.liftT||0)+dt:0;const unload=wh.liftT>0&&wh.liftT<3&&wh.load>.12*this.totalMass*G/6;// hand the load over gently, then snatch the tyre up
   const dd=d>0?Math.min(d*s,1.0*dt):Math.max(d,-(unload?.22:1.2)*dt);wh.eset+=dd;if(d>0)pumpDemand+=dd*PISTON/dt;wh.valve=Math.sign(dd);}
  // levelling corrections chatter up and down; the accumulators absorb that, so the pump (and the engine)
  // only see the smoothed flow, and small trims are carried by the accumulators alone
  E.pumpSm=(E.pumpSm||0)+(pumpDemand-(E.pumpSm||0))*(1-Math.exp(-dt/.8));
  E.pumpFlow=E.pumpSm;E.pump=E.pumpSm*9e6;
  // engine rpm (a big turbo diesel: 600 idle, 2100 governed): set by the drive demand; hydraulics add a little
  const drive=clamp((E.drivePower||0)/950e3,0,1),pumpF=clamp((E.pumpSm-.2*Qmax)/(.8*Qmax),0,1);
  // a climb puts the engine in work mode (high idle) so the pump has full flow for the load transfers
  const rpmT=E.stalled?0:Math.max(this.climbState?1400:0,600+1500*Math.max(drive*1.1,pumpF*.3,Math.abs(this.vcmd)/28*.7));
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
  if(up[1]<.5&&!this.overturned){this.overturned=true;this.say('Overturned. Use Recover to crane the Spider upright.',8);this.events.push({type:'overturn'});}
  if(!this.overturned&&speed<1&&tilt<8&&this.t-(this._safeT||0)>2){this._safeT=this.t;this.lastSafe=[this.pos[0],this.pos[2],this.heading()];}
  // warnings
  if(speed>safe+1&&c.tire!=='road'&&!this.message)this.say(`Tyre pressure ${wheels[0].pressure.toFixed(1)} bar: keep under ${Math.round(safe*3.6)} km/h`,1.2);
  if(this.flooded>.05&&this.t-(this._floodMsg||0)>4){this._floodMsg=this.t;this.say('Water at the cabin floor',2.5);}
  // pair lift requests from the driver
  for(let p=0;p<3;p++){const want=c.lift[p];for(const k of [0,1]){const wh=wheels[p*2+k];if(want&&!wh.lifted&&!this.climbState){if(this.canLift(p,rx,rz)){wh.lifted=true;wh.liftE=.1;}else if(k===0){c.lift[p]=false;this.say(`Lifting the ${['front','middle','rear'][p]} pair would tip the Spider`,2.5);}}else if(!want&&wh.lifted&&!this.climbState&&!wh.disabled){wh.lifted=false;}}}
 }
 canLift(p,rx,rz){const idx=[];for(let i=0;i<6;i++)if((i>>1)!==p&&!this.wheels[i].disabled&&!this.wheels[i].lifted)idx.push(i);return supportMargin(rx,rz,idx)>.35;}
 updateCarriage(dt){
  // load optimisation: trim the cabin carriage so the CoM sits over the centroid of the supporting tyres
  let target=this.carriageTarget;
  if(this.ctl.carriageManual!=null)target=this.ctl.carriageManual;
  else if(this.supportCentroid!==undefined&&this.ctl.assist){const mm=this.items.filter(it=>it.moves).reduce((a,it)=>a+it.m,0);target=clamp(this.carriage+this.supportCentroid*this.mass/mm*.5,-GEOM.carriageMax,GEOM.carriageMax);}
  else if(!this.ctl.assist)target=0;
  if(this.climbState?.carriage!==undefined)target=this.climbState.carriage;
  // disabled legs: move the cabin toward the remaining supports
  const dis=this.wheels.map(w=>w.disabled);if(dis[0]||dis[1])target=GEOM.carriageMax;else if(dis[4]||dis[5])target=-GEOM.carriageMax;
  this.carriageTarget=clamp(target,-GEOM.carriageMax,GEOM.carriageMax);
  const d=this.carriageTarget-this.carriage;if(Math.abs(d)>1e-4){this.carriage+=clamp(d,-.5*dt,.5*dt);this.recomputeMass();}
 }
 // Step climbing: crawl -> (carriage shift) -> lift pair -> advance -> place -> next pair.
 climbLogic(dt,R,o,hf,gH,vfwd){
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
  const reach=GEOM.stroke-.28;
  if(!this.climbState){
   if(drop>reach+.15&&steep>1&&c.throttle!==0){this.dropWarn=true;if(this.t-(this._dropMsg||0)>3){this._dropMsg=this.t;this.say(`Drop of ${drop.toFixed(1)} m ahead exceeds leg reach`,2.5);}}
   if(rise>.72*kR&&steep>1.1&&Math.abs(this.roll||0)<12&&c.throttle!==0&&Math.abs(vfwd)<2.5&&wheels.filter(w=>w.contact).length>=5){
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
 recover(x,z,yaw){this.hull=Math.max(this.hull,25);for(const wh of this.wheels){wh.e=1.2;wh.eset=1.35;wh.ev=0;wh.omega=0;wh.sink=0;}this.climbState=null;this.engine.stalled=false;this.place(x,z,yaw);this.say('Craned upright on clear ground',3);}
 disableLeg(i){const wh=this.wheels[i];if(wh.disabled)return;wh.disabled=true;wh.lifted=true;this.say(`${['Front','Middle','Rear'][wh.pair]} ${wh.side<0?'left':'right'} leg disabled: carriage compensating`,4);this.events.push({type:'leg',i});}
 setVariant(v){this.variant=v;this.water=VARIANTS[v].tank;this.crewCount=VARIANTS[v].crew;this.recomputeMass();}
 attitude(){return {roll:this.roll||0,pitch:this.pitch||0};}
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
