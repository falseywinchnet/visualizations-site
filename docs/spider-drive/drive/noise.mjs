// Seeded, allocation-free noise used by world generation, terrain queries,
// vegetation placement and procedural textures. Deterministic on every device.
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};
export const smoothstep=(a,b,v)=>smooth((v-a)/(b-a));

// Integer hash to [0,1). Stable across engines (32-bit integer math only).
export function hash2(x,z,seed=0){
 let h=Math.imul(x|0,0x27d4eb2d)^Math.imul(z|0,0x165667b1)^Math.imul(seed|0,0x9e3779b1);
 h=Math.imul(h^(h>>>15),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);
 return ((h^(h>>>16))>>>0)/4294967296;
}
export function hash1(n,seed=0){return hash2(n,n*7+13,seed);}

// Small deterministic PRNG (mulberry32) for sequential choices.
export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}

const F2=.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6;
const GRAD=new Float32Array([1,1,-1,1,1,-1,-1,-1,1,0,-1,0,0,1,0,-1,.7071,.7071,-.7071,.7071,.7071,-.7071,-.7071,-.7071]);

export class Noise{
 constructor(seed=1){
  const r=rng(seed*2654435761+17),p=new Uint8Array(256);for(let i=0;i<256;i++)p[i]=i;
  for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1)),t=p[i];p[i]=p[j];p[j]=t;}
  this.perm=new Uint8Array(512);this.pg=new Uint8Array(512);
  for(let i=0;i<512;i++){this.perm[i]=p[i&255];this.pg[i]=(p[i&255]%12)*2;}
 }
 // 2D simplex noise in approximately [-1,1].
 simplex(x,y){
  const perm=this.perm,pg=this.pg,s=(x+y)*F2,i=Math.floor(x+s),j=Math.floor(y+s),t=(i+j)*G2;
  const x0=x-(i-t),y0=y-(j-t),i1=x0>y0?1:0,j1=1-i1;
  const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2,ii=i&255,jj=j&255;
  let n=0,tt=.5-x0*x0-y0*y0;
  if(tt>0){const g=pg[ii+perm[jj]];tt*=tt;n+=tt*tt*(GRAD[g]*x0+GRAD[g+1]*y0);}
  tt=.5-x1*x1-y1*y1;if(tt>0){const g=pg[ii+i1+perm[jj+j1]];tt*=tt;n+=tt*tt*(GRAD[g]*x1+GRAD[g+1]*y1);}
  tt=.5-x2*x2-y2*y2;if(tt>0){const g=pg[ii+1+perm[jj+1]];tt*=tt;n+=tt*tt*(GRAD[g]*x2+GRAD[g+1]*y2);}
  return 70*n;
 }
 fbm(x,y,octaves=4,lac=2,gain=.5){let a=1,f=1,s=0,n=0;for(let o=0;o<octaves;o++){s+=a*this.simplex(x*f+o*19.1,y*f-o*7.3);n+=a;a*=gain;f*=lac;}return s/n;}
 ridged(x,y,octaves=4,lac=2,gain=.5){let a=1,f=1,s=0,n=0,w=1;for(let o=0;o<octaves;o++){let v=1-Math.abs(this.simplex(x*f+o*31.7,y*f+o*11.9));v*=v;s+=v*a*w;n+=a;w=clamp(v*1.6,0,1);a*=gain;f*=lac;}return s/n;}
}

// Tileable periodic value noise for procedural textures (period in cells).
export function periodicNoise(x,y,period,seed){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const w=i=>((i%period)+period)%period;
 const a=hash2(w(ix),w(iy),seed),b=hash2(w(ix+1),w(iy),seed),c=hash2(w(ix),w(iy+1),seed),d=hash2(w(ix+1),w(iy+1),seed);
 return mix(mix(a,b,u),mix(c,d,u),v);
}
export function periodicFbm(x,y,period,seed,octaves=5){let s=0,a=.5,n=0,p=period,f=1;for(let o=0;o<octaves;o++){s+=a*periodicNoise(x*f,y*f,p*f,seed+o*101);n+=a;a*=.5;f*=2;}return s/n;}
