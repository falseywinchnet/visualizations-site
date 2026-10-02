// Procedural WebAudio: V8, hydraulic pump, valves, pneumatics, tyres by surface, foliage, water,
// rain, wind, birds and crickets, fire, artillery and radio. Starts on the first user gesture.
import {clamp,mix} from './noise.mjs';
export class Sound{
 constructor(){this.ctx=null;this.vol=.7;this.paused=false;this.music=new Music(this);}
 start(){
  if(this.ctx){this.ctx.resume?.();return;}
  let C;try{C=new (window.AudioContext||window.webkitAudioContext)();}catch{return;}this.ctx=C;
  const master=this.master=C.createGain();master.gain.value=this.vol;master.connect(C.destination);
  // exterior bus goes through a low-pass that closes in the cabin view
  this.ext=C.createBiquadFilter();this.ext.type='lowpass';this.ext.frequency.value=18000;this.extG=C.createGain();this.ext.connect(this.extG).connect(master);
  // interior bus: what the cabin itself carries (structure-borne whines, vibration); opens in the seat view
  this.int=C.createGain();this.int.gain.value=0;this.int.connect(master);this.seatK=0;
  const noiseBuf=(sec,kind='white')=>{const n=C.sampleRate*sec,b=C.createBuffer(1,n,C.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<n;i++){const w=Math.random()*2-1;if(kind==='brown'){last=(last+.02*w)/1.02;d[i]=last*3.5;}else d[i]=w;}return b;};
  this.white=noiseBuf(2);this.brown=noiseBuf(3,'brown');
  const loop=(buf,filterType,freq,q=1,dest=this.ext)=>{const s=C.createBufferSource();s.buffer=buf;s.loop=true;const f=C.createBiquadFilter();f.type=filterType;f.frequency.value=freq;f.Q.value=q;const g=C.createGain();g.gain.value=0;s.connect(f).connect(g).connect(dest);s.start();return {s,f,g};};
  // Turbo diesel V8: a heavy, smooth firing thump (one engine cycle of rounded pulses at the cross-plane bank
  // pattern, played at rpm/120 and kept under a low cutoff), a firing-rate sub, injector knock (band-passed noise
  // gated by an impulse train at the firing rate), exhaust roar under load, and a turbo whine that spools with boost.
  const e=this.eng={};
  {const N=4096,wave=new Float32Array(N),banks=[1,0,0,1,0,1,1,0],amp=[1,.95,1.04,.98,1.02,.94,1.05,.97];
   for(let c=0;c<8;c++){const t0=c/8,A=amp[c]*(banks[c]?1:.7);for(let k=0;k<N;k++){let t=k/N-t0;if(t<0)t+=1;const x=t*8;
     if(x<.5){const u=x/.5;wave[k]+=A*(Math.pow(Math.sin(Math.PI*Math.pow(u,.6)),3)-.18);}else wave[k]-=A*.18;}}
   const dft=(w,H)=>{const re=new Float32Array(H+1),im=new Float32Array(H+1);for(let h=1;h<=H;h++){let a=0,b=0;for(let k=0;k<N;k+=2){const ph=2*Math.PI*h*k/N;a+=w[k]*Math.cos(ph);b+=w[k]*Math.sin(ph);}re[h]=a/N*2;im[h]=b/N*2;}return [re,im];};
   const [re,im]=dft(wave,96);e.wave=C.createPeriodicWave(re,im);
   // impulse train (one sharp spike per firing) used to gate the knock noise
   const kre=new Float32Array(25),kim=new Float32Array(25);for(let h=1;h<=24;h++)kre[h]=1-h/26;e.pulse=C.createPeriodicWave(kre,kim);}
  e.osc=C.createOscillator();e.osc.setPeriodicWave(e.wave);
  e.sub=C.createOscillator();e.sub.type='sine';e.subG=C.createGain();e.subG.gain.value=.15;
  e.drive=C.createGain();e.drive.gain.value=1;
  e.sh=C.createWaveShaper();const curve=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/512-1;curve[i]=Math.tanh(x*1.3)/Math.tanh(1.3);}e.sh.curve=curve;
  e.shelf=C.createBiquadFilter();e.shelf.type='peaking';e.shelf.frequency.value=95;e.shelf.Q.value=.8;e.shelf.gain.value=8;
  e.lp=C.createBiquadFilter();e.lp.type='lowpass';e.lp.frequency.value=220;e.lp.Q.value=.7;
  e.lp2=C.createBiquadFilter();e.lp2.type='lowpass';e.lp2.frequency.value=420;e.lp2.Q.value=.5;
  e.g=C.createGain();e.g.gain.value=0;
  e.osc.connect(e.drive).connect(e.sh).connect(e.shelf).connect(e.lp).connect(e.lp2).connect(e.g).connect(this.ext);
  e.sub.connect(e.subG).connect(e.shelf);
  // injector knock: noise x impulse train
  e.knockSrc=C.createBufferSource();e.knockSrc.buffer=this.white;e.knockSrc.loop=true;e.knockBP=C.createBiquadFilter();e.knockBP.type='bandpass';e.knockBP.frequency.value=650;e.knockBP.Q.value=.9;
  e.knockVCA=C.createGain();e.knockVCA.gain.value=0;e.knockOsc=C.createOscillator();e.knockOsc.setPeriodicWave(e.pulse);e.knockDepth=C.createGain();e.knockDepth.gain.value=.6;e.knockOsc.connect(e.knockDepth).connect(e.knockVCA.gain);
  e.knockLP=C.createBiquadFilter();e.knockLP.type='lowpass';e.knockLP.frequency.value=1100;e.knockG=C.createGain();e.knockG.gain.value=0;
  e.knockSrc.connect(e.knockBP).connect(e.knockVCA).connect(e.knockLP).connect(e.knockG).connect(this.ext);
  // turbo: whine plus a breathy intake hiss that both follow boost
  e.turbo=C.createOscillator();e.turbo.type='sine';e.turboG=C.createGain();e.turboG.gain.value=0;e.turbo.connect(e.turboG).connect(this.ext);
  e.intake=loop(this.white,'bandpass',900,1.5);
  e.rumble=loop(this.brown,'lowpass',110,1);e.roar=loop(this.brown,'lowpass',260,.8);
  // combustion is never perfectly even: a slow random wobble on the firing pitch
  e.wob=C.createBufferSource();e.wob.buffer=this.brown;e.wob.loop=true;const wl=C.createBiquadFilter();wl.type='lowpass';wl.frequency.value=5;const wg=C.createGain();wg.gain.value=260;e.wob.connect(wl).connect(wg);wg.connect(e.osc.detune);wg.connect(e.sub.detune);wg.connect(e.knockOsc.detune);e.wob.start();
  e.osc.start();e.sub.start();e.knockSrc.start();e.knockOsc.start();e.turbo.start();e.boost=0;
  // hydraulic pump whine
  this.pump={o:C.createOscillator(),g:C.createGain()};this.pump.o.type='triangle';this.pump.g.gain.value=0;this.pump.o.connect(this.pump.g).connect(this.ext);this.pump.o.start();
  this.pump.o2=C.createOscillator();this.pump.o2.type='sine';this.pump.o2.connect(this.pump.g);this.pump.o2.start();
  // inside the cabin: the pump whine comes through the floor, the hub drives sing with road speed, the cooling fans
  // hum, the road arrives as a low rumble from the pod's measured vertical acceleration, and the engine's firing is
  // felt as a dull thump through the mounts rather than heard
  this.pumpInt=C.createGain();this.pumpInt.gain.value=0;this.pump.g.connect(this.pumpInt).connect(this.int);
  this.drv={o:C.createOscillator(),o2:C.createOscillator(),f:C.createBiquadFilter(),g:C.createGain()};this.drv.o.type='sawtooth';this.drv.o2.type='sawtooth';this.drv.o2.detune.value=9;this.drv.f.type='bandpass';this.drv.f.frequency.value=900;this.drv.f.Q.value=1.6;this.drv.g.gain.value=0;this.drv.o.connect(this.drv.f);this.drv.o2.connect(this.drv.f);this.drv.f.connect(this.drv.g).connect(this.int);this.drv.o.start();this.drv.o2.start();
  this.fan={o:C.createOscillator(),o2:C.createOscillator(),g:C.createGain()};this.fan.o.type='triangle';this.fan.o.frequency.value=118;this.fan.o2.type='sine';this.fan.o2.frequency.value=237;this.fan.g.gain.value=0;this.fan.o.connect(this.fan.g);this.fan.o2.connect(this.fan.g);this.fan.g.connect(this.int);this.fan.o.start();this.fan.o2.start();
  this.vib=loop(this.brown,'lowpass',70,1,this.int);this.vib2=loop(this.white,'bandpass',160,2,this.int);
  this.engInt=C.createBiquadFilter();this.engInt.type='lowpass';this.engInt.frequency.value=130;this.engIntG=C.createGain();this.engIntG.gain.value=0;e.g.connect(this.engInt).connect(this.engIntG).connect(this.int);
  this.creak=loop(this.white,'bandpass',2400,4,this.int);this.vibAcc=0;
  this.hissL=loop(this.white,'highpass',3500,.7);
  this.tyre=loop(this.brown,'bandpass',220,.8);this.gravel=loop(this.white,'bandpass',2600,1.2);this.hum=loop(this.white,'bandpass',420,6);
  this.skid=loop(this.white,'bandpass',1400,3);this.rustle=loop(this.white,'bandpass',4800,.8);this.waterL=loop(this.brown,'lowpass',900,.7);this.splashL=loop(this.white,'bandpass',1800,.6);
  this.rain=loop(this.white,'highpass',5000,.5,master);this.wind=loop(this.brown,'lowpass',500,.5,master);this.fireL=loop(this.brown,'lowpass',260,.6,this.ext);this.river=loop(this.brown,'bandpass',600,.5,this.ext);
  this.crickets={o:C.createOscillator(),am:C.createGain(),g:C.createGain(),lfo:C.createOscillator()};const cr=this.crickets;cr.o.frequency.value=4600;cr.lfo.frequency.value=28;const lg=C.createGain();lg.gain.value=.5;cr.lfo.connect(lg).connect(cr.am.gain);cr.am.gain.value=.5;cr.g.gain.value=0;cr.o.connect(cr.am).connect(cr.g).connect(this.ext);cr.o.start();cr.lfo.start();
  this.t=0;this.nextBird=2;this.prevValve=[false,false,false,false,false,false];this.prevEv=[0,0,0,0,0,0];
  this.music.init();this.applyBody();
 }
 // what the world outside sounds like. Vacuum: nothing carries; what reaches the cabin is structure-borne,
 // dull and quiet. Mars: thin, highs eaten by CO2. Titan: dense air, loud and low, pitch down with the slower
 // sound speed. No birds or crickets off Earth; no injector knock from a closed-cycle pack.
 setBody(B){this.bodyCfg=B.id==='moon'?{cut:260,gain:.35,wind:0,wild:false,knock:0,pitch:1}:B.id==='mars'?{cut:2500,gain:.6,wind:.5,wild:false,knock:0,pitch:.9}:B.id==='titan'?{cut:6000,gain:1.15,wind:1.4,wild:false,knock:0,pitch:.72}:{cut:18000,gain:1,wind:1,wild:true,knock:1,pitch:1};this.applyBody();}
 applyBody(){const c=this.bodyCfg||{cut:18000,gain:1,wind:1,wild:true,knock:1,pitch:1};this.extBase=c.cut;this.windK=c.wind;this.wild=c.wild;this.knockK=c.knock;this.pitchK=c.pitch;if(this.extG)this.extG.gain.setTargetAtTime(c.gain,this.ctx.currentTime,.3);}
 setVolume(v){this.vol=v;if(this.master)this.master.gain.setTargetAtTime(this.paused?0:v,this.ctx.currentTime,.05);}
 pause(p){this.paused=p;if(this.master)this.master.gain.setTargetAtTime(p?0:this.vol,this.ctx.currentTime,.05);}
 set(g,v,tc=.08){g.gain.setTargetAtTime(v,this.ctx.currentTime,tc);}
 burst(dur,freq,q,gain,type='bandpass',dest=this.ext,buf=this.white){if(!this.ctx)return;const C=this.ctx,s=C.createBufferSource();s.buffer=buf;const f=C.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=C.createGain();const t=C.currentTime;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(dest);s.start(t,Math.random());s.stop(t+dur+.05);}
 tone(f0,f1,dur,gain,type='sine',dest=this.ext){if(!this.ctx)return;const C=this.ctx,o=C.createOscillator();o.type=type;const g=C.createGain();const t=C.currentTime;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(dest);o.start(t);o.stop(t+dur+.05);}
 flock(n,dist){if(!this.ctx)return;const k=clamp(1-dist/260,0,1)*Math.min(1,n/6);if(k<=0)return;const C=this.ctx;for(let i=0;i<Math.min(n,8);i++){setTimeout(()=>{this.burst(.06,1500+Math.random()*900,1.2,.09*k,'bandpass');this.burst(.09,520,1.5,.07*k,'bandpass',this.ext,this.brown);},i*70+Math.random()*60);}if(Math.random()<.7)setTimeout(()=>this.tone(2600+Math.random()*800,1800,.12,.05*k,'sine'),200);}
 starter(){if(!this.ctx)return;this.tone(95,150,1.1,.14,'sawtooth');this.tone(190,300,1.1,.05,'square');this.burst(1.1,700,1.5,.08,'bandpass');}
 catchUp(){this.thump(.7);this.burst(.5,220,.7,.5,'lowpass',this.ext,this.brown);}
 engineStop(){this.burst(.8,160,.7,.35,'lowpass',this.ext,this.brown);this.hiss(.5);}
 crack(k=1){this.burst(.12,2200,.7,.9*k,'bandpass');this.burst(.5,500,.8,.5*k,'lowpass',this.ext,this.brown);}
 thump(k=1){this.tone(90,40,.35,.9*k);this.burst(.25,300,.7,.5*k,'lowpass',this.ext,this.brown);}
 hiss(k=1){this.burst(1.6,4200,.5,.25*k,'highpass');}
 squelch(){if(!this.ctx)return;this.music.duckFor(3.5);this.burst(.18,1800,1.5,.25,'bandpass',this.master);this.tone(1200,1200,.08,.08,'square',this.master);}
 boom(dist=300){const k=clamp(1-dist/2500,.05,1);this.burst(1.8,120+300*k,.6,1.2*k,'lowpass',this.master,this.brown);this.tone(60,28,1.2,.8*k,'sine',this.master);}
 whistle(){this.tone(2400,500,1.6,.15,'sine',this.master);}
 splash(k=1){this.burst(.6,1400,.6,.6*k,'bandpass');}
 chirp(){const f=2500+Math.random()*2500;this.tone(f,f*1.4,.08,.05,'sine');setTimeout(()=>this.tone(f*1.2,f*.9,.1,.04,'sine'),110);}
 update(dt,sp,G,cam){
  if(!this.ctx||this.paused)return;this.t+=dt;const C=this.ctx,e=this.eng;
  const rpm=sp.engine.rpm,load=sp.engine.load,fire=rpm/60*4,on=rpm>50,run=clamp(rpm/450,0,1);/* fades out as the engine runs down */
  const now=C.currentTime;e.osc.frequency.setTargetAtTime(Math.max(1,rpm/120),now,.04);e.sub.frequency.setTargetAtTime(Math.max(20,fire),now,.04);e.knockOsc.frequency.setTargetAtTime(Math.max(5,fire),now,.04);
  e.boost+=(load*clamp((rpm-800)/800,0,1)-e.boost)*Math.min(1,dt*1.5);// turbo spools behind the throttle
  e.drive.gain.setTargetAtTime(1+load*1.4,now,.08);e.lp.frequency.setTargetAtTime(150+load*110+rpm*.05,now,.08);e.lp2.frequency.setTargetAtTime(340+load*220,now,.1);
  this.set(e.g,on?(.26+load*.04)*run:0);this.set(e.subG,on?(.14+load*.08)*run:0);
  this.set(e.knockG,on?.45*(1-load*.45)*(1.1-rpm/2400)*run*(this.knockK??1):0);
  const ob=sp.engine.boost||0;e.turbo.frequency.setTargetAtTime(700+e.boost*1300+ob*900,now,.15);this.set(e.turboG,on?e.boost*.004+ob*.012:0,.2);e.intake.f.frequency.setTargetAtTime(600+e.boost*700,now,.2);this.set(e.intake.g,on?e.boost*.04:0,.2);
  this.set(e.rumble.g,on?(.28+load*.2)*run:0);this.set(e.roar.g,on?load*.35:0,.15);
  const flow=sp.engine.pumpFlow||0;this.pump.o.frequency.setTargetAtTime(70+rpm*.05,C.currentTime,.05);this.pump.o2.frequency.setTargetAtTime(140+rpm*.1,C.currentTime,.05);this.set(this.pump.g,clamp(flow/.006,0,1)*.07);
  // valve clicks on leg reversals, accumulator thumps on hard compressions
  // (the levelling servo reverses its valves every few milliseconds; clicking on those read as a Geiger counter)
  sp.wheels.forEach((w,i)=>{const lf=!!w.lifted;if(lf!==this.prevValve[i])this.burst(.05,900,2,.06,'bandpass',this.ext,this.brown);this.prevValve[i]=lf;if(w.ev<-.9&&this.prevEv[i]>=-.9)this.tone(70,40,.25,.35);this.prevEv[i]=w.ev;});
  this.set(this.hissL.g,sp.hiss?.05:0,.2);
  const speed=sp.speed(),s=sp.wheels[2].surface||{};const contact=sp.wheels.some(w=>w.contact);
  this.set(this.tyre.g,contact?clamp(speed/12,0,1)*.35:0);this.tyre.f.frequency.setTargetAtTime(120+speed*18,C.currentTime,.1);
  this.set(this.gravel.g,contact&&(s.name==='Gravel'||s.name==='Rock'||s.name==='Riverbed')?clamp(speed/10,0,1)*(.12+.05*Math.sin(this.t*7.3)*Math.sin(this.t*2.9)):0,.15);
  this.set(this.hum.g,contact&&s.name==='Asphalt'?clamp(speed/15,0,1)*.08:0);this.hum.f.frequency.setTargetAtTime(200+speed*25,C.currentTime,.1);
  const slip=Math.max(...sp.wheels.map(w=>w.contact?Math.abs(w.slip)+Math.abs(w.slipAngle)*.5:0));this.set(this.skid.g,slip>.2&&speed>1?clamp((slip-.2)*.6,0,.25):0);
  this.set(this.rustle.g,clamp(sp.brush*.25,0,.35)+(G.brushCrop||0)*.05,.05);
  this.set(this.waterL.g,clamp((sp.wading||0)*.25,0,.5));this.set(this.splashL.g,(sp.wading||0)>.2?clamp(speed/5,0,1)*.3:0);
  const w=G.atmo?.weather,wk=this.windK??1;this.set(this.rain.g,w==='rain'?.14*(1-.5*this.seatK):0,.5);this.set(this.wind.g,(.03+clamp(speed/20,0,1)*.08+(G.view==='seat'?0:.03))*wk,.3);this.wind.f.frequency.setTargetAtTime(500*(this.pitchK??1),C.currentTime,.3);
  const night=G.atmo?.night||0,wild=this.wild!==false;this.set(this.crickets.g,wild&&night>.4&&w!=='rain'?.012:0,1);
  if(wild&&night<.5&&w!=='rain'&&w!=='smoke'){this.nextBird-=dt;if(this.nextBird<0){this.chirp();this.nextBird=1.5+Math.random()*6;}}
  this.set(this.fireL.g,clamp(G.fireNear||0,0,1)*.4,.3);if((G.fireNear||0)>.2&&Math.random()<G.fireNear*.3)this.burst(.05,1800+Math.random()*2000,2,.1*G.fireNear);
  this.set(this.river.g,clamp(G.riverNear||0,0,1)*.08,.5);
  const seat=G.view==='seat';this.seatK+=((seat?1:0)-this.seatK)*Math.min(1,dt*5);const k=this.seatK;
  const base=this.extBase||18000;this.ext.frequency.setTargetAtTime(seat?Math.min(1400,base):base,C.currentTime,.2);const bg=(this.bodyCfg||{gain:1}).gain;this.extG.gain.setTargetAtTime(bg*(1-.55*k),C.currentTime,.2);
  this.int.gain.setTargetAtTime(k,C.currentTime,.15);
  if(k>.01){const flowK=clamp(flow/.006,0,1);this.pumpInt.gain.setTargetAtTime(1.6+flowK*1.2,C.currentTime,.1);
   // hub drives: pitch with wheel speed (one motor pole pass per ~0.08 m of road), louder under torque and on the overrun
   const tq=sp.wheels.reduce((a,w)=>a+Math.abs(w.torque||0),0)/6,tqK=clamp(tq/9000,0,1);const f0=40+speed*12.5;this.drv.o.frequency.setTargetAtTime(f0,C.currentTime,.08);this.drv.o2.frequency.setTargetAtTime(f0*2.02,C.currentTime,.08);this.drv.f.frequency.setTargetAtTime(Math.max(200,f0*3),C.currentTime,.1);this.set(this.drv.g,on?clamp(speed/9,0,1)*(.012+.03*tqK):0,.12);
   this.set(this.fan.g,on?.014+.02*load+.02*(sp.engine.heat||0):0,.4);
   // road vibration from the pod's own vertical acceleration, fast attack, slow release; and the surface's grain
   const az=Math.abs(sp.cabinAcc?.[1]||0);this.vibAcc=az>this.vibAcc?az:this.vibAcc+(az-this.vibAcc)*Math.min(1,dt*3);const rough=(s.soft||0)*.6+(s.name==='Gravel'||s.name==='Rock'||s.name==='Riverbed'||s.name==='Ejecta'||s.name==='Ice cobbles'?.5:0)+(s.name==='Asphalt'?0:.15);
   this.set(this.vib.g,contact?clamp(this.vibAcc/4,0,1)*.6+clamp(speed/15,0,1)*rough*.18:0,.08);this.set(this.vib2.g,contact?clamp(speed/12,0,1)*rough*.05+clamp(this.vibAcc/6,0,1)*.08:0,.1);this.vib.f.frequency.setTargetAtTime(55+speed*1.5,C.currentTime,.3);
   this.engIntG.gain.setTargetAtTime(on?1.3:0,C.currentTime,.2);
   // the cage creaks when the body twists
   this.set(this.creak.g,clamp((Math.abs(sp.roll||0)+Math.abs(sp.pitch||0))/40,0,1)*clamp(this.vibAcc/3,0,1)*.03,.2);}
  else{this.set(this.drv.g,0,.1);this.set(this.vib.g,0,.1);this.set(this.vib2.g,0,.1);this.set(this.fan.g,0,.1);this.set(this.creak.g,0,.1);}
 }
}

