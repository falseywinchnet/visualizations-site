// Spider drive: wiring and main loop.
import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GENERATOR_VERSION} from './drive/worldgen.mjs';
import {loadWorld,saveWorld} from './drive/world-cache.mjs';
import {Birds} from './drive/birds.mjs';
import {Terrain} from './drive/terrain.mjs';
import {Spider,DT,GEOM,PRESSURES,setBody as setPhysicsBody} from './drive/physics.mjs';
import {terrainTextures,waterNormals,shared,setBodyLayers} from './drive/materials.mjs';
import {BODIES,bodyOf} from './drive/bodies.mjs';
import {Scenery} from './drive/scenery.mjs';
import {Vegetation,pushers} from './drive/vegetation-render.mjs';
import {SpiderModel} from './drive/vehicle.mjs';
import {Atmosphere} from './drive/sky.mjs';
import {Post} from './drive/post.mjs';
import {WorldMap} from './drive/map.mjs';
import {FX} from './drive/fx.mjs';
import {Sound} from './drive/audio.mjs';
import {MISSIONS,missionsFor,createMission} from './drive/missions.mjs';
import {clamp,mix,smoothstep} from './drive/noise.mjs';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#world'),body=document.body;
const params=new URLSearchParams(location.search);
// per-viewer convenience only; storage can be unavailable
function store(k,v){try{localStorage.setItem('spider-'+k,String(v));}catch{}}
function recall(k){try{return localStorage.getItem('spider-'+k);}catch{return null;}}
const G={state:'loading',paused:false,view:'chase',quality:'medium',mission:null,missionDef:null,seed:+(params.get('seed')||711),body:BODIES[params.get('world')]?params.get('world'):'earth',time:16.5,weather:'clear',volume:.7,music:.55,lights:false,frame:0,debug:params.has('debug')};
G.B=bodyOf(G.body);G.missions=missionsFor(G.B);G.missionDef=G.missions[0];
G.tires=params.get('tires')==='compliant'?'compliant':'standard';
{const m=recall('music');if(m!==null&&isFinite(+m))G.music=+m;}
// ------------------------------------------------------------------ renderer
let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',logarithmicDepthBuffer:true,stencil:false});}
catch(e){$('#gen-stage').textContent='This browser could not start WebGL 2. The Spider idea is illustrated at paymenottowork.com/ideas/spider.';throw e;}
const autoQ=()=>{const mob=/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)||matchMedia('(pointer:coarse)').matches;return mob?'low':(navigator.hardwareConcurrency||4)>=8?'high':'medium';};
G.quality=params.get('quality')||autoQ();
G.units=(()=>{try{return localStorage.getItem('spider-units')||'metric';}catch{return 'metric';}})();
renderer.setPixelRatio(Math.min(devicePixelRatio,G.quality==='high'?1.75:G.quality==='low'?1:1.4));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene();
const camera=new T.PerspectiveCamera(52,1,.2,60000);
const orbit=new OrbitControls(camera,canvas);orbit.enabled=false;orbit.enableDamping=true;orbit.minDistance=8;orbit.maxDistance=160;orbit.maxPolarAngle=Math.PI*.49;
// ------------------------------------------------------------------ loading: generate or restore the world
const genCanvas=$('#gen'),genCtx=genCanvas.getContext('2d');
$('#gen-seed').textContent=G.seed;$('#seed-label').textContent=G.seed;$('#body-label').textContent=G.B.name;
if(G.body!=='earth'){$('#gen-note').innerHTML={moon:'Crater field <span id="gen-seed"></span> is being laid down on the mare.',mars:'Lava plain <span id="gen-seed"></span> is being laid down under the scarp.',titan:'Sand sea <span id="gen-seed"></span> is being blown into dunes.'}[G.body]+' This happens once; the result is kept in your browser.';$('#gen-seed').textContent=G.seed;$('#gen-stage').textContent='Setting down on '+G.B.name;}
function drawPreview(d){const img=new ImageData(new Uint8ClampedArray(d.data),d.w,d.h);if(genCanvas.width!==d.w){genCanvas.width=d.w;genCanvas.height=d.h;}genCtx.putImageData(img,0,0);}
async function getWorld(seed){
 const cached=await loadWorld(seed,G.body);if(cached&&cached.version===GENERATOR_VERSION&&(cached.body||'earth')===G.body){$('#gen-stage').textContent='Country restored';$('#gen-bar').style.width='100%';return cached;}
 return new Promise((res,rej)=>{const w=new Worker(new URL('./drive/worldgen-worker.mjs',import.meta.url),{type:'module'});
  w.onmessage=e=>{const m=e.data;if(m.type==='preview')drawPreview(m);else if(m.type==='progress'){$('#gen-stage').textContent=m.stage;$('#gen-bar').style.width=(m.p*100).toFixed(0)+'%';}else if(m.type==='done'){w.terminate();saveWorld(m.world);res(m.world);}else if(m.type==='error'){rej(new Error(m.message));}};
  w.onerror=e=>rej(e);w.postMessage({seed,body:G.body});});
}
// ------------------------------------------------------------------ world-dependent systems (created after generation)
let world,terrain,scenery,veg,model,spider,atmo,post,wmap,fx,sound,workers,texArr,wNormals,birds;
const env={
 ground:(x,z,y)=>{let h=terrain.groundHeight(x,z,y);const c=veg?veg.capHeight(x,z):-1e9;if(c>h)h=c;if(G.mission){const m=G.mission.capHeight(x,z);if(m>h)h=m;}return h;},
 normal:(x,z)=>terrain.normal(x,z),
 surface:(x,z)=>terrain.surface(x,z),
 water:(x,z,o)=>terrain.water(x,z,o),
 obstacles:(x,z,r)=>{const L=veg.obstacles(x,z,r,env._ob||(env._ob=[]));for(const b of buildingBoxes)if(Math.abs(b.x-x)<r+14&&Math.abs(b.z-z)<r+14)L.push(b);if(G.mission?.obstacles)G.mission.obstacles(x,z,r,L);return L;},
 onBreak:(ob,dx,dz)=>{const p=veg.breakTree(ob,dx,dz);fx.leaves(p.x,p.y,p.z,26);sound.crack(Math.min(1,ob.r*6));},
};
let buildingBoxes=[];
canvas.addEventListener('webglcontextlost',()=>{G.ctxLost=(G.ctxLost||0)+1;console.warn('WebGL context lost');});canvas.addEventListener('webglcontextrestored',()=>{console.warn('WebGL context restored');if(spider)spider.say('Graphics device was reset by the browser; carrying on',4);});
async function boot(){
 world=await getWorld(G.seed);
 $('#gen-stage').textContent='Laying out the country';await frameWait();
 terrain=new Terrain(world);
 setPhysicsBody(G.B);setBodyLayers(G.B);
 texArr=terrainTextures(256);wNormals=waterNormals(256);
 const nW=Math.max(1,Math.min(3,(navigator.hardwareConcurrency||4)-2));
 workers=await Promise.all(Array.from({length:nW},()=>new Promise(res=>{const w=new Worker(new URL('./drive/terrain-worker.mjs',import.meta.url),{type:'module'});w.addEventListener('message',function f(e){if(e.data.type==='ready'){w.removeEventListener('message',f);res(w);}});w.postMessage({type:'init',world});})));
 for(const w of workers)w.addEventListener('message',e=>{if(e.data.type==='tile'){tileWant.delete(e.data.tx*100003+e.data.tz);terrain.putTile(e.data.tx,e.data.tz,e.data.a);}});
 atmo=new Atmosphere(scene,renderer,{quality:G.quality});atmo.setBody(G.B);
 scenery=new Scenery(scene,terrain,{texArray:texArr,waterNormals:wNormals,workers,quality:G.quality,body:G.B});
 veg=new Vegetation(scene,terrain,renderer,{workers,quality:G.quality});veg.setBody(G.B);
 buildingBoxes=world.buildings.filter(b=>b.type!=='pad'&&b.type!=='array').map(b=>({type:'box',x:b.x,z:b.z,w:b.w,d:b.d,h:b.h+4,y:terrain.height(b.x,b.z)-1,rot:b.rot}));
 wmap=new WorldMap(world,terrain);fx=new FX(scene,terrain);fx.setBody(G.B);sound=new Sound();sound.setBody(G.B);sound.music.setWorld(G.B.id);birds=new Birds(scene,terrain,env);birds.enabled=G.B.birds;G.birds=birds;
 post=new Post(renderer,scene,camera,{quality:G.quality});G.post=post;
 G.world=world;G.terrain=terrain;G.findClear=findClear;G.scene=scene;G.fx=fx;G.sound=sound;G.scenery=scenery;G.veg=veg;G.atmo=atmo;G.camera=camera;G.hud=hud;G.env=env;
 setupVehicle('scout');
 // place at the staging area to begin with and prime the terrain
 const s0=world.sites.find(s=>s.type==='staging')||{x:world.towns[0].x+60,z:world.towns[0].z};
 spider.place(s0.x,s0.z,0);syncModel(0);resize();
 $('#gen-stage').textContent='Meshing the near country';
 if(renderer.compileAsync){$('#gen-stage').textContent='Compiling shaders';try{await renderer.compileAsync(scene,camera);}catch{}}
 await prime(8000);
 G.state='menu';body.dataset.state='menu';$('#menu').hidden=false;buildMenu();
 G.menuT=0;
}
function frameWait(){return new Promise(r=>requestAnimationFrame(()=>r()));}
async function prime(ms){const t0=performance.now();cameraUpdate(0,true);while(performance.now()-t0<ms){const done=scenery.update(camera.position);veg.update(camera.position,spider.pos,0);renderFrame(0);await frameWait();if(done&&performance.now()-t0>1200&&veg.pendingF.size===0)break;}}
function setupVehicle(variant){
 if(model){scene.remove(model.root);}
 const prev=spider;spider=new Spider(env,{variant,tires:G.tires});G.spider=spider;/* the driver's assist choices carry over between drives and worlds */if(recall('assist')==='0')spider.ctl.assist=false;if(recall('climb')==='0')spider.ctl.climb=false;
 if(prev){spider.place(prev.pos[0],prev.pos[2],prev.heading());}
 model=new SpiderModel({variant,envMap:null});model.setCrew(spider.crewCount,variant);model.setPower(G.B.id!=='earth');scene.add(model.root);G.model=model;
 headlights();
}
// headlight spots (no shadows)
let heads=[];
let beams=[];
function headlights(){for(const h of heads)h.parent?.remove(h);heads=[];for(const b of beams)b.parent?.remove(b);beams=[];
 // spotlights from the model's lamp mounts: the roof floodlight bank and the steering knee pods
 for(const m of model.lampMounts){const l=new T.SpotLight(0xfff0d6,0,140,m.angle,.55,1.1);l.position.set(...m.pos);const tgt=new T.Object3D();tgt.position.set(...m.aim);m.parent.add(l,tgt);l.target=tgt;l.userData.power=m.power;heads.push(l);
  if(!m.steer){const len=30,g=new T.ConeGeometry(len*Math.tan(m.angle)*.8,len,20,1,true);g.translate(0,-len/2,0);const d=new T.Vector3(...m.aim).sub(new T.Vector3(...m.pos)).normalize();g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,-1,0),d));
   const b=new T.Mesh(g,new T.MeshBasicMaterial({color:0xfff0d0,transparent:true,opacity:.04,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,fog:true}));b.position.set(...m.pos);b.visible=false;m.parent.add(b);beams.push(b);}}}
