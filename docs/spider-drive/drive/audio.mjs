// Procedural WebAudio: V8, hydraulic pump, valves, pneumatics, tyres by surface, foliage, water,
// rain, wind, birds and crickets, fire, artillery and radio. Starts on the first user gesture.
import {clamp,mix} from './noise.mjs';
// Approved 'Deeper throat' audition: +4 dB on Earth engine layers only.
const EARTH_ENGINE_GAIN=10**(4/20);
// Sound-design rev range, independent of the power/pump simulation and RPM HUD.
// Preserve cranking/run-down to zero; map 550–1900 physical rpm to 500–1250.
export function earthVoiceRpm(rpm){return rpm<=550?Math.max(0,rpm)*500/550:500+clamp((rpm-550)/1350,0,1)*750;}
export class Sound{
 constructor(){this.ctx=null;this.vol=.7;this.paused=false;this.music=new Music(this);}
 start(){
  if(this.ctx){this.ctx.resume?.();return;}
  let C;try{C=new (window.AudioContext||window.webkitAudioContext)();}catch{return;}this.ctx=C;
  const master=this.master=C.createGain();master.gain.value=this.vol;
  // a brick-wall-ish limiter on the way out: a crash, a boom and the music together must not clip (clipping crackles)
  const lim=this.limiter=C.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=4;lim.ratio.value=16;lim.attack.value=.002;lim.release.value=.2;master.connect(lim).connect(C.destination);
  // exterior bus goes through a low-pass that closes in the cabin view
  this.ext=C.createBiquadFilter();this.ext.type='lowpass';this.ext.frequency.value=18000;this.extG=C.createGain();this.ext.connect(this.extG).connect(master);
  // interior bus: what the cabin itself carries (structure-borne whines, vibration); opens in the seat view
  this.int=C.createGain();this.int.gain.value=0;this.int.connect(master);this.seatK=0;
  const noiseBuf=(sec,kind='white')=>{const n=C.sampleRate*sec,b=C.createBuffer(1,n,C.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<n;i++){const w=Math.random()*2-1;if(kind==='brown'){last=(last+.02*w)/1.02;d[i]=last*3.5;}else d[i]=w;}return b;};
  this.white=noiseBuf(2);this.brown=noiseBuf(3,'brown');
  const loop=(buf,filterType,freq,q=1,dest=this.ext)=>{const s=C.createBufferSource();s.buffer=buf;s.loop=true;const f=C.createBiquadFilter();f.type=filterType;f.frequency.value=freq;f.Q.value=q;const g=C.createGain();g.gain.value=0;s.connect(f).connect(g).connect(dest);s.start();return {s,f,g};};
  // Turbo diesel V8: a heavy, smooth firing thump (one engine cycle of rounded pulses at the cross-plane bank
  // pattern, played at rpm/120 and kept under a low cutoff), a bank-cadence sub, injector knock (band-passed noise
  // gated by an impulse train at the firing rate), exhaust roar under load, and a turbo whine that spools with boost.
  const e=this.eng={};
  e.mix=C.createGain();e.mix.gain.value=EARTH_ENGINE_GAIN;
  // Asymmetric saturation can add DC. Remove it before the shared limiter.
  e.dc=C.createBiquadFilter();e.dc.type='highpass';e.dc.frequency.value=5;e.dc.Q.value=.707;
  e.mix.connect(e.dc).connect(this.ext);
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
  e.shelf=C.createBiquadFilter();e.shelf.type='peaking';e.shelf.frequency.value=76;e.shelf.Q.value=.72;e.shelf.gain.value=11;
  e.lp=C.createBiquadFilter();e.lp.type='lowpass';e.lp.frequency.value=220;e.lp.Q.value=.7;
  e.lp2=C.createBiquadFilter();e.lp2.type='lowpass';e.lp2.frequency.value=420;e.lp2.Q.value=.5;
  e.g=C.createGain();e.g.gain.value=0;
  e.osc.connect(e.drive).connect(e.sh).connect(e.shelf).connect(e.lp).connect(e.lp2).connect(e.g).connect(e.mix);
  e.sub.connect(e.subG).connect(e.shelf);
  // injector knock: noise x impulse train
  e.knockSrc=C.createBufferSource();e.knockSrc.buffer=this.white;e.knockSrc.loop=true;e.knockBP=C.createBiquadFilter();e.knockBP.type='bandpass';e.knockBP.frequency.value=480;e.knockBP.Q.value=.9;
  e.knockVCA=C.createGain();e.knockVCA.gain.value=0;e.knockOsc=C.createOscillator();e.knockOsc.setPeriodicWave(e.pulse);e.knockDepth=C.createGain();e.knockDepth.gain.value=.6;e.knockOsc.connect(e.knockDepth).connect(e.knockVCA.gain);
  e.knockLP=C.createBiquadFilter();e.knockLP.type='lowpass';e.knockLP.frequency.value=820;e.knockG=C.createGain();e.knockG.gain.value=0;
  e.knockSrc.connect(e.knockBP).connect(e.knockVCA).connect(e.knockLP).connect(e.knockG).connect(e.mix);
  // turbo: whine plus a breathy intake hiss that both follow boost
  e.turbo=C.createOscillator();e.turbo.type='sine';e.turboG=C.createGain();e.turboG.gain.value=0;e.turbo.connect(e.turboG).connect(e.mix);
  e.airLP=C.createBiquadFilter();e.airLP.type='lowpass';e.airLP.frequency.value=1800;e.airLP.Q.value=.7;e.airLP.connect(e.mix);
  e.intake=loop(this.white,'bandpass',740,.55,e.airLP);
  // Same white + slow pressure-noise blend as the approved audition.
  const fanBuf=C.createBuffer(1,this.white.length,C.sampleRate),fd=fanBuf.getChannelData(0),wd=this.white.getChannelData(0);let fb=0;
  const memory=Math.pow(.983,44100/C.sampleRate);
  for(let i=0;i<fd.length;i++){fb=memory*fb+(1-memory)*wd[i];fd[i]=wd[i]*.25+fb*3.5;}
  e.cooling=loop(fanBuf,'lowpass',350,.55,e.mix);
  e.rumble=loop(this.brown,'lowpass',80,1,e.mix);e.roar=loop(this.brown,'lowpass',180,.8,e.mix);
  // combustion is never perfectly even: a slow random wobble on the firing pitch
  e.wob=C.createBufferSource();e.wob.buffer=this.brown;e.wob.loop=true;const wl=C.createBiquadFilter();wl.type='lowpass';wl.frequency.value=5;const wg=C.createGain();wg.gain.value=260;e.wob.connect(wl).connect(wg);wg.connect(e.osc.detune);wg.connect(e.sub.detune);wg.connect(e.knockOsc.detune);e.wob.start();
  e.osc.start();e.sub.start();e.knockSrc.start();e.knockOsc.start();e.turbo.start();e.boost=0;
  // electric drive (off Earth: no oxygen to burn): six hub-motor inverters singing with wheel speed (a saw and its
  // third harmonic through a resonant band), the PWM carrier as a thin high tone, the fuel-cell air/reactant blower
  // as a whirring turbine that follows the power drawn, and a coolant pump hum. Exterior and structure-borne copies.
  {const el=this.el={},mk=(type,f)=>{const o=C.createOscillator();o.type=type;o.frequency.value=f;o.start();return o;};
   el.inv=mk('sawtooth',200);el.inv3=mk('triangle',600);el.invBP=C.createBiquadFilter();el.invBP.type='bandpass';el.invBP.Q.value=3;el.invBP.frequency.value=900;el.invG=C.createGain();el.invG.gain.value=0;
   el.inv.connect(el.invBP);el.inv3.connect(el.invBP);el.invBP.connect(el.invG);
   el.car=mk('sine',3150);el.carG=C.createGain();el.carG.gain.value=0;el.car.connect(el.carG);
   el.blade=mk('sine',520);el.bladeG=C.createGain();el.bladeG.gain.value=0;el.blade.connect(el.bladeG);
   el.cool=mk('sine',58);el.cool2=mk('sine',117);el.coolG=C.createGain();el.coolG.gain.value=0;el.cool.connect(el.coolG);el.cool2.connect(el.coolG);
   el.mix=C.createGain();el.mix.gain.value=1;for(const g of [el.invG,el.carG,el.bladeG,el.coolG])g.connect(el.mix);el.mix.connect(this.ext);
   el.intF=C.createBiquadFilter();el.intF.type='lowpass';el.intF.frequency.value=1800;el.intG=C.createGain();el.intG.gain.value=0;el.mix.connect(el.intF).connect(el.intG).connect(this.int);
   el.air=loop(this.white,'bandpass',800,2.2);}
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
  this.engInt=C.createBiquadFilter();this.engInt.type='lowpass';this.engInt.frequency.value=130;this.engIntG=C.createGain();this.engIntG.gain.value=0;e.dc.connect(this.engInt).connect(this.engIntG).connect(this.int);
  this.creak=loop(this.white,'bandpass',2400,4,this.int);this.vibAcc=0;
  this.hissL=loop(this.white,'highpass',3500,.7);
  this.tyre=loop(this.brown,'bandpass',220,.8);this.gravel=loop(this.white,'bandpass',2600,1.2);this.hum=loop(this.white,'bandpass',420,6);
  this.skid=loop(this.white,'bandpass',1400,3);this.armL=loop(this.brown,'bandpass',380,.9);this.rustle=loop(this.white,'bandpass',4800,.8);this.waterL=loop(this.brown,'lowpass',900,.7);this.splashL=loop(this.white,'bandpass',1800,.6);
  this.rain=loop(this.white,'highpass',5000,.5,master);this.wind=loop(this.brown,'lowpass',500,.5,master);this.fireL=loop(this.brown,'lowpass',260,.6,this.ext);this.river=loop(this.brown,'bandpass',600,.5,this.ext);
  this.crickets={o:C.createOscillator(),am:C.createGain(),g:C.createGain(),lfo:C.createOscillator()};const cr=this.crickets;cr.o.frequency.value=4600;cr.lfo.frequency.value=28;const lg=C.createGain();lg.gain.value=.5;cr.lfo.connect(lg).connect(cr.am.gain);cr.am.gain.value=.5;cr.g.gain.value=0;cr.o.connect(cr.am).connect(cr.g).connect(this.ext);cr.o.start();cr.lfo.start();
  this.t=0;this.nextBird=2;this.prevValve=[false,false,false,false,false,false];this.prevEv=[0,0,0,0,0,0];
  this.music.init();this.applyBody();
 }
 // what the world outside sounds like. Vacuum: nothing carries; what reaches the cabin is structure-borne,
 // dull and quiet. Mars: thin, highs eaten by CO2. Titan: dense air, loud and low, pitch down with the slower
 // sound speed. No birds or crickets off Earth; no injector knock from a closed-cycle pack.
 setBody(B){this.electric=B.id!=='earth';this.bodyCfg=B.id==='moon'?{cut:260,gain:.35,wind:0,wild:false,knock:0,pitch:1}:B.id==='mars'?{cut:2500,gain:.6,wind:.5,wild:false,knock:0,pitch:.9}:B.id==='titan'?{cut:6000,gain:1.15,wind:1.4,wild:false,knock:0,pitch:.72}:{cut:18000,gain:1,wind:1,wild:true,knock:1,pitch:1};this.applyBody();}
 applyBody(){const c=this.bodyCfg||{cut:18000,gain:1,wind:1,wild:true,knock:1,pitch:1};this.extBase=c.cut;this.windK=c.wind;this.wild=c.wild;this.knockK=c.knock;this.pitchK=c.pitch;if(this.extG)this.extG.gain.setTargetAtTime(c.gain,this.ctx.currentTime,.3);}
 setVolume(v){this.vol=v;if(this.master)this.master.gain.setTargetAtTime(this.paused?0:v,this.ctx.currentTime,.05);}
 pause(p){this.paused=p;if(this.master)this.master.gain.setTargetAtTime(p?0:this.vol,this.ctx.currentTime,.05);}
 set(g,v,tc=.08){g.gain.setTargetAtTime(v,this.ctx.currentTime,tc);}
 burst(dur,freq,q,gain,type='bandpass',dest=this.ext,buf=this.white){if(!this.ctx)return;const C=this.ctx,s=C.createBufferSource();s.buffer=buf;const f=C.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=C.createGain();const t=C.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(dest);s.start(t,Math.random());s.stop(t+dur+.05);}
 tone(f0,f1,dur,gain,type='sine',dest=this.ext){if(!this.ctx)return;const C=this.ctx,o=C.createOscillator();o.type=type;const g=C.createGain();const t=C.currentTime;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(dest);o.start(t);o.stop(t+dur+.05);}
 flock(n,dist){if(!this.ctx)return;const k=clamp(1-dist/260,0,1)*Math.min(1,n/6);if(k<=0)return;const C=this.ctx;for(let i=0;i<Math.min(n,8);i++){setTimeout(()=>{this.burst(.06,1500+Math.random()*900,1.2,.09*k,'bandpass');this.burst(.09,520,1.5,.07*k,'bandpass',this.ext,this.brown);},i*70+Math.random()*60);}if(Math.random()<.7)setTimeout(()=>this.tone(2600+Math.random()*800,1800,.12,.05*k,'sine'),200);}
 starter(){if(!this.ctx)return;if(this.electric){this.tone(160,120,.12,.3,'square');this.burst(.06,2400,3,.1,'bandpass');this.tone(240,1400,.5,.05,'triangle');return;}this.tone(95,150,1.1,.14,'sawtooth');this.tone(190,300,1.1,.05,'square');this.burst(1.1,700,1.5,.08,'bandpass');}
 catchUp(){if(this.electric){this.tone(880,880,.12,.04,'sine');setTimeout(()=>this.tone(1320,1320,.16,.04,'sine'),140);return;}this.thump(.7);this.burst(.5,220,.7,.5,'lowpass',this.ext,this.brown);}
 engineStop(){if(this.electric){this.tone(1400,120,1.2,.05,'triangle');this.tone(140,90,.12,.25,'square');return;}this.burst(.8,160,.7,.35,'lowpass',this.ext,this.brown);this.hiss(.5);}
 crack(k=1){this.burst(.12,2200,.7,.9*k,'bandpass');this.burst(.5,500,.8,.5*k,'lowpass',this.ext,this.brown);}
 thump(k=1){this.tone(90,40,.35,.9*k);this.burst(.25,300,.7,.5*k,'lowpass',this.ext,this.brown);}
 hiss(k=1){this.burst(1.6,4200,.5,.25*k,'highpass');}
 // self-righting arms: the hydraulic drive's whine comes from the pump (its flow already includes the arms); these are the
 // mechanical events, a valve thunk as the drive engages, a hard clunk as each segment reaches its stop, a seat-in thud on stowing
 arm(k){if(!this.ctx)return;if(k==='start'){this.burst(.08,700,2,.12,'bandpass',this.ext,this.brown);this.tone(140,90,.25,.18,'triangle');}
  else if(k==='clunk'){this.tone(220,120,.12,.3,'square');this.burst(.1,1600,2.5,.18,'bandpass');this.tone(70,45,.3,.35);}
  else if(k==='stow'){this.tone(110,60,.35,.32);this.burst(.2,500,1.2,.14,'bandpass',this.ext,this.brown);}}
 squelch(){if(!this.ctx)return;this.music.duckFor(3.5);this.burst(.18,1800,1.5,.25,'bandpass',this.master);this.tone(1200,1200,.08,.08,'square',this.master);}
 boom(dist=300){const k=clamp(1-dist/2500,.05,1);this.burst(1.8,120+300*k,.6,1.2*k,'lowpass',this.master,this.brown);this.tone(60,28,1.2,.8*k,'sine',this.master);}
 whistle(){this.tone(2400,500,1.6,.15,'sine',this.master);}
 splash(k=1){this.burst(.6,1400,.6,.6*k,'bandpass');}
 chirp(){const f=2500+Math.random()*2500;this.tone(f,f*1.4,.08,.05,'sine');setTimeout(()=>this.tone(f*1.2,f*.9,.1,.04,'sine'),110);}
 update(dt,sp,G,cam){
  if(!this.ctx||this.paused)return;this.t+=dt;const C=this.ctx,e=this.eng;
  const rpm=sp.engine.rpm,load=clamp(sp.engine.load,0,1),on=rpm>50;
  const voiceRpm=earthVoiceRpm(rpm),fire=voiceRpm/60*4,run=clamp(voiceRpm/450,0,1);
  const V8=!this.electric&&!sp.engine.off&&!sp.engine.stalled&&on;
  const now=C.currentTime;e.osc.frequency.setTargetAtTime(Math.max(1,voiceRpm/120),now,.04);e.sub.frequency.setTargetAtTime(Math.max(15,fire/2),now,.08);e.knockOsc.frequency.setTargetAtTime(Math.max(5,fire),now,.04);
  const demand=V8?load*clamp((voiceRpm-420)/550,0,1):0;
  e.boost+=(demand-e.boost)*(1-Math.exp(-dt/(demand>e.boost?1.7:1.1)));
  e.drive.gain.setTargetAtTime(1.15+load*1.7,now,.15);e.lp.frequency.setTargetAtTime(125+load*70+voiceRpm*.025,now,.12);e.lp2.frequency.setTargetAtTime(240+load*110,now,.12);
  this.set(e.g,V8?(.26+load*.04)*run:0);this.set(e.subG,V8?(.20+load*.12)*run:0,.15);
  this.set(e.knockG,V8?.13*(1-load*.35)*run:0,.12);
  {const el=this.el,live=this.electric&&!sp.engine.off&&!sp.engine.stalled,v=Math.abs(sp.speed?sp.speed():0),ob=sp.engine.boost||0,dp=clamp((sp.engine.drivePower||0)/1.25e6,0,1.6);
   const f=95+v*36;el.inv.frequency.setTargetAtTime(f,now,.05);el.inv3.frequency.setTargetAtTime(f*3,now,.05);el.invBP.frequency.setTargetAtTime(500+f*1.6,now,.08);
   this.set(el.invG,live?(.012+dp*.05+ob*.02)*Math.min(1,.25+v/4):0,.06);
   el.car.frequency.setTargetAtTime(3150+dp*240,now,.1);this.set(el.carG,live?.0025+dp*.006:0,.1);
   el.blade.frequency.setTargetAtTime(380+dp*900+ob*500,now,.4);this.set(el.bladeG,live?.006+dp*.016:0,.3);
   el.air.f.frequency.setTargetAtTime(600+dp*1400,now,.4);this.set(el.air.g,live?.02+dp*.06:0,.3);
   this.set(el.coolG,live?.05:0,.4);this.set(el.intG,this.electric?this.seatK*1.6:0,.2);}
  e.turbo.frequency.setTargetAtTime(1050+e.boost*1400+5*Math.sin(this.t*8),now,.15);this.set(e.turboG,V8?.006*e.boost*run:0,V8?.2:.08);
  this.set(e.intake.g,V8?(.012+.09*e.boost)*run:0,V8?.2:.08);this.set(e.cooling.g,V8?(.025+.075*e.boost)*run:0,V8?.2:.08);
  e.roar.f.frequency.setTargetAtTime(150+55*load,now,.2);
  this.set(e.rumble.g,V8?(.32+load*.20)*run:0,V8?.2:.08);this.set(e.roar.g,V8?(.10+load*.30)*run:0,V8?.25:.08);
  const flow=sp.engine.pumpFlow||0;this.pump.o.frequency.setTargetAtTime(70+rpm*.05,C.currentTime,.05);this.pump.o2.frequency.setTargetAtTime(140+rpm*.1,C.currentTime,.05);this.set(this.pump.g,clamp(flow/.006,0,1)*.07);
  // valve clicks on leg reversals, accumulator thumps on hard compressions
  // (the levelling servo reverses its valves every few milliseconds; clicking on those read as a Geiger counter)
  sp.wheels.forEach((w,i)=>{const lf=!!w.lifted;if(lf!==this.prevValve[i])this.burst(.05,900,2,.06,'bandpass',this.ext,this.brown);this.prevValve[i]=lf;if(w.ev<-.9&&this.prevEv[i]>=-.9&&this.t-(this.thumpT?.[i]??-9)>.35){(this.thumpT||(this.thumpT=[]))[i]=this.t;this.tone(70,40,.25,clamp((-w.ev-.9)*.12,.04,.2));}this.prevEv[i]=w.ev;/* an accumulator thump on a hard compression: scaled by the blow, not every rattle */});
  this.set(this.hissL.g,sp.hiss?.05:0,.2);
  const speed=sp.speed(),s=sp.wheels[2].surface||{};const contact=sp.wheels.some(w=>w.contact);
  this.set(this.tyre.g,contact?clamp(speed/12,0,1)*.35:0);this.tyre.f.frequency.setTargetAtTime(120+speed*18,C.currentTime,.1);
  this.set(this.gravel.g,contact&&(s.name==='Gravel'||s.name==='Rock'||s.name==='Riverbed')?clamp(speed/10,0,1)*(.12+.05*Math.sin(this.t*7.3)*Math.sin(this.t*2.9)):0,.15);
  this.set(this.hum.g,contact&&s.name==='Asphalt'?clamp(speed/15,0,1)*.08:0);this.hum.f.frequency.setTargetAtTime(200+speed*25,C.currentTime,.1);
  const slip=Math.max(...sp.wheels.map(w=>w.contact?Math.abs(w.slip)+Math.abs(w.slipAngle)*.5:0));this.set(this.skid.g,slip>.2&&speed>1?clamp((slip-.2)*.6,0,.25):0);
  // an arm's rubber shoe dragging and grinding on the ground as it levers or rolls the machine
  this.set(this.armL.g,clamp(sp.armScrape||0,0,1)*.3,.08);
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
// A score for each world (free roam and the menu; Earth's missions keep their own themes above). Each has its own
// key, tempo, instruments and air: tone is the music bus low-pass (Titan's thick murk, the Moon's glassy clarity),
// room the reverb, echo the delay feedback. play() lays out one sixteenth-note step from the intensity I.
const pick=(arr,k)=>arr[((k%arr.length)+arr.length)%arr.length];
const hash=(a,b)=>{let h=(a*374761393+b*668265263)|0;h=(h^(h>>>13))*1274126177|0;return ((h^(h>>>16))>>>0)/4294967296;};
const STYLES={
 // river country: a fingerpicked guitar over upright bass and a soft organ, shaker and brushes as the pace picks
 // up, a fiddle line above it, a banjo roll at full tilt. G major, I-IV-I-V and vi-IV-I-V.
 earth:{root:43,bpm:104,base:.2,tone:15000,room:.24,echo:.22,
  prog:[[0,4,7],[5,9,12],[0,4,7],[7,11,14]],alt:[[9,12,16],[5,9,12],[0,4,7],[7,11,14]],
  play(m,t,s,I,ch,R,beat){
   if(s===0)m.organ(t,ch.map(n=>R+24+n),beat*4,.035+.02*(1-I));
   if(s===0||s===8)m.upright(t,R+(s===0?ch[0]:ch[0]+7)-12,beat*1.6,.3);
   if(I>.5&&(s===6||s===14))m.upright(t,R+ch[0]+(s===6?4:-1)-12,beat*.5,.16);
   const pat=[0,null,2,null,1,null,2,1,0,null,2,null,1,2,null,1];const k=pat[s];
   if(k!==null){const n=k===0?R+12+ch[0]+(this.bar%2?7:0):R+24+ch[k];m.pluck(t,n,.07+.03*I);}
   if(I>.25)m.shaker(t,(s%2?.035:.02)*(.6+I));
   if(I>.35){if(s===0||s===8||(I>.6&&s===10))m.softKick(t,.35+.25*I);if(s===4||s===12)m.brush(t,.08+.08*I);}
   if(I>.5&&s%2===0){const sc=[0,2,4,7,9,12,14,16];const step=Math.floor((this.bar*8+s/2));const h=hash(step,7);if(h<.55+.3*I){const n=R+36+pick(sc,Math.floor(hash(step,3)*sc.length+this.bar));m.lead(t,n,beat*(h<.3?1:.5),.035+.025*I,{type:'sawtooth',vib:6,depth:14,cut:2200,glide:.03});}}
   if(I>.78){const tones=[...ch,ch[0]+12];m.pluck(t,R+36+pick(tones,s*2+this.bar),.035);}
  }},
 // the mare: no air, a black sky. Slow glass and bell tones in D lydian, a sub drone, a heartbeat pulse when moving,
 // a glassy arpeggio at speed, and now and then a Quindar tone, the Apollo radio's beep.
 moon:{root:50,bpm:66,base:.12,tone:12000,room:.55,echo:.45,
  prog:[[0,7,11,16],[2,9,14,18],[-3,4,9,14],[-5,2,7,11]],alt:[[0,7,11,16],[6,11,14,18],[4,11,14,19],[-1,6,11,14]],
  play(m,t,s,I,ch,R,beat){
   if(s===0&&this.bar%2===0){m.glass(t,ch.map(n=>R+12+n),beat*8,.03);m.sub(t,R-12,beat*8,.07);}
   const h=hash(this.bar*16+s,11);if(h<.07+.16*I)m.bell(t,R+24+pick(ch,Math.floor(h*97)),.06+.04*I,3.5);
   if(I>.3&&(s===0||s===3))m.softKick(t,(s?.18:.28)*(.5+I),46);
   if(I>.5&&s%2===0)m.glassArp(t,R+36+pick([...ch,ch[1]+12],s/2+this.bar),.02+.02*I);
   if(I>.72&&s===8)m.noiseSweep(t,beat*3,400,2600,.02);
   if(s===0&&hash(this.bar,5)<.18){m.quindar(t+beat*2.5,2525);}
  }},
 // below the Olympus scarp: E phrygian dominant, a horn drone that swells with each bar, taiko from the canyon,
 // dust sweeps, and a theremin-like lead gliding over it; a driving low bass and brass stabs at full pace.
 mars:{root:40,bpm:84,base:.22,tone:7000,room:.38,echo:.3,
  prog:[[0,7,12],[1,8,13],[0,7,12],[-2,5,10]],alt:[[0,4,7],[1,5,8],[5,8,12],[-1,4,7]],
  play(m,t,s,I,ch,R,beat){
   if(s===0)m.horn(t,[R+12+ch[0],R+12+ch[1]],beat*4,.05+.03*I);
   const tk=I<.3?(s===0&&this.bar%2===0):I<.6?[0,6,8,11].includes(s):[0,3,6,8,11,12,14].includes(s)||(this.bar%4===3&&s>=12);
   if(tk)m.taiko(t,.3+.35*I,s===0?52:s>=12?84:66);
   if(s===0&&this.bar%4===0)m.noiseSweep(t,beat*8,250,1400,.035);
   if(I>.25&&s%4===0){const sc=[0,1,4,5,7,8,10,12,13];const step=this.bar*4+s/4;if(hash(step,9)<.7)m.lead(t,R+24+pick(sc,Math.floor(hash(step,2)*6)+this.bar),beat*(hash(step,4)<.5?2:1),.04+.02*I,{type:'sine',vib:5.2,depth:28,cut:3000,glide:.12,tri:true});}
   if(I>.45&&s%2===0)m.bass(t,R+ch[0]-12+(s===14?12:0),beat*.4,.18+.1*I);
   if(I>.7&&s===0&&this.bar%2===0)m.stab(t,ch.map(n=>R+24+n),.1);
  }},
 // the methane shore: dense air muffles everything (D dorian). A deep chorus pad, whale-like sub pulses, drips
 // and methane bubbles, slow gong swells, a muffled half-time beat with wood, and a low ostinato at pace.
 titan:{root:38,bpm:72,base:.15,tone:2600,room:.5,echo:.5,
  prog:[[0,7,10,14],[-2,5,8,12],[3,7,10,15],[-4,3,7,10]],alt:[[0,7,10,14],[5,9,12,16],[3,7,10,15],[-2,5,9,12]],
  play(m,t,s,I,ch,R,beat){
   if(s===0)m.pad(t,ch.map(n=>R+12+n),beat*4,.05);
   if(s===0||(s===10&&I>.3))m.sub(t,R-12+(s?7:0),beat*3,.11,true);
   const h=hash(this.bar*16+s,13);if(h<.06+.12*I)m.drip(t,R+36+pick([0,2,3,5,7,9,10],Math.floor(h*91)),.05);
   if(hash(this.bar*16+s,17)<.03)m.bubbles(t,.03);
   if(s===0&&this.bar%8===0)m.gong(t,.06);
   if(I>.4){if(s===0||s===11)m.softKick(t,.32+.2*I,42);if(s===8)m.wood(t,.06+.05*I);}
   if(I>.6&&s%2===0)m.bass(t,R+ch[(s/2)%3]-12,beat*.45,.14+.08*I);
   if(I>.75&&s%4===2)m.glassArp(t,R+24+pick(ch,s+this.bar),.03);
  }},
};
export class Music{
 constructor(snd){this.s=snd;this.on=true;this.vol=.55;this.mood=MOODS.menu;this.moodName='menu';this.int=0;this.target=0;this.step=0;this.bar=0;this.next=0;this.timer=null;this.duck=1;}
 init(){
  const C=this.s.ctx;if(!C||this.bus)return;
  this.bus=C.createGain();this.bus.gain.value=this.on?this.vol:0;
  const comp=C.createDynamicsCompressor();comp.threshold.value=-16;comp.ratio.value=4;comp.attack.value=.01;comp.release.value=.2;
  this.duckG=C.createGain();const trim=C.createGain();trim.gain.value=.6;this.tone=C.createBiquadFilter();this.tone.type='lowpass';this.tone.frequency.value=16000;this.tone.Q.value=.5;this.bus.connect(this.tone).connect(this.duckG).connect(comp).connect(trim).connect(this.s.master);
  // space: a feedback delay and a short generated reverb
  this.dry=C.createGain();this.dry.connect(this.bus);
  this.delay=C.createDelay(1);this.fb=C.createGain();this.fb.gain.value=.28;this.wetD=C.createGain();this.wetD.gain.value=.22;this.delay.connect(this.fb).connect(this.delay);this.delay.connect(this.wetD).connect(this.bus);
  const len=C.sampleRate*2.2,ir=C.createBuffer(2,len,C.sampleRate);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2);}
  this.rev=C.createConvolver();this.rev.buffer=ir;this.wetR=C.createGain();this.wetR.gain.value=.3;this.rev.connect(this.wetR).connect(this.bus);
  this.next=C.currentTime+.1;this.timer=setInterval(()=>this.schedule(),40);this.air();
 }
 setMood(name){if(!MOODS[name]||name===this.moodName)return;this.moodName=name;this.mood=MOODS[name];this.bar=0;this.step=0;if(this.s.ctx)this.next=Math.max(this.next,this.s.ctx.currentTime+.05);this.air();}
 setWorld(id){this.world=STYLES[id]?id:'earth';this.bar=0;this.step=0;this.air();}
 // the world's own score plays in free roam and the menu (and always off Earth, where only free roam exists)
 score(){const st=STYLES[this.world||'earth'];return st&&(this.world!=='earth'||this.moodName==='free'||this.moodName==='menu')?st:null;}
 air(){if(!this.tone)return;const st=this.score(),t=this.s.ctx.currentTime;this.tone.frequency.setTargetAtTime(st?st.tone:16000,t,.5);this.wetR.gain.setTargetAtTime(st?st.room:.3,t,.5);this.fb.gain.setTargetAtTime(st?st.echo:.28,t,.5);}
 setOn(v){this.on=v;if(this.bus)this.bus.gain.setTargetAtTime(v?this.vol:0,this.s.ctx.currentTime,.3);}
 setVolume(v){this.vol=v;if(this.bus&&this.on)this.bus.gain.setTargetAtTime(v,this.s.ctx.currentTime,.1);}
 duckFor(sec){if(!this.duckG)return;const t=this.s.ctx.currentTime;this.duckG.gain.cancelScheduledValues(t);this.duckG.gain.setTargetAtTime(.45,t,.05);this.duckG.gain.setTargetAtTime(1,t+sec,.5);}
 setIntensity(x){this.target=Math.max(0,Math.min(1,x));}
 // --- voices
 out(dly=0,rev=.3){const C=this.s.ctx,g=C.createGain();g.connect(this.dry);if(dly>0){const s=C.createGain();s.gain.value=dly;g.connect(s).connect(this.delay);}if(rev>0){const s=C.createGain();s.gain.value=rev;g.connect(s).connect(this.rev);}return g;}
 // attack, decay toward sustain, then a release that lands exactly on zero (a voice stopped while still sounding
 // cuts the waveform: a click). Returns the time the voice is silent, for its oscillators' stop().
 env(g,t,a,peak,d,sus,r,len){const s=peak*sus,tr=t+Math.max(len,a+.002);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(s,t+a,d);
  g.gain.setValueAtTime(s+(peak-s)*Math.exp(-(tr-t-a)/d),tr);const end=tr+r*3;g.gain.linearRampToValueAtTime(0,end);return end+.02;}
 kick(t,v){const C=this.s.ctx,o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.35);o.connect(g).connect(this.out(0,.05));o.start(t);o.stop(t+.4);}
 noise(t,dur,type,freq,q,v,rev=.2){const C=this.s.ctx,s=C.createBufferSource();s.buffer=this.s.white;const f=C.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=C.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(this.out(0,rev));s.start(t,Math.random()*1.5);s.stop(t+dur+.02);}
 snare(t,v){this.noise(t,.18,'bandpass',1900,.8,v,.35);const C=this.s.ctx,o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(210,t);o.frequency.exponentialRampToValueAtTime(140,t+.08);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*.6,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.12);o.connect(g).connect(this.out(0,.2));o.start(t);o.stop(t+.15);}
 hat(t,v,open=false){this.noise(t,open?.22:.045,'highpass',7500,.7,v,.08);}
 taiko(t,v,f=70){const C=this.s.ctx,o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(f*1.6,t);o.frequency.exponentialRampToValueAtTime(f,t+.09);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.7);o.connect(g).connect(this.out(0,.5));o.start(t);o.stop(t+.8);this.noise(t,.08,'lowpass',900,.5,v*.5,.4);}
 bass(t,m,len,v){const C=this.s.ctx,o=C.createOscillator(),o2=C.createOscillator(),f=C.createBiquadFilter(),g=C.createGain();o.type='sawtooth';o2.type='square';o.frequency.value=mtof(m);o2.frequency.value=mtof(m)*.5;f.type='lowpass';f.Q.value=6;f.frequency.setValueAtTime(180+this.int*900,t);f.frequency.exponentialRampToValueAtTime(120,t+len);const g2=C.createGain();g2.gain.value=.5;o2.connect(g2).connect(f);o.connect(f).connect(g).connect(this.out(0,.04));const e=this.env(g,t,.005,v,.08,.55,.03,len*.9);o.start(t);o2.start(t);o.stop(e);o2.stop(e);}
 pad(t,notes,len,v){const C=this.s.ctx,f=C.createBiquadFilter();f.type='lowpass';f.frequency.value=900+this.int*1600;f.Q.value=.7;const g=C.createGain();f.connect(g).connect(this.out(.05,.7));const e=this.env(g,t,len*.25,v,len,1,len*.1,len*.95);
  for(const m of notes)for(const det of [-8,7]){const o=C.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=det;o.connect(f);o.start(t);o.stop(e);}}
 stab(t,notes,v){const C=this.s.ctx,f=C.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(2800,t);f.frequency.exponentialRampToValueAtTime(700,t+.3);const g=C.createGain();f.connect(g).connect(this.out(.2,.45));g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.45);
  for(const m of notes)for(const det of [-12,0,11]){const o=C.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=det;o.connect(f);o.start(t);o.stop(t+.5);}}
 arp(t,m,v){const C=this.s.ctx,o=C.createOscillator(),f=C.createBiquadFilter(),g=C.createGain();o.type='square';o.frequency.value=mtof(m);f.type='lowpass';f.frequency.value=2400;o.connect(f).connect(g).connect(this.out(.35,.25));g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.14);o.start(t);o.stop(t+.16);}
 // --- voices for the world scores
 osc(type,f,t,dur,dest){const o=this.s.ctx.createOscillator();o.type=type;o.frequency.value=f;o.connect(dest);o.start(t);o.stop(t+dur);return o;}
 vca(t,a,v,dec,dest){const g=this.s.ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(.0008,t+a+dec);g.connect(dest);return g;}
 lpf(f0,f1,t,dur,q=.7){const f=this.s.ctx.createBiquadFilter();f.type='lowpass';f.Q.value=q;if(t===undefined){f.frequency.value=f0;return f;}f.frequency.setValueAtTime(f0,t);if(f1)f.frequency.exponentialRampToValueAtTime(f1,t+dur);return f;}
 pluck(t,m,v){const f=this.lpf(3200,450,t,.35,1.2),g=this.vca(t,.003,v,.9,this.out(.15,.25));f.connect(g);this.osc('sawtooth',mtof(m),t,.95,f);this.osc('triangle',mtof(m)*2,t,.95,f);}
 upright(t,m,len,v){const f=this.lpf(900,260,t,.3),g=this.vca(t,.01,v,Math.max(.3,len),this.out(0,.08));f.connect(g);const e=.01+Math.max(.3,len)+.02;this.osc('sine',mtof(m),t,e,f);this.osc('triangle',mtof(m)*2,t,e,f);}
 organ(t,notes,len,v){const g=this.s.ctx.createGain();const e=this.env(g,t,.25,v,len,.85,.15,len*.95);const f=this.lpf(1600);f.connect(g).connect(this.out(.05,.4));for(const n of notes){this.osc('triangle',mtof(n),t,e-t,f);this.osc('sine',mtof(n)*2,t,e-t,f).detune.value=4;}}
 shaker(t,v){this.noise(t,.05,'highpass',6500,.7,v,.05);}
 brush(t,v){this.noise(t,.16,'bandpass',2600,.6,v,.25);}
 softKick(t,v,f0=60){const C=this.s.ctx,o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(f0*2.2,t);o.frequency.exponentialRampToValueAtTime(f0,t+.1);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.45);o.connect(g).connect(this.out(0,.15));o.start(t);o.stop(t+.5);}
 lead(t,m,len,v,o={}){const C=this.s.ctx,f=this.lpf(o.cut||2500),g=C.createGain();const e=this.env(g,t,.04,v,len,.8,.08,len*.9);f.connect(g).connect(this.out(.3,.4));
  const fr=mtof(m),p=this._lead||fr;this._lead=fr;const make=type=>{const x=C.createOscillator();x.type=type;x.frequency.setValueAtTime(p,t);x.frequency.setTargetAtTime(fr,t,o.glide||.03);const l=C.createOscillator();l.frequency.value=o.vib||5;const d=C.createGain();d.gain.setValueAtTime(0,t);d.gain.linearRampToValueAtTime(o.depth||10,t+len*.5);l.connect(d).connect(x.detune);x.connect(f);x.start(t);l.start(t);x.stop(e);l.stop(e);};
  make(o.type||'sawtooth');if(o.tri)make('triangle');}
 bell(t,m,v,dur=3){const C=this.s.ctx,fr=mtof(m),c=C.createOscillator(),mo=C.createOscillator(),mi=C.createGain();c.frequency.value=fr;mo.frequency.value=fr*3.5;mi.gain.setValueAtTime(fr*2.2,t);mi.gain.exponentialRampToValueAtTime(1,t+dur*.6);mo.connect(mi).connect(c.frequency);const g=this.vca(t,.004,v,dur,this.out(.45,.7));c.connect(g);c.start(t);mo.start(t);c.stop(t+dur+.1);mo.stop(t+dur+.1);}
 glass(t,notes,len,v){const g=this.s.ctx.createGain();const e=this.env(g,t,len*.4,v,len,1,len*.15,len*.9);g.connect(this.out(.2,.8));for(const n of notes)for(const d of [-5,6]){this.osc('sine',mtof(n),t,e-t,g).detune.value=d;}}
 glassArp(t,m,v){const g=this.vca(t,.003,v,.5,this.out(.4,.5));this.osc('sine',mtof(m),t,.52,g);this.osc('sine',mtof(m)*3.01,t,.52,g);}
 sub(t,m,len,v,swell=false){const g=this.s.ctx.createGain();const e=this.env(g,t,swell?len*.3:.05,v,len,.9,len*.12,len*.8);g.connect(this.out(0,.1));const o=this.osc('sine',mtof(m),t,e-t,g);if(swell){o.frequency.setValueAtTime(mtof(m)*.94,t);o.frequency.exponentialRampToValueAtTime(mtof(m),t+len*.4);}}
 horn(t,notes,len,v){const g=this.s.ctx.createGain();const e=this.env(g,t,len*.35,v,len,.9,len*.1,len*.9);const f=this.lpf(180,null,t);f.frequency.setValueAtTime(180,t);f.frequency.linearRampToValueAtTime(1100,t+len*.5);f.frequency.linearRampToValueAtTime(300,t+len);f.connect(g).connect(this.out(.1,.6));for(const n of notes)for(const d of [-9,8])this.osc('sawtooth',mtof(n),t,e-t,f).detune.value=d;}
 noiseSweep(t,dur,f0,f1,v){const C=this.s.ctx,s=C.createBufferSource();s.buffer=this.s.white;const f=C.createBiquadFilter();f.type='bandpass';f.Q.value=2;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(f1,t+dur*.6);f.frequency.exponentialRampToValueAtTime(f0,t+dur);const g=C.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+dur*.5);g.gain.linearRampToValueAtTime(0,t+dur);s.connect(f).connect(g).connect(this.out(.2,.5));s.start(t,Math.random()*1.5);s.stop(t+dur+.05);}
 quindar(t,f){const g=this.vca(t,.005,.025,.25,this.out(0,.05));this.osc('sine',f,t,.27,g);}
 drip(t,m,v){const C=this.s.ctx,o=C.createOscillator();o.frequency.setValueAtTime(mtof(m)*1.5,t);o.frequency.exponentialRampToValueAtTime(mtof(m),t+.05);const g=this.vca(t,.002,v,.6,this.out(.55,.5));o.connect(g);o.start(t);o.stop(t+.7);}
 bubbles(t,v){for(let k=0;k<5;k++){const t0=t+k*.07+Math.random()*.05,C=this.s.ctx,o=C.createOscillator(),f0=250+Math.random()*350;o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(f0*2.4,t0+.07);const g=this.vca(t0,.004,v,.1,this.out(.2,.3));o.connect(g);o.start(t0);o.stop(t0+.15);}}
 gong(t,v){const g=this.s.ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+1.6);g.gain.exponentialRampToValueAtTime(.0008,t+7);g.connect(this.out(.2,.8));for(const r of [1,1.48,2.09,2.76,3.41])this.osc('sine',55*r,t,7.2,g);}
 wood(t,v){this.noise(t,.06,'bandpass',1100,8,v,.3);}
 // --- the sequencer
 schedule(){
  const C=this.s.ctx;if(!C||this.s.paused||!this.on)return;if(this.next<C.currentTime-.2)this.next=C.currentTime+.05;
  while(this.next<C.currentTime+.3){this.playStep(this.next);this.next+=60/(this.score()||this.mood).bpm/4;}
 }
 playStep(t){
  const ST=this.score(),M=ST||this.mood,s=this.step%16,beat=60/M.bpm;this.int+=(Math.max(this.target,M.base*.6)-this.int)*.02;const I=this.int;
  const phrase=Math.floor(this.bar/8)%2,prog=phrase&&M.alt?M.alt:M.prog,ch=prog[this.bar%4],R=M.root;
  if(ST){ST.play.call(this,this,t,s,I,ch,R,beat);if(s===15)this.bar++;this.step++;return;}
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
