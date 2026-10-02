// Scenarios: open country, wildfire, swiftwater rescue, forward pursuit, hostile crossing.
import * as T from 'three';
import {Fire} from './fire.mjs';
import {shared} from './materials.mjs';
import {mergeNonIndexed} from './scenery.mjs';
import {clamp,mix,rng,hash2,smoothstep} from './noise.mjs';
import {GEOM} from './physics.mjs';

export const MISSIONS=[
 {id:'free',name:'Open Country',tag:'Free roam over the whole watershed',variant:'scout',time:null,weather:null,
  brief:'Six kilometres of generated country: a trunk river crossing from the high range to the basin, creeks and dry gullies, mesas with cliff bands, forests, cornfields and towns joined by graded roads. Nothing to accomplish except the ones the land offers.',
  kit:'Scout variant · crew of six · sensor turret and floodlight bank · discoveries tracked on the panel'},
 {id:'fire',name:'Wildfire',tag:'Crew to the anchor, hikers out, back to the black',variant:'fire',time:15.4,weather:'smoke',
  brief:'A wind-driven fire is running through the scrub toward a trailhead. Put the hand crew on the anchor point, reach the hikers before the front does, and bring everyone back to a safety zone. The roof tank carries 3.5 tonnes: it raises the centre of mass. Knock fire down with the monitor (hold F); refill by lowering the intake into a lake or river (retract fully, hold R).',
  kit:'Fire support variant · 3,500 L roof tank · monitor · crew of six'},
 {id:'rescue',name:'Swiftwater rescue',tag:'Rivers in flood, three casualties, one helipad',variant:'rescue',time:10,weather:'rain',
  brief:'Rivers are a metre above normal and running fast. Three calls: someone stranded on a gravel bar mid-channel, a fallen climber at the foot of a cliff band, a motorist cut off by a washed-out bridge. Beacon fixes are approximate until you are close. At each, stop, retract fully and hold still to open the hatch. Deliver them to the field hospital helipad. Drive smoothly: the comfort meter is watching.',
  kit:'Rescue variant · litter · light bar · crew of four'},
 {id:'pursuit',name:'Forward pursuit',tag:'Shadow a fleeing truck across country',variant:'scout',time:17.2,weather:'haze',
  brief:'A truck is running the road network toward the edge of the map. Roads wind; you do not have to. Keep it in sensor view, get ahead of it to the overwatch before it reaches the checkpoint, and hold the track until the interdiction team stops it. Go over and around, not through.',
  kit:'Scout variant · electro-optical mast · crew of six'},
 {id:'crossing',name:'Hostile crossing',tag:'Eight troops across the valley at dusk',variant:'troop',time:18.35,weather:'clear',
  brief:'Carry eight troops from the staging area across the river valley to a landing zone on high ground, then get out. Observation posts watch from the ridges and a patrol truck works the road. They see what stands tall, moves fast, raises dust or shows lights: retract to lower the silhouette, use the forest and the folds of the land. If a post fixes you, it calls fire.',
  kit:'Troop carrier variant · armour panels · eight troops · lights off (L)'},
];

// ------------------------------------------------------------------ small props
function colored(geo,color){const g=geo.index?geo.toNonIndexed():geo;const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(a,3));return g;}
const propMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.7});
function person(vest=0xff7a1a,pose='stand'){const P=[];const a=(g,p,c,r)=>{if(r)g.rotateX(r[0]).rotateZ(r[2]||0);g.translate(...p);P.push(colored(g,c));};
 a(new T.CylinderGeometry(.18,.16,.62,8),[0,1.18,0],vest);a(new T.SphereGeometry(.12,10,8),[0,1.62,0],0xc89f7e);
 for(const s of [-1,1]){a(new T.CylinderGeometry(.07,.06,.8,6),[s*.1,.45,0],0x2d3540);a(new T.CylinderGeometry(.05,.045,.6,6),[s*.26,pose==='wave'&&s>0?1.72:1.15,0],vest,pose==='wave'&&s>0?[0,0,-.3]:[0,0,s*.15]);}
 const m=new T.Mesh(mergeNonIndexed(P),propMat);m.castShadow=true;return m;}
function truck(color=0x5a5f4a){const P=[];const a=(g,p,c)=>{g.translate(...p);P.push(colored(g,c));};
 a(new T.BoxGeometry(2.3,1.9,2),[0,1.75,-2.2],color);a(new T.BoxGeometry(2.4,2.4,4.4),[0,2.1,1.1],0x3d4234);a(new T.BoxGeometry(2.1,.6,.05),[0,2.1,-3.22],0x223040);
 for(const z of [-2.2,1.4,2.5])for(const s of [-1,1])a(new T.CylinderGeometry(.55,.55,.35,12).rotateZ(Math.PI/2),[s*1.1,.55,z],0x151515);
 const m=new T.Mesh(mergeNonIndexed(P),propMat);m.castShadow=true;return m;}