// ------------------------------------------------------------------ menu
function buildMenu(){
 const box=$('#missions');box.innerHTML='';
 for(const m of G.missions){const b=document.createElement('button');b.className='mission';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(m===G.missionDef));b.innerHTML=`<b>${m.name}</b><span>${m.tag}</span>`;b.onclick=()=>{G.missionDef=m;$$('.mission').forEach(x=>x.setAttribute('aria-checked','false'));b.setAttribute('aria-checked','true');brief();};box.appendChild(b);}
 brief();
 $('#opt-seed').value=G.seed;$('#opt-world').value=G.body;$('#opt-tires').value=G.tires;$('#opt-music').value=$('#p-music').value=G.music;$('#opt-quality').value=params.get('quality')||'auto';
 // the sun does not move on a lunar afternoon and there is no weather to pick off Earth
 const off=G.body!=='earth';$('#opt-time').closest('label').hidden=off;$('#opt-weather').closest('label').hidden=off;
}
function brief(){const m=G.missionDef;$('#brief').innerHTML=`<h3>${m.name}</h3><p>${m.brief}</p><p class="kit">${m.kit}</p>`;}
$('#opt-time').oninput=e=>{const h=+e.target.value;$('#opt-time-out').textContent=`${Math.floor(h)}:${String(Math.round(h%1*60)).padStart(2,'0')}`;G.time=h;if(atmo&&G.state==='menu')atmo.setTime(h);};
$('#opt-weather').onchange=e=>{G.weather=e.target.value;if(atmo&&G.state==='menu')atmo.setWeather(G.weather);};
$('#opt-volume').oninput=$('#p-volume').oninput=e=>{G.volume=+e.target.value;sound?.setVolume(G.volume);$('#opt-volume').value=$('#p-volume').value=G.volume;};
$('#opt-music').oninput=$('#p-music').oninput=e=>{G.music=+e.target.value;sound?.music.setVolume(G.music);sound?.music.setOn(G.music>0);$('#opt-music').value=$('#p-music').value=G.music;store('music',G.music);};
$('#opt-quality').onchange=$('#p-quality').onchange=e=>{const v=e.target.value==='auto'?autoQ():e.target.value;setQuality(v);};
$('#go').onclick=()=>{const seed=+$('#opt-seed').value||711,world=$('#opt-world').value,tires=$('#opt-tires').value;const u=new URL(location.href);if(tires==='compliant')u.searchParams.set('tires',tires);else u.searchParams.delete('tires');if(seed!==G.seed||world!==G.body){u.searchParams.set('seed',seed);if(world==='earth')u.searchParams.delete('world');else u.searchParams.set('world',world);location.href=u.href;return;}G.tires=tires;history.replaceState(null,'',u.href);startMission(G.missionDef);};
function setQuality(q){G.quality=q;scenery.setQuality(q);veg.cfg(q);veg.dirty=true;renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?1.75:q==='low'?1:1.4));post.bloom.enabled=q!=='low';post.enabled=q!=='low';resize();
 /* resizing clears the canvas: draw a frame in the same task so no black frame is ever presented */if(world&&post){try{post.frame(0,scene,camera);}catch{}}$('#p-quality').value=q;}
