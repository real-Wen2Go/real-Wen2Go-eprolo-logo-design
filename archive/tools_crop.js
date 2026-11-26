const {execSync}=require('child_process');
const LW=1011,LH=250;
const lb=execSync('ffmpeg -v error -i brand/lockup-plain.png -f rawvideo -pix_fmt rgba -',{maxBuffer:1e9});
let y0=LH,y1=0,x0=LW,x1=0;
for(let y=0;y<LH;y++)for(let x=289;x<LW;x++){ if(lb[(y*LW+x)*4+3]>40){ if(y<y0)y0=y; if(y>y1)y1=y; if(x<x0)x0=x; if(x>x1)x1=x; } }
console.log('wordmark bbox', x0,y0,x1,y1,'w',x1-x0+1,'h',y1-y0+1);
const pad=4;
const cw=x1-x0+1+pad*2, ch=y1-y0+1+pad*2;
execSync(`ffmpeg -v error -y -i brand/lockup-plain.png -vf "crop=${cw}:${ch}:${x0-pad}:${y0-pad}" brand/wordmark.png`);
console.log('wordmark.png',cw,ch);
