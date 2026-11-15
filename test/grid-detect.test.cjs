// Run from the AboveVTT-MCP folder: node test/grid-detect.test.cjs
// Synthetic maps: printed dark/light grids of different sizes on a textured background, and one with no grid.
// (Real maps tested by hand on 14 Nov 2026: The Tavern 72 px, swampmap 50 px, Priory and Crypt none.)
require("../extension/grid_detect.js");
function make(W,H,sq,ox,oy,lw,dark,noise,seed=1){let r=seed;const rnd=()=>((r=(r*16807)%2147483647)/2147483647);
const d=new Uint8ClampedArray(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=120+ (rnd()-0.5)*noise;
 // texture blobs
 v+=30*Math.sin(x/37)*Math.cos(y/53);
 const dx=Math.abs(((x-ox)%sq+sq)%sq), ddx=Math.min(dx,sq-dx), dy=Math.abs(((y-oy)%sq+sq)%sq), ddy=Math.min(dy,sq-dy);
 if(sq && (ddx<lw/2||ddy<lw/2)) v+= dark?-35:35;
 const i=(y*W+x)*4;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
return {width:W,height:H,data:d};}
const show=(n,r)=>console.log(n.padEnd(14),r.verdict,r.confidence,r.squarePx,"x:",r.x.spacing,r.x.offset,r.x.ratio,r.x.lines,r.x.lineWidth,"y:",r.y.spacing,r.y.offset,r.y.ratio);
show("72 dark 4px", AVTT_detectGrid(make(1498,1236,72,32,55,4,true,60)));
show("50 light 2px", AVTT_detectGrid(make(1000,1000,50,49.5,49.5,2,false,60)));
show("no grid", AVTT_detectGrid(make(1536,1024,0,0,0,0,true,60)));
show("140 dark", AVTT_detectGrid(make(2800,2100,140,10,70,3,true,80)));
show("big 4000x3000 100", AVTT_detectGrid(make(2000,1500,100,25,60,3,true,70)));