// ------------------------------------------------------------------ missions
function startMission(def){
 sound.start();sound.setVolume(G.volume);sound.music.setVolume(G.music);sound.music.setOn(G.music>0);sound.music.setMood(def.id);
 if(G.mission)G.mission.dispose?.();
 G.missionDef=def;G.stats={t:0,dist:0,maxTilt:0};
 if(def.variant!==spider.variant||spider.tireModel!==G.tires)setupVehicle(def.variant);
 atmo.setTime(def.time??G.time);atmo.setWeather(def.weather??G.weather);
 fx.rainOn=(def.weather??G.weather)==='rain'?1:0;shared.uWetness.value=(def.weather??G.weather)==='rain'?.5:0;
 // clear tyre tracks from the last run
 fx.tg.fillStyle='#000';fx.tg.fillRect(0,0,512,512);fx.trackDirty=1;
 G.mission=createMission(def.id,G);
 const st=G.mission.start();
 spider.recover(st.x,st.z,st.yaw??0);spider.hull=100;spider.distance=0;spider.maxTilt=0;spider.impacts=0;if(spider.variant==='fire')spider.water=3500;spider.recomputeMass();
 syncModel(0);G.view=st.view||'chase';setView(G.view);ready=false;
 $('#objectives').classList.toggle('collapsed',def.id==='free');
 G.state='drive';body.dataset.state='drive';$('#menu').hidden=true;$('#end').hidden=true;$('#pause').hidden=true;G.paused=false;
 G.lights=((def.time??G.time)>18.2||(def.time??G.time)<6.3)&&def.id!=='crossing';G.ladder=false;G.hurt=0;
 canvas.focus();
}
// ------------------------------------------------------------------ input
const keys=new Set();let stick={x:0,y:0,on:false};let pad=null;
const K={KeyW:'fwd',ArrowUp:'fwd',KeyS:'rev',ArrowDown:'rev',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'brake',ShiftLeft:'boost',ShiftRight:'boost',KeyF:'action',KeyR:'draft',KeyE:'load',Comma:'carFwd',Period:'carAft'};
addEventListener('keydown',e=>{
 if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
 if(G.state==='menu'&&e.code==='Enter'){$('#go').click();return;}
 if(G.state!=='drive')return;
 if(e.code==='Escape'&&G.view==='cinematic'&&!G.paused){setView('chase');e.preventDefault();return;}
 if(e.code==='Escape'||e.code==='KeyP'){togglePause();e.preventDefault();return;}
 if(G.paused)return;
 const a=K[e.code];if(a){keys.add(a);e.preventDefault();}
 const c=spider.ctl;
 switch(e.code){
  case 'Equal':case 'NumpadAdd':c.limit=clamp(c.limit+5/3.6,5/3.6,140/3.6);break;
  case 'Minus':case 'NumpadSubtract':c.limit=clamp(c.limit-5/3.6,5/3.6,140/3.6);break;
  case 'BracketLeft':c.retraction=clamp(c.retraction-.05,0,1);break;
  case 'BracketRight':c.retraction=clamp(c.retraction+.05,0,1);break;
  case 'Digit1':case 'Digit2':case 'Digit3':{const p=+e.code.slice(-1)-1;c.lift[p]=!c.lift[p];break;}
  case 'KeyT':{const o=['road','terrain','soft'];c.tire=o[(o.indexOf(c.tire)+1)%3];sound.hiss(1);spider.say(`Tyres to ${PRESSURES[c.tire]} bar (${{road:'road',terrain:'all-terrain',soft:'sand and mud'}[c.tire]})`,2.5);break;}
  case 'KeyV':{const o=['auto','soft','firm'];c.suspension=o[(o.indexOf(c.suspension)+1)%3];spider.say(`Suspension ${c.suspension}`,1.5);break;}
  case 'KeyG':if(!spider.trackSeq)c.track=c.track>=.5?0:1;break;
  case 'KeyB':c.assist=!c.assist;store('assist',c.assist?1:0);spider.say(`Stability assist ${c.assist?'on':'off'}`,2);break;
  case 'KeyK':c.climb=!c.climb;store('climb',c.climb?1:0);spider.say(`Climb assist ${c.climb?'on':'off'}`,2);break;
  case 'Slash':c.carriageManual=null;spider.say('Carriage on automatic load trim',2);break;
  case 'KeyC':cycleView();break;
  case 'KeyM':toggleMap();break;
  case 'KeyH':toggleHelp();break;
  case 'KeyL':G.lights=!G.lights;break;
  case 'KeyN':{const on=!(sound.music.on);sound.music.setOn(on);if(on&&!G.music){G.music=.55;sound.music.setVolume(G.music);}$('#opt-music').value=$('#p-music').value=on?G.music:0;store('music',on?G.music:0);hud.toast(on?'Music on':'Music off',1.5);break;}
  case 'KeyI':spider.setEngine(spider.engine.off);break;
  case 'KeyU':{G.units=G.units==='imperial'?'metric':'imperial';store('units',G.units);hud.toast(G.units==='imperial'?'Miles per hour':'Kilometres per hour',1.5);break;}
  case 'KeyX':recover();break;
  case 'KeyQ':spider.requestSelfRight();break;
  case 'KeyO':G.mission?.debugSkip?.();break;
 }
});
addEventListener('keyup',e=>{const a=K[e.code];if(a)keys.delete(a);});
addEventListener('blur',()=>{keys.clear();if(G.state==='drive'&&!G.paused)togglePause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&G.state==='drive'&&!G.paused)togglePause(true);});
for(const b of $$('[data-act]')){const act=b.dataset.act;
 if(b.hasAttribute('data-hold')){b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(act==='action'?'action':act);b.classList.add('held');b.setPointerCapture(e.pointerId);});const up=()=>{keys.delete(act==='action'?'action':act);b.classList.remove('held');};b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);continue;}
 b.addEventListener('click',()=>{switch(act){case 'view':cycleView();break;case 'view-exit':setView('chase');break;case 'map':toggleMap();break;case 'engine':spider.setEngine(spider.engine.off);break;case 'panel':body.classList.toggle('panel-open');break;case 'help':toggleHelp();break;case 'resume':togglePause(false);break;case 'recover':recover();togglePause(false);break;case 'selfright':spider.requestSelfRight();if(G.paused)togglePause(false);break;case 'restart':startMission(G.missionDef);break;case 'menu':toMenu();break;case 'free':$('#end').hidden=true;G.mission.finished=true;G.paused=false;break;
  case 'raise':spider.ctl.retraction=clamp(spider.ctl.retraction-.1,0,1);break;case 'lower':spider.ctl.retraction=clamp(spider.ctl.retraction+.1,0,1);break;case 'faster':spider.ctl.limit=clamp(spider.ctl.limit+5/3.6,5/3.6,140/3.6);break;case 'slower':spider.ctl.limit=clamp(spider.ctl.limit-5/3.6,5/3.6,140/3.6);break;}canvas.focus();});}
