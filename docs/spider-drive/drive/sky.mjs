// Sky, sun, clouds, stars, fog and the PMREM environment; time of day and weather moods.
import * as T from 'three';
import {Sky} from '../vendor/addons/objects/Sky.js';
import {shared} from './materials.mjs';
import {clamp,mix,smoothstep} from './noise.mjs';

export class Atmosphere{
 constructor(scene,renderer,{quality='medium'}={}){
  this.scene=scene;this.renderer=renderer;
  this.sky=new Sky();this.sky.scale.setScalar(60000);this.sky.frustumCulled=false;scene.add(this.sky);
  const u=this.sky.material.uniforms;u.turbidity.value=4.5;u.rayleigh.value=1.4;u.mieCoefficient.value=.004;u.mieDirectionalG.value=.82;
  this.sun=new T.DirectionalLight(0xffffff,3);this.sun.castShadow=true;const S=quality==='low'?1024:quality==='high'?4096:2048;this.sun.shadow.mapSize.set(S,S);
  Object.assign(this.sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:600});this.sun.shadow.bias=-.0004;this.sun.shadow.normalBias=.06;
  scene.add(this.sun,this.sun.target);
  this.hemi=new T.HemisphereLight(0xbfd6ff,0x4a4432,1.2);scene.add(this.hemi);
  this.fog=new T.FogExp2(0xbfcbd4,.00022);scene.fog=this.fog;
  // cloud dome
  this.cloudU={uTime:shared.uTime,uCover:{value:.45},uSun:{value:new T.Vector3()},uSunCol:{value:new T.Color()},uSky:{value:new T.Color()},uDark:{value:0}};
  this.clouds=new T.Mesh(new T.SphereGeometry(24000,48,24,0,Math.PI*2,0,Math.PI*.5),new T.ShaderMaterial({uniforms:this.cloudU,transparent:true,depthWrite:false,side:T.BackSide,fog:false,
   vertexShader:`varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}`,
   fragmentShader:`uniform float uTime;uniform float uCover;uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uSky;uniform float uDark;varying vec3 vD;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
void main(){if(vD.y<.005)discard;vec2 uv=vD.xz/(vD.y+.08)*1.6+vec2(uTime*.004,uTime*.0015);
 float c=fbm(uv);float c2=fbm(uv*2.1+3.0);float d=smoothstep(1.0-uCover,1.05-uCover*.4,c*.75+c2*.35);
 float lit=clamp(.55+.45*dot(normalize(vD),uSun)+(1.0-c2)*.3,0.0,1.3);vec3 col=mix(uSky*.9+vec3(.06),uSunCol*lit+uSky*.35,.7)*mix(1.0,.45,uDark*d);
 float fade=smoothstep(.005,.12,vD.y);gl_FragColor=vec4(col,d*fade*.92);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`}));this.clouds.frustumCulled=false;this.clouds.renderOrder=-1;scene.add(this.clouds);
  // stars
  const sp=[];for(let i=0;i<1800;i++){const u2=Math.random(),v=Math.random()*.95,th=u2*Math.PI*2,ph=Math.acos(1-v);sp.push(Math.sin(ph)*Math.cos(th)*20000,Math.cos(ph)*20000,Math.sin(ph)*Math.sin(th)*20000);}
  const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(sp,3));this.stars=new T.Points(sg,new T.PointsMaterial({color:0xffffff,size:1.4,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false}));this.scene.add(this.stars);
  this.pmrem=new T.PMREMGenerator(renderer);this.envScene=new T.Scene();this.envSky=new Sky();this.envSky.scale.setScalar(1000);this.envScene.add(this.envSky);
  this.hour=16.5;this.weather='clear';this.envT=-1;this.sunDir=new T.Vector3();this.fogBase=.00022;this.off=false;
  this.setTime(16.5);
 }
 // another body: no Earth sky model. A gradient dome (black for vacuum, butterscotch for Mars, orange murk for
 // Titan) with the sun as a hard disc, a pale disc or a bright smear; fixed sun; stars; Earth in the lunar sky.
 setBody(B){
  this.body=B;const off=this.off=B.id!=='earth';
  this.sky.visible=!off;this.clouds.visible=!off;if(this.envSky)this.envSky.visible=!off;
  if(!off){if(this.dome)this.dome.visible=false;if(this.earthDisc)this.earthDisc.visible=false;this.apply();return;}
  const L=B.light;
  if(!this.dome){
   this.domeU={uZen:{value:new T.Color()},uHor:{value:new T.Color()},uGlow:{value:new T.Color()},uGlowW:{value:.1},uSun:{value:new T.Vector3()},uDisc:{value:0},uDiscR:{value:.9999},uGround:{value:new T.Color()}};
   const mk=()=>new T.ShaderMaterial({uniforms:this.domeU,side:T.BackSide,depthWrite:false,fog:false,
    vertexShader:`varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}`,
    fragmentShader:`uniform vec3 uZen,uHor,uGlow,uGround;uniform float uGlowW,uDisc,uDiscR;uniform vec3 uSun;varying vec3 vD;
void main(){vec3 d=normalize(vD);float h=d.y;vec3 c=mix(uHor,uZen,pow(clamp(h,0.0,1.0),.45));c=mix(uGround,c,smoothstep(-.03,.01,h));
 float s=dot(d,uSun);c+=uGlow*exp((s-1.0)/uGlowW)*smoothstep(-.05,.02,h);
 c+=vec3(uDisc)*smoothstep(uDiscR,uDiscR+(1.0-uDiscR)*.4,s);
 gl_FragColor=vec4(c,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
   this.dome=new T.Mesh(new T.SphereGeometry(30000,48,24),mk());this.dome.frustumCulled=false;this.dome.renderOrder=-2;this.scene.add(this.dome);
   this.envDome=new T.Mesh(new T.SphereGeometry(1000,32,16),mk());this.envScene.add(this.envDome);
   // Earth: 2° across, blue and white, hanging in the lunar sky
   const eg=new T.CircleGeometry(380,48);const em=new T.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv*2.0-1.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 vUv;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){float r=length(vUv);if(r>1.0)discard;float z=sqrt(1.0-r*r);vec3 nrm=vec3(vUv,z);float lit=clamp(dot(nrm,normalize(vec3(.55,.3,.8))),0.0,1.0);
 float cl=smoothstep(.45,.7,n(vUv*4.0)*.6+n(vUv*9.0+3.0)*.4);float land=smoothstep(.55,.65,n(vUv*2.5+7.0));vec3 c=mix(vec3(.12,.3,.75),vec3(.3,.38,.2),land);c=mix(c,vec3(1.0),cl);
 c*=lit*2.2+.02;c+=vec3(.3,.5,1.0)*pow(1.0-z,3.0)*.6;gl_FragColor=vec4(c,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});this.earthDisc=new T.Mesh(eg,em);this.earthDisc.frustumCulled=false;this.earthDisc.renderOrder=-1;this.scene.add(this.earthDisc);
  }
  this.dome.visible=true;this.envDome.visible=true;this.earthDisc.visible=!!L.earth;
  const el=L.sunEl??.6,az=2.2;this.sunDir.set(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)).normalize();
  const U=this.domeU;U.uZen.value.setRGB(...(L.zenith||[0,0,0]));U.uHor.value.setRGB(...(L.horizon||[0,0,0]));U.uGlow.value.setRGB(...(L.sunGlow||[0,0,0]));U.uGlowW.value=L.glowW||.1;U.uSun.value.copy(this.sunDir);U.uGround.value.setRGB(...L.hemiGround).multiplyScalar(.6);
  U.uDisc.value=B.id==='moon'?12:B.id==='mars'?3.5:0;U.uDiscR.value=B.id==='moon'?.99993:.99995;
  this.sun.color.setRGB(...L.sunColor);this.sun.intensity=L.sunI;this.sun.castShadow=B.id!=='titan';this.sun.shadow.radius=L.shadowRadius||1;
  this.hemi.color.setRGB(...L.hemiSky);this.hemi.groundColor.setRGB(...L.hemiGround);this.hemi.intensity=L.hemiI;
  this.fog.color.setRGB(...L.fog);this.fog.density=L.fogD;this.fogBase=L.fogD;
  shared.uSunDir.value.copy(this.sunDir);shared.uSunColor.value.setRGB(...L.sunColor).multiplyScalar(Math.min(1,L.sunI/5));shared.uSkyHorizon.value.setRGB(...(L.horizon||L.fog));shared.uSkyTop.value.setRGB(...(L.zenith||[0,0,0]));
  this.stars.material.opacity=L.stars||0;this.renderer.toneMappingExposure=L.exposure;this.envI=L.envI;
  this.night=B.id==='titan'?.35:0;this.dirtyEnv=true;
 }
 setWeather(w){this.weather=w;this.apply();}
 setTime(h){this.hour=h;this.apply();}
 apply(){
  if(this.off)return;
  const h=this.hour,el=Math.sin((h-6)/12*Math.PI)*62*Math.PI/180+(-.05),az=(h/24)*Math.PI*2+Math.PI*.35;
  this.sunDir.set(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)).normalize();
  const u=this.sky.material.uniforms;u.sunPosition.value.copy(this.sunDir);
  const w=this.weather,day=smoothstep(-.1,.14,this.sunDir.y),gold=smoothstep(.4,.03,this.sunDir.y)*day,dusk=smoothstep(-.2,-.02,this.sunDir.y)*(1-day);
  u.turbidity.value=w==='smoke'?14:w==='rain'?10:mix(8,3.5,day);u.rayleigh.value=w==='smoke'?4:w==='rain'?.6:mix(3,1.3,day);u.mieCoefficient.value=w==='smoke'?.02:.004;
  const sunCol=new T.Color().setRGB(1,mix(.55,.96,1-gold),mix(.32,.9,1-gold));if(w==='smoke')sunCol.setRGB(1,.55,.25);
  this.sun.color.copy(sunCol);this.sun.intensity=(w==='rain'?1.6:w==='smoke'?2.6:5.2)*day+.03;
  this.hemi.intensity=mix(.55+dusk*.5,w==='rain'?1.9:1.3,day);this.hemi.color.setRGB(mix(.3+dusk*.4,.75,day),mix(.36+dusk*.2,.82,day),mix(.62,.95,day));
  const fog=new T.Color().setRGB(mix(.07+dusk*.28,.74,day),mix(.08+dusk*.16,.8,day),mix(.14+dusk*.14,.86,day));fog.lerp(new T.Color(.9,.68,.48),gold*.55);
  if(w==='smoke')fog.setRGB(mix(.1,.62,day),mix(.07,.42,day),mix(.05,.26,day));if(w==='rain')fog.setRGB(mix(.05,.5,day),mix(.06,.54,day),mix(.07,.57,day));
  this.fog.color.copy(fog);this.fog.density=w==='smoke'?.0011:w==='rain'?.0008:w==='haze'?.0005:.00022;this.fogBase=this.fog.density;
  shared.uSunDir.value.copy(this.sunDir);shared.uSunColor.value.copy(sunCol).multiplyScalar(day);shared.uSkyHorizon.value.copy(fog);shared.uSkyTop.value.setRGB(mix(.02,.25,day),mix(.03,.45,day),mix(.08,.8,day));
  this.cloudU.uCover.value=w==='rain'?.95:w==='smoke'?.7:w==='haze'?.55:.42;this.cloudU.uDark.value=w==='rain'?.8:w==='smoke'?.5:0;this.cloudU.uSun.value.copy(this.sunDir);this.cloudU.uSunCol.value.copy(sunCol).multiplyScalar(mix(.15,1,day));this.cloudU.uSky.value.copy(fog);
  this.stars.material.opacity=smoothstep(.05,-.15,this.sunDir.y)*(w==='rain'?0:.9);
  this.renderer.toneMappingExposure=mix(.75,.62,day)*(w==='smoke'?1.1:1);
  this.night=1-day;this.dirtyEnv=true;
 }
 update(target,dt){
  this.sun.target.position.copy(target);this.sun.position.copy(target).addScaledVector(this.sunDir,300);
  // stable shadow texels: snap the light position to the shadow-map grid
  const texel=(this.sun.shadow.camera.right*2)/this.sun.shadow.mapSize.x;this.sun.position.x=Math.round(this.sun.position.x/texel)*texel;this.sun.position.z=Math.round(this.sun.position.z/texel)*texel;this.sun.target.position.x=this.sun.position.x-this.sunDir.x*300;this.sun.target.position.z=this.sun.position.z-this.sunDir.z*300;
  this.sky.position.copy(target);this.clouds.position.copy(target);this.stars.position.copy(target);
  if(this.dome){this.dome.position.copy(target);if(this.earthDisc){this.earthDisc.position.copy(target).add(new T.Vector3(-.55,.62,-.45).normalize().multiplyScalar(20000));this.earthDisc.lookAt(target);}}
  if(this.dirtyEnv){this.dirtyEnv=false;const u=this.envSky.material.uniforms,s=this.sky.material.uniforms;for(const k of ['turbidity','rayleigh','mieCoefficient','mieDirectionalG'])u[k].value=s[k].value;u.sunPosition.value.copy(this.sunDir);
   if(this.envRT)this.envRT.dispose();this.envRT=this.pmrem.fromScene(this.envScene,0,.1,2000);this.scene.environment=this.envRT.texture;this.scene.environmentIntensity=this.off?this.envI:this.weather==='rain'?.14:.2;}
 }
}
