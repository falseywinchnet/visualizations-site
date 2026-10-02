// Post-processing: render, subtle bloom, grade (contrast, saturation, vignette, grain, letterbox), output.
import * as T from 'three';
import {EffectComposer} from '../vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from '../vendor/addons/postprocessing/ShaderPass.js';
import {OutputPass} from '../vendor/addons/postprocessing/OutputPass.js';
const Grade={uniforms:{tDiffuse:{value:null},uTime:{value:0},uVig:{value:.32},uGrain:{value:.035},uSat:{value:1.06},uContrast:{value:1.05},uLetter:{value:0},uTint:{value:new T.Color(1,1,1)},uHurt:{value:0},uGlass:{value:0},uWet:{value:0}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime,uVig,uGrain,uSat,uContrast,uLetter,uHurt,uGlass,uWet;uniform vec3 uTint;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uTime*7.0)*43758.5453);}
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 col=c.rgb*uTint;float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,uSat);col=(col-.18)*uContrast+.18;col=max(col,0.0);
 vec2 d=vUv-.5;float v=1.0-dot(d,d)*uVig*2.2;col*=v;col+=(h(vUv)-.5)*uGrain*(.4+l);col=mix(col,vec3(l*1.2,l*.35,l*.3),uHurt*smoothstep(.2,.7,length(d)));
 // the cockpit glass, seen from the seat: wiped smudges that catch the light, dust specks, reflections that strengthen toward the edges of the pane, a faint tint
 if(uGlass>0.001){vec2 p=vUv*vec2(1.7,1.0);float sm=vn(p*2.6+vec2(1.3,7.1))*.55+vn(p*7.0+3.0)*.45;float arc=vn(vec2(length(p-vec2(.9,.1))*9.0,atan(p.y-.1,p.x-.9)*2.0));float streak=smoothstep(.62,.85,arc)*smoothstep(.3,.7,sm);
  vec2 dc=floor(vUv*vec2(760.0,440.0));float dust=step(.995,hs(dc))*(.4+.6*hs(dc+7.0))*smoothstep(.5,.2,length(fract(vUv*vec2(760.0,440.0))-.5));
  float lum=l*.8+.05;vec3 g=vec3(.92,.96,1.0)*lum*(smoothstep(.45,.85,sm)*.075+streak*.11)+vec3(dust*.22*(lum+.08));
  float fr=pow(min(1.0,length(d)*1.45),2.6);g+=fr*vec3(.07,.085,.105)*(lum*.9+.25);
  // the sky lies in the top of the pane as a soft sheen; the dark cabin floor in the bottom
  g+=vec3(.06,.07,.085)*smoothstep(.62,1.0,vUv.y)*(lum*.6+.3)*(.6+.4*vn(vUv*vec2(5.0,2.0)));col*=1.0-uGlass*.08*smoothstep(.3,0.0,vUv.y);
  // rain: drops pulled into runs down the pane
  if(uWet>0.001){vec2 q=vec2(vUv.x*34.0,vUv.y*20.0+uTime*.3);vec2 cell=floor(q);float r=hs(cell);vec2 fq=fract(q)-vec2(.5,.5+.3*sin(r*30.0));float drop=smoothstep(.17,.03,length(fq*vec2(1.7,1.0)))*step(.7,r);float trail=smoothstep(.04,.0,abs(fq.x))*smoothstep(.0,.5,fq.y)*step(.88,r);g+=(drop*.5+trail*.14)*uWet*vec3(.9,.95,1.0)*(lum+.12);}
  col+=g*2.2*min(uGlass,1.0);col=mix(col,col*vec3(.965,.99,1.02),.6*min(uGlass,1.0));}
 if(vUv.y<uLetter||vUv.y>1.0-uLetter)col=vec3(0.0);gl_FragColor=vec4(col,c.a);}`};
export class Post{
 constructor(renderer,scene,camera,{quality='medium'}={}){
  this.renderer=renderer;this.enabled=quality!=='low';
  const size=renderer.getDrawingBufferSize(new T.Vector2());
  const rt=new T.WebGLRenderTarget(size.x,size.y,{type:T.HalfFloatType,samples:quality==='high'?4:quality==='medium'?4:0});
  this.composer=new EffectComposer(renderer,rt);this.render=new RenderPass(scene,camera);this.composer.addPass(this.render);
  // sanitise NaN/Inf before the bloom blur spreads them into black blocks
  this.clean=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);if(any(isnan(c))||any(isinf(c)))c=vec4(0.0,0.0,0.0,1.0);gl_FragColor=vec4(min(c.rgb,vec3(64.0)),c.a);}`});this.composer.addPass(this.clean);
  this.bloom=new UnrealBloomPass(new T.Vector2(size.x/2,size.y/2),.22,.45,.86);this.composer.addPass(this.bloom);
  this.grade=new ShaderPass(Grade);this.composer.addPass(this.grade);this.composer.addPass(new OutputPass());
  this.bloom.enabled=quality!=='low';
 }
 setSize(w,h){this.composer.setSize(w,h);}
 setCamera(c){this.render.camera=c;}
 frame(dt,scene,camera){this.grade.uniforms.uTime.value+=dt;if(this.enabled)this.composer.render(dt);else this.renderer.render(scene,camera);}
}