// ------------------------------------------------------------------ adaptive action score
// A generative, tempo-locked score: pads, a driving bass ostinato, drums, taiko hits, brass stabs and
// an arpeggio. Layers enter as `intensity` rises (speed, threat, fire, pursuit). Scheduled ahead on
// the audio clock so timing never depends on the frame rate.
const MOODS={
 menu:{root:45,bpm:96,prog:[[0,3,7],[8,12,15],[3,7,10],[10,14,17]],base:.12},
 free:{root:45,bpm:112,prog:[[0,3,7],[8,12,15],[3,7,10],[10,14,17]],alt:[[0,3,7],[5,8,12],[8,12,15],[7,11,14]],base:.3},
 fire:{root:38,bpm:128,prog:[[0,3,7],[8,12,15],[5,8,12],[7,11,14]],alt:[[0,3,7],[1,5,8],[8,12,15],[7,11,14]],base:.45},
 rescue:{root:40,bpm:118,prog:[[0,3,7],[8,12,15],[3,7,10],[10,14,17]],alt:[[0,3,7],[10,14,17],[8,12,15],[7,11,14]],base:.35},
 pursuit:{root:44,bpm:136,prog:[[0,3,7],[0,3,7],[8,12,15],[10,14,17]],alt:[[0,3,7],[5,8,12],[1,5,8],[7,11,14]],base:.5},
 crossing:{root:42,bpm:100,prog:[[0,3,7],[1,5,8],[0,3,7],[10,13,17]],alt:[[0,3,7],[8,11,15],[5,8,12],[7,10,14]],base:.15},
};
const mtof=m=>440*Math.pow(2,(m-69)/12);
export class Music{
 constructor(snd){this.s=snd;this.on=true;this.vol=.55;this.mood=MOODS.menu;this.moodName='menu';this.int=0;this.target=0;this.step=0;this.bar=0;this.next=0;this.timer=null;this.duck=1;}
 init(){
  const C=this.s.ctx;if(!C||this.bus)return;
  this.bus=C.createGain();this.bus.gain.value=this.on?this.vol:0;
  const comp=C.createDynamicsCompressor();comp.threshold.value=-16;comp.ratio.value=4;comp.attack.value=.01;comp.release.value=.2;
  this.duckG=C.createGain();const trim=C.createGain();trim.gain.value=.6;this.bus.connect(this.duckG).connect(comp).connect(trim).connect(this.s.master);
  // space: a feedback delay and a short generated reverb
  this.dry=C.createGain();this.dry.connect(this.bus);
  this.delay=C.createDelay(1);this.fb=C.createGain();this.fb.gain.value=.28;this.wetD=C.createGain();this.wetD.gain.value=.22;this.delay.connect(this.fb).connect(this.delay);this.delay.connect(this.wetD).connect(this.bus);
  const len=C.sampleRate*2.2,ir=C.createBuffer(2,len,C.sampleRate);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2);}
  this.rev=C.createConvolver();this.rev.buffer=ir;this.wetR=C.createGain();this.wetR.gain.value=.3;this.rev.connect(this.wetR).connect(this.bus);
  this.next=C.currentTime+.1;this.timer=setInterval(()=>this.schedule(),40);
 }
 setMood(name){if(!MOODS[name]||name===this.moodName)return;this.moodName=name;this.mood=MOODS[name];this.bar=0;this.step=0;if(this.s.ctx)this.next=Math.max(this.next,this.s.ctx.currentTime+.05);}
 setOn(v){this.on=v;if(this.bus)this.bus.gain.setTargetAtTime(v?this.vol:0,this.s.ctx.currentTime,.3);}
 setVolume(v){this.vol=v;if(this.bus&&this.on)this.bus.gain.setTargetAtTime(v,this.s.ctx.currentTime,.1);}
 duckFor(sec){if(!this.duckG)return;const t=this.s.ctx.currentTime;this.duckG.gain.cancelScheduledValues(t);this.duckG.gain.setTargetAtTime(.45,t,.05);this.duckG.gain.setTargetAtTime(1,t+sec,.5);}
 setIntensity(x){this.target=Math.max(0,Math.min(1,x));}
 // --- voices
 out(dly=0,rev=.3){const C=this.s.ctx,g=C.createGain();g.connect(this.dry);if(dly>0){const s=C.createGain();s.gain.value=dly;g.connect(s).connect(this.delay);}if(rev>0){const s=C.createGain();s.gain.value=rev;g.connect(s).connect(this.rev);}return g;}
 env(g,t,a,peak,d,sus,r,len){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(peak*sus,t+a,d);g.gain.setTargetAtTime(0,t+len,r);}
 kick(t,v){const C=this.s.ctx,o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.35);o.connect(g).connect(this.out(0,.05));o.start(t);o.stop(t+.4);}
 noise(t,dur,type,freq,q,v,rev=.2){const C=this.s.ctx,s=C.createBufferSource();s.buffer=this.s.white;const f=C.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=C.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(this.out(0,rev));s.start(t,Math.random()*1.5);s.stop(t+dur+.02);}
 snare(t,v){this.noise(t,.18,'bandpass',1900,.8,v,.35);const C=this.s.ctx,o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(210,t);o.frequency.exponentialRampToValueAtTime(140,t+.08);g.gain.setValueAtTime(v*.6,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);o.connect(g).connect(this.out(0,.2));o.start(t);o.stop(t+.15);}
 hat(t,v,open=false){this.noise(t,open?.22:.045,'highpass',7500,.7,v,.08);}
 taiko(t,v,f=70){const C=this.s.ctx,o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(f*1.6,t);o.frequency.exponentialRampToValueAtTime(f,t+.09);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.7);o.connect(g).connect(this.out(0,.5));o.start(t);o.stop(t+.8);this.noise(t,.08,'lowpass',900,.5,v*.5,.4);}
 bass(t,m,len,v){const C=this.s.ctx,o=C.createOscillator(),o2=C.createOscillator(),f=C.createBiquadFilter(),g=C.createGain();o.type='sawtooth';o2.type='square';o.frequency.value=mtof(m);o2.frequency.value=mtof(m)*.5;f.type='lowpass';f.Q.value=6;f.frequency.setValueAtTime(180+this.int*900,t);f.frequency.exponentialRampToValueAtTime(120,t+len);const g2=C.createGain();g2.gain.value=.5;o2.connect(g2).connect(f);o.connect(f).connect(g).connect(this.out(0,.04));this.env(g,t,.005,v,.08,.55,.03,len*.9);o.start(t);o2.start(t);o.stop(t+len+.2);o2.stop(t+len+.2);}
 pad(t,notes,len,v){const C=this.s.ctx,f=C.createBiquadFilter();f.type='lowpass';f.frequency.value=900+this.int*1600;f.Q.value=.7;const g=C.createGain();f.connect(g).connect(this.out(.05,.7));this.env(g,t,len*.25,v,len,1,len*.2,len*.95);
  for(const m of notes)for(const det of [-8,7]){const o=C.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=det;o.connect(f);o.start(t);o.stop(t+len*1.3);}}
 stab(t,notes,v){const C=this.s.ctx,f=C.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(2800,t);f.frequency.exponentialRampToValueAtTime(700,t+.3);const g=C.createGain();f.connect(g).connect(this.out(.2,.45));g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.45);
  for(const m of notes)for(const det of [-12,0,11]){const o=C.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=det;o.connect(f);o.start(t);o.stop(t+.5);}}
 arp(t,m,v){const C=this.s.ctx,o=C.createOscillator(),f=C.createBiquadFilter(),g=C.createGain();o.type='square';o.frequency.value=mtof(m);f.type='lowpass';f.frequency.value=2400;o.connect(f).connect(g).connect(this.out(.35,.25));g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.14);o.start(t);o.stop(t+.16);}
 // --- the sequencer
 schedule(){
  const C=this.s.ctx;if(!C||this.s.paused||!this.on)return;if(this.next<C.currentTime-.2)this.next=C.currentTime+.05;
  while(this.next<C.currentTime+.3){this.playStep(this.next);this.next+=60/this.mood.bpm/4;}
 }
 playStep(t){
  const M=this.mood,s=this.step%16,beat=60/M.bpm;this.int+=(Math.max(this.target,M.base*.6)-this.int)*.02;const I=this.int;
  const phrase=Math.floor(this.bar/8)%2,prog=phrase&&M.alt?M.alt:M.prog,ch=prog[this.bar%4],R=M.root;
  const build=this.bar%8===7&&s>=8;// fill into the next phrase
  // pads on each bar
  if(s===0)this.pad(t,ch.map(n=>R+24+n),beat*4,.05+.03*(1-I));
  // bass ostinato
  const bassPat=I<.25?[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]:I<.55?[1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,1]:[1,1,1,2,1,1,1,1,1,1,2,1,1,1,1,2];
  if(bassPat[s])this.bass(t,R+ch[0]+(bassPat[s]===2?12:0),beat*(I<.25?.9:.24),.22+.12*I);
  // drums
  if(I>.22){const kick=I<.5?[1,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0]:[1,0,0,1,0,0,1,0,1,0,1,0,0,1,0,0];if(kick[s])this.kick(t,.55+.3*I);
   if(I>.4&&(s===4||s===12))this.snare(t,.28+.2*I);
   if(s%2===0||I>.6)this.hat(t,s%4===2?.09:.05,I>.7&&s===14);}
  if(build&&I>.35){if(s%2===0||I>.7)this.snare(t,.12+.2*(s-8)/8);}
  if(I>.7&&(s===0||s===10))this.taiko(t,.5,s===0?62:78);
  if(I>.6&&s===0&&this.bar%2===0)this.stab(t,ch.map(n=>R+36+n),.14);
  if(I>.78&&(s===6||s===14))this.stab(t,ch.map(n=>R+36+n),.09);
  // arpeggio
  if(I>.45){const tones=[...ch,ch[0]+12,ch[1]+12];const k=(s*3+this.bar)%tones.length;this.arp(t,R+36+tones[k],.035+.03*I);}
  if(s===15){this.bar++;}this.step++;
 }
 stinger(ok){const C=this.s.ctx;if(!C||!this.bus)return;const t=C.currentTime+.05,R=this.mood.root;if(ok){this.stab(t,[R+24,R+28,R+31,R+36],.2);this.pad(t,[R+24,R+28,R+31,R+36],3,.12);this.taiko(t,.7,60);}else{this.pad(t,[R+12,R+13,R+19],3.5,.14);this.taiko(t,.8,48);}this.setIntensity(0);}
}
