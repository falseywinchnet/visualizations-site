// Combined-slip tire forces and wheel spin. SI units; no renderer or world state.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const TIRE=Object.freeze({inertia:300,longitudinal:10,cornering:9.5,minSlipSpeed:1.5});

// Radial compliance is softer than the reinforced sidewall. Progressive carcass
// stiffness prevents a soft tread from collapsing under load. These are concept
// parameters, not a fit to measured data for an existing tire.
export function tireRadialStiffness(pressure){return 110e3+210e3*clamp((pressure-.8)/1.7,0,1);}
export function tireNormalResponse({pressure,penetration,speed,sidewall=0,crossStrut=0,mass=820},out={}){
 if(penetration<=0){out.force=out.stiffness=out.damping=0;return out;}
 const side=clamp(sidewall*sidewall,0,1),radial=tireRadialStiffness(pressure),k=radial+(620e3-radial)*side;
 const p=penetration/.35;
 let spring=k*penetration*(1+p*p),stiffness=k*(1+3*p*p);
 // Damping follows tire stiffness and unsprung mass, not gravity. Scaling it
 // with sqrt(g) while leaving the carcass unchanged underdamps off-world tires.
 let damping=.8*Math.sqrt(mass*k)+9e4*crossStrut*crossStrut;
 if(penetration>.45){const crush=penetration-.45;spring+=2.5e6*crush;stiffness+=2.5e6;
  // Engage the rim cushion continuously; switching a large damper on at one
  // depth creates an impact force jump precisely when the tire is overloaded.
  damping+=1.5e5*clamp(crush/.12,0,1);}
 const force=spring+damping*speed;
 out.force=clamp(force,0,8e5);out.stiffness=force>0&&force<8e5?stiffness:0;out.damping=force>0&&force<8e5?damping:0;
 return out;
}

// Preserve the existing lug/pressure model, including load sensitivity in BOTH
// peak and sliding grip. An overloaded tire must not gain grip by sliding.
export function tireGrip(surface,pressure,load,nominalLoad){
 const p=clamp((2.5-pressure)/1.7,0,1),soft=surface.soft||0;
 const scale=(1.2+.35*p*soft)*(1+.22*p*soft)*clamp(1-.07*(load/nominalLoad-1),.55,1.1);
 const peak=Math.max(0,surface.mu*scale);
 return {peak,slide:clamp(surface.slide*scale,0,peak)};
}

// The two forces share one friction budget. Positive slip drives the vehicle;
// force on the sliding contact always opposes its velocity relative to ground.
export function tireForces(omega,{radius,vx,vy,load,mu,muSlide,grip=1},out={}){
 const den=Math.max(Math.abs(vx),TIRE.minSlipSpeed);
 const slip=(omega*radius-vx)/den,angle=Math.atan2(vy,den);
 let fx=TIRE.longitudinal*Math.max(0,load)*slip,fy=-TIRE.cornering*Math.max(0,load)*angle;
 const mag=Math.hypot(fx,fy),peak=Math.max(0,mu*load);
 if(peak===0){fx=fy=0;}
 else if(mag>peak){const slide=clamp(muSlide,0,mu),blend=clamp((mag/peak-1)/2.5,0,1);
  const scale=(mu+(slide-mu)*blend)*load/mag;fx*=scale;fy*=scale;}
 out.fx=fx*grip;out.fy=fy*grip;out.slip=slip;out.slipAngle=angle;return out;
}

// Backward Euler: I*(omega1-omega0)/dt = motor(omega1)-R*Fx(omega1)-rolling.
// Solve with the SAME combined-slip force returned to the chassis. Clipping Fx
// after solving spin instead silently removes angular impulse during cornering.
// A bounded scalar solve is used only when the closed-form linear result fails.
export function stepWheel(p,out={}){
 const {omega,dt,radius,vx,load,mu,grip=1,target=0,gain=0,integral=0,torqueLimit=0,rolling=0,inertia=TIRE.inertia}=p;
 const k=TIRE.longitudinal*Math.max(0,load)/Math.max(Math.abs(vx),TIRE.minSlipSpeed)*grip;
 const evaluate=w=>{
  tireForces(w,p,out);out.omega=w;
  out.torque=clamp(gain*(target-w)+integral,-torqueLimit,torqueLimit);
  return inertia*(w-omega)-dt*(out.torque-radius*out.fx-rolling);
 };
 let w=(inertia*omega+dt*(gain*target+integral+radius*k*vx-rolling))/(inertia+dt*(radius*radius*k+gain));
 let residual=evaluate(w);
 if(Math.abs(residual)<1e-8)return out;
 const centre=omega-dt*rolling/inertia;
 const span=dt*(torqueLimit+radius*Math.max(0,mu*load)*grip)/inertia+1e-9;
 let lo=centre-span,hi=centre+span;
 if(w>lo&&w<hi){if(residual>0)hi=w;else lo=w;}
 for(let i=0;i<48;i++){
  w=(lo+hi)*.5;residual=evaluate(w);
  if(Math.abs(residual)<1e-8)break;
  if(residual>0)hi=w;else lo=w;
 }
 return out;
}