$('#pause-btn').onclick=()=>togglePause();
$('#obj-title').onclick=()=>$('#objectives').classList.toggle('collapsed');
// touch stick
{const el=$('#stick'),knob=el.querySelector('span');let id=null;
 el.addEventListener('pointerdown',e=>{id=e.pointerId;el.setPointerCapture(id);move(e);});el.addEventListener('pointermove',e=>{if(e.pointerId===id)move(e);});
 const end=e=>{if(e.pointerId!==id)return;id=null;stick={x:0,y:0,on:false};knob.style.transform='';};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 function move(e){const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*2-1,y=(e.clientY-r.top)/r.height*2-1,l=Math.max(1,Math.hypot(x,y));stick={x:x/l,y:y/l,on:true};knob.style.transform=`translate(${x/l*38}px,${y/l*38}px)`;}}
// look around (seat view) by dragging
let look={yaw:0,pitch:0,p:null};
canvas.addEventListener('pointerdown',e=>{canvas.focus();if(G.view==='cinematic'){setView('chase');return;}if(G.view!=='seat'&&G.view!=='foot')return;look.p={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!look.p||look.p.id!==e.pointerId)return;look.yaw-=(e.clientX-look.p.x)*.005;look.pitch=clamp(look.pitch-(e.clientY-look.p.y)*.004,-1.2,1.1);look.p.x=e.clientX;look.p.y=e.clientY;});
for(const ev of ['pointerup','pointercancel'])canvas.addEventListener(ev,()=>look.p=null);
canvas.addEventListener('dblclick',()=>{look.yaw=0;look.pitch=0;});
function readInput(){
 let thr=(keys.has('fwd')?1:0)-(keys.has('rev')?1:0),st=(keys.has('left')?1:0)-(keys.has('right')?1:0),br=keys.has('brake');
 if(stick.on){thr=-stick.y;st=-stick.x;if(Math.abs(thr)<.15)thr=0;}
 pad=navigator.getGamepads?[...navigator.getGamepads()].find(p=>p&&p.connected):null;
 if(pad){const ax=pad.axes,bt=pad.buttons;const lx=Math.abs(ax[0])>.12?ax[0]:0,ly=Math.abs(ax[1])>.15?ax[1]:0;const rt=bt[7]?.value||0,lt=bt[6]?.value||0;
  if(lx)st=-lx;if(rt>.05||lt>.05)thr=rt-lt;else if(ly)thr=-ly;if(bt[1]?.pressed)br=true;
  const edge=(i,f)=>{const p=!!bt[i]?.pressed;if(p&&!G['_b'+i])f();G['_b'+i]=p;};
  edge(4,()=>spider.ctl.retraction=clamp(spider.ctl.retraction-.1,0,1));edge(5,()=>spider.ctl.retraction=clamp(spider.ctl.retraction+.1,0,1));edge(3,cycleView);edge(2,()=>spider.requestSelfRight());edge(8,toggleMap);edge(9,()=>togglePause());edge(12,()=>spider.ctl.limit=clamp(spider.ctl.limit+5/3.6,5/3.6,140/3.6));edge(13,()=>spider.ctl.limit=clamp(spider.ctl.limit-5/3.6,5/3.6,140/3.6));
  if(bt[0]?.pressed)keys.add('action');else if(G._b0held)keys.delete('action');G._b0held=bt[0]?.pressed;}
 return {throttle:clamp(thr,-1,1),steer:clamp(st,-1,1),brake:br};
}
function togglePause(v){G.paused=v??!G.paused;$('#pause').hidden=!G.paused;$('#p-quality').value=G.quality;keys.clear();sound.pause(G.paused);if(!G.paused)canvas.focus();}
function toggleMap(){const m=$('#fullmap');m.hidden=!m.hidden;G.mapOpen=!m.hidden;}
function toggleHelp(){$('#help').hidden=!$('#help').hidden;}
function toMenu(){G.mission?.dispose?.();G.mission=null;G.state='menu';body.dataset.state='menu';$('#menu').hidden=false;$('#pause').hidden=true;$('#end').hidden=true;G.paused=false;clearHud();sound.pause(true);sound.music.setMood('menu');}
function recover(){const p=findClear(spider.pos[0],spider.pos[2]);spider.recover(p.x,p.z,spider.heading());ready=false;fx.dust(p.x,terrain.height(p.x,p.z)+1,p.z,1,[.5,.45,.4]);G.stats&&(G.stats.recoveries=(G.stats.recoveries||0)+1);}
function findClear(x,z){let best=null;for(let r=0;r<80;r+=6)for(let a=0;a<12;a++){const px=x+Math.cos(a*.52)*r,pz=z+Math.sin(a*.52)*r;const w=terrain.water(px,pz,{});if(w.kind&&w.depth>.3)continue;const n=terrain.normal(px,pz);if(n[1]<.93)continue;const ob=veg.obstacles(px,pz,6,[]).filter(o=>o.type==='trunk'&&Math.hypot(o.x-px,o.z-pz)<6);if(ob.length)continue;if(buildingBoxes.some(b=>Math.hypot(b.x-px,b.z-pz)<Math.max(b.w,b.d)*.7+6))continue;best={x:px,z:pz};return best;}return {x,z};}
// ------------------------------------------------------------------ cameras
const VIEWS=['chase','seat','orbit','cinematic','foot'];let ready=false,cine={t:0,shot:-1,pos:new T.Vector3(),look:new T.Vector3()};
function cycleView(){setView(VIEWS[(VIEWS.indexOf(G.view)+1)%VIEWS.length]);}
function setView(v){G.view=v;body.dataset.view=v;body.dataset.cine=String(v==='cinematic');orbit.enabled=v==='orbit';ready=false;look.yaw=0;look.pitch=0;spider&&spider.say({chase:'Chase camera',seat:"Driver's seat: drag to look",orbit:'Orbit camera',cinematic:'Cinematic director',foot:'Foot camera'}[v],1.6);
 post.grade.uniforms.uLetter.value=v==='cinematic'?.075:0;post.grade.uniforms.uGlass.value=v==='seat'?1:0;}
