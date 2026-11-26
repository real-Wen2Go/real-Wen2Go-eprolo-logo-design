const {execSync}=require('child_process');
const fs=require('fs');
function readRGBA(f,W,H){return execSync(`ffmpeg -v error -i ${f} -f rawvideo -pix_fmt rgba -`,{maxBuffer:1e9});}
function writeRGBA(buf,W,H,out){
  execSync(`ffmpeg -v error -y -f rawvideo -pix_fmt rgba -s ${W}x${H} -i - ${out}`,{input:buf,maxBuffer:1e9});
}
// ---- 1) 从 mark.png 抠出字母 e ----
const W=910,H=910,cx=467,cy=455;
let b=Buffer.from(readRGBA('brand/mark.png',W,H));
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const r=Math.hypot(x-cx,y-cy), i=(y*W+x)*4;
  if(r>318){ b[i+3]=0; }
}
writeRGBA(b,W,H,'brand/e-only.png');
console.log('e-only.png ok');

// ---- 2) 从 lockup 切出纯字标 ----
const LW=1011,LH=250;
let lb=Buffer.from(readRGBA('brand/lockup-plain.png',LW,LH));
// alpha 列投影，找空隙
let col=new Array(LW).fill(0);
for(let x=0;x<LW;x++){let s=0;for(let y=0;y<LH;y++){if(lb[(y*LW+x)*4+3]>40)s++;}col[x]=s;}
// 输出连续非空区间
let runs=[],cur=null;
for(let x=0;x<LW;x++){
  if(col[x]>0){ if(!cur)cur=[x,x]; else cur[1]=x; } else { if(cur){runs.push(cur);cur=null;} }
}
if(cur)runs.push(cur);
console.log('alpha runs:',JSON.stringify(runs));
// 行投影
let row=new Array(LH).fill(0);
for(let y=0;y<LH;y++){let s=0;for(let x=0;x<LW;x++){if(lb[(y*LW+x)*4+3]>40)s++;}row[y]=s;}
let ry0=-1,ry1=-1; for(let y=0;y<LH;y++){if(row[y]>0){if(ry0<0)ry0=y;ry1=y;}}
console.log('rows y:',ry0,'-',ry1);
