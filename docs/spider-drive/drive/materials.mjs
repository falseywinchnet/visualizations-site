// Procedural textures and the terrain / water materials.
import * as T from 'three';
import {periodicFbm,periodicNoise,hash2,clamp,mix,smoothstep} from './noise.mjs';

// ------------------------------------------------------------ terrain texture array
// Layers (RGB albedo, A height): 0 grass, 1 soil, 2 rock, 3 sand, 4 snow, 5 asphalt, 6 gravel, 7 litter, 8 stubble,
// 9 regolith (neutral, fine, small pits), 10 basalt (dark, vesicular), 11 Mars soil (dust over duricrust),
// 12 Titan organic sand (dark, rippled), 13 ice cobbles (pale rounded pebbles in dark sand)
export function terrainTextures(size=256){
 const L=14,data=new Uint8Array(size*size*4*L);
 const put=(l,x,y,r,g,b,a)=>{const o=((l*size+y)*size+x)*4;data[o]=clamp(r,0,1)*255;data[o+1]=clamp(g,0,1)*255;data[o+2]=clamp(b,0,1)*255;data[o+3]=clamp(a,0,1)*255;};
 const P=8;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size*P,v=y/size*P;
  const n1=periodicFbm(u,v,P,11,5),n2=periodicFbm(u*2,v*2,P*2,23,4),n3=periodicNoise(u*8,v*8,P*8,37),n4=periodicNoise(u*16,v*16,P*16,41);
  // grass: neutral bright (vertex tint colours it), blade speckle
  {const blade=Math.pow(n4,2.2),s=.72+.35*n1+.25*blade-.1*n3;put(0,x,y,s*.95,s,s*.8,.35+.4*n2+.25*blade);}
  // soil: brown with clods
  {const c=smoothstep(.55,.75,n2)*.25,s=.36+.22*n1-c*.4+.08*n3;put(1,x,y,s*1.25,s*.98,s*.72,.3+.5*n1+c);}
  // rock: layered grey with cracks
  {const strata=.5+.5*Math.sin((v*3.1+n1*2.4)*Math.PI*2/P*4),crack=smoothstep(.04,0,Math.abs(n2-.5))*.6,s=.42+.25*n1+.12*strata-.25*crack+.06*n4;put(2,x,y,s*1.02,s*.98,s*.92,.5+.35*n1-.4*crack);}
  // sand: warm, rippled
  {const rip=.5+.5*Math.sin((u*9+n1*3)*Math.PI*2/P*2),s=.72+.12*n1+.05*rip+.04*n4;put(3,x,y,s*1.06,s*.92,s*.68,.4+.07*rip+.2*n1);/* soft ripples: strong ones shimmer at grazing angles */}
  // snow: bright, soft, sparkle
  {const s=.9+.08*n1+.05*(n4>.93?1:0);put(4,x,y,s*.96,s*.98,s*1.02,.5+.3*n1);}
  // asphalt: dark with aggregate
  {const ag=n4>.8?.12:0,s=.2+.06*n1+ag+.03*n3;put(5,x,y,s,s,s*1.02,.45+.1*n3);}
  // gravel: pebbles
  {const pb=smoothstep(.45,.65,n4)*.25,s=.48+.1*n1+pb-.1*n3;put(6,x,y,s*1.04,s*.98,s*.88,.3+pb*1.5);}
  // forest litter: needles and leaves
  {const lf=smoothstep(.6,.8,n3),s=.27+.1*n1+.1*lf;put(7,x,y,s*1.3,s*1.02,s*.62,.4+.3*lf);}
  // stubble / crop soil: straw lines
  {const st=smoothstep(.6,.9,periodicNoise(u*32,v*2,P*32,53)),s=.55+.15*n1+.2*st;put(8,x,y,s*1.1,s*.95,s*.6,.35+.4*st);}
  // regolith: neutral grey powder, tiny pits and a few bright grains (the vertex tint carries albedo)
  {const pit=smoothstep(.78,.92,n4)*.25,grain=n4>.985?.3:0,s=.58+.16*n1-pit+grain+.06*n3;put(9,x,y,s,s*.995,s*.98,.42+.3*n2-pit);}
  // basalt: dark, vesicular, faintly bluish grey
  {const ves=smoothstep(.7,.85,n3)*.3,s=.3+.18*n1-ves+.05*n4;put(10,x,y,s*.96,s*.97,s,.5+.3*n1-ves);}
  // Mars soil: fine dust over crusted ground, small cemented clods
  {const clod=smoothstep(.6,.8,n2)*.2,s=.62+.16*n1+clod-.08*n3;put(11,x,y,s*1.0,s*.92,s*.86,.36+.4*n1+clod);}
  // Titan sand: dark organic grains with fine ripples
  {const rip=.5+.5*Math.sin((u*11+n1*2.5)*Math.PI*2/P*2),s=.5+.14*n1+.08*rip+.04*n4;put(12,x,y,s*1.0,s*.94,s*.86,.4+.1*rip+.2*n1);}
  // ice cobbles: pale rounded pebbles set in dark sand
  {const pb=smoothstep(.5,.62,n4)+smoothstep(.55,.7,periodicNoise(u*12,v*12,P*12,59))*.6,s=.34+.1*n1+pb*.45;put(13,x,y,s*1.02,s*.98,s*.9,.3+pb*.6);}
 }
 const tex=new T.DataArrayTexture(data,size,size,L);tex.format=T.RGBAFormat;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=8;tex.colorSpace=T.SRGBColorSpace;tex.needsUpdate=true;
 return tex;
}
// Tileable normal texture for water and small-scale detail.
export function waterNormals(size=256){
 const data=new Uint8Array(size*size*4),P=8,h=new Float32Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=x/size*P,v=y/size*P;h[y*size+x]=periodicFbm(u,v,P,91,5)*.7+periodicFbm(u*3,v*3,P*3,97,3)*.3;}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=h[y*size+(x+1)%size]-h[y*size+(x-1+size)%size],dy=h[((y+1)%size)*size+x]-h[((y-1+size)%size)*size+x],k=9,l=Math.hypot(dx*k,dy*k,1);const o=(y*size+x)*4;data[o]=(-dx*k/l*.5+.5)*255;data[o+1]=(-dy*k/l*.5+.5)*255;data[o+2]=(1/l*.5+.5)*255;data[o+3]=h[y*size+x]*255;}
 const tex=new T.DataTexture(data,size,size);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}