function car(){const P=[];const a=(g,p,c)=>{g.translate(...p);P.push(colored(g,c));};a(new T.BoxGeometry(1.8,.7,4.2),[0,.75,0],0x2a4f7a);a(new T.BoxGeometry(1.6,.6,2.1),[0,1.35,.2],0x2a4f7a);a(new T.BoxGeometry(1.62,.45,2.0),[0,1.35,.2],0x9fb6c4);for(const z of [-1.3,1.3])for(const s of [-1,1])a(new T.CylinderGeometry(.34,.34,.25,10).rotateZ(Math.PI/2),[s*.85,.34,z],0x111111);const m=new T.Mesh(mergeNonIndexed(P),propMat);m.castShadow=true;return m;}
function outpost(){const P=[];const a=(g,p,c)=>{g.translate(...p);P.push(colored(g,c));};for(let k=0;k<10;k++){const ang=k/10*Math.PI*2;a(new T.BoxGeometry(.9,.45,.5).rotateY(-ang),[Math.cos(ang)*2.2,.25+(k%2)*.4,Math.sin(ang)*2.2],0x7d7358);}a(new T.CylinderGeometry(.05,.05,3.5,5),[1.5,1.75,1.5],0x333333);a(new T.BoxGeometry(.8,.5,.02),[1.9,3.2,1.5],0x6b2020);const m=new T.Mesh(mergeNonIndexed(P),propMat);m.castShadow=true;return m;}
class Beacon{
 constructor(scene,x,y,z,color=0xffb040,h=260){this.g=new T.Group();this.g.position.set(x,y,z);
  const col=new T.Mesh(new T.CylinderGeometry(1.1,1.6,h,16,1,true),new T.MeshBasicMaterial({color,transparent:true,opacity:.22,blending:T.AdditiveBlending,depthWrite:false,fog:false,side:T.DoubleSide}));col.position.y=h/2;this.g.add(col);
  const ring=new T.Mesh(new T.RingGeometry(9,10.5,48),new T.MeshBasicMaterial({color,transparent:true,opacity:.6,depthWrite:false,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.4;this.g.add(ring);this.col=col;this.ring=ring;scene.add(this.g);}
 set(x,y,z){this.g.position.set(x,y,z);}
 frame(t,on=true){this.g.visible=on;this.col.material.opacity=.14+.1*Math.sin(t*3);this.ring.scale.setScalar(1+.12*Math.sin(t*2));}
 dispose(scene){scene.remove(this.g);}
}
const DIRS=['N','NE','E','SE','S','SW','W','NW'];
function compass(dx,dz){const a=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;return DIRS[Math.round(a/45)%8];}
const fmtD=d=>d>=1000?`${(d/1000).toFixed(1)} km`:`${Math.round(d)} m`;
const fmtT=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

// ------------------------------------------------------------------ base
class Mission{
 constructor(G,def){this.G=G;this.def=def;this.w=G.world;this.t=G.terrain;this.scene=G.scene;this.time=0;this.q=[];this.meshes=[];this.bList=[];this.finished=false;this.objs=[];this.title=def.name;this.meter='';this.markers=[];this.comfortSum=0;this.comfortN=0;this.r=rng(G.world.seed*13+def.id.length);}
 get sp(){return this.G.spider;}
 add(o){this.scene.add(o);this.meshes.push(o);return o;}
 radio(who,line,delay=0){this.q.push({t:this.time+delay,who,line});}
 place(o,x,z,rot=0){o.position.set(x,this.t.height(x,z),z);o.rotation.y=rot;return o;}
 beacon(x,z,color){const b=new Beacon(this.scene,x,this.t.height(x,z),z,color);this.bList.push(b);return b;}
 status(){return {id:this.def.id,objs:this.objs.map(o=>o.state+':'+o.text),time:this.time,meter:this.meter};}
 hud(){this.G.hud.objectives(this.title,this.objs,this.meter);}
 dist(p){return Math.hypot(this.sp.pos[0]-p[0],this.sp.pos[2]-p[1]);}
 still(){return this.sp.speed()<.35;}
 retracted(v=.8){return this.sp.ctl.retraction>=v-.001;}
 update(dt){
  this.time+=dt;for(const m of this.q.filter(m=>m.t<=this.time)){this.G.hud.radio(m.who,m.line,Math.max(4,m.line.length/14));}this.q=this.q.filter(m=>m.t>this.time);
  const c=this.sp.comfort;if(this.patients){this.comfortSum+=c*dt;this.comfortN+=dt;}
  if(!this.finished){this.tick(dt);if(this.lethal&&this.sp.hull<=0)this.end(false,'The Spider is disabled','Hull integrity reached zero.');/* only combat can disable it */}
  this.hud();
 }
 frame(dt){for(const b of this.bList)b.frame(this.time,b.on!==false);}
 tick(){}
 target(){const o=this.objs.find(o=>o.state==='active');return o?.at||null;}
 bearing(){const p=this.target();if(!p)return '';const dx=p[0]-this.sp.pos[0],dz=p[1]-this.sp.pos[2];return `${this.objs.find(o=>o.state==='active')?.short||'Objective'} ${fmtD(Math.hypot(dx,dz))} ${compass(dx,dz)}`;}
 mapOverlay(ctx,toPx,s,mini){const r=mini?5/s:7/s;for(const m of this.markers){if(m.hidden)continue;ctx.fillStyle=m.color||'#f0b95a';ctx.strokeStyle='#101818';ctx.lineWidth=1.5/s;if(m.circle){ctx.beginPath();ctx.arc(toPx(m.x),toPx(m.z),m.circle/this.w.cell,0,Math.PI*2);ctx.strokeStyle=m.color;ctx.lineWidth=2/s;ctx.stroke();continue;}ctx.beginPath();ctx.arc(toPx(m.x),toPx(m.z),r,0,Math.PI*2);ctx.fill();ctx.stroke();if(!mini&&m.label){ctx.fillStyle='#fff';ctx.font=`${11/s}px system-ui`;ctx.textAlign='left';ctx.fillText(m.label,toPx(m.x)+r*1.6,toPx(m.z)+r*.5);}}}
 end(ok,title,text){if(this.finished)return;this.finished=true;const sp=this.sp;const st={'Time':fmtT(this.time),'Distance':fmtD(sp.distance),'Maximum tilt':`${sp.maxTilt.toFixed(0)}°`,'Hull':`${Math.round(sp.hull)}%`,'Impacts':sp.impacts,...this.extraStats()};this.G.sound.squelch();this.G.sound.music.stinger(ok);setTimeout(()=>this.G.hud.end(title,text,st),1200);this.G.hud.toast(ok?'Mission complete':'Mission failed',3);}
 extraStats(){return {};}
 intensity(){return 0;}// 0..1 drive for the adaptive score
 obstacles(){}
 capHeight(){return -1e9;}
 dispose(){for(const m of this.meshes)this.scene.remove(m);for(const b of this.bList)b.dispose(this.scene);this.G.hud.objectives('',[]);this.G.hud.gauges([]);}
 findSpot(x,z,rad=40){return this.G.findClear?this.G.findClear(x,z):{x,z};}
 // hold-to-complete helper at a location
 hold(key,p,r,need,{retract=.8,label='Hold still'}={}){const inR=this.dist(p)<r;if(inR&&this.still()&&this.retracted(retract)){this[key]=(this[key]||0)+.1;this.G.ladder=true;}else{if(inR&&!this.retracted(retract)&&this.time-(this._hmsg||0)>3){this._hmsg=this.time;this.sp.say(`${label}: retract fully (] key) and stop`,2.5);}this[key]=Math.max(0,(this[key]||0)-.05);}return this[key]>=need;}
}
// ------------------------------------------------------------------ open country
class Free extends Mission{
 start(){const s=this.w.sites.find(s=>s.type==='staging')||this.w.towns[0];const p=this.findSpot(s.x+30,s.z+20);
  this.found=new Set();this.list=[{id:'ford',text:'Ford the main river'},{id:'lookout',text:'Stand on the lookout ridge'},{id:'corn',text:'Run through a cornfield at speed'},{id:'ledge',text:'Walk up a rock step with climb assist'},{id:'gully',text:'Cross a dry gully'},{id:'lake',text:'Wade into a lake'},{id:'high',text:'Reach 600 m of elevation'},{id:'town',text:'Visit every town'}];
  this.towns=new Set();this.cornT=0;this.title='Open country';
  this.radio('Base','Spider, you are free to roam. Country is yours.',1);
  return {x:p.x,z:p.z,yaw:0};}
 tick(dt){const sp=this.sp,t=this.t,f=t.feature(sp.pos[0],sp.pos[2]);const w=t.water(sp.pos[0],sp.pos[2],{});
  const hit=id=>{if(!this.found.has(id)){this.found.add(id);this.G.hud.toast(this.list.find(l=>l.id===id).text,2.5);this.G.sound.squelch();}};
  if(w.kind==='river'&&w.depth>1.2)hit('ford');if(w.kind==='lake'&&w.depth>.8)hit('lake');
  const lk=this.w.sites.find(s=>s.type==='lookout');if(lk&&this.dist([lk.x,lk.z])<70)hit('lookout');
  if(sp.speed()>6&&sp.wheels[2].surface?.name==='Cropland'&&t.field(sp.pos[0],sp.pos[2]).crop===0){this.cornT+=dt;if(this.cornT>6)hit('corn');}else this.cornT=Math.max(0,this.cornT-dt);
  if(sp.message==='Step cleared')hit('ledge');if(f.type==='gully'&&sp.speed()>1)hit('gully');if(t.height(sp.pos[0],sp.pos[2])>600)hit('high');
  if(f.type==='town'){this.towns.add(f.label);if(this.towns.size>=this.w.towns.length)hit('town');}
  this.objs=this.list.map(l=>({text:l.text+(l.id==='town'?` (${this.towns.size}/${this.w.towns.length})`:''),state:this.found.has(l.id)?'done':''}));
  this.meter=`${this.found.size} of ${this.list.length} discoveries`;
  this.markers=[...this.w.sites.map(s=>({x:s.x,z:s.z,label:s.name,color:'#9fd0ff'}))];}
 bearing(){return '';}
}
// ------------------------------------------------------------------ wildfire
class Wildfire extends Mission{
 intensity(){return .35+.55*(this.G.fireNear||0)+(this.G.hurt?.2:0);}
 start(){
  const W=this.w,t=this.t,st=W.sites.find(s=>s.type==='fire-station')||{x:W.towns[0].x,z:W.towns[0].z};
  const wind=W.provinces.wind;const wl=Math.hypot(...wind);this.windDir=[wind[0]/wl,wind[1]/wl];
  // hikers: a trailhead, else a forest or scrub edge 1.2-2.6 km from the station, with fuel country upwind inside the map
  const upOK=(x,z)=>{for(const d of [500,800,1150]){const ux=x-this.windDir[0]*d,uz=z-this.windDir[1]*d;if(!t.inside(ux,uz,120))return false;}const w=t.weights(x-this.windDir[0]*950,z-this.windDir[1]*950,{});return w.forest+w.scrub+(1-w.farm)*.4>.45;};
  let th=W.sites.find(s=>s.type==='trailhead'&&Math.hypot(s.x-st.x,s.z-st.z)>700&&upOK(s.x,s.z));
  if(!th){for(let k=0;k<900;k++){const a=this.r()*6.28,d=1200+this.r()*1400,x=st.x+Math.cos(a)*d,z=st.z+Math.sin(a)*d;if(!t.inside(x,z,200))continue;if(t.water(x,z,{}).kind)continue;const w=t.weights(x,z,{});if(w.forest+w.scrub<.5)continue;if(!upOK(x,z))continue;th={x,z,name:'the ridge trail'};break;}}
  if(!th){for(let k=0;k<900;k++){const x=(this.r()-.5)*5000,z=(this.r()-.5)*5000;if(upOK(x,z)&&!t.water(x,z,{}).kind){th={x,z,name:'the ridge trail'};break;}}}
  if(!th)th={x:st.x+900,z:st.z+600,name:'the ridge trail'};
  this.hikers=[th.x+8,th.z+5];
  // fire grid centred upwind of the hikers; ignition in continuous fuel 800-1200 m upwind, retried until it runs
  const gcx=this.hikers[0]-this.windDir[0]*520,gcz=this.hikers[1]-this.windDir[1]*520;
  this.fire=new Fire(t,gcx,gcz,{wind:this.windDir,windSpeed:6,seed:W.seed});const f0=this.fire;
  const snapshot={state:f0.state.slice(),prog:f0.prog.slice(),burnT:f0.burnT.slice(),I:f0.I.slice(),char:f0.char.slice()};
  let ig=null;
  for(let attempt=0;attempt<8;attempt++){
   let cand=null;for(let k=0;k<200;k++){const d=780+this.r()*420,lat=(this.r()-.5)*(260+attempt*80);const x=this.hikers[0]-this.windDir[0]*d-this.windDir[1]*lat,z=this.hikers[1]-this.windDir[1]*d+this.windDir[0]*lat;const c=f0.idx(x,z);if(c<0||f0.fuel[c]<.45)continue;
    // fuel continuity toward the hikers
    let ok=0;for(let q=1;q<=10;q++){const cc=f0.idx(x+(this.hikers[0]-x)*q/10,z+(this.hikers[1]-z)*q/10);if(cc>=0&&f0.fuel[cc]>.25)ok++;}if(ok>=7){cand=[x,z];break;}}
   if(!cand)cand=[this.hikers[0]-this.windDir[0]*900,this.hikers[1]-this.windDir[1]*900];
   for(const k in snapshot)f0[k].set(snapshot[k]);f0.active=[];f0.burnedArea=0;
   f0.ignite(cand[0],cand[1],28);for(let k=0;k<340;k++){f0.step(.5);if(k>30&&f0.active.length>60)break;}/* only until it has taken hold */
   if(f0.active.length>40){ig=cand;break;}
  }
  if(!ig){// last resort: light a line across the wind 700 m upwind
   const x=this.hikers[0]-this.windDir[0]*700,z=this.hikers[1]-this.windDir[1]*700;for(let q=-6;q<=6;q++)f0.ignite(x-this.windDir[1]*q*25,z+this.windDir[0]*q*25,10);for(let k=0;k<200;k++)f0.step(.5);ig=[x,z];}
  this.ignition=ig;
  t.overlay=(x,z)=>this.fire.at(x,z);this.G.fire=this.fire;
  // anchor point: a road point on the flank (lateral to the wind from the origin), else a lateral point
  const lat=[-this.windDir[1],this.windDir[0]];let anc=null,best=1e9;
  for(const r of W.roads)for(let q=0;q<r.n;q+=4){const x=r.xz[q*2],z=r.xz[q*2+1];const dx=x-ig[0],dz=z-ig[1],along=dx*this.windDir[0]+dz*this.windDir[1],side=Math.abs(dx*lat[0]+dz*lat[1]);if(along<100||along>900||side<350||side>1100)continue;const sc=Math.abs(side-600)-t.height(x,z)*.8;if(sc<best){best=sc;anc=[x,z];}}
  if(!anc)anc=[ig[0]+lat[0]*650+this.windDir[0]*400,ig[1]+lat[1]*650+this.windDir[1]*400];
  this.anchor=anc;this.station=[st.x,st.z];
  // pacing: measure how fast this fire actually runs at the hikers, then set its clock so the front arrives in
  // about 1.5x the time a good run needs (the route at ~29 km/h plus two minutes for the crew drop)
  {const snap={state:f0.state.slice(),prog:f0.prog.slice(),burnT:f0.burnT.slice(),I:f0.I.slice(),char:f0.char.slice(),wet:f0.wet.slice(),moist:f0.moist.slice()},act=f0.active.slice(),ba=f0.burnedArea;
   const d0=f0.eta(this.hikers[0],this.hikers[1]).dist;for(let k=0;k<240;k++)f0.step(.5);const d1=f0.eta(this.hikers[0],this.hikers[1]).dist;
   for(const k in snap)f0[k].set(snap[k]);f0.active=act;f0.burnedArea=ba;f0.upload();
   this.vf=Math.max(.4,(d0-d1)/120);const route=Math.hypot(anc[0]-st.x,anc[1]-st.z)+Math.hypot(this.hikers[0]-anc[0],this.hikers[1]-anc[1]);
   const allow=(route/8+120)*1.5;this.pace=clamp((d0-30)/(this.vf*allow),.15,1);}
  // props
  this.hikerMeshes=[0,1,2].map(k=>this.add(this.place(person(0xe0b030,k===0?'wave':'stand'),this.hikers[0]+k*1.3,this.hikers[1]+(k%2)*1.2)));
  this.bA=this.beacon(anc[0],anc[1],0xffb040);this.bH=this.beacon(this.hikers[0],this.hikers[1],0x6fe0c8);this.bS=this.beacon(st.x,st.z,0x9fe07a);this.bH.on=false;this.bS.on=false;
  this.objs=[{text:'Deliver the hand crew to the anchor point',state:'active',at:anc,short:'Anchor'},{text:`Reach the hikers at ${th.name||'the trailhead'} before the front`,state:'',at:this.hikers,short:'Hikers'},{text:'Return to the safety zone at the fire station',state:'',at:this.station,short:'Safety zone'}];
  this.stage=0;this.waterStart=3500;this.used=0;this.drafted=0;this.knocked=0;
  this.radio('Dispatch','Spider Four, fire is running through the scrub, wind pushing it toward the trailhead. Get the crew to the anchor on the ridge road.',1);
  this.radio('Crew boss','Monitor is charged. Tank is full: watch her on the side slopes.',9);
  const p=this.findSpot(st.x+26,st.z+18);return {x:p.x,z:p.z,yaw:Math.atan2(anc[0]-p.x,-(anc[1]-p.z))};
 }
 get beaconsOn(){return false;}
 tick(dt){
  const sp=this.sp,f=this.fire;
  this.acc=(this.acc||0)+dt;while(this.acc>=.25){f.step(.25*(this.stage<2?this.pace:1));this.acc-=.25;}
  // heat on the vehicle
  const hn=f.burningNear(sp.pos[0],sp.pos[2],28);this.G.fireNear=clamp(1-hn.nearest/120,0,1);
  if(hn.heat>.6){sp.hurtHull(hn.heat*dt*.9);if(this.time-(this._heat||0)>4){this._heat=this.time;sp.say('Radiant heat! Get into the black or back off',2.5);}}
  this.G.hurt=clamp(hn.heat*.4,0,.8);
  // monitor and drafting
  const inp=this.G.input||{};
  if(inp.action&&sp.water>0){const use=Math.min(sp.water,28*dt);sp.water-=use;this.used+=use;this.spraying=true;if(Math.random()<.5)sp.recomputeMass();
   const dir=this.aimDir();this.knocked+=f.douse(sp.pos[0],sp.pos[2],dir[0],dir[1]);}else this.spraying=false;
  if(inp.draft){const w=this.t.water(sp.pos[0],sp.pos[2],{});if(w.kind&&w.depth>.8&&this.retracted(.85)&&this.still()){const add=Math.min(3500-sp.water,70*dt);sp.water+=add;this.drafted+=add;this.drafting=true;sp.recomputeMass();if(sp.water>=3499&&this.time-(this._full||0)>5){this._full=this.time;sp.say('Tank full',2);}}else{this.drafting=false;if(this.time-(this._dm||0)>3){this._dm=this.time;sp.say(w.kind?'Retract fully and stop to lower the intake':'Drafting needs a lake or river at least a metre deep',2.5);}}}else this.drafting=false;
  // hikers' ETA
  const eta=f.eta(this.hikers[0],this.hikers[1]);eta.eta=Math.max(0,eta.dist-30)/(this.vf*this.pace);this.hikerEta=eta;
  if(this.stage<2&&eta.dist<30&&!this.hikersSafe){this.objs[1].state='fail';this.end(false,'The front reached the trailhead','The hikers were caught by the fire before the Spider reached them.');}
  // stages
  if(this.stage===0&&this.hold('hA',this.anchor,16,4,{label:'Crew dismount'})){this.stage=1;this.objs[0].state='done';this.objs[1].state='active';this.bA.on=false;this.bH.on=true;sp.crewCount=2;sp.recomputeMass();this.G.model.setCrew(2,'fire');this.G.ladder=false;this.hA=0;this.radio('Crew boss','Crew is on the ground at the anchor. Go get those hikers.',0);this.radio('Dispatch',`Front is ${fmtD(eta.dist)} from the trailhead.`,6);}
  else if(this.stage===1&&this.hold('hH',this.hikers,14,6,{label:'Boarding'})){this.stage=2;this.hikersSafe=true;this.objs[1].state='done';this.objs[2].state='active';this.bH.on=false;this.bS.on=true;for(const m of this.hikerMeshes)m.visible=false;sp.crewCount=5;sp.recomputeMass();this.G.model.setCrew(5,'fire');this.G.ladder=false;this.radio('Dispatch','Three hikers aboard. Bring them home. The black behind the front is safe ground.',0);}
  else if(this.stage===2){const inBlack=f.at(sp.pos[0],sp.pos[2])?.burn>=1&&f.burningNear(sp.pos[0],sp.pos[2],60).heat<.05;if(this.dist(this.station)<40||inBlack){this.objs[2].state='done';this.end(true,'Everyone is out',inBlack?'You sheltered in the burned black, the textbook safety zone, with the hikers aboard.':'Crew placed, hikers recovered, and the Spider is back at the station.');}}
  if(this.stage<2&&!this.G.ladder)this.G.ladder=false;
  this.meter=`Tank ${Math.round(sp.water)} L${this.drafting?' · drafting':''}${this.spraying?' · spraying':''}${this.stage<2&&f.active.length?` · front to hikers ${fmtD(eta.dist)} (~${fmtT(eta.eta)})`:''}`;
  this.G.hud.gauges([{label:'Water',text:`${Math.round(sp.water)} L`,value:sp.water/3500,color:'#6fb8ff'},{label:'Hull',text:`${Math.round(sp.hull)}%`,value:sp.hull/100,color:sp.hull<40?'#ff6a4f':'#9fe07a'},{label:'Heat',text:hn.heat>.05?'high':'low',value:clamp(hn.heat,0,1),color:'#ff8a3a'}]);
  this.markers=[{x:this.anchor[0],z:this.anchor[1],label:'Anchor',hidden:this.stage>0},{x:this.hikers[0],z:this.hikers[1],label:'Hikers',color:'#6fe0c8',hidden:this.stage>1},{x:this.station[0],z:this.station[1],label:'Safety zone',color:'#9fe07a'}];
 }
 aimDir(){const cam=this.G.camera,d=new T.Vector3();cam.getWorldDirection(d);if(this.G.view!=='seat'&&this.G.view!=='orbit'){const h=this.sp.heading();return [Math.sin(h),-Math.cos(h)];}const l=Math.hypot(d.x,d.z)||1;return [d.x/l,d.z/l];}
 get monitorAim(){if(!this.spraying)return [0,-.1];const d=this.aimDir(),h=this.sp.heading();const rel=Math.atan2(d[0],-d[1])-h;return [-rel,-.15];}
 frame(dt){super.frame(dt);const f=this.fire,fx=this.G.fx,cam=this.G.camera.position;
  // flames, embers and smoke from burning cells near the camera
  const cells=f.sampleBurning(90);let n=0;for(const k of cells){const [x,z]=f.cellXZ(k);const d=Math.hypot(x-cam.x,z-cam.z);if(d>900)continue;const y=this.t.height(x,z);const I=f.I[k];
   if(d<500&&Math.random()<.9){fx.flame(x,y,z,f.kind[k]===3?1.8:1);if(f.kind[k]===3&&Math.random()<.5)fx.flame(x,y+6+Math.random()*6,z,1.4);}if(Math.random()<.25)fx.ember(x,y+2,z);if(Math.random()<.12)fx.smoke(x,y+4,z,1.3,.35);n++;}
  // distant smoke columns
  if(Math.random()<.5){const c=f.sampleBurning(1)[0];if(c!==undefined){const [x,z]=f.cellXZ(c);fx.smoke(x,this.t.height(x,z)+10,z,2.2,.5);}}
  // spray jet from the monitor
  if(this.spraying&&this.G.model.monitor){const m=this.G.model.monitorBarrel;const p=m.localToWorld(new T.Vector3(0,.45,-1.45)),q=m.localToWorld(new T.Vector3(0,.55,-2.4)).sub(p).normalize();fx.spray(p.x,p.y,p.z,q.x,q.y+.08,q.z,26);}
  if(this.drafting&&Math.random()<.6){const s=this.sp;fx.splash(s.pos[0]+1.5,this.t.water(s.pos[0],s.pos[2],{}).level,s.pos[2]+4,0,0,3);}
  // an orange glow light at the nearest burning area
  if(!this.glow){this.glow=new T.PointLight(0xff7a2a,0,220,2);this.scene.add(this.glow);this.meshes.push(this.glow);}
  const hn=f.burningNear(cam.x,cam.z,160);if(cells[0]!==undefined){let best=null,bd=1e9;for(const k of cells){const [x,z]=f.cellXZ(k),d=Math.hypot(x-cam.x,z-cam.z);if(d<bd){bd=d;best=[x,z];}}if(best){this.glow.position.set(best[0],this.t.height(best[0],best[1])+8,best[1]);this.glow.intensity=clamp(1-bd/300,0,1)*900*(.8+.4*Math.random());}}
 }
 extraStats(){return {'Water sprayed':`${Math.round(this.used)} L`,'Water drafted':`${Math.round(this.drafted)} L`,'Cells knocked down':this.knocked,'Area burned':`${(this.fire.burnedArea/1e4).toFixed(1)} ha`};}
 dispose(){super.dispose();this.fire.dispose();this.t.overlay=null;this.G.fire=null;this.G.fireNear=0;this.G.hurt=0;}
}
// ------------------------------------------------------------------ swiftwater rescue
class Rescue extends Mission{
 intensity(){return .32+.14*(this.aboard?.length||0);}
 start(){
  const W=this.w,t=this.t;const hs=W.sites.find(s=>s.type==='hospital')||{x:W.towns[0].x,z:W.towns[0].z};
  this.pad=hs.pad?[hs.pad[0],hs.pad[1]]:[hs.x+28,hs.z];this.boost=1;
  t.floodBoost=this.boost;for(const wk of this.G.scenery.workers)wk.postMessage({type:'flood',boost:this.boost});this.G.scenery.setFlood(this.boost);t.tiles.clear();
  shared.uWetness.value=.55;this.G.fx.rainOn=1;
  const casualties=[];
  // A: gravel bar in a fordable reach of a stream or the river
  {let best=null;for(const c of W.channels){if(c.cls<1)continue;for(let k=Math.floor(c.n*.15);k<c.n*.85;k+=3){const o=k*8,w=c.P[o+3],dep=c.P[o+4]+this.boost;if(w<8||dep>2.4)continue;const x=c.P[o],z=c.P[o+1];if(!t.inside(x,z,250))continue;const d=Math.hypot(x-this.pad[0],z-this.pad[1]);if(d<700||d>3200)continue;const sc=Math.abs(d-1600)+dep*200;if(!best||sc<best.sc)best={x,z,sc,L:c.P[o+2]+this.boost,w,name:c.name};}}
   if(best){this.bar={x:best.x,z:best.z,r:Math.min(7,best.w*.28),top:best.L+.45};casualties.push({kind:'bar',x:best.x,z:best.z,text:`Stranded on a gravel bar in ${best.name||'the stream'}`,short:'Gravel bar'});
    const mound=new T.Mesh(new T.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2),new T.MeshStandardMaterial({color:0x8a8272,roughness:.95}));mound.scale.set(this.bar.r,this.bar.top-(best.L-2.8),this.bar.r);mound.position.set(best.x,best.L-2.8,best.z);mound.receiveShadow=true;this.add(mound);}}
  // B: foot of a cliff band: a flat, reachable spot with a sheer rise close by
  {let best=null;const flat=(x,z)=>{for(const [dx,dz] of [[0,0],[7,0],[-7,0],[0,7],[0,-7]]){const hc=t.height(x+dx,z+dz),hx=t.height(x+dx+2,z+dz)-t.height(x+dx-2,z+dz),hz=t.height(x+dx,z+dz+2)-t.height(x+dx,z+dz-2);if(Math.hypot(hx,hz)/4>.28)return false;}return true;};
   for(let k=0;k<4000&&!(best&&best.sc<-60);k++){const x=(this.r()-.5)*5600,z=(this.r()-.5)*5600;const tp=t.terraceParams(x,z);if(tp.w<.35||tp.H<4.5)continue;const h=t.height(x,z);let up=0,dir=null;for(let a=0;a<12;a++){const dx=Math.cos(a*.524),dz=Math.sin(a*.524);for(const r of [10,15,20]){const h2=t.height(x+dx*r,z+dz*r);if(h2-h>up){up=h2-h;dir=[dx,dz];}}}if(up<6)continue;
    const d=Math.hypot(x-this.pad[0],z-this.pad[1]);if(d<700||d>3800)continue;if(t.water(x,z,{}).kind)continue;if(!flat(x,z))continue;const sc=Math.abs(d-2000)*.05-up*4;if(!best||sc<best.sc)best={x,z,sc};}
   if(best)casualties.push({kind:'cliff',x:best.x,z:best.z,text:'Climber injured at the foot of a cliff band',short:'Cliff foot'});}
  // C: washed-out bridge with a motorist beyond it
  {let best=null;for(const r of W.roads){if(r.kind==='track')continue;r.bridges.forEach((b,bi)=>{if(b.shared)return;const d=Math.hypot(b.x0-this.pad[0],b.z0-this.pad[1]);if(d<600||d>3500)return;const sc=Math.abs(d-1800);if(!best||sc<best.sc)best={r,b,bi,sc};});}
   if(best){const {r,b,bi}=best;this.G.scenery.washOut(r.id,bi);const e0=Math.hypot(b.x0-this.pad[0],b.z0-this.pad[1]),e1=Math.hypot(b.x1-this.pad[0],b.z1-this.pad[1]);const far=e0>e1?b.s0:b.s1,dir=e0>e1?-1:1;const q=clamp(far+dir*7,0,r.n-1);const x=r.xz[q*2],z=r.xz[q*2+1];
    const car_=this.add(this.place(car(),x+1.5,z));car_.rotation.y=Math.atan2(r.xz[Math.min(r.n-1,q+1)*2]-x,r.xz[Math.min(r.n-1,q+1)*2+1]-z);casualties.push({kind:'bridge',x:x+4,z:z+3,text:`Motorist cut off by the washed-out ${b.name} bridge`,short:'Washout'});}}
  if(!casualties.length)casualties.push({kind:'field',x:this.pad[0]+1200,z:this.pad[1]+900,text:'Farmer stranded by floodwater',short:'Farmer'});
  this.cas=casualties.map((c,i)=>{const off=[(this.r()-.5),(this.r()-.5)];const m=this.add(this.place(person(0xff5a2a,'wave'),c.x,c.z));if(c.kind==='bar')m.position.y=this.bar.top;return {...c,i,loaded:false,delivered:false,off,mesh:m,beacon:this.beacon(c.x,c.z,0xff5a2a)};});
  this.padBeacon=this.beacon(this.pad[0],this.pad[1],0x6fe0c8);this.patients=0;this.aboard=[];
  this.radio('Coordination','All units: rivers are a metre over and still rising. Spider Two, three calls for you. Fixes are approximate until you close in.',1);
  this.radio('Coordination','Deliver to the field hospital helipad. Keep it smooth with patients aboard.',10);
  const p=this.findSpot(this.pad[0]+18,this.pad[1]+22);return {x:p.x,z:p.z,yaw:0};
 }
 get beacons(){return true;}
 approx(c){const d=this.dist([c.x,c.z]);const r=clamp(d*.28,18,420);return {x:c.x+c.off[0]*r*1.2,z:c.z+c.off[1]*r*1.2,r};}
 tick(dt){
  const sp=this.sp;
  for(const c of this.cas){if(c.loaded)continue;const a=this.approx(c);c.beacon.set(a.x,this.t.height(a.x,a.z),a.z);c.beacon.on=this.dist([c.x,c.z])>60;
   if(this.hold('h'+c.i,[c.x,c.z],13,7,{label:'Hatch'})){c.loaded=true;c.mesh.visible=false;c.beacon.on=false;this.aboard.push(c);this.patients=this.aboard.length;this.G.ladder=false;this['h'+c.i]=0;this.radio('Medic',{bar:'Got them. Hypothermic but talking.',cliff:'Aboard. Suspected leg fracture: go easy.',bridge:'Motorist is aboard. Shaken, not hurt.',field:'Aboard.'}[c.kind],0);}}
  if(this.aboard.length&&this.hold('hp',this.pad,16,6,{label:'Unload'})){for(const c of this.aboard)c.delivered=true;this.radio('Hospital',`${this.aboard.length} received. Thank you, Spider.`,0);this.aboard=[];this.patients=0;this.hp=0;this.G.ladder=false;}
  if(!this.cas.some(c=>!c.loaded)&&!this.aboard.length&&this.cas.every(c=>c.delivered)){this.end(true,'All casualties delivered',`Three calls answered through a flood. Average patient comfort ${Math.round(this.avgComfort()*100)}%.`);}
  this.G.ladder=this.G.ladder&&this.still();
  this.objs=[...this.cas.map(c=>({text:c.text,state:c.delivered?'done':c.loaded?'active':'',at:c.loaded?this.pad:[this.approx(c).x,this.approx(c).z],short:c.short})),{text:'Deliver to the field hospital helipad',state:this.aboard.length?'active':'',at:this.pad,short:'Helipad'}];
  const nxt=this.aboard.length?this.objs[this.objs.length-1]:this.objs.find(o=>o.state!=='done');if(nxt&&nxt.state!=='active'){for(const o of this.objs)if(o.state==='active')o.state='';nxt.state='active';}
  this.meter=`${this.cas.filter(c=>c.delivered).length}/${this.cas.length} delivered · aboard ${this.aboard.length}`;
  this.G.hud.gauges([{label:'Patient comfort',text:this.patients?`${Math.round(sp.comfort*100)}%`:'—',value:this.patients?sp.comfort:0,color:sp.comfort<.5?'#ff6a4f':'#9fe07a'},{label:'Wading',text:`${(sp.wading||0).toFixed(1)} m`,value:(sp.wading||0)/2.7,color:'#6fb8ff'},{label:'Hull',text:`${Math.round(sp.hull)}%`,value:sp.hull/100}]);
  this.markers=[...this.cas.filter(c=>!c.loaded).map(c=>{const a=this.approx(c);return {x:a.x,z:a.z,circle:a.r,color:'#ff7a4a'};}),...this.cas.filter(c=>!c.loaded).map(c=>{const a=this.approx(c);return {x:a.x,z:a.z,label:c.short,color:'#ff7a4a'};}),{x:this.pad[0],z:this.pad[1],label:'Helipad',color:'#6fe0c8'}];
 }
 avgComfort(){return this.comfortN?this.comfortSum/this.comfortN:1;}
 capHeight(x,z){const b=this.bar;if(!b)return -1e9;const d=Math.hypot(x-b.x,z-b.z);if(d>b.r)return -1e9;return b.top-(d/b.r)**2*(b.top-(b.top-2.2));}
 extraStats(){return {'Patient comfort (avg)':`${Math.round(this.avgComfort()*100)}%`,'Deepest wading':`${(this.sp.maxWade||0).toFixed(1)} m`};}
 dispose(){super.dispose();this.t.floodBoost=0;for(const wk of this.G.scenery.workers)wk.postMessage({type:'flood',boost:0});this.G.scenery.setFlood(0);this.t.tiles.clear();shared.uWetness.value=0;this.G.fx.rainOn=0;}
}
// ------------------------------------------------------------------ route following for trucks
function roadRoute(W,t,from,toward){
 // chain roads through shared endpoints (towns) toward a goal point
 const ends=W.roads.filter(r=>r.kind!=='track').map(r=>({r,a:[r.xz[0],r.xz[1]],b:[r.xz[r.n*2-2],r.xz[r.n*2-1]]}));
 const near=(p,q,d=220)=>Math.hypot(p[0]-q[0],p[1]-q[1])<d;
 // start on the road nearest `from`
 let cur=null,bd=1e9,ci=0;for(const e of ends){for(let q=0;q<e.r.n;q+=3){const d=Math.hypot(e.r.xz[q*2]-from[0],e.r.xz[q*2+1]-from[1]);if(d<bd){bd=d;cur=e;ci=q;}}}
 const pts=[];const used=new Set();let pos=ci,guard=0;
 const goalD=p=>Math.hypot(p[0]-toward[0],p[1]-toward[1]);
 let dir=goalD(cur.a)<goalD(cur.b)?-1:1;
 while(cur&&guard++<12){used.add(cur.r.id);const r=cur.r;for(let q=pos;q>=0&&q<r.n;q+=dir)pts.push([r.xz[q*2],r.xz[q*2+1],r.y[q]]);
  const endP=dir>0?cur.b:cur.a;let nx=null,nb=1e9;for(const e of ends){if(used.has(e.r.id))continue;for(const [p,d0] of [[e.a,1],[e.b,-1]]){if(near(p,endP)){const g=goalD(d0>0?e.b:e.a);if(g<nb){nb=g;nx={e,dir:d0};}}}}
  if(!nx||nb>goalD(endP)+400)break;cur=nx.e;dir=nx.dir;pos=dir>0?0:cur.r.n-1;}
 return pts;
}
class Mover{// a vehicle following a polyline at a speed profile
 constructor(pts,mesh,t){this.pts=pts;this.m=mesh;this.t=t;this.s=0;this.cum=[0];for(let k=1;k<pts.length;k++)this.cum.push(this.cum[k-1]+Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]));this.len=this.cum[this.cum.length-1];this.k=0;this.v=0;}
 at(s){let k=this.k;while(k<this.cum.length-2&&this.cum[k+1]<s)k++;while(k>0&&this.cum[k]>s)k--;this.k=k;const a=this.pts[k],b=this.pts[Math.min(k+1,this.pts.length-1)],seg=(this.cum[k+1]-this.cum[k])||1,u=clamp((s-this.cum[k])/seg,0,1);return {x:mix(a[0],b[0],u),z:mix(a[1],b[1],u),y:mix(a[2],b[2],u),h:Math.atan2(b[0]-a[0],b[1]-a[1])};}
 curvature(s){const p0=this.at(s),p1=this.at(Math.min(this.len,s+25));let d=p1.h-p0.h;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return Math.abs(d)/25;}
 step(dt,vmax){const c=this.curvature(this.s);const target=Math.min(vmax,Math.sqrt(2.2/Math.max(.002,c)));this.v+=clamp(target-this.v,-3*dt,1.8*dt);this.s=Math.min(this.len,this.s+this.v*dt);const p=this.at(this.s);this.m.position.set(p.x,Math.max(p.y,this.t.height(p.x,p.z)),p.z);this.m.rotation.y=p.h;return p;}
}
// line of sight over the terrain with forest attenuation
function los(t,a,b,maxForest=2.2){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],L=Math.hypot(dx,dz);const n=Math.max(4,Math.ceil(L/18));let forest=0;const wt={};for(let k=1;k<n;k++){const u=k/n,x=a[0]+dx*u,z=a[2]+dz*u,y=a[1]+dy*u;const h=t.height(x,z);if(h>y)return 0;if(y-h<18){t.weights(x,z,wt);forest+=wt.forest*(L/n)/60;}}return clamp(1-forest/maxForest,0,1);}
// ------------------------------------------------------------------ forward pursuit
class Pursuit extends Mission{
 intensity(){return !this.seen?.3:.58+(this.stage?.15:0)+clamp(this.lost/40,0,.25);}
 start(){
  const W=this.w,t=this.t;const st=W.sites.find(s=>s.type==='staging')||W.towns[0];
  // the truck starts at the town nearest the staging area and runs toward the farthest map exit
  const exits=W.roads.filter(r=>r.kind==='minor').map(r=>[r.xz[r.n*2-2],r.xz[r.n*2-1]]);
  const town=[...W.towns].sort((a,b)=>Math.hypot(a.x-st.x,a.z-st.z)-Math.hypot(b.x-st.x,b.z-st.z))[0];
  let goal=exits.sort((a,b)=>Math.hypot(b[0]-town.x,b[1]-town.z)-Math.hypot(a[0]-town.x,a[1]-town.z))[0]||[-town.x,-town.z];
  let route=roadRoute(W,t,[town.x,town.z],goal);if(route.length<60){const other=W.towns[W.towns.length-1];route=roadRoute(W,t,[town.x,town.z],[other.x,other.z]);}
  this.truck=this.add(truck());this.mv=new Mover(route,this.truck,t);this.mv.s=Math.min(200,this.mv.len*.05);this.mv.step(0,0);
  // checkpoint at ~62% of the route, overwatch on high ground with a view of it, roadblock at ~88%
  const cp=this.mv.at(this.mv.len*.62);this.cp=[cp.x,cp.z];this.cpS=this.mv.len*.62;this.stopS=this.mv.len*.88;
  let ow=null,best=-1e9;for(let k=0;k<400;k++){const a=this.r()*6.28,d=250+this.r()*600,x=cp.x+Math.cos(a)*d,z=cp.z+Math.sin(a)*d;if(!t.inside(x,z,100))continue;const r=t.roadNear(x,z);if(r&&r.d<80)continue;if(t.water(x,z,{}).kind)continue;const h=t.height(x,z);const v=los(t,[x,h+7,z],[cp.x,t.height(cp.x,cp.z)+2,cp.z]);if(v<.5)continue;const sc=h-t.height(cp.x,cp.z)-Math.abs(d-450)*.05;if(sc>best){best=sc;ow=[x,z];}}
  this.ow=ow||[cp.x+300,cp.z+300];this.block=this.mv.at(this.stopS);
  this.bOW=this.beacon(this.ow[0],this.ow[1],0xffb040);this.bOW.on=false;this.bT=this.beacon(0,0,0xff5a3a);this.bT.on=false;
  const blk=this.add(truck(0x3c4a5a));this.place(blk,this.block.x+4,this.block.z+4,this.block.h+Math.PI/2);
  this.track=0;this.lost=0;this.seen=false;this.stage=0;this.marked=false;
  this.objs=[{text:'Acquire the truck in sensor view',state:'active',short:'Truck'},{text:'Hold track for 150 s',state:''},{text:'Beat the truck to the overwatch and mark it at the checkpoint',state:'',short:'Overwatch',at:this.ow},{text:'Keep eyes on until it is stopped at the roadblock',state:''}];
  this.radio('Command','Spider One, a truck left the town heading for the edge of the map. Find it, stay on it, and get ahead of it.',1);
  const p=this.findSpot(st.x+25,st.z-20);return {x:p.x,z:p.z,yaw:Math.atan2(town.x-p.x,-(town.z-p.z))};
 }
 tick(dt){
  const sp=this.sp,t=this.t;const running=this.stage<4;
  const p=this.mv.step(dt,this.mv.s>this.stopS?0:12);
  if(this.mv.s>=this.stopS-1&&this.stage<3){this.end(false,'The truck got through','It reached the roadblock position before the Spider completed the overwatch mark; the interdiction team was not in place.');return;}
  const tp=[p.x,t.height(p.x,p.z)+2.2,p.z],eye=[sp.pos[0],sp.pos[1]+4.5,sp.pos[2]];const range=Math.hypot(tp[0]-eye[0],tp[2]-eye[2]);
  this._los=(this._los??0);this.losT=(this.losT||0)+dt;if(this.losT>.4){this.losT=0;this._los=range<850?los(t,eye,tp,2.6):0;}
  const vis=this._los>.35;
  if(vis){this.track+=dt;this.lost=0;if(!this.seen){this.seen=true;this.objs[0].state='done';this.objs[1].state='active';this.radio('Sensor','Contact. Truck, moving fast on the road. Track established.',0);}}else if(this.seen){this.lost+=dt;if(this.lost>80&&this.stage<4){this.end(false,'Track lost','The truck was out of sensor view for over a minute.');return;}if(this.lost>20&&this.time-(this._lm||0)>15){this._lm=this.time;this.radio('Command','We have lost your track. Find it again.',0);}}
  if(this.seen&&this.stage===0&&this.track>=150){this.stage=1;this.objs[1].state='done';this.objs[2].state='active';this.bOW.on=true;this.radio('Command','Good track. Now get ahead of it: the overwatch covers its route at the checkpoint.',0);}
  if(this.stage===0&&this.track>=60&&!this.owHint){this.owHint=true;this.bOW.on=true;this.objs[2].state='active';this.radio('Command','Overwatch marked. Be there before it reaches the checkpoint.',0);}
  // overwatch mark: on station, still, truck visible near the checkpoint
  const atOW=this.dist(this.ow)<45&&this.still();
  if(!this.marked&&atOW&&vis&&Math.abs(this.mv.s-this.cpS)<260){this.markT=(this.markT||0)+dt;if(this.markT>3){this.marked=true;this.objs[2].state='done';this.objs[3].state='active';this.bOW.on=false;this.stage=Math.max(this.stage,3);this.radio('Command','Marked at the checkpoint. Interdiction team is moving. Stay on it.',0);}}
  if(!this.marked&&this.mv.s>this.cpS+260){this.objs[2].state='fail';this.end(false,'Too late to the overwatch','The truck passed the checkpoint before it could be marked.');return;}
  if(this.stage===3&&this.mv.v<.3&&this.mv.s>=this.stopS-2){if(vis){this.stage=4;this.objs[3].state='done';this.objs[1].state='done';this.end(true,'Truck stopped','The Spider shadowed it cross-country, beat it to the overwatch and held the track to the roadblock.');}}
  this.bT.set(p.x,t.height(p.x,p.z),p.z);this.bT.on=vis;
  const eta=(this.cpS-this.mv.s)/Math.max(3,this.mv.v);
  this.meter=`Track ${Math.round(this.track)} s · ${vis?'IN VIEW':'no view'} ${fmtD(range)}${this.stage<3?` · truck at checkpoint in ~${fmtT(Math.max(0,eta))}`:''}`;
  this.G.hud.gauges([{label:'Track',text:`${Math.round(Math.min(150,this.track))}/150 s`,value:this.track/150},{label:'Sensor',text:vis?'lock':`lost ${Math.round(this.lost)} s`,value:vis?1:1-this.lost/80,color:vis?'#6fe0c8':'#ff8a3a'}]);
  this.objs[0].at=[p.x,p.z];this.objs[1].at=[p.x,p.z];this.objs[3].at=[p.x,p.z];
  this.markers=[{x:p.x,z:p.z,label:'Truck',color:vis?'#ff5a3a':'#aa6a5a'},{x:this.ow[0],z:this.ow[1],label:'Overwatch',hidden:this.marked},{x:this.cp[0],z:this.cp[1],label:'Checkpoint',color:'#d0d0d0'},{x:this.block.x,z:this.block.z,label:'Roadblock',color:'#9fd0ff'}];
 }
 extraStats(){return {'Track time':`${Math.round(this.track)} s`,'Route length':fmtD(this.mv.len)};}
 bearing(){const p=this.target();if(!p)return '';const dx=p[0]-this.sp.pos[0],dz=p[1]-this.sp.pos[2];return `${this.objs.find(o=>o.state==='active')?.short||'Truck'} ${fmtD(Math.hypot(dx,dz))} ${compass(dx,dz)}`;}
}
// ------------------------------------------------------------------ hostile crossing
class Crossing extends Mission{
 lethal=true;
 intensity(){return .08+.55*(this.threat||0)+(this.barrages?.length?.45:0);}
 start(){
  const W=this.w,t=this.t;const st=W.sites.find(s=>s.type==='staging')||W.towns[0];this.home=[st.x,st.z];
  const trunk=W.channels[W.trunk];const side=(x,z)=>{let bd=1e9,s=0;for(let k=0;k<trunk.n-1;k+=2){const o=k*8,x0=trunk.P[o],z0=trunk.P[o+1],x1=trunk.P[o+16]??trunk.P[o+8],z1=trunk.P[o+17]??trunk.P[o+9];const d=Math.hypot(x-x0,z-z0);if(d<bd){bd=d;s=Math.sign((x-x0)*(z1-z0)-(z-z0)*(x1-x0));}}return s;};
  const s0=side(st.x,st.z);let lz=null,best=-1e9;
  for(let k=0;k<900;k++){const a=this.r()*6.28,d=1800+this.r()*1800,x=st.x+Math.cos(a)*d,z=st.z+Math.sin(a)*d;if(!t.inside(x,z,200))continue;if(side(x,z)===s0)continue;const n=t.normal(x,z);if(n[1]<.94)continue;if(t.water(x,z,{}).kind)continue;const h=t.height(x,z);const w=t.weights(x,z,{});if(w.forest>.4)continue;const sc=h-Math.abs(d-2600)*.05;if(sc>best){best=sc;lz=[x,z];}}
  this.lz=lz||[st.x+2400,st.z+1200];
  // observation posts on commanding ground around the corridor
  const mid=[(st.x+this.lz[0])/2,(st.z+this.lz[1])/2],cd=[this.lz[0]-st.x,this.lz[1]-st.z],cl=Math.hypot(...cd),lat=[-cd[1]/cl,cd[0]/cl];
  const cands=[];for(let k=0;k<700;k++){const u=this.r(),x=st.x+cd[0]*u+lat[0]*(this.r()<.5?-1:1)*(600+this.r()*1500),z=st.z+cd[1]*u+lat[1]*(Math.sign(this.r()-.5))*(600+this.r()*1500);if(!t.inside(x,z,150))continue;if(t.water(x,z,{}).kind)continue;const h=t.height(x,z);cands.push({x,z,h});}
  cands.sort((a,b)=>b.h-a.h);this.ops=[];for(const c of cands){if(this.ops.length>=3)break;if(this.ops.some(o=>Math.hypot(o.x-c.x,o.z-c.z)<800))continue;if(Math.hypot(c.x-st.x,c.z-st.z)<900||Math.hypot(c.x-this.lz[0],c.z-this.lz[1])<700)continue;this.ops.push({...c,meter:0,known:false,mesh:this.add(this.place(outpost(),c.x,c.z))});}
  // patrol truck on the road nearest the corridor midpoint
  let pr=null,pd=1e9;for(const r of W.roads){if(r.kind==='track')continue;for(let q=0;q<r.n;q+=5){const d=Math.hypot(r.xz[q*2]-mid[0],r.xz[q*2+1]-mid[1]);if(d<pd){pd=d;pr={r,q};}}}
  if(pr){const {r,q}=pr,a=Math.max(0,q-180),b=Math.min(r.n-1,q+180);const pts=[];for(let k=a;k<=b;k++)pts.push([r.xz[k*2],r.xz[k*2+1],r.y[k]]);this.patrol=new Mover(pts,this.add(truck(0x4a4436)),t);this.patrolDir=1;}
  this.threat=0;this.barrages=[];this.rounds=0;this.detections=0;this.stage=0;
  this.bLZ=this.beacon(this.lz[0],this.lz[1],0xffb040);this.bHome=this.beacon(st.x,st.z,0x9fe07a);this.bHome.on=false;
  this.objs=[{text:'Carry the troops to the landing zone',state:'active',at:this.lz,short:'LZ'},{text:'Drop the troops: retract and hold',state:'',at:this.lz,short:'LZ'},{text:'Exfil to the staging area',state:'',at:this.home,short:'Staging'}];
  this.radio('Command','Spider Three, eight aboard. LZ is across the valley on the high ground. Posts are on the ridges; they will call fire if they fix you.',1);
  this.radio('Command','Lights off. Low and slow where they can see you, fast in the folds.',9);
  this.troops=[];
  const p=this.findSpot(st.x+20,st.z+25);return {x:p.x,z:p.z,yaw:Math.atan2(this.lz[0]-p.x,-(this.lz[1]-p.z))};
 }
 exposure(from){// how visible the Spider is to an observer
  const sp=this.sp,t=this.t,top=sp.pos[1]+2.2;const g=t.height(sp.pos[0],sp.pos[2]);const range=Math.hypot(from[0]-sp.pos[0],from[2]-sp.pos[2]);if(range>2400)return 0;
  const v=los(t,from,[sp.pos[0],top,sp.pos[2]],2);if(v<=0)return 0;
  const sil=clamp((top-g)/7,.35,1.2),speed=sp.speed(),surf=sp.wheels[2].surface;const dust=surf&&surf.dust>.4&&speed>4?1+surf.dust*speed/10:1;
  const night=this.G.atmo.night||0;const lights=this.G.lights?1+3*night:1;const dark=1-night*.45;
  return v*Math.pow(1-range/2400,1.6)*sil*(1+speed/7)*dust*lights*dark;
 }
 tick(dt){
  const sp=this.sp,t=this.t;
  // patrol drives back and forth
  if(this.patrol){const P=this.patrol;if(P.s>=P.len-1)this.patrolDir=-1;if(P.s<=1)this.patrolDir=1;P.s=clamp(P.s+this.patrolDir*8*dt,0,P.len);const p=P.at(P.s);P.m.position.set(p.x,t.height(p.x,p.z),p.z);P.m.rotation.y=p.h+(this.patrolDir<0?Math.PI:0);}
  let rate=0;
  this.losT=(this.losT||0)+dt;if(this.losT>.5){this.losT=0;this.exp=this.ops.map(o=>this.exposure([o.x,o.h+5,o.z]));if(this.patrol){const p=this.patrol.m.position;const d=Math.hypot(p.x-sp.pos[0],p.z-sp.pos[2]);this.pexp=d<700?this.exposure([p.x,p.y+2.5,p.z])*2.4:0;}}
  (this.exp||[]).forEach((e,i)=>{rate+=e*.08;});rate+=(this.pexp||0)*.08;
  // threat builds while seen and drains quickly once you break line of sight; a fire mission needs 30 s to relay
  this.threat=clamp(this.threat+rate*.75*dt-(rate<.004?.06*dt:0),0,1);
  if(this.wasFixed&&this.threat<.2&&!this.barrages.length){this.wasFixed=false;this.radio('Intercept','Their net has gone quiet. They have lost you.',0);}
  if(this.threat>=1&&!this.barrages.length&&this.time>(this.relayUntil||0)){this.detections++;this.wasFixed=true;this.relayUntil=this.time+30;const lead=10+this.r()*4;this.barrages.push({t:this.time+lead,pos:[sp.pos[0]+sp.vel[0]*lead*.5,sp.pos[2]+sp.vel[2]*lead*.5],n:3+Math.floor(this.r()*4),fired:0});this.threat=.3;this.radio('Intercept','They have you. Fire mission called on your position. Move!',0);this.G.sound.squelch();}
  for(const b of this.barrages){if(this.time<b.t)continue;if(b.fired<b.n&&this.time>=b.t+b.fired*1.7){if(b.fired===0)this.G.sound.whistle();const a=this.r()*6.28,d=20+this.r()*45,x=b.pos[0]+Math.cos(a)*d,z=b.pos[1]+Math.sin(a)*d;this.impact(x,z);b.fired++;}}
  this.barrages=this.barrages.filter(b=>b.fired<b.n);
  // stages
  if(this.stage===0&&this.dist(this.lz)<45){this.stage=1;this.objs[0].state='done';this.objs[1].state='active';this.radio('Troop lead','LZ. Get her down and hold.',0);}
  if(this.stage===1&&this.hold('hd',this.lz,48,5,{label:'Dismount'})){this.stage=2;this.objs[1].state='done';this.objs[2].state='active';sp.crewCount=2;sp.recomputeMass();this.G.model.setCrew(2,'troop');this.G.ladder=false;this.dismount();this.bLZ.on=false;this.bHome.on=true;this.radio('Troop lead','Team is off. Go.',0);}
  if(this.stage===2&&this.dist(this.home)<60){this.objs[2].state='done';this.end(true,'Crossing complete',`Eight troops delivered and the Spider is home. ${this.detections?`Fixed ${this.detections} time${this.detections>1?'s':''} by the posts.`:'Never fixed by the posts.'}`);}
  for(const tr of this.troops){tr.t+=dt;const k=Math.min(1,tr.t/6);tr.m.position.x=mix(tr.a[0],tr.b[0],k);tr.m.position.z=mix(tr.a[1],tr.b[1],k);tr.m.position.y=t.height(tr.m.position.x,tr.m.position.z);if(tr.t>14)tr.m.visible=false;}
  this.meter=`Threat ${Math.round(this.threat*100)}%${this.barrages.length?(this.barrages[0].t>this.time?` · INCOMING ${Math.ceil(this.barrages[0].t-this.time)} s: leave the circle`:' · IMPACTS'):''} · ${this.ops.filter(o=>o.known).length}/${this.ops.length} posts spotted`;
  this.ops.forEach((o,i)=>{if(!o.known&&this.dist([o.x,o.z])<900&&los(t,[sp.pos[0],sp.pos[1]+4.5,sp.pos[2]],[o.x,o.h+2,o.z])>.4){o.known=true;this.radio('Sensor','Observation post spotted on the ridge.',0);}});
  this.G.hud.gauges([{label:'Threat',text:`${Math.round(this.threat*100)}%`,value:this.threat,color:this.threat>.7?'#ff6a4f':'#f0b95a'},{label:'Silhouette',text:`${Math.round((1-sp.ctl.retraction)*100)}%`,value:1-sp.ctl.retraction*.7,color:'#b9c6c2'},{label:'Hull',text:`${Math.round(sp.hull)}%`,value:sp.hull/100,color:sp.hull<40?'#ff6a4f':'#9fe07a'}]);
  this.markers=[{x:this.lz[0],z:this.lz[1],label:'LZ',hidden:this.stage>=2},{x:this.home[0],z:this.home[1],label:'Staging',color:'#9fe07a'},...this.ops.filter(o=>o.known).map(o=>({x:o.x,z:o.z,label:'Post',color:'#ff5a3a'})),...this.barrages.map(b=>({x:b.pos[0],z:b.pos[1],circle:60,color:'#ff3a2a'}))];
 }
 impact(x,z){const t=this.t,y=t.height(x,z),sp=this.sp;this.G.fx.blast(x,y,z);const d=Math.hypot(x-sp.pos[0],z-sp.pos[2]);this.G.sound.boom(d);this.G.shake=Math.min(1.5,(this.G.shake||0)+clamp(1-d/300,0,1)*1.2);this.rounds++;
  // crater decal
  const cr=new T.Mesh(new T.CircleGeometry(3.5+Math.random()*2,20),new T.MeshStandardMaterial({color:0x1d1a16,roughness:1,transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4}));cr.rotation.x=-Math.PI/2;cr.position.set(x,y+.08,z);this.add(cr);
  if(d<28){const k=1-d/28;sp.hurtHull(k*30);const dir=[(sp.pos[0]-x)/(d||1),(sp.pos[2]-z)/(d||1)];sp.vel[0]+=dir[0]*k*2.5;sp.vel[2]+=dir[1]*k*2.5;sp.vel[1]+=k*1.5;
   if(d<16&&this.r()<.5){const legs=sp.wheels.map((w,i)=>({i,d:Math.hypot(w.hub[0]-x,w.hub[2]-z)})).filter(l=>!sp.wheels[l.i].disabled).sort((a,b)=>a.d-b.d);if(legs[0])sp.disableLeg(legs[0].i);}}}
 dismount(){const sp=this.sp;for(let k=0;k<8;k++){const m=this.add(person(0x55603f,'stand'));const a=k/8*6.28;const ax=sp.pos[0]+Math.cos(a)*2,az=sp.pos[2]+Math.sin(a)*2;m.position.set(ax,this.t.height(ax,az),az);this.troops.push({m,t:0,a:[ax,az],b:[ax+Math.cos(a)*30,az+Math.sin(a)*30]});}}
 extraStats(){return {'Detections':this.detections,'Rounds fired at you':this.rounds,'Legs lost':this.sp.wheels.filter(w=>w.disabled).length};}
}
const CLASSES={free:Free,fire:Wildfire,rescue:Rescue,pursuit:Pursuit,crossing:Crossing};
export function createMission(id,G){const def=MISSIONS.find(m=>m.id===id)||MISSIONS[0];const m=new CLASSES[def.id](G,def);return m;}
