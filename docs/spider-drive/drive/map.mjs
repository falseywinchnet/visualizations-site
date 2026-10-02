// Map rendering from the world data: base image (hillshade, biomes, water, roads, towns) for the
// minimap and the full map, plus live overlays (fire, markers, route, detection).
const BIOME_RGB=[[236,240,244],[170,172,150],[150,144,134],[168,158,142],[58,92,64],[78,110,70],[102,128,76],[86,124,92],[112,134,106],[160,172,110],[200,188,118],[164,150,104],[204,164,116],[74,128,168]];
export class WorldMap{
 constructor(world,terrain){
  this.w=world;this.t=terrain;const N=world.N;this.size=N;
  const c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),img=g.createImageData(N,N);
  const H=world.height;
  for(let z=0;z<N;z++)for(let x=0;x<N;x++){const i=z*N+x,h=H[i],a=H[z*N+Math.min(N-1,x+1)]-H[z*N+Math.max(0,x-1)],b=H[Math.min(N-1,z+1)*N+x]-H[Math.max(0,z-1)*N+x];
   const shade=Math.max(.35,Math.min(1.3,.9-(a*.7+b*.7)*.035));let [r,gg,bb]=(world.biomeRGB||BIOME_RGB)[world.biome[i]];
   const e=Math.min(1,h/800);r=r*(1-e*.15)+e*30;gg=gg*(1-e*.15)+e*30;bb=bb*(1-e*.1)+e*30;
   const o=i*4;img.data[o]=Math.min(255,r*shade);img.data[o+1]=Math.min(255,gg*shade);img.data[o+2]=Math.min(255,bb*shade);img.data[o+3]=255;}
  g.putImageData(img,0,0);
  const toPx=(x)=>(x+world.half)/world.cell;
  g.lineCap='round';g.lineJoin='round';
  const off=world.body&&world.body!=='earth',methane=world.body==='titan';
  for(const ch of world.channels){if(ch.cls<1)continue;g.strokeStyle=methane?'#1c1610':ch.cls===3?'#3f86c0':'#5d9bcc';g.lineWidth=Math.max(.7,ch.P[3]/world.cell*1.1);g.beginPath();for(let k=0;k<ch.n;k++){const x=toPx(ch.P[k*8]),y=toPx(ch.P[k*8+1]);k?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
  for(const r of world.roads){g.strokeStyle=r.kind==='main'?'#f1e7c8':r.kind==='minor'?'#d8cfb0':off?'#e8e2d4':'#a4865c';g.lineWidth=r.kind==='main'?1.8:r.kind==='minor'?1.3:.9;if(r.kind==='track')g.setLineDash([2,2]);g.beginPath();for(let k=0;k<r.n;k+=2){const x=toPx(r.xz[k*2]),y=toPx(r.xz[k*2+1]);k?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();g.setLineDash([]);
   g.strokeStyle='#e0d6c0';g.lineWidth=3;for(const b of r.bridges){g.beginPath();g.moveTo(toPx(b.x0),toPx(b.z0));g.lineTo(toPx(b.x1),toPx(b.z1));g.stroke();}}
  // crater rims
  if(world.craters)for(const c of world.craters){if(c.D<150)continue;g.strokeStyle=`rgba(255,255,255,${.12+.3*c.fresh})`;g.lineWidth=.8;g.beginPath();g.arc(toPx(c.x),toPx(c.z),c.D*.5/world.cell,0,Math.PI*2);g.stroke();}
  g.fillStyle=off?'#eef0f2':'#6d4c3d';for(const b of world.buildings){g.fillRect(toPx(b.x)-1,toPx(b.z)-1,2.2,2.2);}
  this.base=c;this.toPx=toPx;
 }
 // minimap: north-up window of `range` metres around (x,z)
 drawMini(ctx,W,H,x,z,heading,range,over){
  ctx.save();ctx.clearRect(0,0,W,H);ctx.fillStyle='#24343a';ctx.fillRect(0,0,W,H);
  const s=W/(range/this.w.cell);const px=this.toPx(x),pz=this.toPx(z);
  ctx.imageSmoothingEnabled=true;ctx.translate(W/2,H/2);ctx.scale(s,s);ctx.translate(-px,-pz);ctx.drawImage(this.base,0,0);
  if(over)over(ctx,this.toPx,px,pz,s);
  ctx.restore();
  // vehicle arrow
  ctx.save();ctx.translate(W/2,H/2);ctx.rotate(heading);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,3);ctx.lineTo(-6,7);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#15252c';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
 }
 drawFull(ctx,W,H,x,z,heading,over){
  ctx.clearRect(0,0,W,H);const s=Math.min(W,H)/this.size;const ox=(W-this.size*s)/2,oy=(H-this.size*s)/2;
  ctx.save();ctx.translate(ox,oy);ctx.scale(s,s);ctx.drawImage(this.base,0,0);
  ctx.font=`${11/s}px Georgia`;ctx.textAlign='center';
  for(const t of this.w.towns){ctx.fillStyle='rgba(20,30,34,.85)';ctx.fillText(t.name,this.toPx(t.x),this.toPx(t.z)-8/s);}
  if(this.w.craters){ctx.fillStyle='rgba(255,255,255,.8)';for(const c of this.w.craters)if(c.name)ctx.fillText(c.name,this.toPx(c.x),this.toPx(c.z));}
  ctx.font=`italic ${10/s}px Georgia`;ctx.fillStyle='rgba(30,70,110,.9)';
  for(const c of this.w.channels){if(c.cls<2||!c.name||c.length<(c.cls===3?1200:800))continue;const k=Math.floor(c.n*.45);ctx.fillText(c.name,this.toPx(c.P[k*8]),this.toPx(c.P[k*8+1])-6/s);}
  for(const l of this.w.lakes){if(!l.pond)ctx.fillText(l.name,this.toPx(l.x),this.toPx(l.z));}
  if(over)over(ctx,this.toPx,s);
  const px=this.toPx(x),pz=this.toPx(z);ctx.translate(px,pz);ctx.rotate(heading);ctx.scale(1/s,1/s);ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(7,8);ctx.lineTo(0,4);ctx.lineTo(-7,8);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();
  ctx.restore();return {ox,oy,s};
 }
}