// ------------------------------------------------------------ shared uniforms
export const shared={
 uTime:{value:0},uBurn:{value:null},uBurnRect:{value:new T.Vector4(0,0,1,1)},uBurnOn:{value:0},
 uTrack:{value:null},uTrackRect:{value:new T.Vector4(0,0,1,1)},uTrackOn:{value:0},
 uWetness:{value:0},uSunDir:{value:new T.Vector3(.4,.8,.3)},uSunColor:{value:new T.Color(1,.95,.85)},
 uSkyTop:{value:new T.Color(.35,.55,.85)},uSkyHorizon:{value:new T.Color(.75,.82,.9)},uFloodTint:{value:0},
 // which texture layers the splat channels read (plain ground, disturbed ground, sand, rock) and (snow, verge); per body
 uLay:{value:new T.Vector4(0,1,3,2)},uLay2:{value:new T.Vector2(4,6)},
 // 0 water, 1 liquid methane: near black, mirror calm, no foam
 uLiquid:{value:0},
};
export function setBodyLayers(body){const l=body.layers;shared.uLay.value.set(l.grass,l.dirt,l.sand,l.rock);shared.uLay2.value.set(l.snow,l.verge);shared.uLiquid.value=body.liquid&&body.liquid.name==='methane'?1:0;}
// ------------------------------------------------------------ terrain material
export function terrainMaterial(arr,seed=0){
 const m=new T.MeshStandardMaterial({roughness:.9,metalness:0});
 m.onBeforeCompile=sh=>{
  Object.assign(sh.uniforms,shared,{tArr:{value:arr},uSeed:{value:seed}});
  sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 tint;attribute vec4 spl;attribute vec4 ext;
varying vec3 vWPos;varying vec3 vWNrm;varying vec4 vTint;varying vec4 vSpl;varying vec4 vExt;`)
  .replace('#include <begin_vertex>',`#include <begin_vertex>
vWPos=(modelMatrix*vec4(transformed,1.0)).xyz;vWNrm=normalize(mat3(modelMatrix)*normal);vTint=tint;vSpl=spl;vExt=ext;`);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
precision highp sampler2DArray;
uniform sampler2DArray tArr;uniform float uTime;uniform sampler2D uBurn;uniform vec4 uBurnRect;uniform float uBurnOn;
uniform sampler2D uTrack;uniform vec4 uTrackRect;uniform float uTrackOn;uniform float uWetness;uniform float uSeed;uniform vec4 uLay;uniform vec2 uLay2;
// the field layout (terrain.mjs field()), evaluated per pixel so boundaries and rows stay crisp at every LOD
float h2(float x,float z,float sd){uint h=(uint(int(x))*0x27d4eb2du)^(uint(int(z))*0x165667b1u)^(uint(int(sd))*0x9e3779b1u);h=(h^(h>>15u))*0x85ebca6bu;h=(h^(h>>13u))*0xc2b2ae35u;return float(h^(h>>16u))/4294967296.0;}
vec4 fieldAt(vec2 p){float B=480.0;float bi=floor(p.x/B),bj=floor(p.y/B);
 float ang=(h2(bi,bj,uSeed+5.0)<.5?0.0:1.5707963)+(h2(bi,bj,uSeed+6.0)-.5)*.5;float ca=cos(ang),sa=sin(ang);
 float lx=p.x-bi*B,lz=p.y-bj*B,u=lx*ca+lz*sa,v=-lx*sa+lz*ca;
 float su=70.0+h2(bi,bj,uSeed+7.0)*70.0,sv=150.0+h2(bi,bj,uSeed+8.0)*140.0;
 float iu=floor(u/su),iv=floor(v/sv),fu=u-iu*su,fv=v-iv*sv;
 float r=h2(bi*31.0+iu,bj*37.0+iv,uSeed+10.0);float crop=r<.46?0.0:r<.7?1.0:r<.88?2.0:3.0;
 float edge=min(min(fu,su-fu),min(fv,sv-fv)),be=min(min(lx,B-lx),min(lz,B-lz));
 float ra=h2(bi*5.0+iu,bj*3.0+iv,uSeed+11.0)<.2?ang+1.5707963:ang;
 return vec4(crop,min(edge,be),ra,0.0);}
varying vec3 vWPos;varying vec3 vWNrm;varying vec4 vTint;varying vec4 vSpl;varying vec4 vExt;
vec4 L(float l,vec2 uv){return texture(tArr,vec3(uv,l));}
vec4 tri(float l,vec3 p,vec3 n,float s){vec3 w=pow(abs(n),vec3(4.0));w/=w.x+w.y+w.z;return L(l,p.zy*s)*w.x+L(l,p.xz*s)*w.y+L(l,p.xy*s)*w.z;}
float hb(float w,float h){return w*(0.2+h);}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y);}
`)
  .replace('#include <map_fragment>',`
vec3 N=normalize(vWNrm);vec2 uv=vWPos.xz*.22;float dist=length(vWPos-cameraPosition);
float far=smoothstep(60.0,420.0,dist);
float macro=vnoise(vWPos.xz*.012)*.6+vnoise(vWPos.xz*.05)*.4;
vec4 g=L(uLay.x,uv);vec4 g2=L(uLay.x,uv*.21+.37);g=mix(g,g2,.45+.3*far);
vec3 tintL=pow(vTint.rgb,vec3(2.2));vec3 grass=g.rgb*tintL*(1.25+.45*macro);
float forest=0.0;
vec4 soil=L(uLay.y,uv*.8);vec4 rock=tri(uLay.w,vWPos,N,.11);vec4 rock2=tri(uLay.w,vWPos,N,.023);rock=mix(rock,rock2,.5);
if(uLay.y==uLay.x)soil.rgb*=tintL*1.1;/* off Earth the disturbed-ground slot reads the same texture, darker, under the body tint */
if(uLay.w>8.5)rock.rgb*=mix(vec3(1.0),tintL*2.0,.5);
vec4 sand=L(uLay.z,uv*.7);if(uLay.z>8.5)sand.rgb*=mix(vec3(1.0),tintL*1.6,.6);vec4 snow=L(uLay2.x,uv*.5);
float wDirt=vSpl.r,wSand=vSpl.g,wRock=vSpl.b,wSnow=vSpl.a;
float wGrass=max(0.0,1.0-wDirt-wSand-wRock-wSnow)+.02;
// height-based blending
float hG=hb(wGrass,g.a),hD=hb(wDirt,soil.a),hS=hb(wSand,sand.a),hR=hb(wRock,rock.a)*1.1,hN=hb(wSnow,snow.a)*1.2;
float mx=max(max(max(hG,hD),max(hS,hR)),hN)-.18;
vec4 bw=max(vec4(hG,hD,hS,hR)-mx,0.0);float bn=max(hN-mx,0.0);float bs=bw.x+bw.y+bw.z+bw.w+bn+1e-4;
vec3 col=(grass*bw.x+soil.rgb*bw.y+sand.rgb*bw.z+rock.rgb*vec3(1.0,.97,.92)*bw.w+snow.rgb*bn)/bs;
float rough=(.95*bw.x+.92*bw.y+.9*bw.z+.82*bw.w+.55*bn)/bs;
float hgt=(g.a*bw.x+soil.a*bw.y+sand.a*bw.z+rock.a*bw.w+snow.a*bn)/bs;
// fields: farm weight in ext.b; crop, headland distance and row direction from the layout
float farmW=smoothstep(.42,.5,vExt.b)*(1.0-smoothstep(.0,.15,vExt.r));
if(farmW>.01){
 vec4 fd=fieldAt(vWPos.xz);float a=fd.z;float p=-vWPos.x*sin(a)+vWPos.z*cos(a);vec3 fc=col;float fr=rough,fh=hgt;
 if(fd.x<.5){// corn: green canopy with soil between rows
  float s=fract(p/.76);float fw=fwidth(p/.76);float row=1.0-smoothstep(.22-fw,.22+fw,abs(s-.5));
  vec3 canopy=vec3(.06,.1,.025)*(.8+.4*vnoise(vWPos.xz*.7))*(1.0+.2*macro);vec3 soilc=soil.rgb*.45;
  float cov=mix(row,.78,smoothstep(.2,.6,fw*4.0));fc=mix(soilc,canopy,cov);fr=.85;fh=.3+.5*cov;}
 else if(fd.x<1.5){// wheat
  float s=fract(p/.2);vec3 w=vec3(.42,.3,.09)*(.85+.3*L(8.0,uv*1.3).r)*(1.0+.15*macro);fc=mix(w*.8,w,smoothstep(.2,.5,s)*(1.0-far*.8)+far*.6);fr=.9;fh=L(8.0,uv).a;}
 else if(fd.x<2.5){fc=grass*mix(vec3(1.05,1.1,.95),vec3(.95),macro);}// pasture
 else{float s=fract(p/.6);fc=soil.rgb*(.9+.25*smoothstep(.3,.7,s)*(1.0-far));fr=.97;}// fallow furrows
 // headlands: a grass margin round every field, a little rougher where the blocks meet
 float hd=1.0-smoothstep(1.2,2.4,fd.y);fc=mix(fc,grass*vec3(.92,.98,.85),hd);fr=mix(fr,.95,hd);
 col=mix(col,fc,farmW);rough=mix(rough,fr,farmW);hgt=mix(hgt,fh,farmW);
}
// graded verges: gravel shoulders either side of the road meshes
if(vExt.r>.01){vec4 gr=L(uLay2.y,uv*1.2);vec3 vc=gr.rgb*(uLay2.y>8.5?tintL*1.0:vec3(.92,.9,.85));col=mix(col,vc,vExt.r);rough=mix(rough,.95,vExt.r);hgt=mix(hgt,gr.a,vExt.r);}
// forest floor litter under trees
// wetness: darker, glossier
float wet=clamp(vExt.g+uWetness*.6,0.0,1.0);col*=mix(1.0,.55,wet);rough=mix(rough,.28,wet*.8);
// cliff tint
col=mix(col,col*vec3(1.08,.98,.88),vTint.a*.5);
// scorch from the fire model
if(uBurnOn>.5){vec2 bu=(vWPos.xz-uBurnRect.xy)/uBurnRect.zw;if(bu.x>0.0&&bu.y>0.0&&bu.x<1.0&&bu.y<1.0){vec4 b=texture2D(uBurn,bu);float charred=b.g;col=mix(col,vec3(.03,.028,.026)*(.7+.6*g.r),charred*.95);col=mix(col,col*.35,smoothstep(.1,.6,b.r));col+=vec3(1.1,.3,.05)*smoothstep(.55,1.0,b.r)*.3*(.6+.8*g.r);rough=mix(rough,1.0,charred);}}
// tyre tracks and crushed crop
if(uTrackOn>.5){vec2 tu=(vWPos.xz-uTrackRect.xy)/uTrackRect.zw;if(tu.x>0.0&&tu.y>0.0&&tu.x<1.0&&tu.y<1.0){float tr=texture2D(uTrack,tu).r;col=mix(col,col*.62,tr*(1.0-vExt.r));rough=mix(rough,.9,tr*.5);}}
col*=.94+.12*macro;
diffuseColor.rgb=col;vHeightDetail=hgt;vRoughT=rough;
`)
  .replace('void main() {','float vHeightDetail;float vRoughT;\nvoid main() {')
  .replace('#include <roughnessmap_fragment>','float roughnessFactor = vRoughT;')
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
{ // detail normal from the blended height (screen-space derivatives), faded with distance
 float dh=vHeightDetail;vec3 dpx=dFdx(vWPos),dpy=dFdy(vWPos);float hx=dFdx(dh),hy=dFdy(dh);
 vec3 r1=cross(dpy,N),r2=cross(N,dpx);float det=dot(dpx,r1);vec3 grad=sign(det)*(hx*r1+hy*r2);
 vec3 nW=abs(det)*N-grad*.9*(1.0-far);float nl=length(nW);nW=nl>1e-6?nW/nl:N;normal=normalize((viewMatrix*vec4(nW,0.0)).xyz);
}`);
 };
 m.customProgramCacheKey=()=>'spider-terrain-4';
 return m;
}
// ------------------------------------------------------------ water material
export function waterMaterial(normals){
 const m=new T.ShaderMaterial({
  transparent:true,depthWrite:false,fog:true,side:T.DoubleSide,/* seen from below too: the pod drives submerged */
  uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{tN:{value:normals},uTime:shared.uTime,uSunDir:shared.uSunDir,uSunColor:shared.uSunColor,uSkyTop:shared.uSkyTop,uSkyHorizon:shared.uSkyHorizon,uFlood:shared.uFloodTint,uLiquid:shared.uLiquid}]),
  vertexShader:`#include <common>
attribute vec2 flow;attribute float depth;varying vec3 vW;varying vec2 vFlow;varying float vDepth;
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;vFlow=flow;vDepth=depth;vec4 mvPosition=viewMatrix*w;gl_Position=projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`,
  fragmentShader:`uniform sampler2D tN;uniform float uTime;uniform vec3 uSunDir;uniform vec3 uSunColor;uniform vec3 uSkyTop;uniform vec3 uSkyHorizon;uniform float uFlood;uniform float uLiquid;
varying vec3 vW;varying vec2 vFlow;varying float vDepth;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
vec3 nrm(vec2 uv){return texture2D(tN,uv).xzy*2.0-1.0;}
void main(){
 #include <logdepthbuf_fragment>
 float sp=length(vFlow);vec2 fl=vFlow;
 float ph0=fract(uTime*.35),ph1=fract(uTime*.35+.5);float w0=1.0-abs(1.0-2.0*ph0);
 vec2 uv=vW.xz*.08;
 vec3 n0=nrm(uv-fl*ph0*.35)+nrm(uv*2.3+fl*ph0*.5+.3)*.6;vec3 n1=nrm(uv-fl*ph1*.35+.5)+nrm(uv*2.3+fl*ph1*.5+.8)*.6;
 vec3 n=normalize(mix(n1,n0,w0)*vec3(1.0,1.0,1.0)+vec3(0.0,2.2-min(sp,2.5)*.5+uLiquid*9.0,0.0));/* methane: centimetre waves, a mirror */
 n+=vec3(nrm(vW.xz*.013+uTime*.004).x,0.0,nrm(vW.zx*.011-uTime*.003).z)*.15;n=normalize(n);
 vec3 V=normalize(cameraPosition-vW);float fres=.02+.98*pow(1.0-max(dot(n,V),0.0),5.0);
 vec3 R=reflect(-V,n);vec3 sky=mix(uSkyHorizon,uSkyTop,smoothstep(0.0,.6,R.y));
 vec3 H=normalize(uSunDir+V);float spec=pow(max(dot(n,H),0.0),420.0)*6.0+pow(max(dot(n,H),0.0),40.0)*.12;
 float d=max(vDepth,0.0);vec3 deep=mix(vec3(.05,.13,.12),vec3(.18,.16,.09),uFlood);vec3 shallow=mix(vec3(.2,.32,.26),vec3(.38,.31,.2),uFlood);
 deep=mix(deep,vec3(.012,.009,.005),uLiquid);shallow=mix(shallow,vec3(.09,.06,.03),uLiquid);
 vec3 body=mix(shallow,deep,1.0-exp(-d*.7));
 float foam=(smoothstep(.35,.0,d)*(.55+.45*texture2D(tN,vW.xz*.4+fl*uTime*.2).a)+smoothstep(1.2,2.6,sp)*.35*texture2D(tN,vW.xz*.25-fl*uTime*.3).a)*(1.0-uLiquid);
 vec3 col=mix(body,sky,fres)+uSunColor*spec;col=mix(col,vec3(.9,.92,.9),clamp(foam,0.0,.8));
 float alpha=clamp(mix(.35,.97,1.0-exp(-d*1.4))+fres*.3+foam,0.0,1.0)*smoothstep(0.0,.06,d+.02);
 gl_FragColor=vec4(col,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`});
 return m;
}
// ------------------------------------------------------------ road surface (ribbon meshes)
// uv.x across the carriageway 0..1, uv.y along it in metres; kind 0 main (asphalt, lines), 1 minor (gravel), 2 track (dirt, ruts)
// `body` (bodies.mjs) swaps a track's dirt for the body's packed ground, tinted, with wheel ruts and no grass strip
export function roadMaterial(arr,kind,body=null){
 const m=new T.MeshStandardMaterial({roughness:.85,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3-kind});
 const off=body&&body.id!=='earth',tint=off?body.tint:[1,1,1];
 m.onBeforeCompile=sh=>{
  Object.assign(sh.uniforms,shared,{tArr:{value:arr}});
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;varying vec2 vRUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.0)).xyz;vRUv=uv;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
precision highp sampler2DArray;uniform sampler2DArray tArr;uniform sampler2D uTrack;uniform vec4 uTrackRect;uniform float uTrackOn;uniform float uWetness;
varying vec3 vWPos;varying vec2 vRUv;vec4 L(float l,vec2 uv){return texture(tArr,vec3(uv,l));}`)
  .replace('#include <map_fragment>',`
vec2 uv=vWPos.xz*.22;float lat=vRUv.x*2.0-1.0;float dist=length(vWPos-cameraPosition);float far=smoothstep(80.0,500.0,dist);vec3 col;float rough;
${kind===0?`vec4 as=L(5.0,uv*1.5);col=as.rgb*(1.0+.12*L(5.0,uv*.11).r);rough=.78;
 float fw=fwidth(lat);float cl=(1.0-smoothstep(.025-fw,.025+fw,abs(lat)))*step(fract(vRUv.y/12.0),.42);
 float edge=(1.0-smoothstep(.035-fw,.035+fw,abs(abs(lat)-.9)));
 col=mix(col,vec3(.66,.5,.12),cl*.9*(1.0-far*.7));col=mix(col,vec3(.72),edge*.85*(1.0-far*.7));
 col*=mix(.92,1.0,smoothstep(.3,.6,abs(lat)));`:kind===1?`vec4 gr=L(6.0,uv*1.2);col=gr.rgb*vec3(.95,.93,.88);rough=.95;
 float rut=smoothstep(.16,.0,abs(abs(lat)-.45));col*=1.0-.12*rut;`:off?`vec4 d=L(${body.layers.dirt.toFixed(1)},uv*1.1);float rut=smoothstep(.2,.0,abs(abs(lat)-.42));col=d.rgb*pow(vec3(${tint.map(v=>v.toFixed(3)).join(',')}),vec3(2.2))*1.3*(1.0-.25*rut)*.8;rough=.96;`:`vec4 d=L(1.0,uv*1.1);float rut=smoothstep(.14,.0,abs(abs(lat)-.42));col=d.rgb*(1.0-.22*rut);rough=.95;
 vec4 g=L(0.0,uv);float mid=smoothstep(.22,.05,abs(lat));col=mix(col,g.rgb*vec3(.35,.45,.18)*1.6,mid*.6);`}
float wet=uWetness*.6;col*=mix(1.0,.6,wet);rough=mix(rough,.3,wet*.8);
if(uTrackOn>.5){vec2 tu=(vWPos.xz-uTrackRect.xy)/uTrackRect.zw;if(tu.x>0.0&&tu.y>0.0&&tu.x<1.0&&tu.y<1.0){float tr=texture2D(uTrack,tu).r;col=mix(col,col*.8,tr*.5);}}
diffuseColor.rgb=col;float vRoughT=rough;`)
  .replace('#include <roughnessmap_fragment>','float roughnessFactor = vRoughT;');
 };
 m.customProgramCacheKey=()=>'road'+kind+(off?body.id:'');
 return m;
}