const tmpV=new T.Vector3(),tmpV2=new T.Vector3(),tmpQ=new T.Quaternion();
let headOff=new T.Vector3();
function cameraUpdate(dt,snap=false){
 const R=model.root;R.updateMatrixWorld();
 const target=R.localToWorld(tmpV.set(0,4.2,0)).clone();
 let fov=52,near=.25;
 if(G.view==='seat'){
  fov=74;near=.04;
  // head motion from the cabin's real acceleration (in the body frame), lagged
  const a=new T.Vector3(...spider.acc).applyQuaternion(R.quaternion.clone().invert());headOff.lerp(new T.Vector3(clamp(-a.x*.012,-.12,.12),clamp(-a.y*.01,-.1,.1),clamp(-a.z*.012,-.12,.12)),1-Math.exp(-dt*6));
  const eye=model.cabin.localToWorld(tmpV2.set(-.62+headOff.x,2.8+1.5+headOff.y,-3.7+headOff.z));camera.position.copy(eye);
  const q=R.quaternion.clone();const e=new T.Euler(look.pitch-.3,look.yaw,0,'YXZ');q.multiply(tmpQ.setFromEuler(e));camera.quaternion.copy(q);
 }else if(G.view==='orbit'){if(!ready){camera.position.copy(R.localToWorld(new T.Vector3(22,14,26)));ready=true;}orbit.target.copy(G.orbitTarget||target);orbit.update();}
 else if(G.view==='foot'){fov=58;near=.1;const leg=model.legs[0];const p=leg.hub.localToWorld(new T.Vector3(-1.8,1.4,-3.6));camera.position.lerp(p,snap||!ready?1:1-Math.exp(-dt*8));ready=true;camera.lookAt(leg.hub.localToWorld(new T.Vector3(.2,1.4,0)));}
 else if(G.view==='cinematic'){cinematic(dt,target);fov=cine.fov||40;}
 else{// chase: spring arm, look-ahead, terrain avoidance
  const aspect=camera.aspect,back=aspect<1?34:25,up=aspect<1?14:9.5;
  const hd=spider.heading(),vx=spider.vel[0],vz=spider.vel[2];const fw=new T.Vector3(Math.sin(hd),0,-Math.cos(hd));
  const desired=target.clone().addScaledVector(fw,-back).add(new T.Vector3(0,up,0));
  const side=new T.Vector3(-fw.z,0,fw.x);desired.addScaledVector(side,5);
  const g=terrain.height(desired.x,desired.z)+3.5;if(desired.y<g)desired.y=g;
  if(!ready||snap){camera.position.copy(desired);ready=true;}else camera.position.lerp(desired,1-Math.exp(-dt*3.2));
  const cg=terrain.height(camera.position.x,camera.position.z)+2.5;if(camera.position.y<cg)camera.position.y=cg;
  const lookAt=target.clone().add(new T.Vector3(vx*.6+fw.x*4,.2,vz*.6+fw.z*4));camera.lookAt(lookAt);
 }
 if(camera.fov!==fov||camera.near!==near){camera.fov=fov;camera.near=near;camera.updateProjectionMatrix();}
}
function cinematic(dt,target){
 cine.t-=dt;const R=model.root;
 if(cine.t<=0||cine.shot<0){cine.shot=(cine.shot+1+Math.floor(Math.random()*2))%5;cine.t=6+Math.random()*4;const hd=spider.heading(),fw=new T.Vector3(Math.sin(hd),0,-Math.cos(hd)),sd=new T.Vector3(-fw.z,0,fw.x);
  if(cine.shot===0){cine.mode='wheel';cine.fov=46;}// low tracking shot beside a wheel
  else if(cine.shot===1){const v=Math.max(3,spider.speed());const p=target.clone().addScaledVector(fw,v*5+25).addScaledVector(sd,(Math.random()<.5?-1:1)*(12+Math.random()*10));p.y=terrain.height(p.x,p.z)+1.6+Math.random()*2;cine.pos.copy(p);cine.mode='flyby';cine.fov=34;}
  else if(cine.shot===2){cine.mode='drone';cine.a=Math.random()*6.28;cine.fov=38;}
  else if(cine.shot===3){cine.mode='top';cine.fov=40;}
  else {cine.mode='crew';cine.fov=62;}}
 if(cine.mode==='wheel'){const p=R.localToWorld(new T.Vector3(7.5,1.2,-1.5));p.y=Math.max(p.y,terrain.height(p.x,p.z)+.7);camera.position.lerp(p,1-Math.exp(-dt*5));camera.lookAt(R.localToWorld(new T.Vector3(0,3,-3)));}
 else if(cine.mode==='flyby'){camera.position.copy(cine.pos);camera.lookAt(target);}
 else if(cine.mode==='drone'){cine.a+=dt*.08;const p=target.clone().add(new T.Vector3(Math.cos(cine.a)*70,48,Math.sin(cine.a)*70));camera.position.lerp(p,1-Math.exp(-dt*2));camera.lookAt(target);}
 else if(cine.mode==='top'){const p=target.clone().add(new T.Vector3(.1,34,.1));camera.position.lerp(p,1-Math.exp(-dt*3));camera.lookAt(target);}
 else{const p=model.cabin.localToWorld(new T.Vector3(.62,4.3,1.9));camera.position.copy(p);camera.lookAt(model.cabin.localToWorld(new T.Vector3(-.3,3.6,-8)));}
}
// ------------------------------------------------------------------ HUD
const hud={
 radio(who,line,dur=6){const r=$('#radio');r.querySelector('.who').textContent=who;r.querySelector('.line').textContent=line;r.classList.add('on');clearTimeout(this._rt);this._rt=setTimeout(()=>r.classList.remove('on'),dur*1000);sound.squelch();},
 toast(t,dur=3){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(this._tt);this._tt=setTimeout(()=>e.classList.remove('on'),dur*1000);},
 objectives(title,items,meter=''){const o=$('#objectives');o.classList.toggle('none',!title);$('#obj-title').textContent=title||'';$('#obj-list').innerHTML=(items||[]).map(i=>`<li class="${i.state||''}">${i.text}</li>`).join('');$('#obj-meter').textContent=meter;},
 gauges(list){$('#gauges').innerHTML=(list||[]).map(g=>`<div class="g"><span>${g.label} <b>${g.text}</b></span><i><b style="width:${clamp(g.value,0,1)*100}%;background:${g.color||'var(--teal)'}"></b></i></div>`).join('');},
 end(title,text,stats){$('#end-title').textContent=title;$('#end-text').textContent=text;$('#end-stats').innerHTML=Object.entries(stats).map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');$('#end').hidden=false;},
};
function clearHud(){hud.objectives('',[]);hud.gauges([]);}
const miniCtx=$('#mini').getContext('2d'),feetCtx=$('#feet').getContext('2d'),horCtx=$('#horizon').getContext('2d'),spdCtx=$('#speedo').getContext('2d'),bigCtx=$('#bigmap').getContext('2d');
function drawHud(){
 const sp=spider,kmh=sp.speed()*3.6,U=G.units==='imperial',uk=U?.621371:1;
 $('#speed').textContent=(kmh*uk).toFixed(0);$('#limit').textContent=Math.round(sp.ctl.limit*3.6*uk);$('#speed-unit').textContent=U?'mph':'km/h';{const el=G.B.id!=='earth';$('#rpm').textContent=el?`${Math.round(((sp.engine.drivePower||0)+(sp.engine.pump||0))/1e4)*10} kW${sp.engine.crank>0?' · powering up':sp.engine.off?' · off':sp.engine.boost>.3?' · BOOST':''}`:`${Math.round(sp.engine.rpm/10)*10} rpm${sp.engine.stalled?' · stalled':sp.engine.crank>0?' · starting':sp.engine.off?' · off':sp.engine.boost>.3?' · TURBO':''}`;const tl=$('#turbo');if(tl.lastChild?.nodeType===3)tl.lastChild.textContent=el?' boost':' turbo';}{const tb=$('#turbo');tb.hidden=!(sp.engine.heat>.01||sp.engine.boost>.05);tb.firstElementChild.firstElementChild.style.width=`${Math.round(sp.engine.heat*100)}%`;tb.classList.toggle('cut',!!sp.engine.cut);}
 const f=terrain.feature(sp.pos[0],sp.pos[2]);$('#place').textContent=f.label;
 $('#terrain-surf').textContent=sp.wheels[2].surface?.name||'';
 $('#status').textContent=G.paused?'Paused':(sp.message||(sp.climbState?`Climbing: ${['front','middle','rear'][sp.climbState.pair]} pair ${sp.climbState.phase}`:sp.hold?'Holding':''));
 $('#coords').textContent=`${Math.round(sp.pos[0])} E · ${Math.round(-sp.pos[2])} N · ${Math.round(terrain.height(sp.pos[0],sp.pos[2]))} m`;
 $('#att').textContent=`Roll ${sp.roll?.toFixed(1)}° · Pitch ${sp.pitch?.toFixed(1)}°`;
 {const b=$('#b-right');b.classList.toggle('urgent',!!sp.overturned&&!sp.sr);b.textContent=sp.sr?'Stop arms':'Self-right';}
 $('#b-engine').textContent=G.B.id!=='earth'?(sp.engine.off?(sp.engine.crank>0?'Powering':'Power on'):'Power off'):sp.engine.off?(sp.engine.crank>0?'Starting':'Start'):'Engine off';$('#m-ride').textContent=`${Math.round(sp.ctl.retraction*100)}% retr`;$('#m-assist').textContent=(sp.ctl.assist?'On':'Off')+(sp.ctl.climb?' +climb':'');$('#m-track').textContent=spider.trackFrac>.99?'Wide':spider.trackFrac<.01?'Road':spider.trackSeq?`${spider.trackSeq.tgt?'Widening':'Narrowing'} ${Math.round(spider.trackFrac*100)}%`:`Mixed ${Math.round(spider.trackFrac*100)}% (G)`;$('#m-susp').textContent=`${sp.ctl.suspension}${sp.ctl.suspension==='auto'?' ('+sp.suspMode+')':''}`;
 $('#m-tyre').textContent=`${sp.tireModel==='compliant'?'Soft / firm walls':'Kevlar'} ${sp.wheels[0].pressure.toFixed(1)} bar`;$('#m-carr').textContent=`${sp.carriage>=0?'aft ':'fwd '}${Math.abs(sp.carriage).toFixed(1)} m`;
 const L=sp.wheels.map(w=>w.load),m=L.reduce((a,b)=>a+b,0)/6||1,dev=Math.max(...L.map(l=>Math.abs(l-m)))/m;$('#m-bal').textContent=`${Math.round(clamp(1-dev*.5,0,1)*100)}%`;
 const bearing=G.mission?.bearing?.();$('#bearing').textContent=bearing||'';
 drawFeet();drawHorizon();drawSpeedo(kmh*uk,U);
 const over=G.mission?.mapOverlay?G.mission.mapOverlay.bind(G.mission):null;
 wmap.drawMini(miniCtx,200,200,sp.pos[0],sp.pos[2],sp.heading(),900,over?(ctx,toPx,px,pz,s)=>over(ctx,toPx,s,true):null);
 if(G.mapOpen){const c=$('#bigmap');const W=c.clientWidth*devicePixelRatio,H=c.clientHeight*devicePixelRatio;if(c.width!==W){c.width=W;c.height=H;}wmap.drawFull(bigCtx,W,H,sp.pos[0],sp.pos[2],sp.heading(),over?(ctx,toPx,s)=>over(ctx,toPx,s,false):null);}
}
function drawFeet(){const c=feetCtx,W=176,H=200;c.clearRect(0,0,W,H);const sp=spider;
 c.strokeStyle='#7fa9a0';c.lineWidth=1;c.fillStyle='#1b2d2d';c.beginPath();c.roundRect(W/2-18,30+sp.carriage*10,36,140,16);c.fill();c.stroke();
 c.strokeStyle='#4d6a66';c.beginPath();c.moveTo(W/2,20);c.lineTo(W/2,180);c.stroke();
 const Fn=sp.totalMass*sp.g/6;
 sp.wheels.forEach((w,i)=>{const pair=w.pair,s=w.side,d=sp.steer[pair];const cx=W/2+s*62*Math.cos(d),cy=100+GEOM.stations[pair]*17-s*62*Math.sin(d)*.9;
  c.save();c.translate(cx,cy);c.rotate(-d);
  const load=clamp(w.load/Fn/2,0,1);c.fillStyle=w.disabled?'#552222':w.lifted?'#33414a':w.contact?`hsl(${150-load*150},60%,${35+load*15}%)`:'#26343a';c.fillRect(-8,-20,16,40);
  c.strokeStyle=Math.abs(w.slip)>.15?'#ff6a4f':'#cfe';c.lineWidth=Math.abs(w.slip)>.15?2:1;c.strokeRect(-8,-20,16,40);c.restore();
  // stroke bar
  const bx=cx+s*16-3,by=cy-20;c.fillStyle='#ffffff18';c.fillRect(bx,by,6,40);c.fillStyle=w.e<.15||w.e>GEOM.stroke-.15?'#ff9a4f':'#6fe0c8';c.fillRect(bx,by,6,40*clamp(w.e/GEOM.stroke,0,1));
  c.fillStyle='#dfe';c.font='9px system-ui';c.textAlign='center';c.fillText(`${(w.load/1000).toFixed(0)}kN`,cx,cy+31);});
 c.fillStyle='#b9c6c2';c.font='10px system-ui';c.textAlign='left';c.fillText(`${sp.wheels[0].pressure.toFixed(1)} bar · ${sp.suspMode} · pump ${((sp.engine.pumpFlow||0)*60000).toFixed(0)} L/min`,4,12);
 if(sp.climbState){c.fillStyle='#f0b95a';c.fillText(`climb: ${['front','middle','rear'][sp.climbState.pair]} ${sp.climbState.phase}`,4,196);}
 else if(sp.tipMargin!==undefined&&sp.tipMargin<1.4){c.fillStyle='#ff6a4f';c.fillText(`tip margin ${sp.tipMargin.toFixed(1)} m`,4,196);}
 else{c.fillStyle='#8aa';c.fillText(`level ${Math.round((sp.levelFraction||0)*100)}% · margin ${(sp.tipMargin||0).toFixed(1)} m`,4,196);}}
function drawHorizon(){const c=horCtx,S=96,sp=spider;c.clearRect(0,0,S,S);c.save();c.beginPath();c.arc(S/2,S/2,S/2-2,0,Math.PI*2);c.clip();c.translate(S/2,S/2);c.rotate(-(sp.roll||0)*Math.PI/180);const py=(sp.pitch||0)*1.6;c.fillStyle='#35607a';c.fillRect(-S,-S*2+py,S*2,S*2);c.fillStyle='#5b4a32';c.fillRect(-S,py,S*2,S*2);c.strokeStyle='#fff';c.beginPath();c.moveTo(-S,py);c.lineTo(S,py);c.stroke();c.restore();
 c.strokeStyle='#f0b95a';c.lineWidth=2;c.beginPath();c.moveTo(S/2-22,S/2);c.lineTo(S/2-8,S/2);c.moveTo(S/2+8,S/2);c.lineTo(S/2+22,S/2);c.stroke();c.strokeStyle='#cfe';c.lineWidth=1;c.beginPath();c.arc(S/2,S/2,S/2-2,0,Math.PI*2);c.stroke();}
function drawSpeedo(kmh,U){const c=spdCtx,S=150,full=U?95:150;c.clearRect(0,0,S,S);const a0=Math.PI*.75,a1=Math.PI*2.25,v2a=v=>a0+(a1-a0)*clamp(v/full,0,1);
 c.lineWidth=9;c.strokeStyle='#ffffff14';c.beginPath();c.arc(S/2,S/2,S/2-10,a0,a1);c.stroke();
 const safe=spider.safeSpeed*3.6;c.strokeStyle='#ff6a4f55';c.beginPath();c.arc(S/2,S/2,S/2-10,v2a(Math.min(150,safe)),a1);c.stroke();
 c.strokeStyle='#6fe0c8';c.beginPath();c.arc(S/2,S/2,S/2-10,a0,v2a(kmh));c.stroke();
 const la=v2a(spider.ctl.limit*3.6);c.strokeStyle='#f0b95a';c.lineWidth=3;c.beginPath();c.moveTo(S/2+Math.cos(la)*(S/2-18),S/2+Math.sin(la)*(S/2-18));c.lineTo(S/2+Math.cos(la)*(S/2-2),S/2+Math.sin(la)*(S/2-2));c.stroke();
 const rp=clamp(spider.engine.rpm/2000,0,1);c.lineWidth=4;c.strokeStyle='#f0b95a88';c.beginPath();c.arc(S/2,S/2,S/2-24,a0,a0+(a1-a0)*rp);c.stroke();
 c.fillStyle='#eef3ee';c.font='600 30px system-ui';c.textAlign='center';c.fillText(kmh.toFixed(0),S/2,S/2+10);c.font='11px system-ui';c.fillStyle='#b9c6c2';c.fillText(U?'mph':'km/h',S/2,S/2+26);}
// ------------------------------------------------------------------ frame
function syncModel(dt){
 const gy=terrain.height(spider.pos[0],spider.pos[2]);
 const speed=spider.speed();
 // mud and dust build up on soft ground; fording washes it off
 {const surf=spider.wheels[2].surface||{};const soil=(surf.soft||0)*(surf.name==='Mud'?3:1)+(surf.dust||0)*.3;model.dirt.value=clamp(model.dirt.value+dt*(soil*speed*.0025)-dt*(spider.wading||0)*.06-dt*(atmo?.weather==='rain'?.004:0),.05,1);}
 model.update(spider,dt,{lead:G.state==='drive'&&!G.paused?acc:0,headlights:G.lights,worklights:G.lights,beacons:G.mission?.beacons??false,braking:spider.ctl.brake,night:atmo?.night||0,ladder:!!G.ladder,groundY:gy,dirt:model.dirt.value,wet:spider.wading>.1?1:0,monitorAim:G.mission?.monitorAim});
 for(const h of heads)h.intensity=G.lights?420*h.userData.power:0;for(const b of beams)b.visible=G.lights&&(atmo?.night||0)>.3&&G.view!=='seat';
}
let last=performance.now(),acc=0,subK=0,hudT=0,missionT=0,fpsT=0,frames=0,fps=60,lowFps=0;
function step(dt){
 const inp=readInput();const c=spider.ctl;
 c.throttle=inp.throttle;c.steer=inp.steer;c.brake=inp.brake;c.boost=keys.has('boost');
 if(keys.has('carFwd'))c.carriageManual=clamp((c.carriageManual??spider.carriage)-.8*dt,-GEOM.carriageMax,GEOM.carriageMax);if(keys.has('carAft'))c.carriageManual=clamp((c.carriageManual??spider.carriage)+.8*dt,-GEOM.carriageMax,GEOM.carriageMax);
 G.input={action:keys.has('action'),draft:keys.has('draft'),load:keys.has('load')};
 // physics advances in its own 1/240 s steps as the wall clock allows (the 60 Hz controller runs every fourth),
 // so a frame never waits a whole 1/60 s for the next state; the model is then led by the leftover fraction of a
 // step. Stepping in 1/60 s blocks beat against the display rate and showed as a slow periodic stutter at speed.
 acc+=dt;let n=0;
 while(acc>=DT&&n<16){if((subK++&3)===0)spider.control(1/60);spider.step(DT);acc-=DT;n++;}
 if(n>=16)acc=0;
 // events from physics
 for(const e of spider.events){if(e.type==='impact'){sound.thump(Math.min(1,e.strength/6));G.shake=Math.min(1,(G.shake||0)+e.strength*.08);}else if(e.type==='overturn'){sound.thump(1);G.shake=1;}else if(e.type==='starter')sound.starter();else if(e.type==='engineCatch')sound.catchUp();else if(e.type==='engineStop')sound.engineStop();else if(e.type==='arm')sound.arm(e.k);else if(e.type==='righted'){sound.thump(.8);hud.toast('Back on its wheels',2.5);}}spider.events.length=0;
 missionT+=dt;if(G.mission&&missionT>=.1){G.mission.update(missionT);missionT=0;}
 G.stats&&(G.stats.t+=dt);
}
function renderFrame(dt){
 shared.uTime.value+=dt;
 if(spider){syncModel(dt);cameraUpdate(dt);}
 if(G.shake>0){camera.position.x+=(Math.random()-.5)*G.shake*.25;camera.position.y+=(Math.random()-.5)*G.shake*.25;G.shake=Math.max(0,G.shake-dt*1.8);}
 if(atmo)atmo.update(camera.position.clone().setY(spider?spider.pos[1]:0),dt);
 if(scenery)scenery.update(camera.position);
 if(veg)veg.update(camera.position,spider.pos,dt);
 if(birds&&spider){birds.update(dt,spider,camera,G);for(const e of birds.events){const d=Math.hypot(e.x-spider.pos[0],e.z-spider.pos[2]);sound.flock(e.n,d);}birds.events.length=0;}
 // brush pushers: six tyres, legs, the cabin belly and the top
 if(spider){let k=0;const P=pushers.value;for(const w of spider.wheels){P[k++].set(w.hub[0],w.hub[1],w.hub[2],GEOM.R*1.05);}
  for(const w of spider.wheels){const m=w.mount,h=w.hub;P[k++].set((m[0]+h[0])/2,(m[1]+h[1])/2,(m[2]+h[2])/2,.7);}
  const R=model.root;for(const z of [-4,-1.5,1,3.5]){const p=model.cabin.localToWorld(tmpV.set(0,3.2,z));P[k++].set(p.x,p.y,p.z,1.7);}
  for(const z of [-3,3]){const p=R.localToWorld(tmpV.set(0,5.8,z));P[k++].set(p.x,p.y,p.z,2.2);}}
 if(fx)fx.update(dt,camera,G);if(post&&G.view==='seat')post.grade.uniforms.uWet.value=mix(post.grade.uniforms.uWet.value,(atmo?.weather==='rain'?1:0)+(spider?.wading>.4?.6:0),.05);
 if(sound&&spider){sound.update(dt,spider,G,camera);if(G.state==='drive'){const v=Math.hypot(spider.vel[0],spider.vel[2]);sound.music.setIntensity(Math.min(.45,v/30)+(G.mission?.intensity?.()||0)+(G.shake||0)*.3);}}
 if(G.mission?.frame)G.mission.frame(dt);
 post.grade.uniforms.uHurt.value=mix(post.grade.uniforms.uHurt.value,G.hurt||0,.05);
 post.frame(dt,scene,camera);
}
renderer.setAnimationLoop(now=>{
 const dt=clamp((now-last)/1000,0,.1);last=now;if(!world||!post)return;
 G.frame++;
 if(G.state==='drive'&&!G.paused){step(dt);terrainPrefetch();}
 else if(G.state==='menu'){G.menuT=(G.menuT||0)+dt;// slow orbit around the Spider on the menu
  const a=G.menuT*.05;const t=model.root.position;camera.position.set(t.x+Math.cos(a)*30,t.y+9+Math.sin(G.menuT*.07)*2,t.z+Math.sin(a)*30);camera.lookAt(t.x,t.y+4,t.z);
  spider.control(1/60);for(let k=0;k<4;k++)spider.step(DT);syncModel(dt);shared.uTime.value+=dt;atmo.update(camera.position,dt);scenery.update(camera.position);veg.update(camera.position,spider.pos,dt);post.frame(dt,scene,camera);return;}
 renderFrame(G.paused?0:dt);
 hudT+=dt;if(hudT>.1&&G.state==='drive'){drawHud();hudT=0;}
 // frame-time based quality auto-detect (downgrade only)
 frames++;fpsT+=dt;if(fpsT>2){fps=frames/fpsT;frames=0;fpsT=0;if(G.state==='drive'&&!G.paused&&fps<24&&G.quality!=='low'&&!params.get('quality')){lowFps++;if(lowFps>=3){setQuality(G.quality==='high'?'medium':'low');spider.say(`Quality lowered to ${G.quality} for smoother driving`,3);lowFps=0;}}else lowFps=0;}
});
// physics tiles ahead of the Spider are built in the terrain workers; the main thread only builds one
// itself when the Spider is already standing on ground that has not arrived yet
const tileWant=new Set();let tileRR=0;
function terrainPrefetch(){
 const T0=[spider.pos[0],spider.pos[2]];
 for(const ahead of [0,1.5,3,5]){const x=T0[0]+spider.vel[0]*ahead,z=T0[1]+spider.vel[2]*ahead;
  for(const [dx,dz] of [[0,0],[40,0],[-40,0],[0,40],[0,-40],[40,40],[-40,-40],[40,-40],[-40,40]]){const tx=Math.floor((x+dx)/64),tz=Math.floor((z+dz)/64),k=tx*100003+tz;
   if(terrain.hasTile(x+dx,z+dz)||tileWant.has(k))continue;if(tileWant.size>6)break;tileWant.add(k);workers[tileRR++%workers.length].postMessage({type:'tile',tx,tz});}}
 terrain.frame=G.frame;}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(post){const s=renderer.getDrawingBufferSize(new T.Vector2());post.setSize(w,h);}}
