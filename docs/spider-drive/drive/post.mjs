// Post-processing: render, subtle bloom, grade (contrast, saturation, vignette, grain, letterbox), output.
import * as T from 'three';
import {EffectComposer} from '../vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from '../vendor/addons/postprocessing/ShaderPass.js';
import {OutputPass} from '../vendor/addons/postprocessing/OutputPass.js';
const Grade={uniforms:{tDiffuse:{value:null},uTime:{value:0},uVig:{value:.32},uGrain:{value:.035},uSat:{value:1.06},uContrast:{value:1.05},uLetter:{value:0},uTint:{value:new T.Color(1,1,1)},uHurt:{value:0}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime,uVig,uGrain,uSat,uContrast,uLetter,uHurt;uniform vec3 uTint;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uTime*7.0)*43758.5453);}
void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 col=c.rgb*uTint;float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,uSat);col=(col-.18)*uContrast+.18;col=max(col,0.0);
 vec2 d=vUv-.5;float v=1.0-dot(d,d)*uVig*2.2;col*=v;col+=(h(vUv)-.5)*uGrain*(.4+l);col=mix(col,vec3(l*1.2,l*.35,l*.3),uHurt*smoothstep(.2,.7,length(d)));
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