addEventListener('resize',resize);
// ------------------------------------------------------------------ debug hook (headless tests drive the page through this)
window.spiderDrive={G,get spider(){return spider;},get scenery(){return scenery;},get veg(){return veg;},get birds(){return birds;},get model(){return model;},get terrain(){return terrain;},get world(){return world;},scene,camera,renderer,
 start:(id='free')=>startMission(G.missions.find(m=>m.id===id)||G.missions[0]),setView,
 advance:(seconds,ctl={})=>{const k0=new Set(keys);for(let t=0;t<seconds;t+=1/60){Object.assign(spider.ctl,ctl);spider.control(1/60);for(let k=0;k<4;k++)spider.step(DT);missionT+=1/60;if(G.mission&&missionT>=.1){G.mission.update(missionT);missionT=0;}}ready=false;return spider.telemetry();},
 teleport:(x,z,yaw=0)=>{spider.recover(x,z,yaw);ready=false;},
 settle:async(ms=4000)=>{await prime(ms);},
 time:h=>atmo.setTime(h),weather:w=>atmo.setWeather(w),quality:setQuality,
 stats:()=>({fps,state:G.state,view:G.view,calls:renderer.info.render.calls,tris:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,terrain:scenery?.stats,veg:veg?.stats,pos:spider?.pos,mission:G.mission?.status?.()}),
};
boot().catch(e=>{console.error(e);$('#gen-stage').textContent='Something went wrong while building the country: '+e.message;});
